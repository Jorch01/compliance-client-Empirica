import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TIPOS_PARTICIPANTE, text, type Row } from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextArea, TextField } from '../../ui/Field.tsx';
import { useAdminCall } from '../people/adminActions.ts';
import { amountText, parseAmount } from './billing.ts';

const str = (row: Row | undefined, field: string): string => (row ? (text(row, field) ?? '') : '');

/**
 * Someone who takes part in the splits (the partners only, online): a
 * person of the firm, the firm's fund or someone outside, with the tax
 * estimated on their part. Turned off, never deleted: past splits name them.
 */
export function ParticipantForm({
  participant,
  onClose,
}: {
  participant?: Row;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const usuarios = useRows('Usuarios');
  const participantes = useRows('Participantes');
  const { run, busy, error } = useAdminCall();
  const [nombre, setNombre] = useState(str(participant, 'nombre'));
  const [tipo, setTipo] = useState(str(participant, 'tipo') || 'PERSONA');
  const [usuarioId, setUsuarioId] = useState(str(participant, 'usuarioId'));
  const [tasa, setTasa] = useState(amountText(participant?.tasaImpuesto));
  const [activo, setActivo] = useState(participant?.activo !== false);
  const [notas, setNotas] = useState(str(participant, 'notas'));
  const [invalid, setInvalid] = useState<string | null>(null);
  const taken = new Set(
    (participantes ?? [])
      .filter((p) => p.id !== participant?.id && text(p, 'usuarioId'))
      .map((p) => text(p, 'usuarioId')),
  );
  const firm = (usuarios ?? []).filter(
    (u) => u.lado === 'EMPIRICA' && (!taken.has(u.id) || u.id === usuarioId),
  );

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setInvalid(null);
    const rate = parseAmount(tasa);
    if (
      !nombre.trim() ||
      rate === 'invalid' ||
      (typeof rate === 'number' && (rate < 0 || rate > 100))
    ) {
      setInvalid(t('errors.VALIDATION'));
      return;
    }
    const ok = await run('billing.participants.save', {
      ...(participant ? { participanteId: participant.id } : {}),
      nombre: nombre.trim(),
      tipo,
      usuarioId: tipo === 'PERSONA' && usuarioId ? usuarioId : null,
      tasaImpuesto: rate,
      activo,
      notas: notas.trim() || null,
    });
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      error={invalid ?? error}
      title={participant ? t('billing.participants.edit') : t('billing.participants.new')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="participant-form" busy={busy} icon="check">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="participant-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <p className="text-sm text-muted-foreground">{t('billing.participants.online')}</p>
        <SelectField
          label={t('billing.participants.tipo')}
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value);
          }}
          options={TIPOS_PARTICIPANTE.map((k) => ({
            value: k,
            label: t(`billing.participants.kinds.${k}`),
          }))}
        />
        {tipo === 'PERSONA' ? (
          <SelectField
            label={t('billing.participants.usuario')}
            optional={t('common.optional')}
            value={usuarioId}
            onChange={(e) => {
              setUsuarioId(e.target.value);
              const user = firm.find((u) => u.id === e.target.value);
              if (user && !nombre.trim()) setNombre(text(user, 'nombre') ?? '');
            }}
            options={[
              { value: '', label: t('billing.participants.noUser') },
              ...firm.map((u) => ({ value: u.id, label: text(u, 'nombre') ?? '' })),
            ]}
          />
        ) : null}
        <TextField
          label={t('billing.participants.nombre')}
          required
          maxLength={120}
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
          }}
        />
        <TextField
          label={t('billing.participants.tasa')}
          hint={t('billing.participants.tasaHint')}
          optional={t('common.optional')}
          inputMode="decimal"
          value={tasa}
          onChange={(e) => {
            setTasa(e.target.value);
          }}
        />
        <CheckboxField
          label={t('billing.participants.activo')}
          checked={activo}
          onChange={(e) => {
            setActivo(e.target.checked);
          }}
        />
        <TextArea
          label={t('billing.participants.notes')}
          optional={t('common.optional')}
          rows={2}
          maxLength={1000}
          value={notas}
          onChange={(e) => {
            setNotas(e.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
