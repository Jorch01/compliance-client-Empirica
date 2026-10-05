/**
 * WCAG 2.2 AA, checked by axe on the main screens of both sides, in light
 * and dark themes. Contrast of every token pair is also checked in the unit
 * tests (packages/shared/src/brand/tokens.test.ts).
 */
import { audit } from './axe.ts';
import { device, expect, signIn, test, type DemoUser } from './fixtures.ts';

test('the sign-in screen', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await audit(page, 'login');
  await context.close();
});

const SCREENS: { user: DemoUser; paths: string[]; dark?: boolean; mobile?: boolean }[] = [
  {
    user: 'socia',
    paths: ['#/', '#/clientes', '#/usuarios', '#/solicitudes', '#/sugerencias', '#/ayuda'],
  },
  {
    user: 'socia',
    paths: ['#/asuntos', '#/tareas', '#/documentos', '#/conflictos'],
    dark: true,
  },
  { user: 'socia', paths: ['#/'], dark: true },
  {
    user: 'socia',
    paths: [
      '#/tramites',
      '#/tramites/plantillas',
      '#/compliance',
      '#/compliance/catalogo',
      '#/compliance/inhabiles',
      '#/contratos',
    ],
  },
  {
    user: 'abogado',
    paths: [
      '#/tramites/00000000-0000-4000-8000-000000000f01',
      '#/compliance/00000000-0000-4000-8000-000000000701',
      '#/contratos/00000000-0000-4000-8000-000000000f02',
      '#/solicitudes/00000000-0000-4000-8000-000000000901',
    ],
    dark: true,
  },
  {
    user: 'adminA',
    paths: [
      '#/tramites',
      '#/compliance',
      '#/contratos',
      '#/compliance/00000000-0000-4000-8000-000000000701',
    ],
    dark: true,
    mobile: true,
  },
  { user: 'adminA', paths: ['#/', '#/pendientes', '#/equipo', '#/agenda'], mobile: true },
  { user: 'abogado', paths: ['#/agenda', '#/avisos'] },
  // F6: the monthly reports, the draft with its preview, and the client's list.
  {
    user: 'abogado',
    paths: ['#/reportes', '#/reportes/00000000-0000-4000-8000-00000000001a/2026-09'],
  },
  {
    user: 'socia',
    paths: ['#/reportes', '#/reportes/00000000-0000-4000-8000-00000000001a/2026-08'],
    dark: true,
  },
  {
    user: 'adminA',
    paths: ['#/reportes', '#/reportes/00000000-0000-4000-8000-00000000001a/2026-08'],
    mobile: true,
  },
  { user: 'socia', paths: ['#/agenda', '#/avisos'], dark: true },
  {
    user: 'norte',
    paths: [
      '#/',
      '#/pendientes',
      '#/solicitudes',
      '#/sugerencias',
      '#/asuntos',
      '#/documentos',
      '#/agenda',
      '#/avisos',
    ],
    dark: true,
    mobile: true,
  },
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
