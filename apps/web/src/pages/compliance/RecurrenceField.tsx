import { useTranslation } from 'react-i18next';
import { formatRecurrence, parseRecurrence, type Recurrence } from '@empirica/shared';
import { formatDate } from '../../i18n/index.ts';
import { SelectField } from '../../ui/Field.tsx';
import { monthName, nextDates } from './compliance.ts';

type Frequency = 'NONE' | 'MONTHLY' | 'YEARLY' | 'KEEP';

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * How an obligation repeats, in plain choices: once, every n months on a
 * day, or every n years on a day of a month. It writes the rule the
 * portal and a calendar read (RRULE). A rule written elsewhere that the
 * portal does not read is kept as is unless the person picks another.
 */
export function RecurrenceField({
  value,
  onChange,
  anchor,
  defaultDay,
}: {
  value: string | null;
  onChange: (rule: string | null) => void;
  /** The next due date, to show the dates that follow. */
  anchor: string;
  /** The day to start with when the obligation becomes recurring. */
  defaultDay: number;
}) {
  const { t } = useTranslation();
  const rule = parseRecurrence(value);
  const frequency: Frequency = !value ? 'NONE' : rule ? rule.freq : 'KEEP';
  const set = (change: Partial<Recurrence>): void => {
    if (rule) onChange(formatRecurrence({ ...rule, ...change }));
  };
  const day = defaultDay >= 1 && defaultDay <= 28 ? defaultDay : -1;
  const dates = rule && anchor ? nextDates(value, anchor, anchor, 3) : [];

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{t('compliance.frequency')}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('compliance.frequency')}
          value={frequency}
          onChange={(e) => {
            const next = e.target.value as Frequency;
            if (next === 'NONE') onChange(null);
            else if (next === 'MONTHLY')
              onChange(formatRecurrence({ freq: 'MONTHLY', interval: 1, day }));
            else if (next === 'YEARLY') {
              const month = Number(anchor.slice(5, 7)) || 1;
              onChange(formatRecurrence({ freq: 'YEARLY', interval: 1, day, month }));
            }
          }}
          options={[
            { value: 'NONE', label: t('compliance.frequencies.NONE') },
            { value: 'MONTHLY', label: t('compliance.frequencies.MONTHLY') },
            { value: 'YEARLY', label: t('compliance.frequencies.YEARLY') },
            ...(frequency === 'KEEP'
              ? [{ value: 'KEEP', label: t('compliance.rule.unknown') }]
              : []),
          ]}
        />
        {rule ? (
          <SelectField
            label={
              rule.freq === 'MONTHLY'
                ? t('compliance.intervalMonths')
                : t('compliance.intervalYears')
            }
            value={String(rule.interval)}
            onChange={(e) => {
              set({ interval: Number(e.target.value) });
            }}
            options={range(1, 12).map((n) => ({ value: String(n), label: String(n) }))}
          />
        ) : null}
        {rule?.freq === 'YEARLY' ? (
          <SelectField
            label={t('compliance.month')}
            value={String(rule.month ?? 1)}
            onChange={(e) => {
              set({ month: Number(e.target.value) });
            }}
            options={range(1, 12).map((m) => ({ value: String(m), label: monthName(m) }))}
          />
        ) : null}
        {rule ? (
          <SelectField
            label={t('compliance.day')}
            value={String(rule.day)}
            onChange={(e) => {
              set({ day: Number(e.target.value) });
            }}
            options={[
              ...range(1, 28).map((d) => ({ value: String(d), label: String(d) })),
              { value: '-1', label: t('compliance.lastDay') },
            ]}
          />
        ) : null}
      </div>
      {dates.length ? (
        <p className="text-sm text-muted-foreground">
          {t('compliance.preview', { dates: dates.map((d) => formatDate(d)).join(' · ') })}
        </p>
      ) : null}
    </fieldset>
  );
}
