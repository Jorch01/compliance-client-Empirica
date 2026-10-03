import { TABLES, TABLE_NAMES, allColumns } from '@empirica/shared';
import { describe, expect, it } from 'vitest';
import { runDailyBackup, BACKUPS_KEPT } from './backup.ts';
import { purgeAppliedOps, runNightly } from './maintenance.ts';
import { Device, op } from './testing/device.ts';
import { ID } from '@empirica/shared/testing';
import { CONFIG_DEFAULTS } from './config.ts';
import { PROP } from './env.ts';
import { runSetup } from './setup.ts';
import { createWorld } from './testing/harness.ts';

describe('setup()', () => {
  const w = createWorld({
    data: null,
    adminEmails: 'Socia@Despacho.example, socio@despacho.example',
  });

  it('creates the spreadsheet with one tab per table and its headers', () => {
    const ss = w.google.spreadsheet();
    expect(ss.getSheets().map((s) => s.getName())).toEqual([...TABLE_NAMES]);
    for (const name of TABLE_NAMES) {
      const sheet = w.google.sheet(name);
      expect(sheet.grid[0]).toEqual(allColumns(TABLES[name]).map((c) => c.name));
      expect(sheet.frozenRows).toBe(1);
      expect(sheet.protections).toHaveLength(1);
      expect(sheet.protections[0]?.warningOnly).toBe(true);
    }
  });

  it('formats text columns as text and offers the closed lists', () => {
    const sheet = w.google.sheet('Tareas');
    const header = sheet.grid[0] ?? [];
    expect(sheet.formats.get(header.indexOf('titulo') + 1)).toBe('@');
    expect(sheet.validations.get(header.indexOf('estado') + 1)).toMatchObject({
      values: TABLES.Tareas.columns.find((c) => c.name === 'estado')?.values,
      allowInvalid: true,
    });
  });

  it('creates the Drive folders and keeps their ids', () => {
    for (const key of [PROP.rootFolderId, PROP.clientsFolderId, PROP.backupsFolderId]) {
      expect(w.google.folders.has(w.google.props.get(key) ?? '')).toBe(true);
    }
    const file = w.google.files.get(w.google.props.get(PROP.spreadsheetId) ?? '');
    expect(file?.parent?.id).toBe(w.google.props.get(PROP.rootFolderId));
  });

  it('creates the partners as SOCIO_ADMIN, the default settings and the backup trigger', () => {
    expect(w.rows('Usuarios').map((u) => [u.email, u.rolBase, u.estado, u.lado])).toEqual([
      ['socia@despacho.example', 'SOCIO_ADMIN', 'ACTIVO', 'EMPIRICA'],
      ['socio@despacho.example', 'SOCIO_ADMIN', 'ACTIVO', 'EMPIRICA'],
    ]);
    expect(w.rows('Config').map((c) => c.clave)).toEqual(CONFIG_DEFAULTS.map((d) => d.clave));
    expect(w.google.triggers).toEqual([{ handler: 'nightly', hour: 3 }]);
  });

  it('is idempotent: a second run creates nothing', () => {
    const again = runSetup(w.env);
    expect(again.created).toEqual([]);
    expect(w.rows('Usuarios')).toHaveLength(2);
    expect(w.google.triggers).toHaveLength(1);
  });

  it('adds a column the code needs without touching the others', () => {
    const v = createWorld({ data: null });
    const sheet = v.google.sheet('Tareas');
    const header = sheet.grid[0] ?? [];
    // An old sheet without the last column, plus a column someone added by hand.
    header.splice(header.length - 1, 1, 'notaManual');
    const report = runSetup(v.env);
    expect(report.created).toEqual(['columnas alcanceHist en Tareas']);
    expect(sheet.grid[0]?.slice(-2)).toEqual(['notaManual', 'alcanceHist']);
  });

  it('warns when there is no administrator configured', () => {
    expect(createWorld({ data: null }).setupReport.warnings.join(' ')).toContain('ADMIN_EMAILS');
  });

  it('confirms that sign-in will work: both Firebase properties and a server key that works', () => {
    expect(w.setupReport.checked).toEqual([
      `Firebase: proyecto ${w.google.firebase.projectId}; la key del servidor funciona.`,
    ]);
    expect(w.setupReport.warnings.join(' ')).not.toMatch(/FIREBASE/);
  });

  it('says which Firebase property is missing', () => {
    const v = createWorld({ data: null });
    v.google.props.delete(PROP.firebaseApiKey);
    const report = runSetup(v.env);
    expect(report.checked).toEqual([]);
    expect(report.warnings.join(' ')).toContain(
      'Falta FIREBASE_SERVER_API_KEY en Script Properties',
    );
  });

  it('tells a key that does not work (the browser one, say) without writing it in the log', () => {
    const v = createWorld({ data: null });
    const wrongKey = `AIza${'x'.repeat(35)}`;
    v.google.props.set(PROP.firebaseApiKey, wrongKey);
    const report = runSetup(v.env);
    const warnings = report.warnings.join(' ');
    expect(warnings).toContain(
      'FIREBASE_SERVER_API_KEY no funciona con Identity Toolkit (400: API key not valid.)',
    );
    expect(warnings).not.toContain(wrongKey);
    expect(report.checked).toEqual([]);

    v.google.props.set(PROP.firebaseApiKey, v.google.firebase.apiKey);
    v.google.firebase.failWith = 503;
    expect(runSetup(v.env).warnings.join(' ')).toContain('(503: BACKEND_ERROR)');
  });
});

describe('daily backup', () => {
  it('copies the spreadsheet and keeps the 30 most recent copies', () => {
    const w = createWorld({ data: null });
    const folder = w.google.props.get(PROP.backupsFolderId);
    for (let day = 0; day < BACKUPS_KEPT + 2; day++) {
      runDailyBackup(w.env);
      w.clock.advance(24 * 3600_000);
    }
    const copies = [...w.google.files.values()].filter((f) => f.parent?.id === folder);
    expect(copies).toHaveLength(BACKUPS_KEPT + 2);
    expect(copies.filter((f) => !f.trashed)).toHaveLength(BACKUPS_KEPT);
    expect(copies.filter((f) => f.trashed).map((f) => f.name)).toEqual([
      'EMPIRICA_PORTAL_DB respaldo 2026-10-02',
      'EMPIRICA_PORTAL_DB respaldo 2026-10-03',
    ]);
  });
});

describe('nightly cleanup', () => {
  it('forgets applied operations older than twice the offline limit, and only those', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab);
    const old = op('Tareas', 'update', ID.tNorte1, { estado: 'EN_CURSO' });
    colab.push([old]);
    w.clock.advance(20 * 86_400_000);
    const recent = op('Tareas', 'update', ID.tNorte1, { estado: 'EN_REVISION' });
    colab.push([recent]);
    w.clock.advance(10 * 86_400_000); // the first one is now 30 days old (> 2 × 14)
    expect(purgeAppliedOps(w.env)).toBe(1);
    expect(w.rows('OpsAplicadas').map((r) => r.opId)).toEqual([recent.opId]);
    expect(w.google.sheet('OpsAplicadas').getLastRow()).toBe(2);
    // The one still remembered keeps being idempotent.
    expect(colab.push([recent])).toMatchObject([{ status: 'duplicate' }]);
  });

  it('runs the backup and the cleanup together', () => {
    const w = createWorld();
    expect(runNightly(w.env)).toMatchObject({
      backup: 'EMPIRICA_PORTAL_DB respaldo 2026-10-02',
      purgedOps: 0,
    });
  });
});
