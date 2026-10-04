/**
 * What the filing screens share: the tone of each state, the firm's
 * templates with their stages, and the traffic light of a filing.
 */
import { useMemo } from 'react';
import {
  ESTADOS_TRAMITE,
  filingDate,
  parseStages,
  type EstadoTramite,
  type Row,
  type Stage,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { urgencyOf, type Semaforo } from '../../domain/deadlines.ts';
import { oneOf } from '../../i18n/labels.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';

export const FILING_TONE: Record<EstadoTramite, Tone> = {
  EN_PREPARACION: 'neutral',
  EN_TRAMITE: 'info',
  REQUERIMIENTO: 'warning',
  CONCLUIDO: 'success',
  CANCELADO: 'neutral',
};

export const filingState = (row: Row): EstadoTramite | null =>
  oneOf(ESTADOS_TRAMITE, row.estado) ? row.estado : null;

export interface Template {
  row: Row;
  stages: Stage[];
}

/** The firm's templates by id, with their stages (clients receive none). */
export function useTemplates(): ReadonlyMap<string, Template> {
  const rows = useRows('PlantillasTramite');
  return useMemo(
    () => new Map((rows ?? []).map((row) => [row.id, { row, stages: parseStages(row.etapas) }])),
    [rows],
  );
}

/** A filing's light: closed, or by the sooner of its deadline and its next step. */
export function filingSemaforo(row: Row, today: string): Semaforo {
  if (row.estado === 'CONCLUIDO') return 'done';
  if (row.estado === 'CANCELADO') return 'noDate';
  const u = urgencyOf(filingDate(row), today);
  return u === 'none' ? 'noDate' : u;
}
