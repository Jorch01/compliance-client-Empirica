# Matriz de permisos

> Estado: **aprobada con el plan (2026-10-02)**, ampliada con el alcance por unidad (D13) y **escrita en código en la Fase 1** (`packages/shared/src/permissions`): la misma para el frontend y el backend. Cada celda de la matriz tiene su prueba (`permissions.test.ts`) y el aislamiento y la visibilidad se prueban además sobre la sincronización (`apps/api/src/sync.test.ts`).

## Principios

1. **El servidor decide.** El frontend usa la matriz solo para esconder botones; cada petición se vuelve a autorizar en Apps Script.
2. **Lista blanca.** Tener cuenta en Firebase no da acceso: el usuario debe existir y estar activo en `Usuarios`. Si no, la respuesta es "Solicita acceso a tu abogado de Empírica".
3. **Todo filtra por cliente en el servidor.** Un usuario solo recibe datos de los clientes donde tiene membresía (el `SOCIO_ADMIN`, de todos).
4. **`INTERNO` nunca sale hacia un usuario de cliente**: ni en listados, conteos, búsquedas, contexto de IA, feeds ICS, correos, reportes ni exportaciones.
5. **Un id ajeno se trata como inexistente.** Pedir un registro de otro cliente responde `NOT_FOUND`, igual que un id inventado, para no confirmar que existe.

## Roles

