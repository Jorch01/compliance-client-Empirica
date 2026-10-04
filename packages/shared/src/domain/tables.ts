/**
 * The data model: one entry per sheet tab. It is the single source for the
 * sheet layout (setup), the validation of incoming changes, the permission
 * filters and, from phase 2, the local database in the browser.
 *
 * Column names are the firm's own (Spanish), as they appear in the sheet.
 */
import {
  AREAS,
  CATEGORIAS_OBLIGACION,
  ESTADOS_ASUNTO,
  ESTADOS_CLIENTE,
  ESTADOS_CONFLICTO,
  ESTADOS_CUMPLIMIENTO,
  ESTADOS_INVITACION,
  ESTADOS_MEMBRESIA,
  ESTADOS_OBLIGACION,
  ESTADOS_SOLICITUD,
  ESTADOS_TAREA,
  ESTADOS_TRAMITE,
  ESTADOS_USUARIO,
  LADOS,
  LADOS_RESPONSABLE,
  MODOS_IA,
  PRIORIDADES,
  RIESGOS,
  ROLES,
  SERVICIOS,
  TIPOS_ENTIDAD,
  TIPOS_EVENTO,
  VISIBILIDADES,
} from './enums.ts';

export type ColumnType =
  | 'id'
  | 'ref'
  | 'string'
  | 'text'
  | 'email'
  | 'number'
  | 'boolean'
  | 'json'
  | 'date'
  | 'datetime'
  | 'enum';

export interface ColumnDef {
  name: string;
  type: ColumnType;
  values?: readonly string[];
  /** Must be present (non-empty) when the row is created. */
  required?: boolean;
  /** For `ref` columns: the tab the id points to. */
  ref?: TableName;
}

/** How a row is tied to a client, a business unit, a matter and to people. */
export interface ScopeDef {
  /** Column that holds the client id ('id' for the Clientes tab itself). */
  client?: string;
  /** Column that holds the business unit ('id' for Entidades itself). */
  unit?: string;
  /** Column that holds the matter ('id' for Asuntos itself). */
  asunto?: string;
  /** Columns naming users who always see the row (assigned to it, or its author). */
  owners?: readonly string[];
  /** The row belongs to a single user (Notificaciones). */
  user?: string;
  /** The tab has a `visibilidad` column (INTERNO | COMPARTIDO). */
  visibility?: boolean;
  /**
   * The row hangs from another record and is visible only while that record is.
   * `column` holds the parent id; `tableColumn` the parent tab when it varies
   * (comments on any record); `json` when both travel in one JSON column.
   */
  parent?: ParentDef;
}

/**
 * Where a row hangs from. The child always takes the parent's client.
 *
 * `mode` says how the parent limits who sees the child:
 * - 'attached': the child is part of the parent (comments, documents,
 *   evidence, calendar events): whoever sees the parent sees its shared
 *   children, and nobody else;
 * - 'grouped': the child has its own scope (tasks within a matter): it is
 *   seen by its own unit, assignee or author, but never while the parent is
 *   internal.
 *
 * `unit` says what happens with the business unit: 'copy' keeps it equal to
 * the parent's, 'default' only fills it when the child does not name one.
 */
export type ParentDef = (
  | { kind: 'fixed'; table: TableName; column: string }
  | { kind: 'column'; tableColumn: string; column: string; tables: readonly TableName[] }
  | { kind: 'json'; column: string; tables: readonly TableName[] }
) & { mode: 'attached' | 'grouped'; unit?: 'copy' | 'default' };

/** JSON stored in `vinculo` and `origen`: the record a row hangs from. */
export interface ParentLink {
  tipo: TableName;
  id: string;
}

export type Audience =
  /** Firm and the client members, subject to visibility and scope. */
  | 'members'
  /** Firm only. */
  | 'firm'
  /** Everyone with an account (non-client reference data such as public holidays). */
  | 'everyone';

/**
 * How a tab reaches the devices:
 * - pushpull: incremental by `serverSeq`, edited offline through `sync.push`;
 * - pull: incremental, read-only on the devices;
 * - snapshot: small tabs sent whole whenever what the user may see changes
 *   (users, memberships, settings); edited only through online endpoints;
 * - none: stays on the server.
 */
