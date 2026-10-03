import { PublicHeader } from './components/PublicHeader.tsx';
import { LegalText } from './legal/LegalText.tsx';
import notice from './legal/aviso-de-privacidad.txt?raw';

/**
 * The firm's privacy notice (/privacidad/), published word for word from
 * legal/aviso-de-privacidad.txt: to update it, replace that file.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background">
      <PublicHeader homeLink />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <LegalText source={notice} />
        <p className="mt-12 border-t border-border pt-6">
          <a href={import.meta.env.BASE_URL} className="text-link underline underline-offset-2">
            Volver al inicio
          </a>
        </p>
      </main>
    </div>
  );
}
