/**
 * What each AI helper sends to Gemini (IA.md, METADATA_ONLY): structured
 * data only (dates, states, areas, counts, the traffic light) and markers in
 * place of every name, built by the Masker. Descriptions, comments and
 * documents never go. The instructions forbid inventing facts, dates,
 * deadlines or legal grounds, and talking about hours.
 */
import type { AgendaItem, ReportModel } from '@empirica/shared';
import type { Masker } from './mask.ts';

export type Lang = 'es' | 'en';

/** Markers by the kind of record, so the AI can tell a matter from a task. */
export const KIND_OF_TABLE: Record<AgendaItem['table'], string> = {
  Tareas: 'TAREA',
  Obligaciones: 'OBLIGACION',
  Tramites: 'TRAMITE',
  Contratos: 'CONTRATO',
  Eventos: 'EVENTO',
};

const RULES = {
  es: [
    'Usa solo los datos del JSON. No inventes hechos, fechas, plazos, montos ni fundamentos legales.',
    'Los nombres vienen como marcadores entre corchetes, por ejemplo [ASUNTO_1] o [TAREA_2]: cuando nombres algo, escribe el marcador tal cual, sin cambiarlo.',
    'No hables de horas de trabajo.',
  ],
  en: [
    'Use only the data in the JSON. Do not invent facts, dates, deadlines, amounts or legal grounds.',
    'Names come as markers in brackets, for example [ASUNTO_1] or [TAREA_2]: when you name something, write the marker exactly as it is.',
    'Do not talk about hours of work.',
  ],
} as const;

const STRING = { type: 'STRING' };

/** The month's report, masked: the executive summary's input. */
export function summaryInput(report: ReportModel, clientName: string, m: Masker) {
  const matter = new Map(report.asuntos.map((a) => [a.id, a.titulo]));
  const asunto = (id: string | null): string | null =>
    id ? m.mask('ASUNTO', matter.get(id) ?? null) : null;
  return {
    periodo: report.periodo,
    desde: report.from,
    hasta: report.to,
    fechaDeCorte: report.today,
    cliente: m.mask('CLIENTE', clientName),
    salud: {
      puntaje: report.health.score,
      nivel: report.health.band,
      factores: report.health.parts
        .filter((p) => p.count > 0)
        .map((p) => ({ factor: p.factor, cuantos: p.count })),
    },
    conteos: report.counts,
    asuntos: report.asuntos.map((a) => ({
      ref: m.mask('ASUNTO', a.titulo),
      area: a.area,
      estado: a.estado,
      avance: a.avance,
      concluidoEnElMes: a.concluido,
    })),
    tareasCerradas: report.tareasCerradas.map((t) => ({
      ref: m.mask('TAREA', t.titulo),
      asunto: asunto(t.asuntoId),
      fecha: t.fecha,
    })),
    tareasPendientes: report.tareasPendientes.map((t) => ({
      ref: m.mask('TAREA', t.titulo),
      asunto: asunto(t.asuntoId),
      fechaLimite: t.fecha,
      semaforo: t.light,
      deQuienEs: t.lado,
      fatal: t.fatal,
    })),
    pendientesNoListadas: report.pendientesOmitidas,
    cumplimiento: report.cumplimiento.map((c) => ({
      categoria: c.categoria,
      periodos: c.periodos.map((p) => ({
        ref: m.mask('OBLIGACION', p.nombre),
        vence: p.vence,
        estado: p.estado,
        deUnMesAnterior: p.atrasado,
      })),
    })),
    tramites: report.tramites.map((f) => ({
      ref: m.mask('TRAMITE', f.titulo),
      autoridad: m.mask('AUTORIDAD', f.autoridad),
      etapa: m.mask('ETAPA', f.etapa),
      enLaEtapaDesde: f.desde,
      proximaFecha: f.proxima,
      estado: f.estado,
    })),
    contratos: report.contratos.map((c) => ({
      ref: m.mask('CONTRAPARTE', c.contraparte),
      tipo: m.mask('TIPO', c.tipo),
      fecha: c.fecha,
      clase: c.kind,
    })),
    loQueViene: report.proximos.map((i) => ({
      ref: m.mask(KIND_OF_TABLE[i.table], i.titulo),
      fecha: i.date,
      tipo: i.tipo,
      detalle: i.detalle,
      fatal: i.fatal,
    })),
    solicitudesDelMes: report.solicitudes.map((s) => ({
      ref: m.mask('SOLICITUD', s.titulo),
      estado: s.estado,
      fecha: s.fecha,
    })),
  };
}

