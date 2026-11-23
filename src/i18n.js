// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, widget contents, statuses, scene texts.
// German says "du", Spanish "usted", like Gladys. Species names come from the
// eBird taxonomy (taxonomy.js); place names are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  areaDeviceName: {
    en: 'Birds around {house}',
    fr: 'Oiseaux autour de {house}',
    de: 'Vögel um {house}',
    es: 'Aves alrededor de {house}',
  },
  featureSpecies: {
    en: 'Species reported',
    fr: 'Espèces signalées',
    de: 'Gemeldete Arten',
    es: 'Especies observadas',
  },
  featureNotable: {
    en: 'Notable reports',
    fr: 'Observations remarquables',
    de: 'Besondere Meldungen',
    es: 'Observaciones notables',
  },
  featureLastNotable: {
    en: 'Last notable report',
    fr: 'Dernière observation remarquable',
    de: 'Letzte besondere Meldung',
    es: 'Última observación notable',
  },
  speciesDeviceName: {
    en: '{species} (eBird)',
    fr: '{species} (eBird)',
    de: '{species} (eBird)',
    es: '{species} (eBird)',
  },
  featureNear: {
    en: '{species} nearby',
    fr: '{species} à proximité',
    de: '{species} in der Nähe',
    es: '{species} cerca',
  },
  featureDistance: {
    en: '{species}: nearest report',
    fr: '{species} : observation la plus proche',
    de: '{species}: nächste Meldung',
    es: '{species}: observación más cercana',
  },
  featureDaysAgo: {
    en: '{species}: days since seen',
    fr: '{species} : jours depuis l’observation',
    de: '{species}: Tage seit der Meldung',
    es: '{species}: días desde la observación',
  },
  none: { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' },

  // scene texts
  reportSummary: {
    en: '{species} reported {distance} away ({place}), {date}',
    fr: '{species} : observation à {distance} ({place}), le {date}',
    de: '{species}: Meldung in {distance} Entfernung ({place}), am {date}',
    es: '{species}: observación a {distance} ({place}), el {date}',
  },
  notFoundSummary: {
    en: 'No report of {species} within 50 km over the last {days} days.',
    fr: 'Aucune observation de {species} à moins de 50 km ces {days} derniers jours.',
    de: 'Keine Meldung von {species} im Umkreis von 50 km in den letzten {days} Tagen.',
    es: 'Ninguna observación de {species} a menos de 50 km en los últimos {days} días.',
  },

  // statuses
  noKey: {
    en: 'No eBird API key: request one (free) on ebird.org/api/keygen and paste it in the configuration.',
    fr: 'Pas de clé d’API eBird : demandez-en une (gratuite) sur ebird.org/api/keygen et collez-la dans la configuration.',
    de: 'Kein eBird-API-Schlüssel: Fordere einen (kostenlos) auf ebird.org/api/keygen an und füge ihn in die Konfiguration ein.',
    es: 'No hay clave de API de eBird: solicite una (gratuita) en ebird.org/api/keygen y péguela en la configuración.',
  },
  statusBadKey: {
    en: 'eBird refused the API key: copy it again from ebird.org/api/keygen.',
    fr: 'eBird a refusé la clé d’API : recopiez-la depuis ebird.org/api/keygen.',
    de: 'eBird hat den API-Schlüssel abgelehnt: Kopiere ihn erneut von ebird.org/api/keygen.',
    es: 'eBird ha rechazado la clave de API: cópiela de nuevo desde ebird.org/api/keygen.',
  },
  statusNoHouse: {
    en: 'No house of Gladys has a position: set one in Settings, Houses.',
    fr: 'Aucune maison de Gladys n’a de position : renseignez-la dans Paramètres, Maisons.',
    de: 'Kein Haus in Gladys hat einen Standort: Lege ihn unter Einstellungen, Häuser fest.',
    es: 'Ninguna casa de Gladys tiene ubicación: indíquela en Ajustes, Casas.',
  },
  statusHouseNotLocated: {
    en: 'The house {house} has no position in Gladys: set it in Settings, Houses.',
    fr: 'La maison {house} n’a pas de position dans Gladys : renseignez-la dans Paramètres, Maisons.',
    de: 'Das Haus {house} hat keinen Standort in Gladys: Lege ihn unter Einstellungen, Häuser fest.',
    es: 'La casa {house} no tiene ubicación en Gladys: indíquela en Ajustes, Casas.',
  },
  statusRateLimited: {
    en: 'eBird asks to slow down: the next reading will try again.',
    fr: 'eBird demande de ralentir : la prochaine lecture réessaiera.',
    de: 'eBird bittet, langsamer zu werden: Die nächste Abfrage versucht es erneut.',
    es: 'eBird pide ir más despacio: la próxima lectura lo volverá a intentar.',
  },
  statusUnreachable: {
    en: 'Cannot reach api.ebird.org: check the internet access of Gladys.',
    fr: 'Impossible de joindre api.ebird.org : vérifiez l’accès Internet de Gladys.',
    de: 'api.ebird.org ist nicht erreichbar: Prüfe den Internetzugang von Gladys.',
    es: 'No se puede acceder a api.ebird.org: compruebe el acceso a Internet de Gladys.',
  },
  statusApiError: {
    en: 'eBird error: {detail}',
    fr: 'Erreur d’eBird : {detail}',
    de: 'eBird-Fehler: {detail}',
    es: 'Error de eBird: {detail}',
  },
  statusConnected: {
    en: '{species} species and {notable} notable reports within {radius} of {house}.',
    fr: '{species} espèces et {notable} observations remarquables à moins de {radius} de {house}.',
    de: '{species} Arten und {notable} besondere Meldungen im Umkreis von {radius} um {house}.',
    es: '{species} especies y {notable} observaciones notables a menos de {radius} de {house}.',
  },
  statusUnknownSpecies: {
    en: 'Not found in the eBird taxonomy: {names}. Type the common name, the scientific name or the code shown on ebird.org.',
    fr: 'Introuvable dans la taxonomie eBird : {names}. Tapez le nom commun, le nom scientifique ou le code affiché sur ebird.org.',
    de: 'Nicht in der eBird-Taxonomie gefunden: {names}. Gib den deutschen oder wissenschaftlichen Namen oder den auf ebird.org angezeigten Code ein.',
    es: 'No encontrado en la taxonomía de eBird: {names}. Escriba el nombre común, el científico o el código que muestra ebird.org.',
  },
  notReadYet: {
    en: 'eBird has not been read yet: the first reading is on its way.',
    fr: 'eBird n’a pas encore été lu : la première lecture est en cours.',
    de: 'eBird wurde noch nicht abgefragt: Die erste Abfrage läuft.',
    es: 'eBird aún no se ha leído: la primera lectura está en curso.',
  },

  // check button
  checkLine: {
    en: '{house} ({position}): {species} species and {notable} notable reports within {radius} over {days} days.',
    fr: '{house} ({position}) : {species} espèces et {notable} observations remarquables à moins de {radius} en {days} jours.',
    de: '{house} ({position}): {species} Arten und {notable} besondere Meldungen im Umkreis von {radius} in {days} Tagen.',
    es: '{house} ({position}): {species} especies y {notable} observaciones notables a menos de {radius} en {days} días.',
  },
  checkWatched: {
    en: '{species}: nearest report {distance}, {date}.',
    fr: '{species} : observation la plus proche à {distance}, le {date}.',
    de: '{species}: nächste Meldung in {distance}, am {date}.',
    es: '{species}: observación más cercana a {distance}, el {date}.',
  },
  checkWatchedNone: {
    en: '{species}: no report within 50 km.',
    fr: '{species} : aucune observation à moins de 50 km.',
    de: '{species}: keine Meldung im Umkreis von 50 km.',
    es: '{species}: ninguna observación a menos de 50 km.',
  },

  // widgets
  tileSpecies: { en: 'Species', fr: 'Espèces', de: 'Arten', es: 'Especies' },
  tileNotable: { en: 'Notable', fr: 'Remarquables', de: 'Besondere', es: 'Notables' },
  tileDays: { en: 'Days', fr: 'Jours', de: 'Tage', es: 'Días' },
  attribution: {
    en: 'Data: eBird.org, Cornell Lab of Ornithology',
    fr: 'Données : eBird.org, Cornell Lab of Ornithology',
    de: 'Daten: eBird.org, Cornell Lab of Ornithology',
    es: 'Datos: eBird.org, Cornell Lab of Ornithology',
  },
  buttonExplore: {
    en: 'Explore eBird',
    fr: 'Explorer eBird',
    de: 'eBird erkunden',
    es: 'Explorar eBird',
  },
  noNotable: {
    en: 'No notable report within {radius} over the last {days} days.',
    fr: 'Aucune observation remarquable à moins de {radius} ces {days} derniers jours.',
    de: 'Keine besondere Meldung im Umkreis von {radius} in den letzten {days} Tagen.',
    es: 'Ninguna observación notable a menos de {radius} en los últimos {days} días.',
  },
  noSpecies: {
    en: 'No report within {radius} over the last {days} days.',
    fr: 'Aucune observation à moins de {radius} ces {days} derniers jours.',
    de: 'Keine Meldung im Umkreis von {radius} in den letzten {days} Tagen.',
    es: 'Ninguna observación a menos de {radius} en los últimos {days} días.',
  },
  noWatched: {
    en: 'No species to watch yet: type them in the configuration of the integration (common name, scientific name or eBird code).',
    fr: 'Aucune espèce suivie pour l’instant : tapez-les dans la configuration de l’intégration (nom commun, nom scientifique ou code eBird).',
    de: 'Noch keine beobachteten Arten: Gib sie in der Konfiguration der Integration ein (deutscher oder wissenschaftlicher Name oder eBird-Code).',
    es: 'Todavía no hay especies seguidas: escríbalas en la configuración de la integración (nombre común, científico o código de eBird).',
  },
  badgeConfirmed: { en: 'Confirmed', fr: 'Confirmée', de: 'Bestätigt', es: 'Confirmada' },
  badgeUnreviewed: { en: 'Unreviewed', fr: 'À vérifier', de: 'Ungeprüft', es: 'Sin revisar' },
  badgeCount: { en: '× {count}', fr: '× {count}', de: '× {count}', es: '× {count}' },
  reports: {
    en: '{count} report(s) over the last {days} days. Latest: {place}, {distance}.',
    fr: '{count} signalement(s) ces {days} derniers jours. Le plus récent : {place}, {distance}.',
    de: '{count} Meldung(en) in den letzten {days} Tagen. Zuletzt: {place}, {distance}.',
    es: '{count} aviso(s) en los últimos {days} días. El más reciente: {place}, {distance}.',
  },
  linkChecklist: {
    en: 'Checklist on eBird',
    fr: 'Liste sur eBird',
    de: 'Liste auf eBird',
    es: 'Lista en eBird',
  },
  linkSpecies: {
    en: 'Species on eBird',
    fr: 'Espèce sur eBird',
    de: 'Art auf eBird',
    es: 'Especie en eBird',
  },
  watchedNear: {
    en: '{distance} · {ago}',
    fr: '{distance} · {ago}',
    de: '{distance} · {ago}',
    es: '{distance} · {ago}',
  },
  watchedNone: {
    en: 'Not reported',
    fr: 'Pas signalée',
    de: 'Nicht gemeldet',
    es: 'Sin avisos',
  },
  watchedUnknown: {
    en: 'Unknown species',
    fr: 'Espèce inconnue',
    de: 'Unbekannte Art',
    es: 'Especie desconocida',
  },
  today: { en: 'today', fr: 'aujourd’hui', de: 'heute', es: 'hoy' },
  yesterday: { en: 'yesterday', fr: 'hier', de: 'gestern', es: 'ayer' },
  daysAgo: {
    en: '{n} days ago',
    fr: 'il y a {n} j',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description "today", "yesterday", "3 days ago".
 * @param {number} days - Days ago.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function agoText(days, language) {
  if (days <= 0) {
    return t('today', language);
  }
  if (days === 1) {
    return t('yesterday', language);
  }
  return t('daysAgo', language, { n: days });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, agoText };
