/**
 * "¿Qué va aquí?" in the browser (D79): the guide of a section leads to the
 * guide of another, and from there to its screen; the forms say what to
 * write with an example; Help answers "¿Dónde…?" for each side.
 */
import { device, expect, signIn, test } from './fixtures.ts';

test('the firm: from the guide of Asuntos to Tareas, and the forms with examples', async ({
  browser,
}) => {
  const context = await device(browser);
  const page = await context.newPage();
  await signIn(page, 'abogado');

  await page.goto('#/asuntos');
  await page.getByRole('button', { name: /¿Qué va aquí\?.*Asuntos/ }).click();
  const guide = page.getByRole('dialog', { name: 'Asuntos: qué va aquí' });
  await expect(guide.getByText('Fecha objetivo', { exact: true })).toBeVisible();

  await guide.getByRole('button', { name: /Es una sola acción con fecha.*va en Tareas/ }).click();
  const tasks = page.getByRole('dialog', { name: 'Tareas: qué va aquí' });
  await expect(tasks.getByText(/Empieza con un verbo/)).toBeVisible();
  await tasks.getByRole('link', { name: 'Ir a Tareas' }).click();
  await expect(page).toHaveURL(/#\/tareas$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tareas' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // The form says what to write, with an example.
  await page.getByRole('button', { name: 'Nueva tarea' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva tarea' });
  await expect(form.getByLabel('Título')).toHaveAccessibleDescription(
    /Enviar el borrador del acta/,
  );
  await expect(form.getByLabel('Le toca a')).toHaveAccessibleDescription(/sus pendientes/);
  await context.close();
});

test('a client: Help answers "¿Qué me toca hacer?" and leads to their to-dos', async ({
  browser,
}) => {
  const context = await device(browser, { mobile: true });
  const page = await context.newPage();
  await signIn(page, 'norte');

  await page.goto('#/ayuda');
  await expect(page.getByRole('heading', { name: '¿Dónde encuentro cada cosa?' })).toBeVisible();
  await page.getByRole('button', { name: /¿Qué me toca hacer\?.*va en Pendientes/ }).click();
  const guide = page.getByRole('dialog', { name: 'Pendientes: qué va aquí' });
  await expect(guide.getByText(/Marcar como listo/)).toBeVisible();
  // A client fills nothing in here: no field guide.
  await expect(guide.getByText('Qué poner en cada campo')).toHaveCount(0);
  await guide.getByRole('link', { name: 'Ir a Pendientes' }).click();
  await expect(page).toHaveURL(/#\/pendientes$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pendientes de su lado' }),
  ).toBeVisible();
  await context.close();
});
