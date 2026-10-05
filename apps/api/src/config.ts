/**
 * Settings that live in the Config tab, so the firm can adjust them without
 * a new deployment. setup() creates the missing ones with these defaults.
 * Public ones also reach the browser.
 */
import {
  DEFAULT_FATAL_REMINDERS,
  DEFAULT_HEALTH_WEIGHTS,
  DEFAULT_GENERAL_REMINDERS,
  MIN_APP_VERSION,
  compareVersions,
  maxFileBytes,
  parseDays,
  text,
  type Row,
} from '@empirica/shared';

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
  { clave: 'horaResumen', valor: '7', publica: true },
  { clave: 'diasEsperaCliente', valor: '3', publica: true },
  { clave: 'urlPortal', valor: 'https://portal.empirica.mx/', publica: true },
  { clave: 'reservaCorreos', valor: '10', publica: false },
  // F6: the AI model ('' = the portal picks the best stable Flash-Lite), the
  // day's limit the partner reads in AI Studio ('' = unknown), and the
  // weights of the health index.
  { clave: 'modeloIA', valor: '', publica: false },
  { clave: 'limiteDiarioIA', valor: '', publica: false },
  {
    clave: 'pesosSalud',
    valor: JSON.stringify(DEFAULT_HEALTH_WEIGHTS),
    publica: true,
  },
];

export interface Settings {
  minAppVersion: string;
  requestsPerMinute: number;
  /** Largest file a document may have (`mbMaxArchivo`). */
  maxFileBytes: number;
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
    maxFileBytes: maxFileBytes(Number(value('mbMaxArchivo') ?? fallback('mbMaxArchivo'))),
  };
}

/** The agenda's settings: reminders, the summary's hour and its emails (F5). */
export interface AgendaSettings {
  general: number[];
  fatal: number[];
  /** Hour of the daily summary, 0 to 23 in Cancún. */
  digestHour: number;
  /** Days a task may wait for the client before it is reminded, and again each as many. */
  waitingDays: number;
  /** The portal's address, for the links in emails and calendars. */
  portalUrl: string;
  /** Emails kept for invitations: the summary stops before using them. */
  mailReserve: number;
}

const wholeNumber = (value: string | null, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function readAgendaSettings(rows: readonly Row[]): AgendaSettings {
  const value = (key: string): string | null => {
    const row = rows.find((r) => !r.deleted && r.clave === key);
    return row ? text(row, 'valor') : null;
  };
  const url = value('urlPortal');
  return {
    general: parseDays(value('diasAlertaGeneral'), DEFAULT_GENERAL_REMINDERS),
    fatal: parseDays(value('diasAlertaFatal'), DEFAULT_FATAL_REMINDERS),
    digestHour: wholeNumber(value('horaResumen'), 7, 0, 23),
    waitingDays: wholeNumber(value('diasEsperaCliente'), 3, 1, 60),
    portalUrl: url && /^https:\/\/[^\s]+$/.test(url) ? url : 'https://portal.empirica.mx/',
    mailReserve: wholeNumber(value('reservaCorreos'), 10, 0, 100),
  };
}
