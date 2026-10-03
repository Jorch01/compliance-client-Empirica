/**
 * The data model is consistent with itself: every column named in a rule
 * exists, every reference points to a real tab, and every tab has a policy.
 */
import { describe, expect, it } from 'vitest';
import { ROLES } from './enums.ts';
import { POLICIES } from '../permissions/policies.ts';
import {
  PUSHABLE_TABLES,
  SNAPSHOT_TABLES,
  SYSTEM_COLUMNS,
  TABLES,
  TABLE_NAMES,
  allColumns,
  childTablesOf,
  scopeFields,
  type TableDef,
} from './tables.ts';

const names = (def: TableDef) => new Set(allColumns(def).map((c) => c.name));

describe.each(TABLE_NAMES.map((n) => [n, TABLES[n]] as const))('%s', (name, def) => {
  it('is registered under its own name', () => {
    expect(def.name).toBe(name);
  });

  it('has no duplicate columns and does not redefine the system ones', () => {
    const own = def.columns.map((c) => c.name);
    expect(new Set(own).size).toBe(own.length);
    expect(own.filter((c) => SYSTEM_COLUMNS.has(c))).toEqual([]);
  });

  it('names only existing columns in its rules', () => {
    const cols = names(def);
    const s = def.scope;
    const named = [
      ...def.sensitive,
      ...def.hiddenFromClients,
      ...def.serverOnly,
      ...def.serverManaged,
      ...def.immutable,
      ...scopeFields(def),
      ...(s.client && s.client !== 'id' ? [s.client] : []),
      ...(s.unit && s.unit !== 'id' ? [s.unit] : []),
      ...(s.user ? [s.user] : []),
      ...(s.owners ?? []),
    ];
    if (s.parent) {
      named.push(s.parent.column);
      if (s.parent.kind === 'column') named.push(s.parent.tableColumn);
    }
    expect(named.filter((c) => !cols.has(c))).toEqual([]);
  });

  it('references point to existing tabs', () => {
    for (const c of def.columns) {
      if (c.ref) expect(TABLE_NAMES).toContain(c.ref);
      if (c.type === 'enum') expect(c.values?.length).toBeGreaterThan(0);
    }
  });

  it('has a policy for every role', () => {
    for (const rol of ROLES) expect(POLICIES[name][rol]).toBeDefined();
  });

  it('keeps per-client data tied to its client', () => {
    if (def.audience === 'members' && def.sync !== 'snapshot' && name !== 'Clientes') {
      expect(def.scope.client).toBe('clienteId');
      expect(def.immutable).toContain('clienteId');
    }
  });
});

describe('the model as a whole', () => {
  it('never lets a device edit a snapshot tab', () => {
    expect(SNAPSHOT_TABLES.filter((t) => PUSHABLE_TABLES.includes(t))).toEqual([]);
  });

  it('records attached to others list the tabs they may hang from', () => {
    expect(childTablesOf('Asuntos').sort()).toEqual(
      ['Comentarios', 'Documentos', 'Eventos', 'Tareas', 'Tramites'].sort(),
    );
    expect(childTablesOf('Obligaciones')).toContain('CumplimientosHistorial');
  });

  it('every legally sensitive field of the plan is protected', () => {
    expect(TABLES.Tareas.sensitive).toEqual(
      expect.arrayContaining(['fechaLimite', 'esFatal', 'visibilidad']),
    );
    expect(TABLES.Tramites.sensitive).toContain('fechaLimite');
    expect(TABLES.CumplimientosHistorial.sensitive).toEqual(
      expect.arrayContaining(['validadoPor', 'fechaCumplimiento']),
    );
    for (const name of TABLE_NAMES) {
      if (TABLES[name].scope.visibility) expect(TABLES[name].sensitive).toContain('visibilidad');
    }
  });

  it('never sends a secret-like column to any device', () => {
    expect(TABLES.Usuarios.serverOnly).toEqual(expect.arrayContaining(['icsToken', 'firebaseUid']));
    expect(TABLES.Invitaciones.serverOnly).toContain('tokenHash');
    expect(TABLES.Invitaciones.sync).toBe('none');
  });
});
