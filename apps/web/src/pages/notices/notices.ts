/**
 * The portal's bell, on the device: the person's notifications
 * (`Notificaciones`, only theirs reach it), newest first, and the way to the
 * page each one opens. Marking one read is an edit like any other: it works
 * offline and travels with the next sync.
 */
import { useMemo } from 'react';
import { isNotificationKind, text, type NotificationKind, type Row } from '@empirica/shared';
import { useRow, useRows } from '../../data/hooks.ts';
import { usePortal } from '../../session/context.ts';

const createdAt = (row: Row): string => text(row, 'createdAt') ?? '';

/** The signed-in person's notifications, newest first. */
export function useMyNotices(): Row[] | undefined {
  const { me } = usePortal();
  const rows = useRows('Notificaciones');
  return useMemo(
    () =>
      rows
        ?.filter((n) => !n.deleted && n.usuarioId === me.id)
        .sort((a, b) => createdAt(b).localeCompare(createdAt(a))),
    [rows, me.id],
  );
}

export const isUnread = (row: Row): boolean => row.leida !== true;

/** The page a notification opens ("/tareas/<id>"; older ones kept a leading "#"). */
export function noticePath(row: Row): string | null {
  const link = (text(row, 'link') ?? '').replace(/^#/, '');
  return link.startsWith('/') ? link : null;
}

export const noticeKind = (row: Row): NotificationKind | null =>
  isNotificationKind(row.tipo) ? row.tipo : null;

/** Whether the daily summary reaches this person (on unless they turned it off). */
export function useDigestPreference(): boolean | undefined {
  const { me } = usePortal();
  const user = useRow('Usuarios', me.id);
  if (user === undefined) return undefined;
  const prefs = user?.prefsNotificacion;
  return !(
    prefs &&
    typeof prefs === 'object' &&
    !Array.isArray(prefs) &&
    (prefs as Record<string, unknown>).resumenDiario === false
  );
}
