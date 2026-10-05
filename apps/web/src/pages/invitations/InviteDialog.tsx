import { useMemo, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLIENT_ROLES,
  FIRM_ROLES,
  type Alcance,
  type InvitationCreate,
  type InvitationOutcome,
  type Lado,
  type Rol,
} from '@empirica/shared';
import { useRows } from '../../data/hooks.ts';
import { apiErrorText } from '../../i18n/errors.ts';
import { roleLabel } from '../../i18n/labels.ts';
import { clientName, useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { CheckboxField, SelectField, TextField } from '../../ui/Field.tsx';
import { ScopePicker } from './ScopePicker.tsx';
import { EmailOutcome, ShareLink } from './ShareLink.tsx';
import { useInvitableClients } from './useInvitations.ts';

interface Form {
  lado: Lado;
  nombre: string;
  email: string;
  rol: Rol;
  clienteId: string;
  alcance: Alcance | null;
  puesto: string;
  idioma: 'es' | 'en';
  /** The portal emails the link (F5); it is shown here either way. */
  enviarCorreo: boolean;
}

export function InviteDialog({
  open,
  onClose,
  onDone,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  clientId?: string | null;
}) {
  const { t } = useTranslation();
  const { me, call, engine } = usePortal();
  const { clients } = useScope();
  const allUnits = useRows('Entidades');
  const invitable = useInvitableClients();
  const [form, setForm] = useState<Form>(() => ({
    lado: 'CLIENTE',
    nombre: '',
    email: '',
    rol: 'CLIENTE_COLABORADOR',
    clienteId: clientId && invitable.includes(clientId) ? clientId : (invitable[0] ?? ''),
    alcance: null,
    puesto: '',
    idioma: 'es',
    enviarCorreo: true,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<InvitationOutcome | null>(null);

  const access = me.clients.find((c) => c.id === form.clienteId);
  // A client admin limited to some units invites only within them.
  const inviterScoped = !me.isFirm && Boolean(access?.alcance);
  const units = useMemo(
    () => (allUnits ?? []).filter((u) => u.clienteId === form.clienteId),
    [allUnits, form.clienteId],
  );
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
  };
  const roles: readonly Rol[] = form.lado === 'EMPIRICA' ? FIRM_ROLES : CLIENT_ROLES;
  const needsClient = form.lado === 'CLIENTE';
  const clientOptional = form.lado === 'EMPIRICA' && form.rol !== 'SOCIO_ADMIN';

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (needsClient && !form.clienteId) {
      setError(t('requests.chooseClient'));
      return;
    }
    const alcance = needsClient ? form.alcance : null;
    if (alcance?.entidades.length === 0) {
      setError(t('invitations.chooseUnits'));
      return;
    }
    if (inviterScoped && !alcance) {
      setError(t('invitations.chooseUnits'));
      return;
    }
    const payload: InvitationCreate = {
      email: form.email.trim(),
      nombre: form.nombre.trim(),
      lado: form.lado,
      rol: form.rol,
      idioma: form.idioma,
      ...((needsClient || clientOptional) && form.clienteId ? { clienteId: form.clienteId } : {}),
      ...(needsClient ? { alcance } : {}),
      ...(needsClient && form.puesto.trim() ? { puesto: form.puesto.trim() } : {}),
      // A client admin's invitation waits for the firm: the link goes out once approved.
      ...(me.isFirm ? { enviarCorreo: form.enviarCorreo } : {}),
    };
    setBusy(true);
    try {
      const { data } = await call<InvitationOutcome>('invitations.create', payload);
      setOutcome(data);
      onDone();
      void engine.sync();
    } catch (e) {
      setError(apiErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const clientChoices = clients.filter((c) => invitable.includes(c.id));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      error={error}
      title={t('invitations.title')}
      footer={
        outcome ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="invite" icon="send" busy={busy}>
              {t('invitations.create')}
            </Button>
          </>
        )
      }
    >
      {outcome ? (
        <div className="space-y-3">
          <EmailOutcome emailedTo={outcome.emailedTo} emailError={outcome.emailError} />
          {outcome.token ? (
            <ShareLink
              token={outcome.token}
              email={outcome.invitation.email}
              name={form.nombre.trim()}
              venceEn={outcome.invitation.venceEn}
            />
          ) : null}
          {outcome.invitation.estado === 'PENDIENTE_APROBACION' ? (
            <p role="status">{t('invitations.pendingNote')}</p>
          ) : null}
          {outcome.alreadyActive ? <p role="status">{t('invitations.alreadyActive')}</p> : null}
        </div>
      ) : (
        <form id="invite" className="space-y-4" onSubmit={(e) => void submit(e)}>
          {me.isAdmin ? (
            <SelectField
              label={t('invitations.side')}
              value={form.lado}
              onChange={(e) => {
                const lado = e.target.value as Lado;
                setForm((f) => ({
                  ...f,
                  lado,
                  rol: lado === 'EMPIRICA' ? 'ABOGADO' : 'CLIENTE_COLABORADOR',
                  alcance: null,
                }));
              }}
              options={[
                { value: 'CLIENTE', label: t('invitations.sideClient') },
                { value: 'EMPIRICA', label: t('invitations.sideFirm') },
              ]}
            />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t('invitations.name')}
              required
              maxLength={120}
              autoComplete="off"
              value={form.nombre}
              onChange={(e) => {
                set('nombre', e.target.value);
              }}
            />
            <TextField
              label={t('invitations.email')}
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              value={form.email}
              onChange={(e) => {
                set('email', e.target.value);
              }}
            />
          </div>
          <SelectField
            label={t('invitations.role')}
            value={form.rol}
            onChange={(e) => {
              set('rol', e.target.value as Rol);
            }}
            options={roles.map((r) => ({ value: r, label: roleLabel(t, r) }))}
          />
          {(needsClient || clientOptional) && clientChoices.length > 0 ? (
            <SelectField
              label={t('invitations.client')}
              value={form.clienteId}
              onChange={(e) => {
                setForm((f) => ({ ...f, clienteId: e.target.value, alcance: null }));
              }}
              options={[
                ...(clientOptional ? [{ value: '', label: t('invitations.noClient') }] : []),
                ...clientChoices.map((c) => ({ value: c.id, label: clientName(c) })),
              ]}
            />
          ) : null}
          {needsClient ? (
            <>
              <ScopePicker
                units={units}
                value={
                  inviterScoped && !form.alcance ? { entidades: [], asuntos: [] } : form.alcance
                }
                onChange={(v) => {
                  set('alcance', v);
                }}
                hubAllowed={!inviterScoped}
              />
              <TextField
                label={t('invitations.position')}
                optional={t('common.optional')}
                hint={t('invitations.positionHint')}
                maxLength={120}
                value={form.puesto}
                onChange={(e) => {
                  set('puesto', e.target.value);
                }}
              />
            </>
          ) : null}
          <SelectField
            label={t('invitations.language')}
            value={form.idioma}
            onChange={(e) => {
              set('idioma', e.target.value === 'en' ? 'en' : 'es');
            }}
            options={[
              { value: 'es', label: t('language.es') },
              { value: 'en', label: t('language.en') },
            ]}
          />
          {me.isFirm ? (
            <CheckboxField
              label={t('invitations.emailOption')}
              hint={t('invitations.emailOptionHint')}
              checked={form.enviarCorreo}
              onChange={(e) => {
                set('enviarCorreo', e.target.checked);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('invitations.pendingNote')}</p>
          )}
        </form>
      )}
    </Dialog>
  );
}
