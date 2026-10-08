// The AI settings view.
//
// Extracted from App.jsx because it is the one view whose shape depends on data
// — the auth panel is different for a key, for a local server, and for a CLI
// session — and because a view that makes network calls deserves to be readable
// rather than minified onto one line.
//
// What this view is careful about:
//
//   * It never claims a connection works. The only statement of success is a
//     reply that actually came back, and the button that produces it is the only
//     thing that says "connected".
//   * It shows where a request goes, per provider, before you send one — and,
//     since v0.31.0, *what* it carries. The egress line used to name only the
//     destination, which understated a request that also carried the reader's
//     profile. Both halves are now stated below the provider name.
//   * It does not pretend Antigravity can be reached from here.

import React, { useState } from 'react';
import {
  KeyRound,
  RefreshCw,
  PlugZap,
  Eye,
  EyeOff,
  Server,
  Cloud,
  Terminal,
  TriangleAlert,
  CircleCheck,
  ExternalLink,
  ShieldCheck,
  Clock3,
  BadgeCheck,
  Link2,
} from 'lucide-react';
import { CATEGORIES, providersInCategory, formatTokens, formatPrice, needsKey, egressSummary } from './providers.js';
import { agyRefusal, formatCost } from './chat.js';

const CATEGORY_ICON = {
  frontier: Cloud,
  inference: Link2,
  local: Server,
  session: Terminal,
};

