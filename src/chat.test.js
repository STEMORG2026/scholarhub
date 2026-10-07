import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agyRefusal,
  canCall,
  buildRequest,
  parseResponse,
  buildModelListRequest,
  parseModels,
  describeError,
  describeNetworkFailure,
  supportsStreaming,
  buildStreamRequest,
  parseStreamChunk,
  splitStreamBuffer,
  estimateCost,
  formatCost,
} from './chat.js';
import { providerById } from './providers.js';

const OPENAI = providerById('openai');
const ANTHROPIC = providerById('anthropic');
const GOOGLE = providerById('google');
const OLLAMA = providerById('ollama');
const AGY = providerById('antigravity');
const CUSTOM = providerById('custom-openai');

const MESSAGES = [
  { role: 'system', content: 'You are a scholarship guide.' },
  { role: 'user', content: 'What should I check before applying?' },
];

const KEY = 'sk-test-0123456789abcdef';

/** A key must never travel in the body — bodies get logged and echoed back. */
function assertKeyNotInBody(request, key) {
  const serialised = JSON.stringify(request.body);
  assert.ok(!serialised.includes(key), `the key leaked into the request body: ${serialised.slice(0, 120)}`);
}

// --- can this call be attempted at all? -------------------------------------

test('Antigravity refuses before any request is built, and explains why', () => {
  const result = buildRequest(AGY, { model: 'gemini-3.8-flash', messages: MESSAGES, apiKey: KEY });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'local-cli-only');
  assert.match(result.reason, /cannot start a process|cannot reach/i);
  assert.equal(result.routes.length, 2, 'both working routes should be offered');
  assert.match(result.routes[0].detail, /antigravity-preview-09-2026/);
  assert.match(result.routes[1].detail, /localhost/);
});

test('the refusal is stable across repeated calls', () => {
  assert.deepEqual(agyRefusal(), agyRefusal());
});

test('a provider with no address cannot be called', () => {
  const result = canCall(CUSTOM, { apiKey: KEY });
  assert.equal(result.ok, false);
  assert.match(result.reason, /base url/i);
});

test('a provider that needs a key says so, and where to get one', () => {
  const result = canCall(OPENAI, {});
  assert.equal(result.ok, false);
  assert.match(result.reason, /needs an API key/i);
  assert.match(result.reason, /platform\.openai\.com/);
});

test('a keyless endpoint is allowed to proceed without a key', () => {
  assert.equal(canCall(CUSTOM, { baseUrl: 'http://localhost:4000/v1' }).ok, true);
  assert.equal(canCall(OLLAMA, {}).ok, true);
});

test('no provider and no model are each rejected with a reason', () => {
  assert.equal(canCall(null, {}).ok, false);
  const noModel = buildRequest(OPENAI, { messages: MESSAGES, apiKey: KEY });
  assert.equal(noModel.ok, false);
  assert.match(noModel.reason, /choose a model/i);
});

// --- OpenAI-shaped transport ------------------------------------------------

test('an OpenAI-shaped request has the documented URL, header and body', () => {
  const request = buildRequest(OPENAI, { model: 'gpt-6-astra', messages: MESSAGES, maxTokens: 512, temperature: 0.3, apiKey: KEY });
  assert.equal(request.ok, true);
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(request.body, { model: 'gpt-6-astra', messages: MESSAGES, max_tokens: 512, temperature: 0.3 });
  assertKeyNotInBody(request, KEY);
});

test('a keyless OpenAI-shaped request omits the authorization header entirely', () => {
  const request = buildRequest(CUSTOM, { model: 'local-model', messages: MESSAGES, baseUrl: 'http://localhost:4000/v1' });
  assert.equal(request.ok, true);
  assert.equal(request.headers.authorization, undefined);
  assert.equal(request.url, 'http://localhost:4000/v1/chat/completions');
});

