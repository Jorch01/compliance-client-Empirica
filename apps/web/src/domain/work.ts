/**
 * Matters and tasks as the screens use them: checklists, who a record can
 * be assigned to, where a client may move a task, and what a deleted matter
 * takes along.
 */
import {
  text,
  userHasClientAccess,
  type EstadoTarea,
  type Row,
  type Value,
} from '@empirica/shared';

export interface ChecklistItem {
  id: string;
  texto: string;
  hecho: boolean;
}

/** A task's checklist as stored (JSON), read defensively. */
export function checklistOf(value: Value | undefined): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? [
          {
            id: typeof item.id === 'string' ? item.id : '',
            texto: typeof item.texto === 'string' ? item.texto : '',
            hecho: item.hecho === true,
          },
        ]
      : [],
  );
}

/**
 * The checklist with one mark flipped and nothing else changed: same items,
 * same text, same order. What a client may do (the server checks it).
 */
export function toggledChecklist(stored: Value | undefined, index: number): Value {
  const original = Array.isArray(stored) ? stored : [];
  return original.map((raw, i) =>
    i === index && raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...raw, hecho: raw.hecho !== true }
      : raw,
  );
}

/** Where a client may take a task of their side (decision D18: the firm closes it). */
export const CLIENT_NEXT: Partial<Record<EstadoTarea, readonly EstadoTarea[]>> = {
  POR_HACER: ['EN_CURSO', 'EN_REVISION', 'BLOQUEADA'],
  EN_ESPERA_CLIENTE: ['EN_CURSO', 'EN_REVISION', 'BLOQUEADA'],
  EN_CURSO: ['EN_REVISION', 'BLOQUEADA'],
  BLOQUEADA: ['EN_CURSO', 'EN_REVISION'],
};

/** A task of the client's side (or both): the client moves it along. */
export const clientSide = (task: Row): boolean =>
  task.ladoResponsable === 'CLIENTE' || task.ladoResponsable === 'AMBOS';

/**
 * The fields to save when a task changes state: waiting on the client
 * starts the count of days (`enEsperaDesde`).
 */
export function stateChange(task: Row, next: EstadoTarea, nowIso: string): Record<string, Value> {
  return next === 'EN_ESPERA_CLIENTE' && task.estado !== 'EN_ESPERA_CLIENTE'
    ? { estado: next, enEsperaDesde: nowIso }
    : { estado: next };
}

export type Side = 'EMPIRICA' | 'CLIENTE' | 'AMBOS';

/**
 * People a record of a client can be assigned to: active users with access
 * to that client, of the side the task belongs to. The same rule the server
 * applies (USER_NOT_IN_CLIENT), from the local directory.
 */
export function assignable(
  usuarios: readonly Row[],
  membresias: readonly Row[],
  clientId: string,
  side: Side,
): Row[] {
  return usuarios
    .filter(
      (u) =>
        !u.deleted &&
        u.estado !== 'INACTIVO' &&
        (side === 'AMBOS' || u.lado === side) &&
        userHasClientAccess(usuarios, membresias, u.id, clientId),
    )
    .sort((a, b) => (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es'));
}

/** Ids of deleted matters: their tasks, comments and documents go out of sight with them. */
export function deletedMatterIds(asuntos: readonly Row[]): Set<string> {
  return new Set(asuntos.filter((a) => a.deleted).map((a) => a.id));
}

/** "2026-10-04": the date part of a stored date or instant. */
export const dayOf = (value: Value | undefined): string =>
  typeof value === 'string' ? value.slice(0, 10) : '';

/** What a document's link (`vinculo`) says: the table and the record it belongs to. */
export function linkOf(doc: Row): { tipo: string; id: string } | null {
  const v = doc.vinculo;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return typeof v.tipo === 'string' && typeof v.id === 'string' ? { tipo: v.tipo, id: v.id } : null;
}
