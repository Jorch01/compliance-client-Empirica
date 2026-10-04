import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { TABLES, validateFields, type Value } from '@empirica/shared';
import { useScope } from '../portal/scope.ts';
import { useSyncStatus } from '../portal/sync-status.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { CheckboxField, TextArea } from '../ui/Field.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { FeedbackKind } from './context.ts';
import { DetailsBlock } from './DetailsBlock.tsx';
import { diagnostics, recordError } from './diagnostics.ts';

const KINDS: readonly FeedbackKind[] = ['SUGERENCIA', 'ERROR'];

/**
 * "Sugerencias o errores": a suggestion, or something that does not work,
 * sent to the portal's administrators. Saved on the device first, so it
 * also works without network. The technical details go only if the user
 * agrees, and they see them before sending.
 */
export function FeedbackDialog({
  initialKind,
  crash,
  onClose,
}: {
  initialKind: FeedbackKind;
  crash: unknown;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope } = useScope();
  const sync = useSyncStatus();
  const [location] = useLocation();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [message, setMessage] = useState('');
  const [withDetails, setWithDetails] = useState(initialKind === 'ERROR');
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'online' | 'offline' | null>(null);
  const details = diagnostics(sync, `#${location}`);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const fields: Record<string, Value> = {
      // The server sets these too; sent so the device shows it as it will be.
      usuarioId: me.id,
      estado: 'NUEVA',
      tipo: kind,
      mensaje: message.trim(),
      pantalla: `#${location}`,
      clienteContexto: scope.clientId,
      diagnostico: withDetails ? details : null,
    };
    const check = validateFields(TABLES.Sugerencias, fields);
    if (!message.trim() || !check.ok) {
      setError(t('feedback.messageRequired'));
      return;
    }
    setBusy(true);
    try {
      await engine.mutate('Sugerencias', 'create', crypto.randomUUID(), check.fields);
      setSent(navigator.onLine ? 'online' : 'offline');
    } catch (e) {
      recordError(e, 'feedback');
      setError(t('errors.UNKNOWN'));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={t('feedback.title')}
        size="sm"
        footer={<Button onClick={onClose}>{t('common.close')}</Button>}
      >
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-medium" role="status">
            <Icon name="checkCircle" className="size-5 text-success" />
            {sent === 'online' ? t('feedback.sent') : t('feedback.sentOffline')}
          </p>
          <Link href="/sugerencias" onClick={onClose} className={buttonClass('ghost', 'sm')}>
            {t('feedback.seeMine')}
          </Link>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('feedback.title')}
      error={error}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="feedback" icon="send" busy={busy}>
            {t('feedback.send')}
          </Button>
        </>
      }
    >
      <form id="feedback" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <p className="text-sm text-muted-foreground">{t('feedback.intro')}</p>
        {crash ? (
          <p className="rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground">
            {t('feedback.fromCrash')}
          </p>
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium">{t('feedback.kindLabel')}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k}
                className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2.5 ${
                  kind === k ? 'border-primary bg-muted' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="feedback-kind"
                  className="size-4 accent-primary"
                  checked={kind === k}
                  onChange={() => {
                    setKind(k);
                    setWithDetails(k === 'ERROR');
                  }}
                />
                <Icon name={k === 'ERROR' ? 'alert' : 'message'} className="size-4" />
                {t(`feedback.kinds.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          label={kind === 'ERROR' ? t('feedback.errorLabel') : t('feedback.ideaLabel')}
          hint={kind === 'ERROR' ? t('feedback.errorHint') : t('feedback.ideaHint')}
          required
          maxLength={5000}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
          }}
        />
        <CheckboxField
          label={t('feedback.includeDetails')}
          hint={t('feedback.includeDetailsHint')}
          checked={withDetails}
          onChange={(e) => {
            setWithDetails(e.target.checked);
          }}
        />
        {withDetails ? (
          <div>
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => {
                setShowDetails((v) => !v);
              }}
              className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
            >
              <Icon
                name="chevronRight"
                className={`size-4 transition-transform ${showDetails ? 'rotate-90' : ''}`}
              />
              {t('feedback.showDetails')}
            </button>
            {showDetails ? <DetailsBlock value={details} /> : null}
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
