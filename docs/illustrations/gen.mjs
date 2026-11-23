// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets around Lyon on Thursday 20 November 2026, 18:00: the
// made-up observations of the fake eBird API of the tests
// (test/helpers/fake-api.js) go through the real snapshot (src/observations.js),
// taxonomy (src/taxonomy.js, names in each language) and widget builders
// (src/widgets.js). Never real data.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildNearbyWidget, buildNotableWidget, buildWatchedWidget } = await load('src/widgets.js');
const { buildSnapshot } = await load('src/observations.js');
const { createTaxonomy } = await load('src/taxonomy.js');
const { LANGUAGES } = await load('src/i18n.js');
const { NOW, TZ, LYON, RECENT, NOTABLE, NEAREST, taxonomy, obs } = await load(
  'test/helpers/fake-api.js',
);
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const dir = mkdtempSync(join(tmpdir(), 'ebird-illustration-'));
const book = createTaxonomy({ fetchTaxonomy: async (locale) => taxonomy(locale), dir });
const snapshot = buildSnapshot({
  house: { selector: 'home', name: 'Lyon', ...LYON },
  recent: RECENT.filter((raw) => raw.speciesCode !== 'gull1'),
  notable: NOTABLE,
  watched: [
    { typed: 'Huppe fasciée', code: 'eurhoo', nearest: NEAREST.eurhoo },
    {
      typed: 'Grande Aigrette',
      code: 'grbher3',
      nearest: [
        obs('grbher3', { locName: 'Grand Large', lat: 45.7869, lng: 4.9894, obsDt: '2026-11-18' }),
      ],
    },
    { typed: 'Rougegorge', code: 'eurrob1', nearest: NEAREST.eurrob1 },
    { typed: 'Hirondelle rustique', code: 'barswa', nearest: [] },
  ],
  radiusKm: 15,
  days: 7,
  fetchedAt: NOW,
});
const nameOf = (code, fallback, language) => book.name(code, language, fallback);

const contents = {};
for (const language of LANGUAGES) {
  await book.ensure(language);
  contents[language] = {
    nearby: buildNearbyWidget({ snapshot, nameOf, language }),
    notable: buildNotableWidget({ snapshot, nameOf, language }),
    watched: buildWatchedWidget({ snapshot, nameOf, language, now: NOW, timeZone: TZ }),
  };
}
rmSync(dir, { recursive: true, force: true });

const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
