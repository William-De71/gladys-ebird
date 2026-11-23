// -----------------------------------------------------------------------------
// The eBird integration: every handler, registered on a Gladys client.
//
// Brings the bird observations of eBird (Cornell Lab of Ornithology) into
// Gladys, around a house of Gladys, through the eBird API 2.0 and the free,
// personal key of the user:
//   - devices (device.js): the birds around the house (species reported,
//     notable reports, the last one) and one per watched species (reported
//     nearby or not, nearest report, days since);
//   - scene triggers (events.js): a notable bird nearby, a watched species
//     nearby again;
//   - scene action: where was a species reported lately?
//   - dashboard widgets (widgets.js): birds nearby, rare birds, watched
//     species.
//
// eBird has no push: the integration reads it on its own timer (30 min to
// 3 h, ~3 requests plus one per watched species). Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake eBird API (test/helpers/fake-api.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, INTERNAL_KEYS, AUTO_LANGUAGE } from './config.js';
import { createEbirdClient, EbirdError, ERROR_KINDS } from './ebird-api.js';
import { createTaxonomy } from './taxonomy.js';
import { buildSnapshot, parseObservation } from './observations.js';
import { createStore, DEFAULT_PATH } from './store.js';
import {
  DEVICE_TYPES,
  idsOf,
  targetOf,
  buildAreaDevice,
  buildSpeciesDevice,
  buildAreaStates,
  buildSpeciesStates,
} from './device.js';
import { TRIGGERS, detect, reportData } from './events.js';
import {
  WIDGETS,
  TTL_SECONDS,
  messageContent,
  buildNearbyWidget,
  buildNotableWidget,
  buildWatchedWidget,
} from './widgets.js';
import { formatKm } from './format.js';
import { defaultTimeZone, daysBetween, formatObsDate, localDate, MINUTE_MS } from './time.js';
import { LANGUAGES, t, all } from './i18n.js';

const ACTIONS = { CHECK: 'check' };
const SCENE_ACTIONS = { FIND_SPECIES: 'find_species' };
const RETRY_MS = 15 * MINUTE_MS;
// A widget never waits longer for the names of its language (handler: 15 s).
const NAMES_WAIT_MS = 8000;
const {
  name: NAME,
  version: VERSION,
  homepage: HOMEPAGE,
} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * @description The message key and values of a failure.
 * @param {Error} err - An EbirdError, or a house problem (`kind`).
 * @returns {{ key: string, values: object }} The message.
 */
function problemOf(err) {
  switch (err?.kind) {
    case 'no_house':
      return { key: 'statusNoHouse', values: {} };
    case 'house':
      return { key: 'statusHouseNotLocated', values: { house: err.house } };
    case ERROR_KINDS.NO_KEY:
      return { key: 'noKey', values: {} };
    case ERROR_KINDS.BAD_KEY:
      return { key: 'statusBadKey', values: {} };
    case ERROR_KINDS.RATE_LIMIT:
      return { key: 'statusRateLimited', values: {} };
    case ERROR_KINDS.UNREACHABLE:
      return { key: 'statusUnreachable', values: {} };
    default:
      return { key: 'statusApiError', values: { detail: err?.message ?? String(err) } };
  }
}

/**
 * @description Wait for a promise, at most some time.
 * @param {Promise<unknown>} promise - The promise.
 * @param {number} ms - The time.
 * @returns {Promise<void>} Resolves either way.
 */
