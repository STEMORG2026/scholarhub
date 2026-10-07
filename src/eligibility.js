// Country-aware eligibility.
//
// The catalog answers "may someone from my country apply?" with a structured
// `nationality_scope` whose `mode` is one of six values. Two of those modes are
// answerable from the data:
//
//   all     — open to every nationality, so the answer is yes
//   listed  — an enumerable list of countries, so membership decides it
//
// The other four are not answerable from the data, and this module deliberately
// says "check" rather than guessing:
//
//   listed_elsewhere — a list exists, but the provider publishes it
//   regional         — a region or bloc, whose exact membership is the
//                      provider's to define
//   agreement        — decided country by country by bilateral arrangement
//   unstated         — the source does not say
//
// `unstated` must never be rendered as "open to everyone": a silent default
// here would tell every visitor they are eligible, which is the one thing a
// tool like this must not do.

/** The label shown on a badge, keyed by verdict. */
export const VERDICT = {
  open: 'Open to you',
  closed: 'Not open to you',
  check: 'Check eligibility',
  unknown: 'Choose your country',
};

/**
 * @param {object|undefined} scope  a record's `nationality_scope`
 * @param {string} country          the reader's chosen country of origin
 * @returns {{verdict: 'open'|'closed'|'check'|'unknown', reason: string, listUrl?: string}}
 */
export function eligibilityFor(scope, country) {
  if (!scope || !scope.mode) {
    return { verdict: 'check', reason: 'The source does not state nationality rules, so check with the provider.' };
  }

  if (scope.mode === 'all') {
    return { verdict: 'open', reason: scope.note || 'Open to applicants of any nationality.' };
  }

  if (scope.mode === 'listed') {
    const list = scope.countries || [];
    if (!country) {
      return {
        verdict: 'unknown',
        reason: 'Choose your country of origin to see whether it is on the list of ' + list.length + ' eligible countries.',
      };
    }
    return list.includes(country)
      ? { verdict: 'open', reason: 'Your country is named in the list of ' + list.length + ' eligible countries this programme publishes.' }
      : { verdict: 'closed', reason: 'Your country is not among the ' + list.length + ' countries this programme names as eligible.' };
  }

  if (scope.mode === 'regional') {
    const regions = scope.regions || [];
    return {
      verdict: 'check',
      reason: 'Restricted to a region rather than a country list: ' + regions.join(', ') + '. Check whether your country is covered.',
      listUrl: scope.list_url,
    };
  }

  if (scope.mode === 'listed_elsewhere') {
    return {
      verdict: 'check',
      reason: 'The provider publishes the eligible-country list rather than this catalog, so open the provider list to check your country.',
      listUrl: scope.list_url,
    };
  }

  if (scope.mode === 'agreement') {
    return {
      verdict: 'check',
      reason: 'Eligibility is decided country by country through bilateral arrangements, so it has to be checked with the provider.',
    };
  }

  return { verdict: 'check', reason: 'The source does not state nationality rules, so check with the provider.' };
}
