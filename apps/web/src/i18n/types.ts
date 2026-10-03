import type { es } from './es.ts';

/** The shape of es.ts with every text as a plain string: what en.ts must match. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Messages = Widen<typeof es>;
