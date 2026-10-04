import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EstadoInvitacion, InvitationOutcome, InvitationView } from '@empirica/shared';
import { useNames } from '../../data/names.ts';
import { apiErrorText } from '../../i18n/errors.ts';
import { formatDate } from '../../i18n/index.ts';
import { roleLabel } from '../../i18n/labels.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { EmptyState, Spinner } from '../../ui/Card.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { StatusBadge, type Tone } from '../../ui/StatusBadge.tsx';
import { ShareLink } from './ShareLink.tsx';
import type { InvitationsState } from './useInvitations.ts';

const TONE: Record<EstadoInvitacion, Tone> = {
  PENDIENTE_APROBACION: 'warning',
  ENVIADA: 'info',
  ACEPTADA: 'success',
  VENCIDA: 'neutral',
  RECHAZADA: 'neutral',
};

type Action = 'approve' | 'reject' | 'resend' | 'revoke';

/** Pending approval first, then the open ones, then the rest, newest first within each. */
const ORDER: Record<EstadoInvitacion, number> = {
  PENDIENTE_APROBACION: 0,
  ENVIADA: 1,
  VENCIDA: 2,
  ACEPTADA: 3,
  RECHAZADA: 4,
};

function InvitationRow({
  inv,
  showClient,
  onChanged,
}: {
  inv: InvitationView;
  showClient: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { me, call, engine } = usePortal();
  const names = useNames();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<{ token: string; venceEn: string | null } | null>(null);

  const manages =
    me.isAdmin ||
    (me.isFirm && me.clients.some((c) => c.id === inv.clienteId && c.rol === 'ABOGADO'));
  const own = inv.invitadoPor === me.id && inv.estado === 'PENDIENTE_APROBACION';
  const actions: Action[] = [];
  if (manages && inv.estado === 'PENDIENTE_APROBACION') actions.push('approve', 'reject');
  if (manages && (inv.estado === 'ENVIADA' || inv.estado === 'VENCIDA')) actions.push('resend');
  if ((manages || own) && ['PENDIENTE_APROBACION', 'ENVIADA', 'VENCIDA'].includes(inv.estado)) {
    if (!actions.includes('reject')) actions.push('revoke');
  }

  const run = async (action: Action): Promise<void> => {
    setBusy(action);
    setError(null);
    try {
      const { data } =
        action === 'approve' || action === 'reject'
          ? await call<InvitationOutcome>('invitations.decide', {
              invitacionId: inv.id,
              approve: action === 'approve',
            })
          : await call<InvitationOutcome>(
              action === 'resend' ? 'invitations.resend' : 'invitations.revoke',
              { invitacionId: inv.id },
            );
      if (data.token) setToken({ token: data.token, venceEn: data.invitation.venceEn });
      void engine.sync();
      onChanged();
    } catch (e) {
      setError(apiErrorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  const label: Record<Action, string> = {
    approve: t('invitations.approve'),
    reject: t('invitations.reject'),
    resend: t('invitations.resend'),
    revoke: t('invitations.revoke'),
  };
  const units = inv.alcance?.entidades.map((id) => names.unit(id)).filter(Boolean) ?? [];
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="font-medium">{inv.nombre ?? inv.email}</p>
          <p className="text-sm break-all text-muted-foreground">{inv.email}</p>
          <p className="text-sm text-muted-foreground">
            {[
              roleLabel(t, inv.rol),
              showClient ? names.client(inv.clienteId) : '',
              units.length ? units.join(', ') : '',
              inv.puesto ?? '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              inv.invitadoPor
                ? t('invitations.invitedBy', { name: names.user(inv.invitadoPor) || '—' })
                : '',
              inv.estado === 'ENVIADA' && inv.venceEn
                ? t('invitations.expires', { date: formatDate(inv.venceEn) })
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <StatusBadge tone={TONE[inv.estado]}>{t(`invitations.estados.${inv.estado}`)}</StatusBadge>
      </div>
      {actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === 'approve' ? 'primary' : a === 'resend' ? 'secondary' : 'ghost'}
              icon={
                a === 'approve' ? 'check' : a === 'resend' ? 'refresh' : a === 'reject' ? 'x' : 'x'
              }
              busy={busy === a}
              disabled={busy !== null}
              onClick={() => void run(a)}
            >
              {label[a]}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-subtle-foreground">
          {error}
        </p>
      ) : null}
      {token ? (
        <div className="mt-3">
          <ShareLink
            token={token.token}
            email={inv.email}
            name={inv.nombre ?? inv.email}
            venceEn={token.venceEn}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The invitations a user may see and act on (online only). */
export function InvitationList({
  state,
  onChanged,
  showClient,
}: {
  state: InvitationsState;
  onChanged: () => void;
  showClient: boolean;
}) {
  const { t } = useTranslation();
  if (state.status === 'loading') return <Spinner label={t('app.loading')} />;
  if (state.status === 'offline') {
    return (
      <p className="flex items-center gap-2 rounded-control border border-border bg-muted px-4 py-3 text-sm">
        <Icon name="cloudOff" className="size-5 text-muted-foreground" />
        {t('invitations.online')}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-danger-subtle-foreground">
        {t('invitations.loadFailed')}
      </p>
    );
  }
  if (!state.invitations.length) {
    return <EmptyState icon="mail" title={t('people.noInvitations')} />;
  }
  const sorted = [...state.invitations].sort(
    (a, b) => ORDER[a.estado] - ORDER[b.estado] || b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <ul className="divide-y divide-border">
      {sorted.map((inv) => (
        <InvitationRow key={inv.id} inv={inv} showClient={showClient} onChanged={onChanged} />
      ))}
    </ul>
  );
}
