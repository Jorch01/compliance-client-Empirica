/**
 * F7: every page carries its security policy, and the portal does not run
 * inside another site's page. (Every other test fails if the policy refuses
 * anything the portal does: e2e/fixtures.ts.)
 */
import { device, expect, test } from './fixtures.ts';

test('each page carries its security policy', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  const policy = () =>
    page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');

  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeVisible();
  expect(await policy()).toContain("script-src 'self' https://apis.google.com");
  expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe(
    'strict-origin-when-cross-origin',
  );

  await page.goto('./privacidad/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await policy()).toContain("frame-src 'none'");
});

test('inside another site’s page the portal only offers to open itself', async ({
  browser,
  baseURL,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await page.setContent(
    `<iframe src="${baseURL ?? ''}" title="ajeno" width="900" height="700"></iframe>`,
  );
  const frame = page.frameLocator('iframe');
  await expect(
    frame.getByRole('heading', { level: 1, name: 'Abre el portal en su propia ventana' }),
  ).toBeVisible();
  const open = frame.getByRole('link', { name: 'Abrir el portal' });
  await expect(open).toHaveAttribute('target', '_blank');
  // Nothing else started: no sign-in.
  await expect(frame.getByRole('heading', { name: 'Inicia sesión' })).toHaveCount(0);
  await expect(frame.getByRole('button', { name: /Continuar con Google/ })).toHaveCount(0);
});
