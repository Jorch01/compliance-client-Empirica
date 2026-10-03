/**
 * What every browser test needs: a fresh fictitious data set, devices that
 * have already seen the tour, and signing in as one of the demo users.
 */
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/** Demo users (packages/shared/src/testing/fixtures.ts): Usuarios ids and e-mails. */
export const USERS = {
  socia: { id: '00000000-0000-4000-8000-000000000301', email: 'socia@despacho.example' },
  abogado: { id: '00000000-0000-4000-8000-000000000302', email: 'abogado@despacho.example' },
  adminA: { id: '00000000-0000-4000-8000-000000000311', email: 'admin@cliente-a.example' },
  norte: { id: '00000000-0000-4000-8000-000000000312', email: 'norte@cliente-a.example' },
  adminSur: { id: '00000000-0000-4000-8000-000000000314', email: 'sur@cliente-a.example' },
} as const;
export type DemoUser = keyof typeof USERS;

/** A device: its own storage, the tour and the install reminder already dismissed. */
export async function device(
  browser: Browser,
  options: { tour?: boolean; mobile?: boolean } = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    locale: 'es-MX',
    timezoneId: 'America/Cancun',
    ...(options.mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : {}),
  });
  if (!options.tour) {
    const ids = Object.values(USERS).map((u) => u.id);
    await context.addInitScript((list: string[]) => {
      for (const id of list) {
        localStorage.setItem(`empirica.tour.${id}`, 'done');
        localStorage.setItem(`empirica.installBanner.${id}`, String(Date.now()));
      }
    }, ids);
  }
  return context;
}

/** Signs in as a demo user and waits for the portal. */
export async function signIn(page: Page, user: DemoUser): Promise<void> {
  await page.goto('./');
  await page
    .getByRole('button', { name: new RegExp(USERS[user].email.replace('.', '\\.')) })
    .click();
  await expect(page.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });
}

/** A fresh data set before each test: the mock backend starts over. */
export const test = base.extend<{ fresh: undefined }>({
  fresh: [
    async ({ request }, use) => {
      await request.post('mock-api/reset');
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };
