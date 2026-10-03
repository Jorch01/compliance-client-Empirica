/**
 * WCAG 2.2 AA, checked by axe on the main screens of both sides, in light
 * and dark themes. Contrast of every token pair is also checked in the unit
 * tests (packages/shared/src/brand/tokens.test.ts).
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { device, expect, signIn, test, type DemoUser } from './fixtures.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = result.violations.map(
    (v) =>
      `${label}: ${v.id} (${v.impact ?? '?'}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(problems).toEqual([]);
}

test('the sign-in screen', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await audit(page, 'login');
  await context.close();
});

const SCREENS: { user: DemoUser; paths: string[]; dark?: boolean; mobile?: boolean }[] = [
  { user: 'socia', paths: ['#/', '#/clientes', '#/usuarios', '#/solicitudes', '#/ayuda'] },
  { user: 'socia', paths: ['#/'], dark: true },
  { user: 'adminA', paths: ['#/', '#/pendientes', '#/equipo'], mobile: true },
  { user: 'norte', paths: ['#/', '#/pendientes', '#/solicitudes'], dark: true, mobile: true },
];

for (const { user, paths, dark, mobile } of SCREENS) {
  test(`${user}${dark ? ' (dark)' : ''}${mobile ? ' (phone)' : ''}: ${paths.join(' ')}`, async ({
    browser,
  }) => {
    const context = await device(browser, { mobile: mobile ?? false });
    const page = await context.newPage();
    if (dark) await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page, user);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, `${user} ${path}`);
    }
    await context.close();
  });
}
