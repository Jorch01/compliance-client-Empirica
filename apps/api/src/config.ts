/**
 * Settings that live in the Config tab, so the firm can adjust them without
 * a new deployment. setup() creates the missing ones with these defaults.
 * Public ones also reach the browser.
 */
import { MIN_APP_VERSION, compareVersions, text, type Row } from '@empirica/shared';

export interface ConfigDefault {
  clave: string;
  valor: string;
  publica: boolean;
}

export const CONFIG_DEFAULTS: readonly ConfigDefault[] = [
  { clave: 'minAppVersion', valor: '0.0.0', publica: true },
  { clave: 'inactividadMinutos', valor: '30', publica: true },
  { clave: 'diasSinConexion', valor: '14', publica: true },
  { clave: 'diasAlertaGeneral', valor: '7,1', publica: true },
  { clave: 'diasAlertaFatal', valor: '15,7,3,1', publica: true },
  { clave: 'mbMaxArchivo', valor: '10', publica: true },
  { clave: 'zonaHoraria', valor: 'America/Cancun', publica: true },
  { clave: 'limiteSolicitudesPorMinuto', valor: '120', publica: false },
  { clave: 'modoIA', valor: 'METADATA_ONLY', publica: false },
];

export interface Settings {
  minAppVersion: string;
  requestsPerMinute: number;
}

const atLeast = (version: string, floor: string): string =>
  compareVersions(version, floor) < 0 ? floor : version;

export function readSettings(rows: readonly Row[]): Settings {
  const value = (key: string): string | null => {
    const row = rows.find((r) => !r.deleted && r.clave === key);
    return row ? text(row, 'valor') : null;
  };
  const fallback = (key: string): string =>
    CONFIG_DEFAULTS.find((d) => d.clave === key)?.valor ?? '';
  const perMinute = Number(
    value('limiteSolicitudesPorMinuto') ?? fallback('limiteSolicitudesPorMinuto'),
  );
  return {
    minAppVersion: atLeast(value('minAppVersion') ?? fallback('minAppVersion'), MIN_APP_VERSION),
    requestsPerMinute: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : 120,
  };
}
