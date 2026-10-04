import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'wouter';
import { text } from '@empirica/shared';
import { usePendingIds, useRow } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { can } from '../domain/access.ts';
import { formatDateTime } from '../i18n/index.ts';
import { areaLabel, priorityLabel } from '../i18n/labels.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Comments } from './common/Comments.tsx';
import { Documents } from './common/Documents.tsx';
import { Perimeter } from './common/Perimeter.tsx';
import { MatterForm } from './matters/MatterForm.tsx';
import { REQUEST_TONE, requestState, type EstadoSolicitud } from './requests/requests.ts';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{term}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** The firm's choices for a request still being worked on, in the order they come. */
const CLASSIFY: readonly {
  estado: EstadoSolicitud;
  key: 'analyze' | 'inside' | 'outside' | 'accept';
}[] = [
  { estado: 'EN_ANALISIS', key: 'analyze' },
  { estado: 'DENTRO_IGUALA', key: 'inside' },
  { estado: 'FUERA_IGUALA_COTIZADA', key: 'outside' },
  { estado: 'ACEPTADA', key: 'accept' },
];

/**
 * A request to the firm: what was asked, by whom, where it stands. The firm
 * classifies it against what the retainer covers, turns it down or turns it
 * into a matter; the client follows it and talks with the firm about it.
 */
export function RequestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { me, engine } = usePortal();
  const [, navigate] = useLocation();
  const names = useNames();
  const request = useRow('Solicitudes', id);
  const client = useRow(
    'Clientes',
    request ? (text(request, 'clienteId') ?? undefined) : undefined,
  );
  const matter = useRow(
    'Asuntos',
    request ? (text(request, 'asuntoIdGenerado') ?? undefined) : undefined,
  );
  const pending = usePendingIds('Solicitudes');
  const [converting, setConverting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  if (request === undefined) return <Spinner label={t('common.loading')} />;
  if (request === null || request.deleted) {
    return (
      <EmptyState
        icon="search"
        title={t('requests.notFound')}
        action={
          <Link href="/solicitudes" className={`${buttonClass('primary')} mt-2`}>
            {t('requests.back')}
          </Link>
        }
      />
    );
  }

  const clientId = text(request, 'clienteId');
  const estado = requestState(request);
  const closed = estado === 'CONVERTIDA' || estado === 'RECHAZADA';
  const mayClassify = me.isFirm && can(me, 'Solicitudes', 'update', clientId) && !closed;
  const mayConvert = mayClassify && can(me, 'Asuntos', 'create', clientId);
  const setState = (next: EstadoSolicitud): void => {
    void engine.mutate('Solicitudes', 'update', request.id, { estado: next });
  };

  return (
    <>
      <p className="mb-2">
        <Link
          href="/solicitudes"
          className="inline-flex items-center gap-1 text-sm text-link hover:underline"
        >
          <Icon name="chevronLeft" className="size-4" />
          {t('requests.back')}
        </Link>
      </p>
      <PageHeader
        eyebrow={[names.client(clientId), names.unit(text(request, 'entidadId'))]
          .filter(Boolean)
          .join(' · ')}
        title={text(request, 'titulo') ?? ''}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge tone={REQUEST_TONE[estado]}>{t(`requests.estados.${estado}`)}</StatusBadge>
          <span className="text-sm text-muted-foreground">{t(`requests.stateHelp.${estado}`)}</span>
          {pending.has(request.id) ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="cloudOff" className="size-3.5" />
              {t('common.pendingSync')}
            </span>
          ) : null}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('requests.details')}>
            {text(request, 'descripcion') ? (
              <p className="mb-4 whitespace-pre-line">{text(request, 'descripcion')}</p>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact term={t('requests.requestedBy')}>
                {names.user(text(request, 'createdBy')) || '—'}
              </Fact>
              <Fact term={t('requests.requestedOn')}>
                {formatDateTime(text(request, 'createdAt'))}
              </Fact>
              {request.urgencia ? (
                <Fact term={t('requests.urgency')}>{priorityLabel(t, request.urgencia)}</Fact>
              ) : null}
              {request.area ? (
                <Fact term={t('requests.area')}>{areaLabel(t, request.area)}</Fact>
              ) : null}
            </dl>
            {estado === 'CONVERTIDA' ? (
              <p className="mt-4">
                {matter && !matter.deleted ? (
                  <>
                    {t('requests.converted')}{' '}
                    <Link href={`/asuntos/${matter.id}`} className="text-link hover:underline">
                      {text(matter, 'titulo')}
                    </Link>
                  </>
                ) : (
                  t('requests.convertedHidden')
                )}
              </p>
            ) : null}
          </Card>
          <Comments table="Solicitudes" record={request} />
        </div>
        <div className="space-y-6">
          {mayClassify ? (
            <Card title={t('requests.classifyTitle')}>
              <p className="mb-3 text-sm text-muted-foreground">{t('requests.classifyIntro')}</p>
              <Perimeter client={client ?? undefined} />
              <div className="mt-4 flex flex-col gap-2">
                {CLASSIFY.map((c) => (
                  <Button
                    key={c.estado}
                    size="sm"
                    variant={estado === c.estado ? 'primary' : 'secondary'}
                    aria-pressed={estado === c.estado}
                    onClick={() => {
                      setState(c.estado);
                    }}
                  >
                    {t(`requests.${c.key}`)}
                  </Button>
                ))}
                {mayConvert ? (
                  <Button
                    size="sm"
                    icon="briefcase"
                    onClick={() => {
                      setConverting(true);
                    }}
                  >
                    {t('requests.convert')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  icon="x"
                  onClick={() => {
                    setRejecting(true);
                  }}
                >
                  {t('requests.reject')}
                </Button>
              </div>
              {mayConvert ? (
                <p className="mt-2 text-sm text-muted-foreground">{t('requests.convertHint')}</p>
              ) : null}
            </Card>
          ) : (
            <Card title={t('requests.perimeterTitle')}>
              <Perimeter client={client ?? undefined} />
            </Card>
          )}
          <Documents
            table="Solicitudes"
            record={request}
            defaultArea={text(request, 'area') ?? ''}
          />
        </div>
      </div>

      {converting ? (
        <MatterForm
          preset={{
            clienteId: clientId ?? '',
            entidadId: text(request, 'entidadId') ?? '',
            titulo: text(request, 'titulo') ?? '',
            area: text(request, 'area') ?? '',
            dentroIguala: estado !== 'FUERA_IGUALA_COTIZADA' && client?.servicio === 'FLT_IGUALA',
          }}
          onClose={() => {
            setConverting(false);
          }}
          onSaved={(asuntoId) => {
            void engine
              .mutate('Solicitudes', 'update', request.id, {
                estado: 'CONVERTIDA',
                asuntoIdGenerado: asuntoId,
              })
              .then(() => {
                navigate(`/asuntos/${asuntoId}`);
              });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={rejecting}
        title={t('requests.rejectTitle')}
        confirmLabel={t('requests.reject')}
        danger
        onConfirm={() => {
          setState('RECHAZADA');
          setRejecting(false);
        }}
        onClose={() => {
          setRejecting(false);
        }}
      >
        <p>{t('requests.rejectBody')}</p>
      </ConfirmDialog>
    </>
  );
}
