/**
 * Gemini, called from the server only (IA.md). The key lives in Script
 * Properties (GEMINI_API_KEY) and travels in a header, never in the URL,
 * so no log ever shows it; no browser ever sees it.
 *
 * - The model is not fixed in the code: Config.modeloIA, or the best stable
 *   Flash-Lite the API lists (then Flash, then Pro). When Google says the
 *   model no longer exists, the portal picks another, keeps it and tells
 *   the partners (IA_MODELO).
 * - Answers follow a JSON schema (responseSchema); the caller checks them.
 * - The day's requests are counted by California's day, as Google counts
 *   them. At 80 % of Config.limiteDiarioIA the partners hear it, once a day
 *   (IA_CUOTA_ALTA). When Google says the day's quota ran out, the helpers
 *   wait for the next day and the partners hear it once (IA_CUOTA); a
 *   per-minute limit is tried again once after a pause.
 */
import { text, type NotificationKind } from '@empirica/shared';
import { changed, underLock } from '../actions/locked.ts';
import { Database } from '../db/database.ts';
import { PROP, type Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { saveNotifications } from '../notify.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const AI_ACTOR = 'ia';

export interface ModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

const UNSUITABLE =
  /(preview|exp|experimental|tts|image|audio|live|embedding|thinking|vision|learnlm|computer|robotics)/i;

/** The best model for short structured answers among those the API lists, or null. */
export function chooseModel(models: readonly ModelInfo[]): string | null {
  const family = (id: string): number =>
    id.includes('flash-lite') ? 0 : id.includes('flash') ? 1 : id.includes('pro') ? 2 : 3;
  const version = (id: string): number => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  return (
    models
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => /^gemini-\d/.test(id) && !UNSUITABLE.test(id))
      .sort((a, b) => family(a) - family(b) || version(b) - version(a) || a.localeCompare(b))[0] ??
    null
  );
}

export interface Usage {
  /** California's day: Google's daily quota starts again at its midnight. */
  dia: string;
  usadas: number;
  agotada: boolean;
  /** The partners already heard today that most of the limit is used. */
  avisada: boolean;
}

/** Share of Config.limiteDiarioIA at which the partners hear the AI is running out. */
export const WARN_SHARE = 0.8;

export const californiaDay = (env: Env): string =>
  env.g.Utilities.formatDate(new Date(env.now()), 'America/Los_Angeles', 'yyyy-MM-dd');

export function usageToday(env: Env): Usage {
  const dia = californiaDay(env);
  try {
    const saved = JSON.parse(env.prop(PROP.aiUsage) ?? 'null') as Partial<Usage> | null;
    if (saved?.dia === dia) {
      return {
        dia,
        usadas: Number(saved.usadas) || 0,
        agotada: saved.agotada === true,
        avisada: saved.avisada === true,
      };
    }
  } catch {
    // A broken value counts as a new day.
  }
  return { dia, usadas: 0, agotada: false, avisada: false };
}

const saveUsage = (env: Env, usage: Usage): void => {
  env.setProp(PROP.aiUsage, JSON.stringify(usage));
};

export function geminiKey(env: Env): string | null {
  const key = env.prop(PROP.geminiKey)?.trim();
  // An empty value is no key.
  return key?.length ? key : null;
}

const quotaError = (): ApiError =>
  new ApiError(
    'QUOTA_EXHAUSTED',
    'Se acabaron por hoy las consultas a la IA. Vuelven después de la medianoche de California.',
    { reason: 'AI_QUOTA' },
  );

interface Response {
  status: number;
  body: unknown;
}

function call(
  env: Env,
  key: string,
  method: 'get' | 'post',
  url: string,
  body?: unknown,
): Response {
  const res = env.g.UrlFetchApp.fetch(url, {
    method,
    headers: { 'x-goog-api-key': key },
    muteHttpExceptions: true,
    ...(body === undefined
      ? {}
      : { contentType: 'application/json', payload: JSON.stringify(body) }),
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.getContentText());
  } catch {
    parsed = null;
  }
  return { status: res.getResponseCode(), body: parsed };
}

/** Google refused the key itself: the partner has to fix GEMINI_API_KEY. */
function refusedKey(res: Response): boolean {
  if (res.status !== 400 && res.status !== 403) return false;
  const message = JSON.stringify(res.body ?? '').toLowerCase();
  return message.includes('api key') || message.includes('api_key');
}

const badKeyError = (): ApiError =>
  new ApiError('NOT_IMPLEMENTED', 'La clave de Gemini no es válida: revisa GEMINI_API_KEY.', {
    reason: 'AI_BAD_KEY',
  });

/** The best model the key may use; null if Google offers none or does not answer. */
export function discoverModel(env: Env, key: string): string | null {
  const res = call(env, key, 'get', `${API}/models?pageSize=200`);
  if (refusedKey(res)) throw badKeyError();
  if (res.status !== 200) return null;
  const models = (res.body as { models?: ModelInfo[] } | null)?.models ?? [];
  return chooseModel(models);
}

/** Whether the key works, and the model it would use (setup's check). */
export function checkKey(
  env: Env,
  key: string,
): { ok: boolean; model: string | null; status: number } {
  const res = call(env, key, 'get', `${API}/models?pageSize=200`);
  const models = (res.body as { models?: ModelInfo[] } | null)?.models ?? [];
  return {
    ok: res.status === 200,
    model: res.status === 200 ? chooseModel(models) : null,
    status: res.status,
  };
}

function configValue(db: Database, clave: string): string | null {
  const row = db.rows('Config').find((r) => !r.deleted && r.clave === clave);
  return row ? text(row, 'valor') : null;
}

