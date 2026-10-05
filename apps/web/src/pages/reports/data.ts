/**
 * The monthly report and the health index in the browser (F6): made from
 * the local copy as a user of the whole client sees it (clientViewRows), with
 * the same functions the server uses, so the preview, the PDF and the
 * summary the AI drafts all read the same records.
 */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  REPORT_TABLES,
  buildReport,
  clientViewRows,
  healthIndex,
  parseHealthWeights,
  text,
  type HealthIndex,
  type HealthWeights,
  type ReportData,
  type ReportModel,
  type ReportTable,
  type Row,
  type TableName,
} from '@empirica/shared';
import { rowsOf } from '../../data/db.ts';
import { configNumber, usePortal } from '../../session/context.ts';
import { useNonWorkingDays } from '../compliance/compliance.ts';

type Grouped = Partial<Record<ReportTable, Row[]>>;

const lookupOf = (data: Grouped) => {
  const maps = new Map<string, Map<string, Row>>();
  for (const [table, rows] of Object.entries(data)) {
    maps.set(table, new Map(rows.map((r) => [r.id, r])));
  }
  return { get: (table: TableName, id: string) => maps.get(table)?.get(id) };
};

/** What each client's users of the whole company see, by client (one client, or every one). */
export function useClientViews(clienteId: string | null): Map<string, ReportData> | undefined {
  const { db } = usePortal();
  return useLiveQuery(async () => {
    const all: Grouped = {};
    for (const table of REPORT_TABLES) {
      const store = rowsOf(db, table);
      all[table] = clienteId
        ? await store.where('clienteId').equals(clienteId).toArray()
        : await store.toArray();
    }
    const lookup = lookupOf(all);
    const ids = new Set<string>();
    for (const rows of Object.values(all)) {
      for (const r of rows) {
        const id = text(r, 'clienteId');
        if (id) ids.add(id);
      }
    }
    if (clienteId) ids.add(clienteId);
    const out = new Map<string, ReportData>();
    for (const id of ids) {
      const mine: Grouped = {};
      for (const table of REPORT_TABLES) {
        mine[table] = (all[table] ?? []).filter((r) => r.clienteId === id);
      }
      out.set(id, clientViewRows(mine, id, lookup));
    }
    return out;
  }, [db, clienteId]);
}

export interface ReportSettings {
  inhabiles: ReadonlySet<string>;
  weights: HealthWeights;
  waitingDays: number;
}

/** The firm's settings the report and the index read: weights, waiting days, non-working days. */
export function useReportSettings(): ReportSettings {
  const { me } = usePortal();
  const inhabiles = useNonWorkingDays();
  const pesos = me.config.pesosSalud;
  const waitingDays = configNumber(me, 'diasEsperaCliente', 3);
  return useMemo(
    () => ({ inhabiles, weights: parseHealthWeights(pesos), waitingDays }),
    [inhabiles, pesos, waitingDays],
  );
}

/** A client's month, as the report shows it; undefined while loading. */
export function useReportModel(
  clienteId: string,
  periodo: string,
  today: string,
): ReportModel | undefined {
  const views = useClientViews(clienteId);
  const settings = useReportSettings();
  return useMemo(
    () =>
      views
        ? buildReport(views.get(clienteId) ?? {}, { clienteId, periodo, today, ...settings })
        : undefined,
    [views, clienteId, periodo, today, settings],
  );
}

/** Each client's health index, from what its users of the whole company see. */
export function useHealthByClient(today: string): Map<string, HealthIndex> | undefined {
  const views = useClientViews(null);
  const settings = useReportSettings();
  return useMemo(() => {
    if (!views) return undefined;
    const out = new Map<string, HealthIndex>();
    for (const [id, data] of views) out.set(id, healthIndex(data, { today, ...settings }));
    return out;
  }, [views, today, settings]);
}
