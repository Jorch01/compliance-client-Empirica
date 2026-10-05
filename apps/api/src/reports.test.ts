/**
 * Phase 6: sending the monthly report. The lawyer's browser makes the PDF;
 * the server keeps it in the client's Drive, freezes the report and emails
 * it to the client's users who see the whole company, and to nobody else.
 * On the first of the month each lawyer hears last month's report is ready.
 */
import {
  text,
  type ApiFailure,
  type FileDownloadData,
  type ReportSendData,
} from '@empirica/shared';
import { ID, uid } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { REPORTS_FOLDER } from './actions/reports.ts';
import { runNightly } from './maintenance.ts';
import { Device, op } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const A = ID.clienteA;
const B = ID.clienteB;
const PDF = Buffer.from('%PDF-1.7\n% Reporte mensual ficticio\n%%EOF\n').toString('base64');
const WHOLE_CLIENT_A = ['admin@cliente-a.example', 'lectura@cliente-a.example'];

const send = (w: World, as: string, reporteId: string = ID.repBorrador, pdf = PDF) =>
  w.call<ReportSendData>('reports.send', { reporteId, pdf }, { as });

const download = (w: World, as: string, reporteId: string) =>
  w.call<FileDownloadData>('reports.download', { reporteId }, { as });

const failure = (res: unknown): ApiFailure['error'] => {
  const r = res as ApiFailure;
  expect(r.ok).toBe(false);
  return r.error;
};

/** Folder path of a Drive file in the fake: "Clientes/<client>/Reportes". */
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

const reportMails = (w: World) =>
  w.google.mail.sent.filter((m) => m.subject.startsWith('Reporte mensual'));

const notices = (w: World, tipo: string) =>
  w
    .rows('Notificaciones')
    .filter((n) => n.tipo === tipo)
    .map((n) => [n.usuarioId, n.mensaje, n.link]);

describe('sending a monthly report', () => {
  it('the lawyer sends it: kept in the client’s Drive, frozen, emailed with the PDF to whoever sees the whole company', () => {
    const w = createWorld();
    const res = send(w, ID.abogado);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data.enviadoA).toEqual(WHOLE_CLIENT_A);
    expect(res.data.emailError).toBeUndefined();
    expect(res.data.row).toMatchObject({ id: ID.repBorrador, estado: 'ENVIADO' });

    const stored = w.row('Reportes', ID.repBorrador);
    expect(stored).toMatchObject({
      estado: 'ENVIADO',
      enviadoA: WHOLE_CLIENT_A,
      enviadoPor: ID.abogado,
      // The summary the lawyer reviewed stays as it was.
      resumen: 'Borrador del resumen (ejemplo).',
    });
    const pdfId = text(stored ?? { id: '' }, 'pdfId') ?? '';
    expect(pathOf(w, pdfId)).toMatch(new RegExp(`^Clientes/${A} - .*/${REPORTS_FOLDER}$`));
    const file = w.google.files.get(pdfId);
    expect(file?.name).toBe('Reporte 2026-09 - Cliente Demo.pdf');

    // One email per person (nobody sees another's address), the PDF attached, replies to the lawyer.
    const mails = reportMails(w);
    expect(mails.map((m) => m.to).sort()).toEqual(WHOLE_CLIENT_A);
    for (const m of mails) {
      expect(m.subject).toBe('Reporte mensual · Cliente Demo · septiembre de 2026');
      expect(m.replyTo).toBe('abogado@despacho.example');
      expect(m.body).toContain('Borrador del resumen (ejemplo).');
      expect(m.body).toContain(`#/reportes/${A}/2026-09`);
      expect(m.attachments).toEqual([
        {
          name: 'Reporte 2026-09 - Cliente Demo.pdf',
          contentType: 'application/pdf',
          size: Buffer.from(PDF, 'base64').length,
          head: '%PDF-',
        },
      ]);
    }

    // The bell of each of them, and the log.
    expect(notices(w, 'REPORTE_ENVIADO').sort()).toEqual([
      [ID.cAdmin, 'septiembre de 2026', `/reportes/${A}/2026-09`],
      [ID.cLectura, 'septiembre de 2026', `/reportes/${A}/2026-09`],
    ]);
    expect(
      w
        .rows('Bitacora')
        .some((b) => b.accion === 'ENVIAR' && b.entidadId === ID.repBorrador && b.clienteId === A),
    ).toBe(true);
  });

  it('once sent nobody changes it, and a month goes out once', () => {
    const w = createWorld();
    expect(send(w, ID.socio).ok).toBe(true);

    const [edit] = new Device(w, ID.abogado).push([
      op('Reportes', 'update', ID.repBorrador, { resumen: 'Otro texto' }),
    ]);
    expect(edit).toMatchObject({ status: 'rejected', reason: 'FROZEN' });
    expect(failure(send(w, ID.abogado))).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'ALREADY_SENT' },
    });

    // A second draft of the same month (another device, another id) cannot go out either.
    const twin = uid(0xfa1);
    const [created] = new Device(w, ID.asistente).push([
      op('Reportes', 'create', twin, { clienteId: A, periodo: '2026-09' }),
    ]);
    expect(created).toMatchObject({ status: 'applied' });
    expect(failure(send(w, ID.abogado, twin))).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'ALREADY_SENT' },
    });
    expect(reportMails(w)).toHaveLength(2);
  });

  it('only the partners and the client’s lawyers send; an assistant prepares, the client cannot', () => {
    const w = createWorld();
    expect(failure(send(w, ID.asistente))).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'ROLE' },
    });
    // A draft is not the client's to see, nor another lawyer's.
    for (const who of [ID.cAdmin, ID.cLectura, ID.abogadoB, ID.cB]) {
      expect(failure(send(w, who)).code).toBe('NOT_FOUND');
    }
    expect(w.row('Reportes', ID.repBorrador)?.estado).toBe('BORRADOR');
    expect(reportMails(w)).toHaveLength(0);
  });

  it('takes only a PDF, and a refused send leaves nothing behind', () => {
    const w = createWorld();
    const files = w.google.files.size;
    const notPdf = Buffer.from('<html>no es un PDF</html>').toString('base64');
    expect(failure(send(w, ID.abogado, ID.repBorrador, notPdf))).toMatchObject({
      code: 'VALIDATION',
      details: { reason: 'NOT_PDF' },
    });
    expect(failure(send(w, ID.asistente)).code).toBe('FORBIDDEN');
    expect(w.google.files.size).toBe(files);
    expect(w.row('Reportes', ID.repBorrador)?.estado).toBe('BORRADOR');
  });

  it('with nobody yet seeing the whole company it is kept as sent, and the lawyer hears no email went', () => {
    const w = createWorld();
    w.edit('Usuarios', ID.cAdmin, { estado: 'INACTIVO' });
    w.edit('Usuarios', ID.cLectura, { estado: 'INACTIVO' });
    const res = send(w, ID.abogado);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data).toMatchObject({ enviadoA: [], emailError: 'NO_RECIPIENTS' });
    expect(w.row('Reportes', ID.repBorrador)?.estado).toBe('ENVIADO');
    expect(reportMails(w)).toHaveLength(0);
  });

  it('when the day’s emails ran out it is sent all the same; the bell tells them', () => {
    const w = createWorld();
    w.google.mail.quota = 0;
    const res = send(w, ID.abogado);
    if (!res.ok) throw new Error(res.error.message);
    expect(res.data).toMatchObject({ enviadoA: [], emailError: 'QUOTA' });
    expect(w.row('Reportes', ID.repBorrador)).toMatchObject({
      estado: 'ENVIADO',
      enviadoA: WHOLE_CLIENT_A,
    });
    expect(notices(w, 'REPORTE_ENVIADO')).toHaveLength(2);
  });
});

