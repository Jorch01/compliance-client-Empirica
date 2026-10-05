import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import { RECORD_PATH, agendaTitle, type AgendaItem } from '@empirica/shared';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { relativeDay } from '../domain/dashboard.ts';
import { currentLanguage, formatDate, formatDayHeading, formatTimeRange } from '../i18n/index.ts';
import { useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { Icon } from '../ui/Icon.tsx';
import { InfoButton } from '../ui/InfoButton.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { AppointmentForm } from './agenda/AppointmentForm.tsx';
import { CalendarLinks } from './agenda/CalendarLinks.tsx';
import { groupAgenda, useAgenda, type AgendaFilter } from './agenda/agenda.ts';
import { InternalMark } from './common/VisibilityField.tsx';

/** One line of the agenda: when, what (it opens its page), whose, and what to mind. */
function AgendaLine({
  item,
  today,
  overdue = false,
}: {
  item: AgendaItem;
  today: string;
  overdue?: boolean;
}) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const lang = currentLanguage() === 'en' ? 'en' : 'es';
  const href =
    item.table === 'Eventos' ? `/agenda/${item.id}` : `${RECORD_PATH[item.table]}/${item.id}`;
  const when = overdue ? (
    <>
      <time dateTime={item.date} className="block">
        {formatDate(item.date)}
      </time>
      <span className="block">
        {t('common.daysAgo', { count: relativeDay(item.date, today).count })}
      </span>
    </>
  ) : item.start ? (
    formatTimeRange(item.start, item.end)
  ) : (
    t('agenda.allDay')
  );
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
      <span className="w-36 shrink-0 text-sm text-muted-foreground tabular-nums">{when}</span>
      <div className="min-w-0 flex-1 basis-48">
        <p>
          <Icon
            name={item.tipo === 'VENCIMIENTO' ? 'clock' : 'calendar'}
            className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground"
          />
          <Link href={href} className="font-medium underline-offset-2 hover:underline">
            {agendaTitle(item, lang)}
          </Link>
          {me.isFirm && item.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {[scope.clientId ? null : names.client(item.clienteId), names.unit(item.entidadId)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {item.fatal || item.enRevision ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {item.fatal ? <StatusBadge tone="danger">{t('agenda.fatal')}</StatusBadge> : null}
          {item.enRevision ? <StatusBadge tone="info">{t('agenda.inReview')}</StatusBadge> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * "Agenda": every deadline and appointment in view, overdue first and then
 * day by day, from what this device holds. The firm writes appointments
 * here; everyone takes their agenda to their own calendar app.
 */
export function AgendaPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { items, today } = useAgenda();
  const eventos = useScopedRows('Eventos');
  const [filter, setFilter] = useState<AgendaFilter>('all');
  const [creating, setCreating] = useState(false);
  const grouped = useMemo(
    () => (items ? groupAgenda(items, today, filter) : null),
    [items, today, filter],
  );
  const opened = id ? (eventos?.find((e) => e.id === id) ?? null) : null;
  const canCreate = clients.some((c) => can(me, 'Eventos', 'create', c.id));
  const nothing = grouped && !grouped.overdue.length && !grouped.days.length;

  return (
    <>
      <PageHeader
        title={t('agenda.title')}
        actions={
          canCreate ? (
            <Button
              icon="plus"
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('agenda.newAppointment')}
            </Button>
          ) : null
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('agenda.intro')}</p>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <FilterButtons
              label={t('agenda.filterLabel')}
              value={filter}
              options={[
                { value: 'all', label: t('agenda.filters.all') },
                { value: 'deadlines', label: t('agenda.filters.deadlines') },
                { value: 'appointments', label: t('agenda.filters.appointments') },
              ]}
              onChange={setFilter}
            />
            <InfoButton
              content={{
                title: t('agenda.info.title'),
                purpose: t('agenda.info.purpose'),
                howToRead: t('agenda.info.howToRead', { returnObjects: true }),
                example: t('agenda.info.example'),
              }}
            />
          </div>
          {nothing ? <EmptyState icon="calendar" title={t('agenda.empty')} /> : null}
          {grouped?.overdue.length ? (
            <section aria-labelledby="agenda-overdue" className="mb-6">
              <h2
                id="agenda-overdue"
                className="flex items-center gap-2 text-lg font-semibold text-danger-subtle-foreground"
              >
                <Icon name="alert" className="size-5" />
                {t('agenda.overdue', { count: grouped.overdue.length })}
              </h2>
              <ul className="divide-y divide-border">
                {grouped.overdue.map((item) => (
                  <AgendaLine key={item.key} item={item} today={today} overdue />
                ))}
              </ul>
            </section>
          ) : null}
          {grouped?.days.map((day) => (
            <section key={day.date} aria-labelledby={`agenda-${day.date}`} className="mb-6">
              <h2
                id={`agenda-${day.date}`}
                className="text-lg font-semibold first-letter:uppercase"
              >
                {day.date === today ? `${t('common.today')} · ` : ''}
                {formatDayHeading(day.date)}
              </h2>
              <ul className="divide-y divide-border">
                {day.items.map((item) => (
                  <AgendaLine key={item.key} item={item} today={today} />
                ))}
              </ul>
            </section>
          ))}
        </Card>
        <CalendarLinks />
      </div>
      {creating ? (
        <AppointmentForm
          row={null}
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
      {opened ? (
        <AppointmentForm
          key={opened.id}
          row={opened}
          onClose={() => {
            navigate('/agenda');
          }}
        />
      ) : null}
    </>
  );
}
