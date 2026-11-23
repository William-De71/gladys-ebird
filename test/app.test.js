// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// eBird API (test/helpers/fake-api.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import { fakeEbird, dataDir, silent, obs, NOW, TZ, KEY, LYON } from './helpers/fake-api.js';

const CONFIG = {
  api_key: KEY,
  radius_km: 15,
  days: 7,
  watched: 'Huppe fasciée, barswa, Rotkehlchen, Dodo',
  language: 'fr',
};
const HOUSES = [
  { selector: 'nowhere', name: 'Chalet', latitude: null, longitude: null },
  { selector: 'lyon', name: 'Lyon', ...LYON },
];
const PREFIX = 'ext:test-integration';
const AREA = `${PREFIX}:area:lyon`;
const HOOPOE = `${PREFIX}:species:eurhoo`;
const ROBIN = `${PREFIX}:species:eurrob1`;

/**
 * @description The integration, connected to a fake Gladys and a fake API.
 * @param {object} [options] - `{ config, api, dir, houses }`.
 * @returns {Promise<object>} `{ gladys, app, api, dir }`.
 */
async function startApp({
  config = CONFIG,
  api = fakeEbird(),
  dir = dataDir(),
  houses = HOUSES,
} = {}) {
  const gladys = createFakeGladys({ config, houses });
  const app = createApp(gladys, {
    fetchImpl: api,
    now: () => NOW,
    sleep: async () => {},
    dataDir: dir,
    timeZone: TZ,
    timer: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, dir };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('the first house with a position: the area and the watched species are offered', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [AREA, 'Oiseaux autour de Lyon'],
      [HOOPOE, 'Huppe fasciée (eBird)'],
      [`${PREFIX}:species:barswa`, 'Hirondelle rustique (eBird)'],
      [ROBIN, 'Rougegorge familier (eBird)'],
    ],
  );
  // The key in a header, the position rounded to 2 decimals, never in a log.
  const recent = api.calls.find((call) => call.path === '/data/obs/geo/recent');
  assert.deepEqual(recent.params, { lat: '45.78', lng: '4.86', dist: '15', back: '7' });
  assert.equal(recent.key, KEY);
  assert.deepEqual(
    api.calls.filter((call) => call.path.startsWith('/data/nearest/')).map((call) => call.path),
    [
      '/data/nearest/geo/recent/eurhoo',
      '/data/nearest/geo/recent/barswa',
      '/data/nearest/geo/recent/eurrob1',
    ],
  );
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.match(
    status.message.fr,
    /^4 espèces et 2 observations remarquables à moins de 15 km de Lyon\./,
  );
  assert.match(status.message.fr, /Introuvable dans la taxonomie eBird : Dodo\./);
  // The first reading is a baseline: no event.
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('created devices get their states; a species never reported keeps no distance', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, AREA);
  await created(gladys, HOOPOE);
  await created(gladys, ROBIN);
  await created(gladys, `${PREFIX}:species:barswa`);
  assert.equal(gladys.fake.lastState(`${AREA}:species`), 4);
  assert.equal(gladys.fake.lastState(`${AREA}:notable`), 2);
  assert.match(
    gladys.fake.lastState(`${AREA}:last_notable`),
    /^Tichodrome échelette · 3 km · Fourvière$/,
  );
  assert.equal(gladys.fake.lastState(`${HOOPOE}:near`), 0);
  assert.ok(gladys.fake.lastState(`${HOOPOE}:distance`) > 15);
  assert.equal(gladys.fake.lastState(`${HOOPOE}:days_ago`), 8);
  assert.equal(gladys.fake.lastState(`${ROBIN}:near`), 1);
  assert.equal(gladys.fake.lastState(`${ROBIN}:days_ago`), 0);
  assert.equal(gladys.fake.lastState(`${PREFIX}:species:barswa:near`), 0);
  assert.equal(gladys.fake.lastState(`${PREFIX}:species:barswa:distance`), undefined);
});

test('a new notable report and a watched species nearby fire once, even after a restart', async (t) => {
  const dir = dataDir();
  const api = fakeEbird();
  const { gladys, app } = await startApp({ api, dir });
  api.answers.notable = [
    ...api.answers.notable,
    obs('grbher3', {
      locName: 'Miribel-Jonage',
      lat: 45.82,
      lng: 4.95,
      obsDt: '2026-11-20 14:05',
      subId: 'S200000009',
      howMany: 4,
    }),
  ];
  api.answers.nearest.eurhoo = [
    obs('eurhoo', {
      locName: 'Villeurbanne',
      lat: 45.77,
      lng: 4.88,
      obsDt: '2026-11-20 11:00',
      subId: 'S200000010',
    }),
  ];
  await app.round();
  const notable = eventsOf(gladys, TRIGGERS.NOTABLE);
  assert.equal(notable.length, 1);
  assert.deepEqual(
    {
      species_name: notable[0].data.species_name,
      scientific_name: notable[0].data.scientific_name,
      count: notable[0].data.count,
      place: notable[0].data.place,
      observed_on: notable[0].data.observed_on,
      reviewed: notable[0].data.reviewed,
      checklist_url: notable[0].data.checklist_url,
      house: notable[0].data.house,
    },
    {
      species_name: 'Grande Aigrette',
      scientific_name: 'Ardea alba',
      count: 4,
      place: 'Miribel-Jonage',
      observed_on: '2026-11-20',
      reviewed: false,
      checklist_url: 'https://ebird.org/checklist/S200000009',
      house: 'Lyon',
    },
  );
  assert.match(
    notable[0].data.summary,
    /^Grande Aigrette : observation à 8,\d km \(Miribel-Jonage\), le 20 nov\. 14:05$/,
  );
  const watched = eventsOf(gladys, TRIGGERS.WATCHED);
  assert.equal(watched.length, 1);
  assert.equal(watched[0].data.device, HOOPOE);
  assert.equal(watched[0].data.species_name, 'Huppe fasciée');
  // Nothing new: nothing fires.
  await app.round();
  assert.equal(gladys.fake.sceneEvents.length, 2);
  await gladys.fake.shutdown();
  // A restart remembers what was announced.
  const again = await startApp({ api, dir });
  t.after(() => again.gladys.fake.shutdown());
  assert.deepEqual(again.gladys.fake.sceneEvents, []);
});