describe('downloading a sent report', () => {
  it('the users of the whole company and the firm download it; a unit’s user and another client do not', () => {
    const w = createWorld();
    for (const who of [ID.cAdmin, ID.cLectura, ID.abogado, ID.socio]) {
      const res = download(w, who, ID.repEnviado);
      if (!res.ok) throw new Error(`${who}: ${res.error.message}`);
      expect(res.data.nombre).toBe('Reporte 2026-08 - Cliente Demo.pdf');
      expect(res.data.mimeType).toBe('application/pdf');
      expect(Buffer.from(res.data.base64, 'base64').toString('latin1')).toMatch(/^%PDF-1\.4/);
    }
    for (const who of [ID.cColab, ID.cAdminSur, ID.cB, ID.abogadoB]) {
      expect(failure(download(w, who, ID.repEnviado)).code).toBe('NOT_FOUND');
    }
  });

  it('a draft has no PDF yet', () => {
    const w = createWorld();
    expect(failure(download(w, ID.abogado, ID.repBorrador))).toMatchObject({
      code: 'NOT_FOUND',
      details: { reason: 'NOT_UPLOADED' },
    });
  });
});

describe('the first of the month', () => {
  it('each client’s lawyer hears last month’s report is ready, once', () => {
    const w = createWorld();
    w.clock.set('2026-11-01T03:00:00.000-05:00');
    expect(runNightly(w.env).reportNotices).toBe(2);
    expect(notices(w, 'REPORTE_POR_PREPARAR').sort()).toEqual(
      [
        [ID.abogado, 'Cliente Demo · octubre de 2026', `/reportes/${A}/2026-10`],
        [
          ID.abogadoB,
          'Cliente Prueba Dos, S.A. de C.V. · octubre de 2026',
          `/reportes/${B}/2026-10`,
        ],
      ].sort(),
    );
    // The same night again (a retry), or any other day: nothing new.
    expect(runNightly(w.env).reportNotices).toBe(0);
    w.clock.set('2026-11-02T03:00:00.000-05:00');
    expect(runNightly(w.env).reportNotices).toBe(0);
  });

  it('not for a report already sent nor a client that started later; without a lawyer, the partners', () => {
    const w = createWorld();
    w.edit('Clientes', B, { abogadoResponsableId: null });
    // August's report of client A went out already.
    w.clock.set('2026-09-01T03:00:00.000-05:00');
    expect(runNightly(w.env).reportNotices).toBe(1);
    expect(notices(w, 'REPORTE_POR_PREPARAR')).toEqual([
      [ID.socio, 'Cliente Prueba Dos, S.A. de C.V. · agosto de 2026', `/reportes/${B}/2026-08`],
    ]);

    w.edit('Clientes', B, { fechaInicio: '2026-10-15' });
    w.clock.set('2026-10-01T03:00:00.000-05:00');
    runNightly(w.env);
    expect(
      notices(w, 'REPORTE_POR_PREPARAR').filter(([, , link]) => link === `/reportes/${B}/2026-09`),
    ).toEqual([]);
    expect(
      notices(w, 'REPORTE_POR_PREPARAR').filter(([, , link]) => link === `/reportes/${A}/2026-09`),
    ).toEqual([[ID.abogado, 'Cliente Demo · septiembre de 2026', `/reportes/${A}/2026-09`]]);
  });
});
