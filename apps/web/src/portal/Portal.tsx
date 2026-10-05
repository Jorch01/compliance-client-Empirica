import { Route, Switch } from 'wouter';
import { FeedbackProvider } from '../feedback/FeedbackProvider.tsx';
import { AgendaPage } from '../pages/Agenda.tsx';
import { ClientHome } from '../pages/ClientHome.tsx';
import { ClientsPage } from '../pages/Clients.tsx';
import { CompliancePage } from '../pages/Compliance.tsx';
import { CatalogPage } from '../pages/compliance/Catalog.tsx';
import { NonWorkingDaysPage } from '../pages/compliance/NonWorkingDays.tsx';
import { ConflictsPage } from '../pages/Conflicts.tsx';
import { ContractDetailPage } from '../pages/ContractDetail.tsx';
import { ContractsPage } from '../pages/Contracts.tsx';
import { ControlCenter } from '../pages/ControlCenter.tsx';
import { DocumentsPage } from '../pages/Documents.tsx';
import { FeedbackPage } from '../pages/Feedback.tsx';
import { FilingDetailPage } from '../pages/FilingDetail.tsx';
import { FilingsPage } from '../pages/Filings.tsx';
import { TemplatesPage } from '../pages/filings/Templates.tsx';
import { HelpPage } from '../pages/Help.tsx';
import { MatterDetailPage } from '../pages/MatterDetail.tsx';
import { MattersPage } from '../pages/Matters.tsx';
import { NotFound } from '../pages/NotFound.tsx';
import { NoticesPage } from '../pages/Notices.tsx';
import { ObligationDetailPage } from '../pages/ObligationDetail.tsx';
import { PendingPage } from '../pages/Pending.tsx';
import { ReportDetailPage } from '../pages/ReportDetail.tsx';
import { ReportsPage } from '../pages/Reports.tsx';
import { PeoplePage } from '../pages/People.tsx';
import { RequestDetailPage } from '../pages/RequestDetail.tsx';
import { RequestsPage } from '../pages/Requests.tsx';
import { TaskDetailPage } from '../pages/TaskDetail.tsx';
import { TasksPage } from '../pages/Tasks.tsx';
import { TeamPage } from '../pages/Team.tsx';
import { usePortal } from '../session/context.ts';
import { ScopeProvider } from './ScopeProvider.tsx';
import { useScope } from './scope.ts';
import { Shell } from './Shell.tsx';
import { TourProvider } from './Tour.tsx';

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

/** The signed-in portal: the chosen client and unit, the tour, the frame and the screens. */
export function Portal() {
  return (
    <ScopeProvider>
      <FeedbackProvider>
        <TourProvider>
          <Shell>
            <Routes />
          </Shell>
        </TourProvider>
      </FeedbackProvider>
    </ScopeProvider>
  );
}
