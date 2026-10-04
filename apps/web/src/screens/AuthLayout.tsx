import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components/Logo.tsx';
import { PreferencesInline } from '../portal/Preferences.tsx';

/**
 * The frame of every screen before the portal: the brand on one side (on
 * top, on a phone) and the task at hand on the other.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      <aside className="flex flex-col justify-between gap-6 bg-sidebar px-6 py-6 text-sidebar-foreground lg:w-[42%] lg:px-12 lg:py-12">
        <Logo variant="logo" className="h-16 w-auto self-start text-sidebar-accent lg:h-24" />
        <div className="hidden lg:block">
          <p className="label-caps text-sidebar-muted-foreground">{t('app.team')}</p>
          <p className="mt-3 max-w-md font-display text-3xl leading-snug">{t('auth.subtitle')}</p>
        </div>
        <a
          href={`${import.meta.env.BASE_URL}privacidad/`}
          className="hidden text-sm text-sidebar-muted-foreground underline underline-offset-2 lg:inline"
        >
          {t('auth.privacy')}
        </a>
      </aside>
      <main id="contenido" className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm">
          <PreferencesInline />
          <a
            href={`${import.meta.env.BASE_URL}privacidad/`}
            className="text-link underline underline-offset-2 lg:hidden"
          >
            {t('auth.privacy')}
          </a>
        </div>
      </main>
    </div>
  );
}

/** A plain message screen (no access, offline, outdated…). */
export function MessageScreen({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <AuthLayout>
      <div className="rounded-card border border-border bg-card p-6 text-card-foreground shadow-card">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <div className="mt-3 space-y-3">{children}</div>
        {actions ? <div className="mt-6 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </AuthLayout>
  );
}
