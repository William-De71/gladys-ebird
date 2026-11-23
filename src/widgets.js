// -----------------------------------------------------------------------------
// Dashboard widgets of the eBird integration.
//
//   - `nearby`   the birds reported around the house: species and notable
//                reports (tiles), the most recent species (card list: name,
//                place and distance, date, how many);
//   - `notable`  the notable reports (rare species, out of season), one card
//                per species: place, distance, date, reviewed or not, how
//                many reports, a link to the checklist on eBird;
//   - `watched`  the watched species: nearest recent report and when (status).
//
// eBird asks to credit its data: every widget ends with the attribution
// caption. Species names come in the language of the dashboard (taxonomy.js).
// Budget of a card: 8 components, 1 main one, 6 tiles, 2 texts, 1 status,
// 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, agoText } from './i18n.js';
import { formatKm } from './format.js';
import { checklistUrl, notableBySpecies } from './observations.js';
import { daysBetween, formatObsDate, localDate } from './time.js';

const WIDGETS = { NEARBY: 'nearby', NOTABLE: 'notable', WATCHED: 'watched' };
const TTL_SECONDS = 600;
const EXPLORE_URL = 'https://ebird.org/explore';
const MAX_ITEMS = 8;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget that only says something.
 * @param {string} text - The message.
 * @param {number} [ttl] - Seconds before Gladys asks again.
 * @returns {object} The content.
 */
function messageContent(text, ttl = 60) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(text, 300) }],
  };
}

const attribution = (language) => ({
  type: 'text',
  variant: 'caption',
  text: clip(t('attribution', language), 80),
});

/**
 * @description "Parc de la Tête d'Or · 3.2 km · 20 Nov 08:14". The date is in
 * the subtitle: in a card list, the `date` field of an item replaces the
 * subtitle, and the place matters more.
 * @param {object} observation - A parsed observation.
 * @param {string} language - The language.
 * @returns {string} The subtitle.
 */
const whereText = (observation, language) =>
  [
    observation.place,
    formatKm(observation.distanceKm, language),
    formatObsDate(observation.date, observation.time, language),
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * @description The "Birds nearby" widget.
 * @param {object} options - `{ snapshot, nameOf, language }`.
 * @returns {object} The content.
 */
function buildNearbyWidget({ snapshot, nameOf, language }) {
  const components = [
    {
      type: 'value',
      label: t('tileSpecies', language),
      value: snapshot.speciesCount,
      icon: 'feather',
      color: WIDGET_COLORS.PRIMARY,
    },
    {
      type: 'value',
      label: t('tileNotable', language),
      value: snapshot.notableSpecies,
      icon: 'star',
      color: snapshot.notableSpecies > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      label: t('tileDays', language),
      value: snapshot.days,
      icon: 'calendar',
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  const radius = formatKm(snapshot.radiusKm, language);
  if (snapshot.species.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: clip(t('noSpecies', language, { radius, days: snapshot.days }), 300),
    });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: snapshot.species.slice(0, MAX_ITEMS).map((observation) => {
        const item = {
          title: clip(nameOf(observation.code, observation.name, language), 60),
          subtitle: clip(whereText(observation, language), 120),
        };
        if (observation.count) {
          item.badge = {
            text: clip(t('badgeCount', language, { count: observation.count }), 16),
            color: WIDGET_COLORS.INFO,
          };
        }
        return item;
      }),
    });
  }
  components.push(attribution(language), {
    type: 'button',
    label: t('buttonExplore', language),
    icon: 'external-link',
    style: 'secondary',
    link: { url: EXPLORE_URL },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The "Rare birds" widget.
 * @param {object} options - `{ snapshot, nameOf, language }`.
 * @returns {object} The content.
 */
function buildNotableWidget({ snapshot, nameOf, language }) {
  const radius = formatKm(snapshot.radiusKm, language);
  const groups = notableBySpecies(snapshot);
  if (groups.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: clip(t('noNotable', language, { radius, days: snapshot.days }), 300),
        },
        attribution(language),
      ],
    };
  }
  const items = groups.slice(0, MAX_ITEMS).map(({ observation, reports }) => {
    const confirmed = observation.reviewed && observation.valid;
    const links = [
      { url: `https://ebird.org/species/${observation.code}`, label: t('linkSpecies', language) },
    ];
    const checklist = checklistUrl(observation);
    if (checklist) {
      links.unshift({ url: checklist, label: t('linkChecklist', language) });
    }
    return {
      title: clip(nameOf(observation.code, observation.name, language), 60),
      subtitle: clip(whereText(observation, language), 120),
      badge: {
        text: clip(t(confirmed ? 'badgeConfirmed' : 'badgeUnreviewed', language), 16),
        color: confirmed ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
      },
      description: clip(
        t('reports', language, {
          count: reports,
          days: snapshot.days,
          place: observation.place,
          distance: formatKm(observation.distanceKm, language),
        }),
        2000,
      ),
      links,
    };
  });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [{ type: 'card-list', display: 'list', items }, attribution(language)],
  };
}

/**
 * @description The "Watched species" widget.
 * @param {object} options - `{ snapshot, nameOf, language, now, timeZone }`.
 * @returns {object} The content.
 */
function buildWatchedWidget({ snapshot, nameOf, language, now, timeZone }) {
  if (snapshot.watched.length === 0) {
    return messageContent(t('noWatched', language), TTL_SECONDS);
  }
  const today = localDate(now, timeZone);
  const items = snapshot.watched.slice(0, 10).map((entry) => {
    const label = clip(entry.code ? nameOf(entry.code, entry.typed, language) : entry.typed, 40);
    if (!entry.code) {
      return { label, value: t('watchedUnknown', language), color: WIDGET_COLORS.DANGER };
    }
    if (!entry.nearest) {
      return { label, value: t('watchedNone', language), color: WIDGET_COLORS.NEUTRAL };
    }
    return {
      label,
      value: clip(
        t('watchedNear', language, {
          distance: formatKm(entry.nearest.distanceKm, language),
          ago: agoText(Math.max(0, daysBetween(entry.nearest.date, today)), language),
        }),
        40,
      ),
      color: entry.near ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.INFO,
    };
  });
  return {
    ttl_seconds: TTL_SECONDS,
    components: [{ type: 'status', items }, attribution(language)],
  };
}

export {
  WIDGETS,
  TTL_SECONDS,
  EXPLORE_URL,
  messageContent,
  buildNearbyWidget,
  buildNotableWidget,
  buildWatchedWidget,
};
