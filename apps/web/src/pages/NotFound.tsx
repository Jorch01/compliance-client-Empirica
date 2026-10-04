import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { buttonClass } from '../ui/button-class.ts';
import { EmptyState } from '../ui/Card.tsx';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="search"
      title={t('notFound.title')}
      body={t('notFound.body')}
      action={
        <Link href="/" className={`${buttonClass('primary')} mt-2`}>
          {t('notFound.home')}
        </Link>
      }
    />
  );
}
