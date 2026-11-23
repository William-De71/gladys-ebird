import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  buildNearbyWidget,
  buildNotableWidget,
  buildWatchedWidget,
  messageContent,
} from '../src/widgets.js';
import { buildSnapshot } from '../src/observations.js';
import { formatKm } from '../src/format.js';
import { LANGUAGES } from '../src/i18n.js';
import { LYON, NEAREST, NOTABLE, NOW, RECENT, TZ } from './helpers/fake-api.js';

const HOUSE = { selector: 'lyon', name: 'Lyon', ...LYON };
const nameOf = (code, fallback) => fallback;
const full = buildSnapshot({
  house: HOUSE,
  recent: RECENT,
  notable: NOTABLE,
  watched: [
    { typed: 'Huppe', code: 'eurhoo', nearest: NEAREST.eurhoo },
    { typed: 'Robin', code: 'eurrob1', nearest: NEAREST.eurrob1 },
    { typed: 'barswa', code: 'barswa', nearest: [] },
    { typed: 'Dodo', code: null, nearest: null },
  ],
  radiusKm: 15,
  days: 7,
  fetchedAt: NOW,
});
const empty = buildSnapshot({
  house: HOUSE,
  recent: [],
  notable: [],
  watched: [],
  radiusKm: 5,
  days: 3,
  fetchedAt: NOW,
});

const budget = (content) => {
  const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
  assert.ok(content.components.length <= 8);
  assert.ok(count(['value', 'gauge']) <= 6);
  assert.ok(count(['text']) <= 2);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1);
  assert.ok(count(['status']) <= 1);
  assert.ok(count(['button']) <= 4);
};

test('every widget is valid within the budget, full or empty, in every language', () => {
  for (const language of LANGUAGES) {
    for (const snapshot of [full, empty]) {
      for (const build of [buildNearbyWidget, buildNotableWidget, buildWatchedWidget]) {
        const content = build({ snapshot, nameOf, language, now: NOW, timeZone: TZ });
        assert.deepEqual(validateWidgetContent(content), [], `${build.name} ${language}`);
        budget(content);
      }
    }
  }
  assert.deepEqual(validateWidgetContent(messageContent('x'.repeat(400))), []);
});

test('nearby: tiles, the recent species with place, distance, date and count', () => {
  const content = buildNearbyWidget({ snapshot: full, nameOf, language: 'fr' });
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((tile) => tile.value),
    [4, 2, 7],
  );
  const [magpie] = content.components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(magpie, {
    title: 'Eurasian Magpie',
    subtitle: 'Parc de la Tête d’Or · 100 m · 20 nov. 09:30',
    badge: { text: '× 6', color: 'info' },
  });
  assert.match(content.components.at(-2).text, /^Données : eBird\.org/);
  const none = buildNearbyWidget({ snapshot: empty, nameOf, language: 'en' });
  assert.match(none.components[3].text, /^No report within 5 km over the last 3 days\.$/);
});

test('rare birds: one card per species, reviewed or not, links to eBird', () => {
  const content = buildNotableWidget({ snapshot: full, nameOf, language: 'en' });
  const [wallcreeper, flycatcher] = content.components[0].items;
  assert.equal(wallcreeper.title, 'Wallcreeper');
  assert.deepEqual(wallcreeper.badge, { text: 'Confirmed', color: 'success' });
  assert.deepEqual(
    wallcreeper.links.map((link) => link.url),
    ['https://ebird.org/checklist/S200000002', 'https://ebird.org/species/wallcr1'],
  );
  assert.match(
    wallcreeper.description,
    /^1 report\(s\) over the last 7 days\. Latest: Fourvière, 3 km\.$/,
  );
  assert.deepEqual(flycatcher.badge, { text: 'Unreviewed', color: 'warning' });
});

test('watched: near in green, farther in blue, never reported, unknown', () => {
  const content = buildWatchedWidget({
    snapshot: full,
    nameOf,
    language: 'fr',
    now: NOW,
    timeZone: TZ,
  });
  assert.deepEqual(
    content.components[0].items.map((item) => [item.label, item.value, item.color]),
    [
      ['Huppe', `${formatKm(full.watched[0].nearest.distanceKm, 'fr')} · il y a 8 j`, 'info'],
      ['Robin', '2 km · aujourd’hui', 'success'],
      ['barswa', 'Pas signalée', 'neutral'],
      ['Dodo', 'Espèce inconnue', 'danger'],
    ],
  );
  const none = buildWatchedWidget({
    snapshot: empty,
    nameOf,
    language: 'en',
    now: NOW,
    timeZone: TZ,
  });
  assert.match(none.components[0].text, /^No species to watch yet/);
});

test('distances stay short', () => {
  assert.equal(formatKm(0.04, 'en'), '100 m');
  assert.equal(formatKm(0.66, 'en'), '700 m');
  assert.equal(formatKm(3.24, 'fr'), '3,2 km');
  assert.equal(formatKm(18.6, 'de'), '19 km');
  assert.equal(formatKm(null, 'en'), '');
});
