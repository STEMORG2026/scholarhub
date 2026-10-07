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
      settings: ['Choose a provider'],
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
      settings: ['Choose a provider'],
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

await server.close();

if (failures.length) {
  console.error(`\nRender smoke test FAILED — ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Render smoke test passed: ${rendered} renders across ${VIEWS.length} views × ${SCENARIOS.length} scenarios, 0 uncaught errors.`,
);
