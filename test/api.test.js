import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEbirdClient, ERROR_KINDS, kindOf } from '../src/ebird-api.js';
import { fakeEbird, KEY, LYON } from './helpers/fake-api.js';

const client = (api, key = KEY) =>
  createEbirdClient({ getKey: () => key, fetchImpl: api, sleep: async () => {} });

test('the key goes in a header, the position with 2 decimals, the limits in the query', async () => {
  const api = fakeEbird();
  const ebird = client(api);
  assert.equal((await ebird.recentNearby(LYON, { radiusKm: 12, days: 5 })).length, 5);
  assert.equal((await ebird.notableNearby(LYON, { radiusKm: 12, days: 5 })).length, 3);
  assert.equal((await ebird.nearest('eurhoo', LYON, { days: 30 })).length, 1);
  assert.deepEqual(
    api.calls.map((call) => [call.path, call.params, call.key]),
    [
      ['/data/obs/geo/recent', { lat: '45.78', lng: '4.86', dist: '12', back: '5' }, KEY],
      [
        '/data/obs/geo/recent/notable',
        { lat: '45.78', lng: '4.86', dist: '12', back: '5', detail: 'simple' },
        KEY,
      ],
      [
        '/data/nearest/geo/recent/eurhoo',
        { lat: '45.78', lng: '4.86', back: '30', dist: '50', maxResults: '3' },
        KEY,
      ],
    ],
  );
});

test('the taxonomy needs no key', async () => {
  const api = fakeEbird();
  const taxa = await client(api, '').taxonomy('de');
  assert.equal(taxa.find((taxon) => taxon.speciesCode === 'eurhoo').comName, 'Wiedehopf');
  assert.deepEqual(api.calls[0].params, { fmt: 'json', locale: 'de' });
  assert.equal(api.calls[0].key, undefined);
});

test('errors: no key, refused key, rate limit, server tried once more, unreachable', async () => {
  const api = fakeEbird();
  await assert.rejects(client(api, '').recentNearby(LYON, { radiusKm: 1, days: 1 }), {
    kind: ERROR_KINDS.NO_KEY,
  });
  assert.equal(api.calls.length, 0);
  await assert.rejects(client(api, 'wrong').recentNearby(LYON, { radiusKm: 1, days: 1 }), {
    kind: ERROR_KINDS.BAD_KEY,
    message: 'HTTP 403',
  });
  api.failNext = 429;
  await assert.rejects(client(api).recentNearby(LYON, { radiusKm: 1, days: 1 }), {
    kind: ERROR_KINDS.RATE_LIMIT,
  });
  api.failNext = 503;
  const before = api.calls.length;
  assert.equal((await client(api).recentNearby(LYON, { radiusKm: 1, days: 1 })).length, 5);
  assert.equal(api.calls.length - before, 2, 'a 5xx is tried once more');
  api.offline = true;
  await assert.rejects(client(api).recentNearby(LYON, { radiusKm: 1, days: 1 }), {
    kind: ERROR_KINDS.UNREACHABLE,
  });
});

test('HTTP kinds', () => {
  assert.equal(kindOf(401), 'bad_key');
  assert.equal(kindOf(403), 'bad_key');
  assert.equal(kindOf(429), 'rate_limit');
  assert.equal(kindOf(400), 'request');
  assert.equal(kindOf(502), 'server');
});
