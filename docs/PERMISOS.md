# Matriz de permisos

> Estado: **propuesta de la Fase 0, pendiente de aprobación.** En la Fase 1 esta matriz se escribe en código (`packages/shared/src/permissions`), la misma para el frontend y el backend, y cada celda se cubre con pruebas automáticas.

## Principios

1. **El servidor decide.** El frontend usa la matriz solo para esconder botones; cada petición se vuelve a autorizar en Apps Script.
2. **Lista blanca.** Tener cuenta en Firebase no da acceso: el usuario debe existir y estar activo en `Usuarios`. Si no, la respuesta es "Solicita acceso a tu abogado de Empírica".
3. **Todo filtra por cliente en el servidor.** Un usuario solo recibe datos de los clientes donde tiene membresía (el `SOCIO_ADMIN`, de todos).
4. **`INTERNO` nunca sale hacia un usuario de cliente**: ni en listados, conteos, búsquedas, contexto de IA, feeds ICS, correos, reportes ni exportaciones.
5. **Un id ajeno se trata como inexistente.** Pedir un registro de otro cliente responde `NOT_FOUND`, igual que un id inventado, para no confirmar que existe.

## Roles

| Rol                   | Lado     | Alcance                                                                               |
| --------------------- | -------- | ------------------------------------------------------------------------------------- |
| `SOCIO_ADMIN`         | Despacho | Todos los clientes, administración y bitácora                                         |
| `ABOGADO`             | Despacho | Clientes donde tiene membresía (asignados)                                            |
| `ASISTENTE`           | Despacho | Como el abogado, sin borrar ni administrar usuarios                                   |
| `CLIENTE_ADMIN`       | Cliente  | Lo compartido de su empresa; invita usuarios (con aprobación del despacho)            |
| `CLIENTE_COLABORADOR` | Cliente  | Como el admin del cliente, sin invitar; puede limitarse a ciertos asuntos o entidades |
| `CLIENTE_LECTURA`     | Cliente  | Solo lectura de lo compartido                                                         |

Un usuario puede tener membresías en varios clientes (por ejemplo, el contador externo de varias empresas) y elige el cliente activo en el header.

## Matriz

C = crear · R = leer · U = editar · D = borrar (lógico, con fecha) · — = sin acceso. "Compartido" = solo registros `COMPARTIDO`. "Alcance" = limitado por la membresía del colaborador.

