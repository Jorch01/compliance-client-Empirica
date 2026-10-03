import { useTranslation } from 'react-i18next';
import { text } from '@empirica/shared';
import { unitTree } from '../domain/scope.ts';
import { usePortal } from '../session/context.ts';
import { Icon } from '../ui/Icon.tsx';
import { clientName, useScope } from './scope.ts';

const SELECT =
  'w-full min-w-0 appearance-none truncate rounded-control border border-input bg-card py-2 pr-8 pl-9 text-sm font-medium text-foreground';

/**
 * The client and the unit being looked at. Firm users can pick "all
 * clients"; the unit list appears when the client has units.
 */
export function ScopeSelect() {
  const { t } = useTranslation();
  const { scope, setClient, setUnit, clients, entidades } = useScope();
  const { me } = usePortal();
  const tree = unitTree(entidades);
  const showClient = me.isFirm || clients.length > 1;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap">
      {showClient ? (
        <label className="relative min-w-0 flex-1 basis-48 lg:max-w-72" data-tour="client">
          <span className="sr-only">{t('shell.client')}</span>
          <Icon
            name="building"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <select
            className={SELECT}
            value={scope.clientId ?? ''}
            onChange={(e) => {
              setClient(e.target.value || null);
            }}
          >
            {me.isFirm ? <option value="">{t('shell.allClients')}</option> : null}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientName(c)}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </label>
      ) : null}
      {scope.clientId && tree.length > 0 ? (
        <label className="relative min-w-0 flex-1 basis-48 lg:max-w-64" data-tour="unit">
          <span className="sr-only">{t('shell.unit')}</span>
          <Icon
            name="list"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <select
            className={SELECT}
            value={scope.unitId ?? ''}
            onChange={(e) => {
              setUnit(e.target.value || null);
            }}
          >
            <option value="">{t('shell.hub')}</option>
            {tree.map(({ row, depth }) => (
              <option key={row.id} value={row.id}>
                {`${'  '.repeat(depth)}${depth ? '└ ' : ''}${text(row, 'nombre') ?? ''}`}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </label>
      ) : null}
    </div>
  );
}
