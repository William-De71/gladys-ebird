// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/ebird.json (the only
// writable place of the container):
//   - `signature` the search the memory below belongs to (house, radius,
//                 days, watched species): another search starts a new
//                 baseline, without events;
//   - `reports`   the notable reports already announced, with the day they
//                 were seen (forgotten after 35 days, beyond the 30 days eBird
//                 can give);
//   - `near`      the watched species seen around the house at the last
//                 reading (an event fires when one appears).
// A restart never fires twice; the readings themselves are not kept.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/ebird.json';
const KEEP_MS = 35 * 24 * 3600_000;
const EMPTY = () => ({ signature: null, reports: {}, near: {} });

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger, now }`.
 * @returns {object} `{ data, load, save, prune }`.
 */
function createStore({ path = DEFAULT_PATH, logger, now = Date.now } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const part = (name) => (raw?.[name] && typeof raw[name] === 'object' ? raw[name] : {});
        store.data = {
          signature: typeof raw?.signature === 'string' ? raw.signature : null,
          reports: { ...part('reports') },
          near: { ...part('near') },
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
      }
    },
    /**
     * @description Forget the reports older than 35 days.
     */
    prune() {
      for (const [key, at] of Object.entries(store.data.reports)) {
        if (!Number.isFinite(at) || now() - at > KEEP_MS) {
          delete store.data.reports[key];
        }
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, KEEP_MS, createStore };