| Rol                   | Lado     | Alcance                                                                                                                          |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SOCIO_ADMIN`         | Despacho | Todos los clientes, administración y bitácora                                                                                    |
| `ABOGADO`             | Despacho | Clientes donde tiene membresía (asignados)                                                                                       |
| `ASISTENTE`           | Despacho | Como el abogado, sin borrar ni administrar usuarios                                                                              |
| `CLIENTE_ADMIN`       | Cliente  | Lo compartido de su empresa, o de su unidad si tiene alcance; invita usuarios dentro de su alcance (con aprobación del despacho) |
| `CLIENTE_COLABORADOR` | Cliente  | Como el admin del cliente, sin invitar                                                                                           |
| `CLIENTE_LECTURA`     | Cliente  | Solo lectura de lo compartido                                                                                                    |

Un usuario puede tener membresías en varios clientes (por ejemplo, el contador externo de varias empresas) y elige el cliente activo en el header.

## Alcance por unidad (clientes con varias unidades de negocio)

Cualquier membresía de cliente puede llevar un **alcance**: una lista de unidades (y, si hace falta, de asuntos). Una unidad incluye a sus sucursales.

- **Sin alcance** = usuario del **hub**: ve todas las unidades y el consolidado.
- **Con alcance** = usuario de **unidad**: ve los registros de sus unidades, los que tiene asignados y los que él creó; nada del resto del cliente, ni en conteos ni en el consolidado.
- Un `CLIENTE_ADMIN` con alcance solo invita usuarios **dentro** de su alcance, y la invitación queda pendiente de aprobación del despacho.
- Cambiar el rol o el alcance de alguien, o mover una unidad dentro del árbol, obliga a los dispositivos a borrar y volver a descargar ese cliente, para que no quede nada que ya no le corresponde.
- Lo que cuelga de otro registro (comentarios, documentos, evidencias, eventos) lo ve quien ve ese registro, y nadie más: un usuario de unidad ve los comentarios de la tarea que le asignaron aunque la tarea sea de otra unidad.
- Las tareas y trámites de un asunto conservan su propio alcance (su unidad, su asignado), pero **ningún** usuario de cliente los ve mientras el asunto sea `INTERNO`.
- Un usuario de unidad solo crea registros dentro de sus unidades.

## Matriz

C = crear · R = leer · U = editar · D = borrar (lógico, con fecha) · — = sin acceso. "Compartido" = solo registros `COMPARTIDO`. "Alcance" = limitado por la membresía del colaborador.

| Recurso                              | SOCIO_ADMIN                      | ABOGADO                                 | ASISTENTE                              | CLIENTE_ADMIN                                | CLIENTE_COLABORADOR                    | CLIENTE_LECTURA               |
| ------------------------------------ | -------------------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------------- | -------------------------------------- | ----------------------------- |
| Clientes                             | CRUD                             | R; U operativo¹                         | R; U operativo¹                        | R²                                           | R²                                     | R²                            |
| Entidades                            | CRUD                             | CRUD                                    | CRU                                    | R                                            | R (alcance)                            | R                             |
| Usuarios                             | CRUD                             | R³                                      | R³                                     | R⁴                                           | R⁴                                     | R⁴                            |
| Membresías                           | CRUD                             | R                                       | R                                      | R (su empresa)                               | —                                      | —                             |
| Invitaciones                         | CRUD y aprobar                   | C⁵ y aprobar (sus clientes)             | —                                      | C (su empresa o su alcance; queda pendiente) | —                                      | —                             |
| Asuntos                              | CRUD                             | CRUD                                    | CRU                                    | R compartido                                 | R compartido (alcance)                 | R compartido                  |
| Tareas                               | CRUD                             | CRUD                                    | CRU                                    | R compartido; U limitado⁶                    | R compartido (alcance); U limitado⁶    | R compartido                  |
| Trámites                             | CRUD                             | CRUD                                    | CRU                                    | R compartido                                 | R compartido (alcance)                 | R compartido                  |
| Plantillas de trámite                | CRUD                             | R                                       | R                                      | —                                            | —                                      | —                             |
| Obligaciones (compliance)            | CRUD                             | CRUD                                    | CRU                                    | R compartido                                 | R compartido (alcance)                 | R compartido                  |
| Cumplimientos (evidencia)            | CRUD y validar                   | CRU y validar                           | CRU y validar                          | C evidencia⁷; R                              | C evidencia⁷; R (alcance)              | R                             |
| Catálogo de obligaciones             | CRUD                             | R                                       | R                                      | —                                            | —                                      | —                             |
| Contratos                            | CRUD                             | CRUD                                    | CRU                                    | R compartido                                 | R compartido (alcance)                 | R compartido                  |
| Documentos                           | CRUD                             | CRUD                                    | CRU                                    | C⁸; R compartido                             | C⁸; R compartido (alcance)             | R compartido                  |
| Solicitudes                          | CRUD, clasificar y convertir     | CRU, clasificar y convertir             | CRU, clasificar y convertir            | C; R (su empresa)                            | C; R (las suyas y su alcance)          | R (su empresa)                |
| Comentarios                          | CRUD                             | C; R (interno y compartido); UD propios | C; R (interno y compartido); U propios | C⁹; R compartido; UD propios                 | C⁹; R compartido (alcance); UD propios | R compartido                  |
| Eventos de calendario                | CRUD                             | CRUD                                    | CRU                                    | R compartido                                 | R compartido (alcance)                 | R compartido                  |
| Días inhábiles                       | CRUD                             | R                                       | R                                      | R                                            | R                                      | R                             |
| Notificaciones                       | R y marcar leídas (propias)      | igual                                   | igual                                  | igual                                        | igual                                  | igual                         |
| Sugerencias y errores¹⁰              | C; R todas; U estado y respuesta | C; R propias                            | C; R propias                           | C; R propias                                 | C; R propias                           | C; R propias                  |
| Avisos de conflicto                  | R y resolver                     | R y resolver (sus clientes)             | R                                      | —                                            | —                                      | —                             |
| Bitácora                             | R                                | —                                       | —                                      | —                                            | —                                      | —                             |
| Reportes                             | CRUD, generar y enviar           | C (generar), R, enviar                  | C (generar), R                         | R (enviados)                                 | R (enviados)                           | R (enviados)                  |
| Configuración                        | CRUD                             | R (pública)                             | R (pública)                            | R (pública)                                  | R (pública)                            | R (pública)                   |
| Modo de IA (global y por cliente)    | U                                | —                                       | —                                      | —                                            | —                                      | —                             |
| Exportar respaldo                    | todo                             | sus clientes                            | sus clientes                           | lo visible de su empresa                     | lo visible (alcance)                   | lo visible                    |
| Enlace de calendario propio (ICS)¹¹  | sí (todo)                        | sí (sus clientes, también lo interno)   | sí (sus clientes, también lo interno)  | sí (solo compartido)                         | sí (solo compartido, alcance)          | sí (solo compartido)          |
| Calendario del despacho en Google¹¹  | editor (a pedido)                | — (su enlace)                           | — (su enlace)                          | —                                            | —                                      | —                             |
| Calendario de su empresa en Google¹¹ | — (lo ve en el del despacho)     | —                                       | —                                      | lector, si ve toda la empresa                | lector, si ve toda la empresa          | lector, si ve toda la empresa |

**Notas**

1. _U operativo_: nombre comercial, idioma y logotipo. Servicio, perímetro de la iguala y estado del cliente solo los cambia el `SOCIO_ADMIN`, igual que abrir un cliente nuevo.
2. El cliente ve su razón social, su servicio, **el perímetro de la iguala** (encargos cubiertos y excluidos), su equipo asignado y su logotipo. No ve campos internos.
3. Usuarios del despacho y de los clientes asignados.
4. Usuarios de su empresa y el equipo del despacho asignado (nombre, correo, rol): es la tarjeta "Su Fractional Legal Team".
5. El abogado invita usuarios de cliente a sus clientes; los usuarios del despacho solo los da de alta el `SOCIO_ADMIN`.
6. En tareas con `ladoResponsable` `CLIENTE` o `AMBOS`, el usuario de cliente solo puede cambiar `estado` a `POR_HACER`, `EN_CURSO`, `BLOQUEADA` o `EN_REVISION` (nunca `HECHO`: el despacho la cierra, D18) y marcar o desmarcar puntos del `checklist` (no agregarlos, quitarlos ni reescribirlos). Ningún otro campo, y nada en una tarea ya cerrada.
7. Carga evidencia de una obligación: el archivo es un documento de la obligación (siempre `COMPARTIDO`) y el registro de cumplimiento lo nombra; queda `EN_REVISION` hasta que el despacho la valida. Validar (o rechazar) es exclusivo del despacho, y `validadoPor` solo puede ser quien hace el cambio: nadie firma por otro (D40).
8. Lo que sube un usuario de cliente siempre es `COMPARTIDO` y cae en la carpeta de su cliente, nunca en `Interno`. Sube el archivo de su documento una vez; una versión nueva la sube el despacho. El archivo lo descarga quien ve el documento (D32).
9. Los comentarios de usuarios de cliente siempre son `COMPARTIDO`. La pestaña "Interno" del detalle solo existe para el despacho.
10. Cualquiera manda una sugerencia o avisa de un error, también quien solo lee: no toca datos de ningún cliente. La ve quien la envió y los `SOCIO_ADMIN`; nadie más, ni del despacho ni de su empresa. El servidor fija quién la envió y que nace `NUEVA` sin respuesta; el mensaje, el tipo y los detalles técnicos no cambian después. Solo el `SOCIO_ADMIN` cambia el estado y escribe la respuesta. No pertenece a un cliente (`clienteContexto` solo dice desde dónde se envió), así que no se pierde si la persona deja de tener acceso a ese cliente.
11. Fase 5 (D49 y D50). El calendario del despacho tiene **todos** los clientes, también lo interno: por eso solo lo ven los `SOCIO_ADMIN`; un abogado o asistente ve sus clientes en su enlace personal, igual que en el portal. El de una empresa tiene solo lo compartido y lo ven sus usuarios sin alcance; quien ve algunas unidades usa su enlace, que muestra exactamente su parte. El portal comparte un calendario solo con quien lo pide desde su Agenda, y en cada corrida quita el acceso a quien ya no califica y lo que alguien haya compartido a mano. En Google solo se puede mover una cita del calendario del despacho (regresa al portal); un vencimiento movido allí vuelve a su fecha.

## Reglas que valen para todos

- **Lo que fija el servidor**: quién creó y editó, la versión, la autora de un comentario, quién subió un documento, los ids de archivos de Drive y de eventos de Calendar, el avance de un asunto. Si el dispositivo manda otro valor, la operación se rechaza. Además, el servidor mueve el próximo vencimiento de una obligación cuando se valida o se retira la validación de un periodo (D37); el despacho puede corregirlo a mano.
- **Referencias**: un registro solo apunta a registros vivos del mismo cliente que el usuario pueda ver, y solo puede asignarse a personas con acceso a ese cliente. Una unidad no puede quedar dentro de sí misma.
- **Lo que nunca sale del servidor**: el token del calendario de cada usuario, su cuenta de Firebase, el historial de alcance y las columnas internas del cliente (carpeta de Drive, calendario, modo de IA).
- **Directorio**: cada usuario de cliente ve a "su Fractional Legal Team" (los socios y los abogados asignados) y a sus compañeros (desde el hub, a todos; desde una unidad, al hub y a los de su unidad), solo con nombre, correo y rol. Ve únicamente su propia membresía, salvo el `CLIENTE_ADMIN`, que ve las de su empresa (o de sus unidades).
- **Notificaciones**: cada quien las suyas; las de un cliente desaparecen si pierde el acceso a ese cliente.
- **Avisos y correos (F5)**: un aviso nunca va a quien hizo el cambio, a un usuario inactivo ni sobre un registro que el destinatario no puede ver; el resumen diario de cada quien se arma con lo que esa persona ve, en su idioma, y las respuestas de un cliente van a su abogado. Los correos salen de la cuenta propietaria con el nombre "Empírica Portal".
- **Archivos**: nadie recibe permisos sobre Drive. Se suben y descargan por la API, solo si el documento se ve; se descargan como archivo y nunca se abren dentro del portal. El tipo lo decide la extensión y no se acepta nada que un navegador ejecute (HTML, SVG, scripts).
- **Conflictos**: los decide el `SOCIO_ADMIN` o un `ABOGADO` del cliente, con conexión; el asistente solo los ve. Al decidir, los avisos de ese conflicto quedan leídos para todos (D35).

## Campos jurídicamente sensibles

No se resuelven en automático cuando dos ediciones chocan (ver `PLAN.md` § Conflictos): `fechaLimite` y `esFatal` (tareas, trámites y obligaciones), la validación de un cumplimiento (`validadoPor`, `fechaCumplimiento`), `visibilidad`, los permisos y las membresías. Solo el despacho puede editarlos.

## Pruebas obligatorias (Fase 1)

- **Aislamiento**: un usuario del Cliente A no puede leer, contar, inferir ni modificar nada del Cliente B por ningún endpoint, incluidos ids adivinados o manipulados, `clienteId` falsos en la petición y operaciones encoladas.
- **Visibilidad**: ningún registro `INTERNO` llega a un usuario de cliente por `sync.pull`, búsqueda, IA, ICS, correo, reporte ni exportación.
- **Roles**: una prueba por celda de esta matriz.
