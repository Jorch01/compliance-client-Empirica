import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ESTADOS_TAREA,
  LADOS_RESPONSABLE,
  PRIORIDADES,
  TABLES,
  changedFields,
  text,
  validateFields,
  type EstadoTarea,
  type Row,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { can } from '../../domain/access.ts';
import { unitTree } from '../../domain/scope.ts';
import { assignable, checklistOf, type ChecklistItem, type Side } from '../../domain/work.ts';
import { priorityLabel, taskStateLabel } from '../../i18n/labels.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { VisibilityField } from '../common/VisibilityField.tsx';

interface Form {
  clienteId: string;
  asuntoId: string;
  entidadId: string;
  titulo: string;
  descripcion: string;
  ladoResponsable: Side;
  responsableId: string;
  estado: EstadoTarea;
  prioridad: string;
  fechaLimite: string;
  esFatal: boolean;
  dependeDe: string;
  visibilidad: Visibilidad;
  checklist: ChecklistItem[];
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/** The checklist editor of the firm: add, rename, reorder by order of entry, remove. */
function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="text-sm font-medium">{t('tasks.checklist')}</legend>
      <ul className="mt-2 space-y-2">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label={t('tasks.checklistItem', { n: i + 1 })}
                maxLength={300}
                value={item.texto}
                onChange={(e) => {
                  onChange(items.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)));
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-1"
              aria-label={t('tasks.checklistRemove', { n: i + 1 })}
              onClick={() => {
                onChange(items.filter((_, j) => j !== i));
              }}
            >
              <Icon name="x" className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        icon="plus"
        className="mt-2"
        onClick={() => {
          onChange([...items, { id: crypto.randomUUID().slice(0, 8), texto: '', hecho: false }]);
        }}
      >
        {t('tasks.checklistAdd')}
      </Button>
    </fieldset>
  );
}

/**
 * A task, new or edited (firm). From a matter it belongs to that matter and
 * starts in its unit. The deadline and "plazo fatal" are legally sensitive:
 * if someone else changes them meanwhile, a lawyer decides (Conflictos).
 */
