#!/usr/bin/env node
//
// Validate data/requirements.json against the schema in docs/REQUIREMENTS-SCHEMA.md.
//
// This runs offline, as the third stage of the `npm test` chain, and it exists for
// one reason: a requirement is the part of this catalog that goes stale fastest
// and that a reader is most likely to act on. A requirement with no source, or
// with a number whose scale is missing, would make the comparison engine return
// a confident answer that rests on nothing.
//
// The rules are deliberately strict about *shape* and silent about *content*.
// The validator cannot know whether "3.0 on a 4-point scale" is the right figure
// — that is a sourcing question. It can know that a numeric rule without a scale
// is uncomparable, and that an uncomparable rule shipped as a comparable one is
// the defect this file is here to stop.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argOf = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith('--' + name + '='));
  return found ? resolve(found.slice(name.length + 3)) : fallback;
};

const requirementsPath = argOf('requirements', join(__dirname, '..', 'data', 'requirements.json'));
const catalogPath = argOf('catalog', join(__dirname, '..', 'data', 'scholarships.json'));

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const URL_PATTERN = /^https:\/\//;

// The closed sets. Both are schema, not data: adding a member changes what the
// comparison engine has to handle, so it is a code change rather than an edit.
const REQUIREMENT_KINDS = new Set(['gpa', 'language', 'credits']);
const RULE_KINDS = new Set(['numeric', 'branches', 'percentile', 'rank', 'count', 'prose', 'none-stated', 'unstated']);
// Kinds whose whole content is a number, and which therefore must carry one.
const NUMERIC_RULE_KINDS = new Set(['numeric', 'percentile', 'rank']);
// Kinds that state a figure a comparison can actually run on. Used for the
// catalog-divergence warning, which is about numbers a reader could see.
const FIGURE_RULE_KINDS = new Set(['numeric', 'branches', 'percentile', 'rank']);
// Kinds that are their own text, and must say so.
const TEXT_RULE_KINDS = new Set(['prose', 'none-stated']);

let errors = 0;
let warnings = 0;

function error(where, msg) {
  console.error('  ERROR [' + where + '] ' + msg);
  errors++;
}

function warn(where, msg) {
  console.warn('  WARN [' + where + '] ' + msg);
  warnings++;
}

console.log('Validating requirements: ' + requirementsPath + '\n');

