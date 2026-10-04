import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
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
import { assignable, linkOf } from '../../domain/work.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextField } from '../../ui/Field.tsx';
import { VisibilityField } from '../common/VisibilityField.tsx';

interface Form {
  clienteId: string;
  entidadId: string;
  contraparte: string;
  tipo: string;
  fechaFirma: string;
  vigenciaHasta: string;
  renovacionAutomatica: boolean;
  diasAvisoPrevio: string;
  responsableId: string;
  docId: string;
  visibilidad: Visibilidad;
}

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/**
 * A contract, new or edited (firm): the counterparty, its dates and the
 * days of notice before its end. Its signed copy is one of its documents,
 * chosen once uploaded. Saved on the device at once.
 */
export function ContractForm({
  contract,
  onClose,
  onSaved,
}: {
  contract?: Row;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope, clients } = useScope();
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias');
  const allUnits = useRows('Entidades');
  const creatable = clients.filter((c) => can(me, 'Contratos', 'create', c.id));
  const [form, setForm] = useState<Form>(() => ({
    clienteId:
      str(contract, 'clienteId') ||
      (scope.clientId && creatable.some((c) => c.id === scope.clientId) ? scope.clientId : '') ||
      (creatable.length === 1 ? (creatable[0]?.id ?? '') : ''),
    entidadId: contract ? str(contract, 'entidadId') : (scope.unitId ?? ''),
    contraparte: str(contract, 'contraparte'),
    tipo: str(contract, 'tipo'),
    fechaFirma: str(contract, 'fechaFirma'),
    vigenciaHasta: str(contract, 'vigenciaHasta'),
    renovacionAutomatica: contract?.renovacionAutomatica === true,
    diasAvisoPrevio:
      typeof contract?.diasAvisoPrevio === 'number' ? String(contract.diasAvisoPrevio) : '',
    responsableId: contract ? str(contract, 'responsableId') : me.id,
    docId: str(contract, 'docId'),
    visibilidad: contract?.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
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
  const documents = useRows('Documentos', form.clienteId || null);
  const own = contract
    ? (documents ?? []).filter((d) => {
        const link = linkOf(d);
        return link?.tipo === 'Contratos' && link.id === contract.id;
      })
    : [];

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const dias = form.diasAvisoPrevio.trim() === '' ? null : Number(form.diasAvisoPrevio);
    if (dias !== null && (!Number.isInteger(dias) || dias < 0)) {
      setError(t('errors.VALIDATION'));
      return;
    }
    const fields: Record<string, Value> = {
      clienteId: form.clienteId,
      entidadId: form.entidadId || null,
      contraparte: form.contraparte.trim(),
      tipo: form.tipo.trim() || null,
      fechaFirma: form.fechaFirma || null,
      vigenciaHasta: form.vigenciaHasta || null,
      renovacionAutomatica: form.renovacionAutomatica,
      diasAvisoPrevio: dias,
      responsableId: form.responsableId || null,
      ...(contract ? { docId: form.docId || null } : {}),
      visibilidad: form.visibilidad,
    };
    const check = validateFields(TABLES.Contratos, fields);
    if (!check.ok || !form.contraparte.trim()) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (contract) {
        const { clienteId: _fixed, ...changes } = changedFields(contract, check.fields);
        if (Object.keys(changes).length) {
          await engine.mutate('Contratos', 'update', contract.id, changes);
        }
        onClose();
      } else {
        const id = crypto.randomUUID();
        await engine.mutate('Contratos', 'create', id, check.fields);
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
      title={contract ? t('contracts.edit') : t('contracts.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="contract-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="contract-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {contract ? null : creatable.length > 1 ? (
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
          label={t('fields.contraparte')}
          required
          maxLength={300}
          value={form.contraparte}
          onChange={(e) => {
            set('contraparte', e.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('fields.tipo')}
            optional={t('common.optional')}
            maxLength={200}
            value={form.tipo}
            onChange={(e) => {
              set('tipo', e.target.value);
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
          <TextField
            type="date"
            label={t('fields.fechaFirma')}
            optional={t('common.optional')}
            value={form.fechaFirma}
            onChange={(e) => {
              set('fechaFirma', e.target.value);
            }}
          />
          <TextField
            type="date"
            label={t('fields.vigenciaHasta')}
            optional={t('common.optional')}
            value={form.vigenciaHasta}
            onChange={(e) => {
              set('vigenciaHasta', e.target.value);
            }}
          />
          <TextField
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            label={t('fields.diasAvisoPrevio')}
            optional={t('common.optional')}
            hint={t('contracts.noticeHint')}
            value={form.diasAvisoPrevio}
            onChange={(e) => {
              set('diasAvisoPrevio', e.target.value);
            }}
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
        </div>
        <CheckboxField
          label={t('fields.renovacionAutomatica')}
          hint={t('contracts.autoRenewHint')}
          checked={form.renovacionAutomatica}
          onChange={(e) => {
            set('renovacionAutomatica', e.target.checked);
          }}
        />
        {contract ? (
          <SelectField
            label={t('contracts.document')}
            hint={t('contracts.documentHint')}
            value={form.docId}
            onChange={(e) => {
              set('docId', e.target.value);
            }}
            options={[
              { value: '', label: t('contracts.documentNone') },
              ...own.map((d) => ({ value: d.id, label: text(d, 'nombre') ?? '' })),
            ]}
          />
        ) : null}
        <VisibilityField
          value={form.visibilidad}
          onChange={(v) => {
            set('visibilidad', v);
          }}
          hint={t('contracts.visibilityHint')}
        />
      </form>
    </Dialog>
  );
}
