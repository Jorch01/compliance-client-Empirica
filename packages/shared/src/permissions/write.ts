/**
 * Whether a user may make a change, checked on the server for every queued
 * operation (a user may have lost access while offline) and in the browser
 * to decide which buttons to show.
 *
 * The answer for a record the user cannot see is always NOT_FOUND, never
 * FORBIDDEN, so a guessed id does not confirm that the record exists.
 */
import type { Rol } from '../domain/enums.ts';
import { TABLES, columnOf, type TableDef, type TableName } from '../domain/tables.ts';
import { missingRequired } from '../domain/validate.ts';
import { isEmpty, sameValue, text, type Row, type Value } from '../domain/values.ts';
import type { UserContext } from './context.ts';
import {
  CLIENT_TASK_STATES,
  FORCED_ON_CREATE,
  OWNER_COLUMN,
  POLICIES,
  SELF,
  type TablePolicy,
} from './policies.ts';
import { canRead, clientIdOf, parentOf, unitOf, type Lookup } from './read.ts';

export type OpType = 'create' | 'update' | 'delete' | 'restore';

export type DenialReason =
  | 'READ_ONLY_TABLE'
  | 'NOT_FOUND'
  | 'ID_TAKEN'
  | 'ROLE'
  | 'NOT_OWNER'
  | 'FIELD_NOT_ALLOWED'
  | 'FORCED_VALUE'
  | 'SERVER_MANAGED'
  | 'IMMUTABLE'
  | 'REQUIRED'
  | 'OUT_OF_SCOPE'
  | 'TASK_NOT_CLIENT_SIDE'
  | 'TASK_CLOSED'
  | 'TASK_STATE'
  | 'CHECKLIST_EDIT'
  | 'INVALID_PARENT'
  | 'USER_NOT_IN_CLIENT'
  | 'CYCLE';

export interface Denial {
  ok: false;
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION';
  reason: DenialReason;
  field?: string;
}

export interface Approval {
  ok: true;
  /** The fields to apply: no-ops dropped, forced and derived values filled in. */
  fields: Record<string, Value>;
  clienteId: string | null;
  rol: Rol;
}

export interface WriteLookup extends Lookup {
  /** Whether a user exists, is not deactivated, and has access to the client. */
  userCanAccess(userId: string, clienteId: string | null): boolean;
}

export interface WriteInput {
  table: TableName;
  type: OpType;
  id: string;
  /** The record as stored, if it exists (it may be deleted). */
  current: Row | undefined;
  /** The fields of a create or update, already through validateFields. */
  fields: Readonly<Record<string, Value>>;
}

const deny = (code: Denial['code'], reason: DenialReason, field?: string): Denial =>
  field ? { ok: false, code, reason, field } : { ok: false, code, reason };

/**
 * The role that applies: per client for a client's records, the base role
 * otherwise (and for a personal record, such as a notification, that names
 * no client).
 */
export function roleFor(ctx: UserContext, def: TableDef, clienteId: string | null): Rol | null {
  if (!def.scope.client) return ctx.rolBase;
  if (clienteId) return ctx.clients.get(clienteId)?.rol ?? null;
  return def.audience === 'everyone' ? ctx.rolBase : null;
}

const isOwner = (ctx: UserContext, table: TableName, row: Row): boolean => {
  const column = OWNER_COLUMN[table];
  return column !== undefined && row[column] === ctx.userId;
};

/** The fields whose value would actually change. */
export function changedFields(
  current: Readonly<Record<string, Value>>,
  fields: Readonly<Record<string, Value>>,
): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!sameValue(current[key], value)) out[key] = value;
  }
  return out;
}

export function authorizeWrite(
  ctx: UserContext,
  input: WriteInput,
  lookup: WriteLookup,
): Approval | Denial {
  const def = TABLES[input.table];
  if (def.sync !== 'pushpull') return deny('FORBIDDEN', 'READ_ONLY_TABLE');
  if (input.type === 'create') return authorizeCreate(ctx, def, input, lookup);

  const current = input.current;
  if (!current) return deny('NOT_FOUND', 'NOT_FOUND');
  const clienteId = clientIdOf(def, current);
  const rol = roleFor(ctx, def, clienteId);
  if (!rol || !canRead(ctx, def.name, current, lookup)) return deny('NOT_FOUND', 'NOT_FOUND');
  const policy = POLICIES[def.name][rol];

  if (input.type === 'delete' || input.type === 'restore') {
    if (policy.delete === false) return deny('FORBIDDEN', 'ROLE');
    if (policy.delete === 'own' && !isOwner(ctx, def.name, current)) {
      return deny('FORBIDDEN', 'NOT_OWNER');
    }
    return { ok: true, fields: {}, clienteId, rol };
  }

  const changes = changedFields(current, input.fields);
  const denial = checkUpdate(ctx, def, policy, current, changes, clienteId, lookup);
  return denial ?? { ok: true, fields: changes, clienteId, rol };
}

