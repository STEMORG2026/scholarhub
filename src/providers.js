// The provider registry.
//
// This is the "seam" AGENTS.md asks for: it separates *which* provider and model
// a reader wants from the discovery UI, so a provider can be added or corrected
// in one place. Everything here is data, not behaviour — `src/chat.js` turns a
// provider into an actual request.
//
// Two rules this file keeps, both inherited from the scholarship catalog:
//
//  1. **Model names are discovered, not asserted.** A model roster changes
//     monthly and a hard-coded list is wrong within weeks. Every provider that
//     publishes a list endpoint is queried at runtime, and that answer wins. The
//     `FRONTIER_SEED` below exists only so the picker is not empty before a key
//     is entered; each entry carries the URL it came from and the date it was
//     read, and anything the source did not publish is `null` rather than a
//     plausible guess.
//
//  2. **Auth is declared, not assumed.** A provider says how it authenticates —
//     an API key, nothing (a local server), or a signed-in local CLI session.
//     The settings UI renders a different panel for each. Antigravity is the
//     reason that distinction exists at all: it has no API key to paste.

/** The four kinds of provider, in the order the settings page lists them. */
export const CATEGORIES = [
  {
    id: 'frontier',
    label: 'Frontier labs',
    note: 'First-party APIs from the labs that train the models.',
  },
  {
    id: 'inference',
    label: 'Inference providers',
    note: 'One key, many models, routed by a third party.',
  },
  {
    id: 'local',
    label: 'Local runtimes',
    note: 'Models running on your own machine. Nothing leaves the device.',
  },
  {
    id: 'session',
    label: 'Signed-in session',
    note: 'Reached through a local CLI login rather than an API key.',
  },
];

/**
 * How each provider authenticates. The settings UI keys off this.
 *   api-key      — paste a key; sent directly from the browser to the provider.
 *   none         — a server on your own machine, which needs no credential.
 *   cli-session  — a local CLI holds the login; a browser cannot reach it.
 */
export const AUTH_KINDS = ['api-key', 'none', 'cli-session'];

/**
 * The transports `src/chat.js` implements. A provider names one; the adapter
 * decides the URL shape, the headers and the body.
 */
export const TRANSPORTS = ['openai', 'anthropic', 'google', 'ollama', 'agy'];

