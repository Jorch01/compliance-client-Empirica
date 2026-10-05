# Límites técnicos y cuotas

**Fecha de verificación: 2 de octubre de 2026.** Agregados el 3 de octubre de 2026: versiones de Apps Script (§ 1), inicio de sesión con Google fuera de Firebase Hosting (§ 4) y la pantalla de consentimiento de Google (§ 4). Agregado el 4 de octubre de 2026: archivos de los documentos (§ 1). **Revisado el 5 de octubre de 2026** para la Fase 5: correo, triggers y Calendar (§ 1 y § 3), con el presupuesto al final.

**Cómo se verificó.** Cada cifra se consultó en la documentación oficial vigente (Google Developers, Firebase, Google AI for Developers, GitHub Docs, WebKit) mediante búsqueda web el día indicado. El entorno de desarrollo bloquea la descarga directa de esas páginas, así que cada cifra se tomó del extracto de la página oficial que devolvió la búsqueda, con su enlace. Antes de la Fase 1 conviene abrir los enlaces y confirmar las cifras marcadas con ⚠, porque Google cambia algunas sin aviso.

Leyenda: ✅ confirmado en la página oficial · ⚠ cifra publicada por terceros o que Google muestra por proyecto; hay que confirmarla en la consola con la cuenta del despacho.

---

## 1. Google Apps Script

