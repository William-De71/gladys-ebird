// A fake eBird API for the tests, served through the `fetch` option of the
// integration. The answers follow the shapes of the eBird API 2.0 reference
// (documenter.getpostman.com/view/664302/S1ENwy59, read on 2026-11-23) and the
// taxonomy answer captured from the real API without a key on 2026-11-23
// (`/ref/taxonomy/ebird?fmt=json&species=eurrob1&locale=fr`); the observations
// around Lyon are made up. A missing or wrong key answers 403 with an empty
// body, as the real API does. Tests never touch the network.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Thursday 20 November 2026, 18:00 in Paris.
const NOW = Date.parse('2026-11-20T17:00:00Z');
const TZ = 'Europe/Paris';
const KEY = 'abcdef123456';
// Lyon, near the Parc de la Tête d'Or.
const LYON = { latitude: 45.7772, longitude: 4.8551 };
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary folder standing for /data.
 * @returns {string} The path.
 */
const dataDir = () => mkdtempSync(join(tmpdir(), 'ebird-'));

/** The taxonomy, a few species, per language. */
const TAXA = [
  [
    'eurrob1',
    'European Robin',
    'Erithacus rubecula',
    'Rougegorge familier',
    'Rotkehlchen',
    'Petirrojo europeo',
  ],
  ['eurhoo', 'Eurasian Hoopoe', 'Upupa epops', 'Huppe fasciée', 'Wiedehopf', 'Abubilla común'],
  [
    'barswa',
    'Barn Swallow',
    'Hirundo rustica',
    'Hirondelle rustique',
    'Rauchschwalbe',
    'Golondrina común',
  ],
  ['grbher3', 'Great Egret', 'Ardea alba', 'Grande Aigrette', 'Silberreiher', 'Garceta grande'],
  ['commag', 'Eurasian Magpie', 'Pica pica', 'Pie bavarde', 'Elster', 'Urraca común'],
  [
    'wallcr1',
    'Wallcreeper',
    'Tichodroma muraria',
    'Tichodrome échelette',
    'Mauerläufer',
    'Treparriscos',
  ],
  [
    'rebfly',
    'Red-breasted Flycatcher',
    'Ficedula parva',
    'Gobemouche nain',
    'Zwergschnäpper',
    'Papamoscas papirrojo',
  ],
];
const LOCALE_COLUMN = { en: 1, fr: 3, de: 4, es: 5 };

/**
 * @description The taxonomy answer of a locale.
 * @param {string} locale - "fr".
 * @returns {object[]} The taxa.
 */
function taxonomy(locale) {
  const column = LOCALE_COLUMN[locale] ?? 1;
  return TAXA.map((row, index) => ({
    sciName: row[2],
    comName: row[column],
    speciesCode: row[0],
    category: 'species',
    taxonOrder: 1000 + index,
    bandingCodes: [],
    comNameCodes: [],
    sciNameCodes: [],
    order: 'Passeriformes',
    familyComName: 'Family',
    familySciName: 'Familia',
  }));
}

/**
 * @description An observation of the API.
 * @param {string} code - The species code.
 * @param {object} fields - The other fields.
 * @returns {object} The observation.
 */
function obs(code, fields) {
  const row = TAXA.find((entry) => entry[0] === code);
  return {
    speciesCode: code,
    comName: row ? row[1] : code,
    sciName: row ? row[2] : '',
    locId: 'L1',
    locName: 'Parc de la Tête d’Or',
    obsDt: '2026-11-20 08:14',
    howMany: 1,
    lat: 45.7772,
    lng: 4.8551,
    obsValid: true,
    obsReviewed: false,
    locationPrivate: false,
    subId: 'S200000001',
    ...fields,
  };
}

