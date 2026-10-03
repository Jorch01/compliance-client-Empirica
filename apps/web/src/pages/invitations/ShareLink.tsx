import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../i18n/index.ts';
import { Button } from '../../ui/Button.tsx';
import { buttonClass } from '../../ui/button-class.ts';
import { Icon } from '../../ui/Icon.tsx';
import { invitationLink } from './useInvitations.ts';

/**
 * The invitation link, shown once: copied, or sent from the user's own mail
 * (phase 2 sends no e-mail itself, decision D26).
 */
export function ShareLink({
  token,
  email,
  name,
  venceEn,
}: {
  token: string;
  email: string;
  name: string;
  venceEn: string | null;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = invitationLink(token);
  const date = formatDate(venceEn);
  const subject = t('invitations.emailSubject');
  const body = t('invitations.emailBody', { name, link, date });
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3 rounded-card border border-success-border bg-success-subtle p-4 text-success-subtle-foreground">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="checkCircle" className="size-5 text-success" />
        {t('invitations.linkTitle')}
      </p>
      <p className="text-sm">{t('invitations.linkBody', { name, date, email })}</p>
      <label className="block">
        <span className="sr-only">{t('invitations.linkLabel')}</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => {
            e.target.select();
          }}
          className="w-full rounded-control border border-input bg-card px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={copied ? 'check' : 'copy'} onClick={() => void copy()}>
          {copied ? t('common.copied') : t('invitations.copyLink')}
        </Button>
        <a href={mailto} className={buttonClass('secondary', 'sm')}>
          <Icon name="mail" className="size-4" />
          {t('invitations.sendEmail')}
        </a>
      </div>
    </div>
  );
}
