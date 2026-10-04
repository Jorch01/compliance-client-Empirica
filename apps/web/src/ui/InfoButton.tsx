import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog.tsx';
import { Icon } from './Icon.tsx';

export interface InfoContent {
  title: string;
  /** For what it is, in one sentence. */
  purpose: string;
  /** How to read it: what each part, color or size means. */
  howToRead: string[];
  /** One concrete case read out loud. */
  example: string;
}

/**
 * "¿Cómo se lee?" (DISENO.md § 8): an ⓘ next to any indicator that needs
 * explaining. Always the same three parts, in the same order.
 */
export function InfoButton({ content }: { content: InfoContent }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-sm text-link hover:bg-muted"
      >
        <Icon name="info" className="size-4" />
        <span>{t('help.howToRead')}</span>
        <span className="sr-only">: {content.title}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={content.title}
      >
        <div className="space-y-4">
          <section>
            <h3 className="label-caps text-muted-foreground">{t('help.purpose')}</h3>
            <p className="mt-1">{content.purpose}</p>
          </section>
          <section>
            <h3 className="label-caps text-muted-foreground">{t('help.reading')}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {content.howToRead.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="label-caps text-muted-foreground">{t('help.example')}</h3>
            <p className="mt-1 rounded-control border-l-4 border-accent-strong bg-accent px-3 py-2 text-accent-foreground">
              {content.example}
            </p>
          </section>
        </div>
      </Dialog>
    </>
  );
}
