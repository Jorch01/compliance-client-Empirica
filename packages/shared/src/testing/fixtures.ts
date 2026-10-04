/**
 * A fictitious data set for the tests: two clients, one with business units
 * and branches, and one user per role and scope. Only used by tests; never
 * bundled. Every name is invented ("Cliente Demo, S.A. de C.V.").
 */
import type { Row, Value } from '../domain/values.ts';
import type { TableName } from '../domain/tables.ts';

/** A valid UUID v4 from a small number, readable in test failures. */
export const uid = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const ID = {
  clienteA: uid(0x1a),
  clienteB: uid(0x1b),
  // Units of client A: Norte has a branch; Sur is separate.
  norte: uid(0x2a1),
  norte1: uid(0x2a2),
  sur: uid(0x2a3),
  unidadB: uid(0x2b1),
  // Firm
  socio: uid(0x301),
  abogado: uid(0x302),
  asistente: uid(0x303),
  abogadoB: uid(0x304),
  // Client A
  cAdmin: uid(0x311),
  cColab: uid(0x312),
  cLectura: uid(0x313),
  cAdminSur: uid(0x314),
  cInactivo: uid(0x315),
  // Client B
  cB: uid(0x321),
  // Matters
  asHub: uid(0x401),
  asNorte: uid(0x402),
  asSur: uid(0x403),
  asInterno: uid(0x404),
  asB: uid(0x405),
  // Tasks
  tNorte1: uid(0x501),
  tInterna: uid(0x502),
  tBajoInterno: uid(0x503),
  tSurAsignada: uid(0x504),
  tDespacho: uid(0x505),
  tB: uid(0x506),
  // Others
  cmCompartido: uid(0x601),
  cmInterno: uid(0x602),
  cmEnInterno: uid(0x603),
  cmCliente: uid(0x604),
  obNorte: uid(0x701),
  obInterna: uid(0x702),
  cuNorte: uid(0x711),
  docNorte: uid(0x801),
  solNorte: uid(0x901),
  solSur: uid(0x902),
  notifColab: uid(0xa01),
  notifB: uid(0xa02),
  inhabil: uid(0xb01),
  cfgPublica: uid(0xc01),
  cfgPrivada: uid(0xc02),
  plantilla: uid(0xd01),
  catalogo: uid(0xd02),
  conflictoA: uid(0xe01),
  trNorte: uid(0xf01),
  ctNorte: uid(0xf02),
  evNorte: uid(0xf03),
  // Feedback about the portal
  sugColab: uid(0xf11),
  sugB: uid(0xf12),
} as const;

const T0 = '2026-09-01T10:00:00.000-05:00';

const base = (id: string, fields: Record<string, Value>): Row => ({
  id,
  createdAt: T0,
  createdBy: ID.socio,
  updatedAt: T0,
  updatedBy: ID.socio,
  version: 1,
  deleted: null,
  serverSeq: 1,
  fieldTimestamps: {},
  seqAlta: 1,
  alcanceHist: null,
  ...fields,
});

const user = (
  id: string,
  email: string,
  nombre: string,
  lado: string,
  rolBase: string,
  estado = 'ACTIVO',
) => base(id, { email, nombre, lado, rolBase, estado, idioma: 'es' });

const member = (
  n: number,
  usuarioId: string,
  clienteId: string,
  rol: string,
  alcance: Value = null,
  estado = 'ACTIVA',
) => base(uid(0x3000 + n), { usuarioId, clienteId, rol, alcance, estado });

export type Dataset = Record<TableName, Row[]>;

