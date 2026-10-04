/**
 * Online administration (PLAN.md § 7, `admin.*`): users and memberships,
 * only by the SOCIO_ADMIN (PERMISOS.md), plus each user's own profile.
 * A change of role or scope makes every device of that client download it
 * again (`membershipEpoch`).
 */
import {
  CLIENT_ROLES,
  FIRM_ROLES,
  TABLES,
  sameValue,
  type Alcance,
  type Row,
  type Value,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import {
  bumpEpoch,
  changed,
  freshContext,
  membershipOf,
  newRow,
  saveChange,
  underLock,
} from './locked.ts';

const validation = (message: string): ApiError => new ApiError('VALIDATION', message);

/** A user row without what never leaves the server. */
export function publicUser(row: Row): Row {
  const out: Row = { id: row.id };
  for (const [k, v] of Object.entries(row)) {
    if (!TABLES.Usuarios.serverOnly.includes(k)) out[k] = v;
  }
  return out;
}

export function updateUser(
  env: Env,
  session: Session,
  input: {
    usuarioId: string;
    nombre?: string | undefined;
    estado?: 'ACTIVO' | 'INACTIVO' | undefined;
    rolBase?: (typeof FIRM_ROLES)[number] | undefined;
    resetAccount?: boolean | undefined;
  },
): { user: Row } {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    if (!ctx.isAdmin) throw new ApiError('FORBIDDEN');
    const user = r.db.table('Usuarios').get(input.usuarioId);
    if (!user || user.deleted) throw new ApiError('NOT_FOUND');
    const self = user.id === ctx.userId;
    const changes: Record<string, Value> = {};
    if (input.nombre !== undefined) changes.nombre = input.nombre.trim();
    if (input.estado !== undefined) {
      if (self && input.estado !== 'ACTIVO') throw validation('No puedes desactivarte a ti mismo.');
      changes.estado = input.estado;
    }
    if (input.rolBase !== undefined) {
      if (user.lado !== 'EMPIRICA') throw validation('Solo el equipo del despacho tiene rol base.');
      changes.rolBase = input.rolBase;
    }
    if (input.resetAccount) changes.firebaseUid = null;

    // Somebody must always be able to administer the portal.
    const losesAdmin =
      user.rolBase === 'SOCIO_ADMIN' &&
      user.estado === 'ACTIVO' &&
      ((changes.rolBase !== undefined && changes.rolBase !== 'SOCIO_ADMIN') ||
        changes.estado === 'INACTIVO');
    if (losesAdmin) {
      const admins = r.db
        .rows('Usuarios')
        .filter((u) => !u.deleted && u.estado === 'ACTIVO' && u.rolBase === 'SOCIO_ADMIN');
      if (admins.length <= 1)
        throw validation('El portal debe conservar al menos un socio administrador.');
    }

    const saved = saveChange(r, 'Usuarios', user, changed(r, user, changes), null, [
      'nombre',
      'estado',
      'rolBase',
    ]);
    return { user: publicUser(saved) };
  });
}

export function saveMembership(
  env: Env,
  session: Session,
  input: {
    usuarioId: string;
    clienteId: string;
    rol: string;
    alcance?: Alcance | null | undefined;
    puesto?: string | null | undefined;
    estado?: 'ACTIVA' | 'REVOCADA' | undefined;
  },
): { membership: Row } {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    if (!ctx.isAdmin) throw new ApiError('FORBIDDEN');
    const user = r.db.table('Usuarios').get(input.usuarioId);
    const cliente = r.db.table('Clientes').get(input.clienteId);
    if (!user || user.deleted || !cliente || cliente.deleted) throw new ApiError('NOT_FOUND');
    const roles: readonly string[] =
      user.lado === 'EMPIRICA' ? FIRM_ROLES.filter((x) => x !== 'SOCIO_ADMIN') : CLIENT_ROLES;
    if (!roles.includes(input.rol)) throw validation('El rol no corresponde a este usuario.');

    let alcance: Value = null;
    if (user.lado === 'CLIENTE' && input.alcance) {
      for (const [table, ids] of [
        ['Entidades', input.alcance.entidades],
        ['Asuntos', input.alcance.asuntos],
      ] as const) {
        for (const id of ids) {
          const row = r.db.table(table).get(id);
          if (!row || row.deleted || row.clienteId !== input.clienteId) {
            throw validation('El alcance nombra unidades o asuntos que no son de este cliente.');
          }
        }
      }
      alcance = {
        entidades: [...new Set(input.alcance.entidades)],
        asuntos: [...new Set(input.alcance.asuntos)],
      };
    }
    const fields: Record<string, Value> = {
      rol: input.rol,
      alcance,
      puesto: input.puesto?.trim() ? input.puesto.trim() : null,
      estado: input.estado ?? 'ACTIVA',
    };
    const existing = membershipOf(r.db, user.id, input.clienteId);
    const audited = ['rol', 'alcance', 'puesto', 'estado'];
    if (!existing) {
      const created = saveChange(
        r,
        'Membresias',
        undefined,
        newRow(r, { usuarioId: user.id, clienteId: input.clienteId, ...fields }),
        input.clienteId,
        ['usuarioId', 'clienteId', ...audited],
      );
      return { membership: created };
    }
    const next = changed(r, existing, fields);
    const accessChanged =
      existing.estado === 'ACTIVA' &&
      next.estado === 'ACTIVA' &&
      (!sameValue(existing.rol, next.rol) || !sameValue(existing.alcance, next.alcance));
    const saved = saveChange(r, 'Membresias', existing, next, input.clienteId, audited);
    if (accessChanged) bumpEpoch(r, input.clienteId);
    return { membership: saved };
  });
}

/** What anyone may change about themselves. */
export function updateProfile(
  env: Env,
  session: Session,
  input: { nombre?: string | undefined; idioma?: 'es' | 'en' | undefined },
): { user: Row } {
  return underLock(env, session.user.id, (r) => {
    freshContext(r.db, session.user.id);
    const user = r.db.table('Usuarios').get(session.user.id);
    if (!user) throw new ApiError('NOT_FOUND');
    const changes: Record<string, Value> = {};
    if (input.nombre !== undefined) changes.nombre = input.nombre.trim();
    if (input.idioma !== undefined) changes.idioma = input.idioma;
    const saved = saveChange(r, 'Usuarios', user, changed(r, user, changes), null, [
      'nombre',
      'idioma',
    ]);
    return { user: publicUser(saved) };
  });
}
