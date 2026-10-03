# Seguridad

> **Fase 1: los controles del servidor están implementados y probados** (marcados ✔ en la tabla). Los demás se implementan en la fase indicada; la revisión completa de seguridad es parte de la Fase 7.

## 1. Qué protegemos y de quién

| Activo                                                   | Amenaza principal                                  |
| -------------------------------------------------------- | -------------------------------------------------- |
| Información de cada cliente                              | Que la vea otro cliente (aislamiento multicliente) |
| Notas de estrategia, comentarios y documentos internos   | Que lleguen a un usuario de cliente                |
| Cuenta institucional de Google (Sheets, Drive, Calendar) | Acceso directo de terceros; secretos filtrados     |
| Datos guardados en los dispositivos                      | Robo o pérdida del equipo; navegador compartido    |
| Integridad de plazos y cumplimientos                     | Ediciones simultáneas que pisan un plazo fatal     |

## 2. Diferencia con TSJ Filing: aquí no hay cifrado de extremo a extremo

En TSJ Filing cada usuario cifra **toda** su base con su propio código (AES-GCM con PBKDF2) antes de subirla: la hoja solo guarda un bloque ilegible y nadie más, ni el administrador de la cuenta, puede leerlo.

En el portal eso no es posible, porque el servidor necesita leer cada registro para:

- decidir qué ve cada usuario (permisos y visibilidad por registro);
- mandar recordatorios y resúmenes por correo;
- sincronizar los calendarios y generar el feed ICS;
- generar los reportes PDF y el contexto de la IA.

**Consecuencia**: los datos quedan **legibles en el Google Sheet y en el Drive de la cuenta institucional del despacho**. Quien tenga acceso a esa cuenta puede verlos. Por eso:

- la cuenta propietaria debe ser institucional y dedicada, con verificación en dos pasos obligatoria y con la menor cantidad posible de personas con acceso;
- los usuarios de cliente **nunca** reciben acceso al libro ni a las carpetas: todo pasa por la API;
- la carpeta `Interno` de cada cliente nunca se comparte;
- el despacho debe reflejar este tratamiento en su aviso de privacidad (Ley Federal de Protección de Datos Personales en Posesión de los Particulares).

## 3. Controles

