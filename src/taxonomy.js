// -----------------------------------------------------------------------------
// The names of the species, in the four languages, from the eBird taxonomy
// (GET /ref/taxonomy/ebird, species only, about 11,000 taxa).
//
// What it is used for:
//   - naming a species in the language of a widget or of the configuration:
//     the observations are read once, the names come from here;
//   - finding the species the user typed in `watched` (an eBird code, a
//     scientific name or a common name in any of the four languages).
//
// A taxonomy is read at the first need of a language, kept as a compact list
// in /data/taxonomy-<language>.json and read again after 30 days (eBird
// updates it once a year). A failure keeps what is known: the observations
// carry their English name anyway.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { foldText } from './config.js';

export const MAX_AGE_MS = 30 * 24 * 3600_000;
const RETRY_AFTER_FAILURE_MS = 6 * 3600_000;
const CODE = /^[a-z0-9]{4,12}$/;

/**
 * @description The compact rows kept of a taxonomy answer.
 * @param {object[]} taxa - Entries of GET /ref/taxonomy/ebird.
 * @returns {Array<[string, string, string]>} `[code, common name, scientific name]`.
 */
export function compact(taxa) {
  return (Array.isArray(taxa) ? taxa : [])
    .filter((taxon) => typeof taxon?.speciesCode === 'string' && taxon.comName)
    .map((taxon) => [taxon.speciesCode, String(taxon.comName), String(taxon.sciName ?? '')]);
}

/**
 * @description Build the taxonomy store.
 * @param {object} options - Options.
 * @param {(locale: string) => Promise<object[]>} options.fetchTaxonomy - `client.taxonomy`.
 * @param {string} [options.dir] - Where the lists are kept.
 * @param {() => number} [options.now] - Clock.
 * @param {object} [options.logger] - Logger.
 * @returns {object} `{ ensure, name, scientificName, resolve, known }`.
 */
export function createTaxonomy({ fetchTaxonomy, dir = '/data', now = Date.now, logger }) {
  // language -> { at, byCode: Map(code -> [name, sci]), byName: Map(folded -> code) }
  const books = new Map();
  const failedAt = new Map();
  const pending = new Map();

  const file = (language) => join(dir, `taxonomy-${language}.json`);

  function index(rows, at) {
    const byCode = new Map();
    const byName = new Map();
    for (const [code, name, sci] of rows) {
      byCode.set(code, [name, sci]);
      byName.set(foldText(name), code);
      if (sci) {
        byName.set(foldText(sci), code);
      }
    }
    return { at, byCode, byName };
  }

  async function readFromDisk(language) {
    try {
      const saved = JSON.parse(await readFile(file(language), 'utf8'));
      if (Number.isFinite(saved?.at) && Array.isArray(saved?.rows) && saved.rows.length > 0) {
        return index(saved.rows, saved.at);
      }
    } catch {
      // Absent or broken: read from eBird.
    }
    return null;
  }

  async function download(language) {
    const rows = compact(await fetchTaxonomy(language));
    if (rows.length === 0) {
      throw new Error('empty taxonomy');
    }
    const at = now();
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(`${file(language)}.tmp`, JSON.stringify({ at, rows }));
      await rename(`${file(language)}.tmp`, file(language));
    } catch (err) {
      logger?.warn(`Unable to keep the taxonomy (${language}): ${err.message}`);
    }
    logger?.info(`eBird taxonomy (${language}): ${rows.length} species`);
    return index(rows, at);
  }

  /**
   * @description The taxonomy of a language, from /data or eBird.
   * @param {string} language - "fr".
   * @returns {Promise<void>} When it is as fresh as it can be.
   */
  async function ensure(language) {
    const book = books.get(language);
    if (book && now() - book.at < MAX_AGE_MS) {
      return;
    }
    if (now() - (failedAt.get(language) ?? -Infinity) < RETRY_AFTER_FAILURE_MS) {
      return;
    }
    if (!pending.has(language)) {
      pending.set(
        language,
        (async () => {
          try {
            const saved = book ?? (await readFromDisk(language));
            if (saved && now() - saved.at < MAX_AGE_MS) {
              books.set(language, saved);
              return;
            }
            if (saved) {
              books.set(language, saved);
            }
            books.set(language, await download(language));
          } catch (err) {
            failedAt.set(language, now());
            logger?.warn(`Unable to read the eBird taxonomy (${language}): ${err.message}`);
          } finally {
            pending.delete(language);
          }
        })(),
      );
    }
    await pending.get(language);
  }

  return {
    ensure,

    /**
     * @description The common name of a species in a language.
     * @param {string} code - The species code.
     * @param {string} language - The language.
     * @param {string} [fallback] - The name eBird gave (English).
     * @returns {string} The name.
     */
    name(code, language, fallback = '') {
      return books.get(language)?.byCode.get(code)?.[0] ?? fallback ?? code;
    },

    /**
     * @param {string} code - The species code.
     * @returns {string} Its scientific name, '' when unknown.
     */
    scientificName(code) {
      for (const book of books.values()) {
        const entry = book.byCode.get(code);
        if (entry?.[1]) {
          return entry[1];
        }
      }
      return '';
    },

    /**
     * @description The species code of what the user typed: a code, a
     * scientific name or a common name of a loaded language.
     * @param {string} typed - "Huppe fasciée", "Upupa epops", "eurhoo".
     * @returns {string|null} The code, null when nothing matches.
     */
    resolve(typed) {
      const raw = String(typed ?? '').trim();
      const lower = raw.toLowerCase();
      if (CODE.test(lower)) {
        // Without any taxonomy (eBird unreachable at start), a code is trusted.
        if (books.size === 0) {
          return lower;
        }
        for (const book of books.values()) {
          if (book.byCode.has(lower)) {
            return lower;
          }
        }
      }
      const folded = foldText(raw);
      for (const book of books.values()) {
        const code = book.byName.get(folded);
        if (code) {
          return code;
        }
      }
      return null;
    },

    /** @returns {string[]} The languages loaded. */
    known() {
      return [...books.keys()];
    },
  };
}
