// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "Birds around <house>" (`area`): what eBird observers reported within the
// radius over the last days:
//   - `species`       counter: species reported (true species only);
//   - `notable`       counter: notable reports (rare or out of season);
//   - `last_notable`  text: "Hoopoe · 3.2 km · Parc de la Tête d'Or".
//
// "<species>" (`species`), one per watched species the taxonomy recognized:
//   - `near`      presence: reported within the radius over the last days;
//   - `distance`  km: the nearest recent report, up to 50 km;
//   - `days_ago`  days since that report.
// A value eBird does not know is not published (a species never reported
// keeps no distance), except `near`, which is then false.
//
// External ids: `ext:ebird:area:<house selector>`, `ext:ebird:species:<eBird
// species code>`. `should_poll` stays false: the integration reads on its own
// timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';
import { daysBetween, localDate } from './time.js';
import { formatKm } from './format.js';

const DEVICE_TYPES = { AREA: 'area', SPECIES: 'species' };
const FEATURES = {
  SPECIES: 'species',
  NOTABLE: 'notable',
  LAST_NOTABLE: 'last_notable',
  NEAR: 'near',
  DISTANCE: 'distance',
  DAYS_AGO: 'days_ago',
};
const TEXT_MAX = 250;

/**
 * @description The id of a house in an external id.
 * @param {string} selector - The house selector.
 * @returns {string} "main-house".
 */
const houseKey = (selector) =>
  String(selector)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');

/**
 * @description The external ids of a device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} type - One of DEVICE_TYPES.
 * @param {string} id - The house selector or the species code.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, type, id) =>
  gladys.externalIds(type, type === DEVICE_TYPES.AREA ? houseKey(id) : id);

/**
 * @description The type and id of a device (or feature) external id.
 * @param {unknown} externalId - The id.
 * @returns {{ type: string, id: string }|null} The target.
 * @example
 * targetOf('ext:ebird:species:eurhoo:near'); // -> { type: 'species', id: 'eurhoo' }
 */
function targetOf(externalId) {
  const match = /:(area|species):([a-z0-9_-]+?)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? { type: match[1], id: match[2] } : null;
}

const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});
const counterShape = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  min: 0,
  max: 1000,
};
const textShape = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  keep_history: false,
  min: 0,
  max: 0,
};

/**
 * @description The device of the area around a house.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} house - `{ selector, name }`.
 * @param {string} language - Language of the names.
 * @returns {object} The discovered device.
 */
function buildAreaDevice(gladys, house, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, house.selector);
  const feature = (key, name, shape) =>
    sensor({ name: t(name, language), external_id: ids.feature(key), ...shape });
  return {
    name: t('areaDeviceName', language, { house: house.name }),
    external_id: ids.device,
    model: 'eBird',
    should_poll: false,
    params: [{ name: 'EBIRD_HOUSE', value: house.selector }],
    features: [
      feature(FEATURES.SPECIES, 'featureSpecies', counterShape),
      feature(FEATURES.NOTABLE, 'featureNotable', counterShape),
      feature(FEATURES.LAST_NOTABLE, 'featureLastNotable', textShape),
    ],
  };
}

/**
 * @description The device of a watched species.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} code - The eBird species code.
 * @param {string} name - Its common name.
 * @param {string} language - Language of the feature names.
 * @returns {object} The discovered device.
 */
function buildSpeciesDevice(gladys, code, name, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.SPECIES, code);
  const feature = (key, label, shape) =>
    sensor({
      name: t(label, language, { species: name }),
      external_id: ids.feature(key),
      ...shape,
    });
  return {
    name: t('speciesDeviceName', language, { species: name }),
    external_id: ids.device,
    model: 'eBird',
    should_poll: false,
    params: [{ name: 'EBIRD_SPECIES_CODE', value: code }],
    features: [
      feature(FEATURES.NEAR, 'featureNear', {
        category: DEVICE_FEATURE_CATEGORIES.PRESENCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        min: 0,
        max: 1,
      }),
      feature(FEATURES.DISTANCE, 'featureDistance', {
        category: DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.KM,
        min: 0,
        // eBird searches 50 km around a position rounded to 2 decimals.
        max: 100,
      }),
      feature(FEATURES.DAYS_AGO, 'featureDaysAgo', {
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.DAYS,
        min: 0,
        max: 30,
      }),
    ],
  };
}

/**
 * @description The text of a report: "Hoopoe · 3.2 km · Parc de la Tête d'Or".
 * @param {object} observation - A parsed observation.
 * @param {string} name - The species name.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function reportText(observation, name, language) {
  return [name, formatKm(observation.distanceKm, language), observation.place]
    .filter(Boolean)
    .join(' · ')
    .slice(0, TEXT_MAX);
}

/**
 * @description The states of the area device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - The snapshot.
 * @param {(code: string, fallback: string) => string} nameOf - Species names.
 * @param {string} language - The language.
 * @returns {Array<object>} The states (`state`, or `text` for a text).
 */
function buildAreaStates(gladys, snapshot, nameOf, language) {
  const ids = idsOf(gladys, DEVICE_TYPES.AREA, snapshot.house.selector);
  const last = snapshot.notable[0];
  return [
    { device_feature_external_id: ids.feature(FEATURES.SPECIES), state: snapshot.speciesCount },
    { device_feature_external_id: ids.feature(FEATURES.NOTABLE), state: snapshot.notable.length },
    {
      device_feature_external_id: ids.feature(FEATURES.LAST_NOTABLE),
      text: last ? reportText(last, nameOf(last.code, last.name), language) : t('none', language),
    },
  ];
}

/**
 * @description The states of the watched species devices.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} snapshot - The snapshot.
 * @param {number} now - Now (ms).
 * @param {string} [timeZone] - The timezone of Gladys.
 * @returns {Array<{ device_feature_external_id: string, state: unknown }>} The states.
 */
function buildSpeciesStates(gladys, snapshot, now, timeZone) {
  const today = localDate(now, timeZone);
  return snapshot.watched
    .filter((entry) => entry.code)
    .flatMap((entry) => {
      const ids = idsOf(gladys, DEVICE_TYPES.SPECIES, entry.code);
      const states = [
        { device_feature_external_id: ids.feature(FEATURES.NEAR), state: entry.near ? 1 : 0 },
      ];
      if (entry.nearest) {
        states.push(
          {
            device_feature_external_id: ids.feature(FEATURES.DISTANCE),
            state: entry.nearest.distanceKm,
          },
          {
            device_feature_external_id: ids.feature(FEATURES.DAYS_AGO),
            state: Math.max(0, daysBetween(entry.nearest.date, today)),
          },
        );
      }
      return states;
    });
}

export {
  DEVICE_TYPES,
  FEATURES,
  houseKey,
  idsOf,
  targetOf,
  reportText,
  buildAreaDevice,
  buildSpeciesDevice,
  buildAreaStates,
  buildSpeciesStates,
};
