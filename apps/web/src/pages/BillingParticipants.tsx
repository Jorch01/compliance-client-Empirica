import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { text, type Row, type TIPOS_PARTICIPANTE } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, Spinner } from '../ui/Card.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { BillingFrame } from './billing/BillingHeader.tsx';
import { ParticipantForm } from './billing/ParticipantForm.tsx';
import { formatPercent } from './billing/billing.ts';

/**
 * "Participantes": who takes part in the splits and the tax estimated on
 * their part. The partners add and change them, online; lawyers read them.
 */
export function BillingParticipantsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const rows = useRows('Participantes');
  const names = useNames();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const list = [...(rows ?? [])].sort(
    (a, b) =>
      (a.activo === false ? 1 : 0) - (b.activo === false ? 1 : 0) ||
      (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es'),
  );

  return (
    <BillingFrame
      tab="participants"
      title={t('billing.participants.title')}
      intro={t('billing.participants.intro')}
      actions={
        me.isAdmin ? (
          <Button
            icon="plus"
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('billing.participants.new')}
          </Button>
        ) : undefined
      }
    >
      {me.isAdmin ? null : (
        <p className="mb-4 text-sm text-muted-foreground">
          {t('billing.participants.onlyPartners')}
        </p>
      )}
      <Card>
        {!rows ? (
          <Spinner label={t('common.loading')} />
        ) : list.length === 0 ? (
          <EmptyState icon="users" title={t('billing.participants.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{text(p, 'nombre')}</p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      t(
                        `billing.participants.kinds.${(text(p, 'tipo') ?? 'PERSONA') as (typeof TIPOS_PARTICIPANTE)[number]}`,
                      ),
                      names.user(text(p, 'usuarioId')),
                      typeof p.tasaImpuesto === 'number' && p.tasaImpuesto > 0
                        ? `${t('billing.participants.tasa')}: ${formatPercent(p.tasaImpuesto)}`
                        : t('billing.participants.noTax'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {text(p, 'notas') ? <p className="text-sm">{text(p, 'notas')}</p> : null}
                </div>
                <StatusBadge tone={p.activo === false ? 'neutral' : 'success'}>
                  {p.activo === false
                    ? t('billing.participants.inactive')
                    : t('billing.participants.activo')}
                </StatusBadge>
                {me.isAdmin ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="pencil"
                    onClick={() => {
                      setEditing(p);
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing ? (
        <ParticipantForm
          {...(editing === 'new' ? {} : { participant: editing })}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </BillingFrame>
  );
}
