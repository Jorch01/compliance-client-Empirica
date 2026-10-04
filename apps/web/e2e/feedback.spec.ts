/**
 * "Sugerencias o errores": anyone sends one, even without network; the
 * portal's administrators answer it; only its author sees the answer.
 */
import { audit } from './axe.ts';
import { device, expect, signIn, test } from './fixtures.ts';
import { localRows } from './local.ts';

const REPORT = 'El semáforo de la Unidad Sur no cambia de color';
const ANSWER = 'Corregido en la versión de hoy. ¡Gracias por avisar!';

test('a client reports a problem offline; an administrator answers it', async ({ browser }) => {
  const phone = await device(browser, { mobile: true });
  const desk = await device(browser);
  const client = await phone.newPage();
  const firm = await desk.newPage();
  await signIn(client, 'adminSur');
  await signIn(firm, 'socia');

  // Without network, from the account menu.
  await phone.setOffline(true);
  await expect(client.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await client.getByRole('button', { name: 'Tu cuenta' }).click();
  await client.getByRole('button', { name: 'Sugerencias o errores' }).click();
  const form = client.getByRole('dialog', { name: 'Cuéntanos' });
  await form.getByRole('radio', { name: 'Algo no funciona' }).check();
  // An error report carries the technical details unless the user says no; they see them first.
  await expect(form.getByRole('checkbox', { name: /Incluir detalles técnicos/ })).toBeChecked();
  await form.getByRole('button', { name: 'Ver lo que se envía' }).click();
  await expect(form.getByText(/"sincronizacion"/)).toBeVisible();
  await audit(client, 'feedback form');
  await form.getByLabel('¿Qué pasó?').fill(REPORT);
  await form.getByRole('button', { name: 'Enviar' }).click();
  await expect(form.getByText(/Quedó guardado en este dispositivo/)).toBeVisible();
  await form.getByRole('link', { name: 'Ver mis sugerencias' }).click();
  await expect(
    client.getByRole('heading', { level: 1, name: 'Sugerencias y errores' }),
  ).toBeVisible();
  const mine = client.getByRole('listitem').filter({ hasText: REPORT });
  await expect(mine.getByText('Pendiente de enviar')).toBeVisible();
  await expect(mine.getByText('Nueva')).toBeVisible();

  // The network comes back: it goes on its own.
  await phone.setOffline(false);
  await expect(client.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });
  await expect(mine.getByText('Pendiente de enviar')).toHaveCount(0);

  // An administrator sees it arrive, with who sent it and the details, and answers.
  await firm.getByRole('button', { name: /Al día|Sincronizando/ }).click();
  await firm.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await firm.keyboard.press('Escape');
  const nav = firm.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('link', { name: /^Sugerencias/ })).toContainText('2', {
    timeout: 20_000,
  });
  await nav.getByRole('link', { name: /^Sugerencias/ }).click();
  const report = firm.getByRole('listitem').filter({ hasText: REPORT });
  await expect(report).toContainText('De Admin Sur');
  await report.getByRole('button', { name: 'Detalles técnicos' }).click();
  await expect(report.getByText(/"version"/)).toBeVisible();
  await report.getByRole('combobox', { name: 'Estado' }).selectOption('RESUELTA');
  await report.getByLabel('Respuesta').fill(ANSWER);
  await report.getByRole('button', { name: 'Guardar' }).click();
  // Answered, it leaves the open ones.
  await expect(report).toHaveCount(0);
  await firm.getByRole('button', { name: 'Todas' }).click();
  await expect(report.getByRole('combobox', { name: 'Estado' })).toHaveValue('RESUELTA');
  await expect(firm.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });

  // Its author reads the answer; the menu now leads to it.
  await client.getByRole('button', { name: /Al día/ }).click();
  await client.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await client.keyboard.press('Escape');
  await expect(mine.getByText('Resuelta')).toBeVisible({ timeout: 20_000 });
  await expect(mine.getByText(ANSWER)).toBeVisible();
  await audit(client, 'feedback answered');

  // Nobody else at the client receives it, not even on their device.
  const other = await device(browser);
  const colleague = await other.newPage();
  await signIn(colleague, 'adminA');
  const theirs = await localRows(colleague, 'Sugerencias');
  expect(theirs.map((r) => r.mensaje)).not.toContain(REPORT);
  await other.close();
  await phone.close();
  await desk.close();
});
