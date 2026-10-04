import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { text, type Alcance, type Row } from '@empirica/shared';
import { unitTree } from '../../domain/scope.ts';

/**
 * Which part of a client a person sees (decision D13): the whole company,
 * or some units (each with its branches). Someone limited to some units can
 * only give part of their own.
 */
export function ScopePicker({
  units,
  value,
  onChange,
  hubAllowed,
}: {
  units: readonly Row[];
  value: Alcance | null;
  onChange: (value: Alcance | null) => void;
  hubAllowed: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  const tree = unitTree(units);
  const hub = value === null;
  const chosen = new Set(value?.entidades ?? []);
  if (!tree.length) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('invitations.scope')}</legend>
      {hubAllowed ? (
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            className="size-4 accent-primary"
            checked={hub}
            onChange={() => {
              onChange(null);
            }}
          />
          {t('invitations.scopeHub')}
        </label>
      ) : null}
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          className="size-4 accent-primary"
          checked={!hub}
          onChange={() => {
            onChange({ entidades: [], asuntos: [] });
          }}
        />
        {t('invitations.scopeUnits')}
      </label>
      {!hub ? (
        <ul className="ml-6 space-y-1">
          {tree.map(({ row, depth }) => (
            <li key={row.id} style={{ paddingInlineStart: `${depth * 1.25}rem` }}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={chosen.has(row.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(row.id);
                    else next.delete(row.id);
                    onChange({ entidades: [...next], asuntos: value.asuntos });
                  }}
                />
                {text(row, 'nombre')}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
      {!hub ? <p className="text-sm text-muted-foreground">{t('invitations.unitsHint')}</p> : null}
    </fieldset>
  );
}
