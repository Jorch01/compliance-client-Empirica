import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FILE_ACCEPT,
  TABLES,
  fileMimeType,
  maxFileBytes,
  text,
  validateFields,
  type Row,
  type Value,
} from '@empirica/shared';
import { useNames } from '../../data/names.ts';
import { roleIn } from '../../domain/access.ts';
import { todayInCancun } from '../../domain/deadlines.ts';
import { formatDate, formatDateTime } from '../../i18n/index.ts';
import { oneOf } from '../../i18n/labels.ts';
import { configNumber, usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, TextArea, TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { StatusBadge, type Tone } from '../../ui/StatusBadge.tsx';
import { DocumentFile } from '../common/DocumentFile.tsx';

const RECORD_STATES = ['EN_REVISION', 'VALIDADO', 'RECHAZADO'] as const;
const RECORD_TONE: Record<(typeof RECORD_STATES)[number], Tone> = {
  EN_REVISION: 'info',
  VALIDADO: 'success',
  RECHAZADO: 'danger',
};

/**
 * Evidence for a period: a file (as a document of the obligation, sent as
 * soon as there is network), the date it was done and notes. A client's
 * stays under review; the firm may validate it at once.
 */
export function EvidenceDialog({
  obligation,
  periodo,
  onClose,
}: {
  obligation: Row;
  periodo: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const mb = configNumber(me, 'mbMaxArchivo', 10);
  const [file, setFile] = useState<File | null>(null);
  const [fecha, setFecha] = useState(todayInCancun());
  const [notas, setNotas] = useState('');
  const [validate, setValidate] = useState(me.isFirm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needed = text(obligation, 'evidenciaRequerida');

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    // A client's evidence is a file; the firm may record compliance without one.
    if (!file && !me.isFirm) {
      setError(t('compliance.chooseFile'));
      return;
    }
    if (file) {
      if (!fileMimeType(file.name)) {
        setError(t('documents.wrongType'));
        return;
      }
      if (file.size > maxFileBytes(mb)) {
        setError(t('documents.tooLarge', { mb }));
        return;
      }
      if (file.size === 0) {
        setError(t('documents.emptyFile'));
        return;
      }
    }
    const docId = file ? crypto.randomUUID() : null;
    const nombre = file?.name ?? '';
    const doc: Record<string, Value> = {
      clienteId: text(obligation, 'clienteId'),
      entidadId: text(obligation, 'entidadId'),
      vinculo: { tipo: 'Obligaciones', id: obligation.id },
      nombre,
      mimeType: fileMimeType(nombre),
      tamanoBytes: file?.size ?? null,
      // Whoever sees the obligation sees its evidence.
      visibilidad: obligation.visibilidad === 'INTERNO' ? 'INTERNO' : 'COMPARTIDO',
      categoria: 'COMPLIANCE',
      subidoPor: me.id,
    };
    const validated = me.isFirm && validate;
    const record: Record<string, Value> = {
      obligacionId: obligation.id,
      clienteId: text(obligation, 'clienteId'),
      entidadId: text(obligation, 'entidadId'),
      periodo,
      fechaCumplimiento: fecha || null,
      evidenciaDocId: docId,
      notas: notas.trim() || null,
      estado: validated ? 'VALIDADO' : 'EN_REVISION',
      validadoPor: validated ? me.id : null,
    };
    const docCheck = file ? validateFields(TABLES.Documentos, doc) : null;
    const recordCheck = validateFields(TABLES.CumplimientosHistorial, record);
    if ((docCheck && !docCheck.ok) || !recordCheck.ok) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      if (file && docId && docCheck?.ok) {
        const data = await file.arrayBuffer();
        await engine.mutate('Documentos', 'create', docId, docCheck.fields);
        await engine.queueFile(docId, { data, nombre, size: file.size });
      }
      await engine.mutate(
        'CumplimientosHistorial',
        'create',
        crypto.randomUUID(),
        recordCheck.fields,
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
      title={t('compliance.evidenceTitle', { date: formatDate(periodo) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="evidence-form" busy={busy} icon="send">
            {t('common.send')}
          </Button>
        </>
      }
    >
      <form id="evidence-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        {needed ? (
          <p className="rounded-control border border-border bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{t('compliance.evidenceNeeded')}: </span>
            {needed}
          </p>
        ) : null}
        <TextField
          type="file"
          label={t('compliance.evidenceFile')}
          hint={t('compliance.evidenceFileHint', { mb })}
          accept={FILE_ACCEPT}
          {...(me.isFirm ? { optional: t('common.optional') } : { required: true })}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
          }}
        />
        <TextField
          type="date"
          label={t('compliance.fechaCumplimiento')}
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
          }}
        />
        <TextArea
          label={t('compliance.notes')}
          optional={t('common.optional')}
          rows={3}
          maxLength={5000}
          value={notas}
          onChange={(e) => {
            setNotas(e.target.value);
          }}
        />
        {me.isFirm ? (
          <CheckboxField
            label={t('compliance.validateNow')}
            hint={t('compliance.validateNowHint')}
            checked={validate}
            onChange={(e) => {
              setValidate(e.target.checked);
            }}
          />
        ) : null}
        <p className="text-sm text-muted-foreground">{t('compliance.evidenceOffline')}</p>
      </form>
    </Dialog>
  );
}