let catalog;
let requirements;
try {
  catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
} catch (err) {
  console.error('Failed to read/parse the catalog: ' + err.message);
  process.exit(1);
}
try {
  requirements = JSON.parse(readFileSync(requirementsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to read/parse requirements: ' + err.message);
  process.exit(1);
}

if (!catalog || !Array.isArray(catalog)) {
  console.error('Catalog root must be a JSON array.');
  process.exit(1);
}
if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) {
  console.error('requirements.json root must be an object keyed by record id.');
  process.exit(1);
}

const catalogById = new Map(catalog.map((r) => [r.id, r]));
const todayIso = new Date().toISOString().slice(0, 10);
const ids = Object.keys(requirements);

console.log('Found ' + ids.length + ' record(s) carrying requirements, against ' + catalog.length + ' catalog records.\n');

/** A real calendar date, not just the right shape. `2026-02-30` must be rejected. */
function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** One comparison rule, validated in isolation. Returns nothing; reports by side effect. */
function checkRule(where, rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    error(where, 'rule must be an object');
    return;
  }
  if (!RULE_KINDS.has(rule.kind)) {
    error(where, 'rule.kind must be one of ' + Array.from(RULE_KINDS).join(', ') + ' — got ' + rule.kind);
    return;
  }

  if (NUMERIC_RULE_KINDS.has(rule.kind)) {
    // The denominator is mandatory. This is the same rule the profile side
    // enforces on a GPA, and for the same reason: 3.0 means four different
    // things on /4.0, /4.3, /4.5 and /5.0, and the comparison engine will
    // refuse to guess.
    //
    // But *which* field holds it depends on the kind. `numeric` is a point on a
    // grade scale, so its denominator is `scale`. A `percentile` and a `rank`
    // are portions *of* something — top 20% of 100, of a class — so theirs is
    // `of`. Requiring `scale` for all three contradicted both the schema
    // (REQUIREMENTS-SCHEMA.md §3 gives percentile/rank "minimum + of") and this
    // file's own `alternatives` path below, which reads `of`. Same kind, two
    // required fields depending on nesting, is a bug: it made a rank legal as an
    // alternative and illegal at the top level.
    const isPortion = rule.kind === 'percentile' || rule.kind === 'rank';
    const field = isPortion ? 'of' : 'scale';
    const denominator = rule[field];

    if (typeof rule.minimum !== 'number' || !Number.isFinite(rule.minimum)) {
      error(where, 'rule.kind "' + rule.kind + '" needs a numeric minimum');
    }
    if (typeof denominator !== 'number' || !Number.isFinite(denominator)) {
      error(
        where,
        'rule.kind "' + rule.kind + '" needs a numeric ' + field + ' — ' +
          (isPortion
            ? 'a threshold with nothing to be a portion of cannot be compared against anything'
            : 'a threshold with no scale cannot be compared against anything'),
      );
    }
    if (typeof rule.minimum === 'number' && typeof denominator === 'number' && rule.minimum > denominator && !isPortion) {
      error(where, 'rule minimum ' + rule.minimum + ' is above its own scale ' + denominator + ' — not a reading');
    }
    // A percentile or rank legitimately carries `scale` nowhere — but a leftover
    // `scale` on one is a symptom of the bug above, so it is named rather than
    // silently ignored.
    if (isPortion && rule.scale !== undefined) {
      error(where, 'rule.kind "' + rule.kind + '" must not carry "scale" — a portion is written as minimum + "of"');
    }
    if (rule.branches !== undefined) {
      error(where, 'rule.kind "' + rule.kind + '" must not carry branches (that is the "branches" kind)');
    }
    if (rule.text !== undefined) {
      error(where, 'rule.kind "' + rule.kind + '" must not carry text (that is the "prose" kind)');
    }
  }

  if (rule.kind === 'count') {
    // A quantity, not a reading on a bounded scale. The sourcing pass hit this
    // immediately: the Erasmus Mundus programmes publish almost no GPA figure,
    // and the one numeric academic gate most of them do publish is a credit
    // load — "a minimum of 240 ECTS-credit points". 240 is not 240 *of*
    // anything and not 240 *on* a 4.0 scale; a graduate can hold 300. Forcing
    // it into `numeric` would have needed a fake scale, and a fake scale is
    // exactly what this file exists to prevent.
    //
    // The unit is mandatory for the mirror-image reason the scale is on a GPA:
    // 240 credits means four different things in ECTS, US semester hours and
    // the Nepali credit system. `count` with no unit is as uncomparable as
    // `numeric` with no scale.
    if (typeof rule.minimum !== 'number' || !Number.isFinite(rule.minimum)) {
      error(where, 'rule.kind "count" needs a numeric minimum');
    }
    if (typeof rule.unit !== 'string' || rule.unit.trim() === '') {
      error(where, 'rule.kind "count" needs a unit — "240" means four different things in ECTS, US credit hours and the Nepali system');
    }
    if (rule.scale !== undefined) {
      error(where, 'rule.kind "count" must not carry "scale" — a quantity is not a reading on a bounded scale');
    }
    if (rule.of !== undefined) {
      error(where, 'rule.kind "count" must not carry "of" — that is the "percentile" and "rank" kind');
    }
    if (rule.branches !== undefined) {
      error(where, 'rule.kind "count" must not carry branches — where the load differs by route, say so in text and varies_by');
    }
    if (rule.text !== undefined) {
      error(where, 'rule.kind "count" must not carry text (that is the "prose" kind)');
    }
  }

  if (rule.kind === 'branches') {
    if (!Array.isArray(rule.branches) || rule.branches.length < 2) {
      error(where, 'rule.kind "branches" needs a branches array of at least 2 alternatives — one branch is the "numeric" kind');
    } else {
      rule.branches.forEach((branch, i) => {
        const bw = where + '.branches[' + i + ']';
        if (!branch || typeof branch !== 'object' || Array.isArray(branch)) {
          error(bw, 'branch must be an object');
          return;
        }
        if (typeof branch.minimum !== 'number' || !Number.isFinite(branch.minimum)) {
          error(bw, 'branch needs a numeric minimum');
        }
        if (typeof branch.scale !== 'number' || !Number.isFinite(branch.scale)) {
          error(bw, 'branch needs a numeric scale');
        }
        for (const field of ['minimum', 'scale']) {
          if (field in branch && typeof branch[field] !== 'number') {
            error(bw, 'branch.' + field + ' must be a number');
          }
        }
        if (branch.applies_to !== undefined && (typeof branch.applies_to !== 'string' || branch.applies_to.trim() === '')) {
          error(bw, 'branch.applies_to must be a non-empty string when present');
        }
      });
    }
    if (rule.minimum !== undefined || rule.scale !== undefined) {
      error(where, 'rule.kind "branches" must not carry a top-level minimum or scale — every figure belongs to a branch');
    }
    if (rule.alternatives !== undefined) {
      if (!Array.isArray(rule.alternatives)) {
        error(where, 'rule.alternatives must be an array when present');
      } else {
        rule.alternatives.forEach((alt, i) => {
          const aw = where + '.alternatives[' + i + ']';
          if (!alt || typeof alt !== 'object') { error(aw, 'alternative must be an object'); return; }
          if (!NUMERIC_RULE_KINDS.has(alt.kind)) {
            error(aw, 'alternative.kind must be numeric, percentile or rank — got ' + alt.kind);
          }
          if (typeof alt.minimum !== 'number' || !Number.isFinite(alt.minimum)) {
            error(aw, 'alternative needs a numeric minimum');
          }
          if (typeof alt.of !== 'number' || !Number.isFinite(alt.of)) {
            error(aw, 'alternative needs a numeric "of" (the scale it is a percentile or rank of)');
          }
        });
      }
    }
  }

  if (TEXT_RULE_KINDS.has(rule.kind)) {
    if (typeof rule.text !== 'string' || rule.text.trim() === '') {
      error(where, 'rule.kind "' + rule.kind + '" needs text — this kind is its own explanation');
    }
    if (rule.minimum !== undefined || rule.scale !== undefined || rule.branches !== undefined) {
      error(where, 'rule.kind "' + rule.kind + '" must not carry a number — it is recorded precisely because no single number holds it');
    }
  }

  if (rule.kind === 'none-stated') {
    // The distinct fact. The catalog already renders this differently from
    // "not recorded"; the data has to keep them distinct for that to be possible.
    if (typeof rule.quote !== 'string' || rule.quote.trim() === '') {
      error(where, 'rule.kind "none-stated" needs a quote — it is a claim that the provider states there is no threshold');
    }
  }

  if (rule.kind === 'unstated') {
    if (rule.minimum !== undefined || rule.scale !== undefined || rule.text !== undefined || rule.quote !== undefined || rule.branches !== undefined) {
      error(where, 'rule.kind "unstated" must be bare — it means nothing has been recorded');
    }
  }

  if (rule.varies_by !== undefined && (typeof rule.varies_by !== 'string' || rule.varies_by.trim() === '')) {
    error(where, 'rule.varies_by must be a non-empty string when present');
  }
}

