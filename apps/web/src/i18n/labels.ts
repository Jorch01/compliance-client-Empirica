/**
 * Labels for the closed vocabularies of the data model (states, roles,
 * areas…). The stored value is the key; an unknown value shows as nothing
 * rather than as a raw code.
 */
import type { TFunction } from 'i18next';
import {
  AREAS,
  ERROR_CODES,
  ESTADOS_SOLICITUD,
  ESTADOS_TAREA,
  PRIORIDADES,
  ROLES,
  SERVICIOS,
  TIPOS_ENTIDAD,
} from '@empirica/shared';
import { es } from './es.ts';

export const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

export const areaLabel = (t: TFunction, v: unknown): string =>
  oneOf(AREAS, v) ? t(`options.areas.${v}`) : '';

export const priorityLabel = (t: TFunction, v: unknown): string =>
  oneOf(PRIORIDADES, v) ? t(`options.prioridades.${v}`) : '';

export const roleLabel = (t: TFunction, v: unknown): string =>
  oneOf(ROLES, v) ? t(`roles.${v}`) : '';

export const requestStateLabel = (t: TFunction, v: unknown): string =>
  oneOf(ESTADOS_SOLICITUD, v) ? t(`requests.estados.${v}`) : '';

export const taskStateLabel = (t: TFunction, v: unknown): string =>
  oneOf(ESTADOS_TAREA, v) ? t(`tasks.estados.${v}`) : '';

export const serviceLabel = (t: TFunction, v: unknown): string =>
  oneOf(SERVICIOS, v) ? t(`clients.servicios.${v}`) : '';

export const unitTypeLabel = (t: TFunction, v: unknown): string =>
  oneOf(TIPOS_ENTIDAD, v) ? t(`clients.tipos.${v}`) : '';

const FIELD_NAMES = Object.keys(es.fields) as (keyof typeof es.fields)[];
const DENIALS = Object.keys(es.sync.denials) as (keyof typeof es.sync.denials)[];

/** A column's name for people ("fechaLimite" → "Fecha límite"); unknown ones as they are. */
export const fieldLabel = (t: TFunction, field: string): string =>
  oneOf(FIELD_NAMES, field) ? t(`fields.${field}`) : field;

/** Why the server did not apply a change, in the user's words. */
export function denialText(
  t: TFunction,
  reason: string | undefined,
  code: string | undefined,
): string {
  if (oneOf(DENIALS, reason)) return t(`sync.denials.${reason}`);
  if (oneOf(ERROR_CODES, code)) return t(`errors.${code}`);
  return t('errors.UNKNOWN');
}
