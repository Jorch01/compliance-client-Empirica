import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { isUnread, useMyNotices } from '../pages/notices/notices.ts';
import { Icon } from '../ui/Icon.tsx';

/** The bell in the header: how many notifications wait, and the way to them. */
export function Bell() {
  const { t } = useTranslation();
  const notices = useMyNotices();
  const unread = (notices ?? []).filter(isUnread).length;
  const label = unread ? t('notices.bellUnread', { count: unread }) : t('notices.bell');
  return (
    <Link
      href="/avisos"
      aria-label={label}
      title={label}
      data-tour="bell"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-muted"
    >
      <Icon name="bell" />
      {unread ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs leading-5 font-semibold text-primary-foreground tabular-nums"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Link>
  );
}
