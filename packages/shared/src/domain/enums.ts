/**
 * Closed vocabularies of the data model. Values are the ones stored in the
 * sheet (Spanish, as the firm defined them); labels live in the i18n files.
 *
 * Plain `as const` arrays instead of TypeScript enums: they survive type
 * stripping and run unchanged in the browser, in Node and in Apps Script.
 */

export const LADOS = ['EMPIRICA', 'CLIENTE'] as const;
export type Lado = (typeof LADOS)[number];

export const ROLES = [
  'SOCIO_ADMIN',
  'ABOGADO',
  'ASISTENTE',
  'CLIENTE_ADMIN',
  'CLIENTE_COLABORADOR',
  'CLIENTE_LECTURA',
] as const;
export type Rol = (typeof ROLES)[number];

export const FIRM_ROLES = ['SOCIO_ADMIN', 'ABOGADO', 'ASISTENTE'] as const;
export type RolDespacho = (typeof FIRM_ROLES)[number];

export const CLIENT_ROLES = ['CLIENTE_ADMIN', 'CLIENTE_COLABORADOR', 'CLIENTE_LECTURA'] as const;
export type RolCliente = (typeof CLIENT_ROLES)[number];

export const isFirmRole = (rol: Rol): rol is RolDespacho =>
  (FIRM_ROLES as readonly string[]).includes(rol);

export const VISIBILIDADES = ['INTERNO', 'COMPARTIDO'] as const;
export type Visibilidad = (typeof VISIBILIDADES)[number];

export const SERVICIOS = ['FLT_IGUALA', 'ASUNTO_PUNTUAL'] as const;

/** The firm's six practice areas. */
export const AREAS = [
  'CORPORATIVO',
  'CONTRATOS',
  'COMPLIANCE',
  'PROPIEDAD_INTELECTUAL',
  'LABORAL',
  'CONTROVERSIAS',
] as const;

export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const;

export const ESTADOS_CLIENTE = ['ACTIVO', 'INACTIVO'] as const;
export const TIPOS_ENTIDAD = ['SOCIEDAD', 'UNIDAD', 'SUCURSAL'] as const;
export const ESTADOS_USUARIO = ['INVITADO', 'ACTIVO', 'INACTIVO'] as const;
export const ESTADOS_MEMBRESIA = ['PENDIENTE_APROBACION', 'ACTIVA', 'REVOCADA'] as const;
export const ESTADOS_INVITACION = [
  'PENDIENTE_APROBACION',
  'ENVIADA',
  'ACEPTADA',
  'VENCIDA',
  'RECHAZADA',
] as const;

export const ESTADOS_ASUNTO = ['ACTIVO', 'EN_PAUSA', 'CONCLUIDO'] as const;

export const LADOS_RESPONSABLE = ['EMPIRICA', 'CLIENTE', 'AMBOS'] as const;
export const ESTADOS_TAREA = [
  'POR_HACER',
  'EN_CURSO',
  'EN_ESPERA_CLIENTE',
  'EN_REVISION',
  'BLOQUEADA',
  'HECHO',
] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const ESTADOS_TRAMITE = [
  'EN_PREPARACION',
  'EN_TRAMITE',
  'REQUERIMIENTO',
  'CONCLUIDO',
  'CANCELADO',
] as const;

export const CATEGORIAS_OBLIGACION = [
  'CORPORATIVO',
  'FISCAL',
  'LABORAL_SEGURIDAD_SOCIAL',
  'PROPIEDAD_INTELECTUAL',
  'LICENCIAS_REGULATORIO',
  'DATOS_PERSONALES',
  'PLD',
  'OTRO',
] as const;
export const RIESGOS = ['ALTO', 'MEDIO', 'BAJO'] as const;
export const ESTADOS_OBLIGACION = ['ACTIVA', 'INACTIVA'] as const;
export const ESTADOS_CUMPLIMIENTO = ['EN_REVISION', 'VALIDADO', 'RECHAZADO'] as const;

export const ESTADOS_SOLICITUD = [
  'RECIBIDA',
  'EN_ANALISIS',
  'DENTRO_IGUALA',
  'FUERA_IGUALA_COTIZADA',
  'ACEPTADA',
  'RECHAZADA',
  'CONVERTIDA',
] as const;

export const TIPOS_EVENTO = ['VENCIMIENTO', 'AUDIENCIA', 'CITA', 'REUNION'] as const;
export const ESTADOS_CONFLICTO = ['PENDIENTE', 'RESUELTO'] as const;
export const MODOS_IA = ['OFF', 'METADATA_ONLY', 'FULL'] as const;
export type ModoIA = (typeof MODOS_IA)[number];

/** A monthly report: being prepared by the firm, or sent to the client (F6). */
export const ESTADOS_REPORTE = ['BORRADOR', 'ENVIADO'] as const;

/** What someone tells the firm about the portal itself. */
export const TIPOS_SUGERENCIA = ['SUGERENCIA', 'ERROR'] as const;
export const ESTADOS_SUGERENCIA = ['NUEVA', 'EN_REVISION', 'RESUELTA', 'DESCARTADA'] as const;

/**
 * Billing (Cobranza, F9): the firm's fees and what each client owes. Only
 * the firm sees it, and only who the partners authorize (D80).
 */
export const MONEDAS = ['MXN', 'USD'] as const;
export type Moneda = (typeof MONEDAS)[number];

/** A recurring fee (an iguala): charged every period while active. */
export const ESTADOS_HONORARIO = ['ACTIVO', 'PAUSADO', 'TERMINADO'] as const;

/** A charge stands until it is cancelled; paid or overdue come from its payments. */
export const ESTADOS_COBRO = ['VIGENTE', 'CANCELADO'] as const;

export const METODOS_PAGO = ['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'TARJETA', 'OTRO'] as const;

/** What comes out of a charge before (or after) it is split. */
export const TIPOS_GASTO = ['COMISION', 'GASTO', 'IMPUESTO', 'OTRO'] as const;

/** Who takes part in the split: a person, the firm's own fund, or someone outside. */
export const TIPOS_PARTICIPANTE = ['PERSONA', 'DESPACHO', 'EXTERNO'] as const;

/** How often a billing reminder comes back. */
export const REPETICIONES = [
  'NO',
  'SEMANAL',
  'QUINCENAL',
  'MENSUAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
] as const;
export type Repeticion = (typeof REPETICIONES)[number];
