import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLIENT_OPERATIONAL_FIELDS,
  ESTADOS_CLIENTE,
  SERVICIOS,
  TABLES,
  missingRequired,
  text,
  validateFields,
  type Row,
  type Value,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { serviceLabel } from '../../i18n/labels.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextField } from '../../ui/Field.tsx';

interface Form {
  razonSocial: string;
  nombreComercial: string;
  rfc: string;
  servicio: string;
  fechaInicio: string;
  abogadoResponsableId: string;
  estado: string;
  idioma: string;
}

const formOf = (c: Row | null): Form => ({
  razonSocial: (c && text(c, 'razonSocial')) ?? '',
  nombreComercial: (c && text(c, 'nombreComercial')) ?? '',
  rfc: (c && text(c, 'rfc')) ?? '',
  servicio: (c && text(c, 'servicio')) ?? 'FLT_IGUALA',
  fechaInicio: (c && text(c, 'fechaInicio')) ?? '',
  abogadoResponsableId: (c && text(c, 'abogadoResponsableId')) ?? '',
  estado: (c && text(c, 'estado')) ?? 'ACTIVO',
  idioma: (c && text(c, 'idioma')) ?? 'es',
});

/**
 * A client's card. The partner opens clients and edits everything; lawyers
 * and assistants only the operational fields (trade name, language).
 * Saved on the device first, like any other change.
 */
export function ClientForm({
  client,
  onClose,
  onCreated,
}: {
  client: Row | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const usuarios = useRows('Usuarios');
  const [form, setForm] = useState<Form>(() => formOf(client));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = me.isAdmin;
  const editable = (field: keyof Form): boolean =>
    full || (CLIENT_OPERATIONAL_FIELDS as readonly string[]).includes(field);
  const lawyers = (usuarios ?? []).filter(
    (u) =>
      u.lado === 'EMPIRICA' &&
      u.estado === 'ACTIVO' &&
      (u.rolBase === 'ABOGADO' || u.rolBase === 'SOCIO_ADMIN'),
  );
  const set = (key: keyof Form, value: string): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const before = formOf(client);
    const fields: Record<string, Value> = {};
    for (const key of Object.keys(form) as (keyof Form)[]) {
      if (!editable(key)) continue;
      const value = form[key].trim();
      if (client && value === before[key]) continue;
      fields[key] = value === '' ? null : value;
    }
    if (!client && missingRequired(TABLES.Clientes, fields).length) {
      setError(t('errors.VALIDATION'));
      return;
    }
    const check = validateFields(TABLES.Clientes, fields);
    if (!check.ok) {
      setError(t('errors.VALIDATION'));
      return;
    }
    if (client && Object.keys(check.fields).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const id = client?.id ?? crypto.randomUUID();
      await engine.mutate('Clientes', client ? 'update' : 'create', id, check.fields);
      if (!client) onCreated?.(id);
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
      title={client ? t('clients.editTitle') : t('clients.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="client-form" busy={busy}>
            {client ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form id="client-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <TextField
          label={t('clients.razonSocial')}
          required
          maxLength={300}
          disabled={!editable('razonSocial')}
          value={form.razonSocial}
          onChange={(e) => {
            set('razonSocial', e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('clients.nombreComercial')}
            optional={t('common.optional')}
            maxLength={200}
            value={form.nombreComercial}
            onChange={(e) => {
              set('nombreComercial', e.target.value);
            }}
          />
          <TextField
            label={t('clients.rfc')}
            optional={t('common.optional')}
            maxLength={13}
            disabled={!editable('rfc')}
            value={form.rfc}
            onChange={(e) => {
              set('rfc', e.target.value.toUpperCase());
            }}
          />
          <SelectField
            label={t('clients.servicio')}
            disabled={!editable('servicio')}
            value={form.servicio}
            onChange={(e) => {
              set('servicio', e.target.value);
            }}
            options={SERVICIOS.map((s) => ({ value: s, label: serviceLabel(t, s) }))}
          />
          <TextField
            label={t('clients.fechaInicio')}
            type="date"
            optional={t('common.optional')}
            disabled={!editable('fechaInicio')}
            value={form.fechaInicio}
            onChange={(e) => {
              set('fechaInicio', e.target.value);
            }}
          />
          <SelectField
            label={t('clients.responsable')}
            disabled={!editable('abogadoResponsableId')}
            value={form.abogadoResponsableId}
            onChange={(e) => {
              set('abogadoResponsableId', e.target.value);
            }}
            options={[
              { value: '', label: t('clients.noResponsable') },
              ...lawyers.map((u) => ({ value: u.id, label: text(u, 'nombre') ?? '' })),
            ]}
          />
          <SelectField
            label={t('clients.estado')}
            disabled={!editable('estado')}
            value={form.estado}
            onChange={(e) => {
              set('estado', e.target.value);
            }}
            options={ESTADOS_CLIENTE.map((s) => ({ value: s, label: t(`clients.estados.${s}`) }))}
          />
          <SelectField
            label={t('clients.idioma')}
            value={form.idioma}
            onChange={(e) => {
              set('idioma', e.target.value);
            }}
            options={[
              { value: 'es', label: t('language.es') },
              { value: 'en', label: t('language.en') },
            ]}
          />
        </div>
        <p className="text-sm text-muted-foreground">{t('clients.offlineNote')}</p>
      </form>
    </Dialog>
  );
}