export type SyncMode = 'pushpull' | 'pull' | 'snapshot' | 'none';

export interface TableDef {
  name: TableName;
  columns: readonly ColumnDef[];
  sync: SyncMode;
  audience: Audience;
  scope: ScopeDef;
  /** Legally sensitive: concurrent edits are not merged automatically. */
  sensitive: readonly string[];
  /** Never sent to client users. */
  hiddenFromClients: readonly string[];
  /** Never sent to any device. */
  serverOnly: readonly string[];
  /** Written only by the server (ids of Drive files, calendar events...). */
  serverManaged: readonly string[];
  /** Cannot change once the row exists. */
  immutable: readonly string[];
}

/** Columns every tab carries, in this order, before its own. */
export const COMMON_COLUMNS: readonly ColumnDef[] = [
  { name: 'id', type: 'id' },
  { name: 'createdAt', type: 'datetime' },
  { name: 'createdBy', type: 'string' },
  { name: 'updatedAt', type: 'datetime' },
  { name: 'updatedBy', type: 'string' },
  { name: 'version', type: 'number' },
  { name: 'deleted', type: 'datetime' },
  { name: 'serverSeq', type: 'number' },
  { name: 'fieldTimestamps', type: 'json' },
];

/**
 * Sync bookkeeping, after the tab's own columns. `seqAlta` is the sequence at
 * creation; `alcanceHist` keeps the previous values of the fields that decide
 * who sees the row, so a device can be told to drop a row it is no longer
 * allowed to see without telling anyone else that the row exists.
 */
export const BOOKKEEPING_COLUMNS: readonly ColumnDef[] = [
  { name: 'seqAlta', type: 'number' },
  { name: 'alcanceHist', type: 'json' },
];

export const SYSTEM_COLUMNS = new Set([
  ...COMMON_COLUMNS.map((c) => c.name),
  ...BOOKKEEPING_COLUMNS.map((c) => c.name),
]);

const e = (values: readonly string[]): Pick<ColumnDef, 'type' | 'values'> => ({
  type: 'enum',
  values,
});
const col = (name: string, def: Omit<ColumnDef, 'name'>): ColumnDef => ({ name, ...def });
const VISIBILIDAD = col('visibilidad', { ...e(VISIBILIDADES), required: true });
const CLIENTE = col('clienteId', { type: 'ref', ref: 'Clientes', required: true });
const ref = (name: string, target: TableName, required = false): ColumnDef =>
  col(name, { type: 'ref', ref: target, ...(required ? { required } : {}) });
const ENTIDAD = ref('entidadId', 'Entidades');
const IDIOMAS = ['es', 'en'] as const;

