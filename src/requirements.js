// Turning `data/requirements.json` into something `compare.js` can run.
//
// `compare.js` was written in Phase 1 against the catalog's scalar
// `eligibility.gpa_minimum`, and its `gpaRequirement()` was named in the comment
// there as the seam where a richer shape would land — "nothing else in the app
// has to know". This module is that landing. It maps one requirement from the
// sourced file onto the *same* small shape `compareGpa` already consumes, so the
// comparison logic is not rewritten, only fed.
//
// Three things this module deliberately does not do:
//
//   1. **It does not guess.** A rule it does not recognise maps to `absent`,
//      which renders as "not recorded" — the safe direction. A rule that silently
//      mapped to `meets` would tell a reader they qualify on the strength of a
//      shape this module failed to understand.
//   2. **It does not match on prose.** Deciding that a finding is *delegated* by
//      searching its text for "set by the university" would break on the first
//      provider that words it differently, and would put a regex on the read
//      path. The nine delegated records carry a `delegated_to` field instead.
//   3. **It does not read files.** The dynamic `import()` of the JSON lives in
//      the component, so this module stays pure and runnable under `node --test`.

/**
 * Map one requirement from the sourced file onto the shape `compareGpa` takes.
 *
 * Returns `{ kind, value, scale, text, ... }`, or `null` when the entry carries
 * no `gpa` requirement at all — a record can carry a `credits` or `language`
 * requirement and no grade rule, and that is not the same fact as "no
 * requirement".
 */
export function requirementFor(entry) {
  if (!entry || !Array.isArray(entry.requirements)) return null;
  const found = entry.requirements.find((r) => r && r.kind === 'gpa');
  if (!found || !found.of || typeof found.of !== 'object') return null;

  const rule = found.of;
  const text = typeof found.text === 'string' ? found.text : undefined;

  switch (rule.kind) {
    // A figure on a named scale. The one case where a comparison can run.
    case 'numeric':
      return {
        kind: 'numeric',
        value: rule.minimum,
        scale: typeof rule.scale === 'number' ? rule.scale : null,
        text,
      };

    // One figure per scale, and the reader's transcript picks the branch.
    case 'branches':
      return {
        kind: 'branches',
        branches: (Array.isArray(rule.branches) ? rule.branches : []).map((b) => ({
          value: b.minimum,
          scale: typeof b.scale === 'number' ? b.scale : null,
          applies_to: typeof b.applies_to === 'string' ? b.applies_to : undefined,
        })),
        alternatives: Array.isArray(rule.alternatives) ? rule.alternatives : [],
        text,
      };

    // A bar the reader has to place themselves on — and the reader's confirmed
    // values are a GPA and an English score, neither of which is a class rank.
    case 'rank':
      return { kind: 'rank', value: rule.minimum, of: rule.of, applies_to: rule.applies_to, text };
    case 'percentile':
      return { kind: 'percentile', value: rule.minimum, of: rule.of, applies_to: rule.applies_to, text };

    // The provider states there is no threshold. Not the same as "not recorded".
    case 'none-stated':
      return { kind: 'none-stated', text: rule.quote || text };

    // Checked, and the provider publishes nothing. Distinct from the catalog's
    // `absent`, which means nobody has looked — the two render differently.
    case 'unstated':
      return { kind: 'absent', checked: true };

    case 'prose':
      // The bar is set by somebody else, and the record names who.
      if (typeof rule.delegated_to === 'string' && rule.delegated_to.trim()) {
        return { kind: 'delegated', to: rule.delegated_to, text };
      }
      // `criterion-only`, not `prose`. The two are different findings and the
      // difference is provenance, which only this mapper knows:
      //
      //   - a **file** prose rule means "the provider weighs academic
      //     performance and publishes no bar" — the sourcing pass writes one only
      //     after reading the page and finding no figure;
      //   - a **catalog** prose `gpa_minimum` is an unparsed string that may well
      //     list several scales, which is why `compareGpa` hands it back rather
      //     than picking one.
      //
      // They must not share a sentence. The catalog case is `prose`; this is not.
      return { kind: 'criterion-only', text };

    default:
      return { kind: 'absent' };
  }
}

/**
 * Index the file by record id. Returns a `Map` so a lookup is O(1) and a
 * missing record is unambiguously `undefined` rather than a prototype member.
 */
export function indexRequirements(raw) {
  const map = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map;
  for (const [id, entry] of Object.entries(raw)) map.set(id, entry);
  return map;
}

/**
 * Count the answers a comparison produced, for the summary strip. Kept here so
 * the component does not re-implement the reason vocabulary and drift from it.
 */
export function summarise(comparison) {
  const out = { meets: 0, fails: 0, unknown: 0, byReason: {} };
  for (const result of Object.values(comparison || {})) {
    out[result.verdict] = (out[result.verdict] || 0) + 1;
    if (result.verdict === 'unknown') {
      const reason = result.reason || 'unresolvable';
      out.byReason[reason] = (out.byReason[reason] || 0) + 1;
    }
  }
  return out;
}
