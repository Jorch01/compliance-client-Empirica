import { describe, expect, it } from 'vitest';
import { ApiCallError } from '../../api/client.ts';
import { i18n } from '../../i18n/index.ts';
import type { Me } from '../../session/context.ts';
import { aiErrorText, aiOn } from '../common/ai.ts';
import { maySendReport, reportFileName, shiftPeriod } from './reports.ts';

const me = (clients: Partial<Me['clients'][number]>[]): Me => ({
  id: 'u',
  name: 'Abogado Demo',
  email: 'abogado@despacho.example',
  lado: 'EMPIRICA',
  rolBase: 'ABOGADO',
  isAdmin: false,
  isFirm: true,
  config: {},
  clients: clients.map((c, i) => ({
    id: `c${String(i)}`,
    razonSocial: 'Cliente Demo, S.A. de C.V.',
    nombreComercial: null,
    rol: 'ABOGADO',
    alcance: null,
    ia: true,
    ...c,
  })),
});

describe('the report screens', () => {
  it('move between months across the year', () => {
    expect(shiftPeriod('2026-09', -1)).toBe('2026-08');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
  });

  it('name the PDF as the server names it in Drive', () => {
    expect(reportFileName('2026-09', 'Cliente Demo', 'es')).toBe(
      'Reporte 2026-09 - Cliente Demo.pdf',
    );
    expect(reportFileName('2026-09', 'A/B: "C"', 'en')).toBe('Report 2026-09 - AB C.pdf');
  });

  it('let the client’s lawyers and the partners send; an assistant prepares', () => {
    expect(maySendReport(me([{ rol: 'ABOGADO' }]), 'c0')).toBe(true);
    expect(maySendReport(me([{ rol: 'SOCIO_ADMIN' }]), 'c0')).toBe(true);
    expect(maySendReport(me([{ rol: 'ASISTENTE' }]), 'c0')).toBe(false);
    expect(maySendReport(me([{ rol: 'ABOGADO' }]), 'otro')).toBe(false);
  });
});

describe('the AI helpers on screen', () => {
  it('show only where the AI is on', () => {
    const user = me([{ ia: false }, { ia: true }]);
    expect(aiOn(user, 'c0')).toBe(false);
    expect(aiOn(user, 'c1')).toBe(true);
    expect(aiOn(user, null)).toBe(true);
    expect(aiOn(me([{ ia: false }]), null)).toBe(false);
  });

  it('say why the AI could not answer, in the user’s words', () => {
    const t = i18n.getFixedT('es');
    expect(aiErrorText(t, new ApiCallError('QUOTA_EXHAUSTED', 'x', { reason: 'AI_QUOTA' }))).toBe(
      'Se acabaron por hoy las consultas a la IA. Vuelven mañana.',
    );
    expect(aiErrorText(t, new ApiCallError('FORBIDDEN', 'x', { reason: 'AI_OFF' }))).toBe(
      'La IA está apagada para este cliente.',
    );
    expect(aiErrorText(t, new ApiCallError('FORBIDDEN', 'x'))).toBe(
      'No tienes permiso para esta acción.',
    );
  });
});
