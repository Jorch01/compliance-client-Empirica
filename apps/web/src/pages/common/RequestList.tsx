import { useTranslation } from 'react-i18next';
import { ESTADOS_SOLICITUD, text, type Row } from '@empirica/shared';
import { usePendingIds } from '../../data/hooks.ts';
import { useNames } from '../../data/names.ts';
import { can } from '../../domain/access.ts';
import { formatDate } from '../../i18n/index.ts';
import { areaLabel, priorityLabel } from '../../i18n/labels.ts';
import { useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { EmptyState } from '../../ui/Card.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { StatusBadge, type Tone } from '../../ui/StatusBadge.tsx';

type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

const REQUEST_TONE: Record<EstadoSolicitud, Tone> = {
  RECIBIDA: 'info',
  EN_ANALISIS: 'info',
  DENTRO_IGUALA: 'success',
  FUERA_IGUALA_COTIZADA: 'warning',
  ACEPTADA: 'success',
  RECHAZADA: 'neutral',
  CONVERTIDA: 'success',
};

const isEstado = (v: unknown): v is EstadoSolicitud =>
  typeof v === 'string' && (ESTADOS_SOLICITUD as readonly string[]).includes(v);

/**
 * Requests to the firm: what was asked, by whom, where it stands. The firm
 * moves them along from here (offline too).
 */
export function RequestList({ requests }: { requests: readonly Row[] }) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const { scope } = useScope();
  const names = useNames();
  const pending = usePendingIds('Solicitudes');
  if (!requests.length) {
    return (
      <EmptyState
        icon="inbox"
        title={t('requests.empty')}
        {...(me.isFirm ? {} : { body: t('requests.emptyClient') })}
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {requests.map((r) => {
        const estado = isEstado(r.estado) ? r.estado : 'RECIBIDA';
        const clienteId = text(r, 'clienteId');
        const editable = me.isFirm && can(me, 'Solicitudes', 'update', clienteId);
        const meta = [
          scope.clientId ? '' : names.client(clienteId),
          names.unit(text(r, 'entidadId')),
          areaLabel(t, r.area),
          r.urgencia ? `${t('requests.urgency')}: ${priorityLabel(t, r.urgencia)}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const author = names.user(text(r, 'createdBy'));
        return (
          <li key={r.id} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-medium">{text(r, 'titulo')}</p>
                {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
                <p className="text-sm text-muted-foreground">
                  {[
                    author ? t('requests.from', { name: author }) : '',
                    formatDate(text(r, 'createdAt')),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {text(r, 'descripcion') ? (
                  <p className="mt-2 text-sm whitespace-pre-line">{text(r, 'descripcion')}</p>
                ) : null}
                {pending.has(r.id) ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon name="cloudOff" className="size-3.5" />
                    {t('common.pendingSync')}
                  </p>
                ) : null}
              </div>
              {editable ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="sr-only">{t('requests.changeStatus')}</span>
                  <select
                    className="rounded-control border border-input bg-card px-3 py-2 text-foreground"
                    value={estado}
                    onChange={(e) =>
                      void engine.mutate('Solicitudes', 'update', r.id, { estado: e.target.value })
                    }
                  >
                    {ESTADOS_SOLICITUD.map((s) => (
                      <option key={s} value={s}>
                        {t(`requests.estados.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <StatusBadge tone={REQUEST_TONE[estado]}>
                  {t(`requests.estados.${estado}`)}
                </StatusBadge>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
