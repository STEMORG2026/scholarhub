// What the error boundary says, separated from how it is laid out.
//
// The split exists because of a hard constraint: **Node's test runner cannot parse
// `.jsx`.** `node --test` fails on the extension itself, which is why no component in
// this repository has a unit test and why `App.jsx`, `AiSettings.jsx` and
// `IngestPanel.jsx` are covered only by the render smoke test. That is fine for layout.
// It is not fine for *copy*, because the words a reader sees when the app breaks are
// exactly the kind of thing that can be confidently wrong — this project has already
// shipped "states its requirement in a form that has more than one scale or branch" to
// eighteen records that had no scale or branch.
//
// So the text lives here, in a plain `.js` module the test runner can import, and
// `ErrorBoundary.jsx` only arranges it. This follows the rule already written down in
// AGENTS.md: decision logic belongs in the pure modules, not in the component.

/**
 * The words shown when rendering fails.
 *
 * Three claims, each deliberate:
 *
 *   * **what happened** — a fault in the app, not in anything the reader did;
 *   * **what is safe** — the profile, shortlist, tracker and checklist live in
 *     `localStorage`, and a render error does not touch them. This is the most useful
 *     sentence the component can produce, and it happens to be true;
 *   * **what is not claimed** — nothing was reported anywhere, because there is no
 *     server to report to. A reassuring "we've been notified" would be a lie, and the
 *     kind this project keeps having to correct.
 */
export const FALLBACK = {
  eyebrow: 'SOMETHING BROKE',
  title: 'This screen could not be drawn.',
  lede: 'ScholarHub hit an error while rendering. This is a fault in the app, not in anything you did.',
  reassuranceTitle: 'Your saved work is not affected',
  reassurance:
    'Your profile, shortlist, tracker and document checklist are stored in this browser and were not touched. Reloading the page will bring them back exactly as they were.',
  action: 'Reload ScholarHub',
  errorLabel: 'The error, if you want to report it:',
  errorSuffix:
    'The full detail is in the browser console. Nothing about this was sent anywhere — ScholarHub has no server to send it to.',
};

/** The console line, so the reader has something to copy and we have one place to grep. */
export const LOG_PREFIX = 'ScholarHub hit a render error:';

/**
 * A printable form of whatever was thrown.
 *
 * `throw` accepts anything, not just `Error`. An object with no `message`, or a bare
 * string, must still produce something a reader can quote — and must never throw while
 * handling a throw, which would replace the fallback with the blank screen the boundary
 * exists to prevent.
 */
export function errorText(error) {
  // Every property read is inside a `try`, and that is the point rather than a
  // precaution: `error.message` can be a getter that throws, and reading it outside a
  // guard makes this function throw *while handling a throw* — which replaces the
  // fallback with the blank screen the boundary exists to prevent. The first version of
  // this did exactly that, and the test for it is why it no longer does.
  try {
    if (error && typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  } catch {
    // A hostile getter. Fall through to the next representation.
  }

  try {
    if (typeof error === 'string' && error.trim()) return error.trim();
    // A blank or missing message still has a name worth showing — `Error` beats
    // `Error:    ` for a reader trying to describe what happened.
    if (error && typeof error.name === 'string' && error.name.trim()) return error.name;
    const printed = String(error);
    return printed === '[object Object]' ? JSON.stringify(error) : printed;
  } catch {
    // A circular structure defeats `JSON.stringify` as surely as a getter defeats
    // `String`. There is still an error, so say so rather than nothing.
    return 'an error with no readable description';
  }
}

/**
 * The strings the fallback must NOT contain.
 *
 * Kept next to the copy rather than in the test, because the point is that they are the
 * claims this component is tempted to make. There is no error tracker and no server
 * (AGENTS.md, scope discipline), so any sentence implying the error was received is
 * false — and a false reassurance is worse than no reassurance, because it stops the
 * reader from reporting it themselves.
 */
export const FORBIDDEN_CLAIMS = [
  /we(?:'ve| have) been notified/i,
  /has been reported/i,
  /we were notified/i,
  /our team (?:has|have) been/i,
  /we(?:'ll| will) look into it/i,
];
