# Architecture

ScholarHub is a static browser application. Vite builds React UI and imports the JSON catalog at build time. There is no application server, database, authentication, or shared user store.

```text
index.html → src/main.jsx → static data/scholarships.json
                       ↘ localStorage (profile, saved IDs, theme)
```

## Boundaries

- **Catalog:** versioned-by-convention JSON is reviewed and maintained by contributors; imported statically. A later country-file loader can preserve the record schema.
- **Presentation:** `src/main.jsx` contains views, filtering, local state, and detail dialog; `src/styles.css` owns responsive styling and light/dark theme. Deadline rendering is provenance-aware: a date is shown only when the record carries one, and always next to the date the source was last checked.
- **Personalization:** simple deterministic profile-fit percentage. It is a sorting/discovery hint, not AI and not an eligibility conclusion.
- **Assistant:** currently an offline explanatory starter which can suggest catalog matches. It does not perform inference or contact an external service.
- **Provider seam:** AI settings separate provider choice from discovery UI, but connection adapters are not implemented. Any future adapter must be explicit, direct from browser, disclose provider processing and never send profile information without a clear user action. Keys must not be stored in a server or repository.

## State and privacy

`scholarhub` uses browser localStorage keys `sh-saved`, `sh-profile`, and `sh-dark`. Data stays in that browser profile unless a future opt-in integration sends prompt data to a provider. There is no sync, cross-device backup, or account recovery. Users can clear browser storage to remove the profile and shortlist.

## Deployment

`npm run build` emits static files to `dist/`; deploy that folder. For a non-root URL, configure Vite's base path. Fonts load from Google Fonts when network access is available; system fallbacks are declared.

## Known limitations

- Starter catalog is incomplete (40 records) and does not meet the requested 15–25 verified records per country/region. Broader Europe is the only region at the target, and only at its lower bound (15). Most records are discovery leads, not confirmed open awards.
- Deadlines are recorded only where an official page publishes a single closing date (currently six records). Cycles that are a window, field-split, or country-specific carry `deadline_notes` instead. Comparable award amounts, acceptance rates, and applicant counts are not maintained. No popularity counter, geolocation ranking, reminders, roadmap export, or eligibility calculation is implemented.
- Link liveness is not part of `npm test`. Run `npm run check:links` (needs the network). It can only prove that a URL resolves — never that the page still says what the record claims.
- Below 850px the sidebar collapses to an icon-only rail. There is no slide-out drawer.
- Accessibility: contrast is measured to WCAG AA in both themes, and visible focus, dialog keyboard handling (focus trap, Escape, focus restore), labelled controls and live regions are in place. A screen-reader pass with real assistive technology and a `prefers-reduced-motion` guard are not yet done.
- AI provider adapters, model test, API key handling, cloud model calls, local model runtimes, and cost estimates are not implemented.
- Content status may be `verify`; official pages are authoritative and may change independently.
