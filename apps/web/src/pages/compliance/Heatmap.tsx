import { useTranslation } from 'react-i18next';
import { cellLevel, type MatrixCell, type MatrixRow, type PeriodState } from '@empirica/shared';
import { categoryLabel } from '../../i18n/labels.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { monthName, monthOfYear } from './compliance.ts';

/**
 * Steps of the sequential ramp (DISENO.md § 6) and the text that reads on
 * each one in both themes (packages/shared/src/brand/tokens.test.ts).
 */
const LEVEL_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-chart-seq-1 text-foreground',
  2: 'bg-chart-seq-3 text-foreground',
  3: 'bg-chart-seq-6 text-background',
  4: 'bg-chart-seq-7 text-background',
};
const NOTHING_DUE = 'bg-muted text-muted-foreground';

const STATES: readonly PeriodState[] = [
  'cumplido',
  'revision',
  'vencido',
  'porVencer',
  'pendiente',
];

/** What needs a look first in a cell: overdue, then in review, then due soon. */
function alertOf(cell: MatrixCell): IconName | null {
  if (cell.vencido) return 'alert';
  if (cell.revision) return 'info';
  if (cell.porVencer) return 'clock';
  return null;
}

function Cell({
  cell,
  categoria,
  onOpen,
}: {
  cell: MatrixCell;
  /** The row's name, as read out ("Fiscal"). */
  categoria: string;
  onOpen: (cell: MatrixCell) => void;
}) {
  const { t } = useTranslation();
  if (!cell.total) {
    return (
      <td className="p-0.5 text-center">
        <span className="sr-only">{t('compliance.cellNone')}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
      </td>
    );
  }
  const level = cellLevel(cell);
  const due = cell.cumplido + cell.revision + cell.vencido;
  const icon = alertOf(cell);
  const detail = STATES.filter((s) => cell[s] > 0)
    .map((s) => t(`compliance.counts.${s}`, { count: cell[s] }))
    .join(', ');
  return (
    <td className="p-0.5">
      <button
        type="button"
        onClick={() => {
          onOpen(cell);
        }}
        aria-label={t('compliance.cellLabel', {
          categoria,
          month: monthOfYear(cell.month),
          detail,
        })}
        className={`flex h-11 w-full min-w-12 items-center justify-center gap-1 rounded-control text-sm font-semibold tabular-nums hover:ring-2 hover:ring-ring ${
          level ? LEVEL_CLASS[level] : NOTHING_DUE
        }`}
      >
        {icon ? <Icon name={icon} className="size-3.5" /> : null}
        {level === null ? cell.total : `${String(cell.cumplido)}/${String(due)}`}
      </button>
    </td>
  );
}

/** The colors and icons of the matrix, in words. */
function Legend() {
  const { t } = useTranslation();
  const swatches: { className: string; label: string }[] = [
    { className: LEVEL_CLASS[4], label: t('compliance.legend.level4') },
    { className: LEVEL_CLASS[3], label: t('compliance.legend.level3') },
    { className: LEVEL_CLASS[2], label: t('compliance.legend.level2') },
    { className: LEVEL_CLASS[1], label: t('compliance.legend.level1') },
    { className: NOTHING_DUE, label: t('compliance.legend.none') },
  ];
  const icons: { icon: IconName; label: string }[] = [
    { icon: 'alert', label: t('compliance.legend.overdue') },
    { icon: 'info', label: t('compliance.legend.review') },
    { icon: 'clock', label: t('compliance.legend.soon') },
  ];
  return (
    <div className="mt-4 text-sm">
      <p className="label-caps text-muted-foreground">{t('compliance.legend.title')}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {swatches.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={`inline-block size-4 rounded-sm ${s.className}`} />
            {s.label}
          </li>
        ))}
        {icons.map((i) => (
          <li key={i.label} className="inline-flex items-center gap-1.5">
            <Icon name={i.icon} className="size-4 text-muted-foreground" />
            {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The compliance matrix: categories by months, each cell colored by the
 * share of what was due that was validated, with its numbers and an icon
 * for what needs a look. A cell opens its obligations.
 */
export function Heatmap({
  year,
  rows,
  totals,
  onOpen,
}: {
  year: number;
  rows: readonly MatrixRow[];
  totals: readonly MatrixCell[];
  /** A cell was chosen; `categoria` is null for the totals row. */
  onOpen: (cell: MatrixCell, categoria: string | null) => void;
}) {
  const { t } = useTranslation();
  const caption = t('compliance.matrixTitle', { year });
  const months = totals.map((c) => c.month);
  return (
    <>
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="-mx-5 overflow-x-auto px-5 pb-1"
      >
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-card py-2 pr-3 text-left font-medium text-muted-foreground"
              >
                {t('compliance.category')}
              </th>
              {months.map((month) => (
                <th
                  key={month}
                  scope="col"
                  className="px-0.5 py-2 text-center font-medium text-muted-foreground"
                >
                  <abbr title={monthOfYear(month)} className="no-underline">
                    {monthName(Number(month.slice(5)), 'short')}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = categoryLabel(t, row.categoria);
              return (
                <tr key={row.categoria}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-36 bg-card py-0.5 pr-3 text-left font-medium sm:w-52"
                  >
                    {label}
                  </th>
                  {row.cells.map((cell) => (
                    <Cell
                      key={cell.month}
                      cell={cell}
                      categoria={label}
                      onOpen={(c) => {
                        onOpen(c, row.categoria);
                      }}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
          {rows.length > 1 ? (
            <tfoot>
              <tr className="[&>*]:border-t [&>*]:border-border [&>*]:pt-1.5">
                <th scope="row" className="sticky left-0 z-10 bg-card pr-3 text-left font-semibold">
                  {t('compliance.total')}
                </th>
                {totals.map((cell) => (
                  <Cell
                    key={cell.month}
                    cell={cell}
                    categoria={t('compliance.total')}
                    onOpen={(c) => {
                      onOpen(c, null);
                    }}
                  />
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <Legend />
    </>
  );
}
