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

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  buildStreamRequest,
  parseStreamChunk,
  splitStreamBuffer,
  mergeUsage,
  estimateCost,
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

const DEFAULTS = { providerId: '', baseUrl: '', model: '', fallbackModel: '', rememberKey: false };
const EMPTY_SPEND = { total: 0, calls: 0, unpriced: 0, last: null };

/** True when this browser can read a response body as a stream. */
const canStream = () => typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';

export function useAi() {
  const [ai, setAi] = useState(() => ({ ...DEFAULTS, ...read(AI_KEY, {}) }));
  // Session-only unless the reader asked otherwise.
  const [apiKey, setApiKeyState] = useState(() => (read(AI_KEY, {}).rememberKey ? read(KEY_KEY, '') : ''));
  const [models, setModels] = useState({});
  const [discovery, setDiscovery] = useState({ status: 'idle', message: '' });
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState(EMPTY_SPEND);

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
    setAi((prev) => ({ ...prev, providerId: id, baseUrl: '', model: '', fallbackModel: '' }));
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

  const setFallbackModel = useCallback((value) => {
    setAi((prev) => ({ ...prev, fallbackModel: value }));
  }, []);

  const setRememberKey = useCallback((value) => {
    setAi((prev) => ({ ...prev, rememberKey: value }));
  }, []);

  const resetSpend = useCallback(() => setSpend(EMPTY_SPEND), []);

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

  const modelById = useCallback(
    (id) => availableModels.find((model) => model.id === id) || null,
    [availableModels],
  );

  const primaryModel = ai.model || (availableModels[0] && availableModels[0].id) || '';

  /** Fold a reported usage into the running spend, and return this call's cost. */
  const recordSpend = useCallback(
    (modelId, usage) => {
      const cost = estimateCost(modelById(modelId), usage);
      setSpend((prev) => ({
        total: cost ? prev.total + cost.total : prev.total,
        calls: prev.calls + 1,
        unpriced: cost ? prev.unpriced : prev.unpriced + 1,
        last: cost ? { ...cost, model: modelId } : null,
      }));
      return cost;
    },
    [modelById],
  );

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
        setDiscovery({ status: 'error', message: describeError(provider, response.status, text).message });
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
      setDiscovery({ status: 'error', message: describeNetworkFailure(provider, error).message });
    }
  }, [provider, ai.baseUrl, apiKey]);

  /** One non-streaming call, to a named model. */
  const callOnce = useCallback(
    async (modelId, messages, maxTokens) => {
      const request = buildRequest(provider, {
        model: modelId,
        messages,
        maxTokens,
        temperature: 0.2,
        baseUrl: ai.baseUrl,
        apiKey,
      });
      if (!request.ok) return { error: request.reason, routes: request.routes };
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(request.body),
        });
        const text = await response.text();
        if (!response.ok) {
          const described = describeError(provider, response.status, text);
          return { error: described.message, kind: described.kind };
        }
        const parsed = parseResponse(provider, JSON.parse(text));
        return {
          text: parsed.text,
          usage: parsed.usage,
          model: parsed.model || modelId,
          cost: recordSpend(modelId, parsed.usage),
        };
      } catch (error) {
        const described = describeNetworkFailure(provider, error);
        return { error: described.message, kind: described.kind };
      }
    },
    [provider, ai.baseUrl, apiKey, recordSpend],
  );

  /**
   * Make one real, tiny call so the reader learns the truth rather than a claim.
   * Uses the non-streaming path deliberately: a connection test should prove the
   * simplest thing that can work.
   */
  const testConnection = useCallback(async () => {
    if (!provider) return;
    const ready = canCall(provider, { baseUrl: ai.baseUrl, apiKey });
    if (!ready.ok) {
      setTest({ ok: false, message: ready.reason });
      return;
    }
    if (!primaryModel) {
      setTest({ ok: false, message: 'Choose a model first — a connection test has to name one.' });
      return;
    }
    setTest({ ok: false, pending: true, message: 'Sending one small request…' });
    const result = await callOnce(primaryModel, [{ role: 'user', content: 'Reply with the single word: ready' }], 16);
    if (result.error) {
      setTest({ ok: false, error: true, message: result.error, routes: result.routes });
      return;
    }
    setTest({
      ok: true,
      message: `Connected. ${provider.label} answered using ${result.model}.`,
      detail: result.text ? result.text.slice(0, 120) : '',
      usage: result.usage,
      cost: result.cost,
    });
  }, [provider, ai.baseUrl, apiKey, primaryModel, callOnce]);

  /**
   * One chat turn, non-streaming, with an optional fallback model.
   *
   * The fallback is **explicit and disclosed**: it only runs when the reader set
   * one, it only runs after the primary failed, and the result says which model
   * actually answered. Silently swapping models would be the kind of quiet
   * substitution this project tries not to do.
   */
  const chat = useCallback(
    async (messages, { maxTokens = 700 } = {}) => {
      if (!provider) return { error: 'No provider selected.' };
      const first = await callOnce(primaryModel, messages, maxTokens);
      if (!first.error) return first;
      const alternate = ai.fallbackModel;
      if (!alternate || alternate === primaryModel) return first;
      const retry = await callOnce(alternate, messages, maxTokens);
      if (retry.error) return { ...first, alsoTried: alternate, retryError: retry.error };
      return { ...retry, fellBackFrom: primaryModel };
    },
    [provider, primaryModel, ai.fallbackModel, callOnce],
  );

  /**
   * One chat turn, streaming where the transport supports it.
   *
   * Streaming is attempted, never assumed. It falls back to a single call when
   * the browser cannot read a stream, when the provider refuses the streaming
   * request (a compatible server may not recognise `stream_options`), or when
   * the stream ends without producing any text — because a stream that yields
   * nothing is a failure, not an empty answer.
   */
  const chatStream = useCallback(
    async (messages, { maxTokens = 700, onDelta } = {}) => {
      if (!provider) return { error: 'No provider selected.' };
      const request = buildStreamRequest(provider, {
        model: primaryModel,
        messages,
        maxTokens,
        temperature: 0.2,
        baseUrl: ai.baseUrl,
        apiKey,
      });
      if (!request.ok) return { error: request.reason, routes: request.routes };

      const plain = async (reason) => {
        const result = await chat(messages, { maxTokens });
        if (result && result.text && onDelta) onDelta(result.text);
        return reason ? { ...result, streamFallback: reason } : result;
      };

      if (!request.streaming || !canStream()) {
        return plain(request.streaming ? 'this browser cannot read a stream' : 'this provider does not stream');
      }

      setBusy(true);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(request.body),
        });
        if (!response.ok || !response.body) {
          return plain('the provider refused the streaming request');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let text = '';
        let usage = null;
        let answeredModel = null;
        let streamError = null;
        let finished = false;

        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          const split = splitStreamBuffer(buffer + decoder.decode(value, { stream: true }));
          buffer = split.remainder;
          for (const line of split.lines) {
            const chunk = parseStreamChunk(provider, line);
            usage = mergeUsage(usage, chunk.usage);
            if (chunk.model) answeredModel = chunk.model;
            if (chunk.delta) {
              text += chunk.delta;
              if (onDelta) onDelta(chunk.delta);
            }
            if (chunk.error) {
              streamError = chunk.error;
              finished = true;
              break;
            }
            if (chunk.done) {
              finished = true;
              break;
            }
          }
        }

        // An error after some text still produced something worth keeping, so it
        // is returned alongside the partial answer rather than thrown away.
        if (streamError) return { error: streamError, text };
        if (!text) return plain('the stream produced no text');
        return { text, usage, model: answeredModel || primaryModel, cost: recordSpend(primaryModel, usage) };
      } catch (error) {
        return plain(describeNetworkFailure(provider, error).message);
      } finally {
        setBusy(false);
      }
    },
    [provider, primaryModel, ai.baseUrl, apiKey, chat, recordSpend],
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
    setFallbackModel,
    setRememberKey,
    availableModels,
    modelById,
    primaryModel,
    discovery,
    discoverModels,
    test,
    testConnection,
    busy,
    chat,
    chatStream,
    spend,
    resetSpend,
    connected,
    egress: provider ? egressSummary(provider, ai.baseUrl) : '',
    needsBaseUrl: provider ? needsBaseUrl(provider, ai.baseUrl) : false,
  };
}
