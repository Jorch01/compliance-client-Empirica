/**
 * Phase 4 in the browser: the compliance matrix and its periods (evidence
 * from the client, validation by the firm), the filings pipeline with its
 * stages, and requests classified against the retainer and turned into a
 * matter. Every name and date is fictitious.
 */
import { audit } from './axe.ts';
import { device, expect, signIn, syncNow, test } from './fixtures.ts';
import { localRows } from './local.ts';

/** Fixture ids (packages/shared/src/testing/fixtures.ts). */
const OB_NORTE = '00000000-0000-4000-8000-000000000701';
const OB_INTERNA = '00000000-0000-4000-8000-000000000702';
const PDF = {
  name: 'acuse-octubre.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 acuse ficticio'),
};

test('evidence: the firm validates, the period moves on, the client sends the next one', async ({
  browser,
}) => {
  const desk = await device(browser);
  const firm = await desk.newPage();
  await signIn(firm, 'abogado');

  // The matrix, with its "¿Cómo se lee?".
  await firm.goto('#/compliance');
  const matrix = firm.getByRole('table', { name: /Matriz de cumplimiento/ });
  await expect(matrix.getByRole('rowheader', { name: 'Licencias y regulatorio' })).toBeVisible();
  await firm.getByRole('button', { name: /¿Cómo se lee\?.*matriz de cumplimiento/i }).click();
  await expect(firm.getByRole('dialog', { name: 'La matriz de cumplimiento' })).toBeVisible();
  await firm.keyboard.press('Escape');

  // The period under review is validated: the next one is due now.
  await firm.goto(`#/compliance/${OB_NORTE}`);
  await expect(firm.getByText('Periodo del 12 sep 2026')).toBeVisible();
  await firm.getByRole('button', { name: 'Validar' }).click();
  await expect(firm.getByText('Periodo del 12 oct 2026')).toBeVisible();
  const history = firm.getByRole('region', { name: 'Periodo del 12 sep 2026' });
  await expect(history.getByText('Validada')).toBeVisible();
  await expect(history.getByText('Revisó Abogado Demo')).toBeVisible();
  await audit(firm, 'obligation detail');
  await syncNow(firm);
  // The server moved the next due date too, and the device has it.
  const obligations = await localRows(firm, 'Obligaciones');
  expect(obligations.find((o) => o.id === OB_NORTE)?.proximoVencimiento).toBe('2026-10-12');

  // The client sends the October evidence from the phone.
  const phone = await device(browser, { mobile: true });
  const client = await phone.newPage();
  await signIn(client, 'adminA');
  await client.goto(`#/compliance/${OB_NORTE}`);
  await expect(client.getByText('Periodo del 12 oct 2026')).toBeVisible();
  await client.getByRole('button', { name: 'Enviar evidencia' }).click();
  const dialog = client.getByRole('dialog', { name: /Evidencia del periodo del 12 oct 2026/ });
  await expect(dialog.getByText('Acuse (ejemplo)')).toBeVisible();
  await dialog.getByLabel('Archivo').setInputFiles(PDF);
  await dialog.getByLabel('Notas').fill('Enviado en ventanilla');
  await audit(client, 'evidence dialog');
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(client.getByText('En revisión').first()).toBeVisible();
  await expect(client.getByRole('button', { name: /Descargar: acuse-octubre\.pdf/ })).toBeVisible({
    timeout: 20_000,
  });
  // A client never validates.
  await expect(client.getByRole('button', { name: 'Validar' })).toHaveCount(0);
  await syncNow(client);

  // The firm sees it in review and turns it down with a reason.
  await syncNow(firm);
  await firm.reload();
  await expect(firm.getByText('Enviado en ventanilla')).toBeVisible();
  await firm.getByRole('button', { name: 'Rechazar' }).click();
  const reject = firm.getByRole('dialog', { name: 'Rechazar la evidencia' });
  await reject.getByLabel('Motivo').fill('El acuse no es legible');
  await reject.getByRole('button', { name: 'Rechazar' }).click();
  await expect(firm.getByText('Rechazada')).toBeVisible();
  await syncNow(firm);
  await syncNow(client);
  await client.reload();
  await expect(client.getByText('El acuse no es legible')).toBeVisible();

  // What is internal stays with the firm.
  await client.goto(`#/compliance/${OB_INTERNA}`);
  await expect(client.getByText(/No encontramos esta obligación/)).toBeVisible();
  await client.goto('#/compliance');
  await expect(client.getByRole('rowheader', { name: 'Fiscal' })).toHaveCount(0);
  await audit(client, 'client compliance');
});

