import { useTranslation } from 'react-i18next';
import type { Notice } from '../data/db.ts';
import { useNotices } from '../data/hooks.ts';
import { formatDateTime } from '../i18n/index.ts';
import { denialText, fieldLabel } from '../i18n/labels.ts';
import { usePortal } from '../session/context.ts';
import type { SyncStatus } from '../sync/engine.ts';
import { Button } from '../ui/Button.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { Popover } from '../ui/Popover.tsx';
import { useSyncStatus } from './sync-status.ts';

const LOOK: Record<SyncStatus['phase'], { icon: IconName; className: string }> = {
  idle: { icon: 'cloud', className: 'text-success' },
  syncing: { icon: 'refresh', className: 'animate-spin text-info' },
  offline: { icon: 'cloudOff', className: 'text-warning' },
  error: { icon: 'alert', className: 'text-danger' },
};

/** One line per change the server did not take, in the user's words. */
function NoticeLine({ notice }: { notice: Notice }) {
  const { t } = useTranslation();
  const field = fieldLabel(t, notice.fields?.[0] ?? '');
  const what =
    notice.kind === 'conflict'
      ? t('sync.reasons.conflict', { field })
      : notice.kind === 'superseded'
        ? t('sync.reasons.superseded', { field })
        : notice.kind === 'upload'
          ? t('sync.reasons.upload', { reason: denialText(t, notice.reason, notice.code) })
          : t('sync.reasons.rejected', { reason: denialText(t, notice.reason, notice.code) });
  return (
    <li className="rounded-control border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
      {notice.label ? <p className="font-medium">{notice.label}</p> : null}
      <p>{what}</p>
    </li>
  );
}

/**
 * Whether everything is sent, how many changes wait for the network, and
 * the changes the server did not apply. Always icon and text.
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const { engine, db } = usePortal();
  const status = useSyncStatus();
  const notices = useNotices();
  const look = LOOK[status.phase];
  const label =
    status.phase === 'idle'
      ? status.pending > 0
        ? t('sync.pending', { count: status.pending })
        : t('sync.synced')
      : t(`sync.${status.phase}`);

  return (
    <Popover
      className="w-80 sm:w-96"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          data-tour="sync"
          className="relative inline-flex min-h-11 items-center gap-2 rounded-control px-2.5 text-sm font-medium hover:bg-muted"
        >
          <Icon name={look.icon} className={`size-5 ${look.className}`} />
          <span className="max-sm:sr-only">{label}</span>
          {status.pending > 0 && status.phase !== 'idle' ? (
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
              {status.pending}
            </span>
          ) : null}
          {notices.length > 0 ? (
            <span className="absolute top-1.5 right-1 size-2.5 rounded-full bg-warning ring-2 ring-background">
              <span className="sr-only">{t('sync.noticesTitle')}</span>
            </span>
          ) : null}
        </button>
      )}
    >
      {() => (
        <div className="space-y-3">
          <h2 className="font-sans text-base font-semibold text-foreground">{t('sync.status')}</h2>
          <p className="flex items-center gap-2" role="status">
            <Icon name={look.icon} className={`size-5 ${look.className}`} />
            <span>{label}</span>
          </p>
          {status.pending > 0 && status.phase !== 'idle' ? (
            <p className="text-sm">{t('sync.pending', { count: status.pending })}</p>
          ) : null}
          {status.phase === 'offline' ? (
            <p className="text-sm text-muted-foreground">{t('sync.offlineHint')}</p>
          ) : null}
          {status.phase === 'error' && status.error ? (
            <p className="text-sm text-danger-subtle-foreground">{status.error.message}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {status.lastSyncAt
              ? t('sync.lastSync', { time: formatDateTime(status.lastSyncAt) })
              : t('sync.never')}
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            busy={status.phase === 'syncing'}
            onClick={() => void engine.sync()}
          >
            {t('sync.syncNow')}
          </Button>
          {notices.length > 0 ? (
            <section className="space-y-2 border-t border-border pt-3">
              <h3 className="font-sans text-sm font-semibold text-foreground">
                {t('sync.noticesTitle')}
              </h3>
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {notices.map((n) => (
                  <NoticeLine key={n.id} notice={n} />
                ))}
              </ul>
              <Button size="sm" variant="ghost" onClick={() => void db.notices.clear()}>
                {t('sync.dismiss')}
              </Button>
            </section>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