/** A fresh copy of the data set (tests may mutate it). */
export function demoData(): Dataset {
  const A = ID.clienteA;
  const B = ID.clienteB;
  return {
    Config: [
      base(ID.cfgPublica, { clave: 'inactividadMinutos', valor: '30', publica: true }),
      base(ID.cfgPrivada, { clave: 'notaInterna', valor: 'solo despacho', publica: false }),
    ],
    Clientes: [
      base(A, {
        razonSocial: 'Cliente Demo, S.A. de C.V.',
        nombreComercial: 'Cliente Demo',
        servicio: 'FLT_IGUALA',
        estado: 'ACTIVO',
        abogadoResponsableId: ID.abogado,
        driveFolderId: 'drive-folder-a',
        modoIA: 'METADATA_ONLY',
        membershipEpoch: 1,
      }),
      base(B, {
        razonSocial: 'Cliente Prueba Dos, S.A. de C.V.',
        servicio: 'ASUNTO_PUNTUAL',
        estado: 'ACTIVO',
        abogadoResponsableId: ID.abogadoB,
        membershipEpoch: 1,
      }),
    ],
    Entidades: [
      base(ID.norte, {
        clienteId: A,
        nombre: 'Unidad Norte',
        tipo: 'UNIDAD',
        giro: 'Restaurantes',
      }),
      base(ID.norte1, {
        clienteId: A,
        nombre: 'Sucursal Norte 1',
        tipo: 'SUCURSAL',
        parentId: ID.norte,
      }),
      base(ID.sur, { clienteId: A, nombre: 'Unidad Sur', tipo: 'UNIDAD', giro: 'Educación' }),
      base(ID.unidadB, { clienteId: B, nombre: 'Unidad Única', tipo: 'UNIDAD' }),
    ],
    Usuarios: [
      user(ID.socio, 'socia@despacho.example', 'Socia Demo', 'EMPIRICA', 'SOCIO_ADMIN'),
      user(ID.abogado, 'abogado@despacho.example', 'Abogado Demo', 'EMPIRICA', 'ABOGADO'),
      user(ID.asistente, 'asistente@despacho.example', 'Asistente Demo', 'EMPIRICA', 'ASISTENTE'),
      user(ID.abogadoB, 'abogado.b@despacho.example', 'Abogado B', 'EMPIRICA', 'ABOGADO'),
      user(ID.cAdmin, 'admin@cliente-a.example', 'Admin A', 'CLIENTE', 'CLIENTE_ADMIN'),
      user(
        ID.cColab,
        'norte@cliente-a.example',
        'Encargada Norte',
        'CLIENTE',
        'CLIENTE_COLABORADOR',
      ),
      user(ID.cLectura, 'lectura@cliente-a.example', 'Lectura A', 'CLIENTE', 'CLIENTE_LECTURA'),
      user(ID.cAdminSur, 'sur@cliente-a.example', 'Admin Sur', 'CLIENTE', 'CLIENTE_ADMIN'),
      user(
        ID.cInactivo,
        'baja@cliente-a.example',
        'Baja A',
        'CLIENTE',
        'CLIENTE_COLABORADOR',
        'INACTIVO',
      ),
      user(ID.cB, 'admin@cliente-b.example', 'Admin B', 'CLIENTE', 'CLIENTE_ADMIN'),
    ],
    Membresias: [
      member(1, ID.abogado, A, 'ABOGADO'),
      member(2, ID.asistente, A, 'ASISTENTE'),
      member(3, ID.abogadoB, B, 'ABOGADO'),
      member(4, ID.cAdmin, A, 'CLIENTE_ADMIN'),
      member(5, ID.cColab, A, 'CLIENTE_COLABORADOR', { entidades: [ID.norte], asuntos: [] }),
      member(6, ID.cLectura, A, 'CLIENTE_LECTURA'),
      member(7, ID.cAdminSur, A, 'CLIENTE_ADMIN', { entidades: [ID.sur], asuntos: [] }),
      member(8, ID.cInactivo, A, 'CLIENTE_COLABORADOR'),
      member(9, ID.cB, B, 'CLIENTE_ADMIN'),
    ],
    Invitaciones: [],
    Asuntos: [
      base(ID.asHub, {
        clienteId: A,
        titulo: 'Asamblea anual',
        area: 'CORPORATIVO',
        estado: 'ACTIVO',
        visibilidad: 'COMPARTIDO',
        responsableId: ID.abogado,
      }),
      base(ID.asNorte, {
        clienteId: A,
        entidadId: ID.norte,
        titulo: 'Licencia de funcionamiento',
        area: 'COMPLIANCE',
        estado: 'ACTIVO',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.asSur, {
        clienteId: A,
        entidadId: ID.sur,
        titulo: 'Contrato de arrendamiento',
        area: 'CONTRATOS',
        estado: 'ACTIVO',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.asInterno, {
        clienteId: A,
        entidadId: ID.norte,
        titulo: 'Análisis de contingencia',
        area: 'CONTROVERSIAS',
        estado: 'ACTIVO',
        visibilidad: 'INTERNO',
      }),
      base(ID.asB, {
        clienteId: B,
        titulo: 'Registro de marca',
        area: 'PROPIEDAD_INTELECTUAL',
        estado: 'ACTIVO',
        visibilidad: 'COMPARTIDO',
      }),
    ],
    Tareas: [
      base(ID.tNorte1, {
        clienteId: A,
        asuntoId: ID.asNorte,
        entidadId: ID.norte1,
        titulo: 'Entregar acta constitutiva',
        ladoResponsable: 'CLIENTE',
        estado: 'POR_HACER',
        visibilidad: 'COMPARTIDO',
        fechaLimite: '2026-10-15',
        checklist: [
          { id: 'c1', texto: 'Copia certificada', hecho: false },
          { id: 'c2', texto: 'Poder notarial', hecho: false },
        ],
      }),
      base(ID.tInterna, {
        clienteId: A,
        asuntoId: ID.asNorte,
        entidadId: ID.norte,
        titulo: 'Revisar criterio',
        ladoResponsable: 'EMPIRICA',
        estado: 'EN_CURSO',
        visibilidad: 'INTERNO',
      }),
      base(ID.tBajoInterno, {
        clienteId: A,
        asuntoId: ID.asInterno,
        entidadId: ID.norte,
        titulo: 'Reunir pruebas',
        ladoResponsable: 'CLIENTE',
        estado: 'POR_HACER',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.tSurAsignada, {
        clienteId: A,
        asuntoId: ID.asSur,
        entidadId: ID.sur,
        titulo: 'Firmar contrato',
        ladoResponsable: 'CLIENTE',
        estado: 'POR_HACER',
        visibilidad: 'COMPARTIDO',
        responsableId: ID.cColab,
      }),
      base(ID.tDespacho, {
        clienteId: A,
        asuntoId: ID.asNorte,
        entidadId: ID.norte,
        titulo: 'Presentar trámite',
        ladoResponsable: 'EMPIRICA',
        estado: 'EN_CURSO',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.tB, {
        clienteId: B,
        asuntoId: ID.asB,
        titulo: 'Enviar logotipo',
        ladoResponsable: 'CLIENTE',
        estado: 'POR_HACER',
        visibilidad: 'COMPARTIDO',
      }),
    ],
    Tramites: [
      base(ID.trNorte, {
        clienteId: A,
        entidadId: ID.norte,
        asuntoId: ID.asNorte,
        autoridad: 'Autoridad municipal (ficticia)',
        estado: 'EN_TRAMITE',
        visibilidad: 'COMPARTIDO',
      }),
    ],
    PlantillasTramite: [base(ID.plantilla, { nombre: 'BORRADOR: validar', etapas: [] })],
    Obligaciones: [
      base(ID.obNorte, {
        clienteId: A,
        entidadId: ID.norte,
        categoria: 'LICENCIAS_REGULATORIO',
        nombre: 'BORRADOR: validar',
        estado: 'ACTIVA',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.obInterna, {
        clienteId: A,
        entidadId: ID.norte,
        categoria: 'FISCAL',
        nombre: 'BORRADOR: validar',
        estado: 'ACTIVA',
        visibilidad: 'INTERNO',
      }),
    ],
    CumplimientosHistorial: [
      base(ID.cuNorte, {
        obligacionId: ID.obNorte,
        clienteId: A,
        entidadId: ID.norte,
        periodo: '2026-09',
        estado: 'EN_REVISION',
      }),
    ],
    CatalogoObligaciones: [
      base(ID.catalogo, { categoria: 'CORPORATIVO', nombre: 'BORRADOR: validar' }),
    ],
    Contratos: [
      base(ID.ctNorte, {
        clienteId: A,
        entidadId: ID.norte,
        contraparte: 'Proveedor Ficticio, S.A. de C.V.',
        visibilidad: 'COMPARTIDO',
      }),
    ],
    Documentos: [
      base(ID.docNorte, {
        clienteId: A,
        entidadId: ID.norte,
        nombre: 'acta.pdf',
        visibilidad: 'COMPARTIDO',
        vinculo: { tipo: 'Asuntos', id: ID.asNorte },
        driveFileId: 'drive-file-1',
        subidoPor: ID.abogado,
      }),
    ],
    Solicitudes: [
      base(ID.solNorte, {
        clienteId: A,
        entidadId: ID.norte,
        titulo: 'Revisar contrato de proveedor',
        estado: 'RECIBIDA',
        createdBy: ID.cColab,
      }),
      base(ID.solSur, {
        clienteId: A,
        entidadId: ID.sur,
        titulo: 'Alta patronal',
        estado: 'RECIBIDA',
        createdBy: ID.cAdminSur,
      }),
    ],
    Comentarios: [
      base(ID.cmCompartido, {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asNorte,
        clienteId: A,
        unidadId: ID.norte,
        autorId: ID.abogado,
        texto: 'Ya presentamos la solicitud.',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.cmInterno, {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asNorte,
        clienteId: A,
        unidadId: ID.norte,
        autorId: ID.abogado,
        texto: 'Criterio interno del despacho.',
        visibilidad: 'INTERNO',
      }),
      base(ID.cmEnInterno, {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asInterno,
        clienteId: A,
        unidadId: ID.norte,
        autorId: ID.abogado,
        texto: 'Comentario compartido en asunto interno.',
        visibilidad: 'COMPARTIDO',
      }),
      base(ID.cmCliente, {
        tipoEntidad: 'Asuntos',
        entidadId: ID.asNorte,
        clienteId: A,
        unidadId: ID.norte,
        autorId: ID.cColab,
        texto: 'Mañana enviamos el acta.',
        visibilidad: 'COMPARTIDO',
        createdBy: ID.cColab,
      }),
    ],
    Eventos: [
      base(ID.evNorte, {
        clienteId: A,
        entidadId: ID.norte,
        origen: { tipo: 'Tramites', id: ID.trNorte },
        titulo: 'Visita de verificación',
        inicio: '2026-10-20T10:00:00.000-05:00',
        tipo: 'CITA',
        visibilidad: 'COMPARTIDO',
      }),
    ],
    DiasInhabiles: [base(ID.inhabil, { fecha: '2026-11-16', descripcion: 'BORRADOR: validar' })],
    Notificaciones: [
      base(ID.notifColab, {
        usuarioId: ID.cColab,
        clienteId: A,
        tipo: 'TAREA',
        mensaje: 'Tienes una tarea nueva',
        leida: false,
      }),
      base(ID.notifB, {
        usuarioId: ID.cB,
        clienteId: B,
        tipo: 'TAREA',
        mensaje: 'Tienes una tarea nueva',
        leida: false,
      }),
    ],
    Conflictos: [
      base(ID.conflictoA, {
        clienteId: A,
        entidad: 'Tareas',
        entidadId: ID.tNorte1,
        campo: 'fechaLimite',
        valorVigente: '"2026-10-15"',
        valorPropuesto: '"2026-10-20"',
        estado: 'PENDIENTE',
      }),
    ],
    Sugerencias: [
      base(ID.sugColab, {
        usuarioId: ID.cColab,
        tipo: 'SUGERENCIA',
        mensaje: 'Sería útil ver los pendientes por fecha.',
        pantalla: '#/pendientes',
        clienteContexto: A,
        estado: 'NUEVA',
        createdBy: ID.cColab,
      }),
      base(ID.sugB, {
        usuarioId: ID.cB,
        tipo: 'ERROR',
        mensaje: 'No carga la lista de solicitudes.',
        pantalla: '#/solicitudes',
        clienteContexto: B,
        diagnostico: { version: '0.2.0' },
        estado: 'EN_REVISION',
        respuesta: 'Gracias, ya lo estamos revisando.',
        createdBy: ID.cB,
      }),
    ],
    Bitacora: [],
    Reportes: [],
    OpsAplicadas: [],
  };
}
