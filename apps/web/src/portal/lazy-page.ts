/**
 * Each screen is its own download (PLAN.md § 21): the first visit brings
 * only the sign-in and the frame, and the screen it opens. Right after, the
 * rest come in the background (preloadPages), so every screen then opens at
 * once and without network, even before the service worker keeps them.
 */
import { createElement, lazy, type ComponentType } from 'react';

/** A screen's code did not arrive: no network before it was kept, or a new version replaced it. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super('No se pudo descargar el código de esta pantalla.', { cause });
    this.name = 'ChunkLoadError';
  }
}

export type LazyPage = ComponentType & { preload: () => Promise<ComponentType> };

const pages: LazyPage[] = [];

/** The screen `name` of a module: downloaded when it first draws, or before (preload). */
export function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): LazyPage {
  let loaded: ComponentType | null = null;
  let loading: Promise<ComponentType> | null = null;
  const preload = (): Promise<ComponentType> =>
    (loading ??= load().then(
      (module) => {
        const component = module[name];
        loaded = component;
        return component;
      },
      (error: unknown) => {
        loading = null; // the next attempt downloads it again
        throw new ChunkLoadError(error);
      },
    ));
  const Pending = lazy(() => preload().then((component) => ({ default: component })));
  // Once its code is here it draws at once: no "loading", the last screen never lingers.
  const Page: LazyPage = Object.assign(
    () => (loaded ? createElement(loaded) : createElement(Pending)),
    { preload },
  );
  pages.push(Page);
  return Page;
}

/** Brings every screen's code, in the background (a failure waits for the screen to open). */
export function preloadPages(): Promise<unknown> {
  return Promise.allSettled(pages.map((page) => page.preload()));
}
