/// <reference types="vite-plugin-pwa/client" />

/** Build-time settings (see apps/web/.env.example and .env.mock). */
interface ImportMetaEnv {
  /** Firebase browser API key: public by design, kept out of the repository. */
  readonly VITE_FIREBASE_API_KEY?: string;
  /** "mock": demo users against the local mock API (npm run dev:mock). */
  readonly VITE_AUTH?: string;
  /** Overrides the backend address (the mock API, or a test deployment). */
  readonly VITE_API_URL?: string;
  /** The Web App's deployment, from the GitHub variable of the same name. */
  readonly VITE_APPS_SCRIPT_DEPLOYMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The web app's version (apps/web/package.json), compared with Config.minAppVersion. */
declare const __APP_VERSION__: string;
