import { MOCK_MODE } from '../config/api.ts';
import type { AuthClient } from './types.ts';

let shared: Promise<AuthClient> | null = null;

/** The sign-in provider for this build, loaded once (Firebase is a separate chunk). */
export function loadAuthClient(): Promise<AuthClient> {
  shared ??= MOCK_MODE
    ? import('./mock.ts').then((m) => m.createMockAuth())
    : import('./firebase.ts').then((m) => m.createFirebaseAuth());
  return shared;
}
