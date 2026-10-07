import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Switch } from 'wouter';
import { FeedbackProvider } from '../feedback/FeedbackProvider.tsx';
import { NotFound } from '../pages/NotFound.tsx';
import { usePortal } from '../session/context.ts';
import { Spinner } from '../ui/Card.tsx';
import { lazyPage, preloadPages } from './lazy-page.ts';
import { ScopeProvider } from './ScopeProvider.tsx';
import { useScope } from './scope.ts';
import { Shell } from './Shell.tsx';
import { TourProvider } from './Tour.tsx';

const AgendaPage = lazyPage(() => import('../pages/Agenda.tsx'), 'AgendaPage');
const ClientHome = lazyPage(() => import('../pages/ClientHome.tsx'), 'ClientHome');
const ClientsPage = lazyPage(() => import('../pages/Clients.tsx'), 'ClientsPage');
const CompliancePage = lazyPage(() => import('../pages/Compliance.tsx'), 'CompliancePage');
const CatalogPage = lazyPage(() => import('../pages/compliance/Catalog.tsx'), 'CatalogPage');
const NonWorkingDaysPage = lazyPage(
  () => import('../pages/compliance/NonWorkingDays.tsx'),
  'NonWorkingDaysPage',
);
const ConflictsPage = lazyPage(() => import('../pages/Conflicts.tsx'), 'ConflictsPage');
const ContractDetailPage = lazyPage(
  () => import('../pages/ContractDetail.tsx'),
  'ContractDetailPage',
);
const ContractsPage = lazyPage(() => import('../pages/Contracts.tsx'), 'ContractsPage');
const ControlCenter = lazyPage(() => import('../pages/ControlCenter.tsx'), 'ControlCenter');
const DocumentsPage = lazyPage(() => import('../pages/Documents.tsx'), 'DocumentsPage');
const FeedbackPage = lazyPage(() => import('../pages/Feedback.tsx'), 'FeedbackPage');
const FilingDetailPage = lazyPage(() => import('../pages/FilingDetail.tsx'), 'FilingDetailPage');
const FilingsPage = lazyPage(() => import('../pages/Filings.tsx'), 'FilingsPage');
const TemplatesPage = lazyPage(() => import('../pages/filings/Templates.tsx'), 'TemplatesPage');
const HelpPage = lazyPage(() => import('../pages/Help.tsx'), 'HelpPage');
const MatterDetailPage = lazyPage(() => import('../pages/MatterDetail.tsx'), 'MatterDetailPage');
const MattersPage = lazyPage(() => import('../pages/Matters.tsx'), 'MattersPage');
const NoticesPage = lazyPage(() => import('../pages/Notices.tsx'), 'NoticesPage');
const ObligationDetailPage = lazyPage(
  () => import('../pages/ObligationDetail.tsx'),
  'ObligationDetailPage',
);
const PendingPage = lazyPage(() => import('../pages/Pending.tsx'), 'PendingPage');
const ReportDetailPage = lazyPage(() => import('../pages/ReportDetail.tsx'), 'ReportDetailPage');
const ReportsPage = lazyPage(() => import('../pages/Reports.tsx'), 'ReportsPage');
const PeoplePage = lazyPage(() => import('../pages/People.tsx'), 'PeoplePage');
const RequestDetailPage = lazyPage(() => import('../pages/RequestDetail.tsx'), 'RequestDetailPage');
const RequestsPage = lazyPage(() => import('../pages/Requests.tsx'), 'RequestsPage');
const TaskDetailPage = lazyPage(() => import('../pages/TaskDetail.tsx'), 'TaskDetailPage');
const TasksPage = lazyPage(() => import('../pages/Tasks.tsx'), 'TasksPage');
const TeamPage = lazyPage(() => import('../pages/Team.tsx'), 'TeamPage');

function Routes() {
  const { me } = usePortal();
  const { access } = useScope();
  const clientAdmin = access?.rol === 'CLIENTE_ADMIN';
  return (
    <Switch>
      <Route path="/">{me.isFirm ? <ControlCenter /> : <ClientHome />}</Route>
      <Route path="/asuntos">
        <MattersPage />
      </Route>
      <Route path="/asuntos/:id">
        <MatterDetailPage />
      </Route>
      {me.isFirm ? (
        <Route path="/tareas">
          <TasksPage />
        </Route>
      ) : null}
      <Route path="/tareas/:id">
        <TaskDetailPage />
      </Route>
      <Route path="/tramites">
        <FilingsPage />
      </Route>
      {me.isFirm ? (
        <Route path="/tramites/plantillas">
          <TemplatesPage />
        </Route>
      ) : null}
      <Route path="/tramites/:id">
        <FilingDetailPage />
      </Route>
      <Route path="/compliance">
        <CompliancePage />
      </Route>
      {me.isFirm ? (
        <Route path="/compliance/catalogo">
          <CatalogPage />
        </Route>
      ) : null}
      {me.isFirm ? (
        <Route path="/compliance/inhabiles">
          <NonWorkingDaysPage />
        </Route>
      ) : null}
      <Route path="/compliance/:id">
        <ObligationDetailPage />
      </Route>
      <Route path="/contratos">
        <ContractsPage />
      </Route>
      <Route path="/contratos/:id">
        <ContractDetailPage />
      </Route>
      <Route path="/documentos">
        <DocumentsPage />
      </Route>
      {me.isFirm ? (
        <Route path="/conflictos">
          <ConflictsPage />
        </Route>
      ) : null}
      {me.isFirm ? (
        <Route path="/conflictos/:id">
          <ConflictsPage />
        </Route>
      ) : null}
      <Route path="/solicitudes">
        <RequestsPage />
      </Route>
      <Route path="/solicitudes/:id">
        <RequestDetailPage />
      </Route>
      <Route path="/reportes">
        <ReportsPage />
      </Route>
      <Route path="/reportes/:clienteId/:periodo">
        <ReportDetailPage />
      </Route>
      <Route path="/agenda">
        <AgendaPage />
      </Route>
      <Route path="/agenda/:id">
        <AgendaPage />
      </Route>
      <Route path="/avisos">
        <NoticesPage />
      </Route>
      <Route path="/ayuda">
        <HelpPage />
      </Route>
      <Route path="/sugerencias">
        <FeedbackPage />
      </Route>
      {me.isFirm ? (
        <Route path="/clientes">
          <ClientsPage />
        </Route>
      ) : null}
      {me.isFirm || clientAdmin ? (
        <Route path="/usuarios">
          <PeoplePage />
        </Route>
      ) : null}
      {!me.isFirm ? (
        <Route path="/pendientes">
          <PendingPage />
        </Route>
      ) : null}
      {!me.isFirm ? (
        <Route path="/equipo">
          <TeamPage />
        </Route>
      ) : null}
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

/** The screen for the address, once its code is here (the first time it opens). */
function Screens() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<Spinner label={t('common.loading')} />}>
      <Routes />
    </Suspense>
  );
}

/** The signed-in portal: the chosen client and unit, the tour, the frame and the screens. */
export function Portal() {
  useEffect(() => {
    void preloadPages();
  }, []);
  return (
    <ScopeProvider>
      <FeedbackProvider>
        <TourProvider>
          <Shell>
            <Screens />
          </Shell>
        </TourProvider>
      </FeedbackProvider>
    </ScopeProvider>
  );
}
