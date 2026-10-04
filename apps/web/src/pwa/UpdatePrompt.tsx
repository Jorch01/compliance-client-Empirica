import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { dismissNewVersion, reloadToNewVersion, useNewVersion } from './update.ts';

/** "Hay una versión nueva del portal": switch now, or with the next visit. */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const ready = useNewVersion();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex justify-end"
    >
      {ready ? (
        <div className="pointer-events-auto w-full max-w-sm rounded-card border border-border bg-popover p-4 text-popover-foreground shadow-raised">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="download" className="size-5 text-link" />
            {t('sync.updateTitle')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t('sync.updateBody')}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismissNewVersion}>
              {t('sync.updateLater')}
            </Button>
            <Button size="sm" icon="refresh" onClick={() => void reloadToNewVersion()}>
              {t('sync.updateNow')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
