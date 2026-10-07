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
| `sh-ai` | JSON object: `{providerId, baseUrl, model, rememberKey}` — the AI connection choice, never the key itself |
| `sh-ai-key` | JSON string. **Written only when the reader opts in.** Absent otherwise, in which case the key lives in memory for the tab. |
| `sh-dark` | JSON boolean |

Storage is device/browser-specific and not encrypted by the application. Avoid storing sensitive information on shared devices. Every key is read back defensively — an unrecognised status is treated as the default and an unrecognised document id is ignored, so a stale or hand-edited value cannot invent state.

## Provider interface (implemented, v0.26.0)

There is still **no network API owned by this project**, and there must not be one. The provider seam is a set of browser-side modules:

- `src/providers.js` — the registry: 21 providers, four categories, each with a transport, an auth kind, a default base URL and a model-list endpoint, plus a sourced frontier model seed.
- `src/chat.js` — pure request/response shaping for four transports (`openai`, `anthropic`, `google`, `ollama`), model-list normalisation, and error mapping. No `fetch`, no DOM.
- `src/useAi.js` — the only module that calls `fetch`. Requests go from the reader's browser directly to the provider they selected.

**Adding a provider** is a single entry in `PROVIDERS`. If it speaks an existing transport it needs no code. Auth is declared, not inferred: `api-key`, `none` (a local server), or `cli-session` (a local CLI login a browser cannot reach — Antigravity, which the UI explains rather than pretending to sign in).

**Model rosters are discovered at runtime.** Any provider with a `listModels` endpoint is queried and that answer replaces the seed. The seed exists only so the picker is not empty before a key is entered, and every entry carries the URL it came from and the date it was read; a value the source did not publish is `null`.

## Not implemented

Streaming replies, per-request cost accounting, model fallback, and any provider-specific SDK. The settings page says so on screen rather than leaving it to be discovered.
