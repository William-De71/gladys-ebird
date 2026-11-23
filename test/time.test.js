import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, distanceKm, formatObsDate, localDate, readObsDate } from '../src/time.js';

test('the date of an eBird observation, with or without a time', () => {
  assert.deepEqual(readObsDate('2026-11-20 08:14'), { date: '2026-11-20', time: '08:14' });
  assert.deepEqual(readObsDate('2026-11-20'), { date: '2026-11-20', time: null });
  assert.equal(readObsDate('yesterday'), null);
  assert.equal(formatObsDate('2026-11-20', '08:14', 'fr'), '20 nov. 08:14');
  assert.equal(formatObsDate('2026-11-20', null, 'en'), '20 Nov');
  assert.equal(formatObsDate('soon', null, 'en'), 'soon');
});

test('local dates and days between them', () => {
  // 23:30 UTC on 20 November is already the 21st in Paris.
  assert.equal(localDate(Date.parse('2026-11-20T23:30:00Z'), 'Europe/Paris'), '2026-11-21');
  assert.equal(daysBetween('2026-11-12', '2026-11-20'), 8);
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2, 'across the end of summer time');
});

test('the distance between two positions', () => {
  // Lyon Bellecour - Paris Notre-Dame: about 392 km.
  assert.ok(Math.abs(distanceKm(45.7578, 4.832, 48.853, 2.3499) - 392) < 2);
  assert.equal(distanceKm(45, 4, 45, 4), 0);
});
