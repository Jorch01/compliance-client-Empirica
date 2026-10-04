/**
 * Phase 3: the files of the documents. The record travels with sync.push
 * (offline too); its file follows with files.upload and is read back with
 * files.download, by whoever sees the document and nobody else.
 */
import {
  text,
  type ApiFailure,
  type FileDownloadData,
  type FileUploadData,
} from '@empirica/shared';
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { INTERNAL_FOLDER } from './actions/files.ts';
import { PROP } from './env.ts';
import { MAX_BODY_CHARS } from './router.ts';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const A = ID.clienteA;
const PDF = Buffer.from('%PDF-1.4 documento ficticio').toString('base64');
const OTHER_PDF = Buffer.from('%PDF-1.4 segunda versión ficticia').toString('base64');

let next = 0xa00;
const newId = (): string => uid(next++);

const failure = (res: unknown): ApiFailure['error'] => {
  const r = res as ApiFailure;
  expect(r.ok).toBe(false);
  return r.error;
};

/** A document record created from a device, as the portal does before sending its file. */
function createDocument(w: World, as: string, fields: Record<string, unknown> = {}): string {
  const id = newId();
  const [result] = new Device(w, as).push([
    op('Documentos', 'create', id, {
      clienteId: A,
      entidadId: ID.norte,
      vinculo: { tipo: 'Asuntos', id: ID.asNorte },
      nombre: 'acta.pdf',
      visibilidad: 'COMPARTIDO',
      categoria: 'COMPLIANCE',
      ...fields,
    }),
  ]);
  expect(result).toMatchObject({ status: 'applied' });
  return id;
}

const upload = (w: World, as: string, documentoId: string, base64 = PDF, uploadId = newId()) =>
  w.call<FileUploadData>('files.upload', { documentoId, uploadId, base64 }, { as });

/** Folder path of a Drive file in the fake: "Clientes/<client>/Compliance". */
function pathOf(w: World, fileId: string): string {
  const file = w.google.files.get(fileId);
  const names: string[] = [];
  let folder = file?.parent ?? null;
  while (folder) {
    names.unshift(folder.name);
    folder = folder.parent;
  }
  return names.slice(1).join('/');
}

const fileIdOf = (w: World, documentoId: string): string =>
  text(w.row('Documentos', documentoId) ?? { id: documentoId }, 'driveFileId') ?? '';

