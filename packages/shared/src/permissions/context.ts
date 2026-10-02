/**
 * Who is asking: the user, their side and, per client, their role and scope.
 * The server builds it on every request from the Usuarios, Membresias,
 * Entidades and Clientes tabs; nothing here comes from the request itself.
 */
import { CLIENT_ROLES, type Lado, type Rol } from '../domain/enums.ts';
import { text, type Row, type Value } from '../domain/values.ts';

/**
 * A client membership's scope (decision D13): business units, which include
 * their branches, and individual matters. No scope means the whole client.
 */
export interface Alcance {
  entidades: string[];
  asuntos: string[];
}

export interface ClientAccess {
  clienteId: string;
  rol: Rol;
  /** null: the hub, the whole client. */
  alcance: Alcance | null;
  /** The units in scope including all their descendants (null for the hub). */
  units: ReadonlySet<string> | null;
}

export interface UserContext {
  userId: string;
  email: string;
  lado: Lado;
  rolBase: Rol;
  isAdmin: boolean;
  clients: ReadonlyMap<string, ClientAccess>;
}

const CLIENT_ROLE_RANK: Record<string, number> = {
  CLIENTE_LECTURA: 0,
  CLIENTE_COLABORADOR: 1,
  CLIENTE_ADMIN: 2,
};

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : [];

/**
 * Reads a membership's `alcance`. Empty means the hub. Anything malformed
 * means "nothing": a scope we cannot read must never widen access.
 */
export function parseAlcance(value: Value | undefined): Alcance | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) return { entidades: [], asuntos: [] };
  return { entidades: stringList(value.entidades), asuntos: stringList(value.asuntos) };
}

/** The given units plus all their descendants, following `parentId`. */
export function expandUnits(roots: readonly string[], entidades: readonly Row[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const e of entidades) {
    const parent = text(e, 'parentId');
    if (parent) children.set(parent, [...(children.get(parent) ?? []), e.id]);
  }
  const known = new Set(entidades.map((e) => e.id));
  const out = new Set<string>();
  const queue = roots.filter((r) => known.has(r));
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}

export interface ContextSources {
  user: Row;
  membresias: readonly Row[];
  entidades: readonly Row[];
  clientes: readonly Row[];
}

/**
 * Builds the context of an active user. Memberships that do not match the
 * user's side are ignored (a client user never gets a firm role, and the
 * other way round); if a user has two active memberships in the same client,
 * the narrower one wins.
 */
export function buildUserContext({
  user,
  membresias,
  entidades,
  clientes,
}: ContextSources): UserContext {
  const lado = user.lado === 'EMPIRICA' ? 'EMPIRICA' : 'CLIENTE';
  const rolBase = (text(user, 'rolBase') ?? 'CLIENTE_LECTURA') as Rol;
  const isAdmin = lado === 'EMPIRICA' && rolBase === 'SOCIO_ADMIN';
  const liveClients = new Set(clientes.filter((c) => !c.deleted).map((c) => c.id));
  const clients = new Map<string, ClientAccess>();

  if (isAdmin) {
    for (const id of liveClients) {
      clients.set(id, { clienteId: id, rol: 'SOCIO_ADMIN', alcance: null, units: null });
    }
  } else {
    for (const m of membresias) {
      if (m.usuarioId !== user.id || m.estado !== 'ACTIVA' || m.deleted) continue;
      const clienteId = text(m, 'clienteId');
      if (!clienteId || !liveClients.has(clienteId)) continue;

      if (lado === 'EMPIRICA') {
        if (rolBase !== 'ABOGADO' && rolBase !== 'ASISTENTE') continue;
        clients.set(clienteId, { clienteId, rol: rolBase, alcance: null, units: null });
        continue;
      }

      const rol = text(m, 'rol') as Rol | null;
      if (!rol || !(CLIENT_ROLES as readonly string[]).includes(rol)) continue;
      const alcance = parseAlcance(m.alcance);
      const units = alcance
        ? expandUnits(
            alcance.entidades,
            entidades.filter((e) => e.clienteId === clienteId),
          )
        : null;
      const access: ClientAccess = { clienteId, rol, alcance, units };
      const previous = clients.get(clienteId);
      clients.set(clienteId, previous ? narrower(previous, access) : access);
    }
  }

  return {
    userId: user.id,
    email: text(user, 'email') ?? '',
    lado,
    rolBase,
    isAdmin,
    clients,
  };
}

function narrower(a: ClientAccess, b: ClientAccess): ClientAccess {
  const rol = (CLIENT_ROLE_RANK[a.rol] ?? 0) <= (CLIENT_ROLE_RANK[b.rol] ?? 0) ? a.rol : b.rol;
  if (!a.alcance) return { ...b, rol };
  if (!b.alcance) return { ...a, rol };
  const units = new Set([...(a.units ?? [])].filter((u) => b.units?.has(u)));
  const asuntos = a.alcance.asuntos.filter((x) => b.alcance?.asuntos.includes(x));
  return {
    clienteId: a.clienteId,
    rol,
    alcance: { entidades: [...units], asuntos },
    units,
  };
}

export const isFirmSide = (ctx: UserContext): boolean => ctx.lado === 'EMPIRICA';

/**
 * Whether a user is not deactivated and has access to a client (to be named
 * responsible for, or assigned to, one of its records).
 */
export function userHasClientAccess(
  usuarios: readonly Row[],
  membresias: readonly Row[],
  userId: string,
  clienteId: string | null,
): boolean {
  const user = usuarios.find((u) => u.id === userId && !u.deleted);
  if (!user || user.estado === 'INACTIVO') return false;
  if (clienteId === null) return true;
  if (user.lado === 'EMPIRICA' && user.rolBase === 'SOCIO_ADMIN') return true;
  return membresias.some(
    (m) =>
      m.usuarioId === userId && m.clienteId === clienteId && m.estado === 'ACTIVA' && !m.deleted,
  );
}
