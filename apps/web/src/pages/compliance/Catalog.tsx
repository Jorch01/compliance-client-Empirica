import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import {
  CATEGORIAS_OBLIGACION,
  RIESGOS,
  TABLES,
  changedFields,
  text,
  validateFields,
  type Row,
  type Value,
} from '@empirica/shared';
import { usePendingIds, useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { categoryLabel, riskLabel } from '../../i18n/labels.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../../ui/Card.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { describeRule } from './compliance.ts';
import { ObligationForm } from './ObligationForm.tsx';
import { RecurrenceField } from './RecurrenceField.tsx';

interface Form {
  categoria: string;
  nombre: string;
  fundamento: string;
  autoridad: string;
  recurrencia: string | null;
  evidenciaRequerida: string;
  riesgo: string;
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/** A catalog model: what an obligation of its kind usually is, for the firm to reuse. */
function ModelForm({ model, onClose }: { model?: Row; onClose: () => void }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [form, setForm] = useState<Form>(() => ({
    categoria: str(model, 'categoria'),
    nombre: model ? str(model, 'nombre') : 'BORRADOR: validar · ',
    fundamento: str(model, 'fundamento'),
    autoridad: str(model, 'autoridad'),
    recurrencia: model ? text(model, 'recurrencia') : null,
    evidenciaRequerida: str(model, 'evidenciaRequerida'),
    riesgo: str(model, 'riesgo'),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const fields: Record<string, Value> = {
      categoria: form.categoria || null,
      nombre: form.nombre.trim(),
      fundamento: form.fundamento.trim() || null,
      autoridad: form.autoridad.trim() || null,
      recurrencia: form.recurrencia,
      evidenciaRequerida: form.evidenciaRequerida.trim() || null,
      riesgo: form.riesgo || null,
    };
    const check = validateFields(TABLES.CatalogoObligaciones, fields);
    if (!check.ok || !form.nombre.trim() || !form.categoria) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (model) {
        const changes = changedFields(model, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('CatalogoObligaciones', 'update', model.id, changes);
        }
      } else {
        await engine.mutate('CatalogoObligaciones', 'create', crypto.randomUUID(), check.fields);
      }
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
      size="lg"
      title={model ? t('compliance.catalogEdit') : t('compliance.catalogNew')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="model-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="model-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <SelectField
          label={t('fields.categoria')}
          required
          value={form.categoria}
          onChange={(e) => {
            set('categoria', e.target.value);
          }}
          options={[
            { value: '', label: t('compliance.anyCategory') },
            ...CATEGORIAS_OBLIGACION.map((c) => ({ value: c, label: categoryLabel(t, c) })),
          ]}
        />
        <TextField
          label={t('fields.nombre')}
          required
          maxLength={300}
          value={form.nombre}
          onChange={(e) => {
            set('nombre', e.target.value);
          }}
        />
        <TextArea
          label={t('fields.fundamento')}
          optional={t('common.optional')}
          hint={t('compliance.fundamentoHint')}
          rows={2}
          maxLength={5000}
          value={form.fundamento}
          onChange={(e) => {
            set('fundamento', e.target.value);
          }}
        />
        <TextField
          label={t('fields.autoridad')}
          optional={t('common.optional')}
          maxLength={200}
          value={form.autoridad}
          onChange={(e) => {
            set('autoridad', e.target.value);
          }}
        />
        <RecurrenceField
          value={form.recurrencia}
          onChange={(rule) => {
            set('recurrencia', rule);
          }}
          anchor={todayInCancun()}
          defaultDay={1}
        />
        <TextArea
          label={t('fields.evidenciaRequerida')}
          optional={t('common.optional')}
          rows={2}
          maxLength={2000}
          value={form.evidenciaRequerida}
          onChange={(e) => {
            set('evidenciaRequerida', e.target.value);
          }}
        />
        <SelectField
          label={t('fields.riesgo')}
          optional={t('common.optional')}
          value={form.riesgo}
          onChange={(e) => {
            set('riesgo', e.target.value);
          }}
          options={[
            { value: '', label: t('common.none') },
            ...RIESGOS.map((r) => ({ value: r, label: riskLabel(t, r) })),
          ]}
        />
      </form>
    </Dialog>
  );
}

/**
 * The obligations catalog: models the firm reuses. The administrator
 * partners keep it; everyone in the firm starts an obligation from one.
 * The portal brings no models: nothing legal is invented (CLAUDE.md).
 */
export function CatalogPage() {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const models = useRows('CatalogoObligaciones');
  const pending = usePendingIds('CatalogoObligaciones');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [using, setUsing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const mayEdit = can(me, 'CatalogoObligaciones', 'update', null);
  const mayDelete = can(me, 'CatalogoObligaciones', 'delete', null);
  const list = [...(models ?? [])].sort(
    (a, b) =>
      CATEGORIAS_OBLIGACION.indexOf(a.categoria as (typeof CATEGORIAS_OBLIGACION)[number]) -
        CATEGORIAS_OBLIGACION.indexOf(b.categoria as (typeof CATEGORIAS_OBLIGACION)[number]) ||
      (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es'),
  );

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
      <PageHeader
        title={t('compliance.catalogTitle')}
        actions={
          can(me, 'CatalogoObligaciones', 'create', null) ? (
            <Button
              icon="plus"
              onClick={() => {
                setEditing('new');
              }}
            >
              {t('compliance.catalogNew')}
            </Button>
          ) : undefined
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('compliance.catalogIntro')}</p>
        {mayEdit ? null : (
          <p className="mt-1 text-sm text-muted-foreground">{t('compliance.catalogReadOnly')}</p>
        )}
      </PageHeader>
      <Card>
        {list.length === 0 ? (
          <EmptyState icon="clipboard" title={t('compliance.catalogEmpty')} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-medium">{text(m, 'nombre')}</p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      categoryLabel(t, m.categoria),
                      describeRule(t, text(m, 'recurrencia')),
                      text(m, 'autoridad') ?? '',
                      m.riesgo ? t('compliance.risk', { level: riskLabel(t, m.riesgo) }) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {pending.has(m.id) ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon name="cloudOff" className="size-3.5" />
                      {t('common.pendingSync')}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    icon="plus"
                    onClick={() => {
                      setUsing(m);
                    }}
                  >
                    {t('compliance.catalogUse')}
                  </Button>
                  {mayEdit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="pencil"
                      onClick={() => {
                        setEditing(m);
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                  ) : null}
                  {mayDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={`${t('compliance.catalogDelete')}: ${text(m, 'nombre') ?? ''}`}
                      onClick={() => {
                        setDeleting(m);
                      }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing ? (
        <ModelForm
          {...(editing === 'new' ? {} : { model: editing })}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {using ? (
        <ObligationForm
          preset={using}
          onClose={() => {
            setUsing(null);
          }}
          onSaved={(id) => {
            navigate(`/compliance/${id}`);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t('compliance.catalogDelete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (deleting) void engine.mutate('CatalogoObligaciones', 'delete', deleting.id);
          setDeleting(null);
        }}
        onClose={() => {
          setDeleting(null);
        }}
      >
        <p>{t('compliance.catalogDeleteBody')}</p>
      </ConfirmDialog>
    </>
  );
}