describe('a document and its file', () => {
  it('a client sends the file of their document; the firm downloads it as it was', () => {
    const w = createWorld();
    const id = createDocument(w, ID.cAdmin);
    const res = upload(w, ID.cAdmin, id);
    if (!res.ok) throw new Error(res.error.message);
    // The client gets the record without the Drive id.
    expect(res.data.row).toMatchObject({
      id,
      versionDoc: 1,
      mimeType: 'application/pdf',
      tamanoBytes: Buffer.from(PDF, 'base64').length,
    });
    expect(res.data.row).not.toHaveProperty('driveFileId');

    // Stored in the client's folder (created now), under its area.
    const cliente = w.row('Clientes', A);
    expect(cliente?.driveFolderId).not.toBe('drive-folder-a');
    expect(pathOf(w, fileIdOf(w, id))).toBe(
      `Clientes/${A} - ${text(cliente ?? { id: A }, 'razonSocial') ?? ''}/Compliance`,
    );
    expect(w.google.props.get(PROP.clientsFolderId)).toBeTruthy();

    const file = w.ok<FileDownloadData>('files.download', { documentoId: id }, { as: ID.abogado });
    expect(file).toEqual({ nombre: 'acta.pdf', mimeType: 'application/pdf', base64: PDF });
    expect(w.rows('Bitacora').some((b) => b.accion === 'ARCHIVO' && b.entidadId === id)).toBe(true);
  });

  it('what is internal goes to Interno, out of the client’s reach, and moves when shared', () => {
    const w = createWorld();
    const id = createDocument(w, ID.abogado, {
      visibilidad: 'INTERNO',
      categoria: 'CONTRATOS',
      nombre: 'opinion.docx',
    });
    expect(upload(w, ID.abogado, id).ok).toBe(true);
    expect(pathOf(w, fileIdOf(w, id)).endsWith(`/${INTERNAL_FOLDER}`)).toBe(true);
    for (const as of [ID.cAdmin, ID.cColab, ID.cLectura]) {
      expect(failure(w.call('files.download', { documentoId: id }, { as }))).toMatchObject({
        code: 'NOT_FOUND',
      });
    }

    new Device(w, ID.abogado).push([
      op(
        'Documentos',
        'update',
        id,
        { visibilidad: 'COMPARTIDO' },
        { base: { visibilidad: 'INTERNO' }, at: '2026-10-02T12:00:00.000-05:00' },
      ),
    ]);
    expect(pathOf(w, fileIdOf(w, id)).endsWith('/Contratos')).toBe(true);
    expect(
      w.ok<FileDownloadData>('files.download', { documentoId: id }, { as: ID.cAdmin }),
    ).toMatchObject({ nombre: 'opinion.docx' });
  });

  it('a new file is a new version, from the firm only', () => {
    const w = createWorld();
    const id = createDocument(w, ID.cAdmin);
    expect(upload(w, ID.cAdmin, id).ok).toBe(true);
    const first = fileIdOf(w, id);

    // What a client sent is never replaced from their side.
    expect(failure(upload(w, ID.cAdmin, id, OTHER_PDF))).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'ALREADY_UPLOADED' },
    });
    expect(failure(upload(w, ID.cColab, id, OTHER_PDF))).toMatchObject({ code: 'FORBIDDEN' });

    const res = upload(w, ID.abogado, id, OTHER_PDF);
    expect(res.ok && res.data.row).toMatchObject({ versionDoc: 2 });
    expect(res.ok && typeof res.data.row.driveFileId).toBe('string');
    expect(fileIdOf(w, id)).not.toBe(first);
    expect(
      w.ok<FileDownloadData>('files.download', { documentoId: id }, { as: ID.cAdmin }).base64,
    ).toBe(OTHER_PDF);
  });

  it('a retry of an upload that went through stores nothing new', () => {
    const w = createWorld();
    const id = createDocument(w, ID.cAdmin);
    const uploadId = newId();
    expect(upload(w, ID.cAdmin, id, PDF, uploadId).ok).toBe(true);
    const files = w.google.files.size;
    const again = upload(w, ID.cAdmin, id, PDF, uploadId);
    expect(again.ok && again.data.row).toMatchObject({ id, versionDoc: 1 });
    expect(w.google.files.size).toBe(files);
    // Somebody else's upload id is not theirs to reuse.
    const other = createDocument(w, ID.cColab, { entidadId: ID.norte });
    expect(failure(upload(w, ID.cColab, other, PDF, uploadId))).toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('refuses what it cannot keep, before storing anything', () => {
    const w = createWorld();
    const files = (): number => w.google.files.size;
    const before = files();
    const html = createDocument(w, ID.abogado, { nombre: 'pagina.html' });
    expect(failure(upload(w, ID.abogado, html))).toMatchObject({
      code: 'VALIDATION',
      details: { reason: 'FILE_TYPE' },
    });
    const id = createDocument(w, ID.abogado);
    expect(failure(upload(w, ID.abogado, id, ''))).toMatchObject({
      details: { reason: 'FILE_EMPTY' },
    });
    expect(failure(upload(w, ID.abogado, id, 'no es base64!'))).toMatchObject({
      code: 'VALIDATION',
    });
    const limit = w.rows('Config').find((c) => c.clave === 'mbMaxArchivo');
    w.edit('Config', limit?.id ?? '', { valor: '0.00001' });
    expect(failure(upload(w, ID.abogado, id))).toMatchObject({
      details: { reason: 'FILE_TOO_LARGE' },
    });
    expect(files()).toBe(before);
    expect(w.row('Documentos', id)?.driveFileId ?? null).toBeNull();
  });

  it('nobody outside the client, or the document’s scope, reaches the file', () => {
    const w = createWorld();
    const id = createDocument(w, ID.abogado);
    expect(upload(w, ID.abogado, id).ok).toBe(true);
    for (const as of [ID.cB, ID.abogadoB]) {
      expect(failure(w.call('files.download', { documentoId: id }, { as }))).toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(failure(upload(w, as, id))).toMatchObject({ code: 'NOT_FOUND' });
    }
    // Admin Sur sees the Sur unit only.
    expect(
      failure(w.call('files.download', { documentoId: id }, { as: ID.cAdminSur })),
    ).toMatchObject({ code: 'NOT_FOUND' });
    expect(w.ok('files.download', { documentoId: id }, { as: ID.asistente })).toBeTruthy();
  });

  it('a document without its file yet, or deleted, has nothing to download or receive', () => {
    const w = createWorld();
    const id = createDocument(w, ID.abogado);
    expect(
      failure(w.call('files.download', { documentoId: id }, { as: ID.abogado })),
    ).toMatchObject({ code: 'NOT_FOUND', details: { reason: 'NOT_UPLOADED' } });
    new Device(w, ID.abogado).push([
      op('Documentos', 'delete', id, undefined, { at: '2026-10-02T12:00:00.000-05:00' }),
    ]);
    expect(failure(upload(w, ID.abogado, id))).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('only an upload may carry a large body', () => {
    const w = createWorld();
    const big = 'A'.repeat(MAX_BODY_CHARS);
    expect(failure(w.call('profile.update', { nombre: big }, { as: ID.abogado }))).toMatchObject({
      code: 'VALIDATION',
    });
    const id = createDocument(w, ID.abogado, { nombre: 'grande.txt' });
    expect(upload(w, ID.abogado, id, big).ok).toBe(true);
  });
});