export const PROVIDERS = [
  // --- frontier labs --------------------------------------------------------
  {
    id: 'openai',
    label: 'OpenAI',
    category: 'frontier',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/models',
    listModels: { path: '/models', pick: 'data' },
    note: 'First-party OpenAI API. Requests go straight from this page to api.openai.com.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    category: 'frontier',
    transport: 'anthropic',
    auth: 'api-key',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://platform.claude.com/settings/keys',
    docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
    listModels: { path: '/models', pick: 'data' },
    note: 'Anthropic requires an explicit opt-in header before it will accept a browser-origin request; the adapter sends it.',
  },
  {
    id: 'google',
    label: 'Google (Gemini API)',
    category: 'frontier',
    transport: 'google',
    auth: 'api-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    listModels: { path: '/models', pick: 'models' },
    note: 'The Gemini API. This is a different door to Google than the Antigravity CLI below, and it is the one a browser can open.',
  },
  {
    id: 'xai',
    label: 'xAI',
    category: 'frontier',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai/',
    docsUrl: 'https://docs.x.ai/developers/models',
    listModels: { path: '/models', pick: 'data' },
    note: 'Grok models over an OpenAI-compatible endpoint.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    category: 'frontier',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    listModels: { path: '/models', pick: 'data' },
    note: 'OpenAI-compatible. No model list is seeded here — discovery will report what the key can actually reach.',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    category: 'frontier',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    docsUrl: 'https://docs.mistral.ai/getting-started/models/',
    listModels: { path: '/models', pick: 'data' },
    note: 'OpenAI-compatible. Weights for several models are also open, so they can run locally instead.',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    category: 'frontier',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    docsUrl: 'https://docs.cohere.com/docs/compatibility-api',
    listModels: { path: '/models', pick: 'data' },
    note: 'Reached through Cohere\u2019s OpenAI-compatibility endpoint.',
  },

  // --- inference providers --------------------------------------------------
  {
    id: 'openrouter',
    label: 'OpenRouter',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    listModels: { path: '/models', pick: 'data' },
    note: 'One key across many labs. Model ids are namespaced as vendor/model.',
  },
  {
    id: 'groq',
    label: 'Groq',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/models',
    listModels: { path: '/models', pick: 'data' },
    note: 'Serves open-weight models on custom silicon; OpenAI-compatible.',
  },
  {
    id: 'together',
    label: 'Together AI',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    docsUrl: 'https://docs.together.ai/docs/serverless-models',
    listModels: { path: '/models', pick: 'data' },
    note: 'OpenAI-compatible serverless and dedicated endpoints.',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    keyUrl: 'https://fireworks.ai/account/api-keys',
    docsUrl: 'https://docs.fireworks.ai/',
    listModels: { path: '/models', pick: 'data' },
    note: 'OpenAI-compatible; model ids are account-scoped paths.',
  },
  {
    id: 'deepinfra',
    label: 'DeepInfra',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    keyUrl: 'https://deepinfra.com/dash/api_keys',
    docsUrl: 'https://deepinfra.com/models',
    listModels: { path: '/models', pick: 'data' },
    note: 'OpenAI-compatible, priced per token. No roster is seeded here \u2014 discovery reports what the key can reach.',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai/',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    listModels: { path: '/models', pick: 'data' },
    note: 'OpenAI-compatible. Speeds come from their own silicon rather than a GPU rental.',
  },
  {
    id: 'custom-openai',
    label: 'Any OpenAI-compatible endpoint',
    category: 'inference',
    transport: 'openai',
    auth: 'api-key',
    // A self-hosted gateway often needs no credential, so the key is optional
    // here even though the shape is the same.
    keyOptional: true,
    baseUrl: '',
    keyUrl: null,
    docsUrl: null,
    listModels: { path: '/models', pick: 'data' },
    note: 'For a gateway or a provider not listed here. Set the base URL yourself; the key may be left empty if the endpoint does not need one.',
  },

  // --- local runtimes -------------------------------------------------------
  {
    id: 'ollama',
    label: 'Ollama',
    category: 'local',
    transport: 'ollama',
    auth: 'none',
    baseUrl: 'http://localhost:11434',
    keyUrl: null,
    docsUrl: 'https://docs.ollama.com/api',
    listModels: { path: '/api/tags', pick: 'models' },
    note: 'Runs on your machine and needs no key. Model ids are whatever you have pulled.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    category: 'local',
    transport: 'openai',
    auth: 'none',
    baseUrl: 'http://localhost:1234/v1',
    keyUrl: null,
    docsUrl: 'https://lmstudio.ai/docs/app/api',
    listModels: { path: '/models', pick: 'data' },
    note: 'Start the local server in LM Studio first. It speaks the OpenAI shape and ignores the key.',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp server',
    category: 'local',
    transport: 'openai',
    auth: 'none',
    baseUrl: 'http://localhost:8080/v1',
    keyUrl: null,
    docsUrl: 'https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md',
    listModels: { path: '/models', pick: 'data' },
    note: 'The `llama-server` binary. Its model list usually reports a single loaded model.',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    category: 'local',
    transport: 'openai',
    auth: 'none',
    baseUrl: 'http://localhost:8000/v1',
    keyUrl: null,
    docsUrl: 'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
    listModels: { path: '/models', pick: 'data' },
    note: 'For serving on your own hardware. The default port is 8000.',
  },
  {
    id: 'jan',
    label: 'Jan',
    category: 'local',
    transport: 'openai',
    auth: 'none',
    baseUrl: 'http://localhost:1337/v1',
    keyUrl: null,
    docsUrl: 'https://jan.ai/docs',
    listModels: { path: '/models', pick: 'data' },
    note: 'Desktop app with a local OpenAI-compatible server.',
  },
  {
    id: 'localai',
    label: 'LocalAI',
    category: 'local',
    transport: 'openai',
    auth: 'none',
    baseUrl: 'http://localhost:8080/v1',
    keyUrl: null,
    docsUrl: 'https://localai.io/basics/getting_started/',
    listModels: { path: '/models', pick: 'data' },
    note: 'Self-hosted drop-in replacement; the port matches llama.cpp\u2019s, so run only one of them at a time.',
  },

  // --- signed-in session ----------------------------------------------------
  {
    id: 'antigravity',
    label: 'Antigravity (AGY)',
    category: 'session',
    transport: 'agy',
    auth: 'cli-session',
    baseUrl: '',
    keyUrl: null,
    docsUrl: 'https://antigravity.google/',
    listModels: null,
    note: 'Authenticates through the `agy` CLI\u2019s own Google sign-in. There is no key to paste, and a static page cannot reach the CLI — see the connect panel for the two routes that do work from a browser.',
  },
];

