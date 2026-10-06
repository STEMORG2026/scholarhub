#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogArg = process.argv.find((a) => a.startsWith('--catalog='));
const catalogPath = catalogArg
  ? resolve(catalogArg.slice('--catalog='.length))
  : join(__dirname, '..', 'data', 'scholarships.json');

// Link checking is opt-in: it needs the network and is therefore not part of the
// default offline run used by `npm test`.
const CHECK_LINKS = process.argv.includes('--links');
const LINK_TIMEOUT_MS = 15000;
const LINK_CONCURRENCY = 5;
const USER_AGENT = 'scholarhub-catalog-validator/1.0 (+https://github.com/Er-Sajan-PLG/scholarhub)';

const VALID_STATUSES = new Set(['open', 'closed', 'upcoming', 'verify']);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https:\/\//;
const REQUIRED_FIELDS = [
  'id', 'name', 'provider', 'country', 'university',
  'program_field', 'degree_level', 'eligibility', 'official_url',
  'description', 'status', 'last_updated'
];

// Statuses for the link probe. A dead official link is a hard failure: it is the
// one defect that silently makes a record useless.
const DEAD_STATUSES = new Set([404, 410]);
const BLOCKED_STATUSES = new Set([401, 403, 405, 406, 429]);

let errors = 0;
let warnings = 0;

function error(id, msg) {
  console.error('  ERROR [' + id + '] ' + msg);
  errors++;
}

function warn(id, msg) {
  console.warn('  WARN [' + id + '] ' + msg);
  warnings++;
}

console.log('Validating catalog: ' + catalogPath + '\n');

let scholarships;
try {
  const raw = readFileSync(catalogPath, 'utf-8');
  scholarships = JSON.parse(raw);
} catch (err) {
  console.error('Failed to read/parse catalog: ' + err.message);
  process.exit(1);
}

if (!Array.isArray(scholarships)) {
  console.error('Catalog root must be a JSON array.');
  process.exit(1);
}

console.log('Found ' + scholarships.length + ' records.\n');

const ids = scholarships.map(function(s) { return s.id; });
const uniqueIds = new Set(ids);
if (uniqueIds.size !== ids.length) {
  const dupes = ids.filter(function(id, i) { return ids.indexOf(id) !== i; });
  console.error('Duplicate IDs found: ' + Array.from(new Set(dupes)).join(', '));
  errors++;
}

for (const entry of scholarships) {
  const id = entry.id || 'missing-id';

  if (!ID_PATTERN.test(id)) {
    error(id, 'Invalid ID format (must be kebab-case alphanumeric)');
  }

  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      error(id, 'Missing required field: ' + field);
    }
  }

  if (!Array.isArray(entry.program_field)) error(id, 'program_field must be an array');
  if (!Array.isArray(entry.degree_level)) error(id, 'degree_level must be an array');
  if (entry.benefits && !Array.isArray(entry.benefits)) error(id, 'benefits must be an array');
  if (entry.tags && !Array.isArray(entry.tags)) error(id, 'tags must be an array');

  if (!VALID_STATUSES.has(entry.status)) {
    error(id, 'Invalid status: ' + entry.status);
  }

  if (entry.official_url && !URL_PATTERN.test(entry.official_url)) {
    error(id, 'official_url must start with https://');
  }
  if (entry.application_url && !URL_PATTERN.test(entry.application_url)) {
    error(id, 'application_url must start with https://');
  }
  if (entry.source_url && !URL_PATTERN.test(entry.source_url)) {
    warn(id, 'source_url should start with https://');
  }

  if (entry.deadline !== null && entry.deadline !== undefined) {
    if (!DATE_PATTERN.test(entry.deadline)) {
      error(id, 'Invalid deadline format: ' + entry.deadline);
    }
    // A published date is a claim about the live world. It is only defensible if a
    // contributor recorded when they read it, and it must not sit behind `verify`.
    if (!entry.last_verified) {
      error(id, 'deadline is set but last_verified is missing (an undated deadline is not verifiable)');
    }
    if (entry.status === 'verify') {
      error(id, 'deadline is set but status is "verify" (verify means the cycle is unconfirmed)');
    }
  }
  if (entry.deadline_notes !== undefined && typeof entry.deadline_notes !== 'string') {
    error(id, 'deadline_notes must be a string');
  }
  if (entry.last_updated && !DATE_PATTERN.test(entry.last_updated)) {
    error(id, 'Invalid last_updated format: ' + entry.last_updated);
  }
  if (entry.last_verified && !DATE_PATTERN.test(entry.last_verified)) {
    warn(id, 'Invalid last_verified format: ' + entry.last_verified);
  }

  if (entry.eligibility && typeof entry.eligibility !== 'object') {
    error(id, 'eligibility must be an object');
  }

  if (!entry.deadline && !entry.deadline_notes) warn(id, 'No deadline or deadline_notes set');
  if (entry.amount && entry.amount.toLowerCase().includes('unknown')) {
    warn(id, 'Amount is unknown');
  }
  if (!entry.source_url) warn(id, 'No source_url provided (recommended)');
  if (!entry.last_verified) warn(id, 'No last_verified date (recommended)');
}

