# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- **devices:** the birds around a house of Gladys from eBird (species reported, notable reports, the last one) and one device per watched species (reported nearby, nearest report in km, days since), with the free personal eBird API key of the user
- **species:** watched species typed by common name in English, French, German or Spanish, scientific name or eBird code, found in the eBird taxonomy (kept in /data, read again monthly)
- **scenes:** triggers when a rare bird is reported nearby and when a watched species is back nearby (once each, a restart never fires twice); action "where was a species seen?" with the nearest report within 50 km
- **widgets:** birds nearby, rare birds (reviewed or not, links to the checklists), watched species; names in the language of the dashboard, eBird credited
- **configuration:** house, radius (1 to 50 km), days back (1 to 30), reading every 30 min to 3 h, language of the texts, "Read eBird now" button
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-ebird/releases/tag/v0.1.0
