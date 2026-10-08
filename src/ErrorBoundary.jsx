// The last line of defence for the whole application.
//
// Why this exists, specifically: a `ReferenceError` in one view shipped undetected for
// **six versions**, because nothing in the app could catch a render error and nothing
// was watching for one. A reader saw a blank screen and had no way to tell whether the
// app was broken, still loading, or their own browser's fault. The audit that found the
// absence called it `WEB-006`; the CHANGELOG has called it "the only thing that
// executes a view's branches" since the smoke test was written.
//
// Three things this deliberately does NOT do:
//
//   1. **It does not claim to have reported anything.** There is no server and no error
//      tracker (AGENTS.md, scope discipline), so a message like "we've been notified"
//      would be false. The reader gets the error text and a way to copy it instead.
//   2. **It does not say the reader's work is lost.** It is not: the profile, shortlist,
//      tracker and checklist live in `localStorage` and a render error does not touch
//      them. Saying so is the most useful sentence this component can produce, and it
//      happens to be true.
//   3. **It does not swallow the error silently.** It is logged to the console as well
//      as shown, because the reader who reports a problem will be asked what it said.
//
// A class component, because `componentDidCatch` has no hook equivalent — React has no
// `useErrorBoundary`. This is the one place in the app where a class is correct.

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { FALLBACK, LOG_PREFIX, errorText } from './errorBoundary.js';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The console is the only place this can go. Anything else would be a claim that
    // something received it.
    console.error(LOG_PREFIX, error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="page-section" role="alert">
        <div className="eyebrow muted"><AlertTriangle size={13} /> {FALLBACK.eyebrow}</div>
        <h1 className="page-title">{FALLBACK.title}</h1>
        <p className="page-lede">{FALLBACK.lede}</p>

        <div className="form-card">
          <div className="form-heading">
            <div className="form-icon"><AlertTriangle size={19} /></div>
            <div>
              <h3>{FALLBACK.reassuranceTitle}</h3>
              <p>{FALLBACK.reassurance}</p>
            </div>
          </div>

          <button className="primary-btn" onClick={() => window.location.reload()}>
            <RotateCcw size={15} /> {FALLBACK.action}
          </button>

          <div className="coming-note">
            <AlertTriangle size={14} />
            <span>
              <b>{FALLBACK.errorLabel}</b> {errorText(error)} {FALLBACK.errorSuffix}
            </span>
          </div>
        </div>
      </section>
    );
  }
}
