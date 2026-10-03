import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TABLES,
  TIPOS_ENTIDAD,
  text,
  validateFields,
  type Row,
  type Value,
} from '@empirica/shared';
import { unitTree } from '../../domain/scope.ts';
import { unitTypeLabel } from '../../i18n/labels.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextField } from '../../ui/Field.tsx';

/** A business unit or branch of a client (decision: `Entidades.parentId`). */
export function UnitForm({
  clientId,
  units,
  unit,
  onClose,
}: {
  clientId: string;
  units: readonly Row[];
  unit: Row | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { engine } = usePortal();
  const [form, setForm] = useState({
    nombre: (unit && text(unit, 'nombre')) ?? '',
    tipo: (unit && text(unit, 'tipo')) ?? 'UNIDAD',
    parentId: (unit && text(unit, 'parentId')) ?? '',
    giro: (unit && text(unit, 'giro')) ?? '',
    rfc: (unit && text(unit, 'rfc')) ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A unit cannot hang from itself or from one of its own branches.
  const below = new Set<string>();
  if (unit) {
    below.add(unit.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const u of units) {
        const parent = text(u, 'parentId');
        if (parent && below.has(parent) && !below.has(u.id)) {
          below.add(u.id);
          grew = true;
        }
      }
    }
  }
  const parents = unitTree(units).filter(({ row }) => !below.has(row.id));

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const fields: Record<string, Value> = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      parentId: form.parentId || null,
      giro: form.giro.trim() || null,
      rfc: form.rfc.trim() || null,
      ...(unit ? {} : { clienteId: clientId }),
    };
    const check = validateFields(TABLES.Entidades, fields);
    if (!check.ok || !form.nombre.trim()) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      await engine.mutate(
        'Entidades',
        unit ? 'update' : 'create',
        unit?.id ?? crypto.randomUUID(),
        check.fields,
      );
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
      title={unit ? t('clients.editUnit') : t('clients.addUnit')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="unit-form" busy={busy}>
            {unit ? t('common.save') : t('common.add')}
          </Button>
        </>
      }
    >
      <form id="unit-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <TextField
          label={t('clients.unitName')}
          required
          maxLength={200}
          value={form.nombre}
          onChange={(e) => {
            setForm((f) => ({ ...f, nombre: e.target.value }));
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('clients.unitType')}
            value={form.tipo}
            onChange={(e) => {
              setForm((f) => ({ ...f, tipo: e.target.value }));
            }}
            options={TIPOS_ENTIDAD.map((x) => ({ value: x, label: unitTypeLabel(t, x) }))}
          />
          <SelectField
            label={t('clients.parent')}
            value={form.parentId}
            onChange={(e) => {
              setForm((f) => ({ ...f, parentId: e.target.value }));
            }}
            options={[
              { value: '', label: t('clients.noParent') },
              ...parents.map(({ row, depth }) => ({
                value: row.id,
                label: `${'  '.repeat(depth)}${text(row, 'nombre') ?? ''}`,
              })),
            ]}
          />
          <TextField
            label={t('clients.giro')}
            optional={t('common.optional')}
            maxLength={200}
            value={form.giro}
            onChange={(e) => {
              setForm((f) => ({ ...f, giro: e.target.value }));
            }}
          />
          <TextField
            label={t('clients.rfc')}
            optional={t('common.optional')}
            maxLength={13}
            value={form.rfc}
            onChange={(e) => {
              setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }));
            }}
          />
        </div>
        {unit ? <p className="text-sm text-muted-foreground">{t('clients.moveUnitNote')}</p> : null}
      </form>
    </Dialog>
  );
}
