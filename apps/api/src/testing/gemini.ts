/**
 * A Gemini double (F6) behind the fake UrlFetchApp, faithful where the
 * portal depends on it: the model list, structured answers (JSON as text in
 * the first candidate), 404 for a model that is gone, 429 with the quota's
 * id for the day or the minute, and the key in the x-goog-api-key header.
 * Every request is kept, so a test can prove no name ever left.
 *
 * Its answers are canned and say so ("demostración"): in the demo mode the
 * portal shows them as they come.
 */
import type { ModelInfo } from '../ai/gemini.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiCall {
  model: string;
  system: string;
  prompt: string;
  schemaKeys: string[];
}

interface Reply {
  status: number;
  body: unknown;
}

const quota = (perDay: boolean): Reply => ({
  status: 429,
  body: {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'You exceeded your current quota.',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
              quotaId: perDay
                ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
                : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
            },
          ],
        },
      ],
    },
  },
});

/** The markers in a text, in order of appearance, without repeats. */
const markers = (text: string): string[] => [...new Set(text.match(/\[[A-Z]+_\d+\]/g) ?? [])];

export class FakeGemini {
  readonly apiKey = 'test-gemini-key';
  models: ModelInfo[] = [
    {
      name: 'models/gemini-3.8-flash',
      supportedGenerationMethods: ['generateContent', 'countTokens'],
    },
    {
      name: 'models/gemini-3.5-flash-lite',
      supportedGenerationMethods: ['generateContent', 'countTokens'],
    },
    { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-flash-lite-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
  ];
  readonly calls: GeminiCall[] = [];
  listCalls = 0;
  /** What the next generateContent answers instead: the day's or the minute's quota. */
  failNext: ('day' | 'minute')[] = [];
  /** What the model writes, from what it was sent. */
  reply: (call: GeminiCall) => unknown = (call) => defaultReply(call);

  handle(url: string, method: string, headers: Record<string, string>, payload: string): Reply {
    if (headers['x-goog-api-key'] !== this.apiKey) {
      return {
        status: 400,
        body: {
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
          },
        },
      };
    }
    if (method === 'get' && url.startsWith(`${API}/models?`)) {
      this.listCalls++;
      return { status: 200, body: { models: this.models } };
    }
    const match = new RegExp(`^${API.replace(/[.]/g, '\\.')}/models/([^:]+):generateContent$`).exec(
      url,
    );
    if (method !== 'post' || !match)
      return { status: 404, body: { error: { code: 404, message: 'Not found' } } };
    const model = match[1] ?? '';
    if (!this.models.some((m) => m.name === `models/${model}`)) {
      return {
        status: 404,
        body: {
          error: {
            code: 404,
            status: 'NOT_FOUND',
            message: `models/${model} is not found for API version v1beta.`,
          },
        },
      };
    }
    const failure = this.failNext.shift();
    if (failure) return quota(failure === 'day');
    const body = JSON.parse(payload) as {
      systemInstruction?: { parts?: { text?: string }[] };
      contents?: { parts?: { text?: string }[] }[];
      generationConfig?: { responseSchema?: { properties?: Record<string, unknown> } };
    };
    const call: GeminiCall = {
      model,
      system: body.systemInstruction?.parts?.map((p) => p.text ?? '').join('') ?? '',
      prompt: body.contents?.[0]?.parts?.map((p) => p.text ?? '').join('') ?? '',
      schemaKeys: Object.keys(body.generationConfig?.responseSchema?.properties ?? {}),
    };
    this.calls.push(call);
    return {
      status: 200,
      body: {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: JSON.stringify(this.reply(call)) }] },
            finishReason: 'STOP',
          },
        ],
      },
    };
  }
}

/** Canned answers that use the markers they were given, as the real model is told to. */
function defaultReply(call: GeminiCall): unknown {
  const refs = markers(call.prompt);
  const english =
    call.system.includes('Write in English') || call.system.includes('Answer in English');
  if (call.schemaKeys.includes('resumen')) {
    const matter = refs.find((r) => r.startsWith('[ASUNTO_')) ?? 'el portal';
    return {
      resumen: english
        ? `During the month the firm moved ${matter} forward. (Demo text: the real one is written by Gemini.)`
        : `Durante el mes el despacho avanzó en ${matter}. Quedan pendientes los puntos que se listan en el reporte. (Texto de demostración: el real lo redacta Gemini.)`,
    };
  }
  if (call.schemaKeys.includes('respuesta')) {
    const first = refs.find((r) => !r.startsWith('[CLIENTE_') && !r.startsWith('[PERSONA_'));
    return {
      respuesta: first
        ? `Lo más próximo es ${first}. (Respuesta de demostración: la real la redacta Gemini.)`
        : 'No encuentro pendientes con esos datos. (Respuesta de demostración.)',
      referencias: first ? [first] : [],
    };
  }
  const task = refs.find((r) => r.startsWith('[TAREA_')) ?? '';
  return {
    texto: `Hola. Les recordamos que sigue pendiente ${task}. Quedamos atentos. (Texto de demostración.)`,
  };
}
