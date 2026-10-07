// Country helpers derived from data/countries.json.
//
// Nothing here is a hand-written per-country table. Each country carries its
// ISO 3166-1 alpha-2 code, and the flag is computed from that code as a pair of
// regional indicator symbols. Adding a country is therefore a one-place change:
// there is no second table to forget, which is what used to let a new country
// render as a generic globe while every check stayed green.
//
// The same file also drives the country picker and the eligibility verdicts, so
// the UI, the validator and the tests all read one list.
import data from '../data/countries.json' with { type: 'json' };

const REGIONAL_INDICATOR_A = 0x1f1e6; // 🇦
const LETTER_A = 65; // 'A'

/** The flag emoji for an ISO 3166-1 alpha-2 code, or null if it is not one. */
export function flagFromCode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => REGIONAL_INDICATOR_A + c.charCodeAt(0) - LETTER_A),
  );
}

// Built once, by loop, from the data file.
const BY_NAME = new Map();
for (const country of data.countries) BY_NAME.set(country.name, { kind: 'country', ...country });
for (const grouping of data.groupings) BY_NAME.set(grouping.name, { kind: 'grouping', ...grouping });

/** Every name a person may hold as a country of origin. */
export const COUNTRY_NAMES = data.countries.map((country) => country.name);

/** Every name the catalog may use as a destination, groupings included. */
export const DESTINATION_NAMES = [
  ...COUNTRY_NAMES,
  ...data.groupings.map((grouping) => grouping.name),
];

/** The ISO code for a country, or null for a grouping or an unknown name. */
export function codeFor(name) {
  const entry = BY_NAME.get(name);
  return entry && entry.kind === 'country' ? entry.code : null;
}

/**
 * A flag emoji for any name the app can render, or null to fall back to a
 * globe. A grouping carries a flag only when it declares one, because a
 * regional grouping is not the same set as any single flag.
 */
export function flagFor(name) {
  const entry = BY_NAME.get(name);
  if (!entry) return null;
  return entry.kind === 'country' ? flagFromCode(entry.code) : entry.flag || null;
}

/** True when the name is a real country or territory rather than a grouping. */
export function isCountry(name) {
  return BY_NAME.get(name)?.kind === 'country';
}

/** True when the app knows this destination, country or grouping. */
export function isKnownDestination(name) {
  return BY_NAME.has(name);
}
