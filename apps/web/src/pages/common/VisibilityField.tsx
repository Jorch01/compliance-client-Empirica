import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { VISIBILIDADES, type Visibilidad } from '@empirica/shared';
import { Icon } from '../../ui/Icon.tsx';

/** Who sees a record: the client too, or only the firm (D19). Firm screens only. */
export function VisibilityField({
  value,
  onChange,
  hint,
}: {
  value: Visibilidad;
  onChange: (value: Visibilidad) => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium">{t('visibility.label')}</legend>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {VISIBILIDADES.map((v) => (
          <label
            key={v}
            className={`flex cursor-pointer items-start gap-2 rounded-control border px-3 py-2.5 ${
              value === v ? 'border-primary bg-muted' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="mt-1 size-4 accent-primary"
              checked={value === v}
              onChange={() => {
                onChange(v);
              }}
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <Icon name={v === 'INTERNO' ? 'lock' : 'users'} className="size-4" />
                {t(`visibility.${v}`)}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t(`visibility.${v}_hint`)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "Interno" next to a title, for the firm: the client does not see it. */
export function InternalMark() {
  const { t } = useTranslation();
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-neutral-border bg-neutral-subtle px-2 py-0.5 align-middle text-xs font-medium text-neutral-subtle-foreground">
      <Icon name="lock" className="size-3.5" />
      {t('visibility.INTERNO')}
    </span>
  );
}
