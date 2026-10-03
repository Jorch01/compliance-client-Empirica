import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import {
  detectPlatform,
  isInstalled,
  isIosOtherBrowser,
  promptInstall,
  useInstallPrompt,
  type Platform,
} from './install.ts';

/**
 * How to install the portal on this device: the browser's own button when it
 * offers one, and the steps for the detected system (the others, one tap away).
 */
export function InstallInstructions({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const detected = detectPlatform();
  const [platform, setPlatform] = useState<Platform>(detected);
  const canPrompt = useInstallPrompt();
  if (isInstalled()) return <p>{t('install.installed')}</p>;
  const steps = t(`install.${platform}.steps`, { returnObjects: true });
  return (
    <div className="space-y-3">
      {canPrompt ? (
        <Button icon="download" onClick={() => void promptInstall()}>
          {t('install.install')}
        </Button>
      ) : null}
      {platform === 'ios' && isIosOtherBrowser() ? (
        <p className="rounded-control border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground">
          {t('install.ios.otherBrowser')}
        </p>
      ) : null}
      <div>
        <p className="font-medium">{t(`install.${platform}.title`)}</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {platform === 'ios' ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="share" className="size-5 text-link" />
            {t('install.ios.shareHint')}
          </p>
        ) : null}
      </div>
      {compact ? null : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('install.how')}>
          {(['ios', 'android', 'desktop'] as const)
            .filter((p) => p !== platform)
            .map((p) => (
              <Button
                key={p}
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPlatform(p);
                }}
              >
                {t(`install.${p}.title`)}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
