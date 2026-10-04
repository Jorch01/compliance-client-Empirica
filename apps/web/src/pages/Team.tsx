import { useTranslation } from 'react-i18next';
import { text, type Row } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { roleLabel } from '../i18n/labels.ts';
import { useScope } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';

function PersonList({ people, note }: { people: Row[]; note: (u: Row) => string }) {
  const { t } = useTranslation();
  if (!people.length) return <EmptyState icon="users" title={t('team.empty')} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {people.map((u) => (
        <li key={u.id} className="flex items-start gap-3">
          <Avatar name={text(u, 'nombre') ?? ''} />
          <div className="min-w-0">
            <p className="font-medium">{text(u, 'nombre')}</p>
            <p className="text-sm text-muted-foreground">{note(u)}</p>
            {text(u, 'email') ? (
              <a
                href={`mailto:${text(u, 'email') ?? ''}`}
                className="text-sm break-all text-link underline underline-offset-2"
              >
                {text(u, 'email')}
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Su equipo": the firm's people assigned to the client (the responsible
 * lawyer first) and the colleagues of their company they can see.
 */
export function TeamPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope, clients } = useScope();
  const usuarios = useRows('Usuarios');
  const membresias = useRows('Membresias', scope.clientId);
  const client = clients.find((c) => c.id === scope.clientId);
  const responsible = client ? text(client, 'abogadoResponsableId') : null;
  const byName = (a: Row, b: Row): number =>
    (text(a, 'nombre') ?? '').localeCompare(text(b, 'nombre') ?? '', 'es');
  const firm = (usuarios ?? [])
    .filter((u) => u.lado === 'EMPIRICA')
    .sort((a, b) => (a.id === responsible ? -1 : b.id === responsible ? 1 : byName(a, b)));
  const puesto = new Map(
    (membresias ?? []).flatMap((m) => {
      const value = text(m, 'puesto');
      return value ? [[text(m, 'usuarioId') ?? '', value] as const] : [];
    }),
  );
  const colleagues = (usuarios ?? [])
    .filter((u) => u.lado === 'CLIENTE' && u.id !== me.id)
    .sort(byName);

  return (
    <>
      <PageHeader title={t('team.title')} />
      <div className="space-y-6">
        <Card title={t('team.firm')}>
          <PersonList
            people={firm}
            note={(u) => (u.id === responsible ? t('team.responsible') : roleLabel(t, u.rolBase))}
          />
        </Card>
        <Card title={t('team.colleagues')}>
          <PersonList
            people={colleagues}
            note={(u) => puesto.get(u.id) ?? roleLabel(t, u.rolBase)}
          />
        </Card>
      </div>
    </>
  );
}
