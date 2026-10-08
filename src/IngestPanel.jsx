// The document-ingestion surface, split out of `App.jsx`.
//
// Two reasons this is its own file rather than inline in the profile view:
//
//   1. **It is the reader's most sensitive surface.** A transcript is the most
//      private file an applicant owns, and keeping every byte of the reading
//      path — the file input, the proposal list, the confirmation buttons —
//      behind one import makes the "nothing is uploaded" boundary easy to
//      audit. There is no `fetch` in this file, and there must never be one.
//
//   2. **It keeps the main bundle under its ceiling.** The extractor and the
//      ZIP reader are already a lazy chunk (`./ingest.js`, loaded only when a
//      file is attached). This component is small, but the profile page is the
//      largest view in the app and every kilobyte of JSX there is paid by every
//      reader on first load. See the note in AGENTS.md on bundle discipline.
//
// The component owns no persistence. It renders what it is given and calls
// back; `App` owns the profile, so a confirmed value lands in one place.

import React, { useEffect, useRef, useState } from 'react';
import { FileText, ShieldCheck, AlertTriangle, Check, X } from 'lucide-react';
import { compareAllGpa } from './compare.js';
import { indexRequirements, summarise } from './requirements.js';

/** The human label for a proposal's field. */
const FIELD_LABEL = { gpa: 'GPA', english: 'English test', classification: 'Degree classification' };

