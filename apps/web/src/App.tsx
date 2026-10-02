import { Logo } from './components/Logo.tsx';

/**
 * Phase 0 placeholder. It only proves the toolchain end to end (tokens ->
 * Tailwind -> fonts -> build); the real shell arrives in phase 2.
 */
export function App() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground">
        <Logo variant="logotipo" className="h-8 w-auto text-sidebar-accent" />
        <span className="label-caps text-sidebar-muted-foreground">Fractional Legal Team</span>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="label-caps text-muted-foreground">Portal de clientes · Fase 0</p>
        <h1 className="mt-2 text-4xl font-semibold">En construcción</h1>
        <div className="mt-6 rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
          <p>
            Estamos preparando el plan, la paleta y los fundamentos del portal. Esta página solo
            confirma que la compilación, los tokens de marca y las tipografías funcionan.
          </p>
          <p className="mt-4 rounded-control border-l-4 border-accent-strong bg-accent px-4 py-3 text-accent-foreground">
            Siguiente paso: aprobar el plan y la paleta propuesta.
          </p>
        </div>
      </main>
    </div>
  );
}
