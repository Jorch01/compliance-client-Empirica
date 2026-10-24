import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { round2, shareTotal, text, type Share, type Value } from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { formatPercent, parseAmount } from './billing.ts';

interface Line {
  participanteId: string;
  porcentaje: string;
}

/**
 * The partners' split of a retainer or a charge: who takes what percentage.
 * It adds up to 100 %, or stays empty (a charge then uses its retainer's).
 */
export function SplitDialog({
  initial,
  canUseFee,
  onSave,
  onClose,
}: {
  initial: Share[];
  /** A charge of a retainer: it may go back to the retainer's split. */
  canUseFee: boolean;
  onSave: (reparto: Value) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const participantes = useRows('Participantes');
  const [lines, setLines] = useState<Line[]>(() =>
    initial.map((s) => ({ participanteId: s.participanteId, porcentaje: String(s.porcentaje) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = (participantes ?? []).filter(
    (p) => p.activo !== false || lines.some((l) => l.participanteId === p.id),
  );
  const nameOf = (id: string): string =>
    text(active.find((p) => p.id === id) ?? { id }, 'nombre') ?? '';
  const parsed: Share[] = lines.flatMap((l) => {
    const n = parseAmount(l.porcentaje);
    return l.participanteId && typeof n === 'number' && n > 0
      ? [{ participanteId: l.participanteId, porcentaje: n }]
      : [];
  });
  const sum = shareTotal(parsed);

  const save = async (reparto: Share[] | null): Promise<void> => {
    setError(null);
    if (reparto) {
      const ids = new Set(reparto.map((s) => s.participanteId));
      const complete = reparto.length === lines.length && ids.size === reparto.length;
      if (!complete || (reparto.length > 0 && Math.abs(shareTotal(reparto) - 100) > 0.001)) {
        setError(t('billing.split.must100'));
        return;
      }
    }
    setBusy(true);
    try {
      await onSave(
        reparto?.length
          ? reparto.map((s) => ({
              participanteId: s.participanteId,
              porcentaje: round2(s.porcentaje),
            }))
          : null,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      title={t('billing.split.dialogTitle')}
      footer={
        <>
          {canUseFee ? (
            <Button variant="ghost" onClick={() => void save(null)} disabled={busy}>
              {t('billing.split.useFee')}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button icon="check" busy={busy} onClick={() => void save(parsed)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('billing.split.intro')}</p>
        {canUseFee ? (
          <p className="text-sm text-muted-foreground">{t('billing.split.useFeeHint')}</p>
        ) : null}
        <ul className="space-y-3">
          {lines.map((line, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 basis-48 space-y-1.5">
                <span className="block text-sm font-medium">{t('billing.split.who')}</span>
                <select
                  className="w-full rounded-control border border-input bg-card px-3 py-2.5 text-foreground"
                  value={line.participanteId}
                  onChange={(e) => {
                    setLines((ls) =>
                      ls.map((l, k) => (k === i ? { ...l, participanteId: e.target.value } : l)),
                    );
                  }}
                >
                  <option value="">{t('billing.split.choose')}</option>
                  {active.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={lines.some((l, k) => k !== i && l.participanteId === p.id)}
                    >
                      {text(p, 'nombre')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28 space-y-1.5">
                <span className="block text-sm font-medium">
                  {t('billing.split.pct')}
                  <span className="sr-only">
                    {' '}
                    {t('billing.split.percentOf', { name: nameOf(line.participanteId) })}
                  </span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.01"
                  className="w-full rounded-control border border-input bg-card px-3 py-2.5 text-right text-foreground tabular-nums"
                  value={line.porcentaje}
                  onChange={(e) => {
                    setLines((ls) =>
                      ls.map((l, k) => (k === i ? { ...l, porcentaje: e.target.value } : l)),
                    );
                  }}
                />
              </label>
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
                onClick={() => {
                  setLines((ls) => ls.filter((_, k) => k !== i));
                }}
              >
                <Icon
                  name="trash"
                  label={t('billing.split.removeLine', {
                    name: nameOf(line.participanteId) || String(i + 1),
                  })}
                />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            onClick={() => {
              setLines((ls) => [...ls, { participanteId: '', porcentaje: '' }]);
            }}
          >
            {t('billing.split.add')}
          </Button>
          <p
            className={`text-sm font-medium tabular-nums ${
              lines.length && Math.abs(sum - 100) > 0.001 ? 'text-danger-subtle-foreground' : ''
            }`}
            aria-live="polite"
          >
            {t('billing.split.sum', { sum: formatPercent(sum).replace(' %', '') })}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
