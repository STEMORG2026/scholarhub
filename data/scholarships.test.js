import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import scholarships from './scholarships.json' with { type: 'json' };

const ids = scholarships.map((entry) => entry.id);

// Values that deliberately render as a generic globe instead of a flag, because
// they name a region or a grouping rather than one country. Adding to this list
// is a decision; forgetting to add a flag is a bug. The test below cannot tell
// the two apart, so it makes the author say which one they meant.
const GLOBE_ONLY = new Set(['Multiple countries']);

// Read the hand-written FLAG map straight out of the component. It is the one
// place in this repo where a country value is keyed by hand rather than derived
// from the catalog, so it is the one place a new record can render wrong while
// every other check stays green.
const mainSource = readFileSync(join(import.meta.dirname, '..', 'src', 'main.jsx'), 'utf-8');

function readFlagKeys(source) {
  const match = source.match(/const\s+FLAG\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(match, 'could not find the FLAG map in src/main.jsx — did it move or get renamed?');
  return new Set(
    [...match[1].matchAll(/(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g)].map(
      (m) => m[1] ?? m[2] ?? m[3],
    ),
  );
}

test('catalog has stable unique IDs', () => {
  assert.ok(scholarships.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('every country in the catalog has a flag in the component', () => {
  const flags = readFlagKeys(mainSource);
  assert.ok(flags.size >= 10, 'parsed suspiciously few flag keys: ' + flags.size);

  const missing = [...new Set(scholarships.map((entry) => entry.country))]
    .filter((country) => !flags.has(country) && !GLOBE_ONLY.has(country))
    .sort();

  assert.deepEqual(
    missing,
    [],
    'these catalog countries have no FLAG entry in src/main.jsx and would render a ' +
      'generic globe instead of a flag: ' +
      missing.join(', ') +
      ' — add each to FLAG, or to GLOBE_ONLY in this test if the globe is intended',
  );
});

test('records include core display and official source fields', () => {
  for (const entry of scholarships) {
    for (const key of ['name', 'provider', 'country', 'university', 'program_field', 'degree_level', 'eligibility', 'official_url']) {
      assert.ok(entry[key] !== undefined && entry[key] !== '', `${entry.id} missing ${key}`);
    }
    assert.ok(Array.isArray(entry.program_field));
    assert.ok(Array.isArray(entry.degree_level));
    assert.match(entry.official_url, /^https:\/\//);
    assert.ok(['open', 'closed', 'upcoming', 'verify'].includes(entry.status));
    if (entry.deadline !== null) assert.match(entry.deadline, /^\d{4}-\d{2}-\d{2}$/);
  }
});