for (const recordId of ids) {
  const entry = requirements[recordId];

  // A requirement filed against a name that is not a record is a typo, and a typo
  // here means a requirement that silently never gets compared.
  if (!catalogById.has(recordId)) {
    error(recordId, 'record_id is not in data/scholarships.json');
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    error(recordId, 'entry must be an object with a requirements array');
    continue;
  }

  if (!Array.isArray(entry.requirements) || entry.requirements.length === 0) {
    error(recordId, 'requirements must be a non-empty array');
    continue;
  }

  entry.requirements.forEach((req, i) => {
    const where = recordId + '[' + i + ']';
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      error(where, 'requirement must be an object');
      return;
    }

    if (!REQUIREMENT_KINDS.has(req.kind)) {
      error(where, 'kind must be one of ' + Array.from(REQUIREMENT_KINDS).join(', ') + ' — got ' + req.kind);
    }

    checkRule(where + '.of', req.of);

    // Provenance is mandatory, not recommended. This is the one field that
    // separates a requirement a reader can act on from an assertion.
    if (typeof req.source !== 'string' || !URL_PATTERN.test(req.source)) {
      error(where, 'source must be an https URL — an unsourced requirement is not verifiable');
    }
    if (!isRealDate(req.last_verified)) {
      error(where, 'last_verified must be a real ISO date (YYYY-MM-DD) — got ' + JSON.stringify(req.last_verified));
    } else if (req.last_verified > todayIso) {
      error(where, 'last_verified is in the future: ' + req.last_verified);
    } else {
      const months = Math.round((Date.parse(todayIso) - Date.parse(req.last_verified)) / 2_592_000_000);
      if (months >= 12) {
        warn(where, 'last_verified is ' + months + ' months old — a requirement ages faster than anything else here');
      }
    }

    if (req.text !== undefined && (typeof req.text !== 'string' || req.text.trim() === '')) {
      error(where, 'text must be a non-empty string when present');
    }
    // `text` on a prose-bearing rule was already required by checkRule; require it
    // here too for any rule whose numbers a reader should be able to check against
    // the provider's own wording.
    if ((NUMERIC_RULE_KINDS.has(req.of && req.of.kind) || (req.of && req.of.kind) === 'count') && !req.text && !req.quote) {
      warn(where, 'a rule carrying a figure should carry the provider\'s own wording in text, so the reader can check it');
    }
  });

  // A record that carries requirements should still say so on the record itself,
  // or the two files can disagree about whether a requirement exists at all.
  //
  // Only a *figure* counts for this warning. `src/compare.js` reads the catalog's
  // `eligibility.gpa_minimum` scalar, which can hold null, a number or a prose
  // string — so a number here with `null` there is a divergence a reader can
  // actually see. A `prose`, `none-stated` or `unstated` finding cannot be
  // written into that scalar in any shape that renders differently, and the
  // sourcing pass is going to produce dozens of them: warning on all of them
  // would bury the few that matter. A warning nobody can act on teaches people
  // to ignore warnings.
  const catalogEntry = catalogById.get(recordId);
  if (catalogEntry && catalogEntry.eligibility && catalogEntry.eligibility.gpa_minimum === null) {
    const hasGpaFigure = entry.requirements.some(
      (r) => r && r.kind === 'gpa' && r.of && FIGURE_RULE_KINDS.has(r.of.kind),
    );
    if (hasGpaFigure) {
      warn(recordId, 'now carries a comparable GPA figure here, but the catalog record still has eligibility.gpa_minimum = null — the two disagree');
    }
  }
}

console.log('\nValidation complete: ' + errors + ' error(s), ' + warnings + ' warning(s).');

if (errors > 0) {
  console.error('\nRequirements validation FAILED.');
  process.exit(1);
} else {
  console.log('\nRequirements validation passed.');
  process.exit(0);
}