function checkUpdate(
  ctx: UserContext,
  def: TableDef,
  policy: TablePolicy,
  current: Row,
  changes: Record<string, Value>,
  clienteId: string | null,
  lookup: WriteLookup,
): Denial | null {
  const grant = policy.update;
  if (grant === false) return deny('FORBIDDEN', 'ROLE');
  const ownOnly = grant === 'own' || (typeof grant === 'object' && grant.own === true);
  if (ownOnly && !isOwner(ctx, def.name, current)) return deny('FORBIDDEN', 'NOT_OWNER');

  for (const field of Object.keys(changes)) {
    if (def.immutable.includes(field)) return deny('VALIDATION', 'IMMUTABLE', field);
    if (def.serverManaged.includes(field)) return deny('FORBIDDEN', 'SERVER_MANAGED', field);
    if (typeof grant === 'object' && !grant.fields.includes(field)) {
      return deny('FORBIDDEN', 'FIELD_NOT_ALLOWED', field);
    }
  }
  if (typeof grant === 'object' && grant.rule === 'clientTask') {
    const denial = clientTaskRule(current, changes);
    if (denial) return denial;
  }
  return checkRefs(ctx, def, { ...current, ...changes }, Object.keys(changes), clienteId, lookup);
}

function authorizeCreate(
  ctx: UserContext,
  def: TableDef,
  input: WriteInput,
  lookup: WriteLookup,
): Approval | Denial {
  if (input.current) return deny('VALIDATION', 'ID_TAKEN');
  if (def.scope.client === 'id') {
    // A new client: only the SOCIO_ADMIN opens one.
    if (!ctx.isAdmin) return deny('FORBIDDEN', 'ROLE');
    const missing = missingRequired(def, input.fields);
    if (missing.length) return deny('VALIDATION', 'REQUIRED', missing[0]);
    for (const field of def.serverManaged) {
      if (!isEmpty(input.fields[field])) return deny('FORBIDDEN', 'SERVER_MANAGED', field);
    }
    const refDenial = checkRefs(
      ctx,
      def,
      { ...input.fields, id: input.id },
      Object.keys(input.fields),
      input.id,
      lookup,
    );
    return (
      refDenial ?? {
        ok: true,
        fields: { ...input.fields },
        clienteId: input.id,
        rol: 'SOCIO_ADMIN',
      }
    );
  }
  const fields: Record<string, Value> = { ...input.fields };
  let unitFromParent = false;

  const p = def.scope.parent;
  if (p) {
    const raw =
      p.kind === 'column' ? (fields[p.column] ?? fields[p.tableColumn]) : fields[p.column];
    const ref = parentOf(def, fields);
    if (!isEmpty(raw) && !ref) return deny('VALIDATION', 'INVALID_PARENT', p.column);
    if (ref) {
      const parent = lookup.get(ref.table, ref.id);
      if (!parent || !canRead(ctx, ref.table, parent, lookup)) {
        return deny('NOT_FOUND', 'NOT_FOUND', p.column);
      }
      const parentDef = TABLES[ref.table];
      const parentClient = clientIdOf(parentDef, parent);
      if (def.scope.client) {
        const given = text(fields, def.scope.client);
        if (given && given !== parentClient)
          return deny('NOT_FOUND', 'NOT_FOUND', def.scope.client);
        fields[def.scope.client] = parentClient;
      }
      const unitColumn = def.scope.unit;
      if (unitColumn && unitColumn !== 'id' && p.unit) {
        if (p.unit === 'copy' || isEmpty(fields[unitColumn])) {
          fields[unitColumn] = unitOf(parentDef, parent);
          unitFromParent = true;
        }
      }
    }
  }

  const clienteId = def.scope.client ? text(fields, def.scope.client) : null;
  if (def.scope.client && !clienteId) return deny('VALIDATION', 'REQUIRED', def.scope.client);
  const rol = roleFor(ctx, def, clienteId);
  if (!rol) return deny('NOT_FOUND', 'NOT_FOUND', def.scope.client);
  const policy = POLICIES[def.name][rol];
  if (policy.create === false) return deny('FORBIDDEN', 'ROLE');
  const rule = typeof policy.create === 'object' ? policy.create : {};

  const forced = { ...FORCED_ON_CREATE[def.name], ...rule.forced };
  for (const [field, raw] of Object.entries(forced)) {
    const value = raw === SELF ? ctx.userId : raw;
    if (!isEmpty(fields[field]) && !sameValue(fields[field], value)) {
      return deny('FORBIDDEN', 'FORCED_VALUE', field);
    }
    fields[field] = value;
  }
  for (const field of rule.blank ?? []) {
    if (!isEmpty(fields[field])) return deny('FORBIDDEN', 'FIELD_NOT_ALLOWED', field);
  }
  for (const field of def.serverManaged) {
    if (!isEmpty(fields[field])) return deny('FORBIDDEN', 'SERVER_MANAGED', field);
  }
  const missing = missingRequired(def, fields);
  if (missing.length) return deny('VALIDATION', 'REQUIRED', missing[0]);

  const row: Row = { ...fields, id: input.id, createdBy: ctx.userId };
  const refDenial = checkRefs(ctx, def, row, Object.keys(fields), clienteId, lookup);
  if (refDenial) return refDenial;

  if (!canRead(ctx, def.name, row, lookup)) return deny('FORBIDDEN', 'OUT_OF_SCOPE');
  const access = clienteId ? ctx.clients.get(clienteId) : undefined;
  const unitColumn = def.scope.unit;
  if (access?.units && unitColumn && unitColumn !== 'id' && !unitFromParent) {
    const unit = text(fields, unitColumn);
    if (!unit || !access.units.has(unit)) return deny('FORBIDDEN', 'OUT_OF_SCOPE', unitColumn);
  }
  return { ok: true, fields, clienteId, rol };
}

