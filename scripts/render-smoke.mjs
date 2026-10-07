#!/usr/bin/env node
// Render smoke test — the gate that catches a runtime error inside a view.
//
// WHY THIS EXISTS
// ---------------
// `node --test` reads the catalog and the pure modules, but never renders the
// component. `npm run build` compiles the component, but a build only proves an
// identifier is *referenced*, never that it *exists* at runtime. Between them
// they left a hole big enough for a real defect to sit in for six versions: the
// shortlist view still read `FLAG[s.country]` long after the hand-written flag
// table was deleted, so opening *My shortlist* with anything saved threw
// `ReferenceError: FLAG is not defined` and blanked the app — with every test
// green and every build clean.
//
// WHAT IT DOES
// ------------
// Loads src/App.jsx through Vite's SSR transform (so the JSX and the CSS import
// both work, with no extra dependency) and renders **every view** twice: once
// against an empty browser and once against a populated one. Rendering is the
// only thing that executes a view's branches, and the populated pass is what
// exercises the branches that only run when there is data — which is exactly
// where the crash lived.
//
// No browser, no jsdom, no new dependency. `renderToStaticMarkup` does not run
// effects, so nothing here needs a DOM beyond a localStorage stub.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- a minimal localStorage -------------------------------------------------
// `stored()` in App.jsx is already defensive (it try/catches and falls back), so
// this stub only has to be good enough for the happy path.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// --- scenarios --------------------------------------------------------------
// Record ids are read from the catalog rather than hardcoded, so this test keeps
// working as the data changes: one record that carries a single closing date and
// one that does not.
const scholarships = JSON.parse(readFileSync(resolve(root, 'data/scholarships.json'), 'utf8'));
const dated = scholarships.find((entry) => entry.deadline);
const undated = scholarships.find((entry) => !entry.deadline);
if (!dated || !undated) throw new Error('catalog no longer has both a dated and an undated record to exercise the tracker');

const SCENARIOS = [
  {
    name: 'empty browser',
    storage: {},
    expect: {
      discover: ['Find funding for'],
      saved: ['Your shortlist is waiting'],
      tracker: ['Nothing tracked yet'],
      profile: ['Application documents', 'Your study goals'],
      assistant: ['Where would you like to begin?'],
      settings: ['Loading AI settings'],
    },
  },
  {
    name: 'populated browser',
    storage: {
      'sh-saved': JSON.stringify([dated.id, undated.id]),
      'sh-tracker': JSON.stringify({
        [dated.id]: { status: 'planning', addedAt: '2026-01-01' },
        [undated.id]: { status: 'submitted', addedAt: '2026-01-01' },
      }),
      'sh-docs': JSON.stringify(['passport']),
      'sh-profile': JSON.stringify({
        field: 'Civil Engineering',
        degree: 'Master',
        nationality: 'Nepal',
        gpa: '3.7 / 4.0',
      }),
    },
    // The saved and tracker views render their card lists only in this pass —
    // this is the branch the FLAG crash lived in.
    expect: {
      discover: ['Find funding for'],
      saved: [dated.name, undated.name],
      tracker: [dated.name, undated.name],
      profile: ['Application documents', 'of 10 ready'],
      assistant: ['Where would you like to begin?'],
      settings: ['Loading AI settings'],
    },
  },
];

const VIEWS = ['discover', 'saved', 'tracker', 'profile', 'assistant', 'settings'];

// React escapes text as it serialises, so a record called "Excellence Scholarship
// & Opportunity Programme" arrives as "&amp;". Compare against decoded text, or
// the assertion fails on the escaping rather than on the app. `&amp;` is decoded
// last so that an entity which was already escaped is not decoded twice.
const decode = (html) =>
  html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

// --- run --------------------------------------------------------------------
const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

// React and react-dom come in as ordinary imports rather than through
// `ssrLoadModule`: they are CommonJS, and Vite would try to inline them as ES
// modules and fail on `module is not defined`. Vite externalises node_modules
// for SSR by default, so App.jsx resolves the same React instance this file
// holds.
let App;
try {
  ({ default: App } = await server.ssrLoadModule('/src/App.jsx'));
} catch (error) {
  console.error('\nRender smoke test could not load the app at all:\n');
  console.error(error);
  await server.close();
  process.exit(1);
}

// The AI settings view is lazily loaded in the browser, so rendering `App` on
// the settings view only reaches its Suspense fallback. Render it here directly,
// with the real `useAi` hook, so that taking it off the main bundle does not
// also take it out of reach of this test. The hook is real rather than a stub,
// so a change to its contract cannot drift silently past this file.
let AiSettings;
let useAi;
try {
  ({ default: AiSettings } = await server.ssrLoadModule('/src/AiSettings.jsx'));
  ({ useAi } = await server.ssrLoadModule('/src/useAi.js'));
} catch (error) {
  console.error('\nRender smoke test could not load the AI settings view:\n');
  console.error(error);
  await server.close();
  process.exit(1);
}

function AiHarness() {
  const ai = useAi();
  return React.createElement(AiSettings, { ai });
}

/**
 * One case per auth kind, because the auth panel is the part of this view that
 * changes shape — a key, no key, and a CLI session that a browser cannot reach.
 * If any of those branches throws, the settings page is blank for that reader.
 */
