// What the assistant is allowed to say, and what it is allowed to send.
//
// This module exists because the AI path had a hole that read as fine. Every
// guard around it was honest — `egressSummary()` names the host, the key never
// reaches a server, a test forbids the word "secure" — and none of those guards
// noticed that the profile was being attached to *every* request. A rule that
// says "no PII leaves the browser" is not enforced by a rule that says "say
// where the request goes". Those are different claims, and only the second one
// was tested.
//
// Two rules live here, both enforced by tests rather than by comment:
//
//  1. **A question that is not about fit does not carry the profile.**
//     `needsProfile()` decides, from the reader's own words, whether the three
//     profile facts (field, degree, nationality) may be attached. "What is the
//     MEXT deadline?" sends catalog rows and nothing about the reader. This is
//     the narrow direction: the default is *not* to send.
//
//  2. **The assistant is not an assessor.** A prompt can be shaped to say so —
//     see `ASSESSOR_GUARD`. The catalog records no numeric GPA threshold in any
//     of its fifty records, so a model asked "am I eligible?" has nothing to
//     reason from and will produce confident prose over an empty table. That is
//     the exact failure `compare.js` refuses in its own domain, and the AI path
//     must refuse it too rather than routing around the guard.
//
// The module is pure: plain values in, plain values out. It is deliberately not
// in a lazy chunk, because a decision about what leaves the browser should not
// be code the reader has to trigger before it runs.

/**
 * The words that make a question *about the reader* rather than about a
 * programme.
 *
 * Two things make this harder than a list of pronouns, and both are load-bearing:
 *
 *  1. **Bare pronouns are not enough, because "tell me" is not about me.**
 *     `\bme\b` matches "Tell me about the DAAD programme" — an instruction to the
 *     assistant, not a fact about the reader. So the cues are mostly *phrases*
 *     (`my gpa`, `for me`, `am i`) and the possessive `my` is only trusted when a
 *     profile noun follows it. What is left is a first-person clause.
 *
 *  2. **A substring test is wrong in both directions.** `i` matches
 *     "Information" and "India"; `my` matches "Myanmar". The two-letter cues are
 *     the dangerous ones and are anchored on both sides.
 *
 * Where the two rules conflict the gate stays narrow: a missed cue sends
 * catalog rows only and the reader can rephrase, whereas a false positive sends
 * their nationality to a cloud provider. The failure modes are not symmetric, so
 * the default is *not to send*.
 */
const PROFILE_CUES = new RegExp(
  [
    // First-person verb clauses — unambiguous.
    '\\bam i\\b',
    '\\bdo i\\b',
    '\\bdid i\\b',
    '\\bcan i\\b',
    '\\bshould i\\b',
    '\\bwill i\\b',
    '\\bwould i\\b',
    '\\bwas i\\b',
    // Possessive + a profile noun. "my" alone is too weak (see the header).
    '\\bmy (?:profile|gpa|cgpa|grade|grades|degree|country|nationality|field|background|score|scores|marks|transcript|case|chances?|eligibility)\\b',
    // Fit vocabulary, which only means anything when someone is being fitted.
    '\\bqualif(?:y|ies|ied)\\b',
    '\\beligib(?:le|ility)\\b',
    '\\b(?:my|the) chances?\\b',
    '\\bchances (?:of|for) me\\b',
    '\\bfit me\\b',
    '\\bfor me\\b',
    '\\bto me\\b',
    '\\babout me\\b',
    '\\bmyself\\b',
    '\\bmine\\b',
    // A waiver is country-specific by construction, so asking about one is a
    // question about the reader's country.
    '\\bwaiv(?:e|ed|er)\\b',
  ].join('|'),
  'i',
);

/**
 * May the reader's profile facts be attached to this request?
 *
 * Returns `{ ok, reason }` so a caller can disclose *why* the profile was
 * included, rather than silently deciding. `reason` is one of:
 *
 *   'asks-about-self'  — the question named the reader, so fit can be assessed
 *   'not-about-self'   — a question about a programme; catalog rows suffice
 *   'no-profile'       — the question is about the reader but nothing is set
 *
 * A blank question never carries the profile.
 */
