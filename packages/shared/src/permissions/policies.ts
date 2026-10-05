/**
 * The permission matrix of docs/PERMISOS.md as data. One entry per tab and
 * role. Reading is further limited by visibility and scope (read.ts); this
 * table says which operations a role may attempt at all.
 *
 * Users, memberships, invitations and settings are not edited through
 * `sync.push`: they have online endpoints with their own checks.
 */
import type { EstadoTarea, Rol } from '../domain/enums.ts';
import type { TableName } from '../domain/tables.ts';
import type { Value } from '../domain/values.ts';

/** Placeholder for "the user making the change" in forced values. */
export const SELF = '$self';

export interface CreateRule {
  /** Values the server sets; the device may send them only if they match. */
  forced?: Readonly<Record<string, Value>>;
  /** Columns that must stay empty. */
  blank?: readonly string[];
}

export interface UpdateRule {
  /** The only columns this role may change. */
  fields: readonly string[];
  /** Only on records the user owns (see OWNER_COLUMN). */
  own?: boolean;
  /** Extra condition, see clientTaskRule in write.ts. */
  rule?: 'clientTask';
}

export interface TablePolicy {
  read: boolean;
  create: boolean | CreateRule;
  update: false | 'all' | 'own' | UpdateRule;
  delete: false | 'all' | 'own';
}

/** Which column makes a record "one's own" for the 'own' grants. */
export const OWNER_COLUMN: Partial<Record<TableName, string>> = {
  Comentarios: 'autorId',
  Notificaciones: 'usuarioId',
};

/** Set on creation for every role. */
export const FORCED_ON_CREATE: Partial<Record<TableName, Readonly<Record<string, Value>>>> = {
  Comentarios: { autorId: SELF },
  Documentos: { subidoPor: SELF },
};

/**
 * Columns that can only name the user making the change: whoever validates
 * (or turns down) a compliance record signs it as themselves.
 */
export const SELF_ONLY: Partial<Record<TableName, readonly string[]>> = {
  CumplimientosHistorial: ['validadoPor'],
};

/** States a client user may move a task of their side to (decision D18). */
export const CLIENT_TASK_STATES: readonly EstadoTarea[] = [
  'POR_HACER',
  'EN_CURSO',
  'BLOQUEADA',
  'EN_REVISION',
];

/** What lawyers and assistants may change on a client's card (note 1). */
export const CLIENT_OPERATIONAL_FIELDS = ['nombreComercial', 'idioma', 'logoFileId'] as const;

const FULL: TablePolicy = { read: true, create: true, update: 'all', delete: 'all' };
const NO_DELETE: TablePolicy = { read: true, create: true, update: 'all', delete: false };
const READ: TablePolicy = { read: true, create: false, update: false, delete: false };
const NONE: TablePolicy = { read: false, create: false, update: false, delete: false };

type RolePolicies = Record<Rol, TablePolicy>;

const byRole = (
  firm: [TablePolicy, TablePolicy, TablePolicy],
  client: [TablePolicy, TablePolicy, TablePolicy],
): RolePolicies => ({
  SOCIO_ADMIN: firm[0],
  ABOGADO: firm[1],
  ASISTENTE: firm[2],
  CLIENTE_ADMIN: client[0],
  CLIENTE_COLABORADOR: client[1],
  CLIENTE_LECTURA: client[2],
});

/** Firm works the record, the client reads what is shared with it. */
const OPERATIONAL = byRole([FULL, FULL, NO_DELETE], [READ, READ, READ]);
/** Firm-only reference data. */
const FIRM_CATALOG = byRole([FULL, READ, READ], [NONE, NONE, NONE]);
/** Edited through online endpoints only. */
const ONLINE_ONLY = byRole([READ, READ, READ], [READ, READ, READ]);

const clientCreates = (rule: CreateRule): [TablePolicy, TablePolicy, TablePolicy] => {
  const p: TablePolicy = { read: true, create: rule, update: false, delete: false };
  return [p, p, READ];
};

const clientOperational: TablePolicy = {
  read: true,
  create: false,
  update: { fields: CLIENT_OPERATIONAL_FIELDS },
  delete: false,
};

