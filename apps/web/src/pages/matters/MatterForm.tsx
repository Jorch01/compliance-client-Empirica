import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AREAS,
  ESTADOS_ASUNTO,
  PRIORIDADES,
  TABLES,
  changedFields,
  text,
  validateFields,
  type Row,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { unitTree } from '../../domain/scope.ts';
import { assignable } from '../../domain/work.ts';
import { areaLabel, priorityLabel } from '../../i18n/labels.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextField } from '../../ui/Field.tsx';
import { VisibilityField } from '../common/VisibilityField.tsx';

interface Form {
  clienteId: string;
  entidadId: string;
  titulo: string;
  area: string;
  estado: string;
  prioridad: string;
  responsableId: string;
  fechaInicio: string;
  fechaObjetivo: string;
  dentroIguala: boolean;
  visibilidad: Visibilidad;
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/**
 * A matter, new or edited (firm). New ones are shared with the client unless
 * the lawyer says otherwise (D19). Saved on the device at once.
 */
export function MatterForm({
  matter,
  onClose,
  onSaved,
}: {
  matter?: Row;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope, clients } = useScope();
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias');
  const allUnits = useRows('Entidades');
  const creatable = clients.filter((c) => can(me, 'Asuntos', 'create', c.id));
  const [form, setForm] = useState<Form>(() => ({
    clienteId:
      str(matter, 'clienteId') ||
      (scope.clientId && creatable.some((c) => c.id === scope.clientId) ? scope.clientId : '') ||
      (creatable.length === 1 ? (creatable[0]?.id ?? '') : ''),
    entidadId: matter ? str(matter, 'entidadId') : (scope.unitId ?? ''),
    titulo: str(matter, 'titulo'),
    area: str(matter, 'area'),
    estado: str(matter, 'estado') || 'ACTIVO',
    prioridad: str(matter, 'prioridad'),
    responsableId: matter ? str(matter, 'responsableId') : me.id,
    fechaInicio: str(matter, 'fechaInicio'),
    fechaObjetivo: str(matter, 'fechaObjetivo'),
    dentroIguala: matter ? matter.dentroIguala === true : true,
    visibilidad: matter?.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const units = unitTree((allUnits ?? []).filter((u) => u.clienteId === form.clienteId));
  const people = form.clienteId
    ? assignable(usuarios ?? [], membresias ?? [], form.clienteId, 'EMPIRICA')
    : [];

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
      titulo: form.titulo.trim(),
      area: form.area || null,
      estado: form.estado,
      prioridad: form.prioridad || null,
      responsableId: form.responsableId || null,
      fechaInicio: form.fechaInicio || null,
      fechaObjetivo: form.fechaObjetivo || null,
      dentroIguala: form.dentroIguala,
      visibilidad: form.visibilidad,
    };
    const check = validateFields(TABLES.Asuntos, fields);
    if (!check.ok || !form.titulo.trim() || !form.area) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (matter) {
        const { clienteId: _fixed, ...changes } = changedFields(matter, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('Asuntos', 'update', matter.id, changes);
        }
        onClose();
      } else {
        const id = crypto.randomUUID();
        await engine.mutate('Asuntos', 'create', id, check.fields);
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
      title={matter ? t('matters.edit') : t('matters.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="matter-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="matter-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {matter ? null : creatable.length > 1 ? (
          <SelectField
            label={t('shell.client')}
            value={form.clienteId}
            onChange={(e) => {
              setForm((f) => ({ ...f, clienteId: e.target.value, entidadId: '' }));
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
            label={t('fields.area')}
            required
            value={form.area}
            onChange={(e) => {
              set('area', e.target.value);
            }}
            options={[
              { value: '', label: t('matters.chooseArea') },
              ...AREAS.map((a) => ({ value: a, label: areaLabel(t, a) })),
            ]}
          />
          <SelectField
            label={t('fields.estado')}
            value={form.estado}
            onChange={(e) => {
              set('estado', e.target.value);
            }}
            options={ESTADOS_ASUNTO.map((s) => ({ value: s, label: t(`matters.estados.${s}`) }))}
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
            label={t('fields.responsableId')}
            optional={t('common.optional')}
            value={form.responsableId}
            onChange={(e) => {
              set('responsableId', e.target.value);
            }}
            options={[
              { value: '', label: t('matters.unassigned') },
              ...people.map((u) => ({ value: u.id, label: text(u, 'nombre') ?? '' })),
            ]}
          />
          <SelectField
            label={t('fields.prioridad')}
            optional={t('common.optional')}
            value={form.prioridad}
            onChange={(e) => {
              set('prioridad', e.target.value);
            }}
            options={[
              { value: '', label: t('common.none') },
              ...PRIORIDADES.map((p) => ({ value: p, label: priorityLabel(t, p) })),
            ]}
          />
          <TextField
            type="date"
            label={t('fields.fechaInicio')}
            optional={t('common.optional')}
            value={form.fechaInicio}
            onChange={(e) => {
              set('fechaInicio', e.target.value);
            }}
          />
          <TextField
            type="date"
            label={t('fields.fechaObjetivo')}
            optional={t('common.optional')}
            value={form.fechaObjetivo}
            onChange={(e) => {
              set('fechaObjetivo', e.target.value);
            }}
          />
        </div>
        <CheckboxField
          label={t('fields.dentroIguala')}
          hint={t('matters.igualaHint')}
          checked={form.dentroIguala}
          onChange={(e) => {
            set('dentroIguala', e.target.checked);
          }}
        />
        <VisibilityField
          value={form.visibilidad}
          onChange={(v) => {
            set('visibilidad', v);
          }}
          hint={t('matters.visibilityHint')}
        />
      </form>
    </Dialog>
  );
}
