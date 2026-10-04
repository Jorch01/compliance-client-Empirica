/**
 * Phase 3 in the browser: matters, tasks, comments and documents, with what
 * each side may see and do, and a conflict decided by a partner.
 */
import { audit } from './axe.ts';
import { device, expect, signIn, syncNow, test } from './fixtures.ts';
import { everything } from './local.ts';

const MATTER = 'Constitución de filial';
const TASK = 'Reunir actas de asamblea';
const INTERNAL_NOTE = 'Revisar poderes antes de firmar';
const SHARED_NOTE = 'Les compartimos el plan de trabajo';
const PDF = {
  name: 'plan.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 ficticio'),
};

test('the firm opens a matter; the client sees what is shared, and nothing internal', async ({
  browser,
}) => {
  const desk = await device(browser);
  const firm = await desk.newPage();
  await signIn(firm, 'socia');

  // A new matter, shared with the client (D19).
  await firm.goto('#/asuntos');
  await firm.getByRole('button', { name: 'Nuevo asunto' }).click();
  const form = firm.getByRole('dialog', { name: 'Nuevo asunto' });
  await form.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente Demo' });
  await form.getByLabel('Título').fill(MATTER);
  await form.getByLabel('Área').selectOption('CORPORATIVO');
  await audit(firm, 'matter form');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(firm.getByRole('heading', { level: 1, name: MATTER })).toBeVisible();

  // Its first task, on the client's side, with a checklist.
  await firm.getByRole('button', { name: 'Nueva tarea' }).click();
  const taskForm = firm.getByRole('dialog', { name: 'Nueva tarea' });
  await taskForm.getByLabel('Título').fill(TASK);
  await taskForm.getByLabel('Le toca a').selectOption('CLIENTE');
  await taskForm.getByLabel(/Fecha límite/).fill('2026-11-20');
  await taskForm.getByRole('button', { name: 'Agregar punto' }).click();
  await taskForm.getByLabel('Punto 1', { exact: true }).fill('Acta de 2025');
  await audit(firm, 'task form');
  await taskForm.getByRole('button', { name: 'Guardar' }).click();
  await expect(firm.getByRole('link', { name: TASK })).toBeVisible();

  // Two conversations: internal (the default for the firm) and with the client.
  await firm.getByLabel('Comentario interno').fill(INTERNAL_NOTE);
  await firm.getByRole('button', { name: 'Comentar' }).click();
  await expect(firm.getByRole('listitem').filter({ hasText: INTERNAL_NOTE })).toBeVisible();
  await firm.getByRole('button', { name: /^Con el cliente/ }).click();
  await firm.getByLabel('Comentario para el cliente').fill(SHARED_NOTE);
  await firm.getByRole('button', { name: 'Comentar' }).click();
  await expect(firm.getByRole('listitem').filter({ hasText: SHARED_NOTE })).toBeVisible();

  // A document of the firm starts internal; its file goes up and comes back down.
  await firm.getByRole('button', { name: 'Subir documento' }).click();
  const upload = firm.getByRole('dialog', { name: 'Subir documento' });
  await upload.getByLabel('Archivo').setInputFiles(PDF);
  await upload.getByRole('button', { name: 'Guardar' }).click();
  const doc = firm.getByRole('listitem').filter({ hasText: 'plan.pdf' });
  await expect(doc.getByText('Interno')).toBeVisible();
  await expect(doc.getByRole('button', { name: 'Descargar' })).toBeVisible({ timeout: 20_000 });
  const [download] = await Promise.all([
    firm.waitForEvent('download'),
    doc.getByRole('button', { name: 'Descargar' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('plan.pdf');
  await audit(firm, 'matter detail');
  await syncNow(firm);

  // The client: the matter, its task and the shared note; nothing internal, not even stored.
  const phone = await device(browser, { mobile: true });
  const client = await phone.newPage();
  await signIn(client, 'adminA');
  await client.goto('#/asuntos');
  await client.getByRole('link', { name: MATTER }).click();
  await expect(client.getByRole('heading', { level: 1, name: MATTER })).toBeVisible();
  await expect(client.getByRole('link', { name: TASK })).toBeVisible();
  await expect(client.getByText(SHARED_NOTE)).toBeVisible();
  await expect(client.getByText(INTERNAL_NOTE)).toHaveCount(0);
  await expect(client.getByText('plan.pdf')).toHaveCount(0);
  const stored = await everything(client, ['Comentarios', 'Documentos']);
  expect(stored).not.toContain(INTERNAL_NOTE);
  expect(stored).not.toContain('plan.pdf');
  await audit(client, 'client matter');

  // The client works their task and writes back.
  await client.getByRole('link', { name: TASK }).click();
  await client.getByLabel('Acta de 2025').check();
  await client.getByRole('button', { name: 'Marcar como listo' }).click();
  await expect(client.getByText('En revisión').first()).toBeVisible();
  await client.getByLabel('Escribe al despacho').fill('Enviamos las actas el lunes');
  await client.getByRole('button', { name: 'Comentar' }).click();
  await audit(client, 'client task');
  await syncNow(client);

  // The firm sees it all arrive.
  await syncNow(firm);
  await firm.getByRole('link', { name: TASK }).click();
  await expect(firm.getByLabel('Cambiar estado')).toHaveValue('EN_REVISION');
  await expect(firm.getByLabel('Acta de 2025')).toBeChecked();
  await firm.getByRole('button', { name: /^Con el cliente/ }).click();
  await expect(
    firm.getByRole('listitem').filter({ hasText: 'Enviamos las actas el lunes' }),
  ).toBeVisible();
  await phone.close();
  await desk.close();
});

test('a deleted matter takes its tasks along, and brings them back', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.goto('#/asuntos');
  await page.getByRole('link', { name: 'Licencia de funcionamiento' }).click();
  await page.getByRole('button', { name: 'Borrar asunto' }).click();
  await page
    .getByRole('dialog', { name: 'Borrar asunto' })
    .getByRole('button', { name: 'Borrar' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Asuntos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Licencia de funcionamiento' })).toHaveCount(0);
  await page.goto('#/tareas');
  await expect(page.getByRole('link', { name: 'Entregar acta constitutiva' })).toHaveCount(0);

  await page.goto('#/asuntos');
  await page.getByRole('button', { name: 'Borrados' }).click();
  const gone = page.getByRole('listitem').filter({ hasText: 'Licencia de funcionamiento' });
  await gone.getByRole('button', { name: 'Restaurar' }).click();
  await page.getByRole('button', { name: 'En curso' }).click();
  await expect(page.getByRole('link', { name: 'Licencia de funcionamiento' })).toBeVisible();
  await page.goto('#/tareas');
  await expect(page.getByRole('link', { name: 'Entregar acta constitutiva' })).toBeVisible();
  await context.close();
});

test('two lawyers move a deadline at once; a partner decides which one holds', async ({
  browser,
}) => {
  const laptop = await device(browser);
  const desk = await device(browser);
  const lawyer = await laptop.newPage();
  const partner = await desk.newPage();
  await signIn(lawyer, 'abogado');
  await signIn(partner, 'socia');
  const editDeadline = async (page: typeof lawyer, date: string): Promise<void> => {
    await page.goto('#/tareas');
    await page.getByRole('link', { name: 'Entregar acta constitutiva' }).click();
    await page.getByRole('button', { name: 'Editar tarea' }).click();
    const form = page.getByRole('dialog', { name: 'Editar tarea' });
    await form.getByLabel(/Fecha límite/).fill(date);
    await form.getByRole('button', { name: 'Guardar' }).click();
  };

  // The lawyer, offline, moves it; the partner moves it elsewhere first.
  await laptop.setOffline(true);
  await editDeadline(lawyer, '2026-10-20');
  await editDeadline(partner, '2026-10-18');
  await syncNow(partner);

  // Back online: the value in force stays, and the lawyer is told.
  await laptop.setOffline(false);
  await expect(lawyer.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });
  await expect(lawyer.getByText(/18 oct 2026/).first()).toBeVisible();

  await syncNow(partner);
  const nav = partner.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('link', { name: /^Conflictos/ }).click();
  const conflict = partner
    .getByRole('listitem')
    .filter({ hasText: 'Entregar acta constitutiva' })
    .filter({ hasText: 'Abogado Demo' });
  await expect(conflict).toContainText('18 oct 2026');
  await expect(conflict).toContainText('20 oct 2026');
  await audit(partner, 'conflicts');
  await conflict.getByRole('button', { name: 'Aplicar el propuesto' }).click();
  await expect(conflict).toHaveCount(0);
  await partner.getByRole('button', { name: 'Resueltos' }).click();
  await expect(
    partner.getByRole('listitem').filter({ hasText: 'Se aplicó el valor propuesto' }).first(),
  ).toBeVisible();
  await partner.goto('#/tareas');
  await partner.getByRole('link', { name: 'Entregar acta constitutiva' }).click();
  await expect(partner.getByText(/20 oct 2026/).first()).toBeVisible();
  await laptop.close();
  await desk.close();
});
