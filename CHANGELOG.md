# Changelog

## [0.4.0] - 2026-10-07

### Added

Three records, taking the catalog from 19 to 22 and giving China four entries, the joint-most with broader Europe:

- **JJ/WBGSP** — Joint Japan/World Bank Graduate Scholarship Program. Open to developing-country nationals, with infrastructure management named as one of its key development areas. Study is at 44 participating master's programmes across 24 universities in the U.S., Europe, Africa, Oceania and Japan.
- **Tongji University scholarships for international students** — Chinese Government Scholarship streams (Bilateral, Silk Road, High Level Postgraduate), the Shanghai Municipal Government Scholarship, and university-specific awards.
- **HIT International Students Scholarship** — Harbin Institute of Technology; a tuition-fee waiver only, awarded in tiers of 100%, 50%, 30% or 20%, with no living stipend.

### Changed

- `country` now accepts **"Multiple countries"**, used by JJ/WBGSP because its participating programmes span five continents. Labelling it "United States" would have implied study in the US, which the programme does not guarantee.

### Notes

- **Hubert H. Humphrey Fellowship excluded:** it is explicitly a *non-degree* programme, and the `degree_level` enum covers only Bachelor/Master/PhD/PostDoc. Adding it needs a schema change, not a data change.
- **CAS-TWAS President's Fellowship excluded:** the official UCAS page still displays the **2017** call (age limit "on 31 December 2017", deadline "31 MARCH 2017"). A nine-year-stale page is not a valid `source_url`.
- USA coverage grows more slowly than China or Europe because most US graduate funding is restricted to US citizens or permanent residents. JJ/WBGSP is one of the few routes that sends developing-country nationals to US universities.

## [0.3.0] - 2026-10-07

### Added

Five records, taking the catalog from 14 to 19 and adding Sweden, which had no coverage despite being named in the Phase 1 scope:

- **RESCO** — Erasmus Mundus Joint Master in Renewable Energy and Sustainable Construction (Hungary, Spain, Portugal, France).
- **TERRA** — European Master in Earthen Architecture and Construction (Portugal, Spain, France, Italy); first edition in the 2026/2027 academic year.
- **BIOPHAM** — Erasmus Mundus Joint Master in Bio & Pharmaceutical Materials Science.
- **TFMASA** — International Master in Transfers-Fluids-Materials for Aeronautics Sustainable Applications (France, Belgium, Germany).
- **SI Scholarship for Global Professionals** — Swedish Institute; fully funded, restricted to 34 listed countries.

Each carries a `source_url` and a `last_verified` date, plus `deadline_notes` where the cycle has no single closing date.

### Changed

- Card chips now distinguish a verified closing date from "Dates in detail", so a record with window or field-split dates is visible without implying one deadline.
- Added the Sweden flag to the destination icons.

### Notes

- One candidate was deliberately **excluded**: Erasmus Mundus STEPS (Sustainable Transportation and Electric Power Systems) describes itself as "a highly specialized education in Electrical Engineering". Adding it would have meant mislabelling it as Civil Engineering or Materials Science, which the data rules forbid.

## [0.2.0] - 2026-10-07

### Added

- `deadline_notes` schema field, for cycles that have no single closing date (an application window, field-split deadlines, or a country-specific rule).
- `npm run check:links` — a link-liveness probe over every `official_url`, `application_url`, and `source_url`. It fails the run on a `404`/`410`; `401`/`403`/`405`/`429` are reported as **blocked** rather than dead, because many government and university sites refuse automated requests.
- Deadline and "source last checked" rendering in both the card and the detail dialog, with an explicit "not maintained" fallback when no date is recorded.
- `--catalog=<path>` option on the validator, so the checks can be exercised against fixtures.

### Changed

- All 14 catalog records now carry a `source_url` and a `last_verified` date. Catalog warnings fell from 40 to 5.
- Award amounts and benefit lists refreshed from the official pages (NSF GRFP, Eiffel, NL Scholarship, ETH ESOP, Australia Awards, Melbourne Graduate Research).
- Statuses set from verified pages where the cycle state is unambiguous (Chevening, ETH ESOP, Melbourne, NSF GRFP).
- The hero destination count is derived from the catalog instead of hardcoded.
- Validator now rejects a record whose `deadline` has no `last_verified`, or whose `deadline` sits behind `status: "verify"`.

### Fixed

- Two dead official links: the Tsinghua financial-aid page and the University of Canterbury first-year scholarship page both returned `404`. Both now point at the current pages.
- The offline assistant guide printed the user's question twice.
- Removed the mobile menu button, which was `display:none` in every media query and therefore did nothing.

## [0.1.0] - 2026-09-25

- Initial static ScholarHub app: discovery filters, details, local profile, shortlist, dark mode, and offline assistant guide.
- Added 14 starter scholarship discovery records with official program links.
- Added data/contribution and architecture documentation.
- Clearly documented incomplete country coverage and unimplemented AI/provider features.
