# IA con Gemini

> Fase 0: diseño y verificación de términos (2 de octubre de 2026). Se implementa en la Fase 6. Cifras y fuentes en `LIMITES.md` § 5.

## Términos vigentes que importan a un despacho

Fuente: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) y [Data logging and sharing](https://ai.google.dev/gemini-api/docs/logs-policy).

- **Nivel gratuito ("Unpaid Services")**: para mejorar sus productos, **revisores humanos pueden leer, anotar y procesar** lo que se envía y lo que el modelo responde. Google lo desvincula antes de la cuenta, la API key y el proyecto, pero los términos dicen expresamente: **no envíes información sensible, confidencial ni personal**.
- **Nivel de pago ("Paid Services")**: los datos reciben otro tratamiento y no se usan para mejorar productos. Tiene costo, así que choca con la regla de costo cero.

**Conclusión**: con la key gratuita, nada confidencial de un cliente puede salir hacia Gemini. De ahí los modos.

## Modos

Configurables de forma global (`Config`) y por cliente (`Clientes.modoIA`). Cada cambio queda en la `Bitacora`.

| Modo                          | Qué se envía                                                                                                                                                                                                                                            | Cuándo                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `OFF`                         | Nada; las funciones de IA se ocultan                                                                                                                                                                                                                    | Clientes que no quieren IA                                                                                                |
| `METADATA_ONLY` (por defecto) | Solo datos estructurados no confidenciales y **seudonimizados**: nombres de partes, RFC, montos y domicilios se reemplazan por marcadores (`[PARTE_1]`, `[RFC_1]`, `[MONTO_1]`…) antes del envío y se rehidratan en el servidor al recibir la respuesta | Uso normal con la key gratuita                                                                                            |
| `FULL`                        | Incluye el contenido de los documentos                                                                                                                                                                                                                  | Solo si la key es de pago **y** el cliente lo autorizó expresamente; si falta cualquiera de las dos, el servidor se niega |

**Lo que nunca se envía**, en ningún modo: registros `INTERNO` cuando quien pregunta es un usuario de cliente, datos de otro cliente, ni la key (la llamada sale del servidor con `UrlFetchApp`; el navegador nunca ve la key).

**Límite honesto de la seudonimización**: los marcadores tapan los datos identificables que el sistema conoce (partes registradas, RFC, montos, domicilios). Un texto libre puede contener nombres que el sistema no sabe que lo son. Por eso, en `METADATA_ONLY` solo se envían campos estructurados, nunca texto libre de documentos ni comentarios.

## Funciones

| Función                                     | Entrada                         | Salida                                                     | Regla                                                                                                                                                         |
| ------------------------------------------- | ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumen ejecutivo semanal o mensual (ES/EN) | Datos estructurados del cliente | Texto para el reporte                                      | El abogado lo revisa antes de enviarlo                                                                                                                        |
| Extracción de documentos                    | Contrato, resolución u oficio   | Propuesta en JSON de fechas, obligaciones y tareas         | **Nada se crea automáticamente**: un abogado revisa y aprueba cada propuesta. En `METADATA_ONLY` no hay extracción de documentos (requiere el texto completo) |
| "¿Qué tengo pendiente?"                     | Pregunta en lenguaje natural    | Respuesta con enlaces                                      | Solo datos del cliente activo; si pregunta un usuario de cliente, solo lo `COMPARTIDO`                                                                        |
| Clasificación de solicitudes                | Solicitud nueva                 | Área, urgencia y si probablemente cae dentro del perímetro | Es sugerencia; decide el abogado                                                                                                                              |
| Redacción de recordatorios y avisos         | Tipo de aviso y datos           | Borrador                                                   | Lo revisa quien lo envía                                                                                                                                      |

Todas las respuestas siguen un esquema JSON (`responseSchema`) validado con zod en el servidor.

## Modelos

- **El modelo no va fijo en el código** (lección de TSJ Filing): se guarda en `Config`, se elige de la lista real que devuelve la API (`models.list`) y, si el configurado responde que no existe o fue retirado (404 o "not found"), el servidor elige uno vivo, lo guarda, sigue funcionando y **avisa al administrador**.
- Preferencia: Flash-Lite → Flash → Pro, siempre en versiones estables: los modelos en vista previa o experimentales tienen límites más bajos y pueden desaparecer. Flash-Lite tiene bastante más cuota gratuita y alcanza para estas tareas.
- **Al 2 de octubre de 2026** Google recomienda Gemini 3.8 Flash y 3.5 Flash-Lite para proyectos nuevos, y los modelos 2.5 solo están disponibles para quien ya los usaba. El modelo por defecto de TSJ (`gemini-2.5-flash`) **no funcionaría** con una cuenta nueva del despacho; la autodetección lo resuelve sin tocar código.

## Cuotas y degradación

- Reintentos con espera exponencial ante 429; contador diario de uso en el servidor; aviso al administrador al 80 %.
- La cuota es **del proyecto, no de la key**: cualquier key del proyecto la gasta. Por eso la key del navegador queda restringida solo a inicio de sesión (`SETUP.md`, paso 3) y la de Gemini vive solo en el servidor.
- El contador diario se reinicia cuando lo hace Google, a medianoche del Pacífico (2:00 o 3:00 en Cancún), no a medianoche de Cancún.
- Al agotarse la cuota, las funciones de IA muestran "Disponible de nuevo mañana" y el resto del portal sigue igual.
- **Sin conexión, la IA no está disponible**: la interfaz lo indica y no encola peticiones de IA.
- La cuota gratuita exacta la muestra Google por proyecto en AI Studio (se reportan ~20 peticiones al día para Flash y ~500 para Flash-Lite). Hay que confirmarla con la cuenta del despacho antes de la Fase 6.
