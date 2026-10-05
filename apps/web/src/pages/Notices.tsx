import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { text, type NotificationKind, type Row } from '@empirica/shared';
import { apiErrorText } from '../i18n/errors.ts';
import { formatDateTime } from '../i18n/index.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { CheckboxField } from '../ui/Field.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import {
  isUnread,
  noticeKind,
  noticePath,
  useDigestPreference,
  useMyNotices,
} from './notices/notices.ts';

const KIND_ICON: Record<NotificationKind, IconName> = {
  TAREA_ASIGNADA: 'list',
  TAREA_EN_REVISION: 'checkCircle',
  EVIDENCIA_ENVIADA: 'clipboard',
  EVIDENCIA_VALIDADA: 'checkCircle',
  EVIDENCIA_RECHAZADA: 'alert',
  SOLICITUD_NUEVA: 'inbox',
  CONFLICTO: 'scale',
  INVITACION_POR_APROBAR: 'users',
  SUGERENCIA_RESPONDIDA: 'message',
  CALENDARIO_REVERTIDO: 'calendar',
  CUOTA_CORREO: 'mail',
  REPORTE_POR_PREPARAR: 'file',
  REPORTE_ENVIADO: 'file',
  IA_CUOTA: 'alert',
  IA_MODELO: 'info',
};

/** One notification: what happened, when, and the way to it (opening it marks it read). */
function NoticeItem({ notice }: { notice: Row }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [, navigate] = useLocation();
  const kind = noticeKind(notice);
  const message = text(notice, 'mensaje') ?? '';
  const words = kind ? t(`notices.kinds.${kind}`, { titulo: message }) : message;
  const path = noticePath(notice);
  const unread = isUnread(notice);
  const open = async (): Promise<void> => {
    if (unread) await engine.mutate('Notificaciones', 'update', notice.id, { leida: true });
    if (path) navigate(path);
  };
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon
        name={kind ? KIND_ICON[kind] : 'bell'}
        className={`mt-0.5 size-5 ${unread ? 'text-primary' : 'text-muted-foreground'}`}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => void open()}
          className={`text-left underline-offset-2 hover:underline ${unread ? 'font-semibold' : ''}`}
        >
          {words}
        </button>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(text(notice, 'createdAt'))}
          {unread ? ` · ${t('notices.unread')}` : ''}
        </p>
      </div>
    </li>
  );
}

/** The daily summary by email (D14): on unless the person turns it off. */
function DigestPreference() {
  const { t } = useTranslation();
  const { me, call, engine } = usePortal();
  const stored = useDigestPreference();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (next: boolean): Promise<void> => {
    setChosen(next);
    setBusy(true);
    setError(null);
    try {
      await call('profile.update', { resumenDiario: next });
      void engine.sync();
    } catch (e) {
      setChosen(null);
      setError(apiErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('notices.digestTitle')}>
      <CheckboxField
        label={t('notices.digestLabel')}
        hint={t('notices.digestHint', { hour: me.config.horaResumen ?? '7' })}
        checked={chosen ?? stored ?? true}
        disabled={busy || stored === undefined}
        onChange={(e) => void change(e.target.checked)}
      />
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground"
        >
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/** "Avisos": what the portal told this person, newest first, and the daily summary. */
export function NoticesPage() {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const notices = useMyNotices();
  const unread = (notices ?? []).filter(isUnread);
  return (
    <>
      <PageHeader
        title={t('notices.title')}
        actions={
          unread.length ? (
            <Button
              variant="secondary"
              icon="check"
              onClick={() => {
                for (const n of unread) {
                  void engine.mutate('Notificaciones', 'update', n.id, { leida: true });
                }
              }}
            >
              {t('notices.markAll')}
            </Button>
          ) : null
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('notices.intro')}</p>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {notices?.length ? (
            <ul className="divide-y divide-border">
              {notices.map((n) => (
                <NoticeItem key={n.id} notice={n} />
              ))}
            </ul>
          ) : (
            <EmptyState icon="bell" title={t('notices.empty')} />
          )}
        </Card>
        <DigestPreference />
      </div>
    </>
  );
}
