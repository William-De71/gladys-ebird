// -----------------------------------------------------------------------------
// Numbers shown to the user, in their language.
// -----------------------------------------------------------------------------

const LOCALES = ['en', 'fr', 'de', 'es'];

/**
 * @description A distance: "850 m", "3.2 km" / "3,2 km", "18 km".
 * @param {number|null} km - Kilometers.
 * @param {string} language - The language.
 * @returns {string} The text, '' when unknown.
 */
function formatKm(km, language) {
  if (!Number.isFinite(km)) {
    return '';
  }
  const locale = LOCALES.includes(language) ? language : 'en';
  if (km < 1) {
    return `${Math.max(100, Math.round(km * 10) * 100)} m`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}

export { formatKm };
