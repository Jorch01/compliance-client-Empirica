import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { InstallInstructions } from './InstallInstructions.tsx';
import { isInstalled, promptInstall, useInstallPrompt } from './install.ts';

const DISMISS_DAYS = 30;
const key = (userId: string): string => `empirica.installBanner.${userId}`;

function dismissedRecently(userId: string): boolean {
  try {
    const at = Number(localStorage.getItem(key(userId)));
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return true;
  }
}

function tourDone(userId: string): boolean {
  try {
    return localStorage.getItem(`empirica.tour.${userId}`) === 'done';
  } catch {
    return true;
  }
}

/**
 * A discreet reminder to install the portal (after the tour; never once
 * installed). Closing it hides it for a month.
 */
export function InstallBanner() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const canPrompt = useInstallPrompt();
  const [hidden, setHidden] = useState(
    () => isInstalled() || dismissedRecently(me.id) || !tourDone(me.id),
  );
  const [how, setHow] = useState(false);
  if (hidden) return null;
  const dismiss = (): void => {
    try {
      localStorage.setItem(key(me.id), String(Date.now()));
    } catch {
      /* private mode */
    }
    setHidden(true);
  };
  return (
    <div className="border-b border-accent-strong bg-accent px-4 py-2 text-accent-foreground sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <Icon name="download" className="size-5" />
        <p className="flex-1 text-sm">{t('install.banner')}</p>
        <div className="flex flex-wrap gap-2">
          {canPrompt ? (
            <Button
              size="sm"
              onClick={() =>
                void promptInstall().then((ok) => {
                  if (ok) dismiss();
                })
              }
            >
              {t('install.install')}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setHow(true);
              }}
            >
              {t('install.how')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={dismiss}>
            {t('install.dismiss')}
          </Button>
        </div>
      </div>
      <Dialog
        open={how}
        onClose={() => {
          setHow(false);
        }}
        title={t('help.installTitle')}
      >
        <InstallInstructions />
      </Dialog>
    </div>
  );
}
