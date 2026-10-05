/**
 * The daily summary (D14): an hourly trigger sends it once a day, from the
 * hour the firm set (`Config.horaResumen`, 7 by default) on, so a changed
 * hour applies the next day without touching triggers, and an hour that
 * failed is made up by the next one.
 *
 * Each active person with the summary on gets their own: only what they may
 * see, in their language, and only when there is something to say. Clients
 * go first; the emails kept for invitations (`Config.reservaCorreos`) are
 * never used; when the day's emails run short, the administrators hear it
 * in the bell.
 */
import {
  RECORD_PATH,
  addDays,
  buildUserContext,
  digestOf,
  isEmptyDigest,
  text,
  toProjectDate,
  toProjectIso,
  waitingOnClient,
  type AgendaItem,
  type AgendaLanguage,
  type Row,
} from '@empirica/shared';
import { underLock } from '../actions/locked.ts';
import { agendaRows, itemsOf, namesOf, visibleRows } from '../calendar/agenda.ts';
import { readAgendaSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import { PROP, type Env } from '../env.ts';
import { saveNotifications } from '../notify.ts';
import { mailAllowed, remainingQuota, sendMail } from './send.ts';
import { digestEmail, waitingLine } from './templates.ts';

/** When the day's emails left fall under this, the administrators are told. */
export const LOW_QUOTA = 20;
export const DIGEST_ACTOR = 'resumen';

export interface DigestReport {
  /** Why nothing was sent: too early, or already sent today. */
  skipped: string | null;
  sent: number;
  /** Nothing to say. */
  empty: number;
  /** Turned off by the person. */
  optedOut: number;
  /** Left for tomorrow: the day's emails ran out. */
  noQuota: number;
  failed: number;
}

/** A person's notification settings (`Usuarios.prefsNotificacion`). */
export function notificationPrefs(user: Row): { resumenDiario: boolean } {
  const prefs = user.prefsNotificacion;
  const on =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).resumenDiario !== false
      : true;
  return { resumenDiario: on };
}

export function runDigest(env: Env, options: { force?: boolean } = {}): DigestReport {
  const report: DigestReport = {
    skipped: null,
    sent: 0,
    empty: 0,
    optedOut: 0,
    noQuota: 0,
    failed: 0,
  };
  const db = new Database(env);
  const settings = readAgendaSettings(db.rows('Config'));
  const nowMs = env.now();
  const today = toProjectDate(nowMs);
  if (!options.force) {
    if (Number(toProjectIso(nowMs).slice(11, 13)) < settings.digestHour) {
      return { ...report, skipped: 'EARLY' };
    }
    if (env.prop(PROP.digestSent) === today) return { ...report, skipped: 'DONE' };
  }
  // Without the owner's permission nothing goes, and the day stays open:
  // the summary leaves on the first hourly run after it is granted.
  if (!mailAllowed(env)) {
    env.log('Resumen: falta el permiso de correo; sale cuando la cuenta lo autorice');
    return { ...report, skipped: 'NO_PERMISSION' };
  }
  // Marked first: a run that dies half way never sends twice.
  env.setProp(PROP.digestSent, today);

  const rows = agendaRows(db);
  const names = namesOf(db);
  const usuarios = db.rows('Usuarios');
  const emailOf = (id: string | null): string | null => {
    const u = id ? usuarios.find((x) => x.id === id) : undefined;
    return u && !u.deleted && u.estado === 'ACTIVO' ? text(u, 'email') : null;
  };
  const lawyerOf = (clienteId: string): string | null => {
    const client = db.table('Clientes').get(clienteId);
    return client ? emailOf(text(client, 'abogadoResponsableId')) : null;
  };
  const longest = Math.max(1, ...settings.general, ...settings.fatal);
  const window = { from: addDays(today, -365), to: addDays(today, longest) };
  const people = usuarios
    .filter((u) => !u.deleted && u.estado === 'ACTIVO' && text(u, 'email'))
    // Clients first: the firm also has the portal open all day.
    .sort((a, b) => (a.lado === b.lado ? 0 : a.lado === 'CLIENTE' ? -1 : 1));

  for (const user of people) {
    if (!notificationPrefs(user).resumenDiario) {
      report.optedOut++;
      continue;
    }
    const ctx = buildUserContext({
      user,
      membresias: db.rows('Membresias'),
      entidades: db.rows('Entidades'),
      clientes: db.rows('Clientes'),
    });
    const visible = visibleRows(ctx, db, rows);
    const items = itemsOf(visible, db, today, settings, window);
    // A client is reminded of what waits for them: their own tasks, or any if they run the company.
    const waiting =
      user.lado === 'CLIENTE'
        ? waitingOnClient(visible.Tareas, today, settings.waitingDays).filter((w) => {
            const responsable = text(w.task, 'responsableId');
            const access = ctx.clients.get(text(w.task, 'clienteId') ?? '');
            return responsable ? responsable === user.id : access?.rol === 'CLIENTE_ADMIN';
          })
        : [];
    const digest = digestOf(items, today, waiting);
    if (isEmptyDigest(digest)) {
      report.empty++;
      continue;
    }
    if (remainingQuota(env) <= settings.mailReserve) {
      report.noQuota++;
      continue;
    }
    const lang: AgendaLanguage = text(user, 'idioma') === 'en' ? 'en' : 'es';
    const several = ctx.lado === 'EMPIRICA' || ctx.clients.size !== 1;
    const contextOf = (item: {
      clienteId: string | null;
      entidadId: string | null;
    }): string | null =>
      [several ? names.client(item.clienteId) : null, names.unit(item.entidadId)]
        .filter(Boolean)
        .join(' · ') || null;
    const email = digestEmail({
      lang,
      name: text(user, 'nombre') ?? text(user, 'email') ?? '',
      today,
      portalUrl: settings.portalUrl,
      digest,
      contextOf: (item: AgendaItem) => contextOf(item),
      waitingLines: waiting.map((w) =>
        waitingLine(
          text(w.task, 'titulo') ?? '',
          contextOf({ clienteId: text(w.task, 'clienteId'), entidadId: text(w.task, 'entidadId') }),
          w.days,
          `${settings.portalUrl.replace(/\/*$/, '/')}#${RECORD_PATH.Tareas}/${w.task.id}`,
          lang,
        ),
      ),
    });
    const firstClient = [...ctx.clients.keys()][0];
    const outcome = sendMail(env, {
      to: text(user, 'email') ?? '',
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: user.lado === 'CLIENTE' && firstClient ? lawyerOf(firstClient) : null,
    });
    if (outcome.sent) report.sent++;
    else if (outcome.error === 'QUOTA') report.noQuota++;
    else report.failed++;
  }

  const left = remainingQuota(env);
  if (report.noQuota || left < LOW_QUOTA) {
    try {
      underLock(env, DIGEST_ACTOR, (r) => {
        const admins = r.db
          .rows('Usuarios')
          .filter((u) => !u.deleted && u.lado === 'EMPIRICA' && u.rolBase === 'SOCIO_ADMIN');
        saveNotifications(
          r.db,
          r.writer,
          admins.map((u) => ({
            usuarioId: u.id,
            tipo: 'CUOTA_CORREO' as const,
            about: null,
            mensaje: String(left),
            link: null,
            clienteId: null,
          })),
          null,
        );
      });
    } catch (error) {
      env.log('Resumen: no se pudo avisar de la cuota', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  env.log('Resumen diario', report);
  return report;
}
