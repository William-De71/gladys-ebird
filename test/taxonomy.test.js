import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compact, createTaxonomy, MAX_AGE_MS } from '../src/taxonomy.js';
import { dataDir, taxonomy } from './helpers/fake-api.js';

const setup = (dir = dataDir(), clock = { now: 1_000_000 }) => {
  const calls = [];
  const state = { failing: false };
  const book = createTaxonomy({
    fetchTaxonomy: async (locale) => {
      calls.push(locale);
      if (state.failing) {
        throw new Error('down');
      }
      return taxonomy(locale);
    },
    dir,
    now: () => clock.now,
  });
  return { book, calls, dir, clock, state };
};

test('names in each language, kept in /data and read from there after a restart', async () => {
  const { book, calls, dir, clock } = setup();
  await book.ensure('fr');
  await book.ensure('fr');
  assert.deepEqual(calls, ['fr']);
  assert.equal(book.name('eurhoo', 'fr', 'Eurasian Hoopoe'), 'Huppe fasciée');
  assert.equal(book.name('eurhoo', 'de', 'Eurasian Hoopoe'), 'Eurasian Hoopoe', 'not loaded');
  assert.equal(book.scientificName('eurhoo'), 'Upupa epops');
  const saved = JSON.parse(await readFile(join(dir, 'taxonomy-fr.json'), 'utf8'));
  assert.deepEqual(saved.rows[1], ['eurhoo', 'Huppe fasciée', 'Upupa epops']);
  const again = setup(dir, clock);
  await again.book.ensure('fr');
  assert.deepEqual(again.calls, [], 'read from /data');
  clock.now += MAX_AGE_MS + 1;
  await again.book.ensure('fr');
  assert.deepEqual(again.calls, ['fr'], 'read again after 30 days');
});

test('a species typed as a code, a scientific or a common name, accents aside', async () => {
  const { book } = setup();
  assert.equal(book.resolve('eurhoo'), 'eurhoo', 'without taxonomy, a code is trusted');
  await book.ensure('en');
  await book.ensure('fr');
  assert.equal(book.resolve('EURHOO'), 'eurhoo');
  assert.equal(book.resolve('upupa epops'), 'eurhoo');
  assert.equal(book.resolve('huppe fasciee'), 'eurhoo');
  assert.equal(book.resolve('Barn Swallow'), 'barswa');
  assert.equal(book.resolve('Wiedehopf'), null, 'German not loaded');
  assert.equal(book.resolve('abcdefg'), null, 'a code eBird does not know');
  assert.deepEqual(book.known().sort(), ['en', 'fr']);
});

test('a failure keeps what is known and waits before trying again', async () => {
  const { book, calls, state } = setup();
  state.failing = true;
  await book.ensure('es');
  await book.ensure('es');
  assert.deepEqual(calls, ['es']);
  assert.equal(book.name('eurhoo', 'es', 'Eurasian Hoopoe'), 'Eurasian Hoopoe');
  assert.deepEqual(compact([{ speciesCode: 'x' }, null, { speciesCode: 'y', comName: 'Y' }]), [
    ['y', 'Y', ''],
  ]);
});
