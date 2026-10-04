import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { TABLES, text, validateFields, type Value } from '@empirica/shared';
import { usePendingIds, useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { formatDate } from '../../i18n/index.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../../ui/Card.tsx';
import { TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';

/**
 * The days the firm marks as non-working: an obligation that moves and
 * falls on one (or on a weekend) is due the next working day. Nothing comes
 * preloaded; the administrator partners keep the list.
 */
export function NonWorkingDaysPage() {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const days = useRows('DiasInhabiles');
  const pending = usePendingIds('DiasInhabiles');
  const [year, setYear] = useState(() => Number(todayInCancun().slice(0, 4)));
  const [form, setForm] = useState({ fecha: '', descripcion: '', ambito: '' });
  const [error, setError] = useState<string | null>(null);
  const mayEdit = can(me, 'DiasInhabiles', 'create', null);
  const mayDelete = can(me, 'DiasInhabiles', 'delete', null);
  const shown = (days ?? [])
    .filter((d) => (text(d, 'fecha') ?? '').startsWith(String(year)))
    .sort((a, b) => (text(a, 'fecha') ?? '').localeCompare(text(b, 'fecha') ?? ''));

  const add = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const fields: Record<string, Value> = {
      fecha: form.fecha,
      descripcion: form.descripcion.trim() || null,
      ambito: form.ambito.trim() || null,
    };
    const check = validateFields(TABLES.DiasInhabiles, fields);
    if (!check.ok || !form.fecha) {
      setError(t('errors.VALIDATION'));
      return;
    }
    await engine.mutate('DiasInhabiles', 'create', crypto.randomUUID(), check.fields);
    setYear(Number(form.fecha.slice(0, 4)));
    setForm({ fecha: '', descripcion: '', ambito: '' });
  };

  return (
    <>
      <p className="mb-2">
        <Link
          href="/compliance"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronLeft" className="size-4" />
          {t('compliance.back')}
        </Link>
      </p>
      <PageHeader title={t('compliance.daysTitle')}>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('compliance.daysIntro')}</p>
        {mayEdit ? null : (
          <p className="mt-1 text-sm text-muted-foreground">{t('compliance.daysReadOnly')}</p>
        )}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title={String(year)}
            actions={
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="chevronLeft"
                  aria-label={t('compliance.prevYear')}
                  onClick={() => {
                    setYear((y) => y - 1);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="chevronRight"
                  aria-label={t('compliance.nextYear')}
                  onClick={() => {
                    setYear((y) => y + 1);
                  }}
                />
              </div>
            }
          >
            {shown.length === 0 ? (
              <EmptyState icon="calendar" title={t('compliance.daysEmpty', { year })} />
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <p className="min-w-0 flex-1 basis-56">
                      <span className="font-medium">{formatDate(text(d, 'fecha'))}</span>
                      {text(d, 'descripcion') ? ` · ${text(d, 'descripcion') ?? ''}` : ''}
                      {text(d, 'ambito') ? (
                        <span className="text-sm text-muted-foreground">
                          {' · '}
                          {text(d, 'ambito')}
                        </span>
                      ) : null}
                      {pending.has(d.id) ? (
                        <Icon
                          name="cloudOff"
                          className="ml-2 inline size-3.5 text-muted-foreground"
                          label={t('common.pendingSync')}
                        />
                      ) : null}
                    </p>
                    {mayDelete ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        aria-label={t('compliance.dayDelete', {
                          date: formatDate(text(d, 'fecha')),
                        })}
                        onClick={() => void engine.mutate('DiasInhabiles', 'delete', d.id)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {mayEdit ? (
          <Card title={t('compliance.dayAdd')}>
            <form className="space-y-4" onSubmit={(e) => void add(e)}>
              <TextField
                type="date"
                label={t('compliance.dayDate')}
                required
                value={form.fecha}
                onChange={(e) => {
                  setForm((f) => ({ ...f, fecha: e.target.value }));
                }}
              />
              <TextField
                label={t('compliance.dayDescription')}
                optional={t('common.optional')}
                maxLength={200}
                value={form.descripcion}
                onChange={(e) => {
                  setForm((f) => ({ ...f, descripcion: e.target.value }));
                }}
              />
              <TextField
                label={t('compliance.dayScope')}
                optional={t('common.optional')}
                hint={t('compliance.dayScopeHint')}
                maxLength={200}
                value={form.ambito}
                onChange={(e) => {
                  setForm((f) => ({ ...f, ambito: e.target.value }));
                }}
              />
              {error ? (
                <p role="alert" className="text-sm font-medium text-danger-subtle-foreground">
                  {error}
                </p>
              ) : null}
              <Button type="submit" icon="plus">
                {t('compliance.dayAdd')}
              </Button>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
