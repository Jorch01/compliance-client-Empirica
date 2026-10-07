/**
 * WCAG 2.2 AA, checked by axe on every screen of both sides, each in the
 * light and the dark theme (F7), with targets of at least 24 px (axe's
 * target-size). Contrast of every token pair is also checked in the unit
 * tests (packages/shared/src/brand/tokens.test.ts). Forms and dialogs open:
 * a11y-dialogs.spec.ts; keyboard and 320 px: keyboard.spec.ts.
 */
import { audit } from './axe.ts';
import { device, expect, signIn, test, type DemoUser } from './fixtures.ts';

for (const dark of [false, true]) {
  test(`the sign-in screen${dark ? ' (dark)' : ''}`, async ({ browser }) => {
    const context = await device(browser);
    const page = await context.newPage();
    if (dark) await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, `login${dark ? ' dark' : ''}`);
    await context.close();
  });
}

/** Fictitious ids (packages/shared/src/testing/fixtures.ts). */
const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const MATTER = id(0x402);
const TASK = id(0x501);
const OBLIGATION = id(0x701);
const CONFLICT = id(0xe01);
const APPOINTMENT = id(0xf03);
const CLIENT_A = id(0x1a);

/** Every screen, as each role sees it; each one in both themes (F7). */
const SCREENS: { user: DemoUser; paths: string[]; mobile?: boolean }[] = [
  {
    user: 'socia',
    paths: ['#/', '#/clientes', '#/usuarios', '#/solicitudes', '#/sugerencias', '#/ayuda'],
  },
  {
    user: 'socia',
    paths: [
      '#/asuntos',
      `#/asuntos/${MATTER}`,
      '#/tareas',
      `#/tareas/${TASK}`,
      '#/documentos',
      '#/conflictos',
      `#/conflictos/${CONFLICT}`,
    ],
  },
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
      `#/tramites/${id(0xf01)}`,
      `#/compliance/${OBLIGATION}`,
      `#/contratos/${id(0xf02)}`,
      `#/solicitudes/${id(0x901)}`,
    ],
  },
  // F5 and F6: the agenda, the bell, the monthly reports and a draft with its preview.
  {
    user: 'abogado',
    paths: [
      '#/agenda',
      `#/agenda/${APPOINTMENT}`,
      '#/avisos',
      '#/reportes',
      `#/reportes/${CLIENT_A}/2026-09`,
    ],
  },
  { user: 'socia', paths: ['#/reportes', `#/reportes/${CLIENT_A}/2026-08`, '#/no-existe'] },
  {
    user: 'adminA',
    paths: ['#/', '#/pendientes', '#/equipo', '#/usuarios', '#/agenda', '#/reportes'],
    mobile: true,
  },
  {
    user: 'adminA',
    paths: [
      '#/tramites',
      '#/compliance',
      `#/compliance/${OBLIGATION}`,
      '#/contratos',
      `#/tareas/${TASK}`,
      `#/reportes/${CLIENT_A}/2026-08`,
    ],
    mobile: true,
  },
  {
    user: 'norte',
    paths: [
      '#/',
      '#/pendientes',
      '#/solicitudes',
      '#/sugerencias',
      '#/asuntos',
      `#/asuntos/${MATTER}`,
      '#/documentos',
      '#/agenda',
      '#/avisos',
    ],
    mobile: true,
  },
];

for (const { user, paths, mobile } of SCREENS) {
  for (const dark of [false, true]) {
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
        await audit(page, `${user} ${path}${dark ? ' dark' : ''}`);
      }
      await context.close();
    });
  }
}
