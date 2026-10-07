// The provider adapter seam.
//
// `providers.js` says *what* a provider is; this file turns one into an actual
// HTTP request and reads the answer back. It is pure on purpose: every function
// here takes plain values and returns plain values, so the request shapes for
// four different transports can be unit-tested without a network or a browser.
//
// Two things this file refuses to do:
//
//  1. **Invent a capability.** Antigravity (`agy`) is a real provider with a real
//     login, and a browser cannot use it — see `agyRefusal()`. Rather than
//     pretending, the adapter returns a structured refusal naming the two routes
//     that *do* work from a page.
//
//  2. **Guess why a fetch failed.** A browser gives the same opaque `TypeError`
//     for a DNS failure, a refused connection, and a CORS rejection. The message
//     says so instead of picking one and sounding certain.

import { effectiveBaseUrl, needsKey } from './providers.js';

/** The Anthropic API version the request shape below is written against. */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Why Antigravity cannot be driven from this page, and what can be done instead.
 * Kept as data so the settings panel and the tests read the same explanation.
 */
export function agyRefusal() {
  return {
    ok: false,
    code: 'local-cli-only',
    reason:
      'Antigravity authenticates through the `agy` CLI\u2019s own Google sign-in on your machine. A page in a browser cannot start a process, read that session, or hold your Google credentials \u2014 so there is no key to paste and nothing here can sign in for you.',
    routes: [
      {
        title: 'Use the Gemini API instead',
        detail:
          'Google publishes an Antigravity Agent model on the Gemini API, which a browser can reach with an ordinary API key. Pick the Google provider above and choose `antigravity-preview-09-2026`.',
      },
      {
        title: 'Bridge the CLI through a local gateway',
        detail:
          'Run a local OpenAI-compatible gateway in front of the CLI (a LiteLLM proxy is the usual choice), then point "Any OpenAI-compatible endpoint" at it \u2014 for example http://localhost:4000/v1. The gateway holds the session; this page only talks to localhost.',
      },
    ],
  };
}

/** True when a request can be attempted at all for this provider. */
export function canCall(provider, { baseUrl, apiKey } = {}) {
  if (!provider) return { ok: false, reason: 'No provider selected.' };
  if (provider.transport === 'agy') return agyRefusal();
  const base = effectiveBaseUrl(provider, baseUrl);
  if (!base) return { ok: false, reason: 'Set a base URL for this provider first.' };
  if (needsKey(provider) && !apiKey) {
    return { ok: false, reason: `This provider needs an API key. Get one at ${provider.keyUrl || 'the provider\u2019s console'}.` };
  }
  return { ok: true };
}

/** Split an OpenAI-shaped message list into Anthropic's `system` + `messages`. */
function splitSystem(messages) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const rest = messages
    .filter((message) => message.role !== 'system')
    // Anthropic accepts only `user` and `assistant` in `messages`.
    .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));
  return { system, messages: rest };
}

/**
 * Build the HTTP request for one chat call.
 *
 * @returns {{ok: true, url: string, method: string, headers: object, body: object}
 *          | {ok: false, reason: string, code?: string, routes?: object[]}}
 */
