import { describe, expect, it } from 'vitest';
import type { AgendaItem } from './agenda.ts';
import { agendaDescription, agendaTitle, escapeText, foldLine, renderIcs } from './ics.ts';

const NOW = Date.parse('2026-10-04T12:00:00.000-05:00');
const PORTAL = 'https://portal.empirica.mx/';

const item = (fields: Partial<AgendaItem>): AgendaItem => ({
  key: 'Tareas:00000000-0000-4000-8000-000000000301',
  table: 'Tareas',
  id: '00000000-0000-4000-8000-000000000301',
  clienteId: 'c1',
  entidadId: null,
  visibilidad: 'COMPARTIDO',
  tipo: 'VENCIMIENTO',
  fatal: false,
  detalle: null,
  titulo: 'Contestar demanda',
  date: '2026-10-20',
  start: null,
  end: null,
  reminders: [7, 1],
  movable: false,
  enRevision: false,
  responsableId: null,
  periodo: null,
  ...fields,
});

const bytes = (s: string): number => Buffer.byteLength(s, 'utf8');
const unfold = (ics: string): string[] => ics.replace(/\r\n /g, '').split('\r\n');

describe('titles and descriptions', () => {
  it('says what kind of date it is, in Spanish or English', () => {
    expect(agendaTitle(item({}))).toBe('Vence: Contestar demanda');
    expect(agendaTitle(item({ fatal: true }))).toBe('Plazo fatal: Contestar demanda');
    expect(agendaTitle(item({ fatal: true }), 'en')).toBe('Fatal deadline: Contestar demanda');
    expect(agendaTitle(item({ table: 'Obligaciones', titulo: 'Declaración mensual' }))).toBe(
      'Cumplimiento: Declaración mensual',
    );
    expect(
      agendaTitle(item({ table: 'Contratos', detalle: 'aviso', titulo: 'Distribuidora' })),
    ).toBe('Último día para avisar: Distribuidora');
    expect(
      agendaTitle(
        item({ table: 'Tramites', detalle: 'proximaActuacion', titulo: 'Licencia' }),
        'en',
      ),
    ).toBe('Next step: Licencia');
  });

  it('keeps an appointment’s own name, and names the client when asked', () => {
    expect(
      agendaTitle(item({ table: 'Eventos', tipo: 'REUNION', titulo: 'Junta de consejo' })),
    ).toBe('Junta de consejo');
    expect(agendaTitle(item({}), 'es', 'Cliente Demo')).toBe(
      'Cliente Demo · Vence: Contestar demanda',
    );
  });

  it('tells the firm what the client does not see, and links the portal', () => {
    expect(
      agendaDescription(
        item({ visibilidad: 'INTERNO' }),
        PORTAL,
        'es',
        'Cliente Demo · Unidad Norte',
      ),
    ).toBe(
      'Vence · Cliente Demo · Unidad Norte\nInterno: el cliente no lo ve.\n' +
        'Abrir en el portal: https://portal.empirica.mx/#/tareas/00000000-0000-4000-8000-000000000301',
    );
  });
});

describe('the iCalendar text', () => {
  it('escapes what RFC 5545 reserves', () => {
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const line = `SUMMARY:${'Declaración anual de obligaciones fiscales ñandú '.repeat(4)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(bytes(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldLine('SHORT:ok')).toBe('SHORT:ok');
  });

  it('writes whole-day deadlines and timed appointments', () => {
    const ics = renderIcs({
      name: 'Empírica · Cliente Demo',
      now: NOW,
      portalUrl: PORTAL,
      items: [
        item({ fatal: true, reminders: [15, 1] }),
        item({
          key: 'Eventos:00000000-0000-4000-8000-000000000f01',
          table: 'Eventos',
          id: '00000000-0000-4000-8000-000000000f01',
          tipo: 'REUNION',
          titulo: 'Junta, con acta; y firmas',
          date: '2026-10-07',
          start: '2026-10-08T02:30:00.000Z',
          end: '2026-10-08T03:30:00.000Z',
          reminders: [1],
          movable: true,
        }),
      ],
    });
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    const lines = unfold(ics);
    expect(lines.slice(0, 6)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Empirica Legal Lab//Portal//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Empírica · Cliente Demo',
    ]);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines).toContain('UID:Tareas-00000000-0000-4000-8000-000000000301@portal.empirica.mx');
    expect(lines).toContain('DTSTAMP:20261004T170000Z');
    // A whole day ends the next day, exclusive.
    expect(lines).toContain('DTSTART;VALUE=DATE:20261020');
    expect(lines).toContain('DTEND;VALUE=DATE:20261021');
    expect(lines).toContain('SUMMARY:Plazo fatal: Contestar demanda');
    // Reminders at 9:00, 15 days and one day before.
    expect(lines).toContain('TRIGGER:-PT351H');
    expect(lines).toContain('TRIGGER:-PT15H');
    // The appointment, in UTC, reminded a day before at the same time.
    expect(lines).toContain('DTSTART:20261008T023000Z');
    expect(lines).toContain('DTEND:20261008T033000Z');
    expect(lines).toContain('SUMMARY:Junta\\, con acta\\; y firmas');
    expect(lines).toContain('TRIGGER:-P1D');
    expect(lines).toContain(
      'URL:https://portal.empirica.mx/#/agenda/00000000-0000-4000-8000-000000000f01',
    );
  });

  it('is a valid empty calendar without items', () => {
    const ics = renderIcs({ name: 'Vacío', now: NOW, portalUrl: PORTAL, items: [] });
    expect(unfold(ics).filter(Boolean).at(-1)).toBe('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
