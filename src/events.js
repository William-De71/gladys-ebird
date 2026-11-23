// -----------------------------------------------------------------------------
// Scene triggers, and the outputs of the scene action.
//
//   - `notable_bird`   a notable report (a rare species, or one out of
//                      season) appeared within the radius: once per checklist
//                      and species;
//   - `watched_bird`   a watched species is reported within the radius again
//                      (it was not at the last reading).
//
// The first reading of a search (house, radius, days, watched species) is a
// baseline: what eBird already lists fires nothing. What was announced is kept
// in /data (store.js): a restart never fires twice. At most 10 notable events
// per reading: a flood of old reports (a new hotspot, a review) is summed up
// by the widget, not by ten SMS.
// -----------------------------------------------------------------------------

import { checklistUrl, reportKey } from './observations.js';
import { formatKm } from './format.js';
import { formatObsDate } from './time.js';
import { t } from './i18n.js';

const TRIGGERS = { NOTABLE: 'notable_bird', WATCHED: 'watched_bird' };
const MAX_NOTABLE_EVENTS = 10;

/**
 * @description The signature of a search: another one starts a new baseline.
 * @param {object} snapshot - The snapshot.
 * @returns {string} The signature.
 */
function signatureOf(snapshot) {
  return JSON.stringify([
    snapshot.house.selector,
    snapshot.radiusKm,
    snapshot.days,
    snapshot.watched
      .map((entry) => entry.code)
      .filter(Boolean)
      .sort(),
  ]);
}

/**
 * @description What changed since the last reading, the memory updated.
 * @param {object} snapshot - The snapshot.
 * @param {object} store - The store (its `data` is updated, not saved).
 * @param {number} now - Now (ms).
 * @returns {{ notable: object[], watched: object[], baseline: boolean }} The news.
 */
function detect(snapshot, store, now) {
  const data = store.data;
  const signature = signatureOf(snapshot);
  const baseline = data.signature !== signature;
  if (baseline) {
    data.signature = signature;
    data.reports = {};
    data.near = {};
  }
  const notable = [];
  for (const observation of [...snapshot.notable].reverse()) {
    const key = reportKey(observation);
    if (!(key in data.reports)) {
      data.reports[key] = now;
      if (!baseline) {
        notable.push(observation);
      }
    }
  }
  const watched = [];
  for (const entry of snapshot.watched.filter((item) => item.code)) {
    const before = data.near[entry.code] === true;
    data.near[entry.code] = entry.near;
    if (entry.near && !before && !baseline) {
      watched.push(entry);
    }
  }
  return {
    // The most recent first, at most 10.
    notable: notable.reverse().slice(0, MAX_NOTABLE_EVENTS),
    watched,
    baseline,
  };
}

/**
 * @description The variables of an event (and of the scene action) for one
 * report.
 * @param {object} observation - A parsed observation.
 * @param {string} name - The species name, in the language of the texts.
 * @param {string} scientific - The scientific name.
 * @param {string} language - The language of the summary.
 * @returns {object} The flat data.
 */
function reportData(observation, name, scientific, language) {
  return {
    species_name: name,
    scientific_name: scientific || observation.sci,
    species_code: observation.code,
    count: observation.count,
    place: observation.place,
    distance_km: observation.distanceKm,
    observed_on: observation.date,
    observed_time: observation.time ?? '',
    reviewed: observation.reviewed,
    checklist_url: checklistUrl(observation) ?? '',
    summary: t('reportSummary', language, {
      species: name,
      distance: formatKm(observation.distanceKm, language),
      place: observation.place,
      date: formatObsDate(observation.date, observation.time, language),
    }).slice(0, 1000),
  };
}

export { TRIGGERS, MAX_NOTABLE_EVENTS, signatureOf, detect, reportData };
