// Comparing a confirmed profile value against what a record actually says.
//
// Design: `docs/DOCUMENT-INGESTION.md`, §6. The whole point of this module is
// that it returns **three** verdicts, not two, and that `unknown` is the
// default. A two-valued comparison would default to `meets` in the absence of
// data, and tell an applicant they qualify for a programme whose requirement
// the catalog simply never recorded — the single worst failure this app could
// ship, and the same failure `nationality_scope.unstated` was built to avoid.
//
// It is written now, in Phase 1, even though 45 of 50 records record no GPA
// requirement — so that when the Phase 2 sourcing pass lands, the feature turns
// on without a rewrite. Until then it answers `unknown` honestly, and the
// sentences it produces are still useful: they tell the reader *which* question
// to go and ask.
//
// Five sentences, deliberately distinct, because they are five different facts:
//
//   1. the requirement is met
//   2. the requirement is not met
//   3. the provider states there is no threshold        ("no requirement")
//   4. the requirement is recorded but not as a number  ("unresolvable")
//   5. the catalog does not record a requirement        ("not recorded")
//
// 3, 4 and 5 all surface as the verdict `unknown`, but they must never share a
// sentence — "this provider has no GPA threshold" and "we do not know this
// provider's GPA threshold" are opposite claims, and collapsing them would be
// a lie in one direction or the other.

/** The three verdicts. There is no fourth. */
export const VERDICTS = ['meets', 'fails', 'unknown'];

/** Why a comparison came back `unknown`. Machine-readable, for tests. */
export const UNKNOWN_REASONS = [
  'no-requirement', // the provider states there is none
  'not-recorded', // the catalog does not carry one
  'unresolvable', // recorded as prose that has no single scalar form
  'no-value', // the reader has not confirmed a value to compare
  'no-scale', // a value with no scale cannot be compared against a scaled rule
];

/**
 * Does a record carry a machine-comparable GPA requirement?
 *
 * This reads the catalog's *current* shape — `eligibility.gpa_minimum`, which
 * is `null`, a number, or a prose string — without changing it. Phase 2 may
 * give it a richer shape; this function is where that change would land, and
 * nothing else in the app has to know.
 */
export function gpaRequirement(record) {
  const raw = record && record.eligibility ? record.eligibility.gpa_minimum : undefined;
  // The scale a numeric requirement is written on. No record in the catalog
  // carries this yet — it is part of the Phase 2 shape — so it is read when
  // present and left `null` when not, and a `null` scale is treated as *unknown
  // scale*, never as "assume 4.0".
  const rawScale = record && record.eligibility ? record.eligibility.gpa_scale : undefined;

  if (raw === null || raw === undefined || raw === '') {
    return { kind: 'absent' };
  }
  if (typeof raw === 'number') {
    return { kind: 'numeric', value: raw, scale: typeof rawScale === 'number' ? rawScale : null };
  }
  if (typeof raw === 'string') {
    // "No minimum GPA is stated in the Edital" is a *requirement that is
    // explicitly absent* — a different fact from "not recorded", and it is
    // detected by the phrase rather than by an empty value.
    if (/\bno\s+(?:minimum\s+)?(?:gpa|cgpa)\b|\bno\s+threshold\b/i.test(raw)) {
      return { kind: 'none-stated', text: raw };
    }
    return { kind: 'prose', text: raw };
  }
  return { kind: 'absent' };
}

/**
 * Compare one confirmed GPA value against one record's recorded requirement.
 *
 * `value` is `{ value, scale }` and must be **confirmed** by the reader. An
 * unconfirmed value is passed as `null` and yields `unknown`/`no-value`.
 *
 * A scaled comparison is only made when the scales match. `3.62/4.0` against a
 * `3.0/4.0` threshold is a real comparison. `3.62/4.0` against a rule written
 * as `2.64/4.0 or 2.80/4.3 or 2.91/4.5 or 3.23/5.0` is not one — the reader has
 * to pick the branch their transcript belongs to, and ScholarHub hands the rule
 * back rather than choosing for them.
 */