const AI_CASES = [
  {
    name: 'AI settings — nothing configured',
    storage: {},
    expect: ['Choose a provider', 'Frontier labs', 'Inference providers', 'Local runtimes', 'Signed-in session'],
  },
  {
    name: 'AI settings — a hosted provider (API key)',
    storage: { 'sh-ai': JSON.stringify({ providerId: 'openai', baseUrl: '', model: 'gpt-6-astra', rememberKey: false }) },
    expect: ['OpenAI', 'API key', 'gpt-6-astra', 'api.openai.com', 'Get a key'],
  },
  {
    name: 'AI settings — a local runtime (no key)',
    storage: { 'sh-ai': JSON.stringify({ providerId: 'ollama', baseUrl: '', model: '', rememberKey: false }) },
    expect: ['Ollama', 'No credential needed', 'localhost:11434'],
  },
  {
    name: 'AI settings — the CLI-session provider',
    storage: { 'sh-ai': JSON.stringify({ providerId: 'antigravity', baseUrl: '', model: '', rememberKey: false }) },
    expect: ['Antigravity', 'signs in through a CLI', 'antigravity-preview-09-2026', 'localhost:4000'],
  },
  {
    name: 'AI settings — a key remembered on the device',
    storage: {
      'sh-ai': JSON.stringify({ providerId: 'anthropic', baseUrl: '', model: 'claude-opus-5-5', rememberKey: true }),
      'sh-ai-key': JSON.stringify('sk-ant-not-a-real-key'),
    },
    expect: ['Anthropic', 'claude-opus-5-5', 'local storage'],
  },
  {
    name: 'AI settings — a fallback model chosen',
    storage: {
      'sh-ai': JSON.stringify({ providerId: 'openai', baseUrl: '', model: 'gpt-6-astra', fallbackModel: 'gpt-6-luna', rememberKey: false }),
    },
    expect: ['If that model is unavailable', 'GPT-6 Luna', 'which model replied'],
  },
];

const failures = [];
let rendered = 0;

for (const scenario of SCENARIOS) {
  for (const view of VIEWS) {
    store.clear();
    for (const [key, value] of Object.entries(scenario.storage)) store.set(key, value);

    const label = `${scenario.name} → ${view}`;
    let html;
    try {
      html = renderToStaticMarkup(React.createElement(App, { initialView: view }));
    } catch (error) {
      // The whole point of this test: a view that throws on render is a blank
      // page for the reader, and nothing else in the suite would notice.
      failures.push(`${label}: threw ${error.constructor.name}: ${error.message}`);
      continue;
    }

    rendered += 1;
    if (!html || html.length < 200) {
      failures.push(`${label}: rendered almost nothing (${html ? html.length : 0} chars)`);
      continue;
    }
    const text = decode(html);
    for (const needle of scenario.expect[view] || []) {
      if (!text.includes(needle)) failures.push(`${label}: expected to find ${JSON.stringify(needle)}`);
    }
  }
}

// --- the AI settings view, rendered directly --------------------------------
for (const scenario of AI_CASES) {
  store.clear();
  for (const [key, value] of Object.entries(scenario.storage)) store.set(key, value);

  let html;
  try {
    html = renderToStaticMarkup(React.createElement(AiHarness));
  } catch (error) {
    failures.push(`${scenario.name}: threw ${error.constructor.name}: ${error.message}`);
    continue;
  }

  rendered += 1;
  const text = decode(html);
  for (const needle of scenario.expect) {
    if (!text.includes(needle)) failures.push(`${scenario.name}: expected to find ${JSON.stringify(needle)}`);
  }
}

// A stored key must reach exactly one place: the password field the reader
// types into. That field's own `value` is not a leak — a controlled input has to
// hold it, and it is masked on screen — but the key must never reach visible
// text, a title, an aria-label, a placeholder, or anything else a screenshot,
// a screen reader or a copied page would expose.
const SECRET = 'sk-ant-SECRET-DO-NOT-RENDER';
store.clear();
store.set('sh-ai', JSON.stringify({ providerId: 'anthropic', baseUrl: '', model: 'claude-opus-5-5', rememberKey: true }));
store.set('sh-ai-key', JSON.stringify(SECRET));
try {
  const html = renderToStaticMarkup(React.createElement(AiHarness));
  rendered += 1;

  const escaped = SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutFieldValue = html.replace(new RegExp(`value="${escaped}"`, 'g'), 'value="[the field itself]"');

  if (withoutFieldValue.includes(SECRET)) {
    failures.push('AI settings: the key reached an attribute or a text node other than the password field it belongs to');
  }
  if (withoutFieldValue.replace(/<[^>]*>/g, ' ').includes(SECRET)) {
    failures.push('AI settings: the key was rendered as visible text');
  }
  if (!html.includes('type="password"')) {
    failures.push('AI settings: the field holding a remembered key is not a password input');
  }
} catch (error) {
  failures.push(`AI settings (key leak check): threw ${error.message}`);
}

await server.close();

if (failures.length) {
  console.error(`\nRender smoke test FAILED — ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Render smoke test passed: ${rendered} renders across ${VIEWS.length} views × ${SCENARIOS.length} scenarios plus ${AI_CASES.length} AI-settings cases, 0 uncaught errors.`,
);
