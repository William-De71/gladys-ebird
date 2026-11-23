import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldText, normalizeConfig, readLanguage, readWatched } from '../src/config.js';

test('defaults fill an empty configuration', () => {
  assert.deepEqual(normalizeConfig(), {
    apiKey: '',
    house: null,
    radiusKm: 10,
    days: 7,
    watched: [],
    interval: 60,
    language: 'auto',
  });
  assert.deepEqual(normalizeConfig(null).watched, []);
});

test('numbers are bounded, the interval is one of the choices', () => {
  const config = normalizeConfig({
    api_key: '  key ',
    house: ' lyon ',
    radius_km: '120',
    days: 0,
    interval: '45',
    language: 'de',
  });
  assert.equal(config.apiKey, 'key');
  assert.equal(config.house, 'lyon');
  assert.equal(config.radiusKm, 50);
  assert.equal(config.days, 1);
  assert.equal(config.interval, 60);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ interval: '180', radius_km: 'x' }).interval, 180);
  assert.equal(normalizeConfig({ radius_km: 'x' }).radiusKm, 10);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('watched species: split, trimmed, without duplicates, at most 10', () => {
  assert.deepEqual(readWatched(' Huppe fasciée ,huppe  FASCIEE;barswa\nUpupa epops,, '), [
    'Huppe fasciée',
    'barswa',
    'Upupa epops',
  ]);
  const many = Array.from({ length: 14 }, (_, i) => `bird${i}`).join(',');
  assert.equal(readWatched(many).length, 10);
  assert.deepEqual(readWatched(undefined), []);
  assert.equal(foldText('Rouge-gorge  Familier’s'), 'rouge gorge familier s');
  assert.equal(foldText('Mauerläufer'), 'mauerlaufer');
});

test('the stored language of the last widget', () => {
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'español' }, 'en'), 'en');
  assert.equal(readLanguage(null, 'fr'), 'fr');
});
