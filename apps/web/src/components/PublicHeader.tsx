import { Logo } from './Logo.tsx';

/** The bar on top of the public pages; away from home, the logo leads back to it. */
export function PublicHeader({ homeLink = false }: { homeLink?: boolean }) {
  const logo = <Logo variant="logotipo" className="h-8 w-auto text-sidebar-accent" />;
  return (
    <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground">
      {homeLink ? <a href={import.meta.env.BASE_URL}>{logo}</a> : logo}
      <span className="label-caps text-sidebar-muted-foreground">Fractional Legal Team</span>
    </header>
  );
}
