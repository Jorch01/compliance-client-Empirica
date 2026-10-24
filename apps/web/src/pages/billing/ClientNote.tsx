import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { text, type Charge } from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { formatDate } from '../../i18n/index.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { buttonClass } from '../../ui/button-class.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import { TextArea, TextField } from '../../ui/Field.tsx';
import { periodText } from '../reports/reports.ts';
import { formatMoney } from './billing.ts';

/**
 * A payment reminder for the client, ready to send from the lawyer's own
 * email (the portal sends nothing): to the client's administrators, with
 * the charge, its total, its date and today's balance. Edited at will.
 */
export function ClientNote({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias', charge.clienteId);
  const to = useMemo(() => {
    const admins = new Set(
      (membresias ?? [])
        .filter((m) => m.estado === 'ACTIVA' && m.rol === 'CLIENTE_ADMIN' && !m.alcance)
        .map((m) => text(m, 'usuarioId')),
    );
    return (usuarios ?? [])
      .filter((u) => admins.has(u.id) && u.estado === 'ACTIVO')
      .map((u) => text(u, 'email') ?? '')
      .filter(Boolean)
      .join(', ');
  }, [usuarios, membresias]);
  // The client's addresses arrive from the local copy; once typed over, they are the person's.
  const [edited, setEdited] = useState<string | null>(null);
  const recipients = edited ?? to;
  const [subject, setSubject] = useState(() =>
    t('billing.clientNote.subjectText', { concepto: charge.concepto }),
  );
  const [body, setBody] = useState(() =>
    t('billing.clientNote.bodyText', {
      concepto: charge.concepto,
      periodo: charge.periodo
        ? t('billing.clientNote.periodText', { period: periodText(charge.periodo) })
        : '',
      total: formatMoney(charge.amounts.total, charge.moneda),
      fecha: formatDate(charge.fechaVencimiento),
      saldo: formatMoney(Math.max(0, charge.saldo), charge.moneda),
      firma: me.name,
    }),
  );
  const [copied, setCopied] = useState(false);
  const addresses = recipients
    .split(/[,;\s]+/)
    .filter((a) => /^[^@\s]+@[^@\s]+$/.test(a))
    .join(',');
  const mailto = `mailto:${addresses}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t('billing.clientNote.title')}
      footer={
        <>
          <Button
            variant="secondary"
            icon="copy"
            onClick={() => {
              void navigator.clipboard.writeText(`${subject}\n\n${body}`).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
          <a href={mailto} className={buttonClass('primary', 'md')}>
            {t('billing.clientNote.openMail')}
          </a>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('billing.clientNote.intro')}</p>
        <TextField
          label={t('billing.clientNote.to')}
          value={recipients}
          onChange={(e) => {
            setEdited(e.target.value);
          }}
        />
        <TextField
          label={t('billing.clientNote.subject')}
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
          }}
        />
        <TextArea
          label={t('billing.clientNote.body')}
          rows={10}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
          }}
        />
        {copied ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('billing.clientNote.copied')}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
