/**
 * What the screens show: one client or all of them (firm), and within a
 * client, every unit or one unit with its branches. The device holds only
 * what the user may see; this narrows it further to what they chose.
 */
import { TABLES, expandUnits, text, unitOf, type Row, type TableName } from '@empirica/shared';

export interface Scope {
  /** null: every client (firm only). */
  clientId: string | null;
  /** null: the whole client (or every unit the user may see). */
  unitId: string | null;
}

export const ALL: Scope = { clientId: null, unitId: null };

/** The selected unit and every unit below it, or null when no unit is selected. */
export function unitsUnder(unitId: string | null, entidades: readonly Row[]): Set<string> | null {
  return unitId ? expandUnits([unitId], entidades) : null;
}

/** Whether a record belongs to the chosen client and unit. */
export function inScope(
  table: TableName,
  row: Row,
  scope: Scope,
  units: ReadonlySet<string> | null,
): boolean {
  const def = TABLES[table];
  if (scope.clientId && def.scope.client) {
    const client = def.scope.client === 'id' ? row.id : text(row, def.scope.client);
    if (client !== scope.clientId) return false;
  }
  if (units && def.scope.unit) {
    const unit = unitOf(def, row);
    if (!unit || !units.has(unit)) return false;
  }
  return true;
}

export interface UnitNode {
  row: Row;
  depth: number;
}

/** Units of a client as an indented list: each unit followed by its branches, by name. */
export function unitTree(entidades: readonly Row[]): UnitNode[] {
  const ids = new Set(entidades.map((e) => e.id));
  const children = new Map<string | null, Row[]>();
  for (const e of entidades) {
    const parent = text(e, 'parentId');
    // A unit whose parent the user cannot see starts its own branch.
    const key = parent && ids.has(parent) ? parent : null;
    children.set(key, [...(children.get(key) ?? []), e]);
  }
  const byName = (a: Row, b: Row): number =>
    (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es');
  const out: UnitNode[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number): void => {
    for (const row of [...(children.get(parent) ?? [])].sort(byName)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The top of a unit's branch (for a branch, its unit). */
export function rootUnit(unitId: string, entidades: readonly Row[]): string {
  const byId = new Map(entidades.map((e) => [e.id, e]));
  let current = unitId;
  const seen = new Set<string>();
  for (;;) {
    seen.add(current);
    const parent = text(byId.get(current) ?? { id: '' }, 'parentId');
    if (!parent || !byId.has(parent) || seen.has(parent)) return current;
    current = parent;
  }
}
