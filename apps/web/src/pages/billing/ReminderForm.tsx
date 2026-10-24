import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REPETICIONES,
  TABLES,
  changedFields,
  text,
  validateFields,
  type Charge,
  type Row,
  type Value,
} from '@empirica/shared';
import { todayInCancun } from '../../domain/deadlines.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { chargeLabel, ensureCharge, useBillingPeople } from './billing.ts';

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/**
 * A billing reminder: what to do, the first time, how often it comes back
 * and until when, and who hears it in the bell (nobody chosen: its author).
 * About a client, one of its retainers or one of its charges.
 */
export function ReminderForm({
  reminder,
  charge,
  honorarios,
  charges = [],
  onClose,
}: {
  reminder?: Row;
  /** Written from a charge's page: about that charge. */
  charge?: Charge;
  honorarios: readonly Row[];
  /** The charges it may be about (recorded ones). */
  charges?: readonly Charge[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { engine, me } = usePortal();
  const { scope, clients } = useScope();
  const [clienteId, setClienteId] = useState(
    () =>
      [
        str(reminder, 'clienteId'),
        charge?.clienteId,
        scope.clientId,
        clients.length === 1 ? clients[0]?.id : null,
      ].find(Boolean) ?? '',
  );
  const [titulo, setTitulo] = useState(str(reminder, 'titulo'));
  const [fecha, setFecha] = useState(str(reminder, 'fecha') || todayInCancun());
  const [repetir, setRepetir] = useState(str(reminder, 'repetir') || 'NO');
  const [hasta, setHasta] = useState(str(reminder, 'hasta'));
  const [about, setAbout] = useState(() => {
    if (charge) return `c:${charge.id}`;
    const cobro = str(reminder, 'cobroId');
    const fee = str(reminder, 'honorarioId');
    return cobro ? `c:${cobro}` : fee ? `h:${fee}` : '';
  });
  const [destinatarios, setDestinatarios] = useState<string[]>(() =>
    Array.isArray(reminder?.destinatarios)
      ? reminder.destinatarios.filter((x): x is string => typeof x === 'string')
      : [me.id],
  );
  const [activo, setActivo] = useState(reminder?.activo !== false);
  const [notas, setNotas] = useState(str(reminder, 'notas'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const people = useBillingPeople(clienteId || null);
  const fees = honorarios.filter((h) => h.clienteId === clienteId && !h.deleted);
  const ofClient = charges.filter((c) => c.clienteId === clienteId && c.row);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const cobroId = about.startsWith('c:') ? about.slice(2) : null;
    const honorarioId = about.startsWith('h:') ? about.slice(2) : null;
    const fields: Record<string, Value> = {
      clienteId,
      titulo: titulo.trim(),
      fecha,
      repetir,
      hasta: repetir === 'NO' ? null : hasta || null,
      cobroId,
      honorarioId,
      destinatarios,
      activo,
      notas: notas.trim() || null,
    };
    const check = validateFields(TABLES.RecordatoriosCobro, fields);
    if (!check.ok || !titulo.trim() || !fecha || (hasta && hasta < fecha)) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      // A retainer's period not written yet is written first, so the reminder can name it.
      if (charge?.id === cobroId) await ensureCharge(engine, charge, honorarios);
      if (reminder) {
        const { clienteId: _c, ...changes } = changedFields(reminder, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('RecordatoriosCobro', 'update', reminder.id, changes);
        }
      } else {
        await engine.mutate('RecordatoriosCobro', 'create', crypto.randomUUID(), check.fields);
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
      title={reminder ? t('billing.reminders.edit') : t('billing.reminders.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="reminder-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="reminder-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {reminder || charge ? null : clients.length > 1 ? (
          <SelectField
            label={t('billing.form.client')}
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setAbout('');
            }}
            options={[
              { value: '', label: t('shell.chooseClient') },
              ...clients.map((c) => ({ value: c.id, label: clientName(c) })),
            ]}
          />
        ) : null}
        <TextField
          label={t('billing.reminders.titulo')}
          hint={t('billing.reminders.tituloHint')}
          required
          maxLength={300}
          value={titulo}
          onChange={(e) => {
            setTitulo(e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            type="date"
            label={t('billing.reminders.fecha')}
            required
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
            }}
          />
          <SelectField
            label={t('billing.reminders.repetir')}
            value={repetir}
            onChange={(e) => {
              setRepetir(e.target.value);
            }}
            options={REPETICIONES.map((r) => ({
              value: r,
              label: t(`billing.reminders.repeats.${r}`),
            }))}
          />
          {repetir !== 'NO' ? (
            <TextField
              type="date"
              label={t('billing.reminders.hasta')}
              optional={t('common.optional')}
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
              }}
            />
          ) : null}
          {charge ? null : (
            <SelectField
              label={t('billing.reminders.about')}
              value={about}
              onChange={(e) => {
                setAbout(e.target.value);
              }}
              options={[
                { value: '', label: t('billing.reminders.aboutNone') },
                ...fees.map((f) => ({
                  value: `h:${f.id}`,
                  label: t('billing.reminders.aboutFee', { name: text(f, 'concepto') ?? '' }),
                })),
                ...ofClient.map((c) => ({
                  value: `c:${c.id}`,
                  label: t('billing.reminders.aboutCharge', { name: chargeLabel(c) }),
                })),
              ]}
            />
          )}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('billing.reminders.destinatarios')}</legend>
          <p className="text-sm text-muted-foreground">
            {t('billing.reminders.destinatariosHint')}
          </p>
          {people.map((u) => (
            <CheckboxField
              key={u.id}
              label={text(u, 'nombre') ?? ''}
              checked={destinatarios.includes(u.id)}
              onChange={(e) => {
                const on = e.target.checked;
                setDestinatarios((d) => (on ? [...d, u.id] : d.filter((x) => x !== u.id)));
              }}
            />
          ))}
        </fieldset>
        <CheckboxField
          label={t('billing.reminders.activo')}
          checked={activo}
          onChange={(e) => {
            setActivo(e.target.checked);
          }}
        />
        <TextArea
          label={t('billing.reminders.notes')}
          optional={t('common.optional')}
          rows={2}
          maxLength={2000}
          value={notas}
          onChange={(e) => {
            setNotas(e.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