export function summaryPrompt(input: unknown, lang: Lang) {
  const system =
    lang === 'es'
      ? [
          'Eres asistente de Empírica Legal Lab, un despacho de abogados en México.',
          'Escribe en español de México el resumen ejecutivo del reporte mensual que el despacho enviará al cliente, a partir de los datos en JSON.',
          ...RULES.es,
          'Dos o tres párrafos breves, máximo 180 palabras: primero lo que se avanzó en el mes; después lo que requiere atención (lo vencido y lo que el cliente tiene pendiente); al final lo que viene. Tono profesional, claro y cordial, dirigido al cliente en segunda persona del plural (ustedes).',
        ]
      : [
          'You assist Empírica Legal Lab, a law firm in Mexico.',
          'Write in English the executive summary of the monthly report the firm will send to the client, from the data in the JSON.',
          ...RULES.en,
          'Two or three short paragraphs, 180 words at most: first what moved forward in the month; then what needs attention (what is overdue and what the client has pending); last what is coming. Professional, clear and warm, addressed to the client as "you".',
        ];
  return {
    system: system.join('\n'),
    prompt: JSON.stringify(input),
    schema: { type: 'OBJECT', properties: { resumen: STRING }, required: ['resumen'] },
    maxTokens: 900,
  };
}

export function askPrompt(input: unknown, question: string, lang: Lang, today: string) {
  const system =
    lang === 'es'
      ? [
          'Eres asistente del portal de Empírica Legal Lab, un despacho de abogados.',
          `Responde la pregunta con los datos en JSON: es lo que esta persona puede ver en el portal hoy, ${today}. Si los datos no alcanzan para responder, dilo.`,
          ...RULES.es,
          'Responde en español, en máximo 120 palabras. En "referencias" pon los marcadores de los registros que menciones.',
        ]
      : [
          'You assist the portal of Empírica Legal Lab, a law firm.',
          `Answer the question with the data in the JSON: it is what this person can see in the portal today, ${today}. If the data is not enough to answer, say so.`,
          ...RULES.en,
          'Answer in English, in 120 words at most. In "referencias" put the markers of the records you mention.',
        ];
  return {
    system: system.join('\n'),
    prompt: JSON.stringify({ pregunta: question, datos: input }),
    schema: {
      type: 'OBJECT',
      properties: { respuesta: STRING, referencias: { type: 'ARRAY', items: STRING } },
      required: ['respuesta'],
    },
    maxTokens: 700,
  };
}

export function reminderPrompt(input: unknown, lang: Lang) {
  const system =
    lang === 'es'
      ? [
          'Eres asistente de Empírica Legal Lab, un despacho de abogados.',
          'Redacta un recordatorio breve y cordial para que el cliente complete lo que tiene pendiente en la tarea descrita en el JSON.',
          ...RULES.es,
          'No menciones consecuencias legales. Empieza con "Hola" y no uses nombres de personas. Máximo 80 palabras, en español de México, de usted o de ustedes.',
        ]
      : [
          'You assist Empírica Legal Lab, a law firm.',
          'Write a short, warm reminder for the client to complete what they have pending in the task described in the JSON.',
          ...RULES.en,
          'Do not mention legal consequences. Start with "Hello" and use no names of people. 80 words at most, in English.',
        ];
  return {
    system: system.join('\n'),
    prompt: JSON.stringify(input),
    schema: { type: 'OBJECT', properties: { texto: STRING }, required: ['texto'] },
    maxTokens: 400,
  };
}
