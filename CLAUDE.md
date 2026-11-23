# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for eBird, the bird observation
network of the Cornell Lab of Ornithology: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the eBird API 2.0
(`https://api.ebird.org/v2`, documented on
https://documenter.getpostman.com/view/664302/S1ENwy59) with the free,
personal key of the user, around a house of Gladys (`location: true`):
recent and notable observations nearby, the nearest report of each watched
species, the taxonomy for the names. Transport: cloud only. **Never tested
with a real key**: the shapes follow the reference; only the taxonomy answer
and the 403 of a missing or wrong key were checked against the real API
(2026-11-23).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js              SDK wiring only (new GladysIntegration + createApp)
src/app.js            every handler, registered before connect(); the reading timer,
                      the house, the watched species, events, states, status
src/ebird-api.js      HTTP client: key in the X-eBirdApiToken header, positions with
                      2 decimals, one retry on 5xx / network, 403 = refused key
src/taxonomy.js       names in 4 languages, kept in /data/taxonomy-<lang>.json (30 days),
                      resolution of what the user types (code, scientific, common name)
src/observations.js   observations of the API -> the snapshot (species, notable reports
                      once per checklist, watched species nearest), true species only
src/events.js         baseline per search signature, notable_bird, watched_bird, payloads
src/store.js          /data/ebird.json: signature, reports announced (35 days), near
src/device.js         the area device and the watched species devices, their states
src/widgets.js        nearby, notable, watched (eBird credited in each)
src/format.js         distances
src/time.js           eBird dates (local to the place), days, great-circle distance
src/config.js         configuration (key, house, radius, days, watched, interval, language)
src/i18n.js           runtime texts, en / fr / de / es
test/helpers/fake-api.js            the fake eBird API behind the `fetchImpl` option
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`area:<house selector>`, `species:<eBird code>`),
  feature `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema` and the values of its selects, `actions`, the widgets,
  scene triggers (fields, variables) and the scene action (fields, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **eBird API Terms of Use**: non-commercial use, a personal key per user
  (never a shared key in the code), credit "eBird.org, Cornell Lab of
  Ornithology" in every widget, the README, the docs and NOTICE. The key goes
  in a header, never in a URL or a log.
- **Privacy**: positions leave with 2 decimals only (about 1 km).
- **`should_poll` stays false**: the integration reads on its own timer (30,
  60 or 180 min; 15 min after a failure; never again after a refused key
  until the configuration changes). Requests per reading: recent, notable,
  one nearest per watched species (10 at most).
- **Events once.** The first reading of a search (house, radius, days, watched
  codes) is a baseline. `reports` keeps the notable reports announced (per
  checklist and species, 35 days), `near` the watched species seen nearby.
  At most 10 notable events per reading. A scene action or a widget never
  fires an event.
- **A value eBird does not give is not published** (a species never reported
  keeps no distance), except `near`, then 0.
- **Card lists**: the `date` of an item replaces its subtitle in the Gladys
  front: the date goes into the subtitle, after the place and the distance.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in English, French, German and Spanish;
  `test/i18n.test.js` checks it. German uses "du", Spanish "usted". Species
  names come from the eBird taxonomy, place names are never translated.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- A missing or wrong key: HTTP 403 with an empty body. The taxonomy needs no
  key (`/ref/taxonomy/ebird?fmt=json&cat=species&locale=fr`, ~3.5 MB).
- `obsDt` is local to the place ("2026-11-20 08:14", or a date alone);
  `howMany` is absent when the observer noted "X".
- Notable observations come once per checklist: the same bird seen by five
  observers is five reports (the widget groups them per species).
- `nearest/geo/recent` takes `dist` up to 50 km; the distance computed from
  the exact house position may slightly exceed it (feature max 100).
- The birds-nearby list includes groups ("gull sp."), pairs and hybrids:
  `isSpecies` keeps them out of the species count, not out of the list.
- `node --test` also runs `test/helpers/`: nothing starts on import.