export const TABLE_NAMES = [
  'Config',
  'Clientes',
  'Entidades',
  'Usuarios',
  'Membresias',
  'Invitaciones',
  'Asuntos',
  'Tareas',
  'Tramites',
  'PlantillasTramite',
  'Obligaciones',
  'CumplimientosHistorial',
  'CatalogoObligaciones',
  'Contratos',
  'Documentos',
  'Solicitudes',
  'Comentarios',
  'Eventos',
  'DiasInhabiles',
  'Notificaciones',
  'Conflictos',
  'Bitacora',
  'Reportes',
  'OpsAplicadas',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

const table = (
  name: TableName,
  columns: readonly ColumnDef[],
  rest: Partial<Omit<TableDef, 'name' | 'columns'>> & Pick<TableDef, 'sync' | 'audience'>,
): TableDef => ({
  name,
  columns,
  scope: {},
  sensitive: [],
  hiddenFromClients: [],
  serverOnly: [],
  serverManaged: [],
  immutable: [],
  ...rest,
});

const VISIBLE_SCOPE_FIELDS = ['visibilidad'];

/** Records a comment can hang from. */
export const COMMENTABLE: readonly TableName[] = [
  'Asuntos',
  'Tareas',
  'Tramites',
  'Obligaciones',
  'CumplimientosHistorial',
  'Contratos',
  'Documentos',
  'Solicitudes',
];
/** Records a document can be attached to. */
export const ATTACHABLE: readonly TableName[] = [
  'Asuntos',
  'Tareas',
  'Tramites',
  'Obligaciones',
  'CumplimientosHistorial',
  'Contratos',
  'Solicitudes',
];
/** Records that put a date on the calendar. */
export const SCHEDULABLE: readonly TableName[] = [
  'Asuntos',
  'Tareas',
  'Tramites',
  'Obligaciones',
  'Contratos',
];

export const TABLES: Record<TableName, TableDef> = {
  Config: table(
    'Config',
    [
      col('clave', { type: 'string', required: true }),
      col('valor', { type: 'text' }),
      col('publica', { type: 'boolean' }),
    ],
    { sync: 'snapshot', audience: 'everyone', immutable: ['clave'] },
  ),

  Clientes: table(
    'Clientes',
    [
      col('razonSocial', { type: 'string', required: true }),
      col('nombreComercial', { type: 'string' }),
      col('rfc', { type: 'string' }),
      col('servicio', { ...e(SERVICIOS), required: true }),
      col('perimetroIguala', { type: 'json' }),
      col('fechaInicio', { type: 'date' }),
      col('estado', { ...e(ESTADOS_CLIENTE), required: true }),
      ref('abogadoResponsableId', 'Usuarios'),
      col('driveFolderId', { type: 'string' }),
      col('calendarId', { type: 'string' }),
      col('idioma', e(IDIOMAS)),
      col('logoFileId', { type: 'string' }),
      col('modoIA', e(MODOS_IA)),
      col('membershipEpoch', { type: 'number' }),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: { client: 'id' },
      sensitive: ['servicio', 'perimetroIguala', 'estado'],
      hiddenFromClients: ['driveFolderId', 'calendarId', 'modoIA'],
      serverOnly: ['membershipEpoch'],
      serverManaged: ['driveFolderId', 'calendarId', 'membershipEpoch'],
    },
  ),

  Entidades: table(
    'Entidades',
    [
      CLIENTE,
      col('nombre', { type: 'string', required: true }),
      col('tipo', { ...e(TIPOS_ENTIDAD), required: true }),
      col('rfc', { type: 'string' }),
      col('domicilio', { type: 'text' }),
      col('incluidaEnIguala', { type: 'boolean' }),
      ref('parentId', 'Entidades'),
      col('giro', { type: 'string' }),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: { client: 'clienteId', unit: 'id' },
      immutable: ['clienteId'],
    },
  ),

  Usuarios: table(
    'Usuarios',
    [
      col('email', { type: 'email', required: true }),
      col('nombre', { type: 'string', required: true }),
      col('lado', { ...e(LADOS), required: true }),
      col('rolBase', { ...e(ROLES), required: true }),
      col('estado', { ...e(ESTADOS_USUARIO), required: true }),
      col('idioma', e(IDIOMAS)),
      col('prefsNotificacion', { type: 'json' }),
      col('icsToken', { type: 'string' }),
      col('ultimoAcceso', { type: 'datetime' }),
      col('firebaseUid', { type: 'string' }),
    ],
    {
      sync: 'snapshot',
      audience: 'members',
      sensitive: ['rolBase', 'estado'],
      hiddenFromClients: ['estado', 'prefsNotificacion', 'ultimoAcceso', 'idioma'],
      serverOnly: ['icsToken', 'firebaseUid'],
      serverManaged: ['icsToken', 'firebaseUid', 'ultimoAcceso'],
      immutable: ['email'],
    },
  ),

  Membresias: table(
    'Membresias',
    [
      ref('usuarioId', 'Usuarios', true),
      CLIENTE,
      col('rol', { ...e(ROLES), required: true }),
      col('alcance', { type: 'json' }),
      col('puesto', { type: 'string' }),
      col('estado', { ...e(ESTADOS_MEMBRESIA), required: true }),
    ],
    {
      sync: 'snapshot',
      audience: 'members',
      scope: { client: 'clienteId' },
      sensitive: ['rol', 'alcance', 'estado'],
      immutable: ['usuarioId', 'clienteId'],
    },
  ),

  Invitaciones: table(
    'Invitaciones',
    [
      col('email', { type: 'email', required: true }),
      // Empty for firm users invited without a client to assign them to.
      ref('clienteId', 'Clientes'),
      col('rol', { ...e(ROLES), required: true }),
      col('alcance', { type: 'json' }),
      col('puesto', { type: 'string' }),
      ref('invitadoPor', 'Usuarios'),
      col('estado', { ...e(ESTADOS_INVITACION), required: true }),
      col('tokenHash', { type: 'string' }),
      col('venceEn', { type: 'datetime' }),
      ref('aprobadoPor', 'Usuarios'),
    ],
    {
      sync: 'none',
      audience: 'firm',
      scope: { client: 'clienteId' },
      serverOnly: ['tokenHash'],
    },
  ),

  Asuntos: table(
    'Asuntos',
    [
      CLIENTE,
      ENTIDAD,
      col('titulo', { type: 'string', required: true }),
      col('area', { ...e(AREAS), required: true }),
      col('estado', { ...e(ESTADOS_ASUNTO), required: true }),
      col('prioridad', e(PRIORIDADES)),
      ref('responsableId', 'Usuarios'),
      col('fechaInicio', { type: 'date' }),
      col('fechaObjetivo', { type: 'date' }),
      col('dentroIguala', { type: 'boolean' }),
      VISIBILIDAD,
      col('avance', { type: 'number' }),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        asunto: 'id',
        owners: ['responsableId'],
        visibility: true,
      },
      sensitive: VISIBLE_SCOPE_FIELDS,
      serverManaged: ['avance'],
      immutable: ['clienteId'],
    },
  ),

  Tareas: table(
    'Tareas',
    [
      CLIENTE,
      ref('asuntoId', 'Asuntos'),
      ENTIDAD,
      col('titulo', { type: 'string', required: true }),
      col('descripcion', { type: 'text' }),
      col('ladoResponsable', { ...e(LADOS_RESPONSABLE), required: true }),
      ref('responsableId', 'Usuarios'),
      col('estado', { ...e(ESTADOS_TAREA), required: true }),
      col('prioridad', e(PRIORIDADES)),
      col('fechaLimite', { type: 'date' }),
      col('esFatal', { type: 'boolean' }),
      ref('dependeDe', 'Tareas'),
      col('checklist', { type: 'json' }),
      VISIBILIDAD,
      col('calendarEventId', { type: 'string' }),
      col('enEsperaDesde', { type: 'datetime' }),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        asunto: 'asuntoId',
        owners: ['responsableId'],
        visibility: true,
        parent: {
          kind: 'fixed',
          table: 'Asuntos',
          column: 'asuntoId',
          mode: 'grouped',
          unit: 'default',
        },
      },
      sensitive: ['fechaLimite', 'esFatal', 'visibilidad'],
      hiddenFromClients: ['calendarEventId'],
      serverManaged: ['calendarEventId'],
      immutable: ['clienteId'],
    },
  ),

  Tramites: table(
    'Tramites',
    [
      CLIENTE,
      ENTIDAD,
      ref('asuntoId', 'Asuntos'),
      ref('plantillaId', 'PlantillasTramite'),
      col('autoridad', { type: 'string' }),
      col('folioExpediente', { type: 'string' }),
      col('etapaActual', { type: 'string' }),
      col('historialEtapas', { type: 'json' }),
      col('fechaPresentacion', { type: 'date' }),
      col('proximaActuacion', { type: 'date' }),
      col('fechaLimite', { type: 'date' }),
      col('estado', { ...e(ESTADOS_TRAMITE), required: true }),
      VISIBILIDAD,
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        asunto: 'asuntoId',
        visibility: true,
        parent: {
          kind: 'fixed',
          table: 'Asuntos',
          column: 'asuntoId',
          mode: 'grouped',
          unit: 'default',
        },
      },
      sensitive: ['fechaLimite', 'visibilidad'],
      immutable: ['clienteId'],
    },
  ),

  PlantillasTramite: table(
    'PlantillasTramite',
    [
      col('nombre', { type: 'string', required: true }),
      col('autoridad', { type: 'string' }),
      col('etapas', { type: 'json' }),
    ],
    { sync: 'pushpull', audience: 'firm' },
  ),

  Obligaciones: table(
    'Obligaciones',
    [
      CLIENTE,
      ENTIDAD,
      col('categoria', { ...e(CATEGORIAS_OBLIGACION), required: true }),
      col('nombre', { type: 'string', required: true }),
      col('fundamento', { type: 'text' }),
      col('autoridad', { type: 'string' }),
      col('recurrencia', { type: 'string' }),
      col('proximoVencimiento', { type: 'date' }),
      col('ladoResponsable', e(LADOS_RESPONSABLE)),
      col('evidenciaRequerida', { type: 'text' }),
      col('riesgo', e(RIESGOS)),
      col('estado', { ...e(ESTADOS_OBLIGACION), required: true }),
      col('recorreSiInhabil', { type: 'boolean' }),
      VISIBILIDAD,
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: { client: 'clienteId', unit: 'entidadId', visibility: true },
      sensitive: ['proximoVencimiento', 'visibilidad'],
      immutable: ['clienteId'],
    },
  ),

  CumplimientosHistorial: table(
    'CumplimientosHistorial',
    [
      ref('obligacionId', 'Obligaciones', true),
      CLIENTE,
      ENTIDAD,
      col('periodo', { type: 'string', required: true }),
      col('fechaCumplimiento', { type: 'date' }),
      ref('evidenciaDocId', 'Documentos'),
      ref('validadoPor', 'Usuarios'),
      col('notas', { type: 'text' }),
      col('estado', { ...e(ESTADOS_CUMPLIMIENTO), required: true }),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        owners: ['createdBy'],
        parent: {
          kind: 'fixed',
          table: 'Obligaciones',
          column: 'obligacionId',
          mode: 'attached',
          unit: 'copy',
        },
      },
      sensitive: ['estado', 'validadoPor', 'fechaCumplimiento'],
      immutable: ['obligacionId', 'clienteId'],
    },
  ),

  CatalogoObligaciones: table(
    'CatalogoObligaciones',
    [
      col('categoria', { ...e(CATEGORIAS_OBLIGACION), required: true }),
      col('nombre', { type: 'string', required: true }),
      col('fundamento', { type: 'text' }),
      col('autoridad', { type: 'string' }),
      col('recurrencia', { type: 'string' }),
      col('evidenciaRequerida', { type: 'text' }),
      col('riesgo', e(RIESGOS)),
    ],
    { sync: 'pushpull', audience: 'firm' },
  ),

  Contratos: table(
    'Contratos',
    [
      CLIENTE,
      ENTIDAD,
      col('contraparte', { type: 'string', required: true }),
      col('tipo', { type: 'string' }),
      col('fechaFirma', { type: 'date' }),
      col('vigenciaHasta', { type: 'date' }),
      col('renovacionAutomatica', { type: 'boolean' }),
      col('diasAvisoPrevio', { type: 'number' }),
      ref('docId', 'Documentos'),
      ref('responsableId', 'Usuarios'),
      VISIBILIDAD,
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        owners: ['responsableId'],
        visibility: true,
      },
      sensitive: VISIBLE_SCOPE_FIELDS,
      immutable: ['clienteId'],
    },
  ),

  Documentos: table(
    'Documentos',
    [
      CLIENTE,
      ENTIDAD,
      col('vinculo', { type: 'json' }),
      col('nombre', { type: 'string', required: true }),
      col('driveFileId', { type: 'string' }),
      col('mimeType', { type: 'string' }),
      col('versionDoc', { type: 'number' }),
      VISIBILIDAD,
      ref('subidoPor', 'Usuarios'),
      col('categoria', { type: 'string' }),
      col('tamanoBytes', { type: 'number' }),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        owners: ['subidoPor'],
        visibility: true,
        parent: {
          kind: 'json',
          column: 'vinculo',
          tables: ATTACHABLE,
          mode: 'attached',
          unit: 'default',
        },
      },
      sensitive: VISIBLE_SCOPE_FIELDS,
      hiddenFromClients: ['driveFileId'],
      serverManaged: ['driveFileId', 'versionDoc'],
      immutable: ['clienteId', 'vinculo', 'subidoPor'],
    },
  ),

  Solicitudes: table(
    'Solicitudes',
    [
      CLIENTE,
      ENTIDAD,
      col('titulo', { type: 'string', required: true }),
      col('descripcion', { type: 'text' }),
      col('urgencia', e(PRIORIDADES)),
      col('area', e(AREAS)),
      col('estado', { ...e(ESTADOS_SOLICITUD), required: true }),
      ref('asuntoIdGenerado', 'Asuntos'),
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: { client: 'clienteId', unit: 'entidadId', owners: ['createdBy'] },
      immutable: ['clienteId'],
    },
  ),

  Comentarios: table(
    'Comentarios',
    [
      col('tipoEntidad', { ...e(COMMENTABLE), required: true }),
      col('entidadId', { type: 'ref', required: true }),
      CLIENTE,
      ref('unidadId', 'Entidades'),
      ref('autorId', 'Usuarios'),
      col('texto', { type: 'text', required: true }),
      col('menciones', { type: 'json' }),
      VISIBILIDAD,
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'unidadId',
        owners: ['autorId'],
        visibility: true,
        parent: {
          kind: 'column',
          tableColumn: 'tipoEntidad',
          column: 'entidadId',
          tables: COMMENTABLE,
          mode: 'attached',
          unit: 'copy',
        },
      },
      sensitive: VISIBLE_SCOPE_FIELDS,
      immutable: ['tipoEntidad', 'entidadId', 'clienteId', 'autorId'],
    },
  ),

  Eventos: table(
    'Eventos',
    [
      CLIENTE,
      ENTIDAD,
      col('origen', { type: 'json' }),
      col('titulo', { type: 'string', required: true }),
      col('inicio', { type: 'datetime', required: true }),
      col('fin', { type: 'datetime' }),
      col('todoElDia', { type: 'boolean' }),
      col('calendarEventId', { type: 'string' }),
      col('syncHash', { type: 'string' }),
      col('tipo', { ...e(TIPOS_EVENTO), required: true }),
      VISIBILIDAD,
    ],
    {
      sync: 'pushpull',
      audience: 'members',
      scope: {
        client: 'clienteId',
        unit: 'entidadId',
        visibility: true,
        parent: {
          kind: 'json',
          column: 'origen',
          tables: SCHEDULABLE,
          mode: 'attached',
          unit: 'default',
        },
      },
      sensitive: VISIBLE_SCOPE_FIELDS,
      hiddenFromClients: ['calendarEventId', 'syncHash'],
      serverManaged: ['calendarEventId', 'syncHash'],
      immutable: ['clienteId', 'origen'],
    },
  ),

  DiasInhabiles: table(
    'DiasInhabiles',
    [
      col('fecha', { type: 'date', required: true }),
      col('descripcion', { type: 'string' }),
      col('ambito', { type: 'string' }),
    ],
    { sync: 'pushpull', audience: 'everyone' },
  ),

  Notificaciones: table(
    'Notificaciones',
    [
      ref('usuarioId', 'Usuarios', true),
      ref('clienteId', 'Clientes'),
      col('tipo', { type: 'string', required: true }),
      col('mensaje', { type: 'text', required: true }),
      col('link', { type: 'string' }),
      col('leida', { type: 'boolean' }),
    ],
    {
      sync: 'pushpull',
      audience: 'everyone',
      // Each user's own; one about a client goes away with access to it.
      scope: { user: 'usuarioId', client: 'clienteId' },
      immutable: ['usuarioId', 'clienteId', 'tipo', 'mensaje', 'link'],
    },
  ),

  Conflictos: table(
    'Conflictos',
    [
      CLIENTE,
      col('entidad', { type: 'string', required: true }),
      col('entidadId', { type: 'ref', required: true }),
      col('campo', { type: 'string', required: true }),
      col('valorVigente', { type: 'text' }),
      col('valorPropuesto', { type: 'text' }),
      ref('propuestoPor', 'Usuarios'),
      col('estado', { ...e(ESTADOS_CONFLICTO), required: true }),
      ref('resueltoPor', 'Usuarios'),
      col('decision', { type: 'text' }),
    ],
    {
      sync: 'pull',
      audience: 'firm',
      scope: { client: 'clienteId' },
      immutable: ['clienteId', 'entidad', 'entidadId', 'campo', 'valorVigente', 'valorPropuesto'],
    },
  ),

  Bitacora: table(
    'Bitacora',
    [
      col('usuarioId', { type: 'string' }),
      col('accion', { type: 'string' }),
      col('entidad', { type: 'string' }),
      col('entidadId', { type: 'string' }),
      col('antes', { type: 'json' }),
      col('despues', { type: 'json' }),
      col('userAgent', { type: 'string' }),
      col('clienteId', { type: 'string' }),
      col('opId', { type: 'string' }),
    ],
    { sync: 'none', audience: 'firm' },
  ),

  Reportes: table(
    'Reportes',
    [
      CLIENTE,
      col('periodo', { type: 'string', required: true }),
      col('docId', { type: 'string' }),
      col('pdfId', { type: 'string' }),
      col('enviadoA', { type: 'json' }),
      col('fecha', { type: 'datetime' }),
    ],
    {
      sync: 'none',
      audience: 'members',
      scope: { client: 'clienteId' },
      immutable: ['clienteId'],
    },
  ),

  OpsAplicadas: table(
    'OpsAplicadas',
    [
      col('opId', { type: 'string', required: true }),
      col('usuarioId', { type: 'string' }),
      col('resultado', { type: 'json' }),
      col('fecha', { type: 'datetime' }),
    ],
    { sync: 'none', audience: 'firm' },
  ),
};

