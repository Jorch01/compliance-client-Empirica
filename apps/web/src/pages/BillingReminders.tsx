import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import {
  nextReminder,
  reminderRecipients,
  text,
  type Repeticion,
  type Row,
} from '@empirica/shared';
import { useNames } from '../data/names.ts';
import { formatDate } from '../i18n/index.ts';
import { useScope } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { BillingFrame } from './billing/BillingHeader.tsx';
import { ReminderForm } from './billing/ReminderForm.tsx';
import { chargeLabel, useBillingData } from './billing/billing.ts';

/**
 * "Recordatorios": what the bell will say about billing and when, and to
 * whom; new ones, about a client, a retainer or a charge. Overdue charges
 * warn on their own (the nightly job), and that is said here too.
 */
export function BillingRemindersPage() {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const data = useBillingData();
  const names = useNames();
  const { scope } = useScope();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  const list = useMemo(() => {
    if (!data) return [];
    return data.recordatorios
      .map((r) => ({ r, next: r.activo === false ? null : nextReminder(r, data.today) }))
      .sort(
        (a, b) =>
          (a.next ?? '9999').localeCompare(b.next ?? '9999') ||
          (text(a.r, 'titulo') ?? '').localeCompare(text(b.r, 'titulo') ?? '', 'es'),
      );
  }, [data]);

  const aboutOf = (r: Row): { label: string; href: string | null } | null => {
    if (!data) return null;
    const cobroId = text(r, 'cobroId');
    if (cobroId) {
      const c = data.charges.find((x) => x.id === cobroId);
      return c
        ? {
            label: t('billing.reminders.aboutCharge', { name: chargeLabel(c) }),
            href: `/cobranza/cobros/${c.id}`,
          }
        : null;
    }
    const fee = data.honorarios.find((h) => h.id === text(r, 'honorarioId'));
    return fee
      ? {
          label: t('billing.reminders.aboutFee', { name: text(fee, 'concepto') ?? '' }),
          href: '/cobranza/igualas',
        }
      : null;
  };

  return (
    <BillingFrame
      tab="reminders"
      title={t('billing.reminders.title')}
      intro={t('billing.reminders.intro')}
      actions={
        <Button
          icon="plus"
          onClick={() => {
            setEditing('new');
          }}
        >
          {t('billing.reminders.new')}
        </Button>
      }
    >
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">{t('billing.reminders.auto')}</p>
      <Card>
        {!data ? (
          <Spinner label={t('common.loading')} />
        ) : list.length === 0 ? (
          <EmptyState icon="bell" title={t('billing.reminders.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map(({ r, next }) => {
              const about = aboutOf(r);
              const own = me.isAdmin || r.createdBy === me.id;
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-medium">{text(r, 'titulo')}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        scope.clientId ? '' : names.client(text(r, 'clienteId')),
                        t(
                          `billing.reminders.repeats.${(text(r, 'repetir') ?? 'NO') as Repeticion}`,
                        ),
                        reminderRecipients(r)
                          .map((id) => names.user(id))
                          .filter(Boolean)
                          .join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {about ? (
                      <p className="mt-1 text-sm">
                        {about.href ? (
                          <Link
                            href={about.href}
                            className="text-link underline-offset-2 hover:underline"
                          >
                            {about.label}
                          </Link>
                        ) : (
                          about.label
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={r.activo === false ? 'neutral' : next ? 'info' : 'neutral'}>
                      {r.activo === false
                        ? t('billing.reminders.off')
                        : next
                          ? t('billing.reminders.next', { date: formatDate(next) })
                          : t('billing.reminders.done')}
                    </StatusBadge>
                    {own ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="pencil"
                          onClick={() => {
                            setEditing(r);
                          }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          onClick={() => {
                            setRemoving(r);
                          }}
                        >
                          {t('billing.reminders.remove')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing && data ? (
        <ReminderForm
          honorarios={data.honorarios}
          charges={data.charges}
          {...(editing === 'new' ? {} : { reminder: editing })}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={t('billing.reminders.remove')}
        confirmLabel={t('billing.reminders.remove')}
        danger
        onClose={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing) void engine.mutate('RecordatoriosCobro', 'delete', removing.id);
          setRemoving(null);
        }}
      >
        <p>
          {t('billing.reminders.removeConfirm', {
            name: removing ? (text(removing, 'titulo') ?? '') : '',
          })}
        </p>
      </ConfirmDialog>
    </BillingFrame>
  );
}