test('a filing from a template moves through its stages; the client follows it', async ({
  browser,
}) => {
  const desk = await device(browser);
  const firm = await desk.newPage();
  await signIn(firm, 'socia');

  await firm.goto('#/tramites');
  await firm.getByRole('button', { name: 'Nuevo trámite' }).click();
  const form = firm.getByRole('dialog', { name: 'Nuevo trámite' });
  await form.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente Demo' });
  await form.getByLabel('Título').fill('Permiso de anuncio');
  await form
    .getByLabel(/Plantilla/)
    .selectOption({ label: 'BORRADOR: validar · Licencia (ficticia)' });
  await expect(form.getByLabel(/Autoridad/)).toHaveValue('Autoridad municipal (ficticia)');
  await audit(firm, 'filing form');
  await form.getByRole('button', { name: 'Guardar' }).click();

  await expect(firm.getByRole('heading', { level: 1, name: 'Permiso de anuncio' })).toBeVisible();
  const stages = firm.getByRole('list').filter({ hasText: 'Integración del expediente' });
  await expect(stages.getByText('Actual')).toBeVisible();
  await firm.getByRole('button', { name: 'Pasar a «Presentación»' }).click();
  await expect(
    firm.getByRole('listitem').filter({ hasText: 'Presentación' }).getByText('Actual'),
  ).toBeVisible();
  await firm.getByLabel('Cambiar estado').selectOption('EN_TRAMITE');
  await audit(firm, 'filing detail');

  // On the board, in its column.
  await firm.goto('#/tramites');
  const filed = firm.getByRole('region', { name: /En trámite/ });
  await expect(filed.getByRole('link', { name: 'Permiso de anuncio' })).toBeVisible();
  await syncNow(firm);

  const phone = await device(browser, { mobile: true });
  const client = await phone.newPage();
  await signIn(client, 'adminA');
  await client.goto('#/tramites');
  await expect(client.getByRole('link', { name: 'Plantillas' })).toHaveCount(0);
  await client.getByRole('link', { name: 'Permiso de anuncio' }).click();
  await expect(client.getByText('Presentación').first()).toBeVisible();
  await expect(client.getByRole('button', { name: /Pasar a/ })).toHaveCount(0);
});

test('a request is classified against the retainer and becomes a matter; a contract has its key dates', async ({
  browser,
}) => {
  const desk = await device(browser);
  const firm = await desk.newPage();
  await signIn(firm, 'socia');

  await firm.goto('#/solicitudes');
  await firm.getByRole('link', { name: 'Revisar contrato de proveedor' }).click();
  await expect(firm.getByText('Contratos con proveedores (ejemplo)')).toBeVisible();
  await firm.getByRole('button', { name: 'Dentro de la iguala' }).click();
  await expect(firm.getByText('Entra en la iguala.')).toBeVisible();
  await firm.getByRole('button', { name: 'Convertir en asunto' }).click();
  const matter = firm.getByRole('dialog', { name: 'Nuevo asunto' });
  await expect(matter.getByLabel('Título')).toHaveValue('Revisar contrato de proveedor');
  await matter.getByLabel('Área').selectOption('CONTRATOS');
  await matter.getByRole('button', { name: 'Guardar' }).click();
  // The matter takes the request's title: the address tells which page this is.
  await expect(firm).toHaveURL(/#\/asuntos\//);
  await expect(
    firm.getByRole('heading', { level: 1, name: 'Revisar contrato de proveedor' }),
  ).toBeVisible();
  await firm.goBack();
  await expect(firm.getByText('Se convirtió en el asunto')).toBeVisible();

  await firm.goto('#/contratos');
  await firm.getByRole('button', { name: 'Nuevo contrato' }).click();
  const form = firm.getByRole('dialog', { name: 'Nuevo contrato' });
  await form.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Cliente Demo' });
  await form.getByLabel('Contraparte').fill('Distribuidora Ficticia');
  await form.getByLabel(/Vigente hasta/).fill('2027-01-31');
  await form.getByLabel(/Días de aviso previo/).fill('30');
  await form.getByLabel('Renovación automática').check();
  await audit(firm, 'contract form');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(
    firm.getByText('Se renueva solo el 31 ene 2027 si nadie avisa a más tardar el 1 ene 2027.'),
  ).toBeVisible();
  await audit(firm, 'contract detail');
});