// ---------------------------------------------------------------------------
// Optional link liveness probe.
// ---------------------------------------------------------------------------

async function probe(url) {
  const request = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      });
      // We only need the status line; do not buffer whole pages.
      try { await res.body?.cancel(); } catch {}
      return res;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await request('GET');
    if (res.status === 405 || res.status === 501) res = await request('HEAD');
    return { status: res.status, finalUrl: res.url };
  } catch (err) {
    return { status: 0, error: err.name === 'AbortError' ? 'timeout' : String(err.cause?.code || err.message) };
  }
}

async function checkLinks() {
  const targets = new Map();
  for (const entry of scholarships) {
    for (const field of ['official_url', 'application_url', 'source_url']) {
      const url = entry[field];
      if (!url || !URL_PATTERN.test(url)) continue;
      if (!targets.has(url)) targets.set(url, []);
      targets.get(url).push(entry.id + '.' + field);
    }
  }

  const urls = Array.from(targets.keys());
  console.log('\nChecking ' + urls.length + ' unique link(s) across ' + scholarships.length + ' records…\n');

  const queue = urls.slice();
  const results = new Map();
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      results.set(url, await probe(url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(LINK_CONCURRENCY, urls.length) }, worker));

  let dead = 0;
  let unreachable = 0;

  for (const url of urls) {
    const result = results.get(url);
    const owners = targets.get(url).join(', ');
    if (DEAD_STATUSES.has(result.status)) {
      console.error('  DEAD  [' + result.status + '] ' + url + '  ← ' + owners);
      errors++;
      dead++;
    } else if (result.status === 0) {
      warn('link', 'UNREACHABLE (' + result.error + ') ' + url + '  ← ' + owners);
      unreachable++;
    } else if (BLOCKED_STATUSES.has(result.status)) {
      warn('link', 'BLOCKED [' + result.status + '] ' + url + '  ← ' + owners);
    } else if (result.status >= 400) {
      warn('link', 'HTTP ' + result.status + ' ' + url + '  ← ' + owners);
    } else {
      console.log('  OK    [' + result.status + '] ' + url);
    }
  }

  console.log('\nLink probe: ' + dead + ' dead, ' + unreachable + ' unreachable, ' + urls.length + ' checked.');
}

if (CHECK_LINKS) {
  await checkLinks();
}

console.log('\nValidation complete: ' + errors + ' error(s), ' + warnings + ' warning(s).');

if (errors > 0) {
  console.error('\nCatalog validation FAILED.');
  process.exit(1);
} else {
  console.log('\nCatalog validation passed.');
  process.exit(0);
}
