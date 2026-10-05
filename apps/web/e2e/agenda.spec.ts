/**
 * Phase 5's promise: what the portal schedules shows in the agenda and in
 * each person's calendar feed (ICS), and the portal tells each person what
 * concerns them (PLAN.md § 11, F5). Google Calendar itself is tested in the
 * backend (apps/api/src/calendar.test.ts).
 */
import { device, expect, signIn, syncNow, test } from './fixtures.ts';

/** RFC 5545 folds long lines; unfolded, a title can be searched whole. */
const unfold = (ics: string): string => ics.replace(/\r\n[ \t]/g, '');

test('an appointment written in the portal reaches the agenda and the personal feed', async ({
  browser,
  request,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'abogado');
  await page.getByRole('link', { name: 'Agenda' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible();

  await page.getByRole('button', { name: 'Nueva cita' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva cita' });
  await form.getByLabel('Título').fill('Junta de arranque F5');
  await form.getByLabel('Tipo').selectOption('AUDIENCIA');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form).toHaveCount(0);
  const line = page.getByRole('link', { name: 'Junta de arranque F5' });
  await expect(line).toBeVisible();
  await syncNow(page);

  // Opened again: the firm may change it.
  await line.click();
  const edit = page.getByRole('dialog', { name: 'Editar cita' });
  await expect(edit.getByLabel('Título')).toHaveValue('Junta de arranque F5');
  await expect(edit.getByLabel('Tipo')).toHaveValue('AUDIENCIA');
  await edit.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/#\/agenda$/);

  // The personal link: the same agenda, in any calendar app.
  await page.getByRole('button', { name: 'Crear mi enlace de calendario' }).click();
  const url = await page.getByLabel('Enlace personal de calendario').inputValue();
  expect(url).toMatch(/[?&]action=ics&token=[0-9a-f]{64}$/);
  const feed = await request.get(url);
  expect(feed.headers()['content-type']).toContain('text/calendar');
  const ics = unfold(await feed.text());
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('Junta de arranque F5');
  await expect(page.getByRole('link', { name: 'Agregar a Google Calendar' })).toHaveAttribute(
    'href',
    /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal/,
  );

  // Turned off, the same address gives an empty calendar.
  await page.getByRole('button', { name: 'Desactivar mi enlace' }).click();
  await expect(page.getByText('Listo: tu enlace anterior ya no funciona.')).toBeVisible();
  const off = unfold(await (await request.get(url)).text());
  expect(off).toContain('BEGIN:VCALENDAR');
  expect(off).not.toContain('Junta de arranque F5');
  await context.close();
});

test('a client sees a shared appointment but cannot change it; Google calendars only for who sees the whole', async ({
  browser,
}) => {
  const firmDevice = await device(browser);
  const firm = await firmDevice.newPage();
  await signIn(firm, 'abogado');
  await firm.goto('#/agenda');
  // A lawyer sees only their clients: the firm calendar (every client) is for the partners.
  await expect(firm.getByText(/lo ven los socios/)).toBeVisible();
  await expect(
    firm.getByRole('button', { name: 'Compartirlo con mi cuenta de Google' }),
  ).toHaveCount(0);
  await firm.getByRole('button', { name: 'Nueva cita' }).click();
  const form = firm.getByRole('dialog', { name: 'Nueva cita' });
  await form.getByLabel('Título').fill('Revisión con el cliente');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await firm.getByRole('button', { name: 'Nueva cita' }).click();
  await form.getByLabel('Título').fill('Preparación interna');
  await form.getByLabel('Interno').check();
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(firm.getByRole('link', { name: 'Preparación interna' })).toBeVisible();
  await syncNow(firm);
  await firmDevice.close();

  const phone = await device(browser, { mobile: true });
  const client = await phone.newPage();
  await signIn(client, 'adminA');
  await client.goto('#/agenda');
  await expect(client.getByRole('button', { name: 'Nueva cita' })).toHaveCount(0);
  await expect(client.getByRole('link', { name: 'Preparación interna' })).toHaveCount(0);
  await client.getByRole('link', { name: 'Revisión con el cliente' }).click();
  const view = client.getByRole('dialog', { name: 'Revisión con el cliente' });
  await expect(view.getByText('Reunión')).toBeVisible();
  await expect(view.getByRole('textbox')).toHaveCount(0);
  await view.getByRole('button', { name: 'Cerrar' }).last().click();
  await expect(view).toHaveCount(0);
  // The whole company: its Google calendar may be shared with them.
  await expect(
    client.getByRole('button', { name: 'Compartirlo con mi cuenta de Google' }),
  ).toBeVisible();
  await phone.close();

  const unitDevice = await device(browser, { mobile: true });
  const unit = await unitDevice.newPage();
  await signIn(unit, 'norte');
  await unit.goto('#/agenda');
  await expect(unit.getByText(/Ves solo algunas unidades/)).toBeVisible();
  await expect(
    unit.getByRole('button', { name: 'Compartirlo con mi cuenta de Google' }),
  ).toHaveCount(0);
  await expect(unit.getByRole('button', { name: 'Crear mi enlace de calendario' })).toBeVisible();
  await unitDevice.close();

  const partnerDevice = await device(browser);
  const partner = await partnerDevice.newPage();
  await signIn(partner, 'socia');
  await partner.goto('#/agenda');
  await partner.getByRole('button', { name: 'Compartirlo con mi cuenta de Google' }).click();
  await expect(
    partner.getByText('Listo: el calendario ya está compartido con tu cuenta.'),
  ).toBeVisible();
  await expect(partner.getByRole('link', { name: 'Abrir en Google Calendar' })).toHaveAttribute(
    'href',
    /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=/,
  );
  await partnerDevice.close();
});

test('the bell: a client request reaches its lawyer, who opens it from the notice', async ({
  browser,
}) => {
  const phone = await device(browser, { mobile: true });
  const desk = await device(browser);
  const client = await phone.newPage();
  const firm = await desk.newPage();
  await signIn(client, 'norte');
  await signIn(firm, 'abogado');
  await expect(firm.getByRole('link', { name: 'Avisos', exact: true })).toBeVisible();

  await client.goto('#/solicitudes');
  await client.getByRole('button', { name: 'Nueva solicitud' }).click();
  await client.getByLabel('¿Qué necesita?').fill('Revisar contrato de arrendamiento');
  await client.getByRole('button', { name: 'Enviar' }).click();
  await syncNow(client);

  await syncNow(firm);
  const bell = firm.getByRole('link', { name: '1 aviso sin leer' });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(firm.getByRole('heading', { level: 1, name: 'Avisos' })).toBeVisible();
  await firm
    .getByRole('button', { name: /Solicitud nueva: "Revisar contrato de arrendamiento"/ })
    .click();
  await expect(firm).toHaveURL(/#\/solicitudes\/[0-9a-f-]{36}$/);
  await expect(firm.getByRole('link', { name: 'Avisos', exact: true })).toBeVisible();

  // The daily summary: on unless turned off, and the choice stays.
  await firm.goto('#/avisos');
  const digest = firm.getByLabel('Recibir el resumen diario');
  await expect(digest).toBeChecked();
  await expect(digest).toBeEnabled();
  await digest.uncheck();
  await expect(digest).toBeEnabled();
  await syncNow(firm);
  await firm.reload();
  await expect(firm.getByLabel('Recibir el resumen diario')).not.toBeChecked();
  await phone.close();
  await desk.close();
});
