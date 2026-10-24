import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { MONEDAS, chargesOf, isBillingOnly, type Moneda } from '@empirica/shared';
import { useRows } from '../data/hooks.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { clientName, useScope } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, EmptyState, Spinner } from '../ui/Card.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { BillingFrame } from './billing/BillingHeader.tsx';
import { formatMoney } from './billing/billing.ts';
import { ClientForm } from './clients/ClientForm.tsx';

type Amounts = Record<Moneda, number>;
const zero = (): Amounts => ({ MXN: 0, USD: 0 });

/** "$46,400.00", and the dollars apart when there are any. */
function money(a: Amounts): string {
  return MONEDAS.filter((m) => m === 'MXN' || a[m] > 0.005)
    .map((m) => formatMoney(a[m], m))
    .join(' · ');
}

/**
 * "Cobranza · Clientes" (D87): every client the user bills, those of the
 * tracking portal and those the firm only bills (a lawsuit, say), with what
 * each one owes today; a partner opens a client only billed from here.
 */
export function BillingClientsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { clients, setClient } = useScope();
  const [, navigate] = useLocation();
  const [creating, setCreating] = useState(false);
  const honorarios = useRows('Honorarios');
  const cobros = useRows('Cobros');
  const pagos = useRows('Pagos');
  const today = todayInCancun();

  const rows = useMemo(() => {
    if (!honorarios || !cobros || !pagos) return null;
    const charges = chargesOf({ honorarios, cobros, pagos }, today);
    return clients.map((c) => {
      const owed = zero();
      const overdue = zero();
      for (const ch of charges) {
        if (ch.clienteId !== c.id || ch.status === 'CANCELADO' || ch.saldo <= 0.005) continue;
        owed[ch.moneda] += ch.saldo;
        if (ch.status === 'VENCIDO') overdue[ch.moneda] += ch.saldo;
      }
      const fees = honorarios.filter((h) => h.clienteId === c.id && h.estado === 'ACTIVO').length;
      return { client: c, owed, overdue, fees };
    });
  }, [clients, honorarios, cobros, pagos, today]);

  const open = (clientId: string, path: string): void => {
    setClient(clientId);
    navigate(path);
  };

  return (
    <BillingFrame
      tab="clients"
      title={t('billing.clients.title')}
      intro={t('billing.clients.intro')}
      actions={
        me.isAdmin ? (
          <Button
            icon="plus"
            onClick={() => {
              setCreating(true);
            }}
          >
            {t('billing.clients.new')}
          </Button>
        ) : null
      }
    >
      <p className="mb-4 max-w-3xl rounded-control border-l-4 border-accent-strong bg-accent px-3 py-2 text-sm text-accent-foreground">
        {me.isAdmin ? t('billing.clients.hint') : t('billing.clients.partnersOpen')}
      </p>
      {!rows ? (
        <Spinner label={t('common.loading')} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="building" title={t('billing.clients.empty')} />
        </Card>
      ) : (
        <Card>
          <div
            className="relative overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label={t('billing.clients.title')}
          >
            <table className="w-full text-sm">
              <caption className="sr-only">{t('billing.clients.title')}</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t('billing.clients.client')}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t('billing.clients.fees')}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t('billing.clients.owed')}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t('billing.clients.overdue')}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">{t('billing.clients.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ client, owed, overdue, fees }) => {
                  const name = clientName(client);
                  const late = overdue.MXN > 0.005 || overdue.USD > 0.005;
                  return (
                    <tr key={client.id} className="border-b border-border last:border-0">
                      <th scope="row" className="py-3 pr-3 text-left font-normal">
                        <span className="block font-medium">{name}</span>
                        <span className="mt-1 inline-block">
                          <StatusBadge tone={isBillingOnly(client) ? 'info' : 'neutral'}>
                            {isBillingOnly(client)
                              ? t('billing.clients.billingOnly')
                              : t('billing.clients.tracking')}
                          </StatusBadge>
                        </span>
                      </th>
                      <td className="py-3 pr-3 text-right tabular-nums">{fees}</td>
                      <td className="py-3 pr-3 text-right tabular-nums">{money(owed)}</td>
                      <td className="py-3 pr-3 text-right tabular-nums">
                        {late ? (
                          <StatusBadge tone="danger">{money(overdue)}</StatusBadge>
                        ) : (
                          money(overdue)
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              open(client.id, '/cobranza');
                            }}
                          >
                            {t('billing.clients.see')}
                            <span className="sr-only">: {name}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              open(client.id, '/clientes');
                            }}
                          >
                            {t('billing.clients.card')}
                            <span className="sr-only">: {name}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {creating ? (
        <ClientForm
          client={null}
          billingOnly
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </BillingFrame>
  );
}
