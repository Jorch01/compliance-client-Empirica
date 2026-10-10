import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import {
  fill,
  SECTIONS,
  sectionPath,
  useGuideTexts,
  type Audience,
  type Pointer,
  type Section,
} from './guides.ts';

const HEADING = 'label-caps text-muted-foreground';

/** A situation and the section it belongs in; choosing it opens that section's guide. */
function PointerButton({
  pointer,
  audience,
  onChoose,
}: {
  pointer: Pointer;
  audience: Audience;
  onChoose: (section: Section) => void;
}) {
  const texts = useGuideTexts();
  return (
    <button
      type="button"
      onClick={() => {
        onChoose(pointer.to);
      }}
      className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control border border-border bg-card px-3 py-2 text-left hover:bg-muted"
    >
      <span>{pointer.text}</span>
      <span className="sr-only">: </span>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-link">
        {fill(texts.ui.goesIn, texts[audience][pointer.to].title)}
        <Icon name="arrowRight" className="size-4" />
      </span>
    </button>
  );
}

/**
 * The guide to one section (D79): what it is for, what goes in it, an
 * example, the sections people confuse it with, and what to write in each
 * field. Those other sections open their own guide here; "Volver" walks back.
 */
export function GuideDialog({
  section,
  audience,
  here,
  onClose,
}: {
  section: Section;
  audience: Audience;
  /** The section of the page the person is on; null on the Help page. */
  here: Section | null;
  onClose: () => void;
}) {
  const texts = useGuideTexts();
  const [trail, setTrail] = useState<Section[]>([section]);
  const current = trail.at(-1) ?? section;
  const previous = trail.length > 1 ? trail.at(-2) : undefined;
  const guide = texts[audience][current];

  // Another guide replaced the one that held the focus: to its start,
  // scrolled to the top.
  const body = useRef<HTMLDivElement>(null);
  const depth = useRef(trail.length);
  useEffect(() => {
    if (depth.current === trail.length) return;
    depth.current = trail.length;
    const scroller = body.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
    body.current?.focus({ preventScroll: true });
  }, [trail.length]);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={fill(texts.ui.dialogTitle, guide.title)}
      footer={
        <>
          {current === here ? null : (
            <Link
              href={sectionPath(current, audience)}
              onClick={onClose}
              className={buttonClass('secondary')}
            >
              {fill(texts.ui.goTo, guide.title)}
            </Link>
          )}
          <Button onClick={onClose}>{texts.ui.close}</Button>
        </>
      }
    >
      <div ref={body} tabIndex={-1} className="space-y-5 outline-none">
        {previous ? (
          <button
            type="button"
            onClick={() => {
              setTrail((t) => t.slice(0, -1));
            }}
            className="-ml-1.5 inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-sm text-link hover:bg-muted"
          >
            <Icon name="chevronLeft" className="size-4" />
            {fill(texts.ui.back, texts[audience][previous].title)}
          </button>
        ) : null}
        <section>
          <h3 className={HEADING}>{texts.ui.purpose}</h3>
          <p className="mt-1">{guide.purpose}</p>
        </section>
        <section>
          <h3 className={HEADING}>{texts.ui.goes[audience]}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {guide.goes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className={HEADING}>{texts.ui.example}</h3>
          <div className="mt-1 space-y-1 rounded-control border-l-4 border-accent-strong bg-accent px-3 py-2 text-accent-foreground">
            {guide.example.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
        {guide.notHere.length > 0 ? (
          <section>
            <h3 className={HEADING}>{texts.ui.notHere}</h3>
            <ul className="mt-2 space-y-2">
              {guide.notHere.map((pointer) => (
                <li key={pointer.text}>
                  <PointerButton
                    pointer={pointer}
                    audience={audience}
                    onChoose={(to) => {
                      setTrail((t) => [...t, to]);
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {guide.fields.length > 0 ? (
          <section>
            <h3 className={HEADING}>{texts.ui.fields}</h3>
            <dl className="mt-1 space-y-2">
              {guide.fields.map((field) => (
                <div key={field.name}>
                  <dt className="font-medium">{field.name}</dt>
                  <dd className="text-muted-foreground">{field.tip}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}

function useAudience(): Audience {
  const { me } = usePortal();
  return me.isFirm ? 'firm' : 'client';
}

/** "¿Qué va aquí?" next to a section's title: its guide, for who is looking. */
export function GuideButton({ section }: { section: Section }) {
  const texts = useGuideTexts();
  const audience = useAudience();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="-ml-1.5 inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-sm text-link hover:bg-muted"
      >
        <Icon name="help" className="size-4" />
        <span>{texts.ui.button}</span>
        <span className="sr-only">: {texts[audience][section].title}</span>
      </button>
      {open ? (
        <GuideDialog
          section={section}
          audience={audience}
          here={section}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The Help page's "¿Dónde registro cada cosa?": situations that open the
 * guide of the section they belong in, how the sections connect, and every
 * guide by name.
 */
export function GuideIndex() {
  const texts = useGuideTexts();
  const audience = useAudience();
  const [open, setOpen] = useState<Section | null>(null);
  const choose = (section: Section): void => {
    setOpen(section);
  };
  return (
    <Card title={texts.ui.whereTitle[audience]} className="lg:col-span-2">
      <p className="mb-4">{texts.ui.whereIntro[audience]}</p>
      <ul className="grid gap-2 md:grid-cols-2">
        {texts.where[audience].map((pointer) => (
          <li key={pointer.text}>
            <PointerButton pointer={pointer} audience={audience} onChoose={choose} />
          </li>
        ))}
      </ul>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="font-semibold">{texts.ui.mapTitle}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {texts.map[audience].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="font-semibold">{texts.ui.allTitle}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <li key={section}>
                <button
                  type="button"
                  onClick={() => {
                    choose(section);
                  }}
                  className={buttonClass('secondary', 'sm')}
                >
                  <Icon name="help" className="size-4" />
                  {texts[audience][section].title}
                  <span className="sr-only">: {texts.ui.button}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {open ? (
        <GuideDialog
          section={open}
          audience={audience}
          here={null}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </Card>
  );
}
