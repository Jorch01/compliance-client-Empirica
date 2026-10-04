/** What the request screens share: the tone of each state. */
import { ESTADOS_SOLICITUD, type Row } from '@empirica/shared';
import { oneOf } from '../../i18n/labels.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const REQUEST_TONE: Record<EstadoSolicitud, Tone> = {
  RECIBIDA: 'info',
  EN_ANALISIS: 'info',
  DENTRO_IGUALA: 'success',
  FUERA_IGUALA_COTIZADA: 'warning',
  ACEPTADA: 'success',
  RECHAZADA: 'neutral',
  CONVERTIDA: 'success',
};

export const requestState = (row: Row): EstadoSolicitud =>
  oneOf(ESTADOS_SOLICITUD, row.estado) ? row.estado : 'RECIBIDA';
