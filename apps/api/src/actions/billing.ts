/**
 * Billing on the server (F9, PLAN.md § 28). Fees, charges, payments,
 * expenses and reminders travel by `sync.push`, like everything else, so
 * they work offline; here only what needs the server:
 *
 * - billing.participants.save: who takes part in the splits (D82). The
 *   partners only, online: it is a small tab sent whole to whoever may see
 *   billing (snapshot.ts), never edited from a queue;
 * - each night, the bell (D84): the reminders that fall today, once, to the
 *   people they name; and the charges 1, 7, 15, 30, 60 or 90 days overdue,
 *   to whoever follows them: the charge's responsible person, else its
 *   fee's, else the client's lawyer, else the partners. Whoever may not see
 *   billing is never told (saveNotifications checks it again).
 */
import {
  BOOKKEEPING_COLUMNS,
  OVERDUE_NOTICE_DAYS,
  chargesOf,
  hasBillingAccess,
  reminderRecipients,
  remindsOn,
  text,
  toProjectDate,
  type Charge,
  type ParticipantSaveData,
  type Row,
  type TIPOS_PARTICIPANTE,
  type Value,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import type { Env } from '../env.ts';
import { saveNotifications, type NotificationDraft } from '../notify.ts';
import { changed, freshContext, newRow, saveChange, underLock } from './locked.ts';

const BOOKKEEPING = new Set(BOOKKEEPING_COLUMNS.map((c) => c.name));

const withoutBookkeeping = (row: Row): Row => {
  const out: Row = { id: row.id };
  for (const [k, v] of Object.entries(row)) if (!BOOKKEEPING.has(k)) out[k] = v;
  return out;
};

export function saveParticipant(
  env: Env,
  session: Session,
  input: {
    participanteId?: string | undefined;
    nombre: string;
    tipo: (typeof TIPOS_PARTICIPANTE)[number];
    usuarioId?: string | null | undefined;
    tasaImpuesto?: number | null | undefined;
    activo?: boolean | undefined;
    notas?: string | null | undefined;
  },
): ParticipantSaveData {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    if (!ctx.isAdmin) throw new ApiError('FORBIDDEN');
    const usuarioId = input.usuarioId ?? null;
    if (usuarioId) {
      const user = r.db.table('Usuarios').get(usuarioId);
      if (!user || user.deleted || user.lado !== 'EMPIRICA') {
        throw new ApiError('VALIDATION', 'Solo participa en el reparto alguien del despacho.');
      }
      const taken = r.db
        .rows('Participantes')
        .some((p) => !p.deleted && p.usuarioId === usuarioId && p.id !== input.participanteId);
      if (taken) throw new ApiError('VALIDATION', 'Esa persona ya está en los participantes.');
    }
    const fields: Record<string, Value> = {
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      usuarioId,
      tasaImpuesto: input.tasaImpuesto ?? null,
      activo: input.activo ?? true,
      notas: input.notas?.trim() ? input.notas.trim() : null,
    };
    const audited = Object.keys(fields);
    if (!input.participanteId) {
      const created = saveChange(r, 'Participantes', undefined, newRow(r, fields), null, audited);
      return { participante: withoutBookkeeping(created) };
    }
    const existing = r.db.table('Participantes').get(input.participanteId);
    if (!existing || existing.deleted) throw new ApiError('NOT_FOUND');
    const saved = saveChange(
      r,
      'Participantes',
      existing,
      changed(r, existing, fields),
      null,
      audited,
    );
    return { participante: withoutBookkeeping(saved) };
  });
}

export interface BillingNoticesReport {
  reminders: number;
  overdue: number;
  /** Notes written in the bell. */
  notices: number;
}

const chargeTitle = (db: Database, c: Charge): string => {
  const cliente = db.table('Clientes').get(c.clienteId);
  const name = cliente
    ? (text(cliente, 'nombreComercial') ?? text(cliente, 'razonSocial') ?? '')
    : '';
  return [name, c.concepto, c.periodo ?? ''].filter(Boolean).join(' · ');
};

/** The nightly bell of billing (D84). */
export function runBillingNotices(env: Env): BillingNoticesReport {
  const today = toProjectDate(env.now());
  return underLock(env, 'sistema', (r) => {
    const users = new Map(
      r.db
        .rows('Usuarios')
        .filter((u) => !u.deleted && u.estado === 'ACTIVO')
        .map((u) => [u.id, u]),
    );
    const partners = [...users.values()].filter(
      (u) => u.lado === 'EMPIRICA' && u.rolBase === 'SOCIO_ADMIN',
    );
    const liveClients = new Set(
      r.db
        .rows('Clientes')
        .filter((c) => !c.deleted && c.estado !== 'INACTIVO')
        .map((c) => c.id),
    );
    const drafts: NotificationDraft[] = [];
    const report: BillingNoticesReport = { reminders: 0, overdue: 0, notices: 0 };

    for (const rec of r.db.rows('RecordatoriosCobro')) {
      if (rec.deleted || rec.activo === false) continue;
      const clienteId = text(rec, 'clienteId');
      if (!clienteId || !liveClients.has(clienteId)) continue;
      if (text(rec, 'ultimoAviso') === today || !remindsOn(rec, today)) continue;
      const cobroId = text(rec, 'cobroId');
      for (const usuarioId of reminderRecipients(rec)) {
        drafts.push({
          usuarioId,
          tipo: 'COBRO_RECORDATORIO',
          about: { table: 'RecordatoriosCobro', row: rec },
          mensaje: text(rec, 'titulo') ?? '',
          link: cobroId ? `/cobranza/cobros/${cobroId}` : '/cobranza/recordatorios',
          clienteId,
        });
      }
      const saved = r.writer.save(
        'RecordatoriosCobro',
        rec,
        changed(r, rec, { ultimoAviso: today }),
      );
      r.writer.audit(
        'SISTEMA',
        'RecordatoriosCobro',
        rec.id,
        clienteId,
        { ultimoAviso: rec.ultimoAviso ?? null },
        { ultimoAviso: saved.ultimoAviso ?? null },
      );
      report.reminders++;
    }

    const fees = new Map(r.db.rows('Honorarios').map((f) => [f.id, f]));
    const charges = chargesOf(
      { honorarios: [...fees.values()], cobros: r.db.rows('Cobros'), pagos: r.db.rows('Pagos') },
      today,
    );
    for (const c of charges) {
      if (c.status !== 'VENCIDO' || !OVERDUE_NOTICE_DAYS.includes(c.diasVencido)) continue;
      if (!liveClients.has(c.clienteId)) continue;
      const fee = c.honorarioId ? fees.get(c.honorarioId) : undefined;
      const about = c.row
        ? { table: 'Cobros' as const, row: c.row }
        : fee
          ? { table: 'Honorarios' as const, row: fee }
          : null;
      if (!about) continue;
      const cliente = r.db.table('Clientes').get(c.clienteId);
      const follower = [
        c.responsableId,
        fee ? text(fee, 'responsableId') : null,
        cliente ? text(cliente, 'abogadoResponsableId') : null,
      ]
        .map((id) => (id ? users.get(id) : undefined))
        .find((u): u is Row => u !== undefined && hasBillingAccess(u));
      for (const u of follower ? [follower] : partners) {
        drafts.push({
          usuarioId: u.id,
          tipo: 'COBRO_VENCIDO',
          about,
          mensaje: chargeTitle(r.db, c),
          link: `/cobranza/cobros/${c.id}`,
          clienteId: c.clienteId,
        });
      }
      report.overdue++;
    }
    report.notices = saveNotifications(r.db, r.writer, drafts, null);
    return report;
  });
}
