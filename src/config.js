// -----------------------------------------------------------------------------
// Configuration of the eBird integration.
//
// Fields of the config_schema:
//   - `api_key`   the eBird API key of the user (free, personal, a `secret`:
//                 never sent back to the UI, never logged);
//   - `house`     the house of Gladys whose position is the center
//                 (`source: "houses"`, its selector); empty: the first house
//                 with a position;
//   - `radius_km` how far around the house, 1 to 50 km (the eBird maximum);
//   - `days`      how many days back, 1 to 30 (the eBird maximum);
//   - `watched`   the species to watch, separated by commas or new lines:
//                 common names in any of the four languages, scientific names
//                 or eBird species codes (at most 10);
//   - `interval`  minutes between two readings: 30, 60 or 180;
//   - `language`  language of the texts Gladys does not ask for in a language
//                 (device names, scene texts): `auto` follows the language of
//                 the last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language` language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const MAX_WATCHED = 10;
const INTERVALS = [30, 60, 180];
const DEFAULTS = { radiusKm: 10, days: 7, interval: 60 };

const readString = (raw) =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';

/**
 * @description An integer within bounds, or the default.
 * @param {unknown} raw - The value.
 * @param {number} min - The minimum.
 * @param {number} max - The maximum.
 * @param {number} fallback - The default.
 * @returns {number} The integer.
 */
function readInteger(raw, min, max, fallback) {
  const value = Math.round(Number(readString(raw) || NaN));
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/**
 * @description The species typed in `watched`: trimmed, without duplicates
 * (case and accents aside), at most 10.
 * @param {unknown} raw - "Huppe fasciée, barswa\nErithacus rubecula".
 * @returns {string[]} The entries as typed.
 */
function readWatched(raw) {
  const seen = new Set();
  const entries = [];
  for (const part of readString(raw).split(/[,;\n]+/)) {
    const entry = part.trim().replace(/\s+/g, ' ').slice(0, 80);
    const key = foldText(entry);
    if (entry && !seen.has(key)) {
      seen.add(key);
      entries.push(entry);
    }
  }
  return entries.slice(0, MAX_WATCHED);
}

/**
 * @description A text folded for comparisons: lower case, no accents, no
 * punctuation, single spaces.
 * @param {unknown} value - "Rougegorge  familier".
 * @returns {string} "rougegorge familier".
 */
function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´-]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ apiKey, house, radiusKm, days, watched, interval, language }`.
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const interval = Number(readString(config.interval));
  return {
    apiKey: readString(config.api_key),
    house: readString(config.house) || null,
    radiusKm: readInteger(config.radius_km, 1, 50, DEFAULTS.radiusKm),
    days: readInteger(config.days, 1, 30, DEFAULTS.days),
    watched: readWatched(config.watched),
    interval: INTERVALS.includes(interval) ? interval : DEFAULTS.interval,
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  MAX_WATCHED,
  INTERVALS,
  DEFAULTS,
  foldText,
  readWatched,
  normalizeConfig,
  readLanguage,
};
