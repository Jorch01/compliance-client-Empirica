/**
 * F7: the portal with the keyboard alone, and on a 320 px wide screen
 * without scrolling sideways (WCAG 2.2: 2.1.1 keyboard, 2.4.1 bypass
 * blocks, 2.4.3 focus order, 1.4.10 reflow).
 */
import type { Page } from '@playwright/test';
import { device, expect, signIn, test, type DemoUser } from './fixtures.ts';

const id = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/** Presses Tab until the focus reaches what `name` names (at most `max` times). */
async function tabTo(page: Page, name: RegExp, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return '';
      const label = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : '';
      return `${el.getAttribute('aria-label') ?? ''} ${label ?? ''} ${el.textContent}`;
    });
    if (name.test(focused)) return;
  }
  throw new Error(`Tab never reached ${String(name)}`);
}

test('the skip link takes the keyboard straight past the menu', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.goto('#/asuntos');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Asuntos' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();
});

test('a new screen takes the focus to its content, not to the menu link', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.getByRole('link', { name: 'Asuntos', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Asuntos' })).toBeVisible();
  await expect(page.locator('#contenido')).toBeFocused();
});

test('a dialog keeps the focus inside, closes with Esc and gives it back', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'socia');
  await page.goto('#/asuntos');
  const opener = page.getByRole('button', { name: 'Nuevo asunto' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 15; i++) {
    // Never on the page behind it: inside the dialog, or nowhere (the browser's own bar).
    const outside = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el && el !== document.body && !el.closest('dialog[open]');
    });
    expect(outside).toBe(false);
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('a client sends a request with the keyboard alone', async ({ browser }) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'adminA');
  await page.goto('#/solicitudes');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await tabTo(page, /Nueva solicitud/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await tabTo(page, /¿Qué necesita\?/);
  await page.keyboard.type('Revisar el reglamento interior de trabajo');
  await tabTo(page, /^\s*Enviar\s*$/);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Revisar el reglamento interior de trabajo' }),
  ).toBeVisible();
});

/** Every screen at 320 px: nothing makes the page scroll sideways (tables scroll inside). */
const NARROW: { user: DemoUser; paths: string[] }[] = [
  {
    user: 'socia',
    paths: [
      '#/',
      '#/clientes',
      '#/usuarios',
      '#/asuntos',
      `#/asuntos/${id(0x402)}`,
      '#/tareas',
      `#/tareas/${id(0x501)}`,
      '#/tramites',
      `#/tramites/${id(0xf01)}`,
      '#/tramites/plantillas',
      '#/compliance',
      `#/compliance/${id(0x701)}`,
      '#/compliance/catalogo',
      '#/compliance/inhabiles',
      '#/contratos',
      `#/contratos/${id(0xf02)}`,
      '#/documentos',
      '#/conflictos',
      '#/solicitudes',
      `#/solicitudes/${id(0x901)}`,
      '#/reportes',
      `#/reportes/${id(0x1a)}/2026-09`,
      '#/agenda',
      '#/avisos',
      '#/sugerencias',
      '#/ayuda',
    ],
  },
  {
    user: 'adminA',
    paths: ['#/', '#/pendientes', '#/equipo', '#/compliance', '#/reportes', '#/agenda'],
  },
];

for (const { user, paths } of NARROW) {
  test(`${user} at 320 px: no screen scrolls sideways`, async ({ browser }) => {
    const context = await device(browser, { mobile: true, width: 320 });
    const page = await context.newPage();
    await signIn(page, user);
    const wide: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) wide.push(`${path} (+${String(overflow)} px)`);
    }
    expect(wide).toEqual([]);
  });
}
