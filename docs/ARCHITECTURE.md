# Architecture

ScholarHub is a static browser application. Vite builds React UI and imports the JSON catalog at build time. There is no application server, database, authentication, or shared user store.

```text
index.html → src/main.jsx ─┬→ data/scholarships.json   (records, incl. nationality_scope)
                           ├→ src/countries.js  → data/countries.json  (names + ISO codes)
                           ├→ src/eligibility.js → per-country verdict
                           └→ localStorage (profile, saved IDs, theme)
```

## Boundaries

- **Catalog:** versioned-by-convention JSON is reviewed and maintained by contributors; imported statically. A later country-file loader can preserve the record schema.
- **Country data:** `data/countries.json` is the one source of truth for country names. It holds two name spaces — `countries` (real countries and territories, each with an ISO 3166-1 alpha-2 code) and `groupings` (destinations that name a region, such as `Europe`). A grouping is a valid destination but never a valid nationality.
- **Country helpers:** `src/countries.js` derives everything the UI needs from that file, by loop, at module load — the country list for the picker, the destination set, and the flag for a country, computed from its code as regional indicator symbols. There is deliberately **no hand-written per-country flag table**: such a table fails silently (a missing country renders a generic globe), which is why flags are derived rather than stored.
- **Eligibility:** `src/eligibility.js` turns a record's `nationality_scope` and a chosen country into one of four verdicts. It is a pure function, kept out of the component so the six modes can be unit-tested. Two modes (`all`, `listed`) are answerable from the data; the other four (`listed_elsewhere`, `regional`, `agreement`, `unstated`) return **check**, because guessing them would tell a reader they are eligible when the source does not say so.
- **Presentation:** `src/main.jsx` contains views, filtering, local state, and detail dialog; `src/styles.css` owns responsive styling and light/dark theme. Deadline rendering is provenance-aware: a date is shown only when the record carries one, and always next to the date the source was last checked. A record's `country_notes` entry is rendered only when the reader has selected that country.
- **Personalization:** simple deterministic profile-fit percentage. It is a sorting/discovery hint, not AI and not an eligibility conclusion — but a programme the reader is not eligible for is scored down rather than recommended.
- **Assistant:** currently an offline explanatory starter which can suggest catalog matches and report how many are open to the reader's country. It does not perform inference or contact an external service.
- **Provider seam:** AI settings separate provider choice from discovery UI, but connection adapters are not implemented. Any future adapter must be explicit, direct from browser, disclose provider processing and never send profile information without a clear user action. Keys must not be stored in a server or repository.

## State and privacy

`scholarhub` uses browser localStorage keys `sh-saved`, `sh-profile`, and `sh-dark`. Data stays in that browser profile unless a future opt-in integration sends prompt data to a provider. There is no sync, cross-device backup, or account recovery. Users can clear browser storage to remove the profile and shortlist.

The chosen country of origin lives in `sh-profile` and is never sent anywhere; the eligibility verdicts are computed in the browser from the static catalog.

## Deployment

`npm run build` emits static files to `dist/`; deploy that folder. For a non-root URL, configure Vite's base path. Fonts load from Google Fonts when network access is available; system fallbacks are declared.

## Known limitations

- Starter catalog is incomplete (50 records) and does not meet the requested 15–25 verified records per country/region. Broader Europe is the only region at the target, and only at its lower bound (15); China holds 5, New Zealand and the United States 4 each, and Brazil, Canada, Japan, South Korea, India and Saudi Arabia were opened with one record each. **Phase 2's last region, Africa, opened in v0.22.0** with the Pan African University scholarship, which spans four institutes in Kenya, Nigeria, Cameroon and Algeria — so it is recorded under `Multiple countries` rather than a single destination. Most records are discovery leads, not confirmed open awards.
- **Eligibility is answered for two of the six modes.** `all` and `listed` give a definitive verdict; `regional`, `listed_elsewhere`, `agreement` and `unstated` report **check** with what to look up. Resolving `regional` properly needs a country→region mapping sourced from each provider's own list — a provider's "Indo-Pacific" is not a continent, and inventing a mapping from general knowledge would put unverified data into a provenance-first catalog. That is the next step, not a shortcut.
- Deadlines are recorded only where an official page publishes a single closing date (currently seven records). Cycles that are a window, field-split, or country-specific carry `deadline_notes` instead. Comparable award amounts, acceptance rates, and applicant counts are not maintained. No popularity counter, geolocation ranking, reminders, roadmap export, or document-checklist generator is implemented.
- Link liveness is not part of `npm test`. Run `npm run check:links` (needs the network). It can only prove that a URL resolves — never that the page still says what the record claims.
- Below 850px the sidebar collapses to an icon-only rail. There is no slide-out drawer.
- Accessibility: contrast is measured to WCAG AA in both themes, and visible focus, dialog keyboard handling (focus trap, Escape, focus restore), labelled controls and live regions are in place. A `prefers-reduced-motion` guard is in place and verified by emulating the media query (40 perceptible transitions → 0). The app contains no `@keyframes` and no `animation` property, so the guard covers the hover transitions and anything added later rather than an existing animation. A screen-reader pass with real assistive technology is not yet done.
- The eligibility badge carries its reason in a `title` attribute and repeats it in the detail dialog; the reason is not yet exposed as screen-reader text on the card itself.
- AI provider adapters, model test, API key handling, cloud model calls, local model runtimes, and cost estimates are not implemented.
- Content status may be `verify`; official pages are authoritative and may change independently.
