/**
 * Sending a monthly report (F6, PLAN.md § 20), online. The lawyer's browser
 * makes the PDF from the draft they reviewed; the server keeps it in the
 * client's Drive folder (`Reportes`), marks the report ENVIADO (from then on
 * nobody changes it) and emails it to the client's users who see the whole
 * company. Those users, and the firm, download it again from the portal.
 *
 * As with document files, the lock is held only to read and write the
 * records, never while Drive stores the PDF or while the emails go.
 */
import {
  authorizeReportSend,
  buildUserContext,
  canRead,
  periodBounds,
  periodLabel,
  previousPeriod,
  projectRow,
  seesWholeClient,
  text,
  toProjectDate,
  type FileDownloadData,
  type ReportSendData,
  type Row,
  type UserContext,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import { readAgendaSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import type { GFile } from '../google.ts';
import { reportEmail } from '../mail/templates.ts';
import { sendMail } from '../mail/send.ts';
import { saveNotifications, type NotificationDraft } from '../notify.ts';
import { clientFolder, subfolder } from './files.ts';
import { changed, freshContext, underLock, type LockedRun } from './locked.ts';

/** The client's subfolder where sent reports are kept. */
export const REPORTS_FOLDER = 'Reportes';

type Lang = 'es' | 'en';
const langOf = (value: unknown): Lang => (value === 'en' ? 'en' : 'es');

const invalid = (reason: string, message: string): ApiError =>
  new ApiError('VALIDATION', message, { reason });

const denied = (verdict: { code: ApiError['code']; reason: string }): ApiError =>
  new ApiError(verdict.code, undefined, { reason: verdict.reason });

const clientName = (db: Database, clienteId: string): string => {
  const c = db.table('Clientes').get(clienteId);
  return (c ? (text(c, 'nombreComercial') ?? text(c, 'razonSocial')) : null) ?? '';
};

/** "Reporte 2026-09 - Cliente Demo.pdf", without what a file name may not carry. */
export function reportFileName(periodo: string, client: string, lang: Lang): string {
  const safe = client
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${lang === 'en' ? 'Report' : 'Reporte'} ${periodo}${safe ? ` - ${safe}` : ''}.pdf`;
}

interface Recipient {
  usuarioId: string;
  email: string;
  name: string | null;
  lang: Lang;
}

/** The client's active users whose access covers the whole client. */
function recipientsOf(db: Database, clienteId: string): Recipient[] {
  const out: Recipient[] = [];
  for (const user of db.rows('Usuarios')) {
    if (user.deleted || user.estado !== 'ACTIVO' || user.lado !== 'CLIENTE') continue;
    const email = text(user, 'email');
    if (!email) continue;
    const ctx = buildUserContext({
      user,
      membresias: db.rows('Membresias'),
      entidades: db.rows('Entidades'),
      clientes: db.rows('Clientes'),
    });
    if (!seesWholeClient(ctx.clients.get(clienteId))) continue;
    out.push({
      usuarioId: user.id,
      email,
      name: text(user, 'nombre'),
      lang: langOf(user.idioma),
    });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

/** The report, checked again: who may send it, and no other report of that month already sent. */
function sendable(
  r: LockedRun,
  session: Session,
  reporteId: string,
): { ctx: UserContext; row: Row; clienteId: string } {
  const ctx = freshContext(r.db, session.user.id);
  const row = r.db.table('Reportes').get(reporteId);
  const verdict = authorizeReportSend(ctx, row, r.db.lookup());
  if (!verdict.ok) throw denied(verdict);
  if (!row) throw new ApiError('NOT_FOUND');
  const periodo = text(row, 'periodo');
  const twin = r.db
    .rows('Reportes')
    .find(
      (o) =>
        !o.deleted &&
        o.id !== row.id &&
        o.clienteId === verdict.clienteId &&
        text(o, 'periodo') === periodo &&
        o.estado === 'ENVIADO',
    );
  if (twin) throw new ApiError('CONFLICT', undefined, { reason: 'ALREADY_SENT' });
  return { ctx, row, clienteId: verdict.clienteId };
}

export function sendReport(
  env: Env,
  session: Session,
  input: { reporteId: string; pdf: string },
): ReportSendData {
  const userId = session.user.id;

  // 1. Without the lock: the PDF is one.
  let bytes: number[];
  try {
    bytes = env.g.Utilities.base64Decode(input.pdf);
  } catch {
    throw invalid('FILE_CORRUPT', 'El PDF llegó dañado; intenta de nuevo.');
  }
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
    throw invalid('NOT_PDF', 'El reporte no es un PDF.');
  }

  // 2. With the lock, briefly: who, what, and the folder it goes in.
  const target = underLock(env, userId, (r) => {
    const { row, clienteId } = sendable(r, session, input.reporteId);
    const lang = langOf(text(row, 'idioma') ?? r.db.table('Clientes').get(clienteId)?.idioma);
    return {
      folderId: subfolder(clientFolder(r, clienteId), REPORTS_FOLDER).getId(),
      name: reportFileName(text(row, 'periodo') ?? '', clientName(r.db, clienteId), lang),
    };
  });

  // 3. Without the lock: the PDF in Drive.
  const file: GFile = env.g.DriveApp.getFolderById(target.folderId).createFile(
    env.g.Utilities.newBlob(bytes, 'application/pdf', target.name),
  );

  // 4. With the lock again: checked again, marked sent, the bell of each recipient.
  let sent: {
    row: Row;
    clienteId: string;
    periodo: string;
    lang: Lang;
    summary: string | null;
    client: string;
    recipients: Recipient[];
  };
  try {
    sent = underLock(env, userId, (r) => {
      const { ctx, row, clienteId } = sendable(r, session, input.reporteId);
      const recipients = recipientsOf(r.db, clienteId);
      const periodo = text(row, 'periodo') ?? '';
      const enviadoA = recipients.map((p) => p.email);
      const saved = r.writer.save(
        'Reportes',
        row,
        changed(r, row, {
          estado: 'ENVIADO',
          pdfId: file.getId(),
          enviadoA,
          fecha: r.serverNow,
          enviadoPor: userId,
        }),
      );
      r.writer.audit(
        'ENVIAR',
        'Reportes',
        row.id,
        clienteId,
        { estado: row.estado ?? null },
        { estado: 'ENVIADO', pdfId: file.getId(), enviadoA },
      );
      saveNotifications(
        r.db,
        r.writer,
        recipients.map((p) => ({
          usuarioId: p.usuarioId,
          tipo: 'REPORTE_ENVIADO' as const,
          about: { table: 'Reportes' as const, row: saved },
          mensaje: periodLabel(periodo, p.lang),
          link: `/reportes/${clienteId}/${periodo}`,
          clienteId,
        })),
        userId,
      );
      return {
        row: projectRow(ctx, 'Reportes', saved),
        clienteId,
        periodo,
        lang: langOf(text(saved, 'idioma') ?? r.db.table('Clientes').get(clienteId)?.idioma),
        summary: text(saved, 'resumen'),
        client: clientName(r.db, clienteId),
        recipients,
      };
    });
  } catch (error) {
    file.setTrashed(true);
    throw error;
  }

  // 5. Without the lock: one email per recipient, the PDF attached.
  if (!sent.recipients.length) return { row: sent.row, enviadoA: [], emailError: 'NO_RECIPIENTS' };
  const settings = readAgendaSettings(new Database(env).rows('Config'));
  const link = `${settings.portalUrl.replace(/\/*$/, '/')}#/reportes/${sent.clienteId}/${sent.periodo}`;
  const pdf = env.g.Utilities.newBlob(bytes, 'application/pdf', target.name);
  const reached: string[] = [];
  let emailError: string | null = null;
  for (const p of sent.recipients) {
    const email = reportEmail({
      lang: sent.lang,
      name: p.name,
      email: p.email,
      client: sent.client,
      period: periodLabel(sent.periodo, sent.lang),
      summary: sent.summary,
      link,
    });
    const outcome = sendMail(env, {
      to: p.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: text(session.user, 'email'),
      attachments: [pdf],
    });
    if (outcome.sent) reached.push(p.email);
    else emailError ??= outcome.error;
  }
  return { row: sent.row, enviadoA: reached, ...(emailError ? { emailError } : {}) };
}

/** A sent report's PDF, again: for whoever may read the report. */
export function downloadReport(
  env: Env,
  session: Session,
  input: { reporteId: string },
): FileDownloadData {
  const db = new Database(env);
  const ctx = freshContext(db, session.user.id);
  const row = db.table('Reportes').get(input.reporteId);
  if (!row || row.deleted || !canRead(ctx, 'Reportes', row, db.lookup())) {
    throw new ApiError('NOT_FOUND');
  }
  const pdfId = text(row, 'pdfId');
  if (!pdfId) throw new ApiError('NOT_FOUND', undefined, { reason: 'NOT_UPLOADED' });
  let file: GFile;
  try {
    file = env.g.DriveApp.getFileById(pdfId);
  } catch {
    throw new ApiError('NOT_FOUND', 'El PDF ya no está en Drive.', { reason: 'FILE_MISSING' });
  }
  const clienteId = text(row, 'clienteId') ?? '';
  const lang = langOf(text(row, 'idioma') ?? db.table('Clientes').get(clienteId)?.idioma);
  return {
    nombre: reportFileName(text(row, 'periodo') ?? '', clientName(db, clienteId), lang),
    mimeType: 'application/pdf',
    base64: env.g.Utilities.base64Encode(file.getBlob().getBytes()),
  };
}

/**
 * The first of each month (the nightly job, in Cancún): each active
 * client's lawyer hears that last month's report is ready to review and
 * send (REPORTE_POR_PREPARAR); a client without a lawyer, the partners.
 * Not for a client that started after that month, nor for a report already
 * sent, nor twice to the same person.
 */
export function remindMonthlyReports(env: Env): number {
  const today = toProjectDate(env.now());
  if (!today.endsWith('-01')) return 0;
  const periodo = previousPeriod(today);
  const lastDay = periodBounds(periodo).to;
  return underLock(env, 'sistema', (r) => {
    const users = r.db.rows('Usuarios').filter((u) => !u.deleted && u.estado === 'ACTIVO');
    const byId = new Map(users.map((u) => [u.id, u]));
    const partners = users.filter((u) => u.lado === 'EMPIRICA' && u.rolBase === 'SOCIO_ADMIN');
    const told = new Set(
      r.db
        .rows('Notificaciones')
        .filter((n) => n.tipo === 'REPORTE_POR_PREPARAR')
        .map((n) => `${text(n, 'usuarioId') ?? ''}|${text(n, 'link') ?? ''}`),
    );
    const sent = new Set(
      r.db
        .rows('Reportes')
        .filter((x) => !x.deleted && x.estado === 'ENVIADO' && text(x, 'periodo') === periodo)
        .map((x) => text(x, 'clienteId')),
    );
    const drafts: NotificationDraft[] = [];
    for (const c of r.db.rows('Clientes')) {
      if (c.deleted || c.estado !== 'ACTIVO' || sent.has(c.id)) continue;
      const start = text(c, 'fechaInicio');
      if (start && start > lastDay) continue;
      const lawyer = byId.get(text(c, 'abogadoResponsableId') ?? '');
      const link = `/reportes/${c.id}/${periodo}`;
      for (const u of lawyer ? [lawyer] : partners) {
        if (told.has(`${u.id}|${link}`)) continue;
        drafts.push({
          usuarioId: u.id,
          tipo: 'REPORTE_POR_PREPARAR',
          about: { table: 'Clientes', row: c },
          mensaje: `${clientName(r.db, c.id)} · ${periodLabel(periodo, langOf(u.idioma))}`,
          link,
          clienteId: c.id,
        });
      }
    }
    return saveNotifications(r.db, r.writer, drafts, null);
  });
}