const clientTask: TablePolicy = {
  read: true,
  create: false,
  update: { fields: ['estado', 'checklist'], rule: 'clientTask' },
  delete: false,
};

const clientComment: TablePolicy = {
  read: true,
  create: { forced: { visibilidad: 'COMPARTIDO' } },
  update: { fields: ['texto', 'menciones'], own: true },
  delete: 'own',
};

/** Anyone may tell the firm something about the portal; only as themselves. */
const ownFeedback: TablePolicy = {
  read: true,
  create: { forced: { usuarioId: SELF, estado: 'NUEVA' }, blank: ['respuesta'] },
  update: false,
  delete: false,
};

/** The administrators answer it and move it along. */
const answerFeedback: TablePolicy = {
  ...ownFeedback,
  update: { fields: ['estado', 'respuesta'] },
};

/**
 * A monthly report (F6): the firm prepares the draft (its summary and
 * language); sending it is an online action (reports.send) that fixes it.
 */
const reportDraft: TablePolicy = {
  read: true,
  create: { forced: { estado: 'BORRADOR' } },
  update: { fields: ['resumen', 'idioma'] },
  delete: false,
};

const ownNotification: TablePolicy = {
  read: true,
  create: false,
  update: { fields: ['leida'], own: true },
  delete: false,
};

export const POLICIES: Record<TableName, RolePolicies> = {
  Config: ONLINE_ONLY,
  Clientes: byRole([FULL, clientOperational, clientOperational], [READ, READ, READ]),
  Entidades: OPERATIONAL,
  Usuarios: ONLINE_ONLY,
  Membresias: ONLINE_ONLY,
  Invitaciones: byRole([NONE, NONE, NONE], [NONE, NONE, NONE]),
  Asuntos: OPERATIONAL,
  Tareas: byRole([FULL, FULL, NO_DELETE], [clientTask, clientTask, READ]),
  Tramites: OPERATIONAL,
  PlantillasTramite: FIRM_CATALOG,
  Obligaciones: OPERATIONAL,
  CumplimientosHistorial: byRole(
    [FULL, NO_DELETE, NO_DELETE],
    clientCreates({ forced: { estado: 'EN_REVISION' }, blank: ['validadoPor'] }),
  ),
  CatalogoObligaciones: FIRM_CATALOG,
  Contratos: OPERATIONAL,
  Documentos: byRole(
    [FULL, FULL, NO_DELETE],
    clientCreates({ forced: { visibilidad: 'COMPARTIDO' } }),
  ),
  Solicitudes: byRole(
    [FULL, NO_DELETE, NO_DELETE],
    clientCreates({ forced: { estado: 'RECIBIDA' }, blank: ['asuntoIdGenerado'] }),
  ),
  Comentarios: byRole(
    [
      FULL,
      { read: true, create: true, update: 'own', delete: 'own' },
      { read: true, create: true, update: 'own', delete: false },
    ],
    [clientComment, clientComment, READ],
  ),
  Eventos: OPERATIONAL,
  DiasInhabiles: byRole([FULL, READ, READ], [READ, READ, READ]),
  Notificaciones: byRole(
    [ownNotification, ownNotification, ownNotification],
    [ownNotification, ownNotification, ownNotification],
  ),
  Conflictos: byRole([READ, READ, READ], [NONE, NONE, NONE]),
  Sugerencias: byRole(
    [answerFeedback, ownFeedback, ownFeedback],
    [ownFeedback, ownFeedback, ownFeedback],
  ),
  Bitacora: byRole([NONE, NONE, NONE], [NONE, NONE, NONE]),
  Reportes: byRole(
    [{ ...reportDraft, delete: 'all' }, reportDraft, reportDraft],
    [READ, READ, READ],
  ),
  OpsAplicadas: byRole([NONE, NONE, NONE], [NONE, NONE, NONE]),
  Calendario: byRole([NONE, NONE, NONE], [NONE, NONE, NONE]),
};

export type Operation = 'create' | 'update' | 'delete';

/** Whether a role may attempt an operation on a tab at all (for the interface). */
export function allows(table: TableName, rol: Rol, op: Operation | 'read'): boolean {
  const p = POLICIES[table][rol];
  if (op === 'read') return p.read;
  if (op === 'create') return p.create !== false;
  return p[op] !== false;
}
