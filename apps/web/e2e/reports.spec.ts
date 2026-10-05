/**
 * Phase 6's promise: a test PDF report in the firm's format (PLAN.md § 11,
 * F6). The lawyer prepares the month's report (the AI drafts the summary
 * from masked data), downloads its PDF and sends it; the client's users who
 * see the whole company receive it and download it, and a unit's user does
 * not. The AI answers "what is pending" and drafts a reminder. Gemini is the
 * backend's test double: its canned answers say so.
 */
import { readFileSync } from 'node:fs';
import { device, expect, signIn, syncNow, test } from './fixtures.ts';

const CLIENT_A = '00000000-0000-4000-8000-00000000001a';

test('the lawyer prepares, downloads and sends the monthly report; the client receives it', async ({
  browser,
  request,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'abogado');
  await page.getByRole('link', { name: 'Reportes' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Cliente Demo/ })).toBeVisible();

  await page.goto(`./#/reportes/${CLIENT_A}/2026-09`);
  await expect(page.getByRole('heading', { level: 1, name: 'septiembre de 2026' })).toBeVisible();
  const preview = page.getByRole('article', { name: 'Vista previa' });
  await expect(
    preview.getByRole('heading', { name: 'Reporte mensual de seguimiento' }),
  ).toBeVisible();
  await expect(preview.getByRole('heading', { name: '1. Resumen ejecutivo' })).toBeVisible();
  await expect(preview).toContainText('Entregar acta constitutiva');
  // Nothing internal reaches the client's report.
  await expect(preview).not.toContainText('Revisar criterio');

  // The AI drafts; what was written is replaced only if the lawyer says so.
  const summary = page.getByRole('textbox', { name: 'Resumen ejecutivo' });
  await expect(summary).toHaveValue('Borrador del resumen (ejemplo).');
  await page.getByRole('button', { name: 'Redactar con IA' }).click();
  const replace = page.getByRole('dialog', { name: '¿Reemplazar el resumen?' });
  await replace.getByRole('button', { name: 'Reemplazar' }).click();
  await expect(summary).toHaveValue(/Texto de demostración/);
  await expect(summary).not.toHaveValue(/\[ASUNTO_/);
  await expect(preview).toContainText('Texto de demostración');

  // The PDF, made in this browser.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Reporte 2026-09 - Cliente Demo.pdf');
  const path = await download.path();
  const pdf = readFileSync(path);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(20_000);
  if (process.env.REPORT_PDF_OUT) await download.saveAs(process.env.REPORT_PDF_OUT);

  // Sent: to whoever sees the whole company, frozen from then on.
  await page.getByRole('button', { name: 'Enviar al cliente' }).click();
  const confirm = page.getByRole('dialog', { name: 'Enviar el reporte de septiembre de 2026' });
  await expect(confirm).toContainText('admin@cliente-a.example');
  await expect(confirm).toContainText('lectura@cliente-a.example');
  await expect(confirm).not.toContainText('norte@cliente-a.example');
  await confirm.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Reporte enviado: el correo llegó a 2 personas.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/por Abogado Demo\. Es el PDF que recibió el cliente/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Resumen ejecutivo' })).toHaveCount(0);

  const mails = await (await request.get('mock-api/correos')).text();
  expect(mails).toContain('Reporte mensual · Cliente Demo · septiembre de 2026');
  expect(mails).toContain('Adjunto: Reporte 2026-09 - Cliente Demo.pdf');
  await context.close();

  // The client's administrator: the bell, the list and the PDF.
  const client = await device(browser);
  const admin = await client.newPage();
  await signIn(admin, 'adminA');
  await syncNow(admin);
  await admin.goto('./#/avisos');
  await expect(
    admin.getByRole('button', { name: 'El despacho te envió el reporte de septiembre de 2026.' }),
  ).toBeVisible();
  await admin.getByRole('link', { name: 'Reportes' }).first().click();
  await expect(admin.getByRole('link', { name: 'septiembre de 2026' })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'agosto de 2026' })).toBeVisible();
  await client.close();
});

test('a client downloads a sent report; a unit’s user does not see reports', async ({
  browser,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'adminA');
  await page.getByRole('link', { name: 'Reportes' }).first().click();
  await page.getByRole('link', { name: 'agosto de 2026' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'agosto de 2026' })).toBeVisible();
  await expect(page.getByText('Resumen de agosto (ejemplo).')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Reporte 2026-08 - Cliente Demo.pdf');
  expect(
    readFileSync(await download.path())
      .subarray(0, 5)
      .toString('latin1'),
  ).toBe('%PDF-');
  // A draft is the firm's: the client does not see it.
  await page.goto(`./#/reportes/${CLIENT_A}/2026-09`);
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await context.close();

  const unit = await device(browser);
  const norte = await unit.newPage();
  await signIn(norte, 'norte');
  await expect(norte.getByRole('link', { name: 'Reportes' })).toHaveCount(0);
  await norte.goto('./#/reportes');
  await expect(
    norte.getByText('Los reportes mensuales los reciben las personas que ven toda la empresa.', {
      exact: false,
    }),
  ).toBeVisible();
  await unit.close();
});

test('the AI answers what is pending and drafts a reminder for the client', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'adminA');
  const ask = page.locator('section', {
    has: page.getByRole('heading', { name: 'Pregúntale al portal' }),
  });
  await ask.getByLabel('Tu pregunta').fill('¿Qué tengo pendiente esta semana?');
  await ask.getByRole('button', { name: 'Preguntar' }).click();
  await expect(ask.getByText(/Lo más próximo es/)).toBeVisible({ timeout: 20_000 });
  await expect(ask).not.toContainText('[TAREA_');
  await context.close();

  const firm = await device(browser);
  const lawyer = await firm.newPage();
  await signIn(lawyer, 'abogado');
  await lawyer.goto('./#/tareas/00000000-0000-4000-8000-000000000501');
  await expect(
    lawyer.getByRole('heading', { level: 1, name: 'Entregar acta constitutiva' }),
  ).toBeVisible();
  await lawyer.getByRole('button', { name: 'Redactar recordatorio con IA' }).click();
  const box = lawyer.getByLabel('Comentario para el cliente');
  await expect(box).toHaveValue(/Les recordamos que sigue pendiente Entregar acta constitutiva/, {
    timeout: 20_000,
  });
  await firm.close();
});