/**
 * A small, sourced seed of frontier models so the picker is useful before any
 * key is entered. **Discovery replaces this whenever a provider answers.**
 *
 * Every value here was read from the provider's own documentation on
 * `verified`. A `null` means the source did not publish it on the page that was
 * read — it is not an invitation to estimate. `context` and `output` are tokens;
 * `input`/`outputPrice` are US dollars per million tokens.
 */
export const FRONTIER_SEED = [
  // OpenAI — https://platform.openai.com/docs/models
  { id: 'gpt-6-astra', provider: 'openai', label: 'GPT-6 Astra', context: 1050000, output: 128000, inputPrice: 10, outputPrice: 50, source: 'https://platform.openai.com/docs/models', verified: '2026-10-07' },
  { id: 'gpt-6.1-sol', provider: 'openai', label: 'GPT-6.1 Sol', context: 1050000, output: 128000, inputPrice: 2, outputPrice: 10, source: 'https://platform.openai.com/docs/models', verified: '2026-10-07' },
  { id: 'gpt-6-luna', provider: 'openai', label: 'GPT-6 Luna', context: 1050000, output: 128000, inputPrice: 0.1, outputPrice: 0.5, source: 'https://platform.openai.com/docs/models', verified: '2026-10-07' },

  // Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview
  { id: 'claude-fable-5-1', provider: 'anthropic', label: 'Claude Fable 5.1', context: 1000000, output: 128000, inputPrice: 10, outputPrice: 50, source: 'https://platform.claude.com/docs/en/about-claude/models/overview', verified: '2026-10-07' },
  { id: 'claude-opus-5-5', provider: 'anthropic', label: 'Claude Opus 5.5', context: 1000000, output: 128000, inputPrice: 4, outputPrice: 20, source: 'https://platform.claude.com/docs/en/about-claude/models/overview', verified: '2026-10-07' },
  { id: 'claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5', context: 1000000, output: 128000, inputPrice: 2, outputPrice: 10, source: 'https://platform.claude.com/docs/en/about-claude/models/overview', verified: '2026-10-07' },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: 'Claude Haiku 4.5', context: 200000, output: 64000, inputPrice: 1, outputPrice: 5, source: 'https://platform.claude.com/docs/en/about-claude/models/overview', verified: '2026-10-07' },

  // Google — https://ai.google.dev/gemini-api/docs/models
  // The models index publishes ids only; per-model pages carry the limits, which
  // were not read, so those stay null rather than being filled in.
  { id: 'gemini-3.8-flash', provider: 'google', label: 'Gemini 3.8 Flash', context: null, output: null, inputPrice: null, outputPrice: null, source: 'https://ai.google.dev/gemini-api/docs/models', verified: '2026-10-07' },
  { id: 'gemini-3.7-flash', provider: 'google', label: 'Gemini 3.7 Flash', context: null, output: null, inputPrice: null, outputPrice: null, source: 'https://ai.google.dev/gemini-api/docs/models', verified: '2026-10-07' },
  { id: 'gemini-3.6-flash', provider: 'google', label: 'Gemini 3.6 Flash', context: null, output: null, inputPrice: null, outputPrice: null, source: 'https://ai.google.dev/gemini-api/docs/models', verified: '2026-10-07' },
  { id: 'gemini-3.1-pro-preview', provider: 'google', label: 'Gemini 3.1 Pro (preview)', context: null, output: null, inputPrice: null, outputPrice: null, source: 'https://ai.google.dev/gemini-api/docs/models', verified: '2026-10-07' },
  { id: 'antigravity-preview-09-2026', provider: 'google', label: 'Antigravity Agent (Gemini API)', context: null, output: null, inputPrice: null, outputPrice: null, source: 'https://ai.google.dev/gemini-api/docs/models', verified: '2026-10-07' },

  // xAI — https://docs.x.ai/developers/models
  { id: 'grok-4.7', provider: 'xai', label: 'Grok 4.7', context: 500000, output: null, inputPrice: 2, outputPrice: 6, source: 'https://docs.x.ai/developers/models', verified: '2026-10-07' },
];

