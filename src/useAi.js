// The AI connection, as a hook.
//
// The settings page and the assistant both need the same connection, so the
// state lives in one place rather than being threaded between two views. All of
// the interesting logic is elsewhere — `providers.js` decides what a provider is
// and `chat.js` decides what a request looks like. This file is only the glue:
// where the state is kept, and what happens when a button is pressed.
//
// KEY HANDLING, which is the part worth being careful about:
//
//   * The key is **session-only by default** — held in React state, gone on
//     reload. A reader can opt in to keeping it in localStorage, and the toggle
//     says which is which.
//   * It is never sent anywhere except the provider the reader selected. There
//     is no ScholarHub server to send it to.
//   * It is never written into a request body, and never into a log line or a
//     notice message. The settings panel shows it masked.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  providerById,
  seedModelsFor,
  effectiveBaseUrl,
  needsBaseUrl,
  needsKey,
  egressSummary,
} from './providers.js';
import {
  buildRequest,
  parseResponse,
  buildModelListRequest,
  parseModels,
  canCall,
  describeError,
  describeNetworkFailure,
} from './chat.js';

const AI_KEY = 'sh-ai';
const KEY_KEY = 'sh-ai-key';

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a full or disabled store must not break the page */
  }
};

const DEFAULTS = { providerId: '', baseUrl: '', model: '', rememberKey: false };

