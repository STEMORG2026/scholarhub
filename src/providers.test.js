import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  AUTH_KINDS,
  TRANSPORTS,
  PROVIDERS,
  FRONTIER_SEED,
  allProviders,
  providersInCategory,
  providerById,
  isKnownProvider,
  seedModelsFor,
  effectiveBaseUrl,
  needsBaseUrl,
  needsKey,
  egressSummary,
  maskKey,
  formatTokens,
  formatPrice,
} from './providers.js';

const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

// --- registry integrity -----------------------------------------------------

test('provider ids are unique and kebab-case', () => {
  const ids = PROVIDERS.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate provider id');
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('every provider declares a category, a transport and an auth kind the app knows', () => {
  for (const provider of PROVIDERS) {
    assert.ok(CATEGORY_IDS.includes(provider.category), `${provider.id} has unknown category ${provider.category}`);
    assert.ok(TRANSPORTS.includes(provider.transport), `${provider.id} has unknown transport ${provider.transport}`);
    assert.ok(AUTH_KINDS.includes(provider.auth), `${provider.id} has unknown auth kind ${provider.auth}`);
  }
});

test('every provider explains itself, so no card renders an empty note', () => {
  for (const provider of PROVIDERS) {
    assert.ok(typeof provider.note === 'string' && provider.note.length > 20, `${provider.id} has no useful note`);
  }
});

test('a provider that needs a key says where to get one', () => {
  for (const provider of PROVIDERS) {
    if (!needsKey(provider)) continue;
    assert.ok(provider.keyUrl, `${provider.id} needs a key but has no keyUrl`);
    assert.match(provider.keyUrl, /^https:\/\//);
  }
});

test('a provider that needs no key does not advertise a key page', () => {
  for (const provider of PROVIDERS) {
    if (provider.auth === 'none') assert.equal(provider.keyUrl, null, `${provider.id} is local but links a key page`);
  }
});

test('every documented link is https', () => {
  for (const provider of PROVIDERS) {
    for (const field of ['docsUrl', 'keyUrl']) {
      if (provider[field] === null || provider[field] === undefined) continue;
      assert.match(provider[field], /^https:\/\//, `${provider.id}.${field} is not https`);
    }
  }
});

test('every category has at least one provider', () => {
  for (const category of CATEGORIES) {
    assert.ok(providersInCategory(category.id).length > 0, `category ${category.id} is empty, so the settings page would show a heading with nothing under it`);
  }
});

test('only a local provider is allowed to default to localhost', () => {
  // A non-local provider pointed at localhost by default would silently send a
  // reader's key to whatever happens to be listening on their machine.
  for (const provider of PROVIDERS) {
    const isLocalhost = /localhost|127\.0\.0\.1/.test(provider.baseUrl || '');
    if (isLocalhost) assert.equal(provider.category, 'local', `${provider.id} defaults to localhost but is not a local provider`);
  }
});

test('the provider list is reachable through its helpers', () => {
  assert.equal(allProviders().length, PROVIDERS.length);
  assert.equal(providerById('openai').label, 'OpenAI');
  assert.equal(providerById('nope'), null);
  assert.equal(isKnownProvider('openai'), true);
  assert.equal(isKnownProvider('nope'), false);
});

// --- the signed-in-session provider ----------------------------------------

test('Antigravity is present as a session provider with no key to paste', () => {
  const agy = providerById('antigravity');
  assert.ok(agy, 'the Antigravity provider is missing');
  assert.equal(agy.transport, 'agy');
  assert.equal(agy.auth, 'cli-session');
  assert.equal(agy.keyUrl, null, 'there is no key page for a CLI session');
  assert.equal(needsKey(agy), false);
  assert.equal(needsBaseUrl(agy, ''), true, 'it has no default address, so a reader must supply one');
});

// --- the frontier seed ------------------------------------------------------

test('every seeded model names a provider that exists', () => {
  const bad = FRONTIER_SEED.filter((model) => !isKnownProvider(model.provider));
  assert.deepEqual(bad.map((model) => model.id), [], 'a seeded model points at an unknown provider');
});

test('every seeded model carries provenance', () => {
  for (const model of FRONTIER_SEED) {
    assert.match(model.source, /^https:\/\//, `${model.id} has no source URL`);
    assert.match(model.verified, /^\d{4}-\d{2}-\d{2}$/, `${model.id} has no verified date`);
    assert.ok(model.label && model.label.length, `${model.id} has no label`);
  }
});

test('an unpublished number is null, never a guess', () => {
  // The rule the scholarship catalog follows for deadlines, applied to limits
  // and prices: absent means absent, and the UI prints an em dash.
  for (const model of FRONTIER_SEED) {
    for (const field of ['context', 'output', 'inputPrice', 'outputPrice']) {
      const value = model[field];
      assert.ok(value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0), `${model.id}.${field} is neither null nor a real number (${value})`);
    }
  }
});

test('the seed covers more than one lab, or it is not a frontier list', () => {
  const providers = new Set(FRONTIER_SEED.map((model) => model.provider));
  assert.ok(providers.size >= 3, `the seed spans only ${providers.size} provider(s)`);
});

test('seedModelsFor filters to one provider', () => {
  const openai = seedModelsFor('openai');
  assert.ok(openai.length > 0);
  assert.ok(openai.every((model) => model.provider === 'openai'));
  assert.deepEqual(seedModelsFor('ollama'), [], 'a local runtime has no seeded roster — it is whatever is pulled');
});

// --- addressing -------------------------------------------------------------

test('a reader override wins over the registry default, without a trailing slash', () => {
  const openai = providerById('openai');
  assert.equal(effectiveBaseUrl(openai, ''), 'https://api.openai.com/v1');
  assert.equal(effectiveBaseUrl(openai, 'http://localhost:4000/v1/'), 'http://localhost:4000/v1');
  assert.equal(effectiveBaseUrl(openai, '   '), 'https://api.openai.com/v1', 'whitespace is not an override');
  assert.equal(effectiveBaseUrl(providerById('custom-openai'), ''), '');
});

test('a provider with no default address reports that it needs one', () => {
  assert.equal(needsBaseUrl(providerById('custom-openai'), ''), true);
  assert.equal(needsBaseUrl(providerById('custom-openai'), 'http://localhost:4000/v1'), false);
  assert.equal(needsBaseUrl(providerById('openai'), ''), false);
});

// --- what the reader is told ------------------------------------------------

test('the egress line names a destination and never promises safety', () => {
  for (const provider of PROVIDERS) {
    const line = egressSummary(provider, '');
    assert.ok(typeof line === 'string' && line.length > 0, `${provider.id} produced no egress line`);
    // "secure"/"private"/"safe" would be claims this app cannot support.
    assert.doesNotMatch(line, /\b(secure|private|safe|encrypted)\b/i, `${provider.id} makes a security claim: ${line}`);
  }
});

test('a local provider says the request stays on the device', () => {
  const line = egressSummary(providerById('ollama'), '');
  assert.match(line, /this device/i);
  assert.match(line, /localhost:11434/, 'the destination should be named');
  // The line may mention the internet — saying nothing is sent there is the
  // point — but it must not name one as the destination.
  assert.doesNotMatch(line, /go(?:es)? directly from this page to [^.]*\.(?:com|ai|io|org)/i);
});

test('a hosted provider names the host it will actually contact', () => {
  const line = egressSummary(providerById('openai'), '');
  assert.match(line, /api\.openai\.com/);
});

test('Antigravity says plainly that a browser cannot reach it', () => {
  const line = egressSummary(providerById('antigravity'), '');
  assert.match(line, /not reachable from a browser/i);
});

test('a provider with no address tells the reader to set one', () => {
  assert.match(egressSummary(providerById('custom-openai'), ''), /set a base url/i);
});

// --- key handling -----------------------------------------------------------

test('a masked key never reveals the whole key', () => {
  const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz012345';
  const masked = maskKey(key);
  assert.notEqual(masked, key);
  assert.ok(!masked.includes(key));
  assert.ok(masked.includes('\u2022'));
  assert.equal(masked.slice(0, 3), key.slice(0, 3));
  assert.equal(masked.slice(-4), key.slice(-4));
});

test('a short key is masked entirely rather than mostly shown', () => {
  assert.equal(maskKey('abc'), '\u2022\u2022\u2022');
  assert.equal(maskKey('12345678'), '\u2022'.repeat(8));
  assert.equal(maskKey(''), '');
  assert.equal(maskKey(undefined), '');
});

// --- formatting -------------------------------------------------------------

test('token counts format, and an unpublished one is an em dash', () => {
  assert.equal(formatTokens(1050000), '1.1M');
  assert.equal(formatTokens(1000000), '1M');
  assert.equal(formatTokens(500000), '500K');
  assert.equal(formatTokens(512), '512');
  assert.equal(formatTokens(null), '\u2014');
  assert.equal(formatTokens(undefined), '\u2014');
  assert.equal(formatTokens('1000'), '\u2014', 'a string is not a token count');
});

test('prices format, and an unpublished one is an em dash', () => {
  assert.equal(formatPrice(10), '$10');
  assert.equal(formatPrice(0.1), '$0.10');
  assert.equal(formatPrice(null), '\u2014');
  assert.equal(formatPrice(undefined), '\u2014');
});
