import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { Button } from '../../ui/Button.tsx';
import { Card, PageHeader } from '../../ui/Card.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { useBillingAccess } from './access.ts';
import './texts.ts';

export type BillingTab = 'board' | 'charges' | 'fees' | 'reminders' | 'participants';

const TABS: { key: BillingTab; href: string; icon: IconName }[] = [
  { key: 'board', href: '/cobranza', icon: 'activity' },
  { key: 'charges', href: '/cobranza/cobros', icon: 'list' },
  { key: 'fees', href: '/cobranza/igualas', icon: 'calendar' },
  { key: 'reminders', href: '/cobranza/recordatorios', icon: 'bell' },
  { key: 'participants', href: '/cobranza/participantes', icon: 'users' },
];

/** "¿Qué va aquí?" for billing: what goes in each tab, an example and what does not go here. */
function BillingGuide() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        icon="help"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('billing.guide.button')}
      </Button>
      <Dialog
        open={open}
        size="lg"
        onClose={() => {
          setOpen(false);
        }}
        title={t('billing.guide.title')}
        footer={
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            {t('billing.guide.close')}
          </Button>
        }
      >
        <div className="space-y-4">
          <section>
            <h3 className="label-caps text-muted-foreground">{t('billing.guide.purpose')}</h3>
            <p className="mt-1">{t('billing.guide.purposeText')}</p>
          </section>
          <section>
            <h3 className="label-caps text-muted-foreground">{t('billing.guide.sections')}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {t('billing.guide.items', { returnObjects: true }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label={t('billing.nav.label')}>
              {TABS.filter((tab) => tab.key !== 'board').map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    <Icon name={item.icon} className="size-4" />
                    {t(`billing.nav.${item.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="label-caps text-muted-foreground">{t('billing.guide.example')}</h3>
            <div className="mt-1 space-y-1 rounded-control border-l-4 border-accent-strong bg-accent px-3 py-2 text-accent-foreground">
              {t('billing.guide.exampleText', { returnObjects: true }).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </section>
          <section>
            <h3 className="label-caps text-muted-foreground">{t('billing.guide.notHere')}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {t('billing.guide.notHereItems', { returnObjects: true }).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
      </Dialog>
    </>
  );
}

/**
 * The top of every billing screen: its title, a line on what it holds, the
 * guide and the tabs. Whoever may not see billing gets only that.
 */
export function BillingFrame({
  tab,
  title,
  intro,
  actions,
  children,
}: {
  tab: BillingTab;
  title: string;
  intro: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const allowed = useBillingAccess();
  if (!allowed) {
    return (
      <>
        <PageHeader title={t('billing.title')} />
        <Card>
          <p className="flex items-center gap-2">
            <Icon name="lock" className="size-5 text-muted-foreground" />
            {t('billing.noAccess')}
          </p>
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={tab === 'board' ? undefined : t('billing.title')}
        title={title}
        actions={actions}
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p>
        <div className="mt-2">
          <BillingGuide />
        </div>
      </PageHeader>
      <nav aria-label={t('billing.nav.label')} className="mb-6 -mt-2">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((item) => {
            const current = item.key === tab;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-medium ${
                    current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <Icon name={item.icon} className="size-4" />
                  {t(`billing.nav.${item.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </>
  );
}

const TONES = {
  danger: 'border-danger-border bg-danger-subtle text-danger-subtle-foreground',
  neutral: 'border-border bg-card text-card-foreground',
} as const;

/** A figure of the dashboard: an amount, its words and, when there is something to see, its tone. */
export function MoneyTile({
  label,
  value,
  hint,
  icon,
  alert = false,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
  alert?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <Icon name={icon} className={`size-6 ${alert ? 'text-danger' : 'text-muted-foreground'}`} />
        {href ? <Icon name="chevronRight" className="size-4 opacity-60" /> : null}
      </span>
      <span className="mt-3 block text-2xl font-semibold sm:text-3xl">{value}</span>
      <span className="mt-1 block text-sm font-medium">{label}</span>
      <span className="mt-1 block text-xs opacity-80">{hint}</span>
    </>
  );
  const className = `block w-full rounded-card border p-4 text-left shadow-subtle ${TONES[alert ? 'danger' : 'neutral']}`;
  return href ? (
    <Link href={href} className={`${className} transition-shadow hover:shadow-card`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
