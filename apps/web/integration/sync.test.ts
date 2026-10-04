/**
 * The browser's sync engine against the real backend (phase 2, "done when":
 * offline edits on two devices converge, and nothing internal ever reaches
 * a client user).
 */
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { createWorld } from '../../api/src/testing/harness.ts';
import { META } from '../src/sync/engine.ts';
import { TestBrowser } from './device.ts';

const SOL = '00000000-0000-4000-9999-000000000001';

describe('first sync', () => {
  it('downloads only what the user may see, with the directory and the cursor', async () => {
    const w = createWorld();
    const colab = new TestBrowser(w, ID.cColab);
    await colab.sync();
    expect(await colab.ids('Asuntos')).toContain(ID.asNorte);
    expect(await colab.ids('Asuntos')).not.toContain(ID.asSur);
    expect(await colab.ids('Asuntos')).not.toContain(ID.asInterno);
    expect(await colab.ids('Tareas')).toContain(ID.tNorte1);
    expect(await colab.ids('Tareas')).not.toContain(ID.tInterna);
    expect((await colab.ids('Usuarios')).length).toBeGreaterThan(0);
    expect((await colab.db.meta.get(META.cursor))?.value).toBeGreaterThan(0);
    expect(colab.engine.getStatus()).toMatchObject({ phase: 'idle', pending: 0, error: null });

    // Nothing new: one cheap pull, nothing to push.
    colab.calls = [];
    await colab.sync();
    expect(colab.calls).toEqual(['sync.pull']);
  });
});

