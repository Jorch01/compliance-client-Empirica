/**
 * The local database (PLAN.md § 5): a partial replica with only what this
 * user may see, one store per tab, plus the queue of changes not yet sent
 * (`outbox`), small bookkeeping (`meta`) and the notices of changes the
 * server did not apply. The interface always reads from here.
 *
 * One database per signed-in account, so two people sharing a computer
 * never mix their copies; signing out deletes it (unless the user keeps it).
 */
import { Dexie, type Table } from 'dexie';
import {
  PULLED_TABLES,
  SNAPSHOT_TABLES,
  TABLES,
  type Op,
  type Row,
  type TableName,
} from '@empirica/shared';

/** Tabs that live on the device. */
export const LOCAL_TABLES: readonly TableName[] = [...PULLED_TABLES, ...SNAPSHOT_TABLES];

/** Extra indexes the screens query by, besides `id` and the client. */
const INDEXES: Partial<Record<TableName, string[]>> = {
  Entidades: ['parentId'],
  Asuntos: ['entidadId', 'estado'],
  Tareas: ['asuntoId', 'entidadId', 'estado', 'fechaLimite'],
  Tramites: ['estado', 'fechaLimite'],
  Obligaciones: ['entidadId', 'proximoVencimiento'],
  Solicitudes: ['entidadId', 'estado'],
  Comentarios: ['entidadId'],
  Notificaciones: ['usuarioId'],
  Membresias: ['usuarioId'],
  Eventos: ['inicio'],
  Sugerencias: ['usuarioId', 'estado'],
  Reportes: ['periodo'],
};

export function storeSchema(table: TableName): string {
  const client = TABLES[table].scope.client;
  const keys = ['id', ...(client && client !== 'id' ? [client] : []), ...(INDEXES[table] ?? [])];
  return [...new Set(keys)].join(', ');
}

export interface OutboxEntry extends Op {
  /** Order of the queue (auto-numbered). */
  seq?: number;
  /** In flight: a new edit of the record starts another operation. */
  sending: 0 | 1;
}

export interface Notice {
  id?: number;
  at: string;
  table: TableName;
  recordId: string;
  /** 'upload': the server refused a document's file. */
  kind: 'rejected' | 'conflict' | 'superseded' | 'upload';
  code?: string;
  reason?: string;
  fields?: string[];
  /** A label for the record, as the user knew it ("Licencia de funcionamiento"). */
  label?: string;
}

/**
 * A document's file waiting to be sent (PLAN.md § 7): the record travels
 * first, offline too; the file follows once the server has the record.
 */
export interface UploadEntry {
  /** The document (Documentos id). */
  id: string;
  /** Makes a retry harmless (files.upload). */
  uploadId: string;
  data: ArrayBuffer;
  nombre: string;
  size: number;
  createdAt: string;
  /** Why the server refused it: it waits for the user, never retried on its own. */
  error?: { code: string; reason?: string } | null;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type PortalDb = Dexie & {
  outbox: Table<OutboxEntry, number>;
  meta: Table<MetaEntry, string>;
  notices: Table<Notice, number>;
  uploads: Table<UploadEntry, string>;
} & Record<TableName, Table<Row, string>>;

/** Bump when the stores change; Dexie upgrades the database in place. */
export const DB_VERSION = 4;

export function dbName(accountId: string): string {
  return `empirica-${accountId}`;
}

export function openDb(accountId: string): PortalDb {
  const db = new Dexie(dbName(accountId)) as PortalDb;
  const stores: Record<string, string> = {
    outbox: '++seq, opId, [table+id]',
    meta: 'key',
    notices: '++id',
    uploads: 'id',
  };
  for (const t of LOCAL_TABLES) stores[t] = storeSchema(t);
  db.version(DB_VERSION).stores(stores);
  return db;
}

export function rowsOf(db: PortalDb, table: TableName): Table<Row, string> {
  return db.table(table);
}