export function TaskForm({
  task,
  matter,
  onClose,
  onSaved,
}: {
  task?: Row;
  /** The matter a new task belongs to. */
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
  const asuntos = useRows('Asuntos');
  const tareas = useRows('Tareas');
  const creatable = clients.filter((c) => can(me, 'Tareas', 'create', c.id));
  const initialClient =
    str(task, 'clienteId') ||
    str(matter, 'clienteId') ||
    (scope.clientId && creatable.some((c) => c.id === scope.clientId) ? scope.clientId : '') ||
    (creatable.length === 1 ? (creatable[0]?.id ?? '') : '');
  const [form, setForm] = useState<Form>(() => ({
    clienteId: initialClient,
    asuntoId: str(task, 'asuntoId') || (matter?.id ?? ''),
    entidadId: str(task, 'entidadId') || str(matter, 'entidadId') || (scope.unitId ?? ''),
    titulo: str(task, 'titulo'),
    descripcion: str(task, 'descripcion'),
    ladoResponsable:
      task?.ladoResponsable === 'CLIENTE' || task?.ladoResponsable === 'AMBOS'
        ? task.ladoResponsable
        : 'EMPIRICA',
    responsableId: task ? str(task, 'responsableId') : me.id,
    estado: (ESTADOS_TAREA as readonly string[]).includes(str(task, 'estado'))
      ? (str(task, 'estado') as EstadoTarea)
      : 'POR_HACER',
    prioridad: str(task, 'prioridad'),
    fechaLimite: str(task, 'fechaLimite').slice(0, 10),
    esFatal: task?.esFatal === true,
    dependeDe: str(task, 'dependeDe'),
    visibilidad: task?.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
    checklist: checklistOf(task?.checklist),
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const units = unitTree((allUnits ?? []).filter((u) => u.clienteId === form.clienteId));
  const matters = (asuntos ?? []).filter((a) => a.clienteId === form.clienteId);
  const people = form.clienteId
    ? assignable(usuarios ?? [], membresias ?? [], form.clienteId, form.ladoResponsable)
    : [];
  const siblings = (tareas ?? []).filter(
    (x) =>
      x.clienteId === form.clienteId &&
      x.id !== task?.id &&
      (form.asuntoId ? x.asuntoId === form.asuntoId : true),
  );

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const checklist = form.checklist
      .map((c) => ({ ...c, texto: c.texto.trim() }))
      .filter((c) => c.texto);
    const fields: Record<string, Value> = {
      clienteId: form.clienteId,
      asuntoId: form.asuntoId || null,
      entidadId: form.entidadId || null,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      ladoResponsable: form.ladoResponsable,
      responsableId: form.responsableId || null,
      estado: form.estado,
      prioridad: form.prioridad || null,
      fechaLimite: form.fechaLimite || null,
      esFatal: form.esFatal,
      dependeDe: form.dependeDe || null,
      visibilidad: form.visibilidad,
      checklist: checklist.length ? checklist : null,
    };
    if (form.estado === 'EN_ESPERA_CLIENTE' && task?.estado !== 'EN_ESPERA_CLIENTE') {
      fields.enEsperaDesde = new Date().toISOString();
    }
    const check = validateFields(TABLES.Tareas, fields);
    if (!check.ok || !form.titulo.trim()) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (task) {
        const { clienteId: _fixed, ...changes } = changedFields(task, check.fields);
        if (Object.keys(changes).length) await engine.mutate('Tareas', 'update', task.id, changes);
        onClose();
      } else {
        const id = crypto.randomUUID();
        await engine.mutate('Tareas', 'create', id, check.fields);
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
      title={task ? t('tasks.edit') : t('tasks.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="task-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="task-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {task || matter ? null : creatable.length > 1 ? (
          <SelectField
            label={t('shell.client')}
            value={form.clienteId}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                clienteId: e.target.value,
                asuntoId: '',
                entidadId: '',
                dependeDe: '',
              }));
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
        <TextArea
          label={t('fields.descripcion')}
          optional={t('common.optional')}
          rows={3}
          maxLength={5000}
          value={form.descripcion}
          onChange={(e) => {
            set('descripcion', e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {matter ? null : (
            <SelectField
              label={t('tasks.matter')}
              optional={t('common.optional')}
              value={form.asuntoId}
              onChange={(e) => {
                const chosen = matters.find((m) => m.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  asuntoId: e.target.value,
                  entidadId: chosen ? str(chosen, 'entidadId') : f.entidadId,
                  dependeDe: '',
                }));
              }}
              options={[
                { value: '', label: t('tasks.noMatter') },
                ...matters.map((m) => ({ value: m.id, label: text(m, 'titulo') ?? '' })),
              ]}
            />
          )}
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
            label={t('tasks.side')}
            value={form.ladoResponsable}
            onChange={(e) => {
              const side = LADOS_RESPONSABLE.find((s) => s === e.target.value) ?? 'EMPIRICA';
              setForm((f) => ({ ...f, ladoResponsable: side, responsableId: '' }));
            }}
            options={LADOS_RESPONSABLE.map((s) => ({ value: s, label: t(`tasks.lados.${s}`) }))}
          />
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
            label={t('fields.estado')}
            value={form.estado}
            onChange={(e) => {
              const next = ESTADOS_TAREA.find((s) => s === e.target.value);
              if (next) set('estado', next);
            }}
            options={ESTADOS_TAREA.map((s) => ({ value: s, label: taskStateLabel(t, s) }))}
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
            label={t('fields.fechaLimite')}
            optional={t('common.optional')}
            hint={t('tasks.sensitiveHint')}
            value={form.fechaLimite}
            onChange={(e) => {
              set('fechaLimite', e.target.value);
            }}
          />
          <SelectField
            label={t('fields.dependeDe')}
            optional={t('common.optional')}
            value={form.dependeDe}
            onChange={(e) => {
              set('dependeDe', e.target.value);
            }}
            options={[
              { value: '', label: t('tasks.noDependency') },
              ...siblings.map((x) => ({ value: x.id, label: text(x, 'titulo') ?? '' })),
            ]}
          />
        </div>
        <CheckboxField
          label={t('fields.esFatal')}
          hint={t('tasks.fatalHint')}
          checked={form.esFatal}
          onChange={(e) => {
            set('esFatal', e.target.checked);
          }}
        />
        <ChecklistEditor
          items={form.checklist}
          onChange={(items) => {
            set('checklist', items);
          }}
        />
        <VisibilityField
          value={form.visibilidad}
          onChange={(v) => {
            set('visibilidad', v);
          }}
          hint={t('tasks.visibilityHint')}
        />
      </form>
    </Dialog>
  );
}
