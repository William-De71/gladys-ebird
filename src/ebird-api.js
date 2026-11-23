// -----------------------------------------------------------------------------
// Client of the eBird API 2.0 (https://api.ebird.org/v2), documented on
// https://documenter.getpostman.com/view/664302/S1ENwy59.
//
// The personal key of the user travels in the `X-eBirdApiToken` header, never
// in the URL (so never in a log). Endpoints used:
//   - GET /data/obs/geo/recent                    the species reported nearby
//   - GET /data/obs/geo/recent/notable            the notable (rare) reports
//   - GET /data/nearest/geo/recent/{speciesCode}  where a species was seen
//   - GET /ref/taxonomy/ebird                     the names of the species
// The positions are sent with 2 decimals, as the reference asks (about 1 km).
//
// A missing or wrong key answers 403 with an empty body (checked on
// 2026-11-23). A network error or a 5xx is tried once more; the rest fails
// at once with an EbirdError that names its kind.
// -----------------------------------------------------------------------------

export const DEFAULT_BASE_URL = 'https://api.ebird.org/v2';
const TIMEOUT_MS = 20_000;
const TAXONOMY_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2000;

export const ERROR_KINDS = {
  NO_KEY: 'no_key',
  BAD_KEY: 'bad_key',
  RATE_LIMIT: 'rate_limit',
  REQUEST: 'request',
  SERVER: 'server',
  UNREACHABLE: 'unreachable',
};

export class EbirdError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - What went wrong (never the key).
   * @param {number|null} [status] - The HTTP status.
   */
  constructor(kind, message, status = null) {
    super(message);
    this.name = 'EbirdError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The kind of an HTTP failure.
 * @param {number} status - The status.
 * @returns {string} One of ERROR_KINDS.
 */
export function kindOf(status) {
  if (status === 401 || status === 403) {
    return ERROR_KINDS.BAD_KEY;
  }
  if (status === 429) {
    return ERROR_KINDS.RATE_LIMIT;
  }
  if (status >= 500) {
    return ERROR_KINDS.SERVER;
  }
  return ERROR_KINDS.REQUEST;
}

/**
 * @description A coordinate with 2 decimals, as the reference asks.
 * @param {number} value - Degrees.
 * @returns {string} "45.76".
 */
const coordinate = (value) => Number(value).toFixed(2);

/**
 * @description Build a client.
 * @param {object} options - Options.
 * @param {() => string} options.getKey - The current API key.
 * @param {string} [options.userAgent] - The User-Agent.
 * @param {string} [options.baseUrl] - The API root (tests point it to a fake).
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Wait before the retry.
 * @returns {object} `{ recentNearby, notableNearby, nearest, taxonomy }`.
 */
export function createEbirdClient({
  getKey,
  userAgent = 'gladys-ebird',
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const root = baseUrl.replace(/\/+$/, '');

  async function once(path, query, key, timeoutMs) {
    const url = new URL(`${root}${path}`);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(name, String(value));
      }
    }
    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
          ...(key ? { 'X-eBirdApiToken': key } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new EbirdError(
        ERROR_KINDS.UNREACHABLE,
        `Cannot reach the eBird API (${err?.cause?.code ?? err?.name ?? 'network error'})`,
      );
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      const detail = text.replace(/\s+/g, ' ').trim().slice(0, 200);
      throw new EbirdError(
        kindOf(response.status),
        `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
        response.status,
      );
    }
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new EbirdError(ERROR_KINDS.SERVER, 'The eBird API answered something that is not JSON');
    }
  }

  /**
   * @description One GET, tried once more after a network error or a 5xx.
   * @param {string} path - The path under /v2.
   * @param {object} query - The query parameters.
   * @param {object} [options] - `{ keyless, timeoutMs }`.
   * @returns {Promise<unknown>} The parsed body.
   */
  async function get(path, query, { keyless = false, timeoutMs = TIMEOUT_MS } = {}) {
    const key = getKey();
    if (!key && !keyless) {
      throw new EbirdError(ERROR_KINDS.NO_KEY, 'No eBird API key in the configuration');
    }
    try {
      return await once(path, query, key, timeoutMs);
    } catch (err) {
      if (err.kind !== ERROR_KINDS.SERVER && err.kind !== ERROR_KINDS.UNREACHABLE) {
        throw err;
      }
      await sleep(RETRY_DELAY_MS);
      return once(path, query, key, timeoutMs);
    }
  }

  const list = (value) => (Array.isArray(value) ? value : []);
  const place = ({ latitude, longitude }) => ({
    lat: coordinate(latitude),
    lng: coordinate(longitude),
  });

  return {
    /**
     * @description The most recent report of each species within a radius.
     * @param {object} position - `{ latitude, longitude }`.
     * @param {object} options - `{ radiusKm, days }`.
     * @returns {Promise<object[]>} The observations.
     */
    async recentNearby(position, { radiusKm, days }) {
      return list(
        await get('/data/obs/geo/recent', { ...place(position), dist: radiusKm, back: days }),
      );
    },
    /**
     * @description The notable reports within a radius (rare species, out of
     * season), each checklist apart.
     * @param {object} position - `{ latitude, longitude }`.
     * @param {object} options - `{ radiusKm, days }`.
     * @returns {Promise<object[]>} The observations.
     */
    async notableNearby(position, { radiusKm, days }) {
      return list(
        await get('/data/obs/geo/recent/notable', {
          ...place(position),
          dist: radiusKm,
          back: days,
          detail: 'simple',
        }),
      );
    },
    /**
     * @description The nearest recent reports of a species (50 km at most).
     * @param {string} speciesCode - "eurhoo".
     * @param {object} position - `{ latitude, longitude }`.
     * @param {object} options - `{ days }`.
     * @returns {Promise<object[]>} The observations, the nearest first.
     */
    async nearest(speciesCode, position, { days }) {
      return list(
        await get(`/data/nearest/geo/recent/${encodeURIComponent(speciesCode)}`, {
          ...place(position),
          back: days,
          dist: 50,
          maxResults: 3,
        }),
      );
    },
    /**
     * @description The whole eBird taxonomy, names in a language (a few MB:
     * read once a month). Needs no key.
     * @param {string} locale - "fr".
     * @returns {Promise<object[]>} The taxa.
     */
    async taxonomy(locale) {
      return list(
        await get(
          '/ref/taxonomy/ebird',
          { fmt: 'json', locale },
          { keyless: true, timeoutMs: TAXONOMY_TIMEOUT_MS },
        ),
      );
    },
  };
}
