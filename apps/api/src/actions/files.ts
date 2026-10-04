/**
 * The files of the documents (PLAN.md § 7, `files.*`). The record travels
 * with `sync.push`, offline too; its file follows, online, once the record
 * is on the server.
 *
 * Files live in the Drive of the owner account, in the client's folder:
 * one subfolder per practice area, and `Interno` for what the client does
 * not see. Nobody gets Drive permissions: everything goes through here.
 *
 * The script lock is held only to read and write the records, not while
 * Drive stores the file: a large upload does not hold everyone else back.
 */
import {
  authorizeDownload,
  authorizeUpload,
  base64Bytes,
  canRead,
  fileMimeType,
  projectRow,
  text,
  type FileDownloadData,
  type FileUploadData,
  type Row,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import { readSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import { PROP, type Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import type { GFile, GFolder } from '../google.ts';
import { changed, freshContext, underLock, type LockedRun } from './locked.ts';

/** Subfolder of the client's folder for each practice area. */
export const AREA_FOLDERS: Readonly<Record<string, string>> = {
  CORPORATIVO: 'Corporativo',
  CONTRATOS: 'Contratos',
  COMPLIANCE: 'Compliance',
  PROPIEDAD_INTELECTUAL: 'PI',
  LABORAL: 'Laboral',
  CONTROVERSIAS: 'Controversias',
};
/** What the client does not see; this folder is never shared. */
export const INTERNAL_FOLDER = 'Interno';

const invalid = (reason: string, message: string): ApiError =>
  new ApiError('VALIDATION', message, { reason });

const denied = (verdict: { code: ApiError['code']; reason: string }): ApiError =>
  new ApiError(verdict.code, undefined, { reason: verdict.reason });

function subfolder(parent: GFolder, name: string): GFolder {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

/** The client's folder, created the first time a file arrives (`Clientes.driveFolderId`). */
function clientFolder(r: LockedRun, clienteId: string): GFolder {
  const cliente = r.db.table('Clientes').get(clienteId);
  if (!cliente) throw new ApiError('NOT_FOUND');
  const id = text(cliente, 'driveFolderId');
  if (id) {
    try {
      const folder = r.env.g.DriveApp.getFolderById(id);
      if (!folder.isTrashed()) return folder;
    } catch {
      // Deleted by hand: a new one is created.
    }
  }
  const parentId = r.env.prop(PROP.clientsFolderId);
  if (!parentId) throw new ApiError('INTERNAL', 'Falta la carpeta de clientes: ejecuta setup().');
  const name = `${clienteId} - ${text(cliente, 'razonSocial') ?? ''}`.trim();
  const folder = r.env.g.DriveApp.getFolderById(parentId).createFolder(name);
  r.writer.save('Clientes', cliente, changed(r, cliente, { driveFolderId: folder.getId() }));
  r.writer.audit(
    'SISTEMA',
    'Clientes',
    clienteId,
    clienteId,
    { driveFolderId: id },
    { driveFolderId: folder.getId() },
  );
  return folder;
}

/** Where a document's file belongs: `Interno`, its area's folder, or the client's folder. */
function folderFor(r: LockedRun, documento: Row): GFolder {
  const base = clientFolder(r, text(documento, 'clienteId') ?? '');
  if (documento.visibilidad !== 'COMPARTIDO') return subfolder(base, INTERNAL_FOLDER);
  const area = AREA_FOLDERS[text(documento, 'categoria') ?? ''];
  return area ? subfolder(base, area) : base;
}

/**
 * After an edit changed who sees a document (or its area): its file moves
 * to the folder it now belongs in. Drive is not where permissions live, so
 * a failure here is logged and does not undo the edit.
 */
export function placeDocumentFile(r: LockedRun, documento: Row): void {
  const fileId = text(documento, 'driveFileId');
  if (!fileId) return;
  try {
    r.env.g.DriveApp.getFileById(fileId).moveTo(folderFor(r, documento));
  } catch (error) {
    r.env.log('No se pudo mover el archivo', { documento: documento.id, error: String(error) });
  }
}

/** Who already applied this upload, if anyone (a retry after a lost answer). */
function appliedBy(db: Database, uploadId: string): string | null {
  const row = db.rows('OpsAplicadas').find((o) => text(o, 'opId') === uploadId);
  return row ? (text(row, 'usuarioId') ?? '') : null;
}

function recordApplied(r: LockedRun, uploadId: string, usuarioId: string): void {
  r.db.table('OpsAplicadas').put({
    id: r.env.uuid(),
    createdAt: r.serverNow,
    createdBy: usuarioId,
    updatedAt: r.serverNow,
    updatedBy: usuarioId,
    version: 1,
    deleted: null,
    serverSeq: null,
    fieldTimestamps: null,
    opId: uploadId,
    usuarioId,
    resultado: { status: 'applied', archivo: true },
    fecha: r.serverNow,
    seqAlta: null,
    alcanceHist: null,
  });
}

export function uploadFile(
  env: Env,
  session: Session,
  input: { documentoId: string; uploadId: string; base64: string },
): FileUploadData {
  const userId = session.user.id;
  const maxBytes = readSettings(new Database(env).rows('Config')).maxFileBytes;
  const mb = Math.round(maxBytes / (1024 * 1024));
  if (base64Bytes(input.base64) > maxBytes) {
    throw invalid('FILE_TOO_LARGE', `El archivo pasa de ${String(mb)} MB.`);
  }

  // 1. With the lock, briefly: who, what, and the folder it goes in.
  type Target =
    | { kind: 'done'; row: Row }
    | { kind: 'upload'; folderId: string; name: string; mimeType: string };
  const target = underLock(env, userId, (r): Target => {
    const ctx = freshContext(r.db, userId);
    const documento = r.db.table('Documentos').get(input.documentoId);
    const by = appliedBy(r.db, input.uploadId);
    if (by !== null) {
      if (by !== userId || !documento) throw invalid('UPLOAD_ID_TAKEN', 'Envío repetido.');
      // Already stored; the answer had not arrived.
      return { kind: 'done', row: projectRow(ctx, 'Documentos', documento) };
    }
    const verdict = authorizeUpload(ctx, documento, r.db.lookup());
    if (!verdict.ok) throw denied(verdict);
    if (!documento) throw new ApiError('NOT_FOUND');
    const name = text(documento, 'nombre') ?? '';
    const mimeType = fileMimeType(name);
    if (!mimeType) throw invalid('FILE_TYPE', 'El portal no acepta este tipo de archivo.');
    return { kind: 'upload', folderId: folderFor(r, documento).getId(), name, mimeType };
  });
  if (target.kind === 'done') return { row: target.row };

  // 2. Without the lock: the file itself.
  let bytes: number[];
  try {
    bytes = env.g.Utilities.base64Decode(input.base64);
  } catch {
    throw invalid('FILE_CORRUPT', 'El archivo llegó dañado; intenta de nuevo.');
  }
  if (bytes.length === 0) throw invalid('FILE_EMPTY', 'El archivo está vacío.');
  if (bytes.length > maxBytes) {
    throw invalid('FILE_TOO_LARGE', `El archivo pasa de ${String(mb)} MB.`);
  }
  const file: GFile = env.g.DriveApp.getFolderById(target.folderId).createFile(
    env.g.Utilities.newBlob(bytes, target.mimeType, target.name),
  );

  // 3. With the lock again: the record, checked again (it may have changed meanwhile).
  try {
    return underLock(env, userId, (r) => {
      const ctx = freshContext(r.db, userId);
      const documento = r.db.table('Documentos').get(input.documentoId);
      const verdict = authorizeUpload(ctx, documento, r.db.lookup());
      if (!verdict.ok) throw denied(verdict);
      if (!documento) throw new ApiError('NOT_FOUND');
      const version = (typeof documento.versionDoc === 'number' ? documento.versionDoc : 0) + 1;
      const saved = r.writer.save(
        'Documentos',
        documento,
        changed(r, documento, {
          driveFileId: file.getId(),
          versionDoc: version,
          mimeType: target.mimeType,
          tamanoBytes: bytes.length,
        }),
      );
      if (folderFor(r, saved).getId() !== target.folderId) placeDocumentFile(r, saved);
      r.writer.audit(
        'ARCHIVO',
        'Documentos',
        documento.id,
        verdict.clienteId,
        { driveFileId: documento.driveFileId ?? null, versionDoc: documento.versionDoc ?? null },
        { driveFileId: file.getId(), versionDoc: version, tamanoBytes: bytes.length },
      );
      recordApplied(r, input.uploadId, userId);
      return { row: projectRow(ctx, 'Documentos', saved) };
    });
  } catch (error) {
    file.setTrashed(true);
    throw error;
  }
}

export function downloadFile(
  env: Env,
  session: Session,
  input: { documentoId: string },
): FileDownloadData {
  const db = new Database(env);
  const ctx = freshContext(db, session.user.id);
  const documento = db.table('Documentos').get(input.documentoId);
  const verdict = authorizeDownload(ctx, documento, db.lookup());
  if (!verdict.ok) throw denied(verdict);
  if (!documento || !canRead(ctx, 'Documentos', documento, db.lookup())) {
    throw new ApiError('NOT_FOUND');
  }
  let file: GFile;
  try {
    file = env.g.DriveApp.getFileById(text(documento, 'driveFileId') ?? '');
  } catch {
    throw new ApiError('NOT_FOUND', 'El archivo ya no está en Drive.', { reason: 'FILE_MISSING' });
  }
  const nombre = text(documento, 'nombre') ?? 'documento';
  return {
    nombre,
    mimeType: text(documento, 'mimeType') ?? fileMimeType(nombre) ?? 'application/octet-stream',
    base64: env.g.Utilities.base64Encode(file.getBlob().getBytes()),
  };
}
