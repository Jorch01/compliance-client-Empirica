# IA con Gemini

> Diseño y términos verificados en la Fase 0 (2 de octubre de 2026); **implementada en la Fase 6** (7 de octubre de 2026). Modelos y cuotas verificados el 5 de octubre y cifras del socio del 7 de octubre: `LIMITES.md` § 5. Decisiones D60 a D62 en `PLAN.md`.

## Términos vigentes que importan a un despacho

Fuente: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) y [Data logging and sharing](https://ai.google.dev/gemini-api/docs/logs-policy).

- **Nivel gratuito ("Unpaid Services")**: para mejorar sus productos, **revisores humanos pueden leer, anotar y procesar** lo que se envía y lo que el modelo responde, y puede usarse para entrenar. Google lo desvincula antes de la cuenta, la API key y el proyecto, pero los términos dicen expresamente: **no envíes información sensible, confidencial ni personal**.
- **Nivel de pago ("Paid Services")**: los datos no se usan para entrenar ni mejorar productos (lo confirman las cifras que mandó el socio el 7 de octubre). Tiene costo, así que choca con la regla de costo cero.

**Conclusión**: con la key gratuita, nada confidencial de un cliente puede salir hacia Gemini. De ahí los modos.

## Modos

Configurables de forma global (`Config.modoIA`, `METADATA_ONLY` de inicio) y por cliente (`Clientes.modoIA`, en el formulario del cliente: como el despacho, encendidas o apagadas; solo lo cambia el `SOCIO_ADMIN`). Los cambios hechos desde el portal quedan en la `Bitacora`.

| Modo                          | Qué se envía                                                                                                                                                                                                                                                                                                                                                                                     | Cuándo                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OFF`                         | Nada; las ayudas de IA de ese cliente desaparecen de la pantalla y el servidor se niega (`AI_OFF`)                                                                                                                                                                                                                                                                                               | Clientes que no quieren IA                                                                                                                          |
| `METADATA_ONLY` (por defecto) | Solo datos estructurados (fechas, estados, áreas, categorías, conteos, semáforo) y **marcadores** en lugar de cada nombre que el portal conoce: cliente, unidades, personas, asuntos, tareas, obligaciones, trámites, autoridades, etapas, contrapartes, tipos de contrato, solicitudes y citas (`[ASUNTO_1]`, `[TAREA_2]`…). En el servidor, los marcadores de la respuesta vuelven a su nombre | Uso normal con la key gratuita                                                                                                                      |
| `FULL`                        | Incluiría el contenido de los documentos                                                                                                                                                                                                                                                                                                                                                         | Solo con key de pago **y** autorización expresa del cliente. Ninguna ayuda lo usa todavía (D62): un cliente en `FULL` funciona como `METADATA_ONLY` |

**Lo que nunca se envía**, en ningún modo: descripciones, comentarios ni documentos; registros `INTERNO` cuando quien pregunta es un usuario de cliente; datos de otro cliente; la key (la llamada sale del servidor con `UrlFetchApp` y la key va en un encabezado, nunca en la URL; el navegador nunca la ve). Una prueba manda todo el conjunto ficticio por las tres ayudas y comprueba que ningún nombre llega a Gemini (`apps/api/src/ai.test.ts`).

**Límite honesto de la seudonimización**: los marcadores tapan los nombres que el sistema conoce. La pregunta de "Pregúntale al portal" es texto libre: se le cambian por marcadores los nombres registrados (clientes, unidades, asuntos, tareas…), pero un nombre que el portal no conoce sale tal cual. Por eso la pantalla pide no escribir datos confidenciales en la pregunta.

## Funciones

| Función                       | Estado en F6                                                             | Entrada (seudonimizada)                                                                        | Salida                                       | Regla                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Resumen ejecutivo del reporte | ✅ Reportes → **Redactar con IA**                                        | El modelo del reporte del mes (D56), lo que ve el cliente                                      | Dos o tres párrafos, en el idioma elegido    | El abogado lo revisa y corrige antes de enviar; reemplaza lo escrito solo si él lo confirma                        |
| "¿Qué tengo pendiente?"       | ✅ **Pregúntale al portal**, en el inicio del despacho y del cliente     | Lo abierto que ve quien pregunta (tareas, obligaciones, trámites, contratos, citas), hasta 120 | Respuesta y enlaces a lo que nombra          | Solo lo que esa persona ve; si es usuario de cliente, solo lo `COMPARTIDO` de su alcance                           |
| Redacción de recordatorios    | ✅ En una tarea que espera al cliente → **Redactar recordatorio con IA** | La tarea, su asunto, su fecha, días en espera y puntos pendientes de su lista                  | Un borrador en el comentario para el cliente | Solo el despacho, solo tareas que el cliente ve y que esperan algo de él; nada se publica sin que alguien lo envíe |
| Extracción de documentos      | ❌ Fuera (D62)                                                           | Contrato, resolución u oficio completos                                                        | —                                            | Exige el texto completo: solo con key de pago y modo `FULL`                                                        |
| Clasificación de solicitudes  | ❌ Fuera (D62)                                                           | El texto libre que escribe el cliente                                                          | —                                            | Pendiente de decisión del socio; hoy se clasifica a mano contra el perímetro (D44)                                 |

Las instrucciones prohíben inventar hechos, fechas, plazos, montos o fundamentos legales y hablar de horas de trabajo. Todas las respuestas siguen un esquema JSON (`responseSchema`) que el servidor revisa con zod y recorta a 2,000 caracteres. Quién usa cada ayuda: el resumen y el recordatorio, el despacho; la pregunta, cualquiera con acceso (`PERMISOS.md`, nota 13).

## Modelos

- **El modelo no va fijo en el código** (lección de TSJ Filing): se guarda en `Config.modeloIA`; vacío, el portal lo elige de la lista real que devuelve la API (`models.list`) y lo guarda. Si Google responde que ya no existe (404), elige otro vivo, lo guarda, sigue funcionando y **avisa a los socios** (campana).
- Preferencia: Flash-Lite → Flash → Pro, siempre en versiones estables (nada en vista previa, experimental, de voz, imagen o embeddings), y la más nueva de cada familia.
- **Al 5 de octubre de 2026** Google recomienda Gemini 3.5 Flash-Lite y 3.8 Flash para proyectos nuevos; el portal elige `gemini-3.5-flash-lite`. Los modelos 2.5 solo están disponibles para quien ya los usaba: el modelo de TSJ (`gemini-2.5-flash`) no funcionaría con la cuenta del despacho, y la autodetección lo resuelve sin tocar código.
- `setup` prueba la key y dice qué modelo usará el portal (`SETUP.md`, paso 6).

## Cuotas y degradación

- La cuota es **del proyecto, no de la key**: cualquier key del proyecto la gasta. Por eso la key del navegador está restringida al inicio de sesión (`SETUP.md`, paso 3) y la de Gemini vive solo en el servidor.
- El servidor cuenta las consultas del día como Google: por **día de California** (se reinicia a medianoche del Pacífico, 2:00 o 3:00 en Cancún). El conteo vive en Script Properties (`AI_USAGE`) y los socios lo ven bajo "Pregúntale al portal".
- **Al 80 % de `Config.limiteDiarioIA`** los socios reciben un aviso, una vez al día. El límite de inicio es 1,000: lo bajo de lo que el socio vio para Flash-Lite (~1,000 a 1,500 al día, 7 de octubre). Si AI Studio muestra otra cifra para el proyecto, se cambia ese ajuste; vacío, no hay aviso previo.
- Si Google dice que **se agotó la cuota del día** (429 diario), la IA espera a mañana sin volver a llamar a Google, las ayudas dicen "Se acabaron por hoy las consultas a la IA. Vuelven mañana" y los socios reciben un aviso, una vez. El resto del portal sigue igual.
- Un **límite por minuto** (429 por minuto) se reintenta una vez tras 2 segundos; si se repite, "intenta en un minuto".
- Sin key, el portal funciona y las ayudas dicen que la IA no está configurada; con una key inválida, que hay que revisarla.
- **Sin conexión no hay IA**: las ayudas necesitan red y no se encolan.
