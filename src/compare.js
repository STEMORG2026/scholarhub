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

import { requirementFor } from './requirements.js';

/** The three verdicts. There is no fourth. */
export const VERDICTS = ['meets', 'fails', 'unknown'];

/** Why a comparison came back `unknown`. Machine-readable, for tests. */
export const UNKNOWN_REASONS = [
  'no-requirement', // the provider states there is none
  'not-published', // the provider's page was checked and publishes no threshold
  'not-recorded', // nobody has looked — the catalog does not carry one
  'delegated', // the award sets no bar; a named body does
  'criterion-only', // the provider weighs academic performance but publishes no bar
  'unresolvable', // recorded, but the two sides cannot be lined up
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
export function compareGpa(record, value, requirement, classRank) {
  const req = requirement || gpaRequirement(record);

  // 5. No figure — and this is where two facts that used to share a sentence
  //    come apart. `checked: true` means the provider's own page was read and
  //    publishes no threshold; the plain case means nobody has looked. Both are
  //    `unknown`, and saying "we have not recorded one" to a reader whose
  //    provider has been read and has none is a different claim from the truth.
  if (req.kind === 'absent') {
    return req.checked
      ? {
          verdict: 'unknown',
          reason: 'not-published',
          sentence: 'This provider\u2019s page has been checked and it publishes no GPA threshold. There is no bar to compare against.',
        }
      : {
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

  // 3b. The award sets no bar of its own and names who does. This is a
  //     *definite* answer, and rendering it as "we could not work this out"
  //     would understate what is known: the reader now knows which document to
  //     open. Nine of the sourced records are this shape.
  if (req.kind === 'delegated') {
    return {
      verdict: 'unknown',
      reason: 'delegated',
      sentence: `This award sets no academic bar of its own. It is set by ${req.to}.`,
      quote: req.text,
    };
  }

  // 3c. A rank is a **position**, and position runs the other way.
  //
  //     Every `rank` rule in the sourced file means "the top N%" — TU Delft's top 10%,
  //     MS²'s best 35%, DAAD EPOS's upper third. So the reader is within the bar when
  //     their own position is *less* than or equal to N, and a reader in the top 8%
  //     meets a top-10% requirement. That is the opposite comparison from `numeric`
  //     and `count`, where larger is better.
  //
  //     This is why a class rank does not need the `direction` field that is still an
  //     open item. `direction` is for a *downward scale* — MS²'s German "up to 2.8",
  //     where the number itself runs backwards — and that is a different thing from a
  //     *position*, where the number is ordinary and only the comparison flips. The
  //     kind says which; no flag is required.
  if (req.kind === 'rank') {
    const band = req.applies_to ? ` (${req.applies_to})` : '';
    if (typeof classRank === 'number' && Number.isFinite(classRank)) {
      const meets = classRank <= req.value;
      return {
        verdict: meets ? 'meets' : 'fails',
        reason: null,
        sentence: meets
          ? `Your recorded position, top ${classRank}%, is within the top ${req.value}% this programme asks for.`
          : `Your recorded position, top ${classRank}%, is outside the top ${req.value}% this programme asks for.`,
        quote: req.text,
      };
    }
    return {
      verdict: 'unknown',
      reason: 'unresolvable',
      sentence: `This programme requires a class rank — top ${req.value} of ${req.of}${band}. Add your class position to your profile to check it.`,
      quote: req.text,
    };
  }

  // 3c-bis. A percentile runs the *ordinary* way — GKS asks for "a score percentile of
  //     80% or above" — but nothing in a reader's profile produces one, so it stays
  //     unanswerable and says so rather than borrowing the rank comparison.
  if (req.kind === 'percentile') {
    const band = req.applies_to ? ` (${req.applies_to})` : '';
    return {
      verdict: 'unknown',
      reason: 'unresolvable',
      sentence: `This programme requires a percentile — ${req.value} of ${req.of} or above${band}. Your profile has no confirmed percentile, so this cannot be checked.`,
      quote: req.text,
    };
  }

  // 3d. One figure per scale, and the reader's own transcript decides which.
  //     Picking for them would be the silent default this module exists to stop.
  if (req.kind === 'branches') {
    const branches = Array.isArray(req.branches) ? req.branches : [];
    if (!value || typeof value.value !== 'number' || typeof value.scale !== 'number') {
      return {
        verdict: 'unknown',
        reason: 'no-value',
        sentence: 'This programme states a threshold on more than one scale, so it can only be checked against a confirmed GPA with its scale.',
        quote: req.text,
      };
    }
    const match = branches.find((b) => b.scale === value.scale);
    if (!match) {
      const scales = branches.map((b) => b.scale).filter((s) => s != null).join(', ');
      return {
        verdict: 'unknown',
        reason: 'unresolvable',
        sentence: `This programme states its threshold on the ${scales} scale(s); your GPA is on a ${value.scale}-point scale. Convert one, or read the provider's own conversion rule.`,
        quote: req.text,
      };
    }
    const meets = value.value >= match.value;
    return {
      verdict: meets ? 'meets' : 'fails',
      reason: null,
      sentence: meets
        ? `Your confirmed ${value.value}/${value.scale} is at or above the recorded requirement of ${match.value}/${match.scale}.`
        : `Your confirmed ${value.value}/${value.scale} is below the recorded requirement of ${match.value}/${match.scale}.`,
      // Carried on a verdict, for the same reason as the numeric branch above.
      quote: req.text || null,
    };
  }

  // 4a. The sourced file read this provider's page and found a criterion but no
  //     threshold. This is the dominant shape in the whole catalog — 18 of 36
  //     sourced records — and it is the finding the sourcing pass kept producing:
  //     the usual case is a criterion that is *weighed*, not a threshold that is
  //     enforced.
  if (req.kind === 'criterion-only') {
    return {
      verdict: 'unknown',
      reason: 'criterion-only',
      sentence: 'This programme records how academic performance is weighed but publishes no threshold, so there is no figure to compare against. Read the provider\u2019s own wording below.',
      quote: req.text,
    };
  }

  // 4b. An unparsed string from the catalog. It may genuinely list several
  //     scales, which is why the rule is handed back rather than one branch being
  //     chosen — the reader's transcript decides.
  //
  //     This sentence is correct here and false anywhere else. It was nearly
  //     deleted while fixing 4a: the wired file sends its prose findings through
  //     `criterion-only`, so nothing in the *current* data reaches this branch,
  //     and `src/ingest.test.js` was the only thing that noticed. A branch that
  //     no data reaches today is still reachable by a record nobody has sourced.
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
    // The provider's own wording, carried on a verdict as well as on a refusal.
    //
    // This was `null` on meets/fails, on the reasoning that a clear answer needs no
    // quote. Fulbright shows why that is wrong: its requirement is one sentence
    // containing two routes — "60% aggregate or 3.0 GPA system" — and a reader who
    // fails the percentage route was told "below the recorded requirement" with the
    // 3.0 alternative invisible. A verdict can be clear about one route and silent
    // about another in the same sentence.
    quote: req.text || null,
  };
}

/**
 * Read a reader's class position from what they typed, as "top N%".
 *
 * **Percentage is the natural form and the honest one.** A reader who knows
 * "8th of 120" has to do the division themselves — and so does this parser,
 * below — because a position alone cannot be compared against "top 10%".
 *
 * Returns `null` for anything it cannot read, which leaves rank rules
 * `unresolvable`. That is the safe direction and the whole point: `unresolvable`
 * says "add your class position", whereas a number we half-understood says "you
 * do not qualify" — on the one comparison in this app that runs backwards.
 *
 * Accepted: a bare number ("8"), "8%", "top 8%", "8 of 120", "8th of 120",
 * "8/120". Rejected: anything with no digits, and anything out of range.
 * Out-of-range values are **rejected, not clamped** — clamping would invent a
 * number the reader did not give.
 */
export function parseClassRank(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 && input <= 100 ? input : null;
  }
  if (typeof input !== 'string') return null;

  const text = input.trim();
  if (!text) return null;

  // A minus sign is not a position. Reject the whole string rather than reading
  // the digits after it: "-5" must not become "top 5%". (Both bugs here were
  // found by the tests for them — a negative cohort and a negative position both
  // used to fall through to the percentage branch, which flatters the reader, and
  // on a comparison that runs backwards, flattering means passing them into bars
  // they do not meet.

  if (text.includes('-')) return null;

  // "8 of 120", "8th of 120", "8 out of 120", "8/120" — a position and a cohort
  // size. This comes first, because a bare "8" in that context is a rank, not a
  // percentage, and reading it as 8% would flatter the reader: 8th of 120 is
  // top 6.67%.
  //
  // When a cohort word is present but the cohort itself cannot be read, the whole
  // thing is rejected rather than falling through to the percentage branch —
  // "8 of about 120" is not "top 8%", and guessing would be a confident claim
  // resting on a string we did not understand.
  if (/(?:out\s+of|of|\/)/i.test(text)) {
    const placed = text.match(/^(\d+(?:\.\d+)?)\s*(?:st|nd|rd|th)?\s*(?:out\s+of|of|\/)\s*(\d+(?:\.\d+)?)/i);
    if (!placed) return null;
    const rank = Number(placed[1]);
    const cohort = Number(placed[2]);
    if (!Number.isFinite(rank) || !Number.isFinite(cohort) || rank <= 0 || cohort <= 0 || rank > cohort) return null;
    // Two decimals is plenty, and rounding here keeps the reported sentence
    // honest — an unrounded 6.66666… in a sentence is noise a reader cannot act
    // on.
    return Math.round((rank / cohort) * 10000) / 100;
  }

  // Otherwise the first number in the string is the percentage: "8", "8%",
  // "top 8%", "Top 8 %", "8.5".
  const percent = text.match(/(\d+(?:\.\d+)?)/);
  if (!percent) return null;

  const value = Number(percent[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value;
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
 *
 * `classRank` is the reader's position in their cohort, expressed as "top N%" — the
 * same form every `rank` rule in the sourced file uses. Optional: without it, rank
 * rules stay `unresolvable` and say what would be needed, which is what they did
 * before a reader could record one.
 */
export function compareAllGpa(records, value, requirementsIndex, classRank) {
  const out = {};
  for (const record of records || []) {
    // The sourced file wins when it has an entry, and the catalog scalar is the
    // fallback. `requirementFor` returns `null` for a record the file covers but
    // which carries no `gpa` requirement — a record can state a credit load and
    // no grade rule — so the fallback is `gpaRequirement` rather than a guess.
    const fromFile = requirementsIndex && requirementsIndex.get
      ? requirementFor(requirementsIndex.get(record.id))
      : null;
    const requirement = fromFile || gpaRequirement(record);
    out[record.id] = {
      requirement,
      ...compareGpa(record, value, requirement, classRank),
    };
  }
  return out;
}