| Control                  | Cómo                                                                                                                                                                                                                                                                                                                              | Fase |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Identidad                | ID token de Firebase revisado primero en el servidor (proyecto, emisor y vencimiento: un token ajeno o vencido no llega a Google) y luego verificado con Identity Toolkit (`accounts:lookup`) en **cada** petición; caché de 5 min como máximo, nunca más allá del vencimiento, bajo el SHA-256 del token (el token no se guarda) | F1 ✔ |
| Correo verificado        | Sin `emailVerified`, no hay acceso                                                                                                                                                                                                                                                                                                | F1 ✔ |
| Lista blanca             | `Usuarios` activo; crear una cuenta en Firebase no da acceso ("Solicita acceso a tu abogado de Empírica"). Desactivar a alguien corta su acceso en la siguiente petición                                                                                                                                                          | F1 ✔ |
| Vinculación de la cuenta | En el primer acceso se fija el `firebaseUid`: otra cuenta con el mismo correo no puede suplantar al usuario                                                                                                                                                                                                                       | F1 ✔ |
| Autorización             | Matriz de `PERMISOS.md` compartida entre frontend y backend; el servidor decide en cada operación, también en las que llegan de la cola sin red                                                                                                                                                                                   | F1 ✔ |
| Aislamiento multicliente | Filtro por `clienteId` en el servidor antes de responder; ids ajenos, inventados u ocultos responden `NOT_FOUND`; suite de pruebas obligatoria                                                                                                                                                                                    | F1 ✔ |
| Visibilidad              | `INTERNO` se filtra en el servidor; lo que cuelga de un asunto interno tampoco sale; el aviso de "bórralo" nunca nombra un registro que siempre fue interno; suite obligatoria sobre la sincronización. ICS, correos, reportes, IA y exportaciones, en sus fases                                                                  | F1 ✔ |
| Columnas internas        | Ids de Drive y Calendar, modo de IA y bitácora de alcance nunca llegan a usuarios de cliente; token de calendario y cuenta de Firebase no salen del servidor                                                                                                                                                                      | F1 ✔ |
| Integridad               | `LockService`, numeración con reserva y publicación (nadie lee una escritura a medias), control de versión, fusión por campo, avisos de conflicto en campos sensibles y operaciones idempotentes (`opId`)                                                                                                                         | F1 ✔ |
| Inyección de fórmulas    | **Todo** texto se escribe en la hoja con `'` delante: nada se interpreta como fórmula y nada se convierte solo en número o fecha. Las pruebas cuentan cero fórmulas escritas                                                                                                                                                      | F1 ✔ |
| Límite de peticiones     | Contador por usuario y minuto en CacheService (120 por defecto, en `Config`); respuesta `RATE_LIMITED`. Cuerpos de más de 2 MB se rechazan                                                                                                                                                                                        | F1 ✔ |
| Auditoría                | `Bitacora`: usuario, acción, registro, antes y después (solo lo que cambió), cliente, `opId` y user agent; también los intentos rechazados por permiso                                                                                                                                                                            | F1 ✔ |
| Respaldo                 | Trigger nocturno (3:00, America/Cancun) que copia el libro a `Empírica Portal/Respaldos` y conserva 30 copias                                                                                                                                                                                                                     | F1 ✔ |
| Secretos                 | Solo en Script Properties: API key de servidor de Firebase, key de Gemini, ids. Nada en el repositorio; el `Code.js` se revisa en las pruebas                                                                                                                                                                                     | F1 ✔ |
| Permisos de la cuenta    | `appsscript.json` declara solo los permisos que usa: hojas, Drive, peticiones externas y triggers                                                                                                                                                                                                                                 | F1 ✔ |
| Despliegue               | Solo desde `main`, solo con todas las pruebas en verde, con la credencial de clasp en un secreto que se borra del equipo del CI al terminar                                                                                                                                                                                       | F1 ✔ |
| API keys                 | Dos keys: la del navegador restringida por dominio (`portal.empirica.mx`, `localhost`) y por API; la del servidor restringida a Identity Toolkit. La del navegador no se guarda en el repositorio (variable de GitHub) y una prueba falla si aparece en el código                                                                 | F1   |
| Correo                   | Destinatarios tomados de la base, nunca de la petición; sin saltos de línea en cabeceras; tope diario (patrón de TSJ)                                                                                                                                                                                                             | F5   |
| Inactividad              | Bloqueo a los 30 min (configurable)                                                                                                                                                                                                                                                                                               | F2   |
| Aviso de privacidad      | Enlace visible en el login                                                                                                                                                                                                                                                                                                        | F2   |
| IA                       | Llamadas solo desde el servidor; modo `METADATA_ONLY` por defecto; nada `INTERNO` en el contexto de usuarios de cliente                                                                                                                                                                                                           | F6   |

## 4. Datos en el dispositivo (local-first)

El portal guarda en el navegador una **réplica parcial**: solo los clientes y registros que el servidor autorizó a ese usuario. El filtro ocurre en el servidor, antes de enviar; el navegador nunca recibe algo que el usuario no pueda ver.

| Medida                       | Detalle                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Borrado al cerrar sesión     | Se vacían todas las tablas locales, salvo que el usuario marque "mantener en este dispositivo" (para equipos del despacho) |
| Revocación                   | Si el servidor informa que se revocó una membresía, ese cliente se borra en la siguiente sincronización                    |
| Días sin validar             | Pasados N días sin contacto con el servidor, hay que volver a iniciar sesión antes de ver datos                            |
| Bloqueo por inactividad      | Pide reautenticación sin borrar lo capturado sin red                                                                       |
| Cifrado en reposo (opcional) | Clave AES-GCM de WebCrypto **no exportable**, guardada en IndexedDB                                                        |

**Alcance real del cifrado local.** Protege contra la lectura casual del disco (alguien que copia la carpeta del navegador o revisa un respaldo del equipo). **No** protege contra un navegador comprometido, una extensión maliciosa o alguien que use la sesión abierta, porque la misma página que descifra para mostrar los datos tiene la clave. Es una capa adicional, no un sustituto del bloqueo de pantalla del equipo.

**Safari (iPhone, iPad, Mac)** borra la base local tras 7 días sin usar el sitio, salvo que el portal esté instalado en la pantalla de inicio. No es un riesgo de confidencialidad (los datos se vuelven a descargar), pero sí puede perder cambios hechos sin red y no enviados; por eso la cola se envía en cuanto hay conexión.

## 5. Repositorio público

El repositorio es público para usar GitHub Pages sin costo. Por diseño no contiene secretos: las keys secretas viven en Script Properties y la configuración pública de Firebase está pensada para ir en el navegador (la protegen las restricciones de la key y la lista blanca, no el secreto). Los logotipos y el membrete de `/brand` son material de marca que ya es público. **Nunca** se suben datos reales de clientes: las semillas y los datos de prueba son 100 % ficticios.
