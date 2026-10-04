/**
 * The portal's bell (`Notificaciones`): what tells a person, at once, that
 * something needs them. The server writes them; each kind names the record
 * (`mensaje` holds its title, as typed) and the page that opens it (`link`).
 * The words around the title live in the interface's translations.
 */
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
  /** Someone named you in a comment. */
  'MENCION',
  /** A client administrator invited someone: the firm approves. */
  'INVITACION_POR_APROBAR',
  /** The administrators answered your suggestion or report. */
  'SUGERENCIA_RESPONDIDA',
  /** Someone moved a deadline in Google Calendar; the portal put it back. */
  'CALENDARIO_REVERTIDO',
  /** The daily emails are running out. */
  'CUOTA_CORREO',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const isNotificationKind = (value: unknown): value is NotificationKind =>
  typeof value === 'string' && (NOTIFICATION_KINDS as readonly string[]).includes(value);