/**
 * One compliance record: its state, who sent it and when, its file and
 * notes. The firm validates or turns it down, and may withdraw a validation.
 */
export function RecordItem({ record, pending }: { record: Row; pending: boolean }) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const names = useNames();
  const [rejecting, setRejecting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const estado = oneOf(RECORD_STATES, record.estado) ? record.estado : 'EN_REVISION';
  const clientId = text(record, 'clienteId');
  const firm = me.isFirm && roleIn(me, clientId) !== null;
  const docId = text(record, 'evidenciaDocId');

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={RECORD_TONE[estado]}>
          {t(`compliance.recordStates.${estado}`)}
        </StatusBadge>
        <span className="text-sm text-muted-foreground">
          {[
            names.user(text(record, 'createdBy'))
              ? t('compliance.sentBy', { name: names.user(text(record, 'createdBy')) })
              : '',
            formatDateTime(text(record, 'createdAt')),
            text(record, 'fechaCumplimiento')
              ? t('compliance.doneOn', { date: formatDate(text(record, 'fechaCumplimiento')) })
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {docId ? <DocumentFile docId={docId} /> : null}
      {text(record, 'notas') ? (
        <p className="mt-1 text-sm whitespace-pre-line">{text(record, 'notas')}</p>
      ) : null}
      {estado !== 'EN_REVISION' && names.user(text(record, 'validadoPor')) ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {t('compliance.reviewedBy', { name: names.user(text(record, 'validadoPor')) })}
        </p>
      ) : null}
      {pending ? (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon name="cloudOff" className="size-3.5" />
          {t('common.pendingSync')}
        </p>
      ) : null}
      {firm ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {estado === 'EN_REVISION' ? (
            <>
              <Button
                size="sm"
                icon="check"
                onClick={() =>
                  void engine.mutate('CumplimientosHistorial', 'update', record.id, {
                    estado: 'VALIDADO',
                    validadoPor: me.id,
                    ...(text(record, 'fechaCumplimiento')
                      ? {}
                      : { fechaCumplimiento: todayInCancun() }),
                  })
                }
              >
                {t('compliance.validate')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="x"
                onClick={() => {
                  setRejecting(true);
                }}
              >
                {t('compliance.reject')}
              </Button>
            </>
          ) : null}
          {estado === 'VALIDADO' ? (
            <Button
              size="sm"
              variant="ghost"
              icon="refresh"
              onClick={() => {
                setWithdrawing(true);
              }}
            >
              {t('compliance.withdraw')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {rejecting ? (
        <Dialog
          open
          onClose={() => {
            setRejecting(false);
          }}
          title={t('compliance.rejectTitle')}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setRejecting(false);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const previous = text(record, 'notas');
                  const note = reason.trim();
                  void engine.mutate('CumplimientosHistorial', 'update', record.id, {
                    estado: 'RECHAZADO',
                    validadoPor: me.id,
                    ...(note ? { notas: previous ? `${previous}\n${note}` : note } : {}),
                  });
                  setRejecting(false);
                }}
              >
                {t('compliance.reject')}
              </Button>
            </>
          }
        >
          <TextArea
            label={t('compliance.rejectReason')}
            hint={t('compliance.rejectReasonHint')}
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
          />
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={withdrawing}
        title={t('compliance.withdraw')}
        confirmLabel={t('compliance.withdraw')}
        onConfirm={() => {
          void engine.mutate('CumplimientosHistorial', 'update', record.id, {
            estado: 'EN_REVISION',
            validadoPor: null,
          });
          setWithdrawing(false);
        }}
        onClose={() => {
          setWithdrawing(false);
        }}
      >
        <p>{t('compliance.withdrawBody')}</p>
      </ConfirmDialog>
    </li>
  );
}