describe('offline edits', () => {
  it('a request created and edited without network shows at once and reaches the server later', async () => {
    const w = createWorld();
    const colab = new TestBrowser(w, ID.cColab);
    await colab.sync();
    colab.online = false;

    await colab.engine.mutate('Solicitudes', 'create', SOL, {
      clienteId: ID.clienteA,
      entidadId: ID.norte,
      titulo: 'Revisar aviso de privacidad',
      estado: 'RECIBIDA',
    });
    await colab.engine.mutate('Solicitudes', 'update', SOL, { descripcion: 'Antes del lunes' });
    expect(await colab.get('Solicitudes', SOL)).toMatchObject({
      titulo: 'Revisar aviso de privacidad',
      descripcion: 'Antes del lunes',
      version: 0,
    });
    // Both edits travel as one creation.
    const queued = await colab.outbox();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ type: 'create', fields: { descripcion: 'Antes del lunes' } });

    await colab.sync();
    expect(colab.engine.getStatus()).toMatchObject({ phase: 'offline', pending: 1 });
    expect(w.row('Solicitudes', SOL)).toBeUndefined();

    colab.online = true;
    await colab.sync();
    expect(colab.engine.getStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(w.row('Solicitudes', SOL)).toMatchObject({
      titulo: 'Revisar aviso de privacidad',
      descripcion: 'Antes del lunes',
      createdBy: ID.cColab,
    });
    expect(await colab.get('Solicitudes', SOL)).toMatchObject({ version: 1 });
    expect(typeof (await colab.get('Solicitudes', SOL))?.serverSeq).toBe('number');
  });

  it('a creation deleted before it was ever sent leaves no trace', async () => {
    const w = createWorld();
    const colab = new TestBrowser(w, ID.cColab);
    await colab.sync();
    colab.online = false;
    await colab.engine.mutate('Solicitudes', 'create', SOL, {
      clienteId: ID.clienteA,
      entidadId: ID.norte,
      titulo: 'Borrador',
      estado: 'RECIBIDA',
    });
    await colab.engine.mutate('Solicitudes', 'delete', SOL);
    expect(await colab.get('Solicitudes', SOL)).toBeUndefined();
    expect(await colab.outbox()).toEqual([]);
  });

  it('an edit that names a record created after it keeps its place behind that record', async () => {
    const w = createWorld();
    const firm = new TestBrowser(w, ID.socio);
    await firm.sync();
    firm.online = false;
    // A request classified, turned into a new matter, and marked as converted.
    const matter = '00000000-0000-4000-9999-000000000002';
    await firm.engine.mutate('Solicitudes', 'update', ID.solNorte, { estado: 'DENTRO_IGUALA' });
    await firm.engine.mutate('Asuntos', 'create', matter, {
      clienteId: ID.clienteA,
      entidadId: ID.norte,
      titulo: 'Revisar contrato de proveedor',
      area: 'CONTRATOS',
      estado: 'ACTIVO',
      visibilidad: 'COMPARTIDO',
    });
    await firm.engine.mutate('Solicitudes', 'update', ID.solNorte, {
      estado: 'CONVERTIDA',
      asuntoIdGenerado: matter,
    });
    // A contract, its signed copy, and the copy named on the contract.
    const contract = '00000000-0000-4000-9999-000000000003';
    const doc = '00000000-0000-4000-9999-000000000004';
    await firm.engine.mutate('Contratos', 'create', contract, {
      clienteId: ID.clienteA,
      contraparte: 'Distribuidora Ficticia',
      visibilidad: 'COMPARTIDO',
    });
    await firm.engine.mutate('Documentos', 'create', doc, {
      clienteId: ID.clienteA,
      vinculo: { tipo: 'Contratos', id: contract },
      nombre: 'contrato-firmado.pdf',
      visibilidad: 'COMPARTIDO',
    });
    await firm.engine.mutate('Contratos', 'update', contract, { docId: doc });
    expect((await firm.outbox()).map((o) => `${o.table}:${o.type}`)).toEqual([
      'Solicitudes:update',
      'Asuntos:create',
      'Solicitudes:update',
      'Contratos:create',
      'Documentos:create',
      'Contratos:update',
    ]);

    firm.online = true;
    await firm.sync();
    expect(w.row('Solicitudes', ID.solNorte)).toMatchObject({
      estado: 'CONVERTIDA',
      asuntoIdGenerado: matter,
    });
    expect(w.row('Contratos', contract)).toMatchObject({ docId: doc });
    expect(await firm.outbox()).toEqual([]);
    expect(await firm.db.notices.count()).toBe(0);
  });

  it('two devices edit the same task offline and converge, each field to its latest edit', async () => {
    const w = createWorld();
    const lawyer = new TestBrowser(w, ID.abogado);
    const client = new TestBrowser(w, ID.cColab);
    await lawyer.sync();
    await client.sync();
    lawyer.online = false;
    client.online = false;

    // Different fields: both survive.
    await client.engine.mutate('Tareas', 'update', ID.tNorte1, { estado: 'EN_REVISION' });
    w.clock.advance(1_000);
    await lawyer.engine.mutate('Tareas', 'update', ID.tNorte1, {
      titulo: 'Entregar acta y poderes',
    });
    // The same field: the later edit wins everywhere, whoever syncs first.
    w.clock.advance(1_000);
    await lawyer.engine.mutate('Tareas', 'update', ID.tNorte1, {
      descripcion: 'Versión del despacho',
    });

    lawyer.online = true;
    client.online = true;
    await lawyer.sync();
    await client.sync();
    await lawyer.sync();

    for (const device of [lawyer, client]) {
      expect(await device.get('Tareas', ID.tNorte1)).toMatchObject({
        estado: 'EN_REVISION',
        titulo: 'Entregar acta y poderes',
        descripcion: 'Versión del despacho',
      });
      expect(await device.outbox()).toEqual([]);
    }
    expect(w.row('Tareas', ID.tNorte1)).toMatchObject({
      estado: 'EN_REVISION',
      titulo: 'Entregar acta y poderes',
    });
  });
});