/** Every column of a tab, in sheet order. */
export function allColumns(def: TableDef): ColumnDef[] {
  return [...COMMON_COLUMNS, ...def.columns, ...BOOKKEEPING_COLUMNS];
}

/** A tab's own column, if it has one by that name. */
export function columnOf(def: TableDef, name: string): ColumnDef | undefined {
  return def.columns.find((c) => c.name === name);
}

/**
 * The fields that decide who sees a row. Changing one is a scope change: it
 * is recorded in `alcanceHist` and re-evaluated for the rows hanging from it.
 */
export function scopeFields(def: TableDef): string[] {
  const s = def.scope;
  return [
    ...(s.visibility ? ['visibilidad'] : []),
    ...(s.unit && s.unit !== 'id' ? [s.unit] : []),
    ...(s.asunto && s.asunto !== 'id' ? [s.asunto] : []),
    ...(s.owners ?? []).filter((o) => o !== 'createdBy'),
  ];
}

/** Tabs whose rows can hang from a record of `parent` (for cascades). */
export function childTablesOf(parent: TableName): TableName[] {
  return TABLE_NAMES.filter((name) => {
    const p = TABLES[name].scope.parent;
    if (!p) return false;
    return p.kind === 'fixed' ? p.table === parent : p.tables.includes(parent);
  });
}

/** Tabs edited from the devices through `sync.push`. */
export const PUSHABLE_TABLES = TABLE_NAMES.filter((n) => TABLES[n].sync === 'pushpull');
/** Tabs that reach the devices incrementally. */
export const PULLED_TABLES = TABLE_NAMES.filter(
  (n) => TABLES[n].sync === 'pushpull' || TABLES[n].sync === 'pull',
);
/** Tabs sent whole when they change. */
export const SNAPSHOT_TABLES = TABLE_NAMES.filter((n) => TABLES[n].sync === 'snapshot');

export const isTableName = (name: string): name is TableName =>
  (TABLE_NAMES as readonly string[]).includes(name);
