import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshot,
  checklistUrl,
  isSpecies,
  notableBySpecies,
  parseObservation,
  reportKey,
} from '../src/observations.js';
import { detect, MAX_NOTABLE_EVENTS, reportData, signatureOf } from '../src/events.js';
import { createStore, KEEP_MS } from '../src/store.js';
import { dataDir, LYON, NEAREST, NOTABLE, RECENT, obs } from './helpers/fake-api.js';
import { join } from 'node:path';

const HOUSE = { selector: 'lyon', name: 'Lyon', ...LYON };
const snapshotOf = (fields = {}) =>
  buildSnapshot({
    house: HOUSE,
    recent: RECENT,
    notable: NOTABLE,
    watched: [
      { typed: 'Huppe', code: 'eurhoo', nearest: NEAREST.eurhoo },
      { typed: 'barswa', code: 'barswa', nearest: [] },
      { typed: 'Dodo', code: null, nearest: null },
    ],
    radiusKm: 15,
    days: 7,
    fetchedAt: 0,
    ...fields,
  });

test('an observation: date, count, distance; groups and hybrids are no species', () => {
  const robin = parseObservation(RECENT[1], LYON);
  assert.deepEqual(
    [robin.code, robin.count, robin.date, robin.time, robin.distanceKm],
    ['eurrob1', 2, '2026-11-20', '08:14', 2],
  );
  const gull = parseObservation(RECENT[4], LYON);
  assert.equal(gull.count, null, 'no howMany');
  assert.equal(gull.time, null);
  assert.equal(isSpecies(gull), false);
  assert.equal(parseObservation({ speciesCode: 'x' }, LYON), null, 'no date');
  assert.equal(reportKey(parseObservation(NOTABLE[0], LYON)), 'S200000002:wallcr1');
  assert.equal(checklistUrl({ subId: 'S1' }), 'https://ebird.org/checklist/S1');
  assert.equal(checklistUrl({ subId: null }), null);
});

test('the snapshot: species counted, notable reports once per checklist, watched nearest', () => {
  const snapshot = snapshotOf();
  assert.equal(snapshot.speciesCount, 4);
  assert.deepEqual(
    snapshot.species.map((observation) => observation.code),
    ['commag', 'eurrob1', 'wallcr1', 'grbher3', 'gull1'],
  );
  assert.deepEqual(
    snapshot.notable.map((observation) => observation.code),
    ['wallcr1', 'rebfly'],
  );
  assert.equal(snapshot.notableSpecies, 2);
  const [hoopoe, swallow, dodo] = snapshot.watched;
  assert.equal(hoopoe.near, false);
  assert.ok(hoopoe.nearest.distanceKm > 15);
  assert.equal(swallow.nearest, null);
  assert.equal(dodo.near, false);
  assert.deepEqual(
    notableBySpecies(
      snapshotOf({ notable: [...NOTABLE, obs('rebfly', { subId: 'S9', obsDt: '2026-11-15' })] }),
    ).map(({ observation, reports }) => [observation.code, reports]),
    [
      ['wallcr1', 1],
      ['rebfly', 2],
    ],
  );
});

test('a first reading is a baseline; new reports and species nearby fire once', () => {
  const store = createStore({ path: join(dataDir(), 'ebird.json') });
  const first = detect(snapshotOf(), store, 1000);
  assert.deepEqual(first, { notable: [], watched: [], baseline: true });
  assert.equal(store.data.signature, signatureOf(snapshotOf()));
  const news = detect(
    snapshotOf({
      notable: [...NOTABLE, obs('grbher3', { subId: 'S300', obsDt: '2026-11-20 16:00' })],
      watched: [
        { typed: 'Huppe', code: 'eurhoo', nearest: [obs('eurhoo', { lat: 45.78, lng: 4.86 })] },
        { typed: 'barswa', code: 'barswa', nearest: [] },
        { typed: 'Dodo', code: null, nearest: null },
      ],
    }),
    store,
    2000,
  );
  assert.equal(news.baseline, false);
  assert.deepEqual(
    news.notable.map((observation) => observation.code),
    ['grbher3'],
  );
  assert.deepEqual(
    news.watched.map((entry) => entry.code),
    ['eurhoo'],
  );
  // The hoopoe stays near: nothing more; it leaves and comes back: once more.
  const same = detect(
    snapshotOf({
      watched: [{ typed: 'Huppe', code: 'eurhoo', nearest: [obs('eurhoo', {})] }],
    }),
    store,
    3000,
  );
  assert.equal(same.baseline, true, 'another list of watched species is another search');
});

test('at most 10 notable events per reading, the most recent ones', () => {
  const store = createStore({ path: join(dataDir(), 'ebird.json') });
  detect(snapshotOf(), store, 0);
  const many = Array.from({ length: 14 }, (_, i) =>
    obs('rebfly', { subId: `S9${i}`, obsDt: `2026-11-${String(i + 1).padStart(2, '0')}` }),
  );
  const news = detect(snapshotOf({ notable: [...NOTABLE, ...many] }), store, 1);
  assert.equal(news.notable.length, MAX_NOTABLE_EVENTS);
  assert.equal(news.notable[0].date, '2026-11-14');
  assert.equal(Object.keys(store.data.reports).length, 16, 'all remembered');
});

test('the store forgets reports after 35 days and survives a broken file', async () => {
  let now = 0;
  const path = join(dataDir(), 'ebird.json');
  const store = createStore({ path, now: () => now });
  store.data.reports = { old: 0, recent: KEEP_MS };
  now = KEEP_MS + 10;
  store.prune();
  assert.deepEqual(Object.keys(store.data.reports), ['recent']);
  await store.save();
  const again = createStore({ path });
  await again.load();
  assert.deepEqual(again.data.reports, { recent: KEEP_MS });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, '{broken');
  const broken = createStore({ path, logger: { warn() {} } });
  await broken.load();
  assert.deepEqual(broken.data.reports, {});
});

test('the variables of an event are flat and within the limits', () => {
  const observation = parseObservation(NOTABLE[0], LYON);
  const data = reportData(observation, 'Mauerläufer', 'Tichodroma muraria', 'de');
  for (const value of Object.values(data)) {
    assert.ok(
      value === null || ['string', 'number', 'boolean'].includes(typeof value),
      JSON.stringify(value),
    );
  }
  assert.ok(Object.keys(data).length <= 30);
  assert.equal(
    data.summary,
    'Mauerläufer: Meldung in 3 km Entfernung (Fourvière), am 19. Nov. 15:02',
  );
});
