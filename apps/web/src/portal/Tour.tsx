import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { InstallInstructions } from './InstallInstructions.tsx';
import { isInstalled } from './install.ts';
import { TourContext, type TourContextValue } from './tour-context.ts';

type FirmStep = 'welcome' | 'nav' | 'client' | 'tiles' | 'sync' | 'bell';
type ClientStep = 'welcome' | 'nav' | 'unit' | 'pending' | 'sync' | 'bell';

interface Step {
  key: string;
  /** `data-tour` of the element the step points at; none for a centered card. */
  target?: string;
  title: string;
  body: string;
  install?: boolean;
}

const FIRM: readonly FirmStep[] = ['welcome', 'nav', 'client', 'tiles', 'sync', 'bell'];
const CLIENT: readonly ClientStep[] = ['welcome', 'nav', 'unit', 'pending', 'sync', 'bell'];

const seenKey = (userId: string): string => `empirica.tour.${userId}`;

/** The first element with that `data-tour` that is on screen (the menu differs by width). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/** The dimmed page with a hole around the target: tokens only, through color-mix. */
const SPOTLIGHT = '0 0 0 9999px color-mix(in oklab, var(--foreground) 50%, transparent)';

/** Puts the ring around the target and the card next to it (or centered without one). */
function place(
  ring: HTMLElement,
  shade: HTMLElement,
  card: HTMLElement,
  target: HTMLElement | null,
): void {
  const margin = 12;
  const pad = 6;
  const width = Math.min(380, window.innerWidth - 32);
  card.style.width = `${String(width)}px`;
  card.style.inset = 'auto';
  card.style.transform = '';
  if (!target) {
    ring.hidden = true;
    shade.hidden = false;
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }
  const rect = target.getBoundingClientRect();
  ring.hidden = false;
  shade.hidden = true;
  ring.style.top = `${String(rect.top - pad)}px`;
  ring.style.left = `${String(rect.left - pad)}px`;
  ring.style.width = `${String(rect.width + pad * 2)}px`;
  ring.style.height = `${String(rect.height + pad * 2)}px`;
  if (window.innerWidth < 640) {
    // On a phone the card sits at the bottom, clear of the menu and the header.
    card.style.left = '16px';
    card.style.bottom = '16px';
    return;
  }
  if (rect.height > window.innerHeight / 2) {
    // The sidebar: the card goes beside it.
    card.style.left = `${String(rect.right + margin)}px`;
    card.style.top = `${String(Math.max(16, rect.top + 80))}px`;
    return;
  }
  const height = card.offsetHeight;
  const below = rect.bottom + margin;
  const top =
    below + height < window.innerHeight - 16 ? below : Math.max(16, rect.top - margin - height);
  card.style.top = `${String(top)}px`;
  card.style.left = `${String(Math.min(Math.max(16, rect.left), window.innerWidth - width - 16))}px`;
}

function TourOverlay({ steps, onClose }: { steps: Step[]; onClose: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const step = steps[index];

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
    return () => {
      if (d?.open && typeof d.close === 'function') d.close();
    };
  }, []);

  // Follow the target: it may scroll into view, or the window may change size.
  useLayoutEffect(() => {
    if (!ring.current || !shade.current || !card.current) return;
    const target = step?.target ? findTarget(step.target) : null;
    target?.scrollIntoView({ block: 'nearest' });
    const update = (): void => {
      if (ring.current && shade.current && card.current) {
        place(ring.current, shade.current, card.current, target);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  if (!step) return null;
  const last = index === steps.length - 1;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 backdrop:bg-transparent"
    >
      <div
        ref={ring}
        aria-hidden="true"
        hidden
        className="pointer-events-none fixed rounded-card ring-4 ring-accent-strong transition-all"
        style={{ boxShadow: SPOTLIGHT }}
      />
      <div ref={shade} aria-hidden="true" className="fixed inset-0 bg-foreground/50" />
      <div
        ref={card}
        className="fixed max-h-[80dvh] overflow-y-auto rounded-panel border border-border bg-popover p-5 text-popover-foreground shadow-raised"
      >
        <p className="label-caps text-muted-foreground">
          {t('tour.step', { current: index + 1, total: steps.length })}
        </p>
        <h2 id="tour-title" className="mt-1 text-2xl font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-2">
          {step.body}
        </p>
        {step.install ? (
          <div className="mt-4">
            <InstallInstructions compact />
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('tour.skip')}
          </Button>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIndex((i) => i - 1);
                }}
              >
                {t('tour.back')}
              </Button>
            ) : null}
            <Button
              size="sm"
              autoFocus
              onClick={() => {
                if (last) onClose();
                else setIndex((i) => i + 1);
              }}
            >
              {last ? t('tour.done') : t('tour.next')}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The guided tour (DISENO.md § 8): five or six steps, different for the firm
 * and for clients, shown the first time and again from Help. The last step
 * asks to install the portal, unless it already is.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const [location, navigate] = useLocation();
  const [steps, setSteps] = useState<Step[] | null>(null);

  const build = useCallback((): Step[] => {
    const list: Step[] = me.isFirm
      ? FIRM.map((key) => ({
          key,
          ...(key === 'welcome' ? {} : { target: key }),
          title: t(`tour.firm.${key}.title`),
          body: t(`tour.firm.${key}.body`),
        }))
      : CLIENT.map((key) => ({
          key,
          ...(key === 'welcome' ? {} : { target: key }),
          title: t(`tour.client.${key}.title`),
          body: t(`tour.client.${key}.body`),
        }));
    // Steps whose element is not on this screen (a client without units) are left out.
    const shown = list.filter((s) => !s.target || findTarget(s.target));
    if (!isInstalled()) {
      shown.push({
        key: 'install',
        title: t('tour.install.title'),
        body: t('tour.install.body'),
        install: true,
      });
    }
    return shown;
  }, [me.isFirm, t]);

  const start = useCallback(() => {
    if (location !== '/') navigate('/');
    // Let the home screen render before looking for the elements.
    setTimeout(() => {
      setSteps(build());
    }, 150);
  }, [build, location, navigate]);

  const close = useCallback(() => {
    setSteps(null);
    try {
      localStorage.setItem(seenKey(me.id), 'done');
    } catch {
      /* private mode */
    }
  }, [me.id]);

  // First visit: once the home screen has its data on screen.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(seenKey(me.id)) === 'done';
    } catch {
      /* private mode: never insist */
    }
    if (seen) return;
    const timer = setTimeout(() => {
      setSteps(build());
    }, 1_200);
    return () => {
      clearTimeout(timer);
    };
    // Only once per session start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const value = useMemo<TourContextValue>(() => ({ start }), [start]);
  return (
    <TourContext value={value}>
      {children}
      {steps ? <TourOverlay steps={steps} onClose={close} /> : null}
    </TourContext>
  );
}
