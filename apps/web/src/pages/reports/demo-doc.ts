/**
 * The demo client's monthly report as a document, for the tests (the
 * fictitious data set, read as a user of the whole client).
 */
import {
  DEFAULT_HEALTH_WEIGHTS,
  REPORT_TABLES,
  buildReport,
  clientViewRows,
  text,
  type Row,
  type TableName,
} from '@empirica/shared';
import { ID, demoData } from '@empirica/shared/testing';
import { i18n } from '../../i18n/index.ts';
import { reportDoc, type ReportLang } from './doc.ts';

export function demoDoc(
  lang: ReportLang,
  summary: string | null = 'Primer párrafo.\n\nSegundo párrafo.',
) {
  const data = demoData();
  const lookup = {
    get: (table: TableName, id: string): Row | undefined => data[table].find((r) => r.id === id),
  };
  const source = Object.fromEntries(REPORT_TABLES.map((t) => [t, data[t]]));
  const model = buildReport(clientViewRows(source, ID.clienteA, lookup), {
    clienteId: ID.clienteA,
    periodo: '2026-09',
    today: '2026-10-05',
    inhabiles: new Set(),
    weights: DEFAULT_HEALTH_WEIGHTS,
    waitingDays: 3,
  });
  const units = new Map(
    data.Entidades.filter((e) => e.clienteId === ID.clienteA).map((e) => [
      e.id,
      text(e, 'nombre') ?? '',
    ]),
  );
  return reportDoc({
    model,
    t: i18n.getFixedT(lang),
    lang,
    client: 'Cliente Demo, S.A. de C.V.',
    units,
    summary,
    signer: 'Abogado Demo',
  });
}