const RECENT = [
  obs('commag', { howMany: 6, obsDt: '2026-11-20 09:30' }),
  obs('eurrob1', { howMany: 2, locName: 'Jardin des Plantes', lat: 45.7705, lng: 4.8306 }),
  obs('grbher3', {
    howMany: 3,
    locName: 'Grand Large',
    lat: 45.7869,
    lng: 4.9894,
    obsDt: '2026-11-18',
  }),
  obs('wallcr1', {
    locName: 'Fourvière',
    lat: 45.7623,
    lng: 4.8226,
    obsDt: '2026-11-19 15:02',
    subId: 'S200000002',
  }),
  {
    speciesCode: 'gull1',
    comName: 'gull sp.',
    sciName: 'Larinae sp.',
    locId: 'L2',
    locName: 'Rhône',
    obsDt: '2026-11-17',
    lat: 45.75,
    lng: 4.84,
    obsValid: true,
    obsReviewed: false,
    locationPrivate: false,
    subId: 'S200000003',
  },
];
const NOTABLE = [
  obs('wallcr1', {
    locName: 'Fourvière',
    lat: 45.7623,
    lng: 4.8226,
    obsDt: '2026-11-19 15:02',
    subId: 'S200000002',
    howMany: 1,
    obsReviewed: true,
  }),
  obs('wallcr1', {
    locName: 'Fourvière',
    lat: 45.7623,
    lng: 4.8226,
    obsDt: '2026-11-19 15:02',
    subId: 'S200000002',
    howMany: 1,
    obsReviewed: true,
  }),
  obs('rebfly', {
    locName: 'Parc de Gerland',
    lat: 45.7289,
    lng: 4.8326,
    obsDt: '2026-11-16 10:40',
    subId: 'S200000004',
    obsValid: false,
  }),
];
const NEAREST = {
  eurhoo: [
    obs('eurhoo', {
      locName: 'Marais de Chaffaut',
      lat: 45.95,
      lng: 5.12,
      obsDt: '2026-11-12',
      subId: 'S200000005',
    }),
  ],
  barswa: [],
  eurrob1: [obs('eurrob1', { locName: 'Jardin des Plantes', lat: 45.7705, lng: 4.8306 })],
};

/**
 * @description The fake API.
 * @returns {Function & { calls: object[], answers: object, offline: boolean }} A `fetch`.
 */
function fakeEbird() {
  const answers = {
    recent: RECENT,
    notable: NOTABLE,
    nearest: { ...NEAREST },
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const target = new URL(url);
    const params = Object.fromEntries(target.searchParams);
    const path = target.pathname.replace(/^\/v2/, '');
    const key = init.headers?.['X-eBirdApiToken'];
    calls.push({ path, params, key });
    if (fetch.offline) {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    }
    const reply = (status, body) =>
      new Response(body === undefined ? '' : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (path === '/ref/taxonomy/ebird') {
      return reply(200, taxonomy(params.locale));
    }
    if (key !== KEY) {
      return reply(403);
    }
    if (fetch.failNext) {
      const status = fetch.failNext;
      fetch.failNext = null;
      return reply(status, status === 429 ? undefined : { errors: [{ status: 'error' }] });
    }
    if (path === '/data/obs/geo/recent') {
      return reply(200, answers.recent);
    }
    if (path === '/data/obs/geo/recent/notable') {
      return reply(200, answers.notable);
    }
    const nearest = /^\/data\/nearest\/geo\/recent\/([a-z0-9]+)$/.exec(path);
    if (nearest) {
      return reply(200, answers.nearest[nearest[1]] ?? []);
    }
    return reply(404, { errors: [{ status: 'not found' }] });
  };
  fetch.calls = calls;
  fetch.answers = answers;
  fetch.offline = false;
  fetch.failNext = null;
  return fetch;
}

export {
  NOW,
  TZ,
  KEY,
  LYON,
  TAXA,
  RECENT,
  NOTABLE,
  NEAREST,
  silent,
  dataDir,
  obs,
  taxonomy,
  fakeEbird,
};
