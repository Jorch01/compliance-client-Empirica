/**
 * F9, billing in the browser (PLAN.md § 28): a partner records a payment
 * and an expense and sees each one's net; a month the retainer generated is
 * paid offline; the split is the partners' alone; assistants and clients
 * never see billing; taking a lawyer's authorization away takes billing off
 * his device; a reminder rings in the bell; a client the firm only bills
 * (D87) lives in billing and nowhere else. Amounts and rates are the demo's
 * examples (packages/shared/src/testing/fixtures.ts).
 */
import { audit } from './axe.ts';
import { device, expect, signIn, syncNow, test } from './fixtures.ts';

const SEPTEMBER = 'Iguala mensual (ejemplo) · septiembre de 2026';
const OCTOBER = 'Iguala mensual (ejemplo) · octubre de 2026';

test('a partner records a payment and an expense, and sees what each one takes', async ({
  browser,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.getByRole('link', { name: 'Cobranza' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cobranza' })).toBeVisible();
  await expect(page.getByText('Por cobrar hoy')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Devengado y cobrado, últimos 12 meses' }),
  ).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Secciones de cobranza' })
    .getByRole('link', { name: 'Cobros' })
    .click();
  await page.getByRole('link', { name: SEPTEMBER }).click();
  await expect(page.getByRole('heading', { level: 1, name: SEPTEMBER })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar pago' }).first().click();
  const payment = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(payment.getByRole('textbox', { name: 'Monto recibido' })).toHaveValue('29000');
  await payment.getByRole('button', { name: 'Guardar' }).click();
  await expect(payment).toBeHidden();
  // 25,000 without VAT, split 50/30/20; the partner's 30 % estimated tax comes out of her part.
  await expect(page.getByRole('row', { name: /Socia Demo/ })).toContainText('$8,750.00');
  await expect(page.getByRole('row', { name: /Fondo del despacho/ })).toContainText('$5,000.00');

  await page.getByRole('button', { name: 'Agregar gasto' }).click();
  const expense = page.getByRole('dialog', { name: 'Agregar gasto' });
  await expense
    .getByRole('textbox', { name: 'Concepto' })
    .fill('Comisión de la terminal (ejemplo)');
  await expense.getByRole('textbox', { name: 'Monto', exact: true }).fill('500');
  await expense.getByRole('button', { name: 'Guardar' }).click();
  await expect(expense).toBeHidden();
  await expect(page.getByRole('row', { name: /Socia Demo/ })).toContainText('$8,575.00');

  await syncNow(page);
  await expect(page.getByRole('row', { name: /Socia Demo/ })).toContainText('$8,575.00');
  await context.close();
});

test('a month the retainer generated is paid offline, and reaches the lawyer', async ({
  browser,
}) => {
  const partnerContext = await device(browser);
  const partner = await partnerContext.newPage();
  await signIn(partner, 'socia');
  await partner.goto('./#/cobranza/cobros');
  await partner.getByRole('link', { name: OCTOBER }).click();
  await expect(partner.getByText(/todavía no está guardado/)).toBeVisible();

  await partnerContext.setOffline(true);
  await partner.getByRole('button', { name: 'Registrar pago' }).first().click();
  const payment = partner.getByRole('dialog', { name: 'Registrar pago' });
  await payment.getByRole('button', { name: 'Guardar' }).click();
  await expect(payment).toBeHidden();
  await expect(partner.getByText(/todavía no está guardado/)).toBeHidden();
  await partnerContext.setOffline(false);
  await syncNow(partner);

  const lawyerContext = await device(browser);
  const lawyer = await lawyerContext.newPage();
  await signIn(lawyer, 'abogado');
  await lawyer.goto('./#/cobranza/cobros');
  await lawyer.getByRole('button', { name: 'Pagados' }).click();
  await expect(lawyer.getByRole('link', { name: OCTOBER })).toBeVisible();
  await partnerContext.close();
  await lawyerContext.close();
});

test('the split is the partners’; assistants and clients never see billing', async ({
  browser,
}) => {
  const lawyerContext = await device(browser);
  const lawyer = await lawyerContext.newPage();
  await signIn(lawyer, 'abogado');
  await lawyer.getByRole('link', { name: 'Cobranza' }).first().click();
  await lawyer.goto('./#/cobranza/cobros');
  await lawyer.getByRole('link', { name: SEPTEMBER }).click();
  await expect(lawyer.getByText('El reparto lo deciden los socios.')).toBeVisible();
  await expect(lawyer.getByRole('button', { name: 'Cambiar reparto' })).toHaveCount(0);
  await lawyerContext.close();

  for (const user of ['asistente', 'adminA'] as const) {
    const context = await device(browser);
    const page = await context.newPage();
    await signIn(page, user);
    await expect(page.getByRole('link', { name: 'Cobranza' })).toHaveCount(0);
    await page.goto('./#/cobranza');
    await expect(
      page.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeVisible();
    await context.close();
  }
});

test('taking a lawyer’s billing away takes it off his device', async ({ browser }) => {
  const lawyerContext = await device(browser);
  const lawyer = await lawyerContext.newPage();
  await signIn(lawyer, 'abogado');
  await expect(lawyer.getByRole('link', { name: 'Cobranza' }).first()).toBeVisible();

  const partnerContext = await device(browser);
  const partner = await partnerContext.newPage();
  await signIn(partner, 'socia');
  await partner.goto('./#/usuarios');
  const box = partner.getByRole('checkbox', { name: 'Cobranza de Abogado Demo' });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(box).not.toBeChecked();

  await syncNow(lawyer);
  await expect(lawyer.getByRole('link', { name: 'Cobranza' })).toHaveCount(0);
  await lawyer.goto('./#/cobranza');
  await expect(
    lawyer.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
  ).toBeVisible();
  await partnerContext.close();
  await lawyerContext.close();
});

test('the partner changes a split, and a reminder rings in the bell', async ({
  browser,
  request,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.goto('./#/cobranza/igualas');
  await page.getByRole('button', { name: 'Cambiar reparto' }).click();
  const split = page.getByRole('dialog', { name: 'Reparto' });
  await split.getByRole('spinbutton', { name: /Porcentaje de Socia Demo/ }).fill('40');
  await split.getByRole('spinbutton', { name: /Porcentaje de Fondo del despacho/ }).fill('30');
  await split.getByRole('button', { name: 'Guardar' }).click();
  await expect(split).toBeHidden();
  await expect(page.getByText(/Socia Demo 40 %/)).toBeVisible();

  await page.goto('./#/cobranza/recordatorios');
  await page.getByRole('button', { name: 'Nuevo recordatorio' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo recordatorio' });
  await form.getByRole('combobox', { name: 'Cliente' }).selectOption({ label: 'Cliente Demo' });
  await form.getByRole('textbox', { name: 'Qué hay que hacer' }).fill('Llamar al cliente (prueba)');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form).toBeHidden();
  await syncNow(page);

  await request.post('mock-api/cobranza/avisos');
  await syncNow(page);
  await page.goto('./#/avisos');
  await expect(
    page.getByText('Recordatorio de cobranza: «Llamar al cliente (prueba)».'),
  ).toBeVisible();
  await context.close();
});

test('a client the firm only bills: opened from billing, and nowhere else', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.goto('./#/cobranza/clientes');
  await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible();
  // The demo's lawsuit: 40,000 plus VAT, half paid.
  const lawsuit = page.getByRole('row', { name: /Litigio Demo/ });
  await expect(lawsuit).toContainText('Solo cobranza');
  await expect(lawsuit).toContainText('$23,200.00');

  await page.getByRole('button', { name: 'Nuevo cliente de cobranza' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo cliente de cobranza' });
  await form.getByRole('textbox', { name: 'Razón social' }).fill('Juicio Demo, S.C.');
  await expect(
    form.getByRole('checkbox', { name: 'Solo cobranza (fuera del seguimiento)' }),
  ).toBeChecked();
  await form.getByRole('button', { name: 'Crear' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('row', { name: /Juicio Demo/ })).toContainText('Solo cobranza');
  await syncNow(page);
  // The server took it: still there after the sync.
  await expect(page.getByRole('row', { name: /Juicio Demo/ })).toBeVisible();

  await page.getByRole('button', { name: /Ver su cobranza.*Litigio Demo/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cobranza' })).toBeVisible();
  const client = page.getByRole('combobox', { name: 'Cliente' });
  await expect(client.locator('option:checked')).toHaveText('Litigio Demo');
  await expect(page.getByText('$23,200.00').first()).toBeVisible();

  // Its card: the team and what billing only means; no units, users or invitations.
  await page.goto('./#/cobranza/clientes');
  await page.getByRole('button', { name: /Ficha y equipo.*Litigio Demo/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Litigio Demo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Equipo del despacho' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unidades y sucursales' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Invitar usuario' })).toHaveCount(0);
  await audit(page, 'ficha de un cliente solo de cobranza');

  // The tracking portal never offers it.
  await page.goto('./#/asuntos');
  await expect(client.locator('option', { hasText: 'Litigio Demo' })).toHaveCount(0);
  await expect(client.locator('option', { hasText: 'Juicio Demo' })).toHaveCount(0);
  await page.goto('./#/');
  await expect(page.getByText('Litigio Demo')).toHaveCount(0);
  await context.close();

  // An assistant assigned to it never has it.
  const assistantContext = await device(browser);
  const assistant = await assistantContext.newPage();
  await signIn(assistant, 'asistente');
  await assistant.goto('./#/clientes');
  await expect(assistant.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible();
  await expect(assistant.getByText('Litigio Demo')).toHaveCount(0);
  await assistantContext.close();
});