/** Providers a reader may choose, in registry order. */
export function allProviders() {
  return PROVIDERS;
}

/** Providers in one category, in registry order. */
export function providersInCategory(categoryId) {
  return PROVIDERS.filter((provider) => provider.category === categoryId);
}

/** The provider with this id, or null. */
export function providerById(id) {
  return PROVIDERS.find((provider) => provider.id === id) || null;
}

/** True when the id names a provider the registry knows. */
export function isKnownProvider(id) {
  return PROVIDERS.some((provider) => provider.id === id);
}

/** Every seeded model for a provider. Used only until discovery answers. */
export function seedModelsFor(providerId) {
  return FRONTIER_SEED.filter((model) => model.provider === providerId);
}

/**
 * The base URL to use: the reader's override when they set one, otherwise the
 * registry default. An empty result means the provider needs the reader to
 * supply one (see `custom-openai` and `antigravity`).
 */
export function effectiveBaseUrl(provider, override) {
  if (typeof override === 'string' && override.trim()) return override.trim().replace(/\/+$/, '');
  return provider && provider.baseUrl ? provider.baseUrl : '';
}

/** True when a provider cannot work without a reader-supplied base URL. */
export function needsBaseUrl(provider, override) {
  return !effectiveBaseUrl(provider, override);
}

/** True when the provider needs a credential before a request can be made. */
export function needsKey(provider) {
  return !!provider && provider.auth === 'api-key' && !provider.keyOptional;
}

/**
 * A short, honest summary of what connecting will do, for the panel header.
 * Deliberately never says "secure" or "private" — it says where the request goes.
 */
export function egressSummary(provider, override) {
  if (!provider) return '';
  if (provider.transport === 'agy') {
    return 'Not reachable from a browser. Nothing on this page can sign in to Antigravity.';
  }
  const base = effectiveBaseUrl(provider, override);
  if (provider.category === 'local') {
    return `Requests go to ${base || 'a local server'} on this device. Nothing is sent to the internet by ScholarHub.`;
  }
  if (!base) return 'Set a base URL before this can be used.';
  let host = base;
  try {
    host = new URL(base).host;
  } catch {
    /* keep the raw string when it is not a URL yet */
  }
  return `Requests go directly from this page to ${host}. ScholarHub has no server and never sees your key.`;
}

/** Mask a key for display: enough to recognise, not enough to use. */
export function maskKey(key) {
  if (typeof key !== 'string' || !key) return '';
  if (key.length <= 8) return '\u2022'.repeat(key.length);
  return key.slice(0, 3) + '\u2022'.repeat(Math.min(12, key.length - 7)) + key.slice(-4);
}

/** A display string for a token count, or an em dash when it was not published. */
export function formatTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '\u2014';
  if (value >= 1000000) return (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1) + 'M';
  if (value >= 1000) return Math.round(value / 1000) + 'K';
  return String(value);
}

/** A display string for a per-million-token price, or an em dash. */
export function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '\u2014';
  return '$' + (value < 1 ? value.toFixed(2) : String(value));
}