describe('what the server refuses or keeps', () => {
  it('a change the user may not make is undone on the device and explained', async () => {
    const w = createWorld();
    const client = new TestBrowser(w, ID.cColab);
    await client.sync();
    // Only the firm closes a task (D18).
    await client.engine.mutate('Tareas', 'update', ID.tNorte1, { estado: 'HECHO' });
    expect((await client.get('Tareas', ID.tNorte1))?.estado).toBe('HECHO');
    await client.sync();
    expect((await client.get('Tareas', ID.tNorte1))?.estado).toBe('POR_HACER');
    expect(await client.notices()).toMatchObject([
      {
        kind: 'rejected',
        table: 'Tareas',
        recordId: ID.tNorte1,
        code: 'FORBIDDEN',
        label: 'Entregar acta constitutiva',
      },
    ]);
    expect(w.row('Tareas', ID.tNorte1)?.estado).toBe('POR_HACER');
  });

  it('a deadline changed by two lawyers at once keeps the current one and raises a conflict', async () => {
    const w = createWorld();
    const lawyer = new TestBrowser(w, ID.abogado);
    const partner = new TestBrowser(w, ID.socio);
    await lawyer.sync();
    await partner.sync();
    lawyer.online = false;
    partner.online = false;
    await lawyer.engine.mutate('Tareas', 'update', ID.tNorte1, { fechaLimite: '2026-10-20' });
    await partner.engine.mutate('Tareas', 'update', ID.tNorte1, { fechaLimite: '2026-10-25' });
    lawyer.online = true;
    partner.online = true;
    await lawyer.sync();
    await partner.sync();
    expect(w.row('Tareas', ID.tNorte1)?.fechaLimite).toBe('2026-10-20');
    expect((await partner.get('Tareas', ID.tNorte1))?.fechaLimite).toBe('2026-10-20');
    expect(await partner.notices()).toMatchObject([{ kind: 'conflict', fields: ['fechaLimite'] }]);
    expect(w.rows('Conflictos').some((c) => c.entidadId === ID.tNorte1)).toBe(true);
  });
});

describe('access that changes', () => {
  it('a task made internal disappears from the client device and never comes back', async () => {
    const w = createWorld();
    const lawyer = new TestBrowser(w, ID.abogado);
    const client = new TestBrowser(w, ID.cColab);
    await lawyer.sync();
    await client.sync();
    expect(await client.ids('Tareas')).toContain(ID.tNorte1);
    await lawyer.engine.mutate('Tareas', 'update', ID.tNorte1, { visibilidad: 'INTERNO' });
    await lawyer.sync();
    await client.sync();
    expect(await client.ids('Tareas')).not.toContain(ID.tNorte1);
    const everything = JSON.stringify(await client.db.table('Tareas').toArray());
    expect(everything).not.toContain('Entregar acta constitutiva');
  });

  it('a revoked membership wipes that client from the device', async () => {
    const w = createWorld();
    const client = new TestBrowser(w, ID.cColab);
    await client.sync();
    expect((await client.ids('Asuntos')).length).toBeGreaterThan(0);
    w.ok(
      'admin.memberships.save',
      {
        usuarioId: ID.cColab,
        clienteId: ID.clienteA,
        rol: 'CLIENTE_COLABORADOR',
        estado: 'REVOCADA',
      },
      { as: ID.socio },
    );
    await client.sync();
    for (const t of ['Asuntos', 'Tareas', 'Solicitudes', 'Entidades', 'Clientes'] as const) {
      expect(await client.ids(t)).toEqual([]);
    }
  });

  it('a new scope downloads the client again, keeping the edits still queued', async () => {
    const w = createWorld();
    const client = new TestBrowser(w, ID.cColab);
    await client.sync();
    client.online = false;
    await client.engine.mutate('Solicitudes', 'create', SOL, {
      clienteId: ID.clienteA,
      entidadId: ID.norte,
      titulo: 'Pendiente de enviar',
      estado: 'RECIBIDA',
    });
    w.ok(
      'admin.memberships.save',
      {
        usuarioId: ID.cColab,
        clienteId: ID.clienteA,
        rol: 'CLIENTE_COLABORADOR',
        alcance: { entidades: [ID.norte, ID.sur], asuntos: [] },
      },
      { as: ID.socio },
    );
    client.online = true;
    await client.sync();
    expect(await client.ids('Asuntos')).toEqual(expect.arrayContaining([ID.asNorte, ID.asSur]));
    expect(await client.get('Solicitudes', SOL)).toMatchObject({ titulo: 'Pendiente de enviar' });
    expect(w.row('Solicitudes', SOL)).toBeDefined();
  });
});