export function useAi() {
  const [ai, setAi] = useState(() => ({ ...DEFAULTS, ...read(AI_KEY, {}) }));
  // Session-only unless the reader asked otherwise.
  const [apiKey, setApiKeyState] = useState(() => (read(AI_KEY, {}).rememberKey ? read(KEY_KEY, '') : ''));
  const [models, setModels] = useState({});
  const [discovery, setDiscovery] = useState({ status: 'idle', message: '' });
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);

  const provider = useMemo(() => providerById(ai.providerId), [ai.providerId]);
  const baseUrl = provider ? effectiveBaseUrl(provider, ai.baseUrl) : '';

  // Keep the provider choice on the device (never the key unless asked).
  useEffect(() => {
    write(AI_KEY, ai);
  }, [ai]);

  useEffect(() => {
    if (ai.rememberKey && apiKey) write(KEY_KEY, apiKey);
    else if (!ai.rememberKey) write(KEY_KEY, '');
  }, [ai.rememberKey, apiKey]);

  const setApiKey = useCallback((value) => {
    setApiKeyState(value);
    setTest(null);
  }, []);

  const chooseProvider = useCallback((id) => {
    setAi((prev) => ({ ...prev, providerId: id, baseUrl: '', model: '' }));
    setDiscovery({ status: 'idle', message: '' });
    setTest(null);
  }, []);

  const setBaseUrl = useCallback((value) => {
    setAi((prev) => ({ ...prev, baseUrl: value }));
    setTest(null);
  }, []);

  const setModel = useCallback((value) => {
    setAi((prev) => ({ ...prev, model: value }));
    setTest(null);
  }, []);

  const setRememberKey = useCallback((value) => {
    setAi((prev) => ({ ...prev, rememberKey: value }));
  }, []);

  /**
   * Models to offer: whatever the provider most recently reported, falling back
   * to the sourced seed for a frontier lab. A local runtime has no seed — its
   * roster is literally whatever the reader has pulled.
   */
  const availableModels = useMemo(() => {
    if (!provider) return [];
    const discovered = models[provider.id];
    if (discovered && discovered.length) return discovered;
    return seedModelsFor(provider.id);
  }, [provider, models]);

  /** Ask the provider what it serves. The answer replaces the seed. */
  const discoverModels = useCallback(async () => {
    if (!provider) return;
    const request = buildModelListRequest(provider, { baseUrl: ai.baseUrl, apiKey });
    if (!request) {
      setDiscovery({
        status: 'error',
        message: needsKey(provider) && !apiKey
          ? 'Enter a key first — this provider will not list models without one.'
          : 'This provider does not publish a model list, so the roster above is the sourced seed.',
      });
      return;
    }
    setDiscovery({ status: 'loading', message: '' });
    try {
      const response = await fetch(request.url, { method: request.method, headers: request.headers });
      const text = await response.text();
      if (!response.ok) {
        const described = describeError(provider, response.status, text);
        setDiscovery({ status: 'error', message: described.message });
        return;
      }
      const list = parseModels(provider, JSON.parse(text));
      if (!list.length) {
        setDiscovery({ status: 'error', message: 'The provider answered, but named no models.' });
        return;
      }
      setModels((prev) => ({ ...prev, [provider.id]: list }));
      setDiscovery({ status: 'ok', message: `${list.length} model${list.length === 1 ? '' : 's'} reported by the provider.` });
    } catch (error) {
      // A thrown fetch is the browser refusing to say why — most often CORS.
      setDiscovery({ status: 'error', message: describeNetworkFailure(provider, error).message });
    }
  }, [provider, ai.baseUrl, apiKey]);

  /** Make one real, tiny call so the reader learns the truth rather than a claim. */
  const testConnection = useCallback(async () => {
    if (!provider) return;
    const ready = canCall(provider, { baseUrl: ai.baseUrl, apiKey });
    if (!ready.ok) {
      setTest({ ok: false, message: ready.reason });
      return;
    }
    const model = ai.model || (availableModels[0] && availableModels[0].id) || '';
    if (!model) {
      setTest({ ok: false, message: 'Choose a model first — a connection test has to name one.' });
      return;
    }
    const request = buildRequest(provider, {
      model,
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      maxTokens: 16,
      temperature: 0,
      baseUrl: ai.baseUrl,
      apiKey,
    });
    if (!request.ok) {
      setTest({ ok: false, message: request.reason, routes: request.routes });
      return;
    }
    setTest({ ok: false, pending: true, message: 'Sending one small request…' });
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
      });
      const text = await response.text();
      if (!response.ok) {
        setTest({ ok: false, ...describeError(provider, response.status, text) });
        return;
      }
      const parsed = parseResponse(provider, JSON.parse(text));
      setTest({
        ok: true,
        message: `Connected. ${provider.label} answered using ${parsed.model || model}.`,
        detail: parsed.text ? parsed.text.slice(0, 120) : '',
        usage: parsed.usage,
      });
    } catch (error) {
      setTest({ ok: false, ...describeNetworkFailure(provider, error) });
    }
  }, [provider, ai.baseUrl, ai.model, apiKey, availableModels]);

  /** One chat turn against the configured provider. Returns the text, or null. */
  const chat = useCallback(
    async (messages, { maxTokens = 700 } = {}) => {
      if (!provider) return null;
      const model = ai.model || (availableModels[0] && availableModels[0].id) || '';
      const request = buildRequest(provider, { model, messages, maxTokens, temperature: 0.2, baseUrl: ai.baseUrl, apiKey });
      if (!request.ok) return { error: request.reason, routes: request.routes };
      setBusy(true);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(request.body),
        });
        const text = await response.text();
        if (!response.ok) return { error: describeError(provider, response.status, text).message };
        return { text: parseResponse(provider, JSON.parse(text)).text };
      } catch (error) {
        return { error: describeNetworkFailure(provider, error).message };
      } finally {
        setBusy(false);
      }
    },
    [provider, ai.baseUrl, ai.model, apiKey, availableModels],
  );

  const connected = !!provider && !busy && test && test.ok === true;

  return {
    ai,
    provider,
    baseUrl,
    apiKey,
    setApiKey,
    chooseProvider,
    setBaseUrl,
    setModel,
    setRememberKey,
    availableModels,
    discovery,
    discoverModels,
    test,
    testConnection,
    busy,
    chat,
    connected,
    egress: provider ? egressSummary(provider, ai.baseUrl) : '',
    needsBaseUrl: provider ? needsBaseUrl(provider, ai.baseUrl) : false,
  };
}
