/**
 * Where the portal finds its backend: the Apps Script Web App, always the
 * same deployment (docs/SETUP.md, step 9). The address is built from the
 * deployment ID, the same GitHub variable the deploy job publishes to, so
 * it lives in one place. In mock mode it is the local mock API.
 *
 * Not a secret: every browser that uses the portal calls it, and the
 * backend asks each request for a valid session.
 */
export function apiUrlFrom(env: {
  VITE_API_URL?: string | undefined;
  VITE_APPS_SCRIPT_DEPLOYMENT_ID?: string | undefined;
}): string {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const id = (env.VITE_APPS_SCRIPT_DEPLOYMENT_ID ?? '').trim();
  // The whole address, pasted by mistake, works too.
  const fromUrl = /\/macros\/s\/([\w-]+)\/(?:exec|dev)\b/.exec(id)?.[1];
  const deploymentId = fromUrl ?? id;
  return /^[\w-]{20,}$/.test(deploymentId)
    ? `https://script.google.com/macros/s/${deploymentId}/exec`
    : '';
}

export const API_URL = apiUrlFrom(import.meta.env);

/** Demo users and the mock API instead of Firebase and Google (npm run dev:mock). */
export const MOCK_MODE = import.meta.env.VITE_AUTH === 'mock';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
