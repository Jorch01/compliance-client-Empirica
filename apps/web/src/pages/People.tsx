import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLIENT_ROLES,
  FIRM_ROLES,
  parseAlcance,
  text,
  type Alcance,
  type Row,
} from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { formatDateTime } from '../i18n/index.ts';
import { roleLabel } from '../i18n/labels.ts';
import { clientName, useScope } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { SelectField, TextField } from '../ui/Field.tsx';
import { StatusBadge, type Tone } from '../ui/StatusBadge.tsx';
import { InvitationList } from './invitations/InvitationList.tsx';
import { InviteDialog } from './invitations/InviteDialog.tsx';
import { ScopePicker } from './invitations/ScopePicker.tsx';
import { useInvitableClients, useInvitations } from './invitations/useInvitations.ts';
import { useAdminCall } from './people/adminActions.ts';

const USER_TONE: Record<string, Tone> = {
  ACTIVO: 'success',
  INVITADO: 'info',
  INACTIVO: 'neutral',
};

function UserState({ estado }: { estado: unknown }) {
  const { t } = useTranslation();
  const value = estado === 'INVITADO' || estado === 'INACTIVO' ? estado : 'ACTIVO';
  return (
    <StatusBadge tone={USER_TONE[value] ?? 'neutral'}>{t(`people.estados.${value}`)}</StatusBadge>
  );
}

type Pending =
  | { kind: 'deactivate' | 'activate' | 'reset'; user: Row }
  | { kind: 'revoke'; user: Row; membership: Row };