function within(promise, ms) {
  let timer;
  return Promise.race([
    promise.catch(() => {}),
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Test seams.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {string} [options.baseUrl] - The eBird API root.
 * @param {() => number} [options.now] - Clock.
 * @param {(ms: number) => Promise<void>} [options.sleep] - Wait before a retry.
 * @param {string} [options.dataDir] - Where /data files go.
 * @param {string} [options.timeZone] - The timezone of Gladys.
 * @param {boolean} [options.timer] - Read on a timer (false in the tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    baseUrl,
    now = () => Date.now(),
    sleep,
    dataDir = '/data',
    timeZone = defaultTimeZone(),
    timer = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  let createdDevices = new Set();
  let lastStatus = null;
  let house = null;
  let snapshot = null;
  let watched = [];
  let offered = null;
  let roundTimer = null;
  let running = null;
  let stopped = false;

  const client = createEbirdClient({
    getKey: () => config.apiKey,
    userAgent: `${NAME}/${VERSION} (+${HOMEPAGE})`,
    baseUrl,
    fetchImpl,
    sleep,
  });
  const taxonomy = createTaxonomy({
    fetchTaxonomy: (locale) => client.taxonomy(locale),
    dir: dataDir,
    now,
    logger,
  });
  const store = createStore({
    path: dataDir === '/data' ? DEFAULT_PATH : `${dataDir}/ebird.json`,
    logger,
    now,
  });

  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);
  const nameOf = (code, fallback, lang) => taxonomy.name(code, lang, fallback);

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  // --- House and watched species ------------------------------------------------

  /**
   * @description The house of the configuration, with its position.
   * @returns {Promise<object>} `{ selector, name, latitude, longitude }`.
   */
  async function resolveHouse() {
    const houses = await gladys.getHouses().catch((err) => {
      logger.warn(`Unable to read the houses: ${err.message}`);
      return [];
    });
    const located = (candidate) =>
      typeof candidate?.latitude === 'number' && typeof candidate?.longitude === 'number';
    if (config.house) {
      const chosen = houses.find((candidate) => candidate.selector === config.house);
      if (!located(chosen)) {
        throw Object.assign(new Error('House without a position'), {
          kind: 'house',
          house: chosen?.name ?? config.house,
        });
      }
      return chosen;
    }
    const first = houses.find(located);
    if (!first) {
      throw Object.assign(new Error('No house with a position'), { kind: 'no_house' });
    }
    return first;
  }

  /**
   * @description The species codes of the `watched` setting. Names are looked
   * for in English and the language of the texts, then in all four.
   * @returns {Promise<Array<{ typed: string, code: string|null }>>} The species.
   */
  async function resolveWatched() {
    if (config.watched.length === 0) {
      return [];
    }
    await taxonomy.ensure('en');
    await taxonomy.ensure(textLanguage());
    let resolved = config.watched.map((typed) => ({ typed, code: taxonomy.resolve(typed) }));
    if (resolved.some((entry) => !entry.code)) {
      for (const lang of LANGUAGES) {
        await taxonomy.ensure(lang);
      }
      resolved = config.watched.map((typed) => ({ typed, code: taxonomy.resolve(typed) }));
    }
    // Two names of the same species count once.
    const seen = new Set();
    return resolved.filter(
      (entry) => !entry.code || (!seen.has(entry.code) && seen.add(entry.code)),
    );
  }

  // --- Devices ------------------------------------------------------------------

  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Offer the area device and the watched species on the
   * Discovery screen, when the list changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<void>}
   */
  async function offerDevices(force = false) {
    if (!house) {
      return;
    }
    const lang = textLanguage();
    const devices = [
      buildAreaDevice(gladys, house, lang),
      ...watched
        .filter((entry) => entry.code)
        .map((entry) =>
          buildSpeciesDevice(gladys, entry.code, nameOf(entry.code, entry.typed, lang), lang),
        ),
    ];
    const signature = JSON.stringify(devices);
    if (!force && signature === offered) {
      return;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      offered = signature;
    } catch (err) {
      logger.warn(`Unable to offer the devices: ${err.message}`);
    }
  }

  /**
   * @description Publish the states of the created devices that changed.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    if (!snapshot) {
      return;
    }
    const lang = textLanguage();
    // Only the devices the user created: Gladys drops the other states.
    const states = [
      ...buildAreaStates(gladys, snapshot, (code, fallback) => nameOf(code, fallback, lang), lang),
      ...buildSpeciesStates(gladys, snapshot, now(), timeZone),
    ].filter((state) => {
      const target = targetOf(state.device_feature_external_id);
      return target && createdDevices.has(idsOf(gladys, target.type, target.id).device);
    });
    if (states.length > 0) {
      await gladys
        .publishChangedStates(states)
        .catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));
    }
  }

  function refreshWidgets() {
    Object.values(WIDGETS).forEach((key) =>
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch(() => {}),
    );
  }

  // --- Events -------------------------------------------------------------------

  async function publishEvent(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Unable to publish the scene event ${key}: ${err.message}`);
    }
  }

  async function publishEvents(news) {
    const lang = textLanguage();
    for (const observation of news.notable) {
      const name = nameOf(observation.code, observation.name, lang);
      logger.info(`Notable bird: ${observation.name} (${observation.place})`);
      await publishEvent(TRIGGERS.NOTABLE, {
        ...reportData(observation, name, taxonomy.scientificName(observation.code), lang),
        house: house.name,
      });
    }
    for (const entry of news.watched) {
      const name = nameOf(entry.code, entry.typed, lang);
      logger.info(`Watched bird nearby: ${entry.nearest.name} (${entry.nearest.place})`);
      await publishEvent(TRIGGERS.WATCHED, {
        ...reportData(entry.nearest, name, taxonomy.scientificName(entry.code), lang),
        device: idsOf(gladys, DEVICE_TYPES.SPECIES, entry.code).device,
        house: house.name,
      });
    }
  }

  // --- The reading --------------------------------------------------------------

  /**
   * @description Read eBird once: the house, the species, the notable
   * reports, the watched species; then events, states, devices, status.
   * @returns {Promise<object|null>} The snapshot, null on failure.
   */
  async function readNow() {
    if (!config.apiKey) {
      await reportStatus(false, all('noKey'));
      return null;
    }
    try {
      house = await resolveHouse();
      watched = await resolveWatched();
      const search = { radiusKm: config.radiusKm, days: config.days };
      const recent = await client.recentNearby(house, search);
      const notable = await client.notableNearby(house, search);
      const withNearest = [];
      for (const entry of watched) {
        withNearest.push({
          ...entry,
          nearest: entry.code ? await client.nearest(entry.code, house, search) : null,
        });
      }
      snapshot = buildSnapshot({
        house,
        recent,
        notable,
        watched: withNearest,
        radiusKm: config.radiusKm,
        days: config.days,
        fetchedAt: now(),
      });
      const news = detect(snapshot, store, now());
      store.prune();
      await store.save();
      logger.info(
        `eBird: ${snapshot.speciesCount} species, ${snapshot.notable.length} notable reports around ${house.name}` +
          `${news.baseline ? ' (baseline)' : `, ${news.notable.length + news.watched.length} event(s)`}`,
      );
      await publishEvents(news);
      await offerDevices();
      await publishStates();
      refreshWidgets();
      const unknown = watched.filter((entry) => !entry.code).map((entry) => entry.typed);
      const radius = (lang) => formatKm(config.radiusKm, lang);
      await reportStatus(
        true,
        all((lang) =>
          [
            t('statusConnected', lang, {
              species: snapshot.speciesCount,
              notable: snapshot.notable.length,
              radius: radius(lang),
              house: house.name,
            }),
            unknown.length > 0
              ? t('statusUnknownSpecies', lang, { names: unknown.join(', ') })
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        ),
      );
      return snapshot;
    } catch (err) {
      const { key, values } = problemOf(err);
      logger.warn(`eBird reading failed (${err.kind ?? 'error'}): ${err.message}`);
      await reportStatus(false, all(key, values));
      throw err;
    }
  }

  /**
   * @description One reading at a time; the next one is scheduled after it.
   * @returns {Promise<object|null>} The snapshot, null on failure.
   */
  function round() {
    if (!running) {
      running = readNow()
        .then((result) => {
          schedule(config.interval * MINUTE_MS);
          return result;
        })
        .catch((err) => {
          // A refused key waits for a new configuration; the rest tries again.
          if (err.kind !== ERROR_KINDS.BAD_KEY && err.kind !== ERROR_KINDS.NO_KEY) {
            schedule(RETRY_MS);
          }
          return null;
        })
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  function schedule(ms) {
    clearTimeout(roundTimer);
    if (!timer || stopped) {
      return;
    }
    roundTimer = setTimeout(round, ms);
    roundTimer.unref?.();
  }

  // --- Dashboard widgets --------------------------------------------------------

  /**
   * @description The snapshot for a widget, or the message to show instead.
   * @param {string} lang - The language of the widget.
   * @returns {Promise<{ problem?: object }>} The message, when there is one.
   */
  async function widgetContext(lang) {
    rememberLanguage(lang);
    if (!config.apiKey) {
      return { problem: messageContent(t('noKey', lang)) };
    }
    if (!snapshot) {
      return { problem: messageContent(t('notReadYet', lang), 30) };
    }
    await within(taxonomy.ensure(lang), NAMES_WAIT_MS);
    return {};
  }

  gladys.onWidgetGet(WIDGETS.NEARBY, async ({ language: lang } = {}) => {
    const { problem } = await widgetContext(lang);
    return problem ?? buildNearbyWidget({ snapshot, nameOf, language: lang });
  });

  gladys.onWidgetGet(WIDGETS.NOTABLE, async ({ language: lang } = {}) => {
    const { problem } = await widgetContext(lang);
    return problem ?? buildNotableWidget({ snapshot, nameOf, language: lang });
  });

  gladys.onWidgetGet(WIDGETS.WATCHED, async ({ language: lang } = {}) => {
    const { problem } = await widgetContext(lang);
    return (
      problem ?? buildWatchedWidget({ snapshot, nameOf, language: lang, now: now(), timeZone })
    );
  });

  // --- Scene action -------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.FIND_SPECIES, async (fields = {}) => {
    const typed = String(fields.species ?? '').trim();
    if (!typed) {
      throw new Error('The species is empty');
    }
    const days = Math.min(30, Math.max(1, Math.round(Number(fields.days) || 30)));
    const lang = textLanguage();
    const target = house ?? (await resolveHouse());
    await taxonomy.ensure('en');
    await taxonomy.ensure(lang);
    let code = taxonomy.resolve(typed);
    if (!code) {
      for (const other of LANGUAGES) {
        await taxonomy.ensure(other);
      }
      code = taxonomy.resolve(typed);
    }
    if (!code) {
      throw new Error(`Unknown species: ${typed}`);
    }
    // No trigger fires here: an action never starts an event.
    const found = (await client.nearest(code, target, { days }))
      .map((raw) => parseObservation(raw, target))
      .filter((observation) => observation && observation.distanceKm !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const name = nameOf(code, found[0]?.name ?? typed, lang);
    if (found.length === 0) {
      return {
        found: false,
        species_name: name,
        species_code: code,
        place: '',
        distance_km: null,
        observed_on: '',
        days_ago: null,
        checklist_url: '',
        summary: t('notFoundSummary', lang, { species: name, days }),
      };
    }
    const data = reportData(found[0], name, taxonomy.scientificName(code), lang);
    return {
      found: true,
      species_name: name,
      species_code: code,
      place: data.place,
      distance_km: data.distance_km,
      observed_on: data.observed_on,
      days_ago: Math.max(0, daysBetween(found[0].date, localDate(now(), timeZone))),
      checklist_url: data.checklist_url,
      summary: data.summary,
    };
  });

  // --- Configuration button -----------------------------------------------------

  gladys.onAction(ACTIONS.CHECK, async () => {
    const result = await round();
    if (!result) {
      if (!config.apiKey) {
        return all('noKey');
      }
      return JSON.parse(lastStatus ?? '[false,{}]')[1];
    }
    return all((lang) =>
      [
        t('checkLine', lang, {
          house: house.name,
          position: `${house.latitude.toFixed(2)}, ${house.longitude.toFixed(2)}`,
          species: result.speciesCount,
          notable: result.notable.length,
          radius: formatKm(result.radiusKm, lang),
          days: result.days,
        }),
        ...result.watched.map((entry) => {
          const species = entry.code ? nameOf(entry.code, entry.typed, lang) : entry.typed;
          if (!entry.code) {
            return `${species}: ${t('watchedUnknown', lang)}`;
          }
          return entry.nearest
            ? t('checkWatched', lang, {
                species,
                distance: formatKm(entry.nearest.distanceKm, lang),
                date: formatObsDate(entry.nearest.date, entry.nearest.time, lang),
              })
            : t('checkWatchedNone', lang, { species });
        }),
      ].join('\n'),
    );
  });

  // --- Devices ------------------------------------------------------------------

  gladys.onSetValue(async (device, feature) => {
    throw new Error(`Read-only feature: ${feature.external_id}`);
  });

  gladys.onScanRequest(async () => {
    await round();
    await offerDevices(true);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishStates();
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration ------------------------------------------------------------

  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    logger.info(
      `Configuration: ${config.radiusKm} km, ${config.days} days, ${config.watched.length} watched species, ` +
        `every ${config.interval} min, API key ${config.apiKey ? 'set' : 'missing'}`,
    );
    offered = null;
    await round();
  });

  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      stopped = false;
      await store.load();
      await loadConfig();
      await refreshCreatedDevices();
      lastStatus = null;
      offered = null;
      await round();
    })().catch((err) => logger.error('Post-connection initialization failed', err));
  });

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearTimeout(roundTimer);
    await store.save();
  });

  return {
    getConfig: () => config,
    snapshot: () => snapshot,
    round,
    store,
    whenReady: () => startup,
    stop: () => {
      stopped = true;
      clearTimeout(roundTimer);
    },
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, TTL_SECONDS, problemOf, EbirdError };