test('an OpenAI-shaped reply is read from the first choice', () => {
  const parsed = parseResponse(OPENAI, {
    model: 'gpt-6-astra',
    choices: [{ message: { content: 'Check the deadline.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 4 },
  });
  assert.equal(parsed.text, 'Check the deadline.');
  assert.deepEqual(parsed.usage, { input: 12, output: 4 });
  assert.equal(parsed.finishReason, 'stop');
});

// --- Anthropic transport ----------------------------------------------------

test('an Anthropic request lifts the system turn out of the message list', () => {
  const request = buildRequest(ANTHROPIC, { model: 'claude-opus-5-5', messages: MESSAGES, apiKey: KEY });
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.headers['x-api-key'], KEY);
  assert.equal(request.headers['anthropic-version'], '2023-06-01');
  assert.equal(request.headers['anthropic-dangerous-direct-browser-access'], 'true', 'without this opt-in Anthropic refuses a browser-origin call');
  assert.equal(request.body.system, 'You are a scholarship guide.');
  assert.deepEqual(request.body.messages, [{ role: 'user', content: 'What should I check before applying?' }]);
  assert.ok(request.body.max_tokens > 0, 'max_tokens is required by this API');
  assertKeyNotInBody(request, KEY);
});

test('an Anthropic request never sends a system role inside messages', () => {
  const request = buildRequest(ANTHROPIC, { model: 'claude-opus-5-5', messages: MESSAGES, apiKey: KEY });
  assert.ok(!request.body.messages.some((message) => message.role === 'system'));
  // An assistant turn must survive the remap as an assistant turn.
  const withAssistant = buildRequest(ANTHROPIC, {
    model: 'claude-opus-5-5',
    messages: [...MESSAGES, { role: 'assistant', content: 'Start with the deadline.' }],
    apiKey: KEY,
  });
  assert.equal(withAssistant.body.messages[1].role, 'assistant');
});

test('an Anthropic request with no system turn omits the field rather than sending an empty string', () => {
  const request = buildRequest(ANTHROPIC, { model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'hi' }], apiKey: KEY });
  assert.equal('system' in request.body, false);
});

test('an Anthropic reply is the concatenated text blocks', () => {
  const parsed = parseResponse(ANTHROPIC, {
    model: 'claude-opus-5-5',
    content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Verify the ' }, { type: 'text', text: 'deadline.' }],
    usage: { input_tokens: 20, output_tokens: 6 },
    stop_reason: 'end_turn',
  });
  assert.equal(parsed.text, 'Verify the deadline.');
  assert.deepEqual(parsed.usage, { input: 20, output: 6 });
});

// --- Google transport -------------------------------------------------------

test('a Google request puts the model in the path and maps roles', () => {
  const request = buildRequest(GOOGLE, { model: 'gemini-3.8-flash', messages: MESSAGES, maxTokens: 256, apiKey: KEY });
  assert.match(request.url, /\/models\/gemini-3\.8-flash:generateContent\?key=/);
  assert.ok(request.url.includes(encodeURIComponent(KEY)));
  assert.equal(request.body.systemInstruction.parts[0].text, 'You are a scholarship guide.');
  assert.deepEqual(request.body.contents, [{ role: 'user', parts: [{ text: 'What should I check before applying?' }] }]);
  assert.equal(request.body.generationConfig.maxOutputTokens, 256);
  assertKeyNotInBody(request, KEY);
});

test('a Google assistant turn is sent as the model role', () => {
  const request = buildRequest(GOOGLE, {
    model: 'gemini-3.8-flash',
    messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }],
    apiKey: KEY,
  });
  assert.deepEqual(request.body.contents.map((c) => c.role), ['user', 'model', 'user']);
});

