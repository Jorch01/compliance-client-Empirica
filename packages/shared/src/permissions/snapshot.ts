/**
 * The small tabs sent whole: the user directory, memberships and settings.
 * What each user receives depends on the other users' memberships, so they
 * are computed with the whole tabs at hand and sent again when they change.
 *
 * - Firm users see the firm and the users of their clients.
 * - Client users see "their Fractional Legal Team" (the partners and the
 *   lawyers assigned to their client) and their colleagues: all of them from
 *   the hub; from a unit, the hub's users and those of overlapping units.
 *   Of everyone else they get only name, email, side and role.
 * - Memberships: the firm sees those of its clients; a client admin, those of
 *   their company (from a unit, only those inside their units); everyone,
 *   their own.
 * - Settings: the SOCIO_ADMIN all of them; everyone else, the public ones.
 */
import { isFirmRole } from '../domain/enums.ts';
import { TABLES } from '../domain/tables.ts';
import { text, type Row } from '../domain/values.ts';
import { expandUnits, parseAlcance, type UserContext } from './context.ts';

const DIRECTORY_FIELDS = ['id', 'nombre', 'email', 'lado', 'rolBase'] as const;

const live = (rows: readonly Row[]): Row[] => rows.filter((r) => !r.deleted);

function strip(row: Row, fields: readonly string[] | null): Row {
  const drop = new Set(TABLES.Usuarios.serverOnly);
  const out: Row = { id: row.id };
  for (const [key, value] of Object.entries(row)) {
    if (drop.has(key)) continue;
    if (fields && !fields.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

const withoutBookkeeping = (row: Row): Row => {
  const { seqAlta: _s, alcanceHist: _a, ...rest } = row;
  return rest;
};

export interface SnapshotSources {
  usuarios: readonly Row[];
  membresias: readonly Row[];
  entidades: readonly Row[];
  config: readonly Row[];
}

export interface Snapshot {
  Usuarios: Row[];
  Membresias: Row[];
  Config: Row[];
}

export function buildSnapshot(ctx: UserContext, src: SnapshotSources): Snapshot {
  const usuarios = live(src.usuarios);
  const membresias = live(src.membresias);
  const active = membresias.filter((m) => m.estado === 'ACTIVA');
  const isFirm = ctx.lado === 'EMPIRICA';

  const visibleUsers = new Map<string, Row>();
  const add = (u: Row, full: boolean): void => {
    const prev = visibleUsers.has(u.id);
    if (full || !prev) visibleUsers.set(u.id, strip(u, full ? null : DIRECTORY_FIELDS));
  };

  for (const u of usuarios) {
    if (u.id === ctx.userId) {
      add(u, true);
      continue;
    }
    if (ctx.isAdmin) {
      add(u, true);
      continue;
    }
    if (isFirm) {
      const sharesClient = active.some(
        (m) => m.usuarioId === u.id && ctx.clients.has(text(m, 'clienteId') ?? ''),
      );
      if (u.lado === 'EMPIRICA' || sharesClient) add(u, true);
      continue;
    }
    if (u.estado !== 'ACTIVO') continue;
    for (const access of ctx.clients.values()) {
      const k = access.clienteId;
      if (u.lado === 'EMPIRICA') {
        const assigned =
          u.rolBase === 'SOCIO_ADMIN' ||
          active.some((m) => m.usuarioId === u.id && m.clienteId === k);
        if (assigned) add(u, false);
        continue;
      }
      const theirs = active.find((m) => m.usuarioId === u.id && m.clienteId === k);
      if (!theirs) continue;
      if (!access.units) {
        add(u, false);
        continue;
      }
      const alcance = parseAlcance(theirs.alcance);
      if (!alcance) {
        add(u, false);
        continue;
      }
      const theirUnits = expandUnits(
        alcance.entidades,
        src.entidades.filter((e) => e.clienteId === k),
      );
      if ([...theirUnits].some((x) => access.units?.has(x))) add(u, false);
    }
  }

  const visibleMemberships = membresias.filter((m) => {
    if (m.usuarioId === ctx.userId) return true;
    const access = ctx.clients.get(text(m, 'clienteId') ?? '');
    if (!access) return false;
    if (isFirmRole(access.rol)) return true;
    if (access.rol !== 'CLIENTE_ADMIN') return false;
    if (!access.units) return true;
    const alcance = parseAlcance(m.alcance);
    if (!alcance) return false;
    const theirUnits = expandUnits(
      alcance.entidades,
      src.entidades.filter((e) => e.clienteId === access.clienteId),
    );
    return theirUnits.size > 0 && [...theirUnits].every((x) => access.units?.has(x));
  });

  const config = live(src.config).filter((c) => ctx.isAdmin || c.publica === true);

  return {
    Usuarios: [...visibleUsers.values()].map(withoutBookkeeping),
    Membresias: visibleMemberships.map(withoutBookkeeping),
    Config: config.map(withoutBookkeeping),
  };
}
