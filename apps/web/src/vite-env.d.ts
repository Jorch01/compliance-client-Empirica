/** Build-time settings (see apps/web/.env.example). */
interface ImportMetaEnv {
  /** Firebase browser API key: public by design, kept out of the repository. */
  readonly VITE_FIREBASE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
