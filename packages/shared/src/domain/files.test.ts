import { describe, expect, it } from 'vitest';
import {
  FILE_ACCEPT,
  MAX_FILE_MB,
  base64Bytes,
  extensionOf,
  fileMimeType,
  maxFileBytes,
} from './files.ts';
import { progressOf } from './progress.ts';

describe('files the portal keeps', () => {
  it('decides the type by the extension, whatever its case', () => {
    expect(extensionOf('Contrato Final.PDF')).toBe('pdf');
    expect(fileMimeType('factura.xml')).toBe('application/xml');
    expect(fileMimeType('foto.HEIC')).toBe('image/heic');
    expect(extensionOf('sin-extension')).toBe('');
    expect(extensionOf('.oculto')).toBe('');
    expect(extensionOf('termina-en-punto.')).toBe('');
  });

  it('takes nothing a browser would run', () => {
    for (const name of ['a.html', 'a.htm', 'a.svg', 'a.js', 'a.exe', 'a.bat', 'a.xhtml', 'a']) {
      expect(fileMimeType(name)).toBeNull();
    }
    expect(FILE_ACCEPT.split(',')).toContain('.pdf');
    expect(FILE_ACCEPT).not.toContain('.html');
  });

  it('limits the size by Config, within what Apps Script carries', () => {
    expect(maxFileBytes(10)).toBe(10 * 1024 * 1024);
    expect(maxFileBytes(Number('no es número'))).toBe(10 * 1024 * 1024);
    expect(maxFileBytes(0)).toBe(10 * 1024 * 1024);
    expect(maxFileBytes(500)).toBe(MAX_FILE_MB * 1024 * 1024);
  });

  it('knows a base64 text’s size without decoding it', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'documento ficticio']) {
      expect(base64Bytes(Buffer.from(text).toString('base64'))).toBe(Buffer.byteLength(text));
    }
  });
});

describe('a matter’s progress', () => {
  const task = (estado: string, deleted: string | null = null) => ({
    id: estado,
    estado,
    deleted,
  });

  it('is the share of live tasks that are done', () => {
    expect(progressOf([])).toBeNull();
    expect(progressOf([task('HECHO'), task('EN_CURSO'), task('POR_HACER')])).toBe(33);
    expect(progressOf([task('HECHO'), task('EN_CURSO', '2026-10-01T00:00:00.000-05:00')])).toBe(
      100,
    );
    expect(progressOf([task('HECHO', '2026-10-01T00:00:00.000-05:00')])).toBeNull();
  });
});