test('another radius is a new baseline: the reports already listed fire nothing', async (t) => {
  const api = fakeEbird();
  const { gladys } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  api.answers.notable = [
    ...api.answers.notable,
    obs('grbher3', { subId: 'S200000011', obsDt: '2026-11-20 15:00' }),
  ];
  await gladys.fake.configUpdated({ ...CONFIG, radius_km: 30 });
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the widgets are valid in every language, with the names of that language', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const key of Object.values(WIDGETS)) {
      const ack = await gladys.fake.widgetGet(key, { language });
      assert.equal(ack.success, true, `${key} ${language}`);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
  }
  const nearby = (await gladys.fake.widgetGet(WIDGETS.NEARBY, { language: 'de' })).data.content;
  const list = nearby.components.find((component) => component.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['Elster', 'Rotkehlchen', 'Mauerläufer', 'Silberreiher', 'gull sp.'],
  );
  const watched = (await gladys.fake.widgetGet(WIDGETS.WATCHED, { language: 'es' })).data.content;
  assert.deepEqual(
    watched.components[0].items.map((item) => [item.label, item.color]),
    [
      ['Abubilla común', 'info'],
      ['Golondrina común', 'neutral'],
      ['Petirrojo europeo', 'success'],
      ['Dodo', 'danger'],
    ],
  );
});

test('the scene action finds a species typed in any language; an unknown one fails', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.sceneAction(SCENE_ACTIONS.FIND_SPECIES, { species: 'Wiedehopf' });
  assert.equal(ack.success, true, JSON.stringify(ack));
  const outputs = ack.data.outputs;
  assert.equal(outputs.found, true);
  assert.equal(outputs.species_name, 'Huppe fasciée');
  assert.equal(outputs.place, 'Marais de Chaffaut');
  assert.equal(outputs.days_ago, 8);
  assert.match(
    outputs.summary,
    /^Huppe fasciée : observation à \d+ km \(Marais de Chaffaut\), le 12 nov\.$/,
  );
  const none = await gladys.fake.sceneAction(SCENE_ACTIONS.FIND_SPECIES, { species: 'barswa' });
  assert.equal(none.data.outputs.found, false);
  assert.match(none.data.outputs.summary, /^Aucune observation de Hirondelle rustique/);
  const unknown = await gladys.fake.sceneAction(SCENE_ACTIONS.FIND_SPECIES, { species: 'Dodo' });
  assert.equal(unknown.success, false);
  // An action never fires an event.
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the check button reads now and sums up each watched species', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const ack = await gladys.fake.action(ACTIONS.CHECK, {});
  assert.equal(ack.success, true);
  const lines = ack.data.message.en.split('\n');
  assert.match(
    lines[0],
    /^Lyon \(45\.78, 4\.86\): 4 species and 2 notable reports within 15 km over 7 days\.$/,
  );
  assert.match(lines[1], /^Eurasian Hoopoe: nearest report \d+ km, 12 Nov\.$/);
  assert.equal(lines[2], 'Barn Swallow: no report within 50 km.');
  assert.equal(lines[4], 'Dodo: Unknown species');
});

test('without a key nothing is read; a refused key and a house without position say so', async (t) => {
  const api = fakeEbird();
  const { gladys } = await startApp({ api, config: { watched: 'barswa' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(api.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /ebird\.org\/api\/keygen/);
  const widget = await gladys.fake.widgetGet(WIDGETS.NEARBY, { language: 'en' });
  assert.match(widget.data.content.components[0].text, /No eBird API key/);

  const refused = await startApp({ config: { ...CONFIG, api_key: 'wrong' } });
  t.after(() => refused.gladys.fake.shutdown());
  assert.match(refused.gladys.fake.connectionStatus.message.fr, /eBird a refusé la clé/);

  const nowhere = await startApp({ config: { ...CONFIG, house: 'nowhere' } });
  t.after(() => nowhere.gladys.fake.shutdown());
  assert.match(nowhere.gladys.fake.connectionStatus.message.en, /The house Chalet has no position/);
});
