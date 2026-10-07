import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { buttonClass } from '../ui/button-class.ts';
import { Icon } from '../ui/Icon.tsx';

/** An address the portal does not have: it says so, as the screen's title, and offers home. */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Icon name="search" className="size-8 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p className="max-w-md text-muted-foreground">{t('notFound.body')}</p>
      <Link href="/" className={`${buttonClass('primary')} mt-2`}>
        {t('notFound.home')}
      </Link>
    </div>
  );
}
