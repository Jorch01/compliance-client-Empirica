import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { usePortal, useSession } from '../session/context.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Button } from '../ui/Button.tsx';
import { CheckboxField } from '../ui/Field.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Popover } from '../ui/Popover.tsx';
import { PreferencesInline } from './Preferences.tsx';
import { useFeedback } from '../feedback/context.ts';
import { useSyncStatus } from './sync-status.ts';
import { useTour } from './tour-context.ts';

/**
 * Signing out deletes this device's copy, unless the user keeps it (only on
 * a device nobody else uses). Unsent changes are tried first.
 */
function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const { engine } = usePortal();
  const status = useSyncStatus();
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      if (status.pending > 0 && navigator.onLine) {
        await Promise.race([engine.sync(), new Promise((r) => setTimeout(r, 15_000))]);
      }
      await signOut({ keepData: keep });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('logout.title')}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            icon="logOut"
            busy={busy}
            busyLabel={t('logout.sending')}
            onClick={() => void confirm()}
          >
            {t('logout.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>{t('logout.body')}</p>
        {status.pending > 0 ? (
          <p
            role="alert"
            className="rounded-control border border-warning-border bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground"
          >
            {t('logout.pending', { count: status.pending })}
          </p>
        ) : null}
        <CheckboxField
          label={t('logout.keep')}
          hint={t('logout.keepHint')}
          checked={keep}
          onChange={(e) => {
            setKeep(e.target.checked);
          }}
        />
      </div>
    </Dialog>
  );
}

/** Who is signed in, preferences, the tour and signing out. */
export function UserMenu() {
  const { t } = useTranslation();
  const { me, call } = usePortal();
  const { start } = useTour();
  const feedback = useFeedback();
  const [logout, setLogout] = useState(false);
  return (
    <>
      <Popover
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-1.5 hover:bg-muted"
          >
            <Avatar name={me.name || me.email} />
            <span className="sr-only">{t('nav.account')}</span>
            <Icon name="chevronDown" className="size-4 text-muted-foreground" />
          </button>
        )}
      >
        {(close) => (
          <div className="space-y-4">
            <div>
              <p className="font-semibold">{me.name}</p>
              <p className="text-sm break-all text-muted-foreground">{me.email}</p>
              <p className="mt-1 label-caps text-muted-foreground">{t(`roles.${me.rolBase}`)}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t('shell.preferences')}</p>
              <PreferencesInline
                onLanguage={(idioma) => {
                  // Emails and the calendar feed follow; offline, the device keeps it anyway.
                  call('profile.update', { idioma }).catch(() => undefined);
                }}
              />
            </div>
            <div className="flex flex-col items-stretch gap-1 border-t border-border pt-3">
              <Button
                variant="ghost"
                icon="help"
                className="justify-start"
                onClick={() => {
                  close();
                  start();
                }}
              >
                {t('help.tour')}
              </Button>
              <Button
                variant="ghost"
                icon="message"
                className="justify-start"
                onClick={() => {
                  close();
                  feedback.open();
                }}
              >
                {t('feedback.button')}
              </Button>
              <Link
                href="/ayuda"
                onClick={close}
                className="inline-flex min-h-11 items-center gap-2 rounded-control px-4 font-medium hover:bg-muted"
              >
                <Icon name="info" className="size-4" />
                {t('nav.help')}
              </Link>
              <Button
                variant="ghost"
                icon="logOut"
                className="justify-start"
                onClick={() => {
                  close();
                  setLogout(true);
                }}
              >
                {t('auth.signOut')}
              </Button>
            </div>
          </div>
        )}
      </Popover>
      <LogoutDialog
        open={logout}
        onClose={() => {
          setLogout(false);
        }}
      />
    </>
  );
}
