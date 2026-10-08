/**
 * WCAG 2.2 AA with the forms and dialogs open (F7): each one opened from
 * its screen, checked by axe in both themes, and closed with Esc. The
 * screens themselves: a11y.spec.ts.
 */
import type { Page } from '@playwright/test';
import { audit } from './axe.ts';
import { device, expect, signIn, test, type DemoUser } from './fixtures.ts';

const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

interface Opened {
  path: string;
  /** The button that opens it (the first one with that name). */
  open: string | RegExp;
  /** A menu or panel rather than a dialog. */
  popover?: boolean;
}

const OPENED: { user: DemoUser; mobile?: boolean; items: Opened[] }[] = [
  {
    user: 'socia',
    items: [
      { path: '#/clientes', open: 'Nuevo cliente' },
      { path: '#/usuarios', open: /^Invitar$/ },
      { path: '#/asuntos', open: 'Nuevo asunto' },
      { path: '#/tramites', open: 'Nuevo trámite' },
      { path: '#/compliance', open: 'Nueva obligación' },
      { path: '#/compliance', open: /¿Cómo se lee\?/ },
      { path: '#/contratos', open: 'Nuevo contrato' },
      { path: '#/', open: 'Tu cuenta', popover: true },
      { path: '#/', open: /Al día/, popover: true },
    ],
  },
  {
    user: 'abogado',
    items: [
      { path: `#/asuntos/${id(0x402)}`, open: 'Nueva tarea' },
      { path: `#/tareas/${id(0x501)}`, open: 'Subir documento' },
      { path: '#/agenda', open: 'Nueva cita' },
      { path: '#/', open: 'Sugerencias o errores' },
      { path: '#/asuntos', open: 'Crear con IA' },
      { path: `#/asuntos/${id(0x402)}`, open: 'Sugerir tareas con IA' },
    ],
  },
  {
    user: 'adminA',
    mobile: true,
    items: [
      { path: '#/solicitudes', open: 'Nueva solicitud' },
      { path: `#/compliance/${id(0x701)}`, open: 'Enviar evidencia' },
    ],
  },
];

async function openAndAudit(page: Page, item: Opened, label: string): Promise<void> {
  await page.goto(item.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: item.open }).first().click();
  if (item.popover) {
    await expect(page.getByRole('button', { name: item.open }).first()).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  } else {
    await expect(page.getByRole('dialog')).toBeVisible();
  }
  await audit(page, label);
  await page.keyboard.press('Escape');
  if (!item.popover) await expect(page.getByRole('dialog')).toBeHidden();
}

for (const { user, mobile, items } of OPENED) {
  for (const dark of [false, true]) {
    test(`${user}${dark ? ' (dark)' : ''}${mobile ? ' (phone)' : ''} with forms open`, async ({
      browser,
    }) => {
      const context = await device(browser, { mobile: mobile ?? false });
      const page = await context.newPage();
      if (dark) await page.emulateMedia({ colorScheme: 'dark' });
      await signIn(page, user);
      for (const item of items) {
        const label = `${user} ${item.path} «${String(item.open)}»${dark ? ' dark' : ''}`;
        await test.step(label, () => openAndAudit(page, item, label));
      }
      await context.close();
    });
  }
}
