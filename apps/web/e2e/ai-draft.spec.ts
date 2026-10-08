/**
 * Phase 8 in the browser: "Crear con IA" (PLAN.md § 24, D73–D77). A lawyer
 * asks, corrects the proposal and creates it with one click; it is born
 * internal and the client sees only what was shared. Nobody else has the
 * button. The demo's Gemini answers a fixed proposal.
 */
import { audit } from './axe.ts';
import { device, expect, signIn, syncNow, test } from './fixtures.ts';

const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
/** "Licencia de funcionamiento", a shared matter of Cliente Demo (unit Norte). */
const MATTER = `#/asuntos/${id(0x402)}`;

test('a lawyer has the AI suggest a matter’s tasks, corrects and creates them; the client sees what was shared', async ({
  browser,
}) => {
  const desk = await device(browser);
  const firm = await desk.newPage();
  await signIn(firm, 'abogado');
  await firm.goto(MATTER);
  await expect(
    firm.getByRole('heading', { level: 1, name: 'Licencia de funcionamiento' }),
  ).toBeVisible();
  await firm.getByRole('button', { name: 'Sugerir tareas con IA' }).click();
  const dialog = firm.getByRole('dialog', { name: 'Sugerir tareas con IA' });
  await expect(dialog.getByText('En el asunto «Licencia de funcionamiento»')).toBeVisible();
  await dialog
    .getByLabel('¿Qué necesitas?')
    .fill('¿Qué tareas faltan? El cliente debe mandar los documentos en una semana.');
  await audit(firm, 'ai draft request');
  await dialog.getByRole('button', { name: 'Proponer' }).click();

  // Three tasks for this matter, all internal; the date the AI read is marked for review.
  await expect(dialog.getByText('Propuesta de la IA')).toBeVisible();
  const tasks = dialog.getByRole('group', { name: 'Tarea' });
  await expect(tasks).toHaveCount(3);
  await expect(tasks.nth(0).getByLabel('Título')).toHaveValue(
    'Solicitar al cliente la documentación',
  );
  await expect(
    tasks.nth(0).getByText('La IA leyó esta fecha de tu petición: confírmala.'),
  ).toBeVisible();
  await expect(
    tasks.nth(1).getByText('Después de «Solicitar al cliente la documentación»'),
  ).toBeVisible();
  for (const share of await dialog.getByLabel('Visible para el cliente').all()) {
    await expect(share).not.toBeChecked();
  }
  await audit(firm, 'ai draft proposal');
  await firm.emulateMedia({ colorScheme: 'dark' });
  await audit(firm, 'ai draft proposal (dark)');
  await firm.emulateMedia({ colorScheme: 'light' });

  // Corrected: one task out, a title in the lawyer's words, the first one shared.
  await dialog.getByRole('button', { name: 'Quitar «Enviar observaciones al cliente»' }).click();
  await expect(dialog.getByRole('status')).toHaveText(
    'Se quitó «Enviar observaciones al cliente».',
  );
  await expect(tasks).toHaveCount(2);
  await tasks.nth(1).getByLabel('Título').fill('Revisar la documentación del expediente');
  await tasks.nth(0).getByLabel('Visible para el cliente').check();
  await dialog.getByRole('button', { name: 'Crear 2 registros' }).click();

  await expect(dialog.getByText('Se crearon 2 registros.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Listo' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    firm.getByRole('link', { name: 'Solicitar al cliente la documentación' }),
  ).toBeVisible();
  await expect(
    firm.getByRole('link', { name: 'Revisar la documentación del expediente' }),
  ).toBeVisible();
  await syncNow(firm);

  // The client sees the task that was shared, and not the internal one.
  const office = await device(browser);
  const client = await office.newPage();
  await signIn(client, 'adminA');
  await client.goto(MATTER);
  await expect(
    client.getByRole('link', { name: 'Solicitar al cliente la documentación' }),
  ).toBeVisible();
  await expect(
    client.getByRole('link', { name: 'Revisar la documentación del expediente' }),
  ).toHaveCount(0);
  // And no AI button of its own.
  await expect(client.getByRole('button', { name: 'Sugerir tareas con IA' })).toHaveCount(0);
  await desk.close();
  await office.close();
});

test('from the matters: a new matter with its tasks and a meeting, created and opened', async ({
  browser,
}) => {
  const desk = await device(browser);
  const firm = await desk.newPage();
  await signIn(firm, 'socia');
  await firm.goto('#/asuntos');
  await firm.getByRole('button', { name: 'Crear con IA' }).click();
  const dialog = firm.getByRole('dialog', { name: 'Crear con IA' });
  await dialog.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente Demo' });
  await dialog
    .getByLabel('¿Qué necesitas?')
    .fill('Abre un asunto de revisión de un contrato con dos tareas y una reunión.');
  await dialog.getByRole('button', { name: 'Proponer' }).click();
  await expect(dialog.getByRole('group', { name: 'Asunto' })).toHaveCount(1);
  await expect(dialog.getByRole('group', { name: 'Tarea' })).toHaveCount(2);
  await expect(dialog.getByRole('group', { name: 'Cita' })).toHaveCount(1);
  await expect(
    dialog
      .getByRole('group', { name: 'Tarea' })
      .first()
      .getByText(/^En el asunto «Revisión de contrato/),
  ).toBeVisible();

  // A matter without its area cannot be created: the button says what is missing.
  await dialog.getByRole('group', { name: 'Asunto' }).getByLabel('Área').selectOption('');
  await dialog.getByRole('button', { name: 'Crear 4 registros' }).click();
  await expect(dialog.getByRole('alert').first()).toBeVisible();
  await expect(dialog.getByText('Completa este dato.')).toBeVisible();
  await dialog.getByRole('group', { name: 'Asunto' }).getByLabel('Área').selectOption('CONTRATOS');

  await dialog.getByRole('button', { name: 'Crear 4 registros' }).click();
  await expect(dialog.getByText('Se crearon 4 registros.')).toBeVisible();
  await dialog.getByRole('link', { name: 'Asunto: Revisión de contrato (demostración)' }).click();
  await expect(
    firm.getByRole('heading', { level: 1, name: 'Revisión de contrato (demostración)' }),
  ).toBeVisible();
  await expect(
    firm.getByRole('link', { name: 'Solicitar al cliente el contrato firmado' }),
  ).toBeVisible();
  await desk.close();
});

test('only the client’s lawyers have the button: not the assistant, not the client', async ({
  browser,
}) => {
  for (const user of ['asistente', 'adminA'] as const) {
    const context = await device(browser);
    const page = await context.newPage();
    await signIn(page, user);
    await page.goto('#/asuntos');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear con IA' })).toHaveCount(0);
    await page.goto(MATTER);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Licencia de funcionamiento' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sugerir tareas con IA' })).toHaveCount(0);
    await context.close();
  }
});
