import { Route, Switch } from 'wouter';
import { FeedbackProvider } from '../feedback/FeedbackProvider.tsx';
import { ClientHome } from '../pages/ClientHome.tsx';
import { ClientsPage } from '../pages/Clients.tsx';
import { ControlCenter } from '../pages/ControlCenter.tsx';
import { FeedbackPage } from '../pages/Feedback.tsx';
import { HelpPage } from '../pages/Help.tsx';
import { NotFound } from '../pages/NotFound.tsx';
import { PendingPage } from '../pages/Pending.tsx';
import { PeoplePage } from '../pages/People.tsx';
import { RequestsPage } from '../pages/Requests.tsx';
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
      <Route path="/solicitudes">
        <RequestsPage />
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
