# Scholarship data schema (v1)

The catalog is static JSON consumed in the browser. A scholarship entry is a record with a stable `id`; each source may have multiple awards/cycles, but avoid combining different rules into one record when that hides eligibility differences.

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique stable kebab-case identifier. |
| `name`, `provider`, `country` | string | Public display names. |
| `region`, `city`, `university` | string | Use `Various`/`Multiple` when institution/location varies; avoid pretending there is one host. |
| `program_field` | string[] | Controlled labels used by filters. |
| `degree_level` | string[] | `Bachelor`, `Master`, `PhD`, `PostDoc`. |
| `funding_type`, `amount`, `currency` | string | Describe limits/conditions; don't infer a cash value from a benefit list. Currency uses ISO-style code where a numeric amount exists. |
| `deadline` | `YYYY-MM-DD` or `null` | A single published closing date. `null` means unknown, cycle-dependent, or split by field/country — do not invent a date to fill the gap. If set, `last_verified` is required and `status` must not be `verify`. |
| `deadline_notes` (optional) | string | Use when the cycle has no single date: an application window, field-split deadlines, or a country-specific rule. Prefer this over forcing a misleading `deadline`. Omit the field rather than leaving it empty. |
| `duration` | string | Award/course terms as published. |
| `eligibility` | object | `nationality` list, `gpa_minimum` number or null, `language_requirements` map, `age_limit` number/string/null, `other` string. |
| `benefits` | string[] | Explicitly qualified if contingent. |
| `application_url`, `official_url` | URL string | Official provider pages only where possible. |
| `description` | string | Brief, factual and non-promissory. |
| `tags` | string[] | Lowercase descriptive facets; don't use tags as eligibility. |
| `last_updated` | `YYYY-MM-DD` | Date catalog text last edited. |
| `status` | string | `open`, `closed`, `upcoming`, or `verify`. `verify` is used when current cycle status is unknown. |
| `source_url` (recommended) | URL string | Direct authoritative source used for this record. |
| `last_verified` (recommended) | `YYYY-MM-DD` | Date a contributor checked the official source. |

`status` describes the record's cycle state, not a guarantee that an award is open to you. When `deadline` is set the application displays the date together with the date the source was last checked; when `deadline` is `null` the app shows an explicit "not maintained — check official source" reminder instead. A date is only ever recorded from an official page a contributor actually read, and `last_verified` records when that happened.

## Automated checks

```sh
npm test                  # schema, IDs, dates, and required fields — offline, deterministic
npm run check:links       # also fetches every official_url/application_url/source_url
```

`npm test` validates shape only: it cannot tell whether an official link still resolves. `npm run check:links` adds a liveness probe and fails the run on a `404`/`410`. It is opt-in because it needs the network. Responses of `401`/`403`/`405`/`429` are reported as **blocked** rather than dead, because many government and university sites refuse automated requests — a blocked link is unverified, not broken.

## Data quality

- Never infer an award amount, close date, eligibility or guarantee from a program's name.
- Award terms often vary by citizenship, course, year, host institution, or nomination route; state that variance.
- Preserve official naming and link the current authoritative page. Avoid search-result URLs and aggregators.
- Records are human-reviewed proposals; automated extraction is not canonical.

See [`scholarship.template.json`](scholarship.template.json) for a starter record.