export function needsProfile(question, profile) {
  const text = typeof question === 'string' ? question : '';
  if (!text.trim()) return { ok: false, reason: 'not-about-self' };
  if (!PROFILE_CUES.test(text)) return { ok: false, reason: 'not-about-self' };
  if (!hasAnyProfileFact(profile)) return { ok: false, reason: 'no-profile' };
  return { ok: true, reason: 'asks-about-self' };
}

/** True when the profile holds at least one fact worth sending. */
export function hasAnyProfileFact(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return !!(clean(profile.field) || clean(profile.degree) || clean(profile.nationality));
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * The sentence describing the reader, or `null` when the profile may not be
 * sent.
 *
 * `null` is the load-bearing return. A caller that interpolates `null` into a
 * prompt string renders "null" — visibly broken, which is the safe failure. A
 * caller that substitutes an empty string would render a smooth sentence with a
 * hole in it, and an omitted fact reads as \u201cnot given\u201d rather than \u201cnot sent\u201d,
 * which are different claims.
 */
export function readerClause(question, profile) {
  const decision = needsProfile(question, profile);
  if (!decision.ok) return null;
  const field = clean(profile.field) || 'an unstated field';
  const degree = clean(profile.degree) || 'an unstated degree level';
  const nationality = clean(profile.nationality);
  return (
    'The reader: aiming at a ' + degree + ' in ' + field +
    (nationality ? ', country of origin ' + nationality : '') + '.'
  );
}

/** What actually left the browser for one request, for the panel to disclose. */
export function egressDisclosure(question, profile) {
  const decision = needsProfile(question, profile);
  if (decision.reason === 'asks-about-self') {
    const sent = ['field', 'degree'];
    if (clean(profile && profile.nationality)) sent.push('nationality');
    return {
      included: true,
      reason: decision.reason,
      fields: sent,
      sentence: 'This question is about you, so your profile (' + sent.join(', ') + ') was sent.',
    };
  }
  if (decision.reason === 'no-profile') {
    return {
      included: false,
      reason: decision.reason,
      fields: [],
      sentence: 'This question is about you, but your profile is empty, so nothing was sent.',
    };
  }
  return {
    included: false,
    reason: decision.reason,
    fields: [],
    sentence: 'This question is about programmes, so nothing about you was sent \u2014 only catalog rows.',
  };
}
/**
 * The instruction that keeps the assistant a guide rather than an assessor.
 *
 * Kept here rather than inlined in the component so it can be asserted on, and
 * so the reason it exists is next to the words. The catalog's numeric GPA
 * requirement count is zero, so "am I eligible?" cannot be answered from the
 * rows; the honest reply names the comparison the app can actually make and
 * refuses to invent the rest.
 */
export const ASSESSOR_GUARD =
  'You are a guide, not an assessor. You cannot decide eligibility and must not say or imply that someone qualifies or does not. ' +
  'If asked, say the catalog does not record enough to decide, name the requirement that would, and say where to read it. ' +
  'It records no numeric GPA threshold for any programme, so never supply one.';

/**
 * The answer given when there is no provider connected \u2014 the offline guide.
 *
 * Deterministic and composed from the catalog, not from a model. Split out of
 * the component because it is the *default* reply and therefore the one most
 * readers actually see; it deserves to be testable rather than a template
 * literal buried three hundred lines into a view.
 *
 * Every sentence states where its fact came from, and the last one says what
 * this reply is not.
 */
export function offlineAnswer({ picks, open, closed, profile }) {
  const named = (picks || []).map((s) => s.name).filter(Boolean);
  const field = clean(profile && profile.field);
  const degree = clean(profile && profile.degree);
  const nationality = clean(profile && profile.nationality);

  let text = 'Based on your saved profile (' + (field || 'your field') + ' \u00b7 ' + (degree || 'degree level') +
    (nationality ? ' \u00b7 ' + nationality : '') + '), start by reviewing ' + (named.length ? named.join(', ') : 'the catalog') + '.';

  if (nationality && open && open.length) {
    text += ' These are marked open to applicants from ' + nationality + ' in this catalog.';
  } else if (nationality && closed && closed.length) {
    text += ' Note that ' + closed.length + ' of the opportunities in this catalog are not open to applicants from ' + nationality +
      ' \u2014 every card carries the reason.';
  } else if (!nationality) {
    text += ' Set your country of origin in My profile and each card will say whether that programme is open to you.';
  }

  return text + ' These are discovery suggestions, not an eligibility decision \u2014 open the official links to verify before applying.';
}
