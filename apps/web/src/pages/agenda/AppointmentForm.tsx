import { useMemo, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TABLES,
  parseInstant,
  text,
  toProjectIso,
  validateFields,
  type Row,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { useNames } from '../../data/names.ts';
import { can } from '../../domain/access.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { unitTree } from '../../domain/scope.ts';
import { formatDate, formatDateTime } from '../../i18n/index.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextField } from '../../ui/Field.tsx';
import { VisibilityField } from '../common/VisibilityField.tsx';

const TYPES = ['CITA', 'REUNION', 'AUDIENCIA'] as const;

interface Form {
  clienteId: string;
  entidadId: string;
  titulo: string;
  tipo: (typeof TYPES)[number];
  fecha: string;
  todoElDia: boolean;
  inicio: string;
  fin: string;
  visibilidad: Visibilidad;
}

/** "2026-10-20" and "10:00" from an instant, in Cancún. */
function partsOf(value: Value | undefined): { date: string; time: string } {
  const ms = parseInstant(value);
  if (ms === null) return { date: '', time: '' };
  const iso = toProjectIso(ms);
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const at = (date: string, time: string): string => `${date}T${time}:00.000-05:00`;

function formOf(row: Row | null, clienteId: string, entidadId: string): Form {
  if (!row) {
    return {
      clienteId,
      entidadId,
      titulo: '',
      tipo: 'REUNION',
      fecha: todayInCancun(),
      todoElDia: false,
      inicio: '10:00',
      fin: '11:00',
      visibilidad: 'COMPARTIDO',
    };
  }
  const start = partsOf(row.inicio);
  const end = partsOf(row.fin);
  const tipo = TYPES.find((x) => x === row.tipo) ?? 'REUNION';
  return {
    clienteId: text(row, 'clienteId') ?? '',
    entidadId: text(row, 'entidadId') ?? '',
    titulo: text(row, 'titulo') ?? '',
    tipo,
    fecha: start.date,
    todoElDia: row.todoElDia === true,
    inicio: start.time || '10:00',
    fin: end.time || '11:00',
    visibilidad: row.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
  };
}

/** An appointment as a client sees it: when, where and what. */
function AppointmentView({ row, onClose }: { row: Row; onClose: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const allDay = row.todoElDia === true;
  const tipo = TYPES.find((x) => x === row.tipo);
  const when = allDay
    ? `${formatDate(text(row, 'inicio'))} · ${t('agenda.allDay')}`
    : [formatDateTime(text(row, 'inicio')), formatDateTime(text(row, 'fin'))]
        .filter(Boolean)
        .join(' – ');
  return (
    <Dialog
      open
      onClose={onClose}
      title={text(row, 'titulo') ?? t('agenda.appointment')}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <dl className="space-y-2">
        <div>
          <dt className="text-sm text-muted-foreground">{t('agenda.type')}</dt>
          <dd>{tipo ? t(`agenda.types.${tipo}`) : (text(row, 'tipo') ?? '')}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('agenda.when')}</dt>
          <dd>{when}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('shell.client')}</dt>
          <dd>
            {[names.client(text(row, 'clienteId')), names.unit(text(row, 'entidadId'))]
              .filter(Boolean)
              .join(' · ')}
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}

/**
 * A new appointment or hearing, or one to change: the firm writes them in
 * the portal (also offline); they reach the Google calendars and the
 * personal feeds with the next sync, and one moved in the firm's Google
 * calendar comes back here.
 */
export function AppointmentForm({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope, clients } = useScope();
  const allUnits = useRows('Entidades');
  const editable = row
    ? can(me, 'Eventos', 'update', text(row, 'clienteId'))
    : clients.some((c) => can(me, 'Eventos', 'create', c.id));
  const [form, setForm] = useState<Form>(() =>
    formOf(
      row,
      scope.clientId ?? (clients.length === 1 ? (clients[0]?.id ?? '') : ''),
      scope.unitId ?? '',
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const units = useMemo(
    () => unitTree((allUnits ?? []).filter((u) => u.clienteId === form.clienteId)),
    [allUnits, form.clienteId],
  );
  if (!editable) return row ? <AppointmentView row={row} onClose={onClose} /> : null;

  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const creatable = clients.filter((c) => can(me, 'Eventos', 'create', c.id));

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    if (!form.todoElDia && form.fin <= form.inicio) {
      setError(t('agenda.endAfterStart'));
      return;
    }
    const fields: Record<string, Value> = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      entidadId: form.entidadId || null,
      inicio: at(form.fecha, form.todoElDia ? '00:00' : form.inicio),
      fin: form.todoElDia ? null : at(form.fecha, form.fin),
      todoElDia: form.todoElDia,
      visibilidad: form.visibilidad,
      ...(row ? {} : { clienteId: form.clienteId }),
    };
    const check = validateFields(
      TABLES.Eventos,
      row ? { ...fields, clienteId: form.clienteId } : fields,
    );
    if (!check.ok) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (row) await engine.mutate('Eventos', 'update', row.id, fields);
      else await engine.mutate('Eventos', 'create', crypto.randomUUID(), check.fields);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!row) return;
    setBusy(true);
    try {
      await engine.mutate('Eventos', 'delete', row.id);
      setConfirming(false);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        error={error}
        title={row ? t('agenda.editAppointment') : t('agenda.newAppointment')}
        footer={
          <>
            {row && can(me, 'Eventos', 'delete', text(row, 'clienteId')) ? (
              <Button
                variant="secondary"
                icon="trash"
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {t('common.delete')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="appointment" busy={busy}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="appointment" className="space-y-4" onSubmit={(e) => void submit(e)}>
          {!row && creatable.length > 1 ? (
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
            label={t('agenda.titleField')}
            required
            maxLength={200}
            value={form.titulo}
            onChange={(e) => {
              set('titulo', e.target.value);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('agenda.type')}
              value={form.tipo}
              onChange={(e) => {
                set('tipo', TYPES.find((x) => x === e.target.value) ?? 'REUNION');
              }}
              options={TYPES.map((x) => ({ value: x, label: t(`agenda.types.${x}`) }))}
            />
            {units.length ? (
              <SelectField
                label={t('agenda.unit')}
                value={form.entidadId}
                onChange={(e) => {
                  set('entidadId', e.target.value);
                }}
                options={[
                  { value: '', label: t('agenda.wholeClient') },
                  ...units.map((u) => ({
                    value: u.row.id,
                    label: `${'— '.repeat(u.depth)}${text(u.row, 'nombre') ?? ''}`,
                  })),
                ]}
              />
            ) : null}
          </div>
          <TextField
            label={t('agenda.date')}
            type="date"
            required
            value={form.fecha}
            onChange={(e) => {
              set('fecha', e.target.value);
            }}
          />
          <CheckboxField
            label={t('agenda.allDay')}
            checked={form.todoElDia}
            onChange={(e) => {
              set('todoElDia', e.target.checked);
            }}
          />
          {form.todoElDia ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('agenda.start')}
                type="time"
                required
                value={form.inicio}
                onChange={(e) => {
                  set('inicio', e.target.value);
                }}
              />
              <TextField
                label={t('agenda.end')}
                type="time"
                required
                value={form.fin}
                onChange={(e) => {
                  set('fin', e.target.value);
                }}
              />
            </div>
          )}
          <VisibilityField
            value={form.visibilidad}
            onChange={(v) => {
              set('visibilidad', v);
            }}
          />
        </form>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        title={t('agenda.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => {
          setConfirming(false);
        }}
      >
        <p>{t('agenda.deleteBody', { titulo: form.titulo })}</p>
      </ConfirmDialog>
    </>
  );
}
