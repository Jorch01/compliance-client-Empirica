import { Logo } from './components/Logo.tsx';

/**
 * Public placeholder until the portal itself arrives (phase 2). It speaks to
 * a client who lands here, never about the project's internal progress.
 */
export function App() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground">
        <Logo variant="logotipo" className="h-8 w-auto text-sidebar-accent" />
        <span className="label-caps text-sidebar-muted-foreground">Fractional Legal Team</span>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="label-caps text-muted-foreground">Portal de clientes</p>
        <h1 className="mt-2 text-4xl font-semibold">Muy pronto</h1>
        <div className="mt-6 rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
          <p>
            Aquí podrás dar seguimiento, en un solo lugar, a tus asuntos, tareas, trámites y
            obligaciones con tu Fractional Legal Team de Empírica, desde la computadora o el
            celular.
          </p>
          <p className="mt-4 rounded-control border-l-4 border-accent-strong bg-accent px-4 py-3 text-accent-foreground">
            El acceso es por invitación: cuando el portal esté listo, tu abogado de Empírica te
            enviará la tuya.
          </p>
        </div>
      </main>
    </div>
  );
}
