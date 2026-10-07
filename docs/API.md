# Application interface notes

ScholarHub has no network API in this release. The application is a static client-side site.

## Data interface

The UI imports `data/scholarships.json` as an array of scholarship records. Refer to [`DATA-SCHEMA.md`](DATA-SCHEMA.md). Searches, filters, detail views, profile-fit hints, and saved-list rendering run locally.

## Browser storage

| Key | Contents |
|---|---|
| `sh-saved` | JSON array of scholarship `id` strings |
| `sh-profile` | JSON object containing selected field/degree and optional user-entered preferences |
| `sh-tracker` | JSON object mapping scholarship `id` → `{status, addedAt}` for tracked applications |
| `sh-docs` | JSON array of document `id` strings the reader has marked present |
| `sh-dark` | JSON boolean |

Storage is device/browser-specific and not encrypted by the application. Avoid storing sensitive information on shared devices. Every key is read back defensively — an unrecognised status is treated as the default and an unrecognised document id is ignored, so a stale or hand-edited value cannot invent state.

## Future AI adapter contract (not implemented)

A future provider adapter should expose a user-selected model and explicit request function, accept only the prompt context the user chose to share, return text plus provider/model metadata, and report connection failures without leaking keys. Provider credentials should be session-only by default. Do not claim model output is authoritative or use it as a substitute for official award terms.