/** References must point to live records of the same client the user can see. */
function checkRefs(
  ctx: UserContext,
  def: TableDef,
  row: Row,
  names: readonly string[],
  clienteId: string | null,
  lookup: WriteLookup,
): Denial | null {
  for (const name of names) {
    const column = columnOf(def, name);
    if (column?.type !== 'ref' || !column.ref || name === def.scope.client) continue;
    const value = text(row, name);
    if (!value) continue;
    if (column.ref === 'Usuarios') {
      if (!lookup.userCanAccess(value, clienteId)) {
        return deny('VALIDATION', 'USER_NOT_IN_CLIENT', name);
      }
      continue;
    }
    if (column.ref === def.name && value === row.id) return deny('VALIDATION', 'CYCLE', name);
    const targetDef = TABLES[column.ref];
    const target = lookup.get(column.ref, value);
    if (!target) return deny('NOT_FOUND', 'NOT_FOUND', name);
    if (targetDef.scope.client) {
      if (clientIdOf(targetDef, target) !== clienteId) return deny('NOT_FOUND', 'NOT_FOUND', name);
      if (!canRead(ctx, column.ref, target, lookup)) return deny('NOT_FOUND', 'NOT_FOUND', name);
    }
  }
  if (def.name === 'Entidades' && names.includes('parentId')) {
    const seen = new Set<string>();
    let cursor = text(row, 'parentId');
    while (cursor && !seen.has(cursor)) {
      if (cursor === row.id) return deny('VALIDATION', 'CYCLE', 'parentId');
      seen.add(cursor);
      const next = lookup.get('Entidades', cursor);
      cursor = next ? text(next, 'parentId') : null;
    }
  }
  return null;
}

/** Note 6 of the matrix and decision D18. */
function clientTaskRule(current: Row, changes: Record<string, Value>): Denial | null {
  if (current.ladoResponsable !== 'CLIENTE' && current.ladoResponsable !== 'AMBOS') {
    return deny('FORBIDDEN', 'TASK_NOT_CLIENT_SIDE');
  }
  if (current.estado === 'HECHO') return deny('FORBIDDEN', 'TASK_CLOSED');
  if (
    'estado' in changes &&
    !(CLIENT_TASK_STATES as readonly Value[]).includes(changes.estado ?? null)
  ) {
    return deny('FORBIDDEN', 'TASK_STATE', 'estado');
  }
  if (
    'checklist' in changes &&
    !onlyToggled(current.checklist ?? null, changes.checklist ?? null)
  ) {
    return deny('FORBIDDEN', 'CHECKLIST_EDIT', 'checklist');
  }
  return null;
}

const isRecord = (v: Value): v is Record<string, Value> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A checklist where only the `hecho` marks changed: same items, same text, same order. */
export function onlyToggled(before: Value, after: Value): boolean {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
    return false;
  }
  return before.every((b, i) => {
    const a = after[i];
    if (a === undefined || !isRecord(a) || !isRecord(b) || typeof a.hecho !== 'boolean') {
      return false;
    }
    const { hecho: _x, ...restBefore } = b;
    const { hecho: _y, ...restAfter } = a;
    return sameValue(restBefore, restAfter);
  });
}
