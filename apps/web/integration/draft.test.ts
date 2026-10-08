/**
 * "Crear con IA" from end to end, without a browser (F8): the lawyer's
 * proposal, created on the device as the preview does it, reaches the
 * server in order, linked, internal and marked CREAR_IA; the client sees
 * only what the lawyer shared.
 */
import { parseStages, type AiDraftData } from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { createWorld, type World } from '../../api/src/testing/harness.ts';
import { createDraft } from '../src/pages/common/draft.ts';
import { TestBrowser } from './device.ts';

const A = ID.clienteA;

function proposal(w: World, peticion: string): AiDraftData {
  const res = w.call<AiDraftData>('ai.draft', { clienteId: A, peticion }, { as: ID.abogado });
  if (!res.ok) throw new Error(`${res.error.code} ${res.error.message}`);
  return res.data;
}

describe('Crear con IA (F8)', () => {
  it('created on the device, the proposal reaches the server in order, linked, internal and as the AI’s', async () => {
    const w = createWorld();
    const lawyer = new TestBrowser(w, ID.abogado);
    await lawyer.sync();
    const { items } = proposal(w, 'Abre un asunto con dos tareas y una reunión');
    const records = await createDraft(lawyer.engine, items, {
      templates: new Map(),
      today: '2026-10-02',
    });
    const [matter, ask, review, meeting] = records.map((r) => r.id);
    // Local first: on the device at once, before the server hears of it.
    expect(await lawyer.get('Asuntos', matter ?? '')).toMatchObject({
      titulo: 'Revisión de contrato (demostración)',
      visibilidad: 'INTERNO',
    });

    await lawyer.sync();
    expect(lawyer.engine.getStatus()).toMatchObject({ pending: 0, error: null });
    expect(w.row('Tareas', ask ?? '')).toMatchObject({
      asuntoId: matter,
      ladoResponsable: 'CLIENTE',
      visibilidad: 'INTERNO',
      createdBy: ID.abogado,
    });
    expect(w.row('Tareas', review ?? '')).toMatchObject({ asuntoId: matter, dependeDe: ask });
    expect(w.row('Eventos', meeting ?? '')).toMatchObject({
      origen: { tipo: 'Asuntos', id: matter },
      tipo: 'REUNION',
    });
    // Each is born CREAR_IA (the matter then gets the server's own count of its tasks).
    for (const r of records) {
      const log = w
        .rows('Bitacora')
        .filter((b) => b.entidadId === r.id)
        .map((b) => b.accion);
      expect(log[0]).toBe('CREAR_IA');
      expect(log).not.toContain('CREAR');
    }
    // The client receives none of it: everything was born internal.
    const client = new TestBrowser(w, ID.cAdmin);
    await client.sync();
    for (const r of records) expect(await client.get(r.table, r.id)).toBeUndefined();
  });

  it('what the lawyer shares reaches the client; a filing starts in its template’s first stage', async () => {
    const w = createWorld();
    w.google.gemini.reply = () => ({
      explicacion: 'Un trámite con su plantilla y una tarea para el cliente.',
      elementos: [
        { tipo: 'TRAMITE', clave: 'E1', titulo: 'Licencia nueva', plantilla: '[PLANTILLA_1]' },
        {
          tipo: 'TAREA',
          clave: 'E2',
          titulo: 'Enviar comprobante de domicilio',
          deQuien: 'CLIENTE',
        },
      ],
    });
    const lawyer = new TestBrowser(w, ID.abogado);
    await lawyer.sync();
    const { items } = proposal(w, 'Un trámite de licencia y lo que el cliente debe mandar');
    // In the preview, the lawyer shares the task with the client.
    const reviewed = items.map((i) =>
      i.table === 'Tareas' ? { ...i, fields: { ...i.fields, visibilidad: 'COMPARTIDO' } } : i,
    );
    const template = await lawyer.get('PlantillasTramite', ID.plantilla);
    if (!template) throw new Error('the template is not on the device');
    const records = await createDraft(lawyer.engine, reviewed, {
      templates: new Map([[ID.plantilla, { row: template, stages: parseStages(template.etapas) }]]),
      today: '2026-10-02',
    });
    // Tasks are created before filings (DRAFT_TABLES).
    const filing = records.find((r) => r.table === 'Tramites');
    const task = records.find((r) => r.table === 'Tareas');
    await lawyer.sync();
    expect(w.row('Tramites', filing?.id ?? '')).toMatchObject({
      plantillaId: ID.plantilla,
      autoridad: 'Autoridad municipal (ficticia)',
      etapaActual: 'Integración del expediente',
      historialEtapas: [{ etapa: 'Integración del expediente', fecha: '2026-10-02' }],
      visibilidad: 'INTERNO',
    });
    const client = new TestBrowser(w, ID.cAdmin);
    await client.sync();
    expect(await client.get('Tareas', task?.id ?? '')).toMatchObject({
      titulo: 'Enviar comprobante de domicilio',
      visibilidad: 'COMPARTIDO',
    });
    expect(await client.get('Tramites', filing?.id ?? '')).toBeUndefined();
  });
});