function AuthPanel({ ai }) {
  const { provider, apiKey, setApiKey, ai: state, setRememberKey } = ai;
  const [reveal, setReveal] = useState(false);

  if (provider.auth === 'none') {
    return (
      <div className="ai-auth ai-auth-none">
        <Server size={17} />
        <div>
          <strong>No credential needed.</strong>
          <p>This provider runs on your own machine and does not ask for a key. Start it, then use the connection test below.</p>
        </div>
      </div>
    );
  }

  if (provider.auth === 'cli-session') {
    const refusal = agyRefusal();
    return (
      <div className="ai-auth ai-auth-cli">
        <div className="ai-auth-head">
          <Terminal size={17} />
          <strong>This one signs in through a CLI, not a key</strong>
        </div>
        <p>{refusal.reason}</p>
        <div className="ai-routes">
          {refusal.routes.map((route) => (
            <div className="ai-route" key={route.title}>
              <b>{route.title}</b>
              <span>{route.detail}</span>
            </div>
          ))}
        </div>
        <p className="ai-auth-foot">
          Either route works from this page. Neither one gives ScholarHub your Google credentials — that is the point.
        </p>
      </div>
    );
  }

  return (
    <div className="ai-auth ai-auth-key">
      <label className="setting-label">
        API key
        <div className="secret-input">
          <input
            type={reveal ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste your key"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="button" onClick={() => setReveal(!reveal)} aria-label={reveal ? 'Hide the key' : 'Show the key'}>
            {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </label>
      <div className="ai-key-row">
        <label className="ai-check">
          <input type="checkbox" checked={!!state.rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
          <span>Keep this key on this device</span>
        </label>
        {provider.keyUrl && (
          <a className="ai-link" href={provider.keyUrl} target="_blank" rel="noreferrer">
            Get a key <ExternalLink size={12} />
          </a>
        )}
      </div>
      <p className="ai-key-note">
        {state.rememberKey
          ? 'Stored in this browser\u2019s local storage. Anyone using this browser profile can read it — do not do this on a shared machine.'
          : 'Held in memory for this tab only. Reloading the page forgets it.'}
      </p>
    </div>
  );
}

export default function AiSettings({ ai, profile }) {
  const {
    ai: state,
    provider,
    // `baseUrl` from the hook is the *effective* one; the input below binds
    // `state.baseUrl`, which is the raw value the reader typed and can still edit.
    // The effective value was destructured and never used.
    chooseProvider,
    setBaseUrl,
    setModel,
    availableModels,
    discovery,
    discoverModels,
    test,
    testConnection,
    busy,
    needsBaseUrl,
    setFallbackModel,
    spend,
    resetSpend,
  } = ai;

  return (
    <>
      <div className="eyebrow muted">OPTIONAL · YOUR MODEL, YOUR CHOICE</div>
      <h1 className="page-title">
        AI, <em>your way.</em>
      </h1>
      <p className="page-lede">
        ScholarHub works without AI. Connect a provider and the assistant can answer with a model you chose, billed to your own
        account. Nothing is proxied: the request leaves this page and goes to the provider you picked.
      </p>

      <div className="settings-card ai-card">
        <div className="settings-row">
          <div className="settings-icon">
            <PlugZap size={19} />
          </div>
          <div>
            <h3>Choose a provider</h3>
            <p>Grouped by how they work. Any of them can be changed or removed at any time.</p>
          </div>
        </div>

        {CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICON[category.id] || Cloud;
          const list = providersInCategory(category.id);
          return (
            <div className="ai-category" key={category.id}>
              <div className="ai-category-head">
                <Icon size={14} />
                <b>{category.label}</b>
                <span>{category.note}</span>
              </div>
              <div className="ai-provider-grid">
                {list.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ai-provider ${state.providerId === item.id ? 'selected' : ''}`}
                    aria-pressed={state.providerId === item.id}
                    onClick={() => chooseProvider(item.id)}
                  >
                    <b>{item.label}</b>
                    <span>{item.auth === 'cli-session' ? 'CLI session' : item.auth === 'none' ? 'No key' : 'API key'}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!provider && (
        <div className="settings-card ai-card ai-empty">
          <TriangleAlert size={17} />
          <span>Pick a provider above to see what connecting involves. Nothing is configured yet, so the assistant stays on the offline guide.</span>
        </div>
      )}

      {provider && (
        <div className="settings-card ai-card">
          <div className="settings-row">
            <div className="settings-icon">
              <BadgeCheck size={19} />
            </div>
            <div>
              <h3>{provider.label}</h3>
              <p>{provider.note}</p>
            </div>
          </div>

          <div className="ai-egress">
            {provider.category === 'local' ? <Server size={14} /> : <Cloud size={14} />}
            <span>{egressSummary(provider, state.baseUrl, profile)}</span>
          </div>

          <label className="setting-label">
            Base URL
            <input
              value={state.baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={provider.baseUrl || 'https://your-gateway.example/v1'}
              spellCheck="false"
              autoComplete="off"
            />
          </label>
          <p className="ai-hint">
            {provider.baseUrl
              ? `Leave empty to use the default, ${provider.baseUrl}.`
              : 'This provider has no default address — enter one.'}
            {needsBaseUrl && <b> Required before anything can be sent.</b>}
          </p>

          <AuthPanel ai={ai} />

          <div className="ai-models">
            <div className="ai-models-head">
              <label className="setting-label ai-model-label">
                Model
                {availableModels.length > 0 ? (
                  <select value={state.model} onChange={(event) => setModel(event.target.value)}>
                    <option value="">Choose a model…</option>
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                        {model.context ? ` · ${formatTokens(model.context)} ctx` : ''}
                        {model.outputPrice ? ` · ${formatPrice(model.outputPrice)}/M out` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  // A local runtime that has nothing pulled, or an endpoint that
                  // has not answered yet, has no list to choose from. Without a
                  // free-text field those providers would be unusable until a
                  // discovery call happened to succeed.
                  <input
                    value={state.model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="Type the model id, e.g. llama3.1:8b"
                    spellCheck="false"
                    autoComplete="off"
                  />
                )}
              </label>
              <button type="button" className="outline-btn" onClick={discoverModels} disabled={discovery.status === 'loading'}>
                <RefreshCw size={14} className={discovery.status === 'loading' ? 'spin' : ''} />
                {discovery.status === 'loading' ? 'Asking…' : 'Refresh list'}
              </button>
            </div>
            {discovery.status !== 'idle' && (
              <p className={`ai-discovery ai-discovery-${discovery.status}`} role="status">
                {discovery.status === 'error' ? <TriangleAlert size={13} /> : discovery.status === 'ok' ? <CircleCheck size={13} /> : null}
                {discovery.message}
              </p>
            )}
            {!discovery.message && availableModels.length > 0 && (
              <p className="ai-hint">
                {availableModels[0].source
                  ? `Seeded from the provider\u2019s own docs on ${availableModels[0].verified}. Refreshing replaces this with what your key can actually reach.`
                  : 'Whatever this provider reports. Refresh to re-read it.'}
              </p>
            )}
            {state.model && (
              <div className="ai-model-detail">
                {(() => {
                  const chosen = availableModels.find((model) => model.id === state.model);
                  if (!chosen) return null;
                  return (
                    <>
                      <span>
                        Context <b>{formatTokens(chosen.context)}</b>
                      </span>
                      <span>
                        Max output <b>{formatTokens(chosen.output)}</b>
                      </span>
                      <span>
                        Price <b>{formatPrice(chosen.inputPrice ?? chosen.input)} / {formatPrice(chosen.outputPrice ?? chosen.output)}</b> per M tokens
                      </span>
                    </>
                  );
                })()}
              </div>
            )}

            {availableModels.length > 1 && (
              <>
                <label className="setting-label ai-fallback-label">
                  If that model is unavailable
                  <select value={state.fallbackModel} onChange={(event) => setFallbackModel(event.target.value)}>
                    <option value="">Do not fall back — report the failure</option>
                    {availableModels
                      .filter((model) => model.id !== state.model)
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="ai-hint">
                  Used only after the first model fails, never instead of it — and the answer always says which model replied.
                </p>
              </>
            )}
          </div>

          {spend.calls > 0 && (
            <div className="ai-spend">
              <span>
                This session: <b>{spend.total > 0 ? formatCost(spend.total) : 'no priced calls'}</b> across {spend.calls} call
                {spend.calls === 1 ? '' : 's'}
                {spend.unpriced > 0 && (
                  <em>
                    {' '}
                    · {spend.unpriced} uncosted — this provider publishes no per-token price for the model, so the cost is unknown
                    rather than zero
                  </em>
                )}
              </span>
              <button type="button" className="link-btn" onClick={resetSpend}>
                Reset
              </button>
            </div>
          )}
          {spend.calls > 0 && (
            <p className="ai-hint">
              Estimated from the per-million-token prices the provider publishes, multiplied by the token counts it reported. It is
              not a bill: caching, batch discounts, tiers and reasoning tokens are not accounted for.
            </p>
          )}

          <div className="provider-info">
            <div>
              <span className={`status-indicator ${test && test.ok ? 'live' : ''}`} />
              {test && test.ok ? 'Connected' : test && test.pending ? 'Testing…' : 'Not tested'}
            </div>
            <button type="button" className="outline-btn" onClick={testConnection} disabled={busy || (test && test.pending)}>
              <PlugZap size={14} /> {test && test.pending ? 'Sending…' : 'Test connection'}
            </button>
          </div>

          {test && !test.pending && (
            <div className={`ai-test ${test.ok ? 'ok' : 'fail'}`} role="status">
              {test.ok ? <CircleCheck size={15} /> : <TriangleAlert size={15} />}
              <div>
                <strong>{test.ok ? 'It works.' : 'That did not work.'}</strong>
                <p>{test.message}</p>
                {test.detail && <p className="ai-test-detail">{test.detail}</p>}
                {test.usage && (
                  <p className="ai-test-detail">
                    {test.usage.input ?? '?'} tokens in, {test.usage.output ?? '?'} out
                  </p>
                )}
                {test.routes && (
                  <div className="ai-routes">
                    {test.routes.map((route) => (
                      <div className="ai-route" key={route.title}>
                        <b>{route.title}</b>
                        <span>{route.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="privacy-note">
            <ShieldCheck size={17} />
            <span>
              <strong>Your key never reaches ScholarHub.</strong> There is no ScholarHub server. The key is used in this page to
              sign a request that goes straight to {provider.label}
              {needsKey(provider) ? '' : ' (which does not require one)'}. Clearing this browser&rsquo;s storage removes everything.
            </span>
          </div>
        </div>
      )}

      <div className="settings-card ai-card ai-roadmap">
        <div className="coming-note">
          <Clock3 size={16} />
          <span>
            <b>Still not built:</b> nothing is stored server-side, there is no request history beyond the session total above, and
            no cost is attributed per scholarship record. Replies stream where the transport supports it and fall back to a single
            request where it does not — the answer says which happened.
          </span>
        </div>
      </div>
    </>
  );
}
