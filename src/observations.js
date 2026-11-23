// -----------------------------------------------------------------------------
// The observations of eBird, read into what the integration shows.
//
// An observation of the API:
//   { speciesCode, comName, sciName, locId, locName, obsDt, howMany, lat, lng,
//     obsValid, obsReviewed, locationPrivate, subId }
// `howMany` is absent when the observer only noted the species ("X"); `obsDt`
// is local to the place. A notable observation (rare species, out of season)
// is listed once per checklist; it is `obsReviewed` once a regional reviewer
// looked at it, and `obsValid` once accepted.
//
// "Species" counts the true species only: eBird also lists groups such as
// "gull sp." or "Carrion/Hooded Crow" and hybrids, which are not one more
// species around the house.
// -----------------------------------------------------------------------------

import { distanceKm, readObsDate } from './time.js';

/**
 * @description Whether an observation names one species (not "sp.", a slash
 * pair or a hybrid).
 * @param {object} observation - A parsed observation.
 * @returns {boolean} True for a species.
 */
export function isSpecies(observation) {
  return !/ sp\.|\/| x |\(hybrid\)|Domestic/i.test(observation.sci || observation.name || '');
}

/**
 * @description Read one observation of the API.
 * @param {object} raw - The observation.
 * @param {object} center - `{ latitude, longitude }` of the house.
 * @returns {object|null} The observation, null when unusable.
 */
export function parseObservation(raw, center) {
  const when = readObsDate(raw?.obsDt);
  if (!raw || typeof raw.speciesCode !== 'string' || !when) {
    return null;
  }
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  const count = Number(raw.howMany);
  return {
    code: raw.speciesCode,
    name: String(raw.comName ?? raw.speciesCode),
    sci: String(raw.sciName ?? ''),
    count: Number.isInteger(count) && count > 0 ? count : null,
    locId: String(raw.locId ?? ''),
    place: String(raw.locName ?? '').slice(0, 120),
    date: when.date,
    time: when.time,
    subId: typeof raw.subId === 'string' ? raw.subId : null,
    reviewed: raw.obsReviewed === true,
    valid: raw.obsValid === true,
    distanceKm:
      Number.isFinite(lat) && Number.isFinite(lng)
        ? distanceKm(center.latitude, center.longitude, lat, lng)
        : null,
  };
}

/**
 * @description Most recent first, then the nearest.
 * @param {object} a - An observation.
 * @param {object} b - Another one.
 * @returns {number} The order.
 */
export function byRecency(a, b) {
  const when = `${b.date} ${b.time ?? '00:00'}`.localeCompare(`${a.date} ${a.time ?? '00:00'}`);
  return when || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
}

/**
 * @description The key of a notable report: one per checklist and species.
 * @param {object} observation - A parsed observation.
 * @returns {string} "S123456789:eurhoo".
 */
export const reportKey = (observation) =>
  `${observation.subId ?? `${observation.locId}@${observation.date}`}:${observation.code}`;

/**
 * @description The URL of the checklist of a report on ebird.org.
 * @param {object} observation - A parsed observation.
 * @returns {string|null} The URL.
 */
export const checklistUrl = (observation) =>
  observation.subId && /^S\d+$/.test(observation.subId)
    ? `https://ebird.org/checklist/${observation.subId}`
    : null;

/**
 * @description The snapshot of one reading.
 * @param {object} options - Options.
 * @param {object} options.house - `{ selector, name, latitude, longitude }`.
 * @param {object[]} options.recent - GET /data/obs/geo/recent.
 * @param {object[]} options.notable - GET /data/obs/geo/recent/notable.
 * @param {object[]} options.watched - `[{ typed, code, nearest: object[]|null }]`.
 * @param {number} options.radiusKm - The radius of the configuration.
 * @param {number} options.days - The days back of the configuration.
 * @param {number} options.fetchedAt - When it was read.
 * @returns {object} The snapshot.
 */
export function buildSnapshot({ house, recent, notable, watched, radiusKm, days, fetchedAt }) {
  const parse = (list) =>
    (Array.isArray(list) ? list : []).map((raw) => parseObservation(raw, house)).filter(Boolean);
  const species = parse(recent).sort(byRecency);
  const reports = new Map();
  for (const observation of parse(notable)) {
    const key = reportKey(observation);
    if (!reports.has(key)) {
      reports.set(key, observation);
    }
  }
  const notableReports = [...reports.values()].sort(byRecency);
  return {
    house,
    radiusKm,
    days,
    fetchedAt,
    species,
    speciesCount: species.filter(isSpecies).length,
    notable: notableReports,
    notableSpecies: new Set(notableReports.map((observation) => observation.code)).size,
    watched: watched.map(({ typed, code, nearest }) => {
      const found = parse(nearest)
        .filter((observation) => observation.distanceKm !== null)
        .sort((a, b) => a.distanceKm - b.distanceKm || byRecency(a, b));
      const closest = found[0] ?? null;
      return {
        typed,
        code,
        nearest: closest,
        near: closest !== null && closest.distanceKm <= radiusKm,
      };
    }),
  };
}

/**
 * @description The notable reports of a species, nearest first (for a
 * summary that names how many reports there were).
 * @param {object} snapshot - The snapshot.
 * @returns {Array<{ observation: object, reports: number }>} One per species.
 */
export function notableBySpecies(snapshot) {
  const bySpecies = new Map();
  for (const observation of snapshot.notable) {
    const entry = bySpecies.get(observation.code);
    if (!entry) {
      bySpecies.set(observation.code, { observation, reports: 1 });
    } else {
      entry.reports += 1;
    }
  }
  return [...bySpecies.values()];
}
