import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { APP_VERSION } from '../config/api.ts';
import { useFeedback } from '../feedback/context.ts';
import { InstallInstructions } from '../portal/InstallInstructions.tsx';
import { useTour } from '../portal/tour-context.ts';
import { configNumber, usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card, PageHeader } from '../ui/Card.tsx';
import { Icon } from '../ui/Icon.tsx';

/** Help: the tour again, installing the portal, working offline and the device's copy. */
export function HelpPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { start } = useTour();
  const feedback = useFeedback();
  return (
    <>
      <PageHeader title={t('help.title')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={t('help.tour')}>
          <p className="mb-4">{t('help.tourHint')}</p>
          <Button icon="arrowRight" onClick={start}>
            {t('help.tour')}
          </Button>
        </Card>
        <Card title={t('feedback.helpTitle')}>
          <p className="mb-4">{t('feedback.helpBody')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              icon="message"
              onClick={() => {
                feedback.open();
              }}
            >
              {t('feedback.button')}
            </Button>
            <Link href="/sugerencias" className="text-link underline underline-offset-2">
              {t('feedback.seeMine')}
            </Link>
          </div>
        </Card>
        <Card title={t('help.installTitle')}>
          <InstallInstructions />
        </Card>
        <Card title={t('help.offlineTitle')}>
          <p className="flex gap-3">
            <Icon name="cloudOff" className="mt-0.5 size-5 text-muted-foreground" />
            <span>{t('help.offlineBody')}</span>
          </p>
        </Card>
        <Card title={t('help.securityTitle')}>
          <p className="flex gap-3">
            <Icon name="shield" className="mt-0.5 size-5 text-muted-foreground" />
            <span>
              {t('help.securityBody', {
                days: configNumber(me, 'diasSinConexion', 14),
                minutes: configNumber(me, 'inactividadMinutos', 30),
              })}
            </span>
          </p>
          <p className="mt-4">
            <a
              href={`${import.meta.env.BASE_URL}privacidad/`}
              className="text-link underline underline-offset-2"
            >
              {t('help.privacy')}
            </a>
          </p>
        </Card>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        {t('app.version', { version: APP_VERSION })}
      </p>
    </>
  );
}
