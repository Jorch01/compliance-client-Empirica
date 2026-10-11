/**
 * Las guías «¿Qué va aquí?» en español (D79). Al despacho se le habla de
 * tú y al cliente de usted, como en el resto del portal. Los ejemplos son
 * ficticios y no traen fundamentos, plazos ni fechas: eso lo decide un
 * abogado en cada caso.
 */
import type { GuideTexts } from './guides.ts';

export const guidesEs: GuideTexts = {
  ui: {
    button: '¿Qué va aquí?',
    dialogTitle: '{{section}}: qué va aquí',
    purpose: 'Para qué sirve',
    goes: { firm: 'Qué se registra aquí', client: 'Qué puede hacer aquí' },
    fields: 'Qué poner en cada campo',
    example: 'Ejemplo',
    notHere: '¿No es esto? Entonces va en otra sección',
    goesIn: 'va en {{section}}',
    back: 'Volver a {{section}}',
    goTo: 'Ir a {{section}}',
    close: 'Entendido',
    whereTitle: { firm: '¿Dónde registro cada cosa?', client: '¿Dónde encuentro cada cosa?' },
    whereIntro: {
      firm: 'Elige la situación que se parezca a la tuya: verás qué sección le toca, qué poner y un ejemplo.',
      client:
        'Elija la situación que se parezca a la suya: verá qué sección le corresponde, qué hay ahí y un ejemplo.',
    },
    mapTitle: 'Cómo se conecta todo',
    allTitle: 'Las guías de cada sección',
  },
  firm: {
    requests: {
      title: 'Solicitudes',
      purpose:
        'Lo que el cliente le pide al despacho. Aquí se recibe, se clasifica frente a la iguala y, si se atiende, se convierte en asunto.',
      goes: [
        'Cualquier petición nueva del cliente, aunque llegue por correo o por teléfono: regístrala para que quede rastro.',
        'Lo que todavía no sabes si entra en la iguala o hay que cotizar.',
      ],
      fields: [
        {
          name: '¿Qué necesita?',
          tip: 'La petición en una línea, como la diría el cliente. Ej.: «Revisar el contrato con el nuevo proveedor».',
        },
        {
          name: 'Detalles',
          tip: 'El contexto, las fechas que mencionó el cliente y los documentos que tiene.',
        },
        { name: 'Urgencia y área', tip: 'Ayudan a decidir quién la atiende y cuándo.' },
        {
          name: 'Clasificar',
          tip: 'Dentro de la iguala, fuera de ella (se cotiza), aceptada o rechazada. El cliente ve cada cambio.',
        },
        {
          name: 'Convertir en asunto',
          tip: 'Cuando se acepta: abre el asunto con estos datos y los dos quedan ligados.',
        },
      ],
      example: [
        'El cliente pide: «Necesitamos revisar el contrato con el nuevo proveedor de logística».',
        'La clasificas: Dentro de la iguala.',
        'La conviertes en asunto y ahí agregas las tareas.',
      ],
      notHere: [
        { text: 'Ya se aceptó y hay trabajo que organizar', to: 'matters' },
        { text: 'Es una cita o una llamada que pidió el cliente', to: 'agenda' },
      ],
    },
    matters: {
      title: 'Asuntos',
      purpose:
        'Un asunto es un encargo completo del cliente, con un objetivo y un responsable. Agrupa todo lo demás: sus tareas, trámites, documentos y la conversación.',
      goes: [
        'Un proyecto con principio y fin: una constitución, una negociación, una auditoría, una defensa.',
        'Algo que se divide en varios pasos (las tareas) y cuyo avance el cliente quiere ver.',
        'Lo que nace de una solicitud: al convertirla, el asunto se abre aquí.',
      ],
      fields: [
        {
          name: 'Título',
          tip: 'El encargo en pocas palabras, como lo diría el cliente. Ej.: «Constitución de la filial».',
        },
        {
          name: 'Área',
          tip: 'La que mejor lo describe; sirve para filtrar y para el reporte mensual.',
        },
        { name: 'Responsable', tip: 'Quien responde ante el cliente por el asunto.' },
        { name: 'Prioridad', tip: 'Qué tan urgente es frente a los demás asuntos del cliente.' },
        {
          name: 'Fecha objetivo',
          tip: 'Cuándo esperas concluirlo. No es un plazo legal: esos van en una tarea con plazo fatal o en el trámite.',
        },
        { name: 'Dentro de la iguala', tip: 'Desmárcalo si el encargo se cotiza aparte.' },
        {
          name: 'Quién lo ve',
          tip: 'Compartido si el cliente debe seguirlo; interno si es trabajo solo del despacho. Un asunto interno oculta también sus tareas, comentarios y documentos.',
        },
      ],
      example: [
        'Título: «Revisión de los contratos de proveedores» · Área: Contratos · Prioridad: Media · Compartido.',
        'Sus tareas: «Enviar los contratos vigentes» (le toca al cliente), «Revisar las cláusulas de penalización» y «Entregar el informe» (le tocan al despacho).',
      ],
      notHere: [
        { text: 'Es una sola acción con fecha, como «enviar el borrador el viernes»', to: 'tasks' },
        { text: 'Es una gestión ante una autoridad, con folio y etapas', to: 'filings' },
        { text: 'Se repite cada mes o cada año, como una declaración', to: 'compliance' },
        { text: 'Es un contrato ya firmado al que hay que vigilarle la vigencia', to: 'contracts' },
      ],
    },
    tasks: {
      title: 'Tareas',
      purpose:
        'Una tarea es una acción concreta, con quien debe hacerla y de preferencia una fecha límite. Es el paso a paso de un asunto.',
      goes: [
        'Algo que una persona puede hacer y marcar como hecho: redactar, revisar, enviar, recabar, firmar.',
        'Lo que el cliente debe entregar o hacer: con «Le toca a: el cliente», le aparece en sus pendientes.',
        'Un plazo legal que no admite prórroga: márcalo como plazo fatal.',
      ],
      fields: [
        {
          name: 'Título',
          tip: 'Empieza con un verbo y di qué se entrega. Ej.: «Enviar el borrador del acta», «Firmar los poderes».',
        },
        {
          name: 'Asunto',
          tip: 'El encargo al que pertenece. Sin asunto solo si de verdad no forma parte de ninguno.',
        },
        {
          name: 'Le toca a',
          tip: 'Quién da el siguiente paso: el despacho, el cliente o ambos. Si es el cliente, la ve en «Pendientes de su lado».',
        },
        {
          name: 'Fecha límite',
          tip: 'Cuándo debe estar lista. Si es un plazo legal, marca también «Plazo fatal».',
        },
        { name: 'Depende de', tip: 'Otra tarea que debe terminarse antes.' },
        {
          name: 'Lista de verificación',
          tip: 'Los puntos pequeños dentro de la tarea; el cliente puede palomearlos.',
        },
        {
          name: 'Estado',
          tip: '«En espera del cliente» cuando le toca a él; «En revisión» cuando alguien la entregó y falta revisarla.',
        },
      ],
      example: [
        'Título: «Recabar las identificaciones de los accionistas».',
        'Asunto: Constitución de la filial · Le toca a: el cliente · Fecha límite: la que acordaron.',
        'Lista de verificación: un punto por accionista.',
      ],
      notHere: [
        { text: 'Tiene varios pasos y un objetivo propio', to: 'matters' },
        { text: 'Es toda una gestión ante una autoridad, con folio y etapas', to: 'filings' },
        { text: 'Es una cita, una reunión o una audiencia', to: 'agenda' },
        { text: 'Vuelve cada periodo', to: 'compliance' },
      ],
    },
    filings: {
      title: 'Trámites',
      purpose:
        'Un trámite es una gestión ante una autoridad que avanza por etapas: se prepara, se presenta y la autoridad responde. Aquí se ve en qué etapa va, desde cuándo y qué fecha viene.',
      goes: [
        'Registros, solicitudes, avisos o permisos que se presentan ante una autoridad y tienen folio o expediente.',
        'Lo que tiene etapas que el cliente quiere seguir: en preparación, presentado, requerimiento, resuelto.',
      ],
      fields: [
        {
          name: 'Título',
          tip: 'Qué se tramita, en pocas palabras. Ej.: «Registro de la marca comercial».',
        },
        {
          name: 'Plantilla',
          tip: 'Trae la autoridad y las etapas de ese tipo de trámite; las plantillas las define el despacho.',
        },
        { name: 'Autoridad', tip: 'Ante quién se presenta, con su nombre o sus siglas.' },
        {
          name: 'Asunto',
          tip: 'El encargo del que forma parte; así sus documentos y la conversación quedan juntos.',
        },
        {
          name: 'Folio o expediente',
          tip: 'El número que da la autoridad al presentar; con él se localiza.',
        },
        {
          name: 'Próxima actuación y fecha límite',
          tip: 'Lo que sigue y el plazo para atenderlo, si lo hay. Las fechas salen del expediente: nunca se suponen.',
        },
        {
          name: 'Estado',
          tip: '«Requerimiento» cuando la autoridad pidió algo y hay que contestar.',
        },
      ],
      example: [
        'Título: «Registro de la marca comercial» · Autoridad: IMPI · Asunto: Protección de marcas.',
        'Folio: el del acuse de presentación.',
        'Cada vez que cambia de etapa, queda registrado el día.',
      ],
      notHere: [
        {
          text: 'Es lo que hay que hacer para prepararlo, como redactar o recabar firmas',
          to: 'tasks',
        },
        {
          text: 'Es una obligación que se repite, como una declaración o un aviso anual',
          to: 'compliance',
        },
        { text: 'Es el encargo completo, que incluye más que este trámite', to: 'matters' },
      ],
    },
    compliance: {
      title: 'Compliance',
      purpose:
        'El calendario de obligaciones que se repiten: lo que la empresa debe cumplir cada mes o cada año y la evidencia de que lo hizo. La matriz muestra cuánto se cumplió.',
      goes: [
        'Obligaciones periódicas: declaraciones, avisos, renovaciones, libros corporativos, asambleas anuales.',
        'Cada periodo se cierra con su evidencia (el acuse, el acta), que el despacho valida.',
      ],
      fields: [
        {
          name: 'Desde el catálogo',
          tip: 'Empieza por un modelo del catálogo del despacho: trae nombre, categoría y recurrencia.',
        },
        {
          name: 'Nombre',
          tip: 'La obligación como la reconoce el cliente. Ej.: «Declaración mensual de impuestos».',
        },
        {
          name: 'Fundamento',
          tip: 'La norma que la impone. Lo escribe un abogado: el portal no propone fundamentos.',
        },
        { name: 'Se repite', tip: 'Cada cuánto vuelve: cada mes o cada año, y qué día.' },
        {
          name: 'Le toca a',
          tip: 'Quién la cumple. Si es el cliente, él sube la evidencia y el despacho la valida.',
        },
        {
          name: 'Evidencia requerida',
          tip: 'Qué documento prueba que se cumplió. Ej.: «Acuse de presentación».',
        },
        { name: 'Riesgo', tip: 'Qué tan grave es no cumplirla; pesa en el índice de salud.' },
      ],
      example: [
        'Nombre: «Declaración mensual de impuestos» · Categoría: Fiscal · Se repite: cada mes, el día que indique el abogado.',
        'Le toca a: el cliente · Evidencia requerida: acuse de presentación.',
        'Cada mes el cliente sube el acuse y el despacho lo valida; la matriz lo cuenta como cumplido.',
      ],
      notHere: [
        { text: 'Pasa una sola vez', to: 'tasks' },
        { text: 'Es un trámite con folio y etapas ante una autoridad', to: 'filings' },
        { text: 'Es la vigencia o la renovación de un contrato', to: 'contracts' },
      ],
    },
    contracts: {
      title: 'Contratos',
      purpose:
        'El registro de los contratos firmados del cliente: con quién, hasta cuándo y si se renuevan solos, para avisar antes de que venzan.',
      goes: [
        'Contratos ya firmados que hay que vigilar: arrendamientos, servicios, licencias, confidencialidad.',
        'Con su documento firmado, para tenerlo a la mano.',
      ],
      fields: [
        { name: 'Contraparte', tip: 'La otra parte, con su razón social.' },
        { name: 'Tipo', tip: 'Qué clase de contrato es: arrendamiento, servicios, licencia…' },
        { name: 'Vigente hasta', tip: 'El último día de vigencia, como lo dice el contrato.' },
        {
          name: 'Renovación automática y días de aviso',
          tip: 'Si se renueva solo y cuántos días antes hay que avisar para no renovarlo; el portal lo recuerda.',
        },
        { name: 'Documento', tip: 'El contrato firmado.' },
      ],
      example: [
        'Contraparte: «Inmobiliaria Demo, S.A. de C.V.» · Tipo: arrendamiento.',
        'Vigencia y días de aviso: los que dice el contrato · Renovación automática: sí.',
        'Documento: el contrato firmado, en PDF.',
      ],
      notHere: [
        { text: 'El contrato aún se negocia o se redacta', to: 'matters' },
        {
          text: 'Del contrato nace una obligación que se repite, como un reporte mensual',
          to: 'compliance',
        },
      ],
    },
    documents: {
      title: 'Documentos',
      purpose:
        'Todos los archivos de los asuntos y tareas del cliente en un solo lugar. Cada documento se sube desde su asunto o tarea, para que quede con su contexto.',
      goes: [
        'Borradores, versiones firmadas, acuses, identificaciones.',
        'Se suben desde el asunto o la tarea a la que pertenecen; aquí se buscan todos juntos.',
      ],
      fields: [
        { name: 'Nombre', tip: 'Qué es y qué versión. Ej.: «Acta constitutiva firmada».' },
        {
          name: 'Quién lo ve',
          tip: 'Los del despacho empiezan como internos; compártelos cuando el cliente deba verlos.',
        },
        { name: 'Versión nueva', tip: 'Para reemplazar un archivo sin perder el anterior.' },
      ],
      example: [
        'En la tarea «Enviar el borrador del acta», sube «Acta, borrador 2» como interno.',
        'Ya revisado, compártelo: el cliente lo ve en la tarea y aquí.',
      ],
      notHere: [
        { text: 'Es la prueba de que se cumplió una obligación periódica', to: 'compliance' },
        { text: 'Es un contrato firmado al que hay que vigilarle la vigencia', to: 'contracts' },
      ],
    },
    agenda: {
      title: 'Agenda',
      purpose:
        'Todas las fechas juntas: las fechas límite de tareas y trámites, los vencimientos de obligaciones y contratos, y las citas.',
      goes: [
        'Citas, reuniones y audiencias.',
        'Lo demás llega solo: cada fecha que registras en otra sección aparece aquí.',
      ],
      fields: [
        {
          name: 'Título',
          tip: 'Qué es y con quién. Ej.: «Llamada de avance con el cliente».',
        },
        {
          name: 'Tipo, fecha y hora',
          tip: 'Cita, reunión o audiencia; de todo el día si no tiene hora.',
        },
        {
          name: 'Tu calendario',
          tip: 'Con tu enlace personal, la agenda aparece en el calendario de tu teléfono.',
        },
      ],
      example: [
        'Título: «Firma de los poderes» · Tipo: Cita · con fecha y hora.',
        'Aparece en la agenda junto a la fecha límite de la tarea «Firmar los poderes».',
      ],
      notHere: [
        { text: 'Es algo que hay que hacer, no una reunión', to: 'tasks' },
        { text: 'Es un vencimiento que se repite', to: 'compliance' },
      ],
    },
  },
  client: {
    requests: {
      title: 'Solicitudes',
      purpose:
        'La forma de pedirle algo nuevo al despacho. Cada solicitud queda registrada y usted ve qué decidió el despacho.',
      goes: [
        'Pedir algo con «Nueva solicitud»: qué necesita, los detalles y la urgencia.',
        'Ver si entra en la iguala o si el despacho le enviará una cotización.',
        'Cuando se acepta, se vuelve un asunto que puede seguir.',
      ],
      fields: [
        {
          name: '¿Qué necesita?',
          tip: 'Su petición en una línea. Ej.: «Revisar el contrato con el nuevo proveedor».',
        },
        {
          name: 'Detalles',
          tip: 'El contexto, fechas que importen y qué documentos tiene; los puede subir después en el asunto.',
        },
        { name: 'Urgencia', tip: 'Qué tan pronto lo necesita.' },
      ],
      example: [
        '«Necesitamos revisar el contrato con el nuevo proveedor de logística» · Urgencia: media.',
        'El despacho la clasifica «Dentro de la iguala» y la convierte en asunto.',
      ],
      notHere: [
        {
          text: 'Ya hay un asunto abierto sobre el tema: escriba en sus comentarios',
          to: 'matters',
        },
      ],
    },
    matters: {
      title: 'Asuntos',
      purpose:
        'Un asunto es un encargo que su Fractional Legal Team lleva para su empresa, como una constitución o una negociación. Reúne sus tareas, trámites, documentos y la conversación.',
      goes: [
        'Ver el avance: cuántas tareas van hechas y qué falta.',
        'Escribir al despacho en los comentarios del asunto.',
        'Subir los documentos que le pidan, en el asunto o en su tarea.',
      ],
      fields: [],
      example: [
        '«Constitución de la filial» · Avance: 3 de 5 tareas hechas.',
        'Las dos que faltan dicen a quién le tocan: si una es de su empresa, también está en sus pendientes.',
      ],
      notHere: [
        { text: 'Necesita algo nuevo del despacho', to: 'requests' },
        { text: 'Busca lo que le toca hacer a su empresa', to: 'tasks' },
      ],
    },
    tasks: {
      title: 'Pendientes',
      purpose:
        'Las tareas son los pasos de cada asunto. Aquí están las que le tocan a su empresa: entregar un documento, firmar, contestar algo.',
      goes: [
        'Pulsar «Empezar» al tomarla y «Marcar como listo» al terminarla: el despacho la revisa y la cierra.',
        'Palomear los puntos de su lista de verificación.',
        'Avisar con «Está bloqueado» si algo le impide avanzar, y explicarlo en un comentario.',
        'Subir en la tarea el documento que se le pidió.',
      ],
      fields: [],
      example: [
        '«Recabar las identificaciones de los accionistas» · Fecha límite: viernes.',
        'Suba las identificaciones en la tarea y márquela como lista.',
      ],
      notHere: [
        { text: 'Quiere pedir algo nuevo', to: 'requests' },
        { text: 'Debe entregar la evidencia de una obligación periódica', to: 'compliance' },
      ],
    },
    filings: {
      title: 'Trámites',
      purpose:
        'Las gestiones que el despacho presenta ante autoridades por su empresa. Aquí ve en qué etapa va cada una, desde cuándo y qué fecha viene.',
      goes: [
        'Seguir las etapas: la actual, las hechas y las que faltan.',
        'Ver si la autoridad pidió algo («Requerimiento») y qué se necesita de usted.',
        'Comentar y subir documentos en el trámite.',
      ],
      fields: [],
      example: ['«Registro de la marca comercial» · Etapa 2 de 4 · 12 días en esta etapa.'],
      notHere: [{ text: 'Necesita iniciar un trámite nuevo', to: 'requests' }],
    },
    compliance: {
      title: 'Compliance',
      purpose:
        'El calendario de las obligaciones periódicas de su empresa (declaraciones, avisos, renovaciones) y la prueba de que se cumplieron.',
      goes: [
        'Ver qué vence pronto y qué está vencido.',
        'Enviar la evidencia (el acuse, el acta) de las obligaciones que le tocan; el despacho la revisa y la valida.',
        'Leer la matriz: cuánto se cumplió por categoría y por mes.',
      ],
      fields: [],
      example: [
        '«Declaración mensual de impuestos» · Le toca: a su empresa.',
        'Envíe el acuse del mes: queda «En revisión» hasta que el despacho lo valide.',
      ],
      notHere: [
        { text: 'Es algo que se hace una sola vez', to: 'tasks' },
        { text: 'Es un contrato que vence', to: 'contracts' },
      ],
    },
    contracts: {
      title: 'Contratos',
      purpose:
        'Los contratos firmados de su empresa que el despacho vigila: con quién, hasta cuándo y si se renuevan solos.',
      goes: [
        'Consultar vigencias y descargar el contrato firmado.',
        'Ver con tiempo cuándo hay que avisar para que no se renueve.',
      ],
      fields: [],
      example: [
        'Arrendamiento con «Inmobiliaria Demo» · Renovación automática: sí.',
        'El último día para avisar que no se renueva aparece en su agenda.',
      ],
      notHere: [{ text: 'Necesita un contrato nuevo o revisar uno', to: 'requests' }],
    },
    documents: {
      title: 'Documentos',
      purpose:
        'Los archivos que comparten usted y su Fractional Legal Team. Cada documento vive en su asunto o tarea.',
      goes: [
        'Buscar y descargar cualquier documento compartido.',
        'Subir un documento desde el asunto o la tarea a la que corresponde, para que el despacho sepa de qué es.',
      ],
      fields: [],
      example: [
        'Suba el comprobante de domicilio en la tarea «Recabar los documentos de la filial»: aparecerá ahí y aquí.',
      ],
      notHere: [{ text: 'Es la evidencia de una obligación periódica', to: 'compliance' }],
    },
    agenda: {
      title: 'Agenda',
      purpose:
        'Las fechas que le importan, juntas: fechas límite, vencimientos, renovaciones y citas con el despacho.',
      goes: [
        'Ver lo que viene esta semana y este mes.',
        'Llevar la agenda al calendario de su teléfono con su enlace personal.',
      ],
      fields: [],
      example: [
        'Lunes: vence la «Declaración mensual de impuestos». Jueves: cita con el despacho.',
      ],
      notHere: [{ text: 'Quiere pedir una cita o algo nuevo', to: 'requests' }],
    },
  },
  where: {
    firm: [
      { text: 'El cliente pide algo nuevo', to: 'requests' },
      { text: 'Un encargo con varios pasos: una constitución, una negociación', to: 'matters' },
      { text: 'Un paso concreto: redactar, revisar, enviar, firmar', to: 'tasks' },
      { text: 'Algo que el cliente debe entregar o hacer', to: 'tasks' },
      { text: 'Una gestión con folio ante una autoridad', to: 'filings' },
      { text: 'Algo que se repite cada mes o cada año', to: 'compliance' },
      { text: 'Un contrato firmado que vence o se renueva', to: 'contracts' },
      { text: 'Un archivo', to: 'documents' },
      { text: 'Una cita, una reunión o una audiencia', to: 'agenda' },
    ],
    client: [
      { text: 'Necesito algo del despacho', to: 'requests' },
      { text: '¿Cómo va un encargo?', to: 'matters' },
      { text: '¿Qué me toca hacer?', to: 'tasks' },
      { text: '¿En qué va un trámite ante una autoridad?', to: 'filings' },
      { text: 'Enviar el acuse de una declaración', to: 'compliance' },
      { text: '¿Cuándo vence un contrato?', to: 'contracts' },
      { text: 'Encontrar un archivo', to: 'documents' },
      { text: '¿Qué fechas vienen?', to: 'agenda' },
    ],
  },
  map: {
    firm: [
      'Una solicitud del cliente, cuando se acepta, se convierte en asunto.',
      'El asunto se divide en tareas, y en trámites si incluye gestiones ante una autoridad.',
      'Los documentos y los comentarios se guardan en el asunto, la tarea o el trámite al que pertenecen.',
      'Compliance y contratos corren aparte: lo que se repite y lo que vence.',
      'Todas las fechas llegan a la agenda, a la campana y al reporte mensual.',
    ],
    client: [
      'Usted pide algo en una solicitud; si el despacho la acepta, se vuelve un asunto.',
      'El asunto avanza con tareas; las que le tocan a su empresa están en sus pendientes.',
      'Los trámites ante autoridades muestran su etapa; compliance, lo que se repite; contratos, lo que vence.',
      'Todas las fechas llegan a la agenda y a la campana.',
    ],
  },
  hints: {
    matterTitle:
      'El encargo completo, como lo diría el cliente. Ej.: «Constitución de la filial». Una sola acción va mejor como tarea.',
    matterTarget: 'Cuándo esperas concluirlo. Los plazos legales van en tareas o trámites.',
    taskTitle: 'Empieza con un verbo y di qué se entrega. Ej.: «Enviar el borrador del acta».',
    taskSide: 'Si le toca al cliente, la verá en sus pendientes.',
    filingTitle: 'Qué se tramita. Ej.: «Registro de la marca comercial».',
    filingAuthority: 'Ante quién se presenta, con su nombre o sus siglas.',
    filingFolio: 'El número que da la autoridad al presentar.',
    obligationName:
      'Como la reconoce el cliente. Ej.: «Declaración mensual de impuestos». Si pasa una sola vez, es una tarea.',
    obligationEvidence: 'Qué documento prueba que se cumplió. Ej.: «Acuse de presentación».',
    contractCounterpart: 'La otra parte, con su razón social.',
    requestTitle: 'La petición en una línea. Ej.: «Revisar el contrato con el nuevo proveedor».',
    requestDetails: 'El contexto, las fechas que importan y los documentos que hay.',
    appointmentTitle: 'Qué es y con quién. Ej.: «Llamada de avance con el cliente».',
  },
};
