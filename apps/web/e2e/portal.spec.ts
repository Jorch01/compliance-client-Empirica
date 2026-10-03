/**
 * Both sides of the portal in a real browser, against the real backend code
 * with fictitious data.
 */
import { device, expect, signIn, test } from './fixtures.ts';
import { everything, localRows } from './local.ts';

const TABLES = ['Asuntos', 'Tareas', 'Comentarios', 'Obligaciones', 'Solicitudes', 'Documentos'];
const INTERNAL = [
  'Análisis de contingencia',
  'Revisar criterio',
  'Reunir pruebas',
  'Criterio interno del despacho.',
  'Comentario compartido en asunto interno.',
];

test('a client never receives what is internal: not on screen, not on the device', async ({
  browser,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'adminA');
  for (const path of ['#/', '#/pendientes', '#/solicitudes', '#/equipo']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const text of INTERNAL) await expect(page.getByText(text)).toHaveCount(0);
  }
  const stored = await everything(page, TABLES);
  expect(stored).toContain('Entregar acta constitutiva');
  for (const text of INTERNAL) expect(stored).not.toContain(text);
  // Nor the columns kept from clients.
  const [cliente] = await localRows(page, 'Clientes');
  expect(cliente).toBeDefined();
  expect(cliente).not.toHaveProperty('driveFolderId');
  expect(cliente).not.toHaveProperty('modoIA');
  await context.close();
});

test('the firm sees its internal work on its own device', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  const stored = await everything(page, TABLES);
  for (const text of INTERNAL) expect(stored).toContain(text);
  await context.close();
});

test('the firm moves around: control center, clients, users, requests, help', async ({
  browser,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await expect(page.getByRole('heading', { level: 1, name: 'Hola, Socia' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();

  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('link', { name: 'Clientes' }).click();
  await page.getByRole('button', { name: /Cliente Demo/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cliente Demo' })).toBeVisible();
  await expect(page.getByText('Sucursal Norte 1', { exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Usuarios' }).click();
  await expect(page.getByRole('heading', { name: 'Equipo del despacho' })).toBeVisible();
  await expect(page.getByText('norte@cliente-a.example')).toBeVisible();

  await nav.getByRole('link', { name: 'Solicitudes' }).click();
  await expect(page.getByText('Revisar contrato de proveedor')).toBeVisible();

  await nav.getByRole('link', { name: 'Ayuda' }).click();
  await expect(page.getByRole('heading', { name: 'Instalar el portal' })).toBeVisible();
  await context.close();
});

test('a unit user sees their unit, and only it', async ({ browser }) => {
  const context = await device(browser, { mobile: true });
  const page = await context.newPage();
  await signIn(page, 'norte');
  await page.goto('#/pendientes');
  await expect(page.getByText('Entregar acta constitutiva')).toBeVisible();
  // Assigned to her in another unit: she sees it too.
  await expect(page.getByText('Firmar contrato')).toBeVisible();
  const unidades = (await localRows(page, 'Entidades')).map((e) => e.nombre);
  expect(unidades.sort()).toEqual(['Sucursal Norte 1', 'Unidad Norte']);
  await context.close();
});

test('the tour shows the first time, can be skipped, and comes back from Help', async ({
  browser,
}) => {
  const context = await device(browser, { tour: true, mobile: true });
  const page = await context.newPage();
  await page.goto('./');
  await page.getByRole('button', { name: /norte@cliente-a\.example/ }).click();
  const tour = page.getByRole('dialog', { name: 'Bienvenido a su portal' });
  await expect(tour).toBeVisible({ timeout: 20_000 });
  await tour.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('dialog', { name: 'Menú' })).toBeVisible();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: /Al día/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Bienvenido a su portal' })).toHaveCount(0);

  await page.goto('#/ayuda');
  await page.getByRole('button', { name: 'Ver el recorrido' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Bienvenido a su portal' })).toBeVisible();
  await context.close();
});

test('an invitation: the firm shares the link, the person signs in and sees their unit', async ({
  browser,
}) => {
  const firm = await device(browser);
  const socia = await firm.newPage();
  await signIn(socia, 'socia');
  await socia.goto('#/usuarios');
  await socia.getByRole('button', { name: 'Invitar' }).click();
  const form = socia.getByRole('dialog', { name: 'Invitar a una persona' });
  await form.getByLabel('Nombre').fill('Persona Nueva Demo');
  await form.getByLabel('Correo electrónico').fill('nueva@cliente-a.example');
  await form.getByLabel('Solo estas unidades').check();
  await form.getByLabel('Unidad Norte').check();
  await form.getByRole('button', { name: 'Crear invitación' }).click();
  const link = await form.getByLabel('Enlace de la invitación').inputValue();
  expect(link).toMatch(/#\/invitacion\/[0-9a-f]{64}$/);
  await firm.close();

  const invited = await device(browser, { mobile: true });
  const page = await invited.newPage();
  await page.goto(link.replace(/^https?:\/\/[^/]+\//, './'));
  await page
    .getByLabel('O entra con otro correo (para probar invitaciones):')
    .fill('nueva@cliente-a.example');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¡Listo! Ya tienes acceso.' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Ir al portal' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cliente Demo' })).toBeVisible({
    timeout: 20_000,
  });
  const unidades = (await localRows(page, 'Entidades')).map((e) => e.nombre);
  expect(unidades.sort()).toEqual(['Sucursal Norte 1', 'Unidad Norte']);
  await invited.close();
});
