// -----------------------------------------------------------------------------
// Dates and distances shown to the user.
//
// eBird gives the date of an observation in the local time of the place
// ("2026-11-20 08:14", or "2026-11-20" without a time): the places are near
// the house, so they share the timezone of Gladys (TZ, given by the
// supervisor). Intl only, no dependency.
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const EARTH_RADIUS_KM = 6371;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date of an instant in a timezone.
 * @param {number} instant - The instant (ms).
 * @param {string} [zone] - An IANA name.
 * @returns {string} "YYYY-MM-DD".
 */
function localDate(instant, zone = defaultTimeZone()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/**
 * @description The number of days from one date to another.
 * @param {string} from - "2026-09-09".
 * @param {string} to - "2026-09-10".
 * @returns {number} 1.
 */
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * @description Read the date of an eBird observation.
 * @param {unknown} value - "2026-11-20 08:14" or "2026-11-20".
 * @returns {{ date: string, time: string|null }|null} The parts, null when unreadable.
 */
function readObsDate(value) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(String(value ?? ''));
  return match ? { date: match[1], time: match[2] ?? null } : null;
}

/**
 * @description "20 Nov" or "Thu 20 Nov 08:14", in the language of the user.
 * @param {string} date - "2026-11-20".
 * @param {string|null} time - "08:14", or null.
 * @param {string} language - The language.
 * @returns {string} The date.
 */
function formatObsDate(date, time, language) {
  const instant = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant)) {
    return String(date ?? '');
  }
  const day = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(instant));
  return time ? `${day} ${time}` : day;
}

/**
 * @description The great-circle distance between two positions.
 * @param {number} lat1 - Latitude of the first one.
 * @param {number} lng1 - Longitude of the first one.
 * @param {number} lat2 - Latitude of the second one.
 * @param {number} lng2 - Longitude of the second one.
 * @returns {number} Kilometers, to 0.1 km.
 */
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export {
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  defaultTimeZone,
  localDate,
  daysBetween,
  readObsDate,
  formatObsDate,
  distanceKm,
};