Fuente: [Quotas for Google Services](https://developers.google.com/apps-script/guides/services/quotas). Las cuotas son **por usuario** y se reinician 24 horas después de la primera petición. Como el Web App se ejecuta **como la cuenta propietaria**, todas las peticiones de todos los usuarios del portal cuentan contra la cuota de esa cuenta.

### Cuotas diarias

| Cuota                                     | Cuenta gratuita (gmail.com) | Google Workspace |     |
| ----------------------------------------- | --------------------------- | ---------------- | --- |
| Destinatarios de correo por día           | 100                         | 1,500            | ✅  |
| Tiempo total de triggers por día          | 90 min                      | 6 h              | ✅  |
| Llamadas URL Fetch por día                | 20,000                      | 100,000          | ✅  |
| Eventos de Calendar creados por día       | 5,000                       | 10,000           | ✅  |
| Documentos (Docs) creados por día         | 250                         | 1,500            | ✅  |
| Hojas de cálculo creadas por día          | 250                         | 3,200            | ✅  |
| Lecturas/escrituras de Properties por día | 50,000                      | 500,000          | ✅  |

### Límites por ejecución

| Límite                                           | Valor                          |     |
| ------------------------------------------------ | ------------------------------ | --- |
| Tiempo por ejecución                             | 6 min                          | ✅  |
| Ejecuciones simultáneas por usuario              | 30                             | ✅  |
| Tamaño de un valor en Properties                 | 9 KB                           | ✅  |
| Respuesta de URL Fetch                           | 50 MB                          | ✅  |
| Cuerpo POST de URL Fetch                         | 50 MB                          | ✅  |
| Cabeceras de URL Fetch                           | 100 por llamada, 8 KB en total | ✅  |
| Largo de URL en URL Fetch                        | 2 KB                           | ✅  |
| Destinatarios por mensaje (cuenta gratuita)      | 50                             | ✅  |
| Triggers por usuario y proyecto                  | 20 (el portal usa 3)           | ✅  |
| Tamaño del cuerpo de un correo (cuenta gratuita) | 200 KB                         | ✅  |
| Adjuntos por correo                              | 25 MB en total                 | ✅  |

### CacheService

Fuente: [Class Cache](https://developers.google.com/apps-script/reference/cache/cache).

| Límite            | Valor                                                                             |     |
| ----------------- | --------------------------------------------------------------------------------- | --- |
| Tamaño por valor  | 100 KB                                                                            | ✅  |
| Largo de la clave | 250 caracteres                                                                    | ✅  |
| Caducidad         | 600 s por defecto; máximo 21,600 s (6 h); es una sugerencia, puede borrarse antes | ✅  |
| Elementos         | 1,000; al pasarse conserva los 900 más lejanos de caducar                         | ✅  |

### Web Apps

Fuente: [Web Apps](https://developers.google.com/apps-script/guides/web) y [Content Service](https://developers.google.com/apps-script/guides/content).

- Acceso `ANYONE_ANONYMOUS` (cualquiera, sin iniciar sesión en Google) y ejecución `USER_DEPLOYING` (como la cuenta propietaria). ✅
- La respuesta se redirige a una URL de un solo uso en `script.googleusercontent.com`; el cliente debe seguir la redirección. ✅
- **Apps Script no permite fijar el código de estado HTTP.** Toda respuesta es 200; el error viaja en el JSON (`{ ok: false, error: { code } }`).

### Versiones y cuentas (verificado el 3 de octubre de 2026)

Fuentes: [Versions](https://developers.google.com/apps-script/guides/versions), [REST Resource: projects.versions](https://developers.google.com/apps-script/api/reference/rest/v1/projects.versions) y [Troubleshooting](https://developers.google.com/apps-script/guides/support/troubleshooting).

| Límite                                   | Valor                                                                                                                                                                    |     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| Versiones por proyecto                   | 200 (para todos los proyectos desde el 1 de junio de 2024). Cada publicación del Web App con `clasp update-deployment` crea una                                          | ✅  |
| Borrar versiones                         | Solo a mano, en el editor (**Historial del proyecto**), y solo las que no usa una implementación activa. La API de Apps Script crea, lee y lista versiones; no las borra | ✅  |
| Varias cuentas de Google en un navegador | No lo admiten ni Apps Script ni los Web Apps. Al autorizar, el editor regresa con otra cuenta y dice "No se pudo abrir el archivo en este momento"                       | ✅  |

### Archivos de los documentos (verificado el 4 de octubre de 2026)

Fuentes: [Class DriveApp](https://developers.google.com/apps-script/reference/drive/drive-app) y [Quotas for Google Services](https://developers.google.com/apps-script/guides/services/quotas).

| Límite                                        | Valor                                                                                                                                                     |     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Archivo creado desde Apps Script (`DriveApp`) | 50 MB por archivo; más grande, la llamada falla                                                                                                           | ✅  |
| Petición entrante al Web App (`doPost`)       | Google no publica un tope; la comunidad reporta cerca de 50 MB. El portal manda el archivo en base64 (un tercio más grande) y lo limita a **30 MB** (D32) | ⚠   |
| Tope del portal                               | `Config.mbMaxArchivo` (10 MB por defecto), nunca más de 30 MB; el navegador lo revisa antes de guardar el archivo y el servidor otra vez                  | ✅  |

⚠ Pendiente para F7: subir un archivo de 30 MB al Web App publicado y confirmar que pasa; mientras tanto, el tope de 10 MB queda muy por debajo.

## 2. Google Sheets

Fuente: [Files you can store in Google Drive](https://support.google.com/drive/answer/37603).

| Límite               | Valor                 |     |
| -------------------- | --------------------- | --- |
| Celdas por libro     | 20 millones, o 100 MB | ✅  |
| Caracteres por celda | 50,000                | ✅  |

> El prompt original hablaba de 10 millones de celdas. La cifra vigente es 20 millones (o 100 MB).

## 3. Google Calendar

Fuentes: [Avoid Calendar use limits](https://support.google.com/a/answer/2905486) y [Calendar API usage limits](https://developers.google.com/workspace/calendar/api/guides/quota).

| Límite                  | Valor                                                                                 |     |
| ----------------------- | ------------------------------------------------------------------------------------- | --- |
| Crear calendarios       | no más de 60 en un periodo corto                                                      | ✅  |
| Compartir calendarios   | no con muchos usuarios en poco tiempo (750 acciones de compartir); se repone en horas | ✅  |
| ACL por calendario      | hasta 6,000                                                                           | ✅  |
| Invitaciones a externos | se limita al llegar a ~10,000 en poco tiempo                                          | ✅  |

**API de Calendar (verificado el 5 de octubre de 2026).** Fuente: [Usage limits](https://developers.google.com/workspace/calendar/api/guides/quota). El portal la usa como servicio avanzado de Apps Script (D47).

| Límite                          | Valor                                                                                                   |     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | --- |
| Peticiones por minuto, proyecto | 10,000 (proyectos creados desde el 1 de mayo de 2026; los anteriores conservan su cuota)                | ✅  |
| Peticiones por minuto, usuario  | 600 por usuario y proyecto. Todo corre como la cuenta propietaria: es el tope que importa               | ✅  |
| Al pasarse                      | `403` o `429` `usageLimits`; se reintenta con espera creciente                                          | ✅  |
| Uso del portal                  | Cada 15 minutos, una lectura por calendario y solo las escrituras de lo que cambió: decenas, no cientos | ✅  |

**Calendarios por enlace (ICS).**

| Dato                                         | Valor                                                                                                                                                                                                           |     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Cada cuánto relee Google un calendario así   | Google no lo publica; en sus foros se reportan de varias horas a un día. Por eso los socios y los usuarios de toda la empresa tienen el calendario compartido                                                   | ⚠   |
| Redirección del Web App                      | Apps Script responde con una redirección a `script.googleusercontent.com`; Google y Apple la siguen                                                                                                             | ✅  |
| Outlook                                      | No confirmado que acepte un enlace que redirige: se probará con una cuenta real (F7). La pantalla ofrece Google y Apple                                                                                         | ⚠   |
| Servicio avanzado en el proyecto por defecto | Con el proyecto de Cloud por defecto de Apps Script, activar el servicio activa la API ([Advanced Google services](https://developers.google.com/apps-script/guides/services/advanced)); `setup` avisa si falta | ✅  |

## 4. Firebase Authentication (plan Spark, gratuito)

Fuente: [Firebase Authentication Limits](https://firebase.google.com/docs/auth/limits).

| Envío de correos por Firebase              | Spark         | Blaze (de pago) |     |
| ------------------------------------------ | ------------- | --------------- | --- |
| **Inicio de sesión con enlace por correo** | **5 por día** | 25,000 por día  | ✅  |
| Verificación de correo                     | 1,000 por día | 100,000 por día | ✅  |
| Restablecer contraseña                     | 150 por día   | 10,000 por día  | ✅  |

| Generación de enlaces sin envío (los manda nuestro servidor) | Spark          |     |
| ------------------------------------------------------------ | -------------- | --- |
| Enlaces de verificación                                      | 10,000 por día | ✅  |
| Enlaces de restablecimiento                                  | 1,500 por día  | ✅  |
| Enlaces de inicio de sesión                                  | 20,000 por día | ✅  |

> **Choque con el prompt:** el enlace mágico de Firebase en Spark está limitado a **5 correos al día**, inservible para un despacho. Ver la alternativa en `PLAN.md` § Autenticación.

Verificación del token en el servidor: `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=…` con `{ idToken }`; la API key solo identifica el proyecto, no autoriza ([Identity Toolkit REST](https://cloud.google.com/identity-platform/docs/reference/rest/v1/projects.accounts/lookup)). ✅

### Entrar con Google fuera de Firebase Hosting (verificado el 3 de octubre de 2026)

Fuente: [Best practices for using signInWithRedirect on browsers that block third-party storage access](https://firebase.google.com/docs/auth/web/redirect-best-practices).

- `signInWithRedirect()` usa un `iframe` del dominio `*.firebaseapp.com`; **no funciona en navegadores que bloquean el almacenamiento de terceros** (Safari, también en iPhone; Firefox; y Chrome conforme avanza su bloqueo) cuando la app no está en Firebase Hosting. El portal está en GitHub Pages. ✅
- Opciones de Google para apps fuera de Firebase Hosting: usar `signInWithPopup()` (la que se adoptó, D29), un proxy inverso hacia `firebaseapp.com` (GitHub Pages no lo permite), **servir los archivos del asistente de inicio de sesión desde el propio dominio** (se propone para F7) o implementar el inicio de sesión de Google por separado. ✅
- La ventana emergente puede no responder en una app instalada en la pantalla de inicio de iPhone o iPad: ahí se recomienda correo y contraseña hasta F7. ⚠ Depende de la versión de iOS; se confirmará con un iPhone real.

### Correos de Firebase y la clave del navegador (verificado el 4 de octubre de 2026)

Fuente: el error que devolvió el enlace de confirmación del propio portal y la [guía de Firebase sobre API keys](https://firebase.google.com/docs/projects/api-keys).

- Los enlaces de los correos (confirmar el correo, restablecer la contraseña) abren la página de Firebase en `empirica-portal-d86b4.firebaseapp.com`, que llama a Identity Toolkit con la clave del navegador. Si la clave solo admite `portal.empirica.mx`, responde `API_KEY_HTTP_REFERRER_BLOCKED`. Por eso la clave debe admitir también `https://empirica-portal-d86b4.firebaseapp.com/*` (`SETUP.md`, paso 3). ✅
- Con la **protección contra la enumeración de correos** (activa por omisión en proyectos nuevos), "restablecer contraseña" responde que envió el correo aunque esa dirección no tenga cuenta con contraseña; en ese caso no llega nada. ✅

### Pantalla de consentimiento de Google (verificado el 3 de octubre de 2026)

Fuente: [Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049) y [Get started with the Google Auth Platform](https://support.google.com/cloud/answer/15544987).

- La antigua "Pantalla de consentimiento de OAuth" ahora es **Google Auth Platform**, con las secciones **Desarrollo de la marca** (nombre, logo, correo de asistencia, enlaces y dominios), **Público** (tipo de usuario, usuarios de prueba y estado de publicación) y **Clientes**. ✅
- En estado **Prueba** solo entran las cuentas registradas como usuarios de prueba; **Publicar app** la pasa a **En producción**. ✅
- El nombre de la app aparece en la pantalla de Google solo con la marca verificada; sin verificar, Google muestra el dominio técnico. La verificación de marca es gratuita. ✅

## 5. Gemini API (nivel gratuito)

Fuentes: [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [Models](https://ai.google.dev/gemini-api/docs/models), [Deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [Additional Terms](https://ai.google.dev/gemini-api/terms).

| Dato                                           | Valor                                                                                                    |     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --- |
| Modelos recomendados hoy para proyectos nuevos | Gemini 3.8 Flash y Gemini 3.5 Flash-Lite                                                                 | ✅  |
| Modelos 2.5                                    | Solo para quien ya los usaba; no están retirados                                                         | ✅  |
| Modelos con nivel gratuito (página de precios) | Gemini 3 Flash, 3.1 Flash-Lite, entre otros                                                              | ✅  |
| Peticiones por día, Flash                      | ~20 (reportes de septiembre de 2026)                                                                     | ⚠   |
| Peticiones por día, Flash-Lite                 | ~500 (reportes de terceros)                                                                              | ⚠   |
| Reinicio de la cuota diaria                    | Medianoche, hora del Pacífico (2:00 o 3:00 en Cancún, según el horario de verano de California)          | ✅  |
| Dónde ver la cifra exacta                      | Google la muestra por proyecto en AI Studio; cambia sin aviso (en diciembre de 2025 se recortó de golpe) | ✅  |
| A qué se aplica el límite                      | Al **proyecto**, no a la key: todas las keys del proyecto comparten la misma cuota                       | ✅  |
| Tope de gasto en el nivel gratuito             | No aplica (no hay cobro); el nivel 1 exige vincular facturación                                          | ✅  |
| Modelos en vista previa o experimentales       | Límites más bajos que los estables                                                                       | ✅  |

Las filas sobre proyecto, tope de gasto y vista previa se verificaron el **3 de octubre de 2026** con la página [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) que compartió el socio. Esa página no trae las cifras del nivel gratuito por modelo: Google las muestra solo en AI Studio, por proyecto.

**Términos del nivel gratuito ("Unpaid Services"):** revisores humanos pueden leer, anotar y procesar las entradas y salidas para mejorar los productos (Google las desvincula antes de la cuenta, la API key y el proyecto), y los términos piden expresamente **no enviar información sensible, confidencial ni personal**. ✅ Detalle y consecuencias en `IA.md`.

## 6. Hosting

| Servicio                                                                                                         | Límite                                                                                    |     |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --- |
| GitHub Pages ([límites](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)) | Sitio de hasta 1 GB; 100 GB al mes de tráfico (límite blando); dominio propio con HTTPS   | ✅  |
| GitHub Pages en el plan gratuito                                                                                 | **Solo repositorios públicos** (privados requieren Pro, Team o Enterprise)                | ✅  |
| Firebase Hosting Spark ([cuotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing))                 | 10 GB de almacenamiento; 10 GB al mes de tráfico (~360 MB al día); dominio propio con SSL | ✅  |

## 7. Navegadores (local-first)

Fuente: [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/).

- **iOS/macOS Safari borra IndexedDB, localStorage, el Service Worker y su caché tras 7 días sin interacción con el sitio.** Las apps agregadas a la pantalla de inicio están exentas y llevan su propio contador. ✅
- Safari no implementa Background Sync; la cola se vacía al abrir, al volver a primer plano, al recuperar la red, cada minuto con la app visible y poco después de cada cambio (como en TSJ Filing).
- La app guardada por el Service Worker pesa alrededor de **1 MB** (código, fuentes latinas e íconos; se excluyen las variantes de las fuentes para otros alfabetos). Los datos de cada usuario viven en IndexedDB; con el volumen previsto (decenas de clientes) son unos pocos MB, muy por debajo del espacio que los navegadores dan a cada sitio. ⚠ La cifra exacta varía por navegador; se medirá en F7.

---

## Cómo responde el diseño a estos límites

| Límite                                                                                 | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30 ejecuciones simultáneas para todo el portal (todo corre como la cuenta propietaria) | La interfaz nunca espera al servidor: lee de IndexedDB. `sync.pull` tiene un atajo: si no hay cambios después del cursor del dispositivo, solo lee las pestañas pequeñas (usuarios, membresías, clientes, unidades y configuración). Las escrituras viajan en lote (`sync.push` con varias operaciones). Leer no toma el candado.                                                                                                                                                                                               |
| Latencia de 1–3 s del Web App                                                          | Local-first: lo que el usuario hace se ve al instante; la red solo confirma.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 100 correos al día (cuenta gratuita)                                                   | Un resumen diario por persona (D14, D51), solo si hay algo que contar, más las invitaciones; nunca un correo por hecho (los avisos van a la campana). Se guardan 10 para invitaciones (`Config.reservaCorreos`) y, con menos de 20, los socios reciben un aviso. La cuota cuenta destinatarios: con el piloto (unas 35 personas) el peor día usa ~35. Si crece, el resumen de los clientes puede pasar a semanal                                                                                                                |
| 90 min al día de triggers (cuenta gratuita)                                            | `syncCalendars` cada 15 minutos (96 al día) trae solo lo que cambió en Google (`syncToken`) y escribe solo lo que cambió en el portal: unos segundos por corrida, con tope de 4 minutos (lo pendiente pasa a la siguiente). `dailyDigest` cada hora (24): 23 terminan al instante y una manda el resumen. Más el respaldo nocturno. Estimado: 96 × ~10 s ≈ 16 min, más unos 2 min del resumen y el respaldo: ~20 de 90. ⚠ Se medirá en producción (Apps Script → Ejecuciones). Si el despacho usa Workspace (6 h), sobra margen |
| 200 versiones por proyecto de Apps Script, que solo se borran a mano                   | El CI crea una versión nueva solo si cambió el paquete del backend: la descripción de la implementación lleva la huella del paquete, así que no guarda estado propio. Avisa desde 180 versiones y se detiene en 200 con instrucciones (`apps/api/deploy.ts`). Después de publicar, comprueba que el Web App responde.                                                                                                                                                                                                           |
| Enlace mágico: 5 al día en Spark                                                       | No se usa el envío de Firebase. Ver alternativa en `PLAN.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 20 millones de celdas                                                                  | Columnas acotadas por pestaña; `Bitacora` y `OpsAplicadas` se archivan por año en libros aparte; los respaldos van a otros archivos. Con el volumen previsto (decenas de clientes) el libro usa una fracción mínima.                                                                                                                                                                                                                                                                                                            |
| Una sola escritura a la vez (LockService)                                              | Lotes: un `sync.push` adquiere el candado una vez, valida todo y escribe con `setValues` por pestaña.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 50,000 lecturas y escrituras de Script Properties al día (cuenta gratuita)             | Cada petición lee todas las propiedades de una sola vez (1 lectura) y cada lote de cambios escribe 2 (reserva y publicación de la secuencia); lo prueba `sync.test.ts`. Con 40 usuarios sincronizando cada minuto durante 8 horas son unas 20,000 al día. Si los pilotos crecen, F2 espacia la sincronización en segundo plano.                                                                                                                                                                                                 |
| 50,000 caracteres por celda                                                            | Los campos se validan con topes (texto corto 1,000; texto largo 20,000; JSON 40,000) y las entradas de `Bitacora` se recortan a 20,000; los dobles de prueba de Sheets fallan igual que Sheets si algo se pasa.                                                                                                                                                                                                                                                                                                                 |
| Gemini: ~20 peticiones al día en Flash                                                 | Modelo configurable y autodescubierto (como TSJ Filing), preferencia por Flash-Lite, contador diario, degradación elegante y nada de IA sin conexión.                                                                                                                                                                                                                                                                                                                                                                           |
| Términos del nivel gratuito de Gemini                                                  | Modo `METADATA_ONLY` por defecto con seudonimización; `FULL` solo con key de pago y autorización expresa.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| GitHub Pages gratis solo en repos públicos                                             | El repositorio es público: no contiene secretos (van en Script Properties). Si el despacho prefiere repo privado, la alternativa sin costo es Firebase Hosting (10 GB/mes).                                                                                                                                                                                                                                                                                                                                                     |
| Safari borra datos a los 7 días sin uso                                                | El servidor es la fuente de verdad: lo borrado se vuelve a descargar. Recomendación a usuarios de iPhone: instalar el portal en la pantalla de inicio. La cola de salida se envía en cuanto hay red para no depender de esos 7 días.                                                                                                                                                                                                                                                                                            |
