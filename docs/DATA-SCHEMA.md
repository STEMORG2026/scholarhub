# Scholarship data schema (v1)

The catalog is static JSON consumed in the browser. A scholarship entry is a record with a stable `id`; each source may have multiple awards/cycles, but avoid combining different rules into one record when that hides eligibility differences.

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique stable kebab-case identifier. |
| `name`, `provider`, `country` | string | Public display names. `country` must be a name in `data/countries.json` (a country **or** a grouping). |
| `region`, `city`, `university` | string | Use `Various`/`Multiple` when institution/location varies; avoid pretending there is one host. |
| `program_field` | string[] | Controlled labels used by filters. |
| `degree_level` | string[] | `Bachelor`, `Master`, `PhD`, `PostDoc`, `Non-degree`. `Non-degree` covers short courses, cohort training and professional fellowships that award a certificate rather than a degree. |
| `funding_type`, `amount`, `currency` | string | Describe limits/conditions; don't infer a cash value from a benefit list. Currency uses ISO-style code where a numeric amount exists. |
| `deadline` | `YYYY-MM-DD` or `null` | A single published closing date. `null` means unknown, cycle-dependent, or split by field/country — do not invent a date to fill the gap. If set, `last_verified` is required and `status` must not be `verify`. |
| `deadline_notes` (optional) | string | Use when the cycle has no single date: an application window, field-split deadlines, or a country-specific rule. Prefer this over forcing a misleading `deadline`. Omit the field rather than leaving it empty. |
| `duration` | string | Award/course terms as published. |
| `eligibility` | object | `nationality` list, `gpa_minimum` number or null, `language_requirements` map, `age_limit` number/string/null, `other` string. **Prose**, kept for provenance and nuance; machine-readable nationality rules live in `nationality_scope`. |
| `nationality_scope` | object | How the record answers "may someone from my country apply?". See [Nationality scope](#nationality-scope). |
| `country_notes` (optional) | object | Country name → a note that applies only to that country (quota, age cap, national deadline, exclusion). Omit rather than leaving it empty. |
| `benefits` | string[] | Explicitly qualified if contingent. |
| `application_url`, `official_url` | URL string | Official provider pages only where possible. |
| `description` | string | Brief, factual and non-promissory. |
| `tags` | string[] | Lowercase descriptive facets; don't use tags as eligibility. |
| `last_updated` | `YYYY-MM-DD` | Date catalog text last edited. |
| `status` | string | `open`, `closed`, `upcoming`, or `verify`. `verify` is used when current cycle status is unknown. |
| `source_url` (recommended) | URL string | Direct authoritative source used for this record. |
| `last_verified` (recommended) | `YYYY-MM-DD` | Date a contributor checked the official source. |

`status` describes the record's cycle state, not a guarantee that an award is open to you. When `deadline` is set the application displays the date together with the date the source was last checked; when `deadline` is `null` the app shows an explicit "not maintained — check official source" reminder instead. A date is only ever recorded from an official page a contributor actually read, and `last_verified` records when that happened.

## Nationality scope

Every record declares `nationality_scope`, so a reader can be told where they stand for their own country without the app guessing. `mode` is one of six values, and the distinction matters because **only two of them are answerable from the data**:

| `mode` | Meaning | Answerable? | Required fields |
|---|---|---|---|
| `all` | Open to any nationality. Host-country exclusions belong in `note`. | yes — open | `note` |
| `listed` | An enumerable list of eligible countries — or, when the rule is published as an exclusion, `excluded_countries`. | yes | one of `countries` or `excluded_countries` |
| `listed_elsewhere` | A list exists, but the provider publishes it. | no — **check** | `list_url` |
| `regional` | Restricted to a region or bloc. | no — **check** | `regions` |
| `agreement` | Decided country by country by bilateral arrangement. | no — **check** | — |
| `unstated` | The source does not state nationality rules. | no — **check** | — |

`unstated` is deliberately **not** rendered as "open to everyone". A silent default here would tell every visitor they are eligible, which is the one thing a tool like this must not do — so the four unanswerable modes render as **check**, naming what the reader has to look up. `all` requires a `note` so the claim is attributable to something a contributor actually read.

### Two shapes of list

A published list is either `countries` — who may apply — or `excluded_countries` — who may not. **Use the shape the source actually publishes.** A rule like "your nationality is non-EEA" is written as an exclusion, and expanding it into a 172-country complement would bury the rule and make it unreviewable. Use one or the other, never both, and never neither:

```json
// exclusion form — "nationality is non-EEA"
"nationality_scope": {
  "mode": "listed",
  "excluded_countries": ["Austria", "Belgium", "...30 in all"],
  "note": "The scheme states the criterion as 'Your nationality is non-EEA'."
}
```

`country_notes` exists so that a country-specific rule is not told to readers it does not apply to. A quota, an age cap or a national deadline belongs there rather than in `description`, `eligibility.nationality` or `benefits`; the general prose should read correctly for a reader from any country, and the app surfaces a country note only when that country is selected.

```json
"nationality_scope": {
  "mode": "listed",
  "countries": ["Bangladesh", "China", "India", "Thailand"],
  "note": "Edital nº 12/2025 lists 74 participating countries."
},
"country_notes": {
  "Nepal": "Nepal is not among the 74 participating countries, so a Nepali applicant cannot use this route."
}
```

## Where country names come from

`data/countries.json` is the single source of truth for both name spaces. The validator, the tests and the UI all read it rather than a copy:

```json
{
  "countries": [{ "name": "Nepal", "code": "NP" }],
  "groupings": [{ "name": "Europe" }]
}
```

- **`countries`** — real countries and territories, each with its ISO 3166-1 alpha-2 code. These are the only names a `nationality_scope.countries` list may use, and the only names the country picker offers.
- **`groupings`** — destinations that name a region or a set of countries (`Europe`, `Multiple countries`). A grouping may be a catalog destination but is **never** a valid nationality; the validator rejects it in a `countries` list.

**Flags are derived, never stored.** The flag for a country is computed from its code as a pair of regional indicator symbols (`src/countries.js`), so there is no per-country flag table to forget to update. Adding a country is a one-place change, and a country that would render a generic globe cannot pass the tests.

## Automated checks

```sh
npm test                  # schema, IDs, dates, required fields, nationality scope — offline, deterministic
npm run check:links       # also fetches every official_url/application_url/source_url
```

`npm test` validates shape only: it cannot tell whether an official link still resolves. `npm run check:links` adds a liveness probe and fails the run on a `404`/`410`. It is opt-in because it needs the network. Responses of `401`/`403`/`405`/`429` are reported as **blocked** rather than dead, because many government and university sites refuse automated requests — a blocked link is unverified, not broken.

The nationality-scope gate is checked against the data, not against a claim: `mode` must be one of the six; `listed` needs a non-empty `countries` array **or** a non-empty `excluded_countries` array, and not both; every member of either list must exist in `countries.json` and appear once; `regional` needs `regions`; `listed_elsewhere` needs an `https` `list_url`; `all` needs a `note`; and every `country_notes` key must be a real country with a non-empty note. Each of those assertions has been shown to fail.

## Data quality

- Never infer an award amount, close date, eligibility or guarantee from a program's name.
- Award terms often vary by citizenship, course, year, host institution, or nomination route; state that variance — and put the country-specific part in `country_notes` rather than in the general prose.
- Never widen a `nationality_scope`: `unstated` is not `all`, and a region is not a country list. If the source does not say, the record says so.
- Preserve official naming and link the current authoritative page. Avoid search-result URLs and aggregators.
- Records are human-reviewed proposals; automated extraction is not canonical.

See [`scholarship.template.json`](scholarship.template.json) for a starter record.
