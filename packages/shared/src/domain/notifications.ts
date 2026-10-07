/**
 * The portal's bell (`Notificaciones`): what tells a person, at once, that
 * something needs them. The server writes them; each kind names the record
 * (`mensaje` holds its title, as typed) and the page that opens it (`link`).
 * The words around the title live in the interface's translations.
 */
import { parseInstant } from '../time.ts';
import type { Row } from './values.ts';

export const NOTIFICATION_KINDS = [
  /** A task was given to you. */
  'TAREA_ASIGNADA',
  /** The client finished a task: it waits for the firm's review. */
  'TAREA_EN_REVISION',
  /** The client sent evidence of an obligation. */
  'EVIDENCIA_ENVIADA',
  'EVIDENCIA_VALIDADA',
  'EVIDENCIA_RECHAZADA',
  /** The client asked for something. */
  'SOLICITUD_NUEVA',
  /** Two people changed a sensitive date at once: someone must decide. */
  'CONFLICTO',
  /** A client administrator invited someone: the firm approves. */
  'INVITACION_POR_APROBAR',
  /** The administrators answered your suggestion or report. */
  'SUGERENCIA_RESPONDIDA',
  /** Someone moved a deadline in Google Calendar; the portal put it back. */
  'CALENDARIO_REVERTIDO',
  /** The daily emails are running out. */
  'CUOTA_CORREO',
  /** F6: the month's report of a client is ready to review (the 1st, to its lawyer). */
  'REPORTE_POR_PREPARAR',
  /** F6: the firm sent the client its monthly report. */
  'REPORTE_ENVIADO',
  /** F6: Google said the day's AI quota ran out (to the partners). */
  'IA_CUOTA',
  /** F6: 80 % of the day's AI limit (Config.limiteDiarioIA) is used, once a day (to the partners). */
  'IA_CUOTA_ALTA',
  /** F6: the AI model in Config no longer exists; the portal chose another (to the partners). */
  'IA_MODELO',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const isNotificationKind = (value: unknown): value is NotificationKind =>
  typeof value === 'string' && (NOTIFICATION_KINDS as readonly string[]).includes(value);

/**
 * How long a notice stays (F7, PLAN.md § 21): read, 60 days; never read, a
 * year. Then it goes, on the server (each night) and on every device by the
 * same rule, so no device keeps one the server no longer has and the bell and
 * the sync read less. The change that caused it stays in the audit log.
 */
export const NOTICE_KEEP_DAYS = { read: 60, unread: 365 } as const;

export function isStaleNotice(row: Row, nowMs: number): boolean {
  const at = parseInstant(row.createdAt);
  if (at === null) return false;
  const days = row.leida === true ? NOTICE_KEEP_DAYS.read : NOTICE_KEEP_DAYS.unread;
  return nowMs - at > days * 86_400_000;
}
