import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarShareData, CalendarSubscribeData } from '@empirica/shared';
import { apiErrorText } from '../../i18n/errors.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { buttonClass } from '../../ui/button-class.ts';
import { Card } from '../../ui/Card.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { feedUrl, googleSubscribeUrl, webcalUrl } from './agenda.ts';

/**
 * "Mi calendario": the agenda in the person's own calendar app.
 * - The personal link (ICS): exactly what they may see, in Google, Outlook
 *   or Apple. Shown once; a new one replaces it.
 * - Google Calendar, at once: the firm's calendar for the firm, a client's
 *   calendar for users of the whole client.
 */
export function CalendarLinks() {
  const { t } = useTranslation();
  const { me, call } = usePortal();
  const { scope } = useScope();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'link' | 'revoke' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Google's page to add the shared calendar: a link, since a window opened
  // after the server answers would be taken for a pop-up.
  const [addUrl, setAddUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The client whose Google calendar this person may add: theirs, if they see all of it.
  const client = me.isFirm
    ? undefined
    : (me.clients.find((c) => c.id === scope.clientId) ??
      (me.clients.length === 1 ? me.clients[0] : undefined));
  const wholeClient = Boolean(client && !client.alcance);

  const run = async (kind: 'link' | 'revoke' | 'google'): Promise<void> => {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      if (kind === 'google') {
        const { data } = await call<CalendarShareData>(
          'calendar.share',
          me.isFirm || !client ? {} : { clienteId: client.id },
        );
        setAddUrl(data.addUrl);
        setNote(t('calendar.googleShared'));
        return;
      }
      const { data } = await call<CalendarSubscribeData>(
        'calendar.subscribe',
        kind === 'revoke' ? { revoke: true } : {},
      );
      setCopied(false);
      setUrl(data.token ? feedUrl(data.token) : null);
      if (kind === 'revoke') setNote(t('calendar.revoked'));
    } catch (e) {
      setError(apiErrorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (): Promise<void> => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card title={t('calendar.title')}>
      <div className="space-y-4 text-sm">
        <p>{t('calendar.intro')}</p>
        {url ? (
          <div className="space-y-3 rounded-card border border-success-border bg-success-subtle p-3 text-success-subtle-foreground">
            <p className="font-semibold">{t('calendar.linkReady')}</p>
            <label className="block">
              <span className="sr-only">{t('calendar.linkLabel')}</span>
              <input
                readOnly
                value={url}
                onFocus={(e) => {
                  e.target.select();
                }}
                className="w-full rounded-control border border-input bg-card px-3 py-2 text-foreground"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
                {copied ? t('common.copied') : t('calendar.copy')}
              </Button>
              <a
                href={googleSubscribeUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('secondary', 'sm')}
              >
                {t('calendar.addGoogle')}
              </a>
              <a href={webcalUrl(url)} className={buttonClass('secondary', 'sm')}>
                {t('calendar.addApple')}
              </a>
            </div>
            <p>{t('calendar.onlyOnce')}</p>
          </div>
        ) : (
          <Button icon="calendar" busy={busy === 'link'} onClick={() => void run('link')}>
            {t('calendar.createLink')}
          </Button>
        )}
        <details>
          <summary className="cursor-pointer font-medium">{t('calendar.howTo')}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t('calendar.howGoogle')}</li>
            <li>{t('calendar.howOutlook')}</li>
            <li>{t('calendar.howApple')}</li>
          </ul>
        </details>
        <Button
          variant="ghost"
          size="sm"
          icon="x"
          busy={busy === 'revoke'}
          onClick={() => void run('revoke')}
        >
          {t('calendar.revoke')}
        </Button>

        {me.isFirm || wholeClient ? (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="font-medium">
              {me.isFirm
                ? t('calendar.googleFirm')
                : t('calendar.googleClient', { client: clientName(client) })}
            </p>
            <p className="text-muted-foreground">
              {me.isFirm ? t('calendar.googleHintFirm') : t('calendar.googleHintClient')}
            </p>
            {addUrl ? (
              <a
                href={addUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('primary', 'md')}
              >
                {t('calendar.googleOpen')}
              </a>
            ) : (
              <Button
                variant="secondary"
                icon="share"
                busy={busy === 'google'}
                onClick={() => void run('google')}
              >
                {t('calendar.googleAdd')}
              </Button>
            )}
          </div>
        ) : client ? (
          <p className="flex items-start gap-2 border-t border-border pt-4 text-muted-foreground">
            <Icon name="info" className="mt-0.5 size-4" />
            {t('calendar.partialScope')}
          </p>
        ) : null}

        {note ? <p role="status">{note}</p> : null}
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-danger-subtle-foreground"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