/** The day's limit the partner read in AI Studio (Config.limiteDiarioIA); null if unknown. */
export function dailyLimit(db: Database): number | null {
  const n = Number(configValue(db, 'limiteDiarioIA'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Writes Config.modeloIA (under the lock, with the bitácora) and tells the partners when it changed. */
export function keepModel(env: Env, model: string, announce: boolean): void {
  underLock(env, AI_ACTOR, (r) => {
    const row = r.db.rows('Config').find((c) => !c.deleted && c.clave === 'modeloIA');
    if (!row) return;
    if (text(row, 'valor') === model) return;
    r.writer.save('Config', row, changed(r, row, { valor: model }));
    r.writer.audit(
      'SISTEMA',
      'Config',
      row.id,
      null,
      { modeloIA: text(row, 'valor') },
      { modeloIA: model },
    );
    if (announce) notifyPartners(r, 'IA_MODELO', model);
  });
}

function notifyPartners(
  r: Parameters<Parameters<typeof underLock>[2]>[0],
  tipo: NotificationKind,
  mensaje: string,
): void {
  const partners = r.db
    .rows('Usuarios')
    .filter(
      (u) =>
        !u.deleted && u.estado === 'ACTIVO' && u.lado === 'EMPIRICA' && u.rolBase === 'SOCIO_ADMIN',
    );
  saveNotifications(
    r.db,
    r.writer,
    partners.map((u) => ({
      usuarioId: u.id,
      tipo,
      about: null,
      mensaje,
      link: null,
      clienteId: null,
    })),
    null,
  );
}

/** At WARN_SHARE of the day's limit the partners hear it, once a day. */
function warnIfNearLimit(env: Env, db: Database, used: number): void {
  const limit = dailyLimit(db);
  if (!limit || used < Math.ceil(limit * WARN_SHARE)) return;
  // Read again: another request may have warned first.
  const latest = usageToday(env);
  if (latest.avisada) return;
  saveUsage(env, { ...latest, avisada: true });
  underLock(env, AI_ACTOR, (r) => {
    notifyPartners(r, 'IA_CUOTA_ALTA', `${String(used)}/${String(limit)}`);
  });
}

function isPerDay(body: unknown): boolean {
  const details = (body as { error?: { details?: unknown[] } } | null)?.error?.details ?? [];
  return JSON.stringify(details).toLowerCase().includes('perday');
}

export interface GenerateRequest {
  system: string;
  prompt: string;
  /** Gemini's responseSchema (an OpenAPI subset). */
  schema: Record<string, unknown>;
  maxTokens: number;
}

/**
 * One structured answer from Gemini: the parsed JSON, unchecked. Throws
 * NOT_IMPLEMENTED without a key, QUOTA_EXHAUSTED when the day's quota ran
 * out, RATE_LIMITED after a second per-minute refusal, INTERNAL otherwise.
 */
export function generate(env: Env, req: GenerateRequest): unknown {
  const key = geminiKey(env);
  if (!key) {
    throw new ApiError(
      'NOT_IMPLEMENTED',
      'La IA todavía no está configurada: falta GEMINI_API_KEY en Script Properties.',
      { reason: 'AI_NO_KEY' },
    );
  }
  const usage = usageToday(env);
  if (usage.agotada) throw quotaError();

  const db = new Database(env);
  let model = configValue(db, 'modeloIA') ?? '';
  if (!model) {
    model = discoverModel(env, key) ?? '';
    if (!model) {
      throw new ApiError('INTERNAL', 'Google no ofreció ningún modelo de IA para esta clave.', {
        reason: 'AI_NO_MODEL',
      });
    }
    keepModel(env, model, false);
  }

  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: req.schema,
      temperature: 0.3,
      maxOutputTokens: req.maxTokens,
    },
  };
  let rediscovered = false;
  let retried = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = call(env, key, 'post', `${API}/models/${model}:generateContent`, body);
    if (res.status === 200) {
      usage.usadas++;
      saveUsage(env, usage);
      warnIfNearLimit(env, db, usage.usadas);
      const parts =
        (res.body as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null)
          ?.candidates?.[0]?.content?.parts ?? [];
      const answer = parts.map((p) => p.text ?? '').join('');
      try {
        return JSON.parse(answer) as unknown;
      } catch {
        throw new ApiError('INTERNAL', 'La IA no pudo responder esta vez. Intenta de nuevo.', {
          reason: 'AI_NO_ANSWER',
        });
      }
    }
    if (res.status === 404 && !rediscovered) {
      rediscovered = true;
      const other = discoverModel(env, key);
      if (other && other !== model) {
        env.log('IA: el modelo ya no existe; se usa otro', { antes: model, ahora: other });
        keepModel(env, other, true);
        model = other;
        continue;
      }
    }
    if (res.status === 429) {
      if (isPerDay(res.body)) {
        // Read again: another request may have heard it first, and the partners hear it once.
        const latest = usageToday(env);
        if (!latest.agotada) {
          saveUsage(env, { ...latest, agotada: true });
          underLock(env, AI_ACTOR, (r) => {
            notifyPartners(r, 'IA_CUOTA', String(latest.usadas));
          });
        }
        throw quotaError();
      }
      if (!retried) {
        retried = true;
        env.g.Utilities.sleep(2000);
        continue;
      }
      throw new ApiError(
        'RATE_LIMITED',
        'La IA recibió muchas preguntas seguidas; intenta en un minuto.',
      );
    }
    if (refusedKey(res)) throw badKeyError();
    env.log('IA: Gemini respondió con error', { status: res.status, model });
    throw new ApiError('INTERNAL', 'La IA no está disponible en este momento. Intenta más tarde.');
  }
  throw new ApiError('INTERNAL', 'La IA no está disponible en este momento. Intenta más tarde.');
}
