import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import {
  TABLES,
  changedFields,
  stagesValue,
  text,
  validateFields,
  type Stage,
  type Value,
} from '@empirica/shared';
import { usePendingIds } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../../ui/Card.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { useTemplates, type Template } from './filings.ts';

interface StageDraft {
  key: string;
  nombre: string;
  dias: string;
}

const draftsOf = (stages: readonly Stage[]): StageDraft[] =>
  stages.map((s) => ({
    key: crypto.randomUUID(),
    nombre: s.nombre,
    dias: s.dias === null ? '' : String(s.dias),
  }));

/** A template: its name, its authority and its stages in order, each with its usual days. */
function TemplateForm({ template, onClose }: { template?: Template; onClose: () => void }) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [nombre, setNombre] = useState(template ? (text(template.row, 'nombre') ?? '') : '');
  const [autoridad, setAutoridad] = useState(
    template ? (text(template.row, 'autoridad') ?? '') : '',
  );
  const [stages, setStages] = useState<StageDraft[]>(() =>
    template?.stages.length
      ? draftsOf(template.stages)
      : [{ key: crypto.randomUUID(), nombre: '', dias: '' }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = (index: number, change: Partial<StageDraft>): void => {
    setStages((list) => list.map((s, i) => (i === index ? { ...s, ...change } : s)));
  };
  const move = (index: number, by: -1 | 1): void => {
    setStages((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + by, 0, item);
      return next;
    });
  };

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const parsed: Stage[] = [];
    for (const s of stages) {
      if (!s.nombre.trim()) continue;
      const dias = s.dias.trim() === '' ? null : Number(s.dias);
      if (dias !== null && (!Number.isInteger(dias) || dias < 0)) {
        setError(t('errors.VALIDATION'));
        return;
      }
      parsed.push({ nombre: s.nombre.trim(), dias });
    }
    const fields: Record<string, Value> = {
      nombre: nombre.trim(),
      autoridad: autoridad.trim() || null,
      etapas: stagesValue(parsed),
    };
    const check = validateFields(TABLES.PlantillasTramite, fields);
    if (!check.ok || !nombre.trim()) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (template) {
        const changes = changedFields(template.row, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('PlantillasTramite', 'update', template.row.id, changes);
        }
      } else {
        await engine.mutate('PlantillasTramite', 'create', crypto.randomUUID(), check.fields);
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
      title={template ? t('filings.templateEdit') : t('filings.templateNew')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="template-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="template-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <TextField
          label={t('filings.templateName')}
          required
          maxLength={200}
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
          }}
        />
        <TextField
          label={t('fields.autoridad')}
          optional={t('common.optional')}
          maxLength={200}
          value={autoridad}
          onChange={(e) => {
            setAutoridad(e.target.value);
          }}
        />
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{t('filings.stagesLabel')}</legend>
          <ol className="space-y-3">
            {stages.map((s, i) => (
              <li key={s.key} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto]">
                <TextField
                  label={t('filings.stageName', { n: i + 1 })}
                  maxLength={200}
                  value={s.nombre}
                  onChange={(e) => {
                    edit(i, { nombre: e.target.value });
                  }}
                />
                <TextField
                  label={t('filings.stageDays', { n: i + 1 })}
                  optional={t('common.optional')}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={s.dias}
                  onChange={(e) => {
                    edit(i, { dias: e.target.value });
                  }}
                />
                <div className="flex gap-1 pb-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="chevronUp"
                    disabled={i === 0}
                    aria-label={t('filings.stageUp', { n: i + 1 })}
                    onClick={() => {
                      move(i, -1);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="chevronDown"
                    disabled={i === stages.length - 1}
                    aria-label={t('filings.stageDown', { n: i + 1 })}
                    onClick={() => {
                      move(i, 1);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="x"
                    aria-label={t('filings.stageRemove', { n: i + 1 })}
                    onClick={() => {
                      setStages((list) => list.filter((_, j) => j !== i));
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            onClick={() => {
              setStages((list) => [...list, { key: crypto.randomUUID(), nombre: '', dias: '' }]);
            }}
          >
            {t('filings.stageAdd')}
          </Button>
        </fieldset>
      </form>
    </Dialog>
  );
}

/**
 * The firm's filing templates: stages and their usual days. The
 * administrator partners write them; lawyers and assistants use them.
 */
export function TemplatesPage() {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const templates = useTemplates();
  const pending = usePendingIds('PlantillasTramite');
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const mayEdit = can(me, 'PlantillasTramite', 'update', null);
  const mayDelete = can(me, 'PlantillasTramite', 'delete', null);
  const list = [...templates.values()].sort((a, b) =>
    (text(a.row, 'nombre') ?? '').localeCompare(text(b.row, 'nombre') ?? '', 'es'),
  );

  return (
    <>
      <p className="mb-2">
        <Link
          href="/tramites"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronRight" className="size-4 rotate-180" />
          {t('filings.back')}
        </Link>
      </p>
      <PageHeader
        title={t('filings.templatesTitle')}
        actions={
          can(me, 'PlantillasTramite', 'create', null) ? (
            <Button
              icon="plus"
              onClick={() => {
                setEditing('new');
              }}
            >
              {t('filings.templateNew')}
            </Button>
          ) : undefined
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('filings.templatesIntro')}</p>
        {mayEdit ? null : (
          <p className="mt-1 text-sm text-muted-foreground">{t('filings.templatesReadOnly')}</p>
        )}
      </PageHeader>
      <Card>
        {list.length === 0 ? (
          <EmptyState icon="list" title={t('filings.templatesEmpty')} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((tpl) => {
              const days = tpl.stages.reduce((sum, s) => sum + (s.dias ?? 0), 0);
              return (
                <li key={tpl.row.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-medium">{text(tpl.row, 'nombre')}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        text(tpl.row, 'autoridad') ?? '',
                        t('filings.templateStages', { count: tpl.stages.length }),
                        days ? t('filings.templateDays', { count: days }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {tpl.stages.length ? (
                      <p className="mt-1 text-sm">{tpl.stages.map((s) => s.nombre).join(' → ')}</p>
                    ) : null}
                    {pending.has(tpl.row.id) ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon name="cloudOff" className="size-3.5" />
                        {t('common.pendingSync')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {mayEdit ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="pencil"
                        onClick={() => {
                          setEditing(tpl);
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
                        aria-label={`${t('filings.templateDelete')}: ${text(tpl.row, 'nombre') ?? ''}`}
                        onClick={() => {
                          setDeleting(tpl);
                        }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {editing ? (
        <TemplateForm
          {...(editing === 'new' ? {} : { template: editing })}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t('filings.templateDelete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (deleting) void engine.mutate('PlantillasTramite', 'delete', deleting.row.id);
          setDeleting(null);
        }}
        onClose={() => {
          setDeleting(null);
        }}
      >
        <p>{t('filings.templateDeleteBody')}</p>
      </ConfirmDialog>
    </>
  );
}