/** Deactivate, activate, reset an account or remove a membership: always confirmed. */
function ConfirmAccess({ pending, onClose }: { pending: Pending | null; onClose: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const { run, busy, error, clear } = useAdminCall();
  if (!pending) return null;
  const name = text(pending.user, 'nombre') ?? '';
  const confirm = async (): Promise<void> => {
    const ok =
      pending.kind === 'revoke'
        ? await run('admin.memberships.save', {
            usuarioId: pending.user.id,
            clienteId: text(pending.membership, 'clienteId'),
            rol: text(pending.membership, 'rol'),
            alcance: parseAlcance(pending.membership.alcance),
            puesto: text(pending.membership, 'puesto'),
            estado: 'REVOCADA',
          })
        : await run('admin.users.update', {
            usuarioId: pending.user.id,
            ...(pending.kind === 'reset'
              ? { resetAccount: true }
              : { estado: pending.kind === 'activate' ? 'ACTIVO' : 'INACTIVO' }),
          });
    if (ok) onClose();
  };
  const title =
    pending.kind === 'revoke'
      ? t('people.revokeMembership')
      : pending.kind === 'reset'
        ? t('people.resetAccount')
        : pending.kind === 'activate'
          ? t('people.activate')
          : t('people.deactivate');
  const body =
    pending.kind === 'revoke'
      ? t('people.confirmRevoke', {
          name,
          client: names.client(text(pending.membership, 'clienteId')),
        })
      : pending.kind === 'reset'
        ? t('people.resetAccountHint')
        : pending.kind === 'activate'
          ? t('people.confirmActivate', { name })
          : t('people.confirmDeactivate', { name });
  return (
    <ConfirmDialog
      open
      title={title}
      confirmLabel={title}
      danger={pending.kind !== 'activate'}
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onClose={() => {
        clear();
        onClose();
      }}
    >
      <p>{body}</p>
    </ConfirmDialog>
  );
}

/** The partner changes a client user's role, scope or position. */
function MembershipDialog({ membership, onClose }: { membership: Row; onClose: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const units = useRows('Entidades', text(membership, 'clienteId'));
  const { run, busy, error } = useAdminCall();
  const [rol, setRol] = useState(text(membership, 'rol') ?? 'CLIENTE_COLABORADOR');
  const [alcance, setAlcance] = useState<Alcance | null>(parseAlcance(membership.alcance));
  const [puesto, setPuesto] = useState(text(membership, 'puesto') ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setLocalError(null);
    if (alcance && alcance.entidades.length + alcance.asuntos.length === 0) {
      setLocalError(t('invitations.chooseUnits'));
      return;
    }
    const ok = await run('admin.memberships.save', {
      usuarioId: text(membership, 'usuarioId'),
      clienteId: text(membership, 'clienteId'),
      rol,
      alcance,
      puesto: puesto.trim() || null,
      estado: 'ACTIVA',
    });
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${names.user(text(membership, 'usuarioId'))} · ${names.client(text(membership, 'clienteId'))}`}
      error={localError ?? error}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button busy={busy} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label={t('people.role')}
          value={rol}
          onChange={(e) => {
            setRol(e.target.value);
          }}
          options={CLIENT_ROLES.map((r) => ({ value: r, label: roleLabel(t, r) }))}
        />
        <ScopePicker units={units ?? []} value={alcance} onChange={setAlcance} hubAllowed />
        <TextField
          label={t('invitations.position')}
          optional={t('common.optional')}
          maxLength={120}
          value={puesto}
          onChange={(e) => {
            setPuesto(e.target.value);
          }}
        />
        <p className="text-sm text-muted-foreground">{t('people.accessChangeNote')}</p>
      </div>
    </Dialog>
  );
}

function FirmTeam({ onAsk }: { onAsk: (p: Pending) => void }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const usuarios = useRows('Usuarios');
  const { run, busy, error } = useAdminCall();
  const firm = (usuarios ?? [])
    .filter((u) => u.lado === 'EMPIRICA')
    .sort((a, b) => (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es'));
  return (
    <Card title={t('people.firmTeam')}>
      {error ? (
        <p role="alert" className="mb-2 text-sm font-medium text-danger-subtle-foreground">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {firm.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar name={text(u, 'nombre') ?? ''} />
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-medium">
                {text(u, 'nombre')}
                {u.id === me.id ? (
                  <span className="ml-2 text-sm text-muted-foreground">({t('people.you')})</span>
                ) : null}
              </p>
              <p className="text-sm break-all text-muted-foreground">{text(u, 'email')}</p>
              {text(u, 'ultimoAcceso') ? (
                <p className="text-xs text-muted-foreground">
                  {t('people.lastAccess')}: {formatDateTime(text(u, 'ultimoAcceso'))}
                </p>
              ) : null}
            </div>
            {me.isAdmin && u.id !== me.id ? (
              <label className="text-sm">
                <span className="sr-only">
                  {t('people.role')}: {text(u, 'nombre')}
                </span>
                <select
                  className="rounded-control border border-input bg-card px-3 py-2 text-foreground"
                  value={text(u, 'rolBase') ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    void run('admin.users.update', { usuarioId: u.id, rolBase: e.target.value })
                  }
                >
                  {FIRM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(t, r)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-sm">{roleLabel(t, u.rolBase)}</span>
            )}
            <UserState estado={u.estado} />
            {me.isAdmin && u.id !== me.id ? (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onAsk({ kind: u.estado === 'INACTIVO' ? 'activate' : 'deactivate', user: u });
                  }}
                >
                  {u.estado === 'INACTIVO' ? t('people.activate') : t('people.deactivate')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onAsk({ kind: 'reset', user: u });
                  }}
                >
                  {t('people.resetAccount')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ClientUsers({ onAsk, onEdit }: { onAsk: (p: Pending) => void; onEdit: (m: Row) => void }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias', scope.clientId);
  const users = useMemo(() => new Map((usuarios ?? []).map((u) => [u.id, u])), [usuarios]);
  const rows = (membresias ?? [])
    .filter((m) => users.get(text(m, 'usuarioId') ?? '')?.lado === 'CLIENTE')
    .filter((m) => m.estado !== 'REVOCADA')
    .sort(
      (a, b) =>
        names
          .client(text(a, 'clienteId'))
          .localeCompare(names.client(text(b, 'clienteId')), 'es') ||
        names.user(text(a, 'usuarioId')).localeCompare(names.user(text(b, 'usuarioId')), 'es'),
    );
  return (
    <Card title={me.isFirm ? t('people.clientUsers') : t('people.companyUsers')}>
      {rows.length === 0 ? (
        <EmptyState icon="users" title={t('people.noUsers')} />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((m) => {
            const user = users.get(text(m, 'usuarioId') ?? '');
            if (!user) return null;
            const alcance = parseAlcance(m.alcance);
            const scopeText = alcance
              ? alcance.entidades
                  .map((id) => names.unit(id))
                  .filter(Boolean)
                  .join(', ')
              : t('people.hub');
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={text(user, 'nombre') ?? ''} tone="accent" />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{text(user, 'nombre')}</p>
                  <p className="text-sm break-all text-muted-foreground">{text(user, 'email')}</p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      scope.clientId ? '' : names.client(text(m, 'clienteId')),
                      roleLabel(t, m.rol),
                      scopeText,
                      text(m, 'puesto') ?? '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {m.estado === 'PENDIENTE_APROBACION' ? (
                  <StatusBadge tone="warning">
                    {t('invitations.estados.PENDIENTE_APROBACION')}
                  </StatusBadge>
                ) : user.estado ? (
                  <UserState estado={user.estado} />
                ) : null}
                {me.isAdmin ? (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onEdit(m);
                      }}
                    >
                      {t('people.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAsk({ kind: 'revoke', user, membership: m });
                      }}
                    >
                      {t('people.revokeMembership')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onAsk({ kind: 'reset', user });
                      }}
                    >
                      {t('people.resetAccount')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * Who has access: the firm's team, each client's users with their role and
 * scope, and the invitations. Changes of access are made online.
 */
export function PeoplePage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope, clients } = useScope();
  const invitable = useInvitableClients();
  const { state, reload } = useInvitations(scope.clientId);
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const client = clients.find((c) => c.id === scope.clientId);

  return (
    <>
      <PageHeader
        eyebrow={client ? clientName(client) : undefined}
        title={t('people.title')}
        actions={
          me.isAdmin || invitable.length > 0 ? (
            <Button
              icon="plus"
              onClick={() => {
                setInviting(true);
              }}
            >
              {t('people.invite')}
            </Button>
          ) : null
        }
      />
      <div className="space-y-6">
        <Card title={t('people.invitations')}>
          <InvitationList state={state} onChanged={reload} showClient={!scope.clientId} />
        </Card>
        {me.isFirm ? (
          <FirmTeam
            onAsk={(p) => {
              setPending(p);
            }}
          />
        ) : null}
        <ClientUsers
          onAsk={(p) => {
            setPending(p);
          }}
          onEdit={(m) => {
            setEditing(m);
          }}
        />
      </div>
      {inviting ? (
        <InviteDialog
          open
          clientId={scope.clientId}
          onDone={reload}
          onClose={() => {
            setInviting(false);
          }}
        />
      ) : null}
      <ConfirmAccess
        pending={pending}
        onClose={() => {
          setPending(null);
        }}
      />
      {editing ? (
        <MembershipDialog
          membership={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}
