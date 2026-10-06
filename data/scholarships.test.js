import test from 'node:test';
import assert from 'node:assert/strict';
import scholarships from './scholarships.json' with { type: 'json' };

const ids = scholarships.map((entry) => entry.id);

test('catalog has stable unique IDs', () => {
  assert.ok(scholarships.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
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