export function compareGpa(record, value, requirement) {
  const req = requirement || gpaRequirement(record);

  // 5. Nothing recorded at all.
  if (req.kind === 'absent') {
    return {
      verdict: 'unknown',
      reason: 'not-recorded',
      sentence: 'The catalog does not record a GPA requirement for this programme. Check the provider.',
    };
  }

  // 3. The provider explicitly states there is no threshold.
  if (req.kind === 'none-stated') {
    return {
      verdict: 'unknown',
      reason: 'no-requirement',
      sentence: 'The provider states there is no GPA threshold for this programme, so there is nothing to compare.',
      quote: req.text,
    };
  }

  // 4. Recorded, but as prose with no single scalar form.
  if (req.kind === 'prose') {
    return {
      verdict: 'unknown',
      reason: 'unresolvable',
      sentence: 'This programme states its requirement in a form that has more than one scale or branch. ScholarHub will not pick one for you — read the rule and compare it yourself.',
      quote: req.text,
    };
  }

  // From here the requirement is a number, so a comparison is possible — but
  // only if the reader has a confirmed value *with a scale*.
  if (!value || typeof value.value !== 'number') {
    return {
      verdict: 'unknown',
      reason: 'no-value',
      sentence: 'No confirmed GPA is on your profile yet, so this requirement cannot be checked against one.',
      quote: `The programme requires ${req.value}.`,
    };
  }

  if (typeof value.scale !== 'number') {
    return {
      verdict: 'unknown',
      reason: 'no-scale',
      sentence: `Your GPA is recorded as ${value.value} with no scale. A GPA with no scale cannot be compared against a ${req.value} threshold.`,
      quote: `The programme requires ${req.value}.`,
    };
  }

  // Both sides are numbers. A comparison is only meaningful when both are on
  // the *same* named scale. Where the requirement's scale is unrecorded, the
  // comparison is not made at all — assuming the requirement is on the
  // reader's scale is exactly the kind of silent default this module exists to
  // prevent, and it would produce a confident wrong answer for any provider
  // that states its threshold on a 5.0 scale.
  if (req.scale === null || req.scale === undefined) {
    return {
      verdict: 'unknown',
      reason: 'no-scale',
      sentence: `The catalog records this programme's minimum as ${req.value} but not the scale it is written on. ScholarHub will not assume it matches your ${value.scale}-point scale.`,
      quote: `The programme requires ${req.value}.`,
    };
  }

  if (req.scale !== value.scale) {
    return {
      verdict: 'unknown',
      reason: 'unresolvable',
      sentence: `The programme's figure (${req.value}) is on a ${req.scale}-point scale and yours (${value.value}) is on a ${value.scale}-point scale. Convert one, or read the provider's own conversion rule.`,
    };
  }

  const meets = value.value >= req.value;
  return {
    verdict: meets ? 'meets' : 'fails',
    reason: null,
    sentence: meets
      ? `Your confirmed ${value.value}/${value.scale} is at or above the recorded requirement of ${req.value}/${req.scale}.`
      : `Your confirmed ${value.value}/${value.scale} is below the recorded requirement of ${req.value}/${req.scale}.`,
    quote: null,
  };
}

/**
 * The readable label for a verdict, to sit beside the existing eligibility
 * badge without inventing new colour semantics for the same three states.
 */
export const VERDICT_LABEL = {
  meets: 'Requirement met',
  fails: 'Requirement not met',
  unknown: 'Not checkable',
};

/**
 * Run every record's GPA requirement against a confirmed value, returning a
 * lookup keyed by record id. Records are passed in so this stays pure and the
 * caller (the component) owns the catalog read.
 */
export function compareAllGpa(records, value) {
  const out = {};
  for (const record of records || []) {
    const requirement = gpaRequirement(record);
    out[record.id] = {
      requirement,
      ...compareGpa(record, value, requirement),
    };
  }
  return out;
}
