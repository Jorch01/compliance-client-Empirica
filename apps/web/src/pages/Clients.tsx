import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { text, type Row } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { unitTree } from '../domain/scope.ts';
import { formatDate } from '../i18n/index.ts';
import { roleLabel, serviceLabel, unitTypeLabel } from '../i18n/labels.ts';
import { clientName, useScope } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { SelectField } from '../ui/Field.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { ClientForm } from './clients/ClientForm.tsx';
import { UnitForm } from './clients/UnitForm.tsx';
import { InvitationList } from './invitations/InvitationList.tsx';
import { InviteDialog } from './invitations/InviteDialog.tsx';
import { useInvitations } from './invitations/useInvitations.ts';
import { useAdminCall } from './people/adminActions.ts';

function ClientState({ estado }: { estado: unknown }) {
  const { t } = useTranslation();
  return estado === 'INACTIVO' ? (
    <StatusBadge tone="neutral">{t('clients.estados.INACTIVO')}</StatusBadge>
  ) : (
    <StatusBadge tone="success">{t('clients.estados.ACTIVO')}</StatusBadge>
  );
}

function ClientsList({ onNew }: { onNew: (() => void) | null }) {
  const { t } = useTranslation();
  const { clients, setClient } = useScope();
  const names = useNames();
  const units = useRows('Entidades');
  if (!clients.length) {
    return (
      <Card>
        <EmptyState
          icon="building"
          title={t('clients.empty')}
          {...(onNew
            ? {
                action: (
                  <Button icon="plus" onClick={onNew}>
                    {t('clients.new')}
                  </Button>
                ),
              }
            : {})}
        />
      </Card>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {clients.map((c) => {
        const count = (units ?? []).filter((u) => u.clienteId === c.id).length;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                setClient(c.id);
              }}
              className="flex h-full w-full flex-col gap-2 rounded-card border border-border bg-card p-5 text-left text-card-foreground shadow-subtle transition-shadow hover:shadow-card"
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span className="font-display text-2xl font-semibold text-heading">
                  {clientName(c)}
                </span>
                <ClientState estado={c.estado} />
              </span>
              {text(c, 'nombreComercial') ? (
                <span className="text-sm text-muted-foreground">{text(c, 'razonSocial')}</span>
              ) : null}
              <span className="text-sm">
                {[
                  serviceLabel(t, c.servicio),
                  names.user(text(c, 'abogadoResponsableId')),
                  count ? t('clients.unitCount', { count }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The firm's people on this client; the partner assigns and removes them. */
function FirmTeamCard({ client }: { client: Row }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias', client.id);
  const { run, busy, error } = useAdminCall();
  const [adding, setAdding] = useState('');
  const [removing, setRemoving] = useState<Row | null>(null);
  const firmUsers = (usuarios ?? []).filter((u) => u.lado === 'EMPIRICA');
  const assigned = (membresias ?? []).filter(
    (m) => m.estado === 'ACTIVA' && firmUsers.some((u) => u.id === m.usuarioId),
  );
  const candidates = firmUsers.filter(
    (u) =>
      u.estado === 'ACTIVO' &&
      (u.rolBase === 'ABOGADO' || u.rolBase === 'ASISTENTE') &&
      !assigned.some((m) => m.usuarioId === u.id),
  );
  const responsible = text(client, 'abogadoResponsableId');
  const byId = new Map(firmUsers.map((u) => [u.id, u]));

  return (
    <Card title={t('clients.team')}>
      <ul className="space-y-3">
        {responsible && byId.get(responsible) ? (
          <li className="flex items-center gap-3">
            <Avatar name={text(byId.get(responsible) ?? { id: '' }, 'nombre') ?? ''} />
            <div>
              <p className="font-medium">{text(byId.get(responsible) ?? { id: '' }, 'nombre')}</p>
              <p className="text-sm text-muted-foreground">{t('clients.responsable')}</p>
            </div>
          </li>
        ) : null}
        {assigned
          .filter((m) => m.usuarioId !== responsible)
          .map((m) => {
            const u = byId.get(text(m, 'usuarioId') ?? '');
            if (!u) return null;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3">
                <Avatar name={text(u, 'nombre') ?? ''} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{text(u, 'nombre')}</p>
                  <p className="text-sm text-muted-foreground">{roleLabel(t, m.rol)}</p>
                </div>
                {me.isAdmin ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRemoving(m);
                    }}
                  >
                    {t('clients.removeFromTeam')}
                  </Button>
                ) : null}
              </li>
            );
          })}
      </ul>
      {assigned.length === 0 && !responsible ? (
        <p className="text-sm text-muted-foreground">{t('clients.noTeam')}</p>
      ) : null}
      {me.isAdmin && candidates.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-48 flex-1">
            <SelectField
              label={t('clients.addTeam')}
              value={adding}
              onChange={(e) => {
                setAdding(e.target.value);
              }}
              options={[
                { value: '', label: t('clients.chooseLawyer') },
                ...candidates.map((u) => ({
                  value: u.id,
                  label: `${text(u, 'nombre') ?? ''} · ${roleLabel(t, u.rolBase)}`,
                })),
              ]}
            />
          </div>
          <Button
            icon="plus"
            disabled={!adding}
            busy={busy}
            onClick={() => {
              const user = byId.get(adding);
              if (!user) return;
              void run('admin.memberships.save', {
                usuarioId: user.id,
                clienteId: client.id,
                rol: text(user, 'rolBase'),
                estado: 'ACTIVA',
              }).then((ok) => {
                if (ok) setAdding('');
              });
            }}
          >
            {t('common.add')}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-subtle-foreground">
          {error}
        </p>
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          title={t('clients.removeFromTeam')}
          confirmLabel={t('clients.removeFromTeam')}
          danger
          busy={busy}
          error={error}
          onClose={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            void run('admin.memberships.save', {
              usuarioId: text(removing, 'usuarioId'),
              clienteId: client.id,
              rol: text(removing, 'rol'),
              estado: 'REVOCADA',
            }).then((ok) => {
              if (ok) setRemoving(null);
            });
          }}
        >
          <p>{t('clients.removeFromTeamBody')}</p>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

function ClientDetail({ client }: { client: Row }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { setClient, entidades } = useScope();
  const { state, reload } = useInvitations(client.id);
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState<Row | 'new' | null>(null);
  const [inviting, setInviting] = useState(false);
  const canEdit = can(me, 'Clientes', 'update', client.id);
  const canUnits = can(me, 'Entidades', 'create', client.id);
  const tree = unitTree(entidades);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setClient(null);
        }}
        className="mb-2 inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
      >
        <Icon name="chevronRight" className="size-4 rotate-180" />
        {t('shell.allClients')}
      </button>
      <PageHeader
        eyebrow={t('clients.title')}
        title={clientName(client)}
        actions={
          canEdit ? (
            <Button
              variant="secondary"
              icon="more"
              onClick={() => {
                setEditing(true);
              }}
            >
              {t('common.edit')}
            </Button>
          ) : null
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ClientState estado={client.estado} />
          <span>{serviceLabel(t, client.servicio)}</span>
          {text(client, 'rfc') ? (
            <span>
              · {t('clients.rfc')} {text(client, 'rfc')}
            </span>
          ) : null}
          {text(client, 'fechaInicio') ? (
            <span>
              · {t('clients.fechaInicio')}: {formatDate(text(client, 'fechaInicio'))}
            </span>
          ) : null}
        </div>
        {text(client, 'nombreComercial') ? (
          <p className="mt-1 text-sm text-muted-foreground">{text(client, 'razonSocial')}</p>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title={t('clients.units')}
          actions={
            canUnits ? (
              <Button
                size="sm"
                variant="secondary"
                icon="plus"
                onClick={() => {
                  setUnit('new');
                }}
              >
                {t('clients.addUnit')}
              </Button>
            ) : null
          }
        >
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('clients.noUnits')}</p>
          ) : (
            <ul className="space-y-1">
              {tree.map(({ row, depth }) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2"
                  style={{ paddingInlineStart: `${depth * 1.5}rem` }}
                >
                  <Icon
                    name={depth ? 'chevronRight' : 'building'}
                    className="size-4 text-muted-foreground"
                  />
                  <span className="flex-1">
                    <span className="font-medium">{text(row, 'nombre')}</span>
                    <span className="text-sm text-muted-foreground">
                      {' · '}
                      {[unitTypeLabel(t, row.tipo), text(row, 'giro') ?? '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {can(me, 'Entidades', 'update', client.id) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setUnit(row);
                      }}
                    >
                      {t('common.edit')}
                      <span className="sr-only">: {text(row, 'nombre')}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <FirmTeamCard client={client} />
        <Card
          title={t('clients.invitations')}
          className="lg:col-span-2"
          actions={
            <Button
              size="sm"
              icon="plus"
              onClick={() => {
                setInviting(true);
              }}
            >
              {t('clients.invite')}
            </Button>
          }
        >
          <InvitationList state={state} onChanged={reload} showClient={false} />
        </Card>
      </div>
      <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {t('clients.membersHint')}
        <Link href="/usuarios" className="text-link underline underline-offset-2">
          {t('nav.people')}
        </Link>
      </p>

      {editing ? (
        <ClientForm
          client={client}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
      {unit ? (
        <UnitForm
          clientId={client.id}
          units={entidades}
          unit={unit === 'new' ? null : unit}
          onClose={() => {
            setUnit(null);
          }}
        />
      ) : null}
      {inviting ? (
        <InviteDialog
          open
          clientId={client.id}
          onDone={reload}
          onClose={() => {
            setInviting(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The firm's clients: the list (every client), or the selected client's
 * card with its units, team and invitations.
 */
export function ClientsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope, clients, setClient } = useScope();
  const [creating, setCreating] = useState(false);
  const selected = clients.find((c) => c.id === scope.clientId);
  const onNew = me.isAdmin
    ? () => {
        setCreating(true);
      }
    : null;

  return (
    <>
      {selected ? (
        <ClientDetail client={selected} />
      ) : (
        <>
          <PageHeader
            title={t('clients.title')}
            actions={
              onNew ? (
                <Button icon="plus" onClick={onNew}>
                  {t('clients.new')}
                </Button>
              ) : null
            }
          />
          <ClientsList onNew={onNew} />
        </>
      )}
      {creating ? (
        <ClientForm
          client={null}
          onCreated={(id) => {
            setClient(id);
          }}
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}
