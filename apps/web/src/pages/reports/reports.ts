/**
 * What the report screens share: the month as text, moving between months,
 * whose the report is (who sends it, who receives it) and its file name.
 */
import { useMemo } from 'react';
import { periodLabel, seesWholeClient, text, type HealthBand, type Row } from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { currentLanguage } from '../../i18n/index.ts';
import type { Me } from '../../session/context.ts';
import type { Tone } from '../../ui/StatusBadge.tsx';
import type { ReportLang } from './doc.ts';

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The health band as the traffic light shows it: icon, color and word. */
export const BAND_TONE: Record<HealthBand, Tone> = {
  good: 'success',
  watch: 'warning',
  risk: 'danger',
};

/** "septiembre de 2026" in the interface's language. */
export const periodText = (periodo: string): string => periodLabel(periodo, currentLanguage());

/** The month `delta` months from "2026-09". */
export function shiftPeriod(periodo: string, delta: number): string {
  const [y = 0, m = 1] = periodo.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const langOf = (value: unknown): ReportLang => (value === 'en' ? 'en' : 'es');

/** The report's language: its own, else the client's, else Spanish. */
export const reportLang = (row: Row | null, cliente: Row): ReportLang =>
  langOf(row?.idioma ?? cliente.idioma);

/** Who sends a client's report: its lawyers and the partners (an assistant prepares it). */
export function maySendReport(me: Me, clienteId: string): boolean {
  const rol = me.clients.find((c) => c.id === clienteId)?.rol;
  return rol === 'SOCIO_ADMIN' || rol === 'ABOGADO';
}

/** The client's active users who see the whole company: who receives the report. */
export function useRecipients(clienteId: string): { email: string; name: string }[] {
  const users = useRows('Usuarios');
  const memberships = useRows('Membresias', clienteId);
  return useMemo(() => {
    const active = new Map(
      (users ?? [])
        .filter((u) => u.estado === 'ACTIVO' && u.lado === 'CLIENTE')
        .map((u) => [u.id, u]),
    );
    return (memberships ?? [])
      .filter((m) => m.estado === 'ACTIVA' && seesWholeClient({ rol: m.rol, alcance: m.alcance }))
      .flatMap((m) => {
        const user = active.get(text(m, 'usuarioId') ?? '');
        const email = user ? text(user, 'email') : null;
        return user && email ? [{ email, name: text(user, 'nombre') ?? email }] : [];
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [users, memberships]);
}

/** "Reporte 2026-09 - Cliente Demo.pdf", as the server names it in Drive. */
export function reportFileName(periodo: string, client: string, lang: ReportLang): string {
  const safe = client
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${lang === 'en' ? 'Report' : 'Reporte'} ${periodo}${safe ? ` - ${safe}` : ''}.pdf`;
}
