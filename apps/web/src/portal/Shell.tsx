import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { Logo } from '../components/Logo.tsx';
import { useRows } from '../data/hooks.ts';
import { onClientSide } from '../domain/deadlines.ts';
import { useFeedback } from '../feedback/context.ts';
import { recordError } from '../feedback/diagnostics.ts';
import { usePortal } from '../session/context.ts';
import { Drawer } from '../ui/Drawer.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { CrashScreen } from './CrashScreen.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import { ScopeSelect } from './ScopeSelect.tsx';
import { useScope, useScopedRows } from './scope.ts';
import { SyncIndicator } from './SyncIndicator.tsx';
import { UserMenu } from './UserMenu.tsx';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
}

/** The menu for this user: the firm runs its clients, a client follows its matters. */
function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { access } = useScope();
  const tareas = useScopedRows('Tareas');
  const sugerencias = useRows('Sugerencias');
  const conflictos = useScopedRows('Conflictos');
  // The administrators answer what arrives; anyone else sees theirs once they sent something.
  const nuevas = (sugerencias ?? []).filter((s) => s.estado === 'NUEVA').length;
  const feedback: NavItem[] = me.isAdmin
    ? [
        {
          href: '/sugerencias',
          label: t('nav.feedback'),
          icon: 'message',
          ...(nuevas > 0 ? { badge: nuevas } : {}),
        },
      ]
    : (sugerencias ?? []).some((s) => s.usuarioId === me.id)
      ? [{ href: '/sugerencias', label: t('nav.feedback'), icon: 'message' }]
      : [];
  if (me.isFirm) {
    // Conflicts show up once there are any; the badge counts those to decide.
    const porResolver = (conflictos ?? []).filter((c) => c.estado === 'PENDIENTE').length;
    const conflicts: NavItem[] = conflictos?.length
      ? [
          {
            href: '/conflictos',
            label: t('nav.conflicts'),
            icon: 'scale',
            ...(porResolver > 0 ? { badge: porResolver } : {}),
          },
        ]
      : [];
    return [
      { href: '/', label: t('nav.controlCenter'), icon: 'home' },
      { href: '/clientes', label: t('nav.clients'), icon: 'building' },
      { href: '/asuntos', label: t('nav.matters'), icon: 'briefcase' },
      { href: '/tareas', label: t('nav.tasks'), icon: 'list' },
      { href: '/documentos', label: t('nav.documents'), icon: 'file' },
      { href: '/solicitudes', label: t('nav.requests'), icon: 'inbox' },
      ...conflicts,
      { href: '/usuarios', label: t('nav.people'), icon: 'users' },
      ...feedback,
      { href: '/ayuda', label: t('nav.help'), icon: 'help' },
    ];
  }
  const pending = (tareas ?? []).filter(onClientSide).length;
  return [
    { href: '/', label: t('nav.home'), icon: 'home' },
    {
      href: '/pendientes',
      label: t('nav.pending'),
      icon: 'list',
      ...(pending > 0 ? { badge: pending } : {}),
    },
    { href: '/asuntos', label: t('nav.matters'), icon: 'briefcase' },
    { href: '/documentos', label: t('nav.documents'), icon: 'file' },
    { href: '/solicitudes', label: t('nav.requests'), icon: 'inbox' },
    { href: '/equipo', label: t('nav.team'), icon: 'users' },
    ...(access?.rol === 'CLIENTE_ADMIN'
      ? [{ href: '/usuarios', label: t('nav.people'), icon: 'shield' as const }]
      : []),
    ...feedback,
    { href: '/ayuda', label: t('nav.help'), icon: 'help' },
  ];
}

const isCurrent = (href: string, location: string): boolean =>
  href === '/' ? location === '/' : location === href || location.startsWith(`${href}/`);

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const items = useNavItems();
  return (
    <nav aria-label={t('nav.main')} data-tour="nav">
      <ul className="space-y-1">
        {items.map((item) => {
          const current = isCurrent(item.href, location);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={current ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-control px-3 font-medium ${
                  current
                    ? 'bg-sidebar-accent text-sidebar'
                    : 'text-sidebar-foreground hover:bg-sidebar-border'
                }`}
              >
                <Icon name={item.icon} className="size-5" />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span
                    className={`rounded-full px-2 text-xs font-semibold tabular-nums ${
                      current
                        ? 'bg-sidebar text-sidebar-foreground'
                        : 'bg-accent text-accent-foreground'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { open } = useFeedback();
  return (
    <div className="flex h-full flex-col gap-8 px-4 py-6">
      <Link href="/" onClick={onNavigate} className="self-start rounded-control">
        <Logo variant="logotipo" className="h-9 w-auto text-sidebar-accent" />
      </Link>
      <NavList {...(onNavigate ? { onNavigate } : {})} />
      <div className="mt-auto space-y-4">
        <button
          type="button"
          data-tour="feedback"
          onClick={() => {
            onNavigate?.();
            open();
          }}
          className="flex min-h-11 w-full items-center gap-3 rounded-control border border-sidebar-border px-3 text-left font-medium text-sidebar-foreground hover:bg-sidebar-border"
        >
          <Icon name="message" className="size-5" />
          {t('feedback.button')}
        </button>
        <div className="space-y-1 text-sm text-sidebar-muted-foreground">
          <p className="label-caps">{t('app.team')}</p>
          <a
            href={`${import.meta.env.BASE_URL}privacidad/`}
            className="underline underline-offset-2 hover:text-sidebar-foreground"
          >
            {t('help.privacy')}
          </a>
        </div>
      </div>
    </div>
  );
}

/** Moves focus to the content; a plain #anchor would change the route. */
function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#contenido"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById('contenido')?.focus();
      }}
      className="sr-only z-50 rounded-control bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t('app.skipToContent')}
    </a>
  );
}

/**
 * The frame of the portal: the menu on the left (a drawer on a phone), the
 * client and unit on top with the sync status and the user's menu.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // A new screen starts at the top, with the focus on its content.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location]);

  return (
    <div className="min-h-dvh bg-background lg:pl-64">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-sidebar text-sidebar-foreground lg:block">
        <SidebarContent />
      </aside>
      <Drawer
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
        }}
        label={t('nav.menu')}
      >
        <div className="relative h-full">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
            }}
            className="absolute top-4 right-3 rounded-control p-2 text-sidebar-foreground hover:bg-sidebar-border"
          >
            <Icon name="x" label={t('nav.closeMenu')} />
          </button>
          <SidebarContent
            onNavigate={() => {
              setMenuOpen(false);
            }}
          />
        </div>
      </Drawer>
      <header className="sticky top-0 z-20 border-b border-border bg-background">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            data-tour="nav"
            onClick={() => {
              setMenuOpen(true);
            }}
            className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-control hover:bg-muted lg:hidden"
          >
            <Icon name="menu" label={t('nav.openMenu')} />
          </button>
          <Link href="/" className="rounded-control lg:hidden">
            <Logo variant="simbolo" className="h-7 w-auto text-primary" />
          </Link>
          <div className="order-last flex w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
            <ScopeSelect />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <SyncIndicator />
            <UserMenu />
          </div>
        </div>
      </header>
      <InstallBanner />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-6 outline-none sm:px-6 lg:py-8"
      >
        <ErrorBoundary
          resetKey={location}
          onError={(error) => {
            recordError(error, location);
          }}
          fallback={(error, reset) => <CrashScreen error={error} reset={reset} />}
        >
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