export default function IngestPanel({ onConfirm, currentGpa, currentLanguage, currentClassification, onClear, records, onComparison }) {
  const [state, setState] = useState({ status: 'idle' });
  const fileRef = useRef(null);

  const reset = () => {
    setState({ status: 'idle' });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file) => {
    if (!file) return;
    setState({ status: 'reading', fileName: file.name });

    // Loaded on demand. A reader who never attaches a document never downloads
    // the ZIP reader or the extraction patterns.
    let readDocument;
    let extractProposals;
    try {
      ({ readDocument, extractProposals } = await import('./ingest.js'));
    } catch {
      setState({
        status: 'refused',
        fileName: file.name,
        reason: 'unreadable',
        detail: 'The document reader could not be loaded. Reload the page and try again.',
      });
      return;
    }

    let outcome;
    try {
      outcome = await readDocument(file);
    } catch (error) {
      outcome = {
        ok: false,
        reason: 'unreadable',
        detail: error && error.message ? error.message : 'The file could not be read.',
      };
    }

    if (!outcome.ok) {
      setState({ status: 'refused', fileName: file.name, reason: outcome.reason, detail: outcome.detail });
      return;
    }

    const { proposals, notes } = extractProposals(outcome.text);
    setState({
      status: 'read',
      fileName: file.name,
      format: outcome.format,
      proposals,
      notes,
      chars: outcome.text.length,
    });
  };

  const hasConfirmed = !!(currentGpa || currentLanguage || currentClassification);

  // The comparison is computed here rather than in `App` so that `compare.js`
  // travels in this lazy chunk. A reader who has confirmed nothing sees no
  // comparison, so nothing on the first-load path needs the module — and this
  // is the same reason the ingest reader is lazy. The per-record sentence in
  // the detail dialog is the one piece `App` renders itself, from a small
  // lookup that is passed down rather than recomputed.
  // The sourced requirements, loaded only when a comparison will actually run.
  //
  // `data/requirements.json` is 42 kB — three times the main bundle's remaining
  // headroom — so it must never be on the first-load path. It is fetched by a
  // dynamic import, which Vite turns into its own chunk, and only once a reader
  // has confirmed a GPA. A reader who never attaches a document downloads none
  // of it, which is the same discipline as the extractor next door.
  const [requirements, setRequirements] = useState(null);
  useEffect(() => {
    if (!currentGpa || requirements) return undefined;
    let alive = true;
    import('../data/requirements.json')
      .then((mod) => { if (alive) setRequirements(indexRequirements(mod.default)); })
      // A failed load falls back to the catalog scalar rather than breaking the
      // comparison: an offline chunk should degrade to fewer answers, never to
      // an error or to a wrong one.
      .catch(() => { if (alive) setRequirements(new Map()); });
    return () => { alive = false; };
  }, [currentGpa, requirements]);

  const comparison = React.useMemo(
    () => (currentGpa ? compareAllGpa(records || [], currentGpa, requirements) : null),
    [currentGpa, records, requirements],
  );
  // The detail dialog lives in `App`, and it needs the per-record sentence. It
  // cannot import `compare.js` without putting that module back on the
  // first-load path, so the result is handed up instead — the module stays in
  // this lazy chunk, and `App` holds nothing but the answer.
  useEffect(() => {
    if (onComparison) onComparison(comparison);
  }, [comparison, onComparison]);
  const tally = comparison ? summarise(comparison) : null;
  const meets = tally ? tally.meets : 0;
  const fails = tally ? tally.fails : 0;
  const unknown = tally ? tally.unknown : 0;
  const notRecorded = tally ? tally.byReason['not-recorded'] || 0 : 0;
  const notPublished = tally ? tally.byReason['not-published'] || 0 : 0;
  const delegated = tally ? tally.byReason.delegated || 0 : 0;
  const criterionOnly = tally ? tally.byReason['criterion-only'] || 0 : 0;

  return (
    <div className="form-card ingest-card">
      <div className="form-heading">
        <div className="form-icon"><FileText size={19} /></div>
        <div>
          <h3>Read a document yourself</h3>
          <p>Attach a transcript or CV and ScholarHub will read the figures out of it — on this device, with nothing sent anywhere.</p>
        </div>
      </div>

      {hasConfirmed && (
        <div className="confirmed-strip">
          <div className="confirmed-head">
            <ShieldCheck size={15} />
            <b>Confirmed from a document</b>
            <span>These are used for the comparisons below. Remove one and it stops being used.</span>
          </div>
          <div className="confirmed-chips">
            {currentGpa && (
              <span className="confirmed-chip">
                <b>GPA</b> {currentGpa.value}{currentGpa.scale != null ? ' / ' + currentGpa.scale : ''}
                <em>from {currentGpa.from}</em>
                <button onClick={() => onClear('gpa')} aria-label="Remove confirmed GPA"><X size={12} /></button>
              </span>
            )}
            {currentLanguage && (
              <span className="confirmed-chip">
                <b>{currentLanguage.instrument.toUpperCase()}</b> {currentLanguage.value}
                <em>from {currentLanguage.from}</em>
                <button onClick={() => onClear('english')} aria-label="Remove confirmed language score"><X size={12} /></button>
              </span>
            )}
            {currentClassification && (
              <span className="confirmed-chip">
                <b>Class</b> {currentClassification.label}
                <em>from {currentClassification.from}</em>
                <button onClick={() => onClear('classification')} aria-label="Remove confirmed classification"><X size={12} /></button>
              </span>
            )}
          </div>
        </div>
      )}

      {comparison && (
        <div className="gpa-compare">
          {/* The three-valued verdict, with `unknown` as the default. The count
              is the honest measure of how much this can currently say: most
              records record no comparable requirement, and the summary says so
              rather than showing a percentage nobody can audit. */}
          <div className="gpa-compare-head">
            <b>Your confirmed GPA against the catalog</b>
            <span>{meets} met · {fails} not met · {unknown} not checkable</span>
          </div>
          <p className="gpa-compare-lede">
            A requirement ScholarHub cannot read is reported as <em>not checkable</em>, never as a pass.{' '}
            {/* The four reasons are separated because they are four different
                facts, and lumping them into one "not checkable" count would
                throw away the most useful thing the sourced file knows: which
                of these records have no bar at all, which have one that
                somebody else sets, and which nobody has looked at yet. */}
            {/* The largest group, and the most useful sentence in the app: these
                providers weigh academic performance but publish no bar, so a
                reader should stop looking for a number rather than assume one
                exists and they failed to find it. */}
            {criterionOnly > 0 && (
              <>{criterionOnly} weigh academic performance but publish no threshold. </>
            )}
            {notPublished > 0 && (
              <>{notPublished} state no GPA threshold of their own. </>
            )}
            {delegated > 0 && (
              <>{delegated} set no bar themselves and name who does — open the record to see who. </>
            )}
            {notRecorded} of {(records || []).length} records here have not been sourced at all — check those with the provider.
          </p>
        </div>
      )}

      <div className="ingest-drop">
        <input
          ref={fileRef}
          type="file"
          id="ingest-file"
          accept=".docx,.txt,.md,.csv,.json,.pdf,.doc"
          onChange={(e) => handleFile(e.target.files && e.target.files[0])}
          aria-label="Attach a document to read"
        />
        <label htmlFor="ingest-file" className="ingest-drop-label">
          <FileText size={18} />
          <span>
            <b>Choose a document</b>
            <em>.docx and plain text are read here. A PDF is not, yet — the reason is on screen.</em>
          </span>
        </label>
      </div>

      {state.status === 'reading' && (
        <div className="ingest-status" role="status">Reading {state.fileName}…</div>
      )}

      {/* A refusal is shown as a refusal, with the reason the reader needs. An
          empty result would read as "this person has no GPA", which is a
          different and false claim — so the failure path is explicit. */}
      {state.status === 'refused' && (
        <div className="ingest-alert refused" role="alert">
          <AlertTriangle size={16} />
          <span><strong>Not read.</strong> {state.detail}</span>
        </div>
      )}

      {state.status === 'read' && (
        <>
          <div className="ingest-status" role="status">
            Read <b>{state.fileName}</b> — {state.chars.toLocaleString()} characters in a {state.format} file.
          </div>

          {state.proposals.length === 0 ? (
            <div className="ingest-alert empty">
              <FileText size={16} />
              <span><strong>Nothing to propose.</strong> {state.notes.join(' ')} You can type the value into your profile above.</span>
            </div>
          ) : (
            <ul className="proposal-list">
              {state.proposals.map((proposal, index) => (
                <li className={'proposal ' + (proposal.confidence === 'high' ? 'ok' : proposal.confidence)} key={index}>
                  <div className="proposal-main">
                    <b>{proposal.label}</b>
                    <span className="proposal-kicker">{FIELD_LABEL[proposal.field] || proposal.field}</span>
                    {/* The span is the evidence: the reader checks ScholarHub's
                        reading against the document rather than trusting it.
                        Whitespace is collapsed for display only — a table-cell
                        gap would otherwise render as a run of blank space, and
                        the reader would be reading the layout rather than the
                        text ScholarHub actually matched. */}
                    <em className="proposal-span">read from: “{proposal.span.replace(/\s+/g, ' ').trim()}”</em>
                    {proposal.note && <em className="proposal-note">{proposal.note}</em>}
                    {proposal.subs && proposal.subs.length > 0 && (
                      <em className="proposal-sub">{proposal.subs.map((s) => s.skill + ' ' + s.value).join(' · ')}</em>
                    )}
                  </div>
                  <div className="proposal-actions">
                    {proposal.confidence === 'high'
                      ? <button className="outline-btn" onClick={() => onConfirm(proposal, state.fileName)}><Check size={14} /> This is right</button>
                      : <span className="proposal-cannot">Set the value yourself</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="privacy-note">
            <ShieldCheck size={17} />
            <span><strong>Read here, kept here.</strong> Nothing on this page was uploaded. A value is only added to your profile when you confirm it, and a confirmed value is used for nothing except the comparisons shown below.</span>
          </div>
        </>
      )}

      {state.status !== 'idle' && (
        <button className="ghost-btn" onClick={reset} style={{ marginTop: 10 }}>Clear this reading</button>
      )}
    </div>
  );
}
