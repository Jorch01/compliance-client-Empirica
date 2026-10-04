/**
 * What a client's retainer covers (`Clientes.perimetroIguala`): the work
 * included and the work left out, in the firm's words. The firm reads it to
 * classify a request; the client sees it too (PERMISOS.md, note 2).
 *
 *   { "cubiertos": ["Contratos con proveedores", …], "excluidos": ["Litigios", …] }
 */
import type { Value } from './values.ts';

export interface Perimeter {
  cubiertos: string[];
  excluidos: string[];
}

const lines = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : [];

export function parsePerimeter(value: Value | undefined): Perimeter {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { cubiertos: [], excluidos: [] };
  }
  return { cubiertos: lines(value.cubiertos), excluidos: lines(value.excluidos) };
}

/** As stored: null when it says nothing. */
export function perimeterValue(p: Perimeter): Value {
  const cubiertos = lines(p.cubiertos);
  const excluidos = lines(p.excluidos);
  return cubiertos.length || excluidos.length ? { cubiertos, excluidos } : null;
}