describe('documents and their files', () => {
  const DOC = '00000000-0000-4000-9999-0000000000d1';
  const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

  it('a document made offline goes with its file once the network is back', async () => {
    const w = createWorld();
    const colab = new TestBrowser(w, ID.cColab);
    const firm = new TestBrowser(w, ID.abogado);
    await colab.sync();
    colab.online = false;

    await colab.engine.mutate('Documentos', 'create', DOC, {
      clienteId: ID.clienteA,
      entidadId: ID.norte,
      vinculo: { tipo: 'Asuntos', id: ID.asNorte },
      nombre: 'acta.pdf',
      visibilidad: 'COMPARTIDO',
      categoria: 'COMPLIANCE',
      tamanoBytes: 15,
    });
    await colab.engine.queueFile(DOC, {
      data: bytes('%PDF ficticio 1'),
      nombre: 'acta.pdf',
      size: 15,
    });
    await colab.sync();
    // The record and its file wait together.
    expect(colab.engine.getStatus()).toMatchObject({ phase: 'offline', pending: 2 });

    colab.online = true;
    colab.calls = [];
    await colab.sync();
    expect(colab.calls).toEqual(['sync.push', 'sync.pull', 'files.upload']);
    expect(colab.engine.getStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(await colab.db.uploads.count()).toBe(0);
    expect(await colab.get('Documentos', DOC)).toMatchObject({ versionDoc: 1, tamanoBytes: 15 });

    // The firm reads it back, byte for byte.
    await firm.sync();
    expect(await firm.get('Documentos', DOC)).toMatchObject({ versionDoc: 1 });
    const res = w.ok<{ base64: string }>(
      'files.download',
      { documentoId: DOC },
      { as: ID.abogado },
    );
    expect(atob(res.base64)).toBe('%PDF ficticio 1');
  });

  it('a file the server refuses waits for the user, with a notice, and is not retried', async () => {
    const w = createWorld();
    const firm = new TestBrowser(w, ID.abogado);
    await firm.sync();
    await firm.engine.mutate('Documentos', 'create', DOC, {
      clienteId: ID.clienteA,
      vinculo: { tipo: 'Asuntos', id: ID.asNorte },
      nombre: 'pagina.html',
      visibilidad: 'INTERNO',
    });
    await firm.engine.queueFile(DOC, { data: bytes('<b>x</b>'), nombre: 'pagina.html', size: 8 });
    await firm.sync();
    expect(await firm.db.uploads.get(DOC)).toMatchObject({
      error: { code: 'VALIDATION', reason: 'FILE_TYPE' },
    });
    expect(await firm.notices()).toEqual([
      expect.objectContaining({ kind: 'upload', recordId: DOC, reason: 'FILE_TYPE' }),
    ]);
    expect(firm.engine.getStatus()).toMatchObject({ pending: 0 });
    firm.calls = [];
    await firm.sync();
    expect(firm.calls).not.toContain('files.upload');
    await firm.engine.dropFile(DOC);
    expect(await firm.db.uploads.count()).toBe(0);
  });

  it('a document deleted before its file left takes the file with it', async () => {
    const w = createWorld();
    const firm = new TestBrowser(w, ID.abogado);
    await firm.sync();
    firm.online = false;
    await firm.engine.mutate('Documentos', 'create', DOC, {
      clienteId: ID.clienteA,
      vinculo: { tipo: 'Asuntos', id: ID.asNorte },
      nombre: 'borrador.docx',
      visibilidad: 'INTERNO',
    });
    await firm.engine.queueFile(DOC, { data: bytes('x'), nombre: 'borrador.docx', size: 1 });
    await firm.engine.mutate('Documentos', 'delete', DOC);
    firm.online = true;
    await firm.sync();
    expect(firm.calls).not.toContain('files.upload');
    expect(await firm.db.uploads.count()).toBe(0);
    expect(firm.engine.getStatus()).toMatchObject({ pending: 0 });
  });
});
