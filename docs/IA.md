# IA con Gemini

> Diseño y términos verificados en la Fase 0 (2 de octubre de 2026); **implementada en la Fase 6** (7 de octubre de 2026); **«Crear con IA» en la Fase 8** (8 de octubre de 2026, D73 a D77). Modelos y cuotas verificados el 5 de octubre y cifras del socio del 7 de octubre: `LIMITES.md` § 5. Decisiones D60 a D62 en `PLAN.md`.

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

**Límite honesto de la seudonimización**: los marcadores tapan los nombres que el sistema conoce. La pregunta de "Pregúntale al portal" y la petición de "Crear con IA" son texto libre: antes de salir pierden lo que parece un correo, un número de diez dígitos o más (teléfono, cuenta), un RFC, una CURP o un monto (`[CORREO]`, `[NUMERO]`, `[RFC]`, `[CURP]`, `[MONTO]`), y se les cambian por marcadores los nombres registrados (el cliente por su nombre comercial, su razón social, también sin «S.A. de C.V.», o su RFC; unidades, personas, asuntos, tareas…). Los nombres de personas o clientes que quien escribe no ve también se tapan, y su marcador nunca vuelve como nombre en la respuesta. Un nombre que el portal no conoce sale tal cual. Por eso la pantalla pide no escribir datos confidenciales.

## Funciones

| Función                       | Estado en F6                                                                                                                 | Entrada (seudonimizada)                                                                        | Salida                                                                                    | Regla                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Resumen ejecutivo del reporte | ✅ Reportes → **Redactar con IA**                                                                                            | El modelo del reporte del mes (D56), lo que ve el cliente                                      | Dos o tres párrafos, en el idioma elegido                                                 | El abogado lo revisa y corrige antes de enviar; reemplaza lo escrito solo si él lo confirma                          |
| "¿Qué tengo pendiente?"       | ✅ **Pregúntale al portal**, en el inicio del despacho y del cliente                                                         | Lo abierto que ve quien pregunta (tareas, obligaciones, trámites, contratos, citas), hasta 120 | Respuesta y enlaces a lo que nombra                                                       | Solo lo que esa persona ve; si es usuario de cliente, solo lo `COMPARTIDO` de su alcance                             |
| Redacción de recordatorios    | ✅ En una tarea que espera al cliente → **Redactar recordatorio con IA**                                                     | La tarea, su asunto, su fecha, días en espera y puntos pendientes de su lista                  | Un borrador en el comentario para el cliente                                              | Solo el despacho, solo tareas que el cliente ve y que esperan algo de él; nada se publica sin que alguien lo envíe   |
| Crear con IA                  | ✅ F8: **Crear con IA** (Centro de control, Asuntos, Trámites, Compliance) y **Sugerir tareas con IA** (dentro de un asunto) | La petición del abogado, limpia y con marcadores, y la estructura del cliente en marcadores    | Registros listos para revisar: asuntos, tareas, trámites, obligaciones, contratos y citas | Solo el `SOCIO_ADMIN` y los `ABOGADO` del cliente; nada se crea sin su clic; todo nace `INTERNO` (sección siguiente) |
| Extracción de documentos      | ❌ Fuera (D62)                                                                                                               | Contrato, resolución u oficio completos                                                        | —                                                                                         | Exige el texto completo: solo con key de pago y modo `FULL`                                                          |
| Clasificación de solicitudes  | ❌ Fuera (D62)                                                                                                               | El texto libre que escribe el cliente                                                          | —                                                                                         | Pendiente de decisión del socio; hoy se clasifica a mano contra el perímetro (D44)                                   |

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

## Crear con IA (Fase 8)

Pedido del socio (7 de octubre de 2026): que la IA ayude a los abogados a crear lo que sea en el portal y les sugiera cómo dividir el trabajo. Sus respuestas: la key gratuita con lo confidencial fuera del texto, una vista previa con un clic y todo interno al nacer, y solo los abogados (D73 a D77, `PLAN.md` § 24).

**Quién**: el `SOCIO_ADMIN` y los `ABOGADO` del cliente, si su IA no está en `OFF`. Ni asistentes ni usuarios del cliente: el servidor se niega (`mayUseAi`, ayuda `draft`) y la pantalla no muestra el botón.

**Qué se envía** (`ai.draft`): la petición del abogado, limpia y con marcadores (el límite honesto de arriba), y la estructura del cliente en marcadores: sus unidades (con cuál pertenece a cuál), las personas que se le pueden asignar (con su rol), sus asuntos abiertos (área y estado), las plantillas de trámite (cuántas etapas tienen) y el catálogo de obligaciones (categoría y regla de repetición). Si se pidió dentro de un asunto, también ese asunto y sus tareas (estado, fecha y de quién es cada una). Hoy y el día de la semana, para fechas como "el viernes". Nunca descripciones, comentarios, documentos ni datos de otro cliente.

**Qué vuelve**: registros en un esquema fijo (hasta 15) que el servidor revisa y convierte en los campos del portal, sin escribir nada:

- Los marcadores vuelven a ser nombres; uno que no es de este cliente, o que la IA inventó, se ignora.
- Un asunto nuevo de la propuesta enlaza sus tareas, trámites y citas por clave; una tarea puede ir después de otra.
- Fechas, solo si son días reales y cercanos (un año atrás, diez adelante), y **marcadas para revisar**; la IA tiene prohibido poner plazos que la petición no diga.
- Plazo fatal solo si la petición lo dice, y marcado para revisar. Ningún fundamento legal.
- Una obligación del **catálogo** se crea con los datos del catálogo y su próximo vencimiento sale de su regla (marcado para revisar). Una que no viene del catálogo nace `BORRADOR: validar · …`, sin fundamento, como los borradores del catálogo.
- Un trámite con **plantilla** toma su autoridad y empieza en su primera etapa.
- Las tareas nacen "Por hacer": la IA no cambia estados. Las del despacho quedan a nombre de quien pide, salvo que la petición nombre a alguien registrado.

**La vista previa**: cada registro con sus campos principales, para corregirlos, quitarlos (un asunto se lleva sus tareas) o compartirlos con el cliente; **todo nace `INTERNO`**. Lo que se corrige ahí no va a la IA: es el lugar para escribir nombres reales. **Crear** guarda todo en el dispositivo, en orden y como si se hubiera capturado a mano (sus permisos, la cola sin red, los avisos de siempre), y la `Bitacora` lo registra como `CREAR_IA`.

**Qué no hace**: no borra, no edita lo que ya existe, no valida cumplimientos, no invita ni cambia permisos, no envía nada al cliente.

**Cuota**: cada propuesta es una consulta (hasta 3,000 tokens de respuesta) y cuenta en el límite diario como las demás ayudas.
