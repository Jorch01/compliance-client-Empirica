import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { useFeedback } from '../feedback/context.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';

/** A screen that failed while drawing: nothing saved is lost; go elsewhere or tell us. */
export function CrashScreen({ error, reset }: { error: unknown; reset: () => void }) {
  const { t } = useTranslation();
  const { open } = useFeedback();
  const [, navigate] = useLocation();
  return (
    <div role="alert" className="mx-auto max-w-lg py-10 text-center">
      <Icon name="alert" className="mx-auto size-10 text-danger" />
      <h1 className="mt-3 text-3xl font-semibold">{t('crash.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('crash.body')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button
          icon="message"
          onClick={() => {
            open({ tipo: 'ERROR', error });
          }}
        >
          {t('crash.report')}
        </Button>
        <Button variant="secondary" icon="refresh" onClick={reset}>
          {t('crash.retry')}
        </Button>
        <Button
          variant="ghost"
          icon="home"
          onClick={() => {
            navigate('/');
            reset();
          }}
        >
          {t('crash.home')}
        </Button>
      </div>
    </div>
  );
}
