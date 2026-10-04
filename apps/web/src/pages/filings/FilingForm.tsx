import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ESTADOS_TRAMITE,
  TABLES,
  changedFields,
  moveToStage,
  text,
  validateFields,
  type Row,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { unitTree } from '../../domain/scope.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextField } from '../../ui/Field.tsx';
import { VisibilityField } from '../common/VisibilityField.tsx';
import { useTemplates } from './filings.ts';

interface Form {
  clienteId: string;
  entidadId: string;
  asuntoId: string;
  plantillaId: string;
  titulo: string;
  autoridad: string;
  folioExpediente: string;
  fechaPresentacion: string;
  proximaActuacion: string;
  fechaLimite: string;
  estado: string;
  visibilidad: Visibilidad;
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/**
 * A filing, new or edited (firm). With a template, a new filing starts at
 * its first stage and takes its authority; the stages themselves move from
 * the filing's page. Saved on the device at once.
 */
export function FilingForm({
  filing,
  onClose,
  onSaved,
}: {
  filing?: Row;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope, clients } = useScope();
  const templates = useTemplates();
  const allUnits = useRows('Entidades');
  const creatable = clients.filter((c) => can(me, 'Tramites', 'create', c.id));
  const [form, setForm] = useState<Form>(() => ({
    clienteId:
      str(filing, 'clienteId') ||
      (scope.clientId && creatable.some((c) => c.id === scope.clientId) ? scope.clientId : '') ||
      (creatable.length === 1 ? (creatable[0]?.id ?? '') : ''),
    entidadId: filing ? str(filing, 'entidadId') : (scope.unitId ?? ''),
    asuntoId: str(filing, 'asuntoId'),
    plantillaId: str(filing, 'plantillaId'),
    titulo: str(filing, 'titulo'),
    autoridad: str(filing, 'autoridad'),
    folioExpediente: str(filing, 'folioExpediente'),
    fechaPresentacion: str(filing, 'fechaPresentacion'),
    proximaActuacion: str(filing, 'proximaActuacion'),
    fechaLimite: str(filing, 'fechaLimite'),
    estado: str(filing, 'estado') || 'EN_PREPARACION',
    visibilidad: filing?.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const matters = useRows('Asuntos', form.clienteId || null);
  const units = unitTree((allUnits ?? []).filter((u) => u.clienteId === form.clienteId));

  const chooseTemplate = (id: string): void => {
    const template = templates.get(id);
    setForm((f) => ({
      ...f,
      plantillaId: id,
      autoridad: f.autoridad || (template ? (text(template.row, 'autoridad') ?? '') : ''),
    }));
  };

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const fields: Record<string, Value> = {
      clienteId: form.clienteId,
      entidadId: form.entidadId || null,
      asuntoId: form.asuntoId || null,
      plantillaId: form.plantillaId || null,
      titulo: form.titulo.trim(),
      autoridad: form.autoridad.trim() || null,
      folioExpediente: form.folioExpediente.trim() || null,
      fechaPresentacion: form.fechaPresentacion || null,
      proximaActuacion: form.proximaActuacion || null,
      fechaLimite: form.fechaLimite || null,
      estado: form.estado,
      visibilidad: form.visibilidad,
    };
    const check = validateFields(TABLES.Tramites, fields);
    if (!check.ok || !form.titulo.trim()) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (filing) {
        const { clienteId: _fixed, ...changes } = changedFields(filing, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('Tramites', 'update', filing.id, changes);
        }
        onClose();
      } else {
        const id = crypto.randomUUID();
        const first = templates.get(form.plantillaId)?.stages[0];
        const start = first ? moveToStage({ id }, first.nombre, todayInCancun()) : {};
        await engine.mutate('Tramites', 'create', id, { ...check.fields, ...start });
        onClose();
        onSaved?.(id);
      }
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
      title={filing ? t('filings.edit') : t('filings.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="filing-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="filing-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {filing ? null : creatable.length > 1 ? (
          <SelectField
            label={t('shell.client')}
            value={form.clienteId}
            onChange={(e) => {
              setForm((f) => ({ ...f, clienteId: e.target.value, entidadId: '', asuntoId: '' }));
            }}
            options={[
              { value: '', label: t('shell.chooseClient') },
              ...creatable.map((c) => ({ value: c.id, label: clientName(c) })),
            ]}
          />
        ) : null}
        <TextField
          label={t('fields.titulo')}
          required
          maxLength={200}
          value={form.titulo}
          onChange={(e) => {
            set('titulo', e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('fields.plantillaId')}
            optional={t('common.optional')}
            hint={filing ? undefined : t('filings.templateHint')}
            value={form.plantillaId}
            onChange={(e) => {
              chooseTemplate(e.target.value);
            }}
            options={[
              { value: '', label: t('filings.noTemplate') },
              ...[...templates.values()]
                .filter((tpl) => !tpl.row.deleted)
                .map((tpl) => ({ value: tpl.row.id, label: text(tpl.row, 'nombre') ?? '' })),
            ]}
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
          {units.length ? (
            <SelectField
              label={t('fields.entidadId')}
              optional={t('common.optional')}
              value={form.entidadId}
              onChange={(e) => {
                set('entidadId', e.target.value);
              }}
              options={[
                { value: '', label: t('matters.wholeClient') },
                ...units.map((u) => ({
                  value: u.row.id,
                  label: `${'— '.repeat(u.depth)}${text(u.row, 'nombre') ?? ''}`,
                })),
              ]}
            />
          ) : null}
          <SelectField
            label={t('fields.asuntoId')}
            optional={t('common.optional')}
            value={form.asuntoId}
            onChange={(e) => {
              set('asuntoId', e.target.value);
            }}
            options={[
              { value: '', label: t('filings.noMatter') },
              ...(matters ?? [])
                .filter((m) => m.estado !== 'CONCLUIDO' || m.id === form.asuntoId)
                .map((m) => ({ value: m.id, label: text(m, 'titulo') ?? '' })),
            ]}
          />
          <TextField
            label={t('fields.folioExpediente')}
            optional={t('common.optional')}
            maxLength={200}
            value={form.folioExpediente}
            onChange={(e) => {
              set('folioExpediente', e.target.value);
            }}
          />
          <SelectField
            label={t('fields.estado')}
            value={form.estado}
            onChange={(e) => {
              set('estado', e.target.value);
            }}
            options={ESTADOS_TRAMITE.map((s) => ({ value: s, label: t(`filings.estados.${s}`) }))}
          />
          <TextField
            type="date"
            label={t('fields.fechaPresentacion')}
            optional={t('common.optional')}
            value={form.fechaPresentacion}
            onChange={(e) => {
              set('fechaPresentacion', e.target.value);
            }}
          />
          <TextField
            type="date"
            label={t('fields.proximaActuacion')}
            optional={t('common.optional')}
            value={form.proximaActuacion}
            onChange={(e) => {
              set('proximaActuacion', e.target.value);
            }}
          />
          <TextField
            type="date"
            label={t('fields.fechaLimite')}
            optional={t('common.optional')}
            hint={t('filings.sensitiveHint')}
            value={form.fechaLimite}
            onChange={(e) => {
              set('fechaLimite', e.target.value);
            }}
          />
        </div>
        <VisibilityField
          value={form.visibilidad}
          onChange={(v) => {
            set('visibilidad', v);
          }}
          hint={t('filings.visibilityHint')}
        />
      </form>
    </Dialog>
  );
}
