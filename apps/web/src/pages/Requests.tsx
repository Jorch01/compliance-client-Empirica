import { useMemo, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AREAS, PRIORIDADES, TABLES, text, validateFields, type Value } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { can } from '../domain/access.ts';
import { isOpenRequest } from '../domain/dashboard.ts';
import { unitTree } from '../domain/scope.ts';
import { areaLabel, priorityLabel } from '../i18n/labels.ts';
import { clientName, useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, PageHeader } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { SelectField, TextArea, TextField } from '../ui/Field.tsx';
import { RequestList } from './common/RequestList.tsx';

type Filter = 'open' | 'closed' | 'all';

/**
 * A new request to the firm. It is saved on the device at once and reaches
 * the firm with the next sync; a unit user files it within their units.
 */
function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope, clients } = useScope();
  const allUnits = useRows('Entidades');
  const [clientId, setClientId] = useState<string>(scope.clientId ?? '');
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    urgencia: 'MEDIA',
    area: '',
    entidadId: scope.unitId ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creatable = clients.filter((c) => can(me, 'Solicitudes', 'create', c.id));
  const chosen = clientId || (creatable.length === 1 ? (creatable[0]?.id ?? '') : '');
  const units = unitTree((allUnits ?? []).filter((u) => u.clienteId === chosen));
  const access = me.clients.find((c) => c.id === chosen);
  // A user limited to some units must say which one the request is for.
  const unitRequired = !me.isFirm && Boolean(access?.alcance);
  // Someone limited to some units files under one of them: the first, unless they choose.
  const unit = form.entidadId || (unitRequired ? (units[0]?.row.id ?? '') : '');

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!chosen) {
      setError(t('requests.chooseClient'));
      return;
    }
    if (unitRequired && !unit) {
      setError(t('requests.chooseUnit'));
      return;
    }
    const fields: Record<string, Value> = {
      clienteId: chosen,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      urgencia: form.urgencia,
      area: form.area || null,
      entidadId: unit || null,
      estado: 'RECIBIDA',
    };
    const check = validateFields(TABLES.Solicitudes, fields);
    if (!check.ok) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      await engine.mutate('Solicitudes', 'create', crypto.randomUUID(), check.fields);
      setForm({ titulo: '', descripcion: '', urgencia: 'MEDIA', area: '', entidadId: '' });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      error={error}
      title={t('requests.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-request" busy={busy} icon="send">
            {t('common.send')}
          </Button>
        </>
      }
    >
      <form id="new-request" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {creatable.length > 1 ? (
          <SelectField
            label={t('shell.client')}
            value={chosen}
            onChange={(e) => {
              setClientId(e.target.value);
              setForm((f) => ({ ...f, entidadId: '' }));
            }}
            options={[
              { value: '', label: t('shell.chooseClient') },
              ...creatable.map((c) => ({ value: c.id, label: clientName(c) })),
            ]}
          />
        ) : null}
        <TextField
          label={t('requests.titleField')}
          required
          maxLength={200}
          value={form.titulo}
          onChange={(e) => {
            setForm((f) => ({ ...f, titulo: e.target.value }));
          }}
        />
        <TextArea
          label={t('requests.description')}
          optional={t('common.optional')}
          maxLength={5000}
          value={form.descripcion}
          onChange={(e) => {
            setForm((f) => ({ ...f, descripcion: e.target.value }));
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('requests.urgency')}
            value={form.urgencia}
            onChange={(e) => {
              setForm((f) => ({ ...f, urgencia: e.target.value }));
            }}
            options={PRIORIDADES.map((p) => ({ value: p, label: priorityLabel(t, p) }))}
          />
          <SelectField
            label={t('requests.area')}
            optional={t('common.optional')}
            value={form.area}
            onChange={(e) => {
              setForm((f) => ({ ...f, area: e.target.value }));
            }}
            options={[
              { value: '', label: t('requests.areaUnknown') },
              ...AREAS.map((a) => ({ value: a, label: areaLabel(t, a) })),
            ]}
          />
        </div>
        {units.length > 0 ? (
          <SelectField
            label={t('requests.unit')}
            value={unit}
            onChange={(e) => {
              setForm((f) => ({ ...f, entidadId: e.target.value }));
            }}
            options={[
              { value: '', label: unitRequired ? t('requests.chooseUnit') : t('requests.hubUnit') },
              ...units.map(({ row, depth }) => ({
                value: row.id,
                label: `${'  '.repeat(depth)}${text(row, 'nombre') ?? ''}`,
              })),
            ]}
          />
        ) : null}
        <p className="text-sm text-muted-foreground">{t('requests.offlineNote')}</p>
      </form>
    </Dialog>
  );
}

export function RequestsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const requests = useScopedRows('Solicitudes');
  const [filter, setFilter] = useState<Filter>('open');
  const [creating, setCreating] = useState(false);
  const canCreate = clients.some((c) => can(me, 'Solicitudes', 'create', c.id));

  const shown = useMemo(
    () =>
      (requests ?? [])
        .filter((r) =>
          filter === 'all' ? true : filter === 'open' ? isOpenRequest(r) : !isOpenRequest(r),
        )
        .sort((a, b) => (text(b, 'createdAt') ?? '').localeCompare(text(a, 'createdAt') ?? '')),
    [requests, filter],
  );

  return (
    <>
      <PageHeader
        title={t('requests.title')}
        actions={
          canCreate ? (
            <Button
              icon="plus"
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('requests.new')}
            </Button>
          ) : null
        }
      />
      <Card>
        <div role="group" aria-label={t('requests.filter')} className="mb-2 flex flex-wrap gap-2">
          {(['open', 'closed', 'all'] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'primary' : 'secondary'}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
              }}
            >
              {t(`requests.filter${f === 'open' ? 'Open' : f === 'closed' ? 'Closed' : 'All'}`)}
            </Button>
          ))}
        </div>
        <RequestList requests={shown} />
      </Card>
      {creating ? (
        <NewRequestDialog
          open
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}