| Recurso                           | SOCIO_ADMIN                  | ABOGADO                                 | ASISTENTE                              | CLIENTE_ADMIN                   | CLIENTE_COLABORADOR                    | CLIENTE_LECTURA      |
| --------------------------------- | ---------------------------- | --------------------------------------- | -------------------------------------- | ------------------------------- | -------------------------------------- | -------------------- |
| Clientes                          | CRUD                         | R; U operativo¹                         | R; U operativo¹                        | R²                              | R²                                     | R²                   |
| Entidades                         | CRUD                         | CRUD                                    | CRU                                    | R                               | R (alcance)                            | R                    |
| Usuarios                          | CRUD                         | R³                                      | R³                                     | R⁴                              | R⁴                                     | R⁴                   |
| Membresías                        | CRUD                         | R                                       | R                                      | R (su empresa)                  | —                                      | —                    |
| Invitaciones                      | CRUD y aprobar               | C⁵ y aprobar (sus clientes)             | —                                      | C (su empresa, queda pendiente) | —                                      | —                    |
| Asuntos                           | CRUD                         | CRUD                                    | CRU                                    | R compartido                    | R compartido (alcance)                 | R compartido         |
| Tareas                            | CRUD                         | CRUD                                    | CRU                                    | R compartido; U limitado⁶       | R compartido (alcance); U limitado⁶    | R compartido         |
| Trámites                          | CRUD                         | CRUD                                    | CRU                                    | R compartido                    | R compartido (alcance)                 | R compartido         |
| Plantillas de trámite             | CRUD                         | R                                       | R                                      | —                               | —                                      | —                    |
| Obligaciones (compliance)         | CRUD                         | CRUD                                    | CRU                                    | R compartido                    | R compartido (alcance)                 | R compartido         |
| Cumplimientos (evidencia)         | CRUD y validar               | CRU y validar                           | CRU y validar                          | C evidencia⁷; R                 | C evidencia⁷; R (alcance)              | R                    |
| Catálogo de obligaciones          | CRUD                         | R                                       | R                                      | —                               | —                                      | —                    |
| Contratos                         | CRUD                         | CRUD                                    | CRU                                    | R compartido                    | R compartido (alcance)                 | R compartido         |
| Documentos                        | CRUD                         | CRUD                                    | CRU                                    | C⁸; R compartido                | C⁸; R compartido (alcance)             | R compartido         |
| Solicitudes                       | CRUD, clasificar y convertir | CRU, clasificar y convertir             | CRU, clasificar y convertir            | C; R (su empresa)               | C; R (las suyas y su alcance)          | R (su empresa)       |
| Comentarios                       | CRUD                         | C; R (interno y compartido); UD propios | C; R (interno y compartido); U propios | C⁹; R compartido; UD propios    | C⁹; R compartido (alcance); UD propios | R compartido         |
| Eventos de calendario             | CRUD                         | CRUD                                    | CRU                                    | R compartido                    | R compartido (alcance)                 | R compartido         |
| Días inhábiles                    | CRUD                         | R                                       | R                                      | R                               | R                                      | R                    |
| Notificaciones                    | R y marcar leídas (propias)  | igual                                   | igual                                  | igual                           | igual                                  | igual                |
| Avisos de conflicto               | R y resolver                 | R y resolver (sus clientes)             | R                                      | —                               | —                                      | —                    |
| Bitácora                          | R                            | —                                       | —                                      | —                               | —                                      | —                    |
| Reportes                          | CRUD, generar y enviar       | C (generar), R, enviar                  | C (generar), R                         | R (enviados)                    | R (enviados)                           | R (enviados)         |
| Configuración                     | CRUD                         | R (pública)                             | R (pública)                            | R (pública)                     | R (pública)                            | R (pública)          |
| Modo de IA (global y por cliente) | U                            | —                                       | —                                      | —                               | —                                      | —                    |
| Exportar respaldo                 | todo                         | sus clientes                            | sus clientes                           | lo visible de su empresa        | lo visible (alcance)                   | lo visible           |
| Feed ICS propio                   | sí                           | sí                                      | sí                                     | sí (solo compartido)            | sí (solo compartido, alcance)          | sí (solo compartido) |

**Notas**

1. _U operativo_: idioma, logotipo, contacto. Servicio, perímetro de la iguala y estado del cliente solo los cambia el `SOCIO_ADMIN`.
2. El cliente ve su razón social, su servicio, **el perímetro de la iguala** (encargos cubiertos y excluidos), su equipo asignado y su logotipo. No ve campos internos.
3. Usuarios del despacho y de los clientes asignados.
4. Usuarios de su empresa y el equipo del despacho asignado (nombre, correo, rol): es la tarjeta "Su Fractional Legal Team".
5. El abogado invita usuarios de cliente a sus clientes; los usuarios del despacho solo los da de alta el `SOCIO_ADMIN`.
6. En tareas con `ladoResponsable` `CLIENTE` o `AMBOS`, el usuario de cliente solo puede cambiar `estado` (ver la pregunta abierta sobre `HECHO` frente a `EN_REVISION`) y marcar puntos del `checklist`. Ningún otro campo.
7. Carga evidencia de una obligación; queda "en revisión" hasta que el despacho la valida. Validar es exclusivo del despacho.
8. Lo que sube un usuario de cliente siempre es `COMPARTIDO` y cae en la carpeta de su cliente, nunca en `Interno`.
9. Los comentarios de usuarios de cliente siempre son `COMPARTIDO`. La pestaña "Interno" del detalle solo existe para el despacho.

## Campos jurídicamente sensibles

No se resuelven en automático cuando dos ediciones chocan (ver `PLAN.md` § Conflictos): `fechaLimite` y `esFatal` (tareas, trámites y obligaciones), la validación de un cumplimiento (`validadoPor`, `fechaCumplimiento`), `visibilidad`, los permisos y las membresías. Solo el despacho puede editarlos.

## Pruebas obligatorias (Fase 1)

- **Aislamiento**: un usuario del Cliente A no puede leer, contar, inferir ni modificar nada del Cliente B por ningún endpoint, incluidos ids adivinados o manipulados, `clienteId` falsos en la petición y operaciones encoladas.
- **Visibilidad**: ningún registro `INTERNO` llega a un usuario de cliente por `sync.pull`, búsqueda, IA, ICS, correo, reporte ni exportación.
- **Roles**: una prueba por celda de esta matriz.