test('a Google reply is the joined candidate parts', () => {
  const parsed = parseResponse(GOOGLE, {
    modelVersion: 'gemini-3.8-flash',
    candidates: [{ content: { parts: [{ text: 'Two ' }, { text: 'things.' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 },
  });
  assert.equal(parsed.text, 'Two things.');
  assert.deepEqual(parsed.usage, { input: 9, output: 3 });
});

// --- Ollama transport -------------------------------------------------------

test('an Ollama request uses its own shape, not the OpenAI one', () => {
  const request = buildRequest(OLLAMA, { model: 'llama3.1:8b', messages: MESSAGES, maxTokens: 128 });
  assert.equal(request.url, 'http://localhost:11434/api/chat');
  assert.equal(request.body.stream, false, 'streaming would make the reply unreadable to a one-shot parser');
  assert.equal(request.body.options.num_predict, 128);
  assert.equal(request.headers.authorization, undefined);
});

test('an Ollama reply is read from message.content', () => {
  const parsed = parseResponse(OLLAMA, { model: 'llama3.1:8b', message: { content: 'Local answer.' }, prompt_eval_count: 30, eval_count: 7, done_reason: 'stop' });
  assert.equal(parsed.text, 'Local answer.');
  assert.deepEqual(parsed.usage, { input: 30, output: 7 });
});

// --- unknown shapes never throw ---------------------------------------------

test('an unrecognised or empty reply yields empty text rather than throwing', () => {
  for (const provider of [OPENAI, ANTHROPIC, GOOGLE, OLLAMA]) {
    for (const json of [null, undefined, {}, { choices: [] }, { content: [] }, { candidates: [] }]) {
      const parsed = parseResponse(provider, json);
      assert.equal(typeof parsed.text, 'string', `${provider.id} did not return a string`);
    }
  }
});

// --- model discovery --------------------------------------------------------

test('a model list is requested only where the provider publishes one', () => {
  assert.equal(buildModelListRequest(AGY, {}), null, 'a CLI session has no list endpoint');
  assert.ok(buildModelListRequest(OPENAI, { apiKey: KEY }));
});

test('a model list is not requested without the credential it needs', () => {
  assert.equal(buildModelListRequest(OPENAI, {}), null);
  assert.equal(buildModelListRequest(GOOGLE, {}), null);
  assert.equal(buildModelListRequest(ANTHROPIC, {}), null);
  assert.ok(buildModelListRequest(OLLAMA, {}), 'a local server needs no credential');
});

test('a model list request never puts the key in a body, because it has none', () => {
  for (const [provider, options] of [[OPENAI, { apiKey: KEY }], [GOOGLE, { apiKey: KEY }], [ANTHROPIC, { apiKey: KEY }], [OLLAMA, {}]]) {
    const request = buildModelListRequest(provider, options);
    assert.equal(request.method, 'GET');
    assert.equal(request.body, undefined);
  }
});

test('OpenAI-shaped model lists are normalised', () => {
  const models = parseModels(OPENAI, { data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6-astra' }] });
  assert.deepEqual(models.map((m) => m.id), ['gpt-6-astra', 'gpt-6-luna'], 'sorted for a stable picker');
  assert.equal(models[0].context, null, 'an unstated limit stays null');
});

test('Google model names lose the models/ prefix', () => {
  const models = parseModels(GOOGLE, {
    models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', inputTokenLimit: 1048576, outputTokenLimit: 65536 }],
  });
  assert.equal(models[0].id, 'gemini-3.8-flash');
  assert.equal(models[0].label, 'Gemini 3.8 Flash');
  assert.equal(models[0].context, 1048576);
});

test('Anthropic model lists carry their real limits', () => {
  const models = parseModels(ANTHROPIC, {
    data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', max_input_tokens: 1000000, max_tokens: 128000 }],
  });
  assert.equal(models[0].context, 1000000);
  assert.equal(models[0].output, 128000);
});

test('Ollama reports whatever is actually pulled', () => {
  const models = parseModels(OLLAMA, { models: [{ name: 'qwen3:14b', details: { parameter_size: '14B' } }] });
  assert.equal(models[0].id, 'qwen3:14b');
  assert.equal(models[0].detail, '14B');
});

test('a malformed model list yields an empty array rather than throwing', () => {
  for (const json of [null, undefined, {}, { data: 'nope' }, { models: null }]) {
    for (const provider of [OPENAI, GOOGLE, ANTHROPIC, OLLAMA]) {
      assert.deepEqual(parseModels(provider, json), []);
    }
  }
  // Rows with no id are dropped rather than rendered as blank options.
  assert.deepEqual(parseModels(OPENAI, { data: [{ name: 'no id here' }, { id: 'real' }] }).map((m) => m.id), ['real']);
});

// --- failures ---------------------------------------------------------------

test('each status maps to the advice that actually helps', () => {
  assert.equal(describeError(OPENAI, 401, '{}').kind, 'auth');
  assert.equal(describeError(OPENAI, 403, '{}').kind, 'auth');
  assert.equal(describeError(OPENAI, 404, '{}').kind, 'address');
  assert.equal(describeError(OPENAI, 429, '{}').kind, 'quota');
  assert.equal(describeError(OPENAI, 400, '{}').kind, 'request');
  assert.equal(describeError(OPENAI, 503, '{}').kind, 'provider');
  assert.equal(describeError(OPENAI, 418, '{}').kind, 'unknown');
});

test("a provider's own error message is surfaced, not replaced", () => {
  const described = describeError(OPENAI, 400, JSON.stringify({ error: { message: 'model gpt-6-astra does not exist' } }));
  assert.equal(described.detail, 'model gpt-6-astra does not exist');
});

test('a non-JSON error body is still shown, truncated', () => {
  const described = describeError(OPENAI, 500, 'x'.repeat(1000));
  assert.equal(described.detail.length, 300);
});

test('a network failure never claims to know the cause', () => {
  const described = describeNetworkFailure(OPENAI, new TypeError('Failed to fetch'));
  assert.equal(described.kind, 'network');
  assert.match(described.message, /CORS/);
  assert.match(described.message, /will not say/i, 'the browser genuinely cannot distinguish these');
});

test('a local network failure points at the local server instead', () => {
  const described = describeNetworkFailure(OLLAMA, new TypeError('Failed to fetch'));
  assert.match(described.message, /running on that port/i);
  assert.doesNotMatch(described.message, /CORS/, 'CORS is not the likely cause for a localhost call');
});

test('a failure with no provider still produces a sentence', () => {
  assert.ok(describeError(null, 500, '').message.length > 0);
  assert.ok(describeNetworkFailure(null, null).message.length > 0);
});

// --- streaming --------------------------------------------------------------

test('streaming is offered only for transports that implement it', () => {
  for (const provider of [OPENAI, ANTHROPIC, GOOGLE, OLLAMA]) {
    assert.equal(supportsStreaming(provider), true, `${provider.id} should stream`);
  }
  assert.equal(supportsStreaming(AGY), false, 'a CLI session has no stream to read');
  assert.equal(supportsStreaming(null), false);
});

test('a stream request marks the body and keeps the key out of it', () => {
  const request = buildStreamRequest(OPENAI, { model: 'gpt-6-astra', messages: MESSAGES, apiKey: KEY });
  assert.equal(request.ok, true);
  assert.equal(request.streaming, true);
  assert.equal(request.body.stream, true);
  assert.deepEqual(request.body.stream_options, { include_usage: true }, 'without this the API omits token counts and the cost becomes unknowable');
  assertKeyNotInBody(request, KEY);
  // The non-streaming body must not be mutated by building a streaming one.
  const plain = buildRequest(OPENAI, { model: 'gpt-6-astra', messages: MESSAGES, apiKey: KEY });
  assert.equal(plain.body.stream, undefined);
});

test('an Ollama stream request does not carry the OpenAI usage option', () => {
  const request = buildStreamRequest(OLLAMA, { model: 'qwen3:8b', messages: MESSAGES });
  assert.equal(request.body.stream, true);
  assert.equal(request.body.stream_options, undefined);
});

test('a Google stream switches method and asks for SSE', () => {
  const request = buildStreamRequest(GOOGLE, { model: 'gemini-3.8-flash', messages: MESSAGES, apiKey: KEY });
  assert.match(request.url, /:streamGenerateContent\?key=/);
  assert.match(request.url, /&alt=sse$/, 'without alt=sse Gemini returns a JSON array, not an event stream');
  assert.ok(!request.url.includes(':generateContent?'), 'the non-streaming method must be replaced, not appended to');
});

test('a stream request that cannot be built fails the same way a plain one does', () => {
  const request = buildStreamRequest(AGY, { model: 'x', messages: MESSAGES, apiKey: KEY });
  assert.equal(request.ok, false);
  assert.equal(request.code, 'local-cli-only');
});

test('OpenAI stream deltas accumulate, and a finish reason ends it', () => {
  assert.equal(parseStreamChunk(OPENAI, 'data: {"choices":[{"delta":{"content":"Hel"}}]}').delta, 'Hel');
  assert.equal(parseStreamChunk(OPENAI, 'data: {"choices":[{"delta":{"content":"lo"}}]}').delta, 'lo');
  assert.equal(parseStreamChunk(OPENAI, 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}').done, true);
  assert.equal(parseStreamChunk(OPENAI, 'data: [DONE]').done, true);
});

test('an OpenAI stream reports usage from its final chunk', () => {
  const chunk = parseStreamChunk(OPENAI, 'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4}}');
  assert.deepEqual(chunk.usage, { input: 12, output: 4 });
});

test('an Anthropic stream reads content_block_delta and ends on message_stop', () => {
  assert.equal(parseStreamChunk(ANTHROPIC, 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}').delta, 'Hi');
  assert.equal(parseStreamChunk(ANTHROPIC, 'data: {"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":9}}}').usage.input, 9);
  assert.equal(parseStreamChunk(ANTHROPIC, 'data: {"type":"message_delta","usage":{"output_tokens":3}}').usage.output, 3);
  assert.equal(parseStreamChunk(ANTHROPIC, 'data: {"type":"message_stop"}').done, true);
  assert.equal(parseStreamChunk(ANTHROPIC, 'data: {"type":"ping"}').delta, '');
});

test('a Google stream joins its parts', () => {
  const chunk = parseStreamChunk(GOOGLE, 'data: {"candidates":[{"content":{"parts":[{"text":"Two "},{"text":"things"}]}}]}');
  assert.equal(chunk.delta, 'Two things');
  assert.equal(parseStreamChunk(GOOGLE, 'data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}]}').done, true);
});

test('an Ollama stream is newline-delimited JSON, not SSE', () => {
  assert.equal(parseStreamChunk(OLLAMA, '{"message":{"content":"Local"},"done":false}').delta, 'Local');
  const final = parseStreamChunk(OLLAMA, '{"message":{"content":""},"done":true,"prompt_eval_count":30,"eval_count":7}');
  assert.equal(final.done, true);
  assert.deepEqual(final.usage, { input: 30, output: 7 });
});

test('a keep-alive comment, an event name and a blank line are not errors', () => {
  for (const line of [': keep-alive', 'event: message_start', '', '   ', null, undefined, 'not json at all']) {
    const chunk = parseStreamChunk(OPENAI, line);
    assert.equal(chunk.delta, '', `${line} should yield no delta`);
    assert.equal(chunk.done, false, `${line} should not end the stream`);
    assert.equal(chunk.error, undefined);
  }
});

test('an error frame mid-stream is surfaced rather than swallowed', () => {
  // A stream is a fallible iterator. Treating it as infallible hangs the caller.
  const openaiError = parseStreamChunk(OPENAI, 'data: {"error":{"message":"overloaded"}}');
  assert.equal(openaiError.error, 'overloaded');
  assert.equal(openaiError.done, true);

  assert.match(parseStreamChunk(ANTHROPIC, 'data: {"type":"error","error":{"message":"boom"}}').error, /boom/);
  assert.equal(parseStreamChunk(OLLAMA, '{"error":"model not found"}').error, 'model not found');
});

test('a buffer split mid-line keeps the remainder for the next read', () => {
  const first = splitStreamBuffer('data: {"a":1}\ndata: {"b"');
  assert.deepEqual(first.lines, ['data: {"a":1}']);
  assert.equal(first.remainder, 'data: {"b"');

  const second = splitStreamBuffer(first.remainder + ':2}\n');
  assert.deepEqual(second.lines, ['data: {"b":2}']);
  assert.equal(second.remainder, '');
});

test('carriage returns are normalised, so a CRLF stream parses too', () => {
  const split = splitStreamBuffer('data: {"a":1}\r\ndata: {"b":2}\r\n');
  assert.deepEqual(split.lines, ['data: {"a":1}', 'data: {"b":2}']);
  assert.equal(split.remainder, '');
});

// --- cost -------------------------------------------------------------------

const PRICED = { inputPrice: 10, outputPrice: 50 };

test('a cost is computed from the published price and the reported usage', () => {
  const cost = estimateCost(PRICED, { input: 1000, output: 500 });
  assert.equal(cost.input, 0.01);
  assert.equal(cost.output, 0.025);
  assert.equal(cost.total, 0.035);
  assert.equal(cost.partial, false);
  assert.equal(cost.currency, 'USD');
});

test('a cost is unknown rather than guessed', () => {
  // The rule the catalog applies to deadlines: absent means absent.
  assert.equal(estimateCost({ inputPrice: null, outputPrice: null }, { input: 10, output: 10 }), null);
  assert.equal(estimateCost(PRICED, null), null);
  assert.equal(estimateCost(PRICED, {}), null);
  assert.equal(estimateCost(PRICED, { input: null, output: null }), null);
  assert.equal(estimateCost(null, { input: 1, output: 1 }), null);
});

test('a half-known cost is reported as partial, not as a total', () => {
  const onlyInput = estimateCost({ inputPrice: 10, outputPrice: null }, { input: 1000, output: 500 });
  assert.equal(onlyInput.total, 0.01);
  assert.equal(onlyInput.partial, true, 'half a figure must not be presented as the whole cost');
  assert.equal(onlyInput.output, null);

  const onlyOutput = estimateCost({ inputPrice: null, outputPrice: 50 }, { input: 1000, output: 500 });
  assert.equal(onlyOutput.total, 0.025);
  assert.equal(onlyOutput.partial, true);
});

test('a provider reporting only one direction still costs what it can', () => {
  // Streaming: Anthropic sends input on message_start and output on message_delta.
  const cost = estimateCost(PRICED, { input: 2000, output: null });
  assert.equal(cost.total, 0.02);
  assert.equal(cost.partial, true);
});

test('costs format with enough precision to show a fraction of a cent', () => {
  assert.equal(formatCost(0), '$0');
  assert.equal(formatCost(0.00004), '$0.00004');
  assert.equal(formatCost(0.035), '$0.0350');
  assert.equal(formatCost(1.5), '$1.50');
  assert.equal(formatCost(null), '\u2014');
  assert.equal(formatCost(undefined), '\u2014');
});
