/**
 * Phase 2's promise: without network one keeps working, and two devices
 * converge once they are back (PLAN.md § 11, F2).
 */
import { device, expect, signIn, test } from './fixtures.ts';
import { localRows } from './local.ts';

test('two devices converge after one worked offline', async ({ browser }) => {
  const phone = await device(browser, { mobile: true });
  const desk = await device(browser);
  const client = await phone.newPage();
  const firm = await desk.newPage();
  await signIn(client, 'norte');
  await signIn(firm, 'socia');

  // The client loses the network and keeps working.
  await phone.setOffline(true);
  await expect(client.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await client.goto('#/pendientes');
  const task = client.getByRole('listitem').filter({ hasText: 'Entregar acta constitutiva' });
  await task.getByRole('button', { name: 'Empezar' }).click();
  await expect(task.getByText(/En curso/)).toBeVisible();
  await expect(task.getByText('Pendiente de enviar')).toBeVisible();

  await client.goto('#/solicitudes');
  await client.getByRole('button', { name: 'Nueva solicitud' }).click();
  await client.getByLabel('¿Qué necesita?').fill('Revisar aviso de privacidad de la sucursal');
  await client.getByRole('button', { name: 'Enviar' }).click();
  const request = client
    .getByRole('listitem')
    .filter({ hasText: 'Revisar aviso de privacidad de la sucursal' });
  await expect(request.getByText('Pendiente de enviar')).toBeVisible();
  await expect(client.getByRole('button', { name: /Sin conexión/ })).toContainText('2');

  // Meanwhile the firm sees nothing new.
  await firm.goto('#/solicitudes');
  await expect(firm.getByText('Revisar aviso de privacidad de la sucursal')).toHaveCount(0);

  // The network comes back: the queue goes on its own.
  await phone.setOffline(false);
  await expect(client.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });
  await expect(request.getByText('Pendiente de enviar')).toHaveCount(0);

  // The firm syncs and sees both changes; it answers the request.
  await firm.getByRole('button', { name: /Al día|Sincronizando/ }).click();
  await firm.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await firm.keyboard.press('Escape');
  const seen = firm
    .getByRole('listitem')
    .filter({ hasText: 'Revisar aviso de privacidad de la sucursal' });
  await expect(seen).toBeVisible({ timeout: 20_000 });
  await seen.getByRole('combobox', { name: 'Cambiar estado' }).selectOption('EN_ANALISIS');
  await firm.goto('#/');
  await firm.getByRole('button', { name: /En espera del cliente/ }).click();
  await expect(
    firm
      .getByRole('dialog')
      .getByRole('listitem')
      .filter({ hasText: 'Entregar acta constitutiva' }),
  ).toContainText('En curso');
  await firm.keyboard.press('Escape');
  await expect(firm.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });

  // And the client gets the answer.
  await client.getByRole('button', { name: /Al día/ }).click();
  await client.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await client.keyboard.press('Escape');
  await expect(request.getByText('En análisis')).toBeVisible({ timeout: 20_000 });

  const stored = await localRows(firm, 'Solicitudes');
  expect(stored.some((r) => r.titulo === 'Revisar aviso de privacidad de la sucursal')).toBe(true);
  await phone.close();
  await desk.close();
});

test('the portal opens without network, from what the device keeps', async ({
  browser,
  browserName,
}) => {
  // Playwright's WebKit cannot reload any page without network, not even one its service
  // worker serves ("WebKit encountered an internal error"); Safari can. On WebKit this is
  // checked on a real iPhone instead (SETUP.md, step 12.6).
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot reload a page offline');
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // As when someone opens the portal again: the service worker already serves the page.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await expect(page.getByRole('heading', { level: 1, name: 'Hola, Socia' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Hola, Socia' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Cliente Demo/ })).toBeVisible();
  await context.close();
});

test('signing out wipes the device; keeping the data is a choice', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  expect((await localRows(page, 'Clientes')).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Tu cuenta' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page
    .getByRole('dialog', { name: 'Cerrar sesión' })
    .getByRole('button', { name: 'Cerrar sesión' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeVisible();
  const names = await page.evaluate(async () =>
    (await indexedDB.databases()).map((d) => d.name ?? '').filter((n) => n.startsWith('empirica-')),
  );
  expect(names).toEqual([]);
  await context.close();
});
