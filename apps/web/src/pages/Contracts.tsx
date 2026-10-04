import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { contractStatus, nextKeyDate, text, type Row } from '@empirica/shared';
import { usePendingIds } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { daysBetween, todayInCancun } from '../domain/deadlines.ts';
import { useScope, useScopedAllRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { TextField } from '../ui/Field.tsx';
import { FilterButtons } from '../ui/FilterButtons.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { DueDate } from './common/Semaforo.tsx';
import { InternalMark } from './common/VisibilityField.tsx';
import { ContractForm } from './contracts/ContractForm.tsx';
import { CONTRACT_TONE } from './contracts/contracts.ts';

type Filter = 'active' | 'soon' | 'ended' | 'deleted' | 'all';

/** Key dates within this many days count as coming up. */
const SOON = 60;

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

function ContractItem({ contract, pending }: { contract: Row; pending: boolean }) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const today = todayInCancun();
  const status = contractStatus(contract, today);
  const key = nextKeyDate(contract, today);
  const clienteId = text(contract, 'clienteId');
  const restorable = Boolean(contract.deleted) && can(me, 'Contratos', 'delete', clienteId);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <p>
          <Link
            href={`/contratos/${contract.id}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {text(contract, 'contraparte')}
          </Link>
          {me.isFirm && contract.visibilidad === 'INTERNO' ? <InternalMark /> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {[
            scope.clientId ? '' : names.client(clienteId),
            names.unit(text(contract, 'entidadId')),
            text(contract, 'tipo') ?? '',
            contract.renovacionAutomatica === true ? t('contracts.autoRenews') : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {pending ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="cloudOff" className="size-3.5" />
            {t('common.pendingSync')}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={CONTRACT_TONE[status]}>{t(`contracts.status.${status}`)}</StatusBadge>
        {key ? (
          <span>
            <span className="text-muted-foreground">{t(`contracts.keyDate.${key.kind}`)}: </span>
            <DueDate date={key.date} today={today} />
          </span>
        ) : null}
        {restorable ? (
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onClick={() => void engine.mutate('Contratos', 'restore', contract.id)}
          >
            {t('matters.restore')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * "Contratos": the contracts in view with their next key date (the last
 * day to give notice, then the end of the term). The firm records them; a
 * client follows the shared ones.
 */
export function ContractsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients } = useScope();
  const [, navigate] = useLocation();
  const contracts = useScopedAllRows('Contratos');
  const pending = usePendingIds('Contratos');
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = clients.some((c) => can(me, 'Contratos', 'create', c.id));
  const canRestore = me.isFirm && clients.some((c) => can(me, 'Contratos', 'delete', c.id));
  const today = todayInCancun();

  const shown = useMemo(() => {
    const q = fold(query.trim());
    const keyOf = (c: Row): string => nextKeyDate(c, today)?.date ?? '9999';
    return (contracts ?? [])
      .filter((c) => {
        if (filter === 'deleted') return Boolean(c.deleted);
        if (c.deleted) return false;
        const status = contractStatus(c, today);
        if (filter === 'active') return status !== 'vencido';
        if (filter === 'ended') return status === 'vencido';
        if (filter === 'soon') {
          const key = nextKeyDate(c, today);
          return key !== null && daysBetween(today, key.date) <= SOON;
        }
        return true;
      })
      .filter(
        (c) =>
          !q ||
          fold(text(c, 'contraparte') ?? '').includes(q) ||
          fold(text(c, 'tipo') ?? '').includes(q),
      )
      .sort(
        (a, b) =>
          keyOf(a).localeCompare(keyOf(b)) ||
          (text(a, 'contraparte') ?? '').localeCompare(text(b, 'contraparte') ?? '', 'es'),
      );
  }, [contracts, filter, query, today]);

  const filters: { value: Filter; label: string }[] = [
    { value: 'active', label: t('contracts.filters.active') },
    { value: 'soon', label: t('contracts.filters.soon') },
    { value: 'ended', label: t('contracts.filters.ended') },
    ...(canRestore ? [{ value: 'deleted' as const, label: t('contracts.filters.deleted') }] : []),
    { value: 'all', label: t('contracts.filters.all') },
  ];

  return (
    <>
      <PageHeader
        title={t('contracts.title')}
        actions={
          canCreate ? (
            <Button
              icon="plus"
              onClick={() => {
                setCreating(true);
              }}
            >
              {t('contracts.new')}
            </Button>
          ) : undefined
        }
      >
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {me.isFirm ? t('contracts.intro') : t('contracts.introClient')}
        </p>
      </PageHeader>
      <Card>
        <div className="mb-4 space-y-3">
          <FilterButtons
            label={t('contracts.filterLabel')}
            value={filter}
            options={filters}
            onChange={setFilter}
          />
          <div className="max-w-sm">
            <TextField
              label={t('common.search')}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </div>
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon="contract"
            title={
              (contracts ?? []).some((c) => !c.deleted) || me.isFirm
                ? t('contracts.empty')
                : t('contracts.emptyClient')
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((c) => (
              <ContractItem key={c.id} contract={c} pending={pending.has(c.id)} />
            ))}
          </ul>
        )}
      </Card>
      {creating ? (
        <ContractForm
          onClose={() => {
            setCreating(false);
          }}
          onSaved={(id) => {
            navigate(`/contratos/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
