import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MonthPoint, Moneda } from '@empirica/shared';
import { Button } from '../../ui/Button.tsx';
import { periodText } from '../reports/reports.ts';
import { formatCompact, formatMoney } from './billing.ts';
import { useWidth } from './use-width.ts';

const H = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 48 };
/** Columns are at most this wide; on a narrow screen they thin out. */
const BAR = 18;
const GAP = 2;

/** A column with its data end rounded (4 px) and square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

/** A clean top for the axis: 1, 2, 2.5 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

const SERIES = [
  { key: 'devengado', fill: 'fill-chart-1', swatch: 'bg-chart-1' },
  { key: 'cobrado', fill: 'fill-chart-2', swatch: 'bg-chart-2' },
] as const;

/**
 * Earned and collected, month by month: two columns a month, one axis, a
 * legend, the figures on hover, and the same numbers as a table for the
 * keyboard and screen readers.
 */
export function MonthlyChart({ points, moneda }: { points: MonthPoint[]; moneda: Moneda }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const tableId = useId();
  const { ref, width: W } = useWidth<HTMLDivElement>(640);
  const max = niceMax(Math.max(0, ...points.flatMap((p) => [p.devengado, p.cobrado])));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, points.length);
  const bar = Math.max(3, Math.min(BAR, (band - 6 - GAP) / 2));
  // Every month's name when it fits; else every other one.
  const labelEvery = band < 30 ? 2 : 1;
  const y = (v: number): number => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const total = (key: 'devengado' | 'cobrado'): number =>
    points.reduce((sum, p) => sum + p[key], 0);
  const first = points[0];
  const last = points[points.length - 1];
  const summary =
    first && last
      ? t('billing.chart.summary', {
          from: periodText(first.periodo),
          to: periodText(last.periodo),
          devengado: formatMoney(total('devengado'), moneda),
          cobrado: formatMoney(total('cobrado'), moneda),
        })
      : '';
  const shown = hover !== null ? points[hover] : undefined;

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-4 text-sm" aria-label={t('billing.chart.title')}>
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span className={`inline-block size-3 rounded-sm ${s.swatch}`} aria-hidden="true" />
            {t(`billing.chart.${s.key}`)}
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          className="block max-w-full"
          role="img"
          aria-label={summary}
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {formatCompact(v)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const group = 2 * bar + GAP;
            const x0 = PAD.left + i * band + (band - group) / 2;
            return (
              <g
                key={p.periodo}
                onPointerEnter={() => {
                  setHover(i);
                }}
              >
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill={hover === i ? undefined : 'transparent'}
                  className={hover === i ? 'fill-muted' : undefined}
                />
                {SERIES.map((s, k) => {
                  const v = p[s.key];
                  const top = y(v);
                  return (
                    <path
                      key={s.key}
                      d={columnPath(x0 + k * (bar + GAP), top, bar, PAD.top + plotH - top)}
                      className={s.fill}
                    />
                  );
                })}
                {i % labelEvery === (points.length - 1) % labelEvery ? (
                  <text
                    x={PAD.left + i * band + band / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {periodText(p.periodo).slice(0, 3)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {shown && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-control border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-raised"
            style={{ left: `${String(((PAD.left + (hover + 0.5) * band) / W) * 100)}%` }}
            aria-hidden="true"
          >
            <p className="font-medium">{periodText(shown.periodo)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2 tabular-nums">
                <span className={`inline-block size-2.5 rounded-sm ${s.swatch}`} />
                {t(`billing.chart.${s.key}`)}: {formatMoney(shown[s.key], moneda)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={table}
        aria-controls={tableId}
        onClick={() => {
          setTable((v) => !v);
        }}
      >
        {table ? t('billing.chart.hideTable') : t('billing.chart.showTable')}
      </Button>
      <div
        id={tableId}
        hidden={!table}
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={t('billing.chart.title')}
      >
        <table className="w-full text-sm">
          <caption className="sr-only">{t('billing.chart.title')}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('billing.chart.month')}
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                {t('billing.chart.devengado')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('billing.chart.cobrado')}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.periodo} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  {periodText(p.periodo)}
                </th>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatMoney(p.devengado, moneda)}
                </td>
                <td className="py-2 text-right tabular-nums">{formatMoney(p.cobrado, moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** A second line under the label. */
  detail?: string;
}

/**
 * One measure for a few rows, as horizontal bars: the label, the bar from
 * a common baseline and the amount in words beside it.
 */
export function BarList({ rows, moneda }: { rows: BarRow[]; moneda: Moneda }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="tabular-nums">{formatMoney(r.value, moneda)}</span>
          </div>
          {r.detail ? <p className="text-xs text-muted-foreground">{r.detail}</p> : null}
          <div className="mt-1 h-3 w-full rounded-r-sm bg-muted" aria-hidden="true">
            {r.value > 0 && max > 0 ? (
              <div
                className="h-3 rounded-r-sm bg-chart-1"
                style={{ width: `${String(Math.max(1, (r.value / max) * 100))}%` }}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