export function buildRequest(provider, { model, messages, maxTokens = 1024, temperature = 0.2, baseUrl, apiKey } = {}) {
  const ready = canCall(provider, { baseUrl, apiKey });
  if (!ready.ok) return ready;
  if (!model) return { ok: false, reason: 'Choose a model first.' };

  const base = effectiveBaseUrl(provider, baseUrl);
  const jsonHeaders = { 'content-type': 'application/json' };

  switch (provider.transport) {
    case 'openai':
      return {
        ok: true,
        url: `${base}/chat/completions`,
        method: 'POST',
        headers: apiKey ? { ...jsonHeaders, authorization: `Bearer ${apiKey}` } : jsonHeaders,
        body: { model, messages, max_tokens: maxTokens, temperature },
      };

    case 'anthropic': {
      const { system, messages: turns } = splitSystem(messages);
      return {
        ok: true,
        url: `${base}/messages`,
        method: 'POST',
        headers: {
          ...jsonHeaders,
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // Anthropic rejects browser-origin calls unless the caller opts in
          // explicitly. Sending it is the documented way to say "this really is
          // a browser, on purpose".
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: { model, max_tokens: maxTokens, temperature, ...(system ? { system } : {}), messages: turns },
      };
    }

    case 'google': {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      return {
        ok: true,
        // The key rides in the query string because that is the shape this API
        // publishes. It is visible in the browser's own network log.
        url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        method: 'POST',
        headers: jsonHeaders,
        body: {
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        },
      };
    }

    case 'ollama':
      return {
        ok: true,
        url: `${base}/api/chat`,
        method: 'POST',
        headers: jsonHeaders,
        body: { model, messages, stream: false, options: { temperature, num_predict: maxTokens } },
      };

    default:
      return { ok: false, reason: `No adapter is implemented for transport "${provider.transport}".` };
  }
}

/** Read the assistant text and usage out of a provider's reply. */
export function parseResponse(provider, json) {
  if (!json || typeof json !== 'object') return { text: '', usage: null, model: null, finishReason: null };

  if (provider.transport === 'openai') {
    const choice = (json.choices || [])[0] || {};
    return {
      text: (choice.message && choice.message.content) || '',
      usage: json.usage ? { input: json.usage.prompt_tokens ?? null, output: json.usage.completion_tokens ?? null } : null,
      model: json.model || null,
      finishReason: choice.finish_reason || null,
    };
  }

  if (provider.transport === 'anthropic') {
    const blocks = Array.isArray(json.content) ? json.content : [];
    return {
      text: blocks.filter((block) => block.type === 'text').map((block) => block.text).join(''),
      usage: json.usage ? { input: json.usage.input_tokens ?? null, output: json.usage.output_tokens ?? null } : null,
      model: json.model || null,
      finishReason: json.stop_reason || null,
    };
  }

  if (provider.transport === 'google') {
    const candidate = (json.candidates || [])[0] || {};
    const parts = (candidate.content && candidate.content.parts) || [];
    return {
      text: parts.map((part) => part.text || '').join(''),
      usage: json.usageMetadata
        ? { input: json.usageMetadata.promptTokenCount ?? null, output: json.usageMetadata.candidatesTokenCount ?? null }
        : null,
      model: json.modelVersion || null,
      finishReason: candidate.finishReason || null,
    };
  }

  if (provider.transport === 'ollama') {
    return {
      text: (json.message && json.message.content) || '',
      usage: json.eval_count != null ? { input: json.prompt_eval_count ?? null, output: json.eval_count } : null,
      model: json.model || null,
      finishReason: json.done_reason || null,
    };
  }

  return { text: '', usage: null, model: null, finishReason: null };
}

/** The request that lists a provider's models, or null when it has none. */
export function buildModelListRequest(provider, { baseUrl, apiKey } = {}) {
  if (!provider || !provider.listModels) return null;
  const base = effectiveBaseUrl(provider, baseUrl);
  if (!base) return null;
  const path = provider.listModels.path;

  if (provider.transport === 'google') {
    if (!apiKey) return null;
    return { url: `${base}${path}?key=${encodeURIComponent(apiKey)}`, method: 'GET', headers: {} };
  }
  if (provider.transport === 'anthropic') {
    if (!apiKey) return null;
    return {
      url: `${base}${path}`,
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' },
    };
  }
  // A hosted OpenAI-shaped endpoint without its key would answer 401, so there
  // is nothing worth sending. A local or key-optional one is fine as-is.
  if (needsKey(provider) && !apiKey) return null;
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  return { url: `${base}${path}`, method: 'GET', headers };
}

/**
 * Normalise a model list into `{id, label, context, output}`.
 *
 * Anything the provider did not state stays null — the picker shows an em dash
 * rather than a number nobody published. This is the same rule the scholarship
 * catalog follows for deadlines.
 */
export function parseModels(provider, json) {
  if (!json || typeof json !== 'object' || !provider || !provider.listModels) return [];
  const pick = provider.listModels.pick;
  const rows = Array.isArray(json[pick]) ? json[pick] : [];

  return rows
    .map((row) => {
      if (provider.transport === 'google') {
        // Gemini reports `name: "models/gemini-3.8-flash"`.
        const id = String(row.name || '').replace(/^models\//, '');
        return { id, label: row.displayName || id, context: row.inputTokenLimit ?? null, output: row.outputTokenLimit ?? null };
      }
      if (provider.transport === 'anthropic') {
        return {
          id: row.id,
          label: row.display_name || row.id,
          context: row.max_input_tokens ?? null,
          output: row.max_tokens ?? null,
        };
      }
      if (provider.transport === 'ollama') {
        return {
          id: row.name,
          label: row.name,
          context: null,
          output: null,
          detail: (row.details && row.details.parameter_size) || null,
        };
      }
      // OpenAI-shaped: `{data: [{id, ...}]}`.
      return {
        id: row.id,
        label: row.name || row.id,
        context: row.context_length ?? row.context_window ?? null,
        output: row.max_output_tokens ?? null,
      };
    })
    .filter((model) => model.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Turn a failed call into something a reader can act on.
 *
 * `kind` is what the UI needs to know: whether the failure was the credential,
 * the address, the provider, or the browser itself.
 */
export function describeError(provider, status, bodyText) {
  const detail = typeof bodyText === 'string' ? bodyText.slice(0, 300) : '';
  let providerMessage = '';
  try {
    const parsed = JSON.parse(bodyText);
    providerMessage = (parsed.error && (parsed.error.message || parsed.error.type)) || parsed.message || '';
  } catch {
    /* not JSON — fall back to the raw text below */
  }

  const base = {
    provider: provider ? provider.label : 'The provider',
    status,
    detail: providerMessage || detail,
  };

  if (status === 401 || status === 403) {
    return { ...base, kind: 'auth', message: `${base.provider} rejected the credential. Check the key, and that it is allowed to use this model.` };
  }
  if (status === 404) {
    return { ...base, kind: 'address', message: `${base.provider} returned 404. The base URL or the model id is usually the cause \u2014 check both.` };
  }
  if (status === 429) {
    return { ...base, kind: 'quota', message: `${base.provider} rate-limited this key. Wait, or use a smaller model.` };
  }
  if (status === 400 || status === 422) {
    return { ...base, kind: 'request', message: `${base.provider} rejected the request itself. The detail below is the provider\u2019s own explanation.` };
  }
  if (status >= 500) {
    return { ...base, kind: 'provider', message: `${base.provider} reported a server error (${status}). That is on their side.` };
  }
  return { ...base, kind: 'unknown', message: `${base.provider} answered with HTTP ${status}.` };
}

/**
 * A `fetch` that never reached the server. Browsers deliberately hide whether
 * that was DNS, a refused connection, or a CORS rejection, so this says all
 * three rather than sounding confident about one.
 */
export function describeNetworkFailure(provider, error) {
  const target = provider ? provider.label : 'the provider';
  const local = provider && provider.category === 'local';
  return {
    kind: 'network',
    status: null,
    provider: target,
    detail: error && error.message ? error.message : '',
    message: local
      ? `Could not reach ${target}. Is the local server actually running on that port?`
      : `The request to ${target} never completed. The browser will not say whether that was a network problem, a blocked origin (CORS), or an offline machine \u2014 only that it did not arrive.`,
  };
}
