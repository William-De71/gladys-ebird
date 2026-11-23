// The discovered devices, checked like Gladys would accept them: every feature
// has min, max, read_only and has_feedback (else "Add" fails in 422), valid
// category / type pairs from the SDK, no poll on a Gladys timer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  buildAreaDevice,
  buildSpeciesDevice,
  buildSpeciesStates,
  targetOf,
  idsOf,
  DEVICE_TYPES,
} from '../src/device.js';
import { buildSnapshot } from '../src/observations.js';
import { LYON, NEAREST, NOW, RECENT, TZ } from './helpers/fake-api.js';
import { LANGUAGES } from '../src/i18n.js';

const gladys = createFakeGladys();
const HOUSE = { selector: 'Main House', name: 'Maison', ...LYON };
const categories = new Set(Object.values(DEVICE_FEATURE_CATEGORIES));
const units = new Set(Object.values(DEVICE_FEATURE_UNITS));

const checkDevice = (device) => {
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    assert.ok(categories.has(feature.category), feature.category);
    const types = Object.values(
      DEVICE_FEATURE_TYPES[
        Object.keys(DEVICE_FEATURE_CATEGORIES).find(
          (key) => DEVICE_FEATURE_CATEGORIES[key] === feature.category,
        )
      ] ?? DEVICE_FEATURE_TYPES.SENSOR,
    );
    assert.ok(
      types.includes(feature.type) ||
        Object.values(DEVICE_FEATURE_TYPES.SENSOR).includes(feature.type),
      `${feature.category}/${feature.type}`,
    );
    if (feature.unit) {
      assert.ok(units.has(feature.unit), feature.unit);
    }
    assert.ok(feature.name.length > 0 && feature.name.length <= 100);
  }
};

test('the area device: external ids from the house, three features, every language', () => {
  for (const language of LANGUAGES) {
    const device = buildAreaDevice(gladys, HOUSE, language);
    checkDevice(device);
    assert.equal(device.external_id, 'ext:test-integration:area:main-house');
    assert.deepEqual(
      device.features.map((feature) => [feature.external_id.split(':').pop(), feature.category]),
      [
        ['species', 'counter-sensor'],
        ['notable', 'counter-sensor'],
        ['last_notable', 'text'],
      ],
    );
  }
  assert.equal(buildAreaDevice(gladys, HOUSE, 'de').name, 'Vögel um Maison');
});

test('a watched species: presence, distance in km, days since', () => {
  const device = buildSpeciesDevice(gladys, 'eurhoo', 'Huppe fasciée', 'fr');
  checkDevice(device);
  assert.equal(device.name, 'Huppe fasciée (eBird)');
  assert.deepEqual(
    device.features.map((feature) => [feature.name, feature.category, feature.unit ?? null]),
    [
      ['Huppe fasciée à proximité', 'presence-sensor', null],
      ['Huppe fasciée : observation la plus proche', 'distance-sensor', 'km'],
      ['Huppe fasciée : jours depuis l’observation', 'duration', 'days'],
    ],
  );
  assert.deepEqual(targetOf(device.features[1].external_id), {
    type: 'species',
    id: 'eurhoo',
  });
  assert.equal(targetOf('ext:other:thing'), null);
  assert.equal(
    idsOf(gladys, DEVICE_TYPES.AREA, 'main-house').device,
    idsOf(gladys, DEVICE_TYPES.AREA, 'Main House').device,
  );
});

test('species states: nothing but "not near" for a species never reported', () => {
  const snapshot = buildSnapshot({
    house: HOUSE,
    recent: RECENT,
    notable: [],
    watched: [
      { typed: 'h', code: 'eurhoo', nearest: NEAREST.eurhoo },
      { typed: 'b', code: 'barswa', nearest: [] },
      { typed: 'x', code: null, nearest: null },
    ],
    radiusKm: 10,
    days: 7,
    fetchedAt: NOW,
  });
  const states = buildSpeciesStates(gladys, snapshot, NOW, TZ);
  assert.deepEqual(
    states.map((state) => [
      state.device_feature_external_id.split(':').slice(-2).join(':'),
      state.state,
    ]),
    [
      ['eurhoo:near', 0],
      ['eurhoo:distance', states[1].state],
      ['eurhoo:days_ago', 8],
      ['barswa:near', 0],
    ],
  );
  assert.ok(states[1].state > 20 && states[1].state < 40);
});
