# Puesta en marcha

Guía para alguien que no programa. Todo es gratuito: nunca aceptes pasar Firebase al plan Blaze ni agregar una tarjeta.

## 1. Lo que falta, todo junto

| #   | Qué                             | Cómo                                                 | Se manda por el chat                                          | Estado                                                                                      |
| --- | ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Decidir la cuenta propietaria   | Recomendación: una cuenta gratuita dedicada (paso 1) | Sí: el correo de la cuenta                                    | ✔ 3 oct: cuenta dedicada creada                                                             |
| 2   | Proyecto de Firebase            | Paso 2                                               | Sí: el bloque `firebaseConfig` (no es secreto)                | ✔ 3 oct: proyecto `empirica-portal-d86b4`                                                   |
| 3   | Restringir las API keys         | Paso 3                                               | No                                                            | ✔ 3 oct                                                                                     |
| 4   | Proyecto de Apps Script         | Paso 4                                               | Sí: el ID de la secuencia de comandos                         | ✔ 3 oct: es de la cuenta dedicada; ID en `apps/api/.clasp.json`                             |
| 5   | Script Properties               | Paso 5                                               | **No: son secretos**                                          | `ADMIN_EMAILS` ✔ 3 oct; Firebase ✔ 5 oct (lo confirmó `setup`)                              |
| 6   | API key de Gemini               | Paso 6                                               | **No: es secreto**. Sí: la cuota diaria que muestra AI Studio | ✔ 5 oct: en Script Properties; 7 oct: cifras de cuota (~1,000 a 1,500 al día en Flash-Lite) |
| 7   | URL del aviso de privacidad     | —                                                    | Sí                                                            | ✔ 3 oct: publicado en `https://portal.empirica.mx/privacidad/`                              |
| 8   | DNS en GoDaddy                  | Paso 7, cuando publiquemos                           | —                                                             | ✔ 3 oct: `portal.empirica.mx` apunta a GitHub Pages, con **Enforce HTTPS**                  |
| 9   | Despliegue automático           | Paso 8, una sola vez                                 | **No: es secreto**                                            | ✔ 3 oct: el código ya sube solo a Apps Script                                               |
| 10  | Primera publicación del backend | Paso 9, una sola vez, cuando yo te avise             | Sí: la URL del Web App (no es secreta)                        | ✔ 3 oct: Web App publicado                                                                  |
| 11  | Antes de abrir el portal        | Paso 10, al aprobar la Fase 2                        | Sí: la línea `Revisado: Firebase…` de `setup`                 | ✔ 5 oct: `Revisado: Firebase…` recibido                                                     |
| 12  | Autorizar Calendar y correo     | Paso 11, al fusionar la Fase 5                       | No                                                            | ✔ 5 oct: autorizados; `setup` creó "Empírica · Despacho" y lee la cuota de correo           |
| 13  | Verificaciones de seguridad     | Paso 12, durante la Fase 7                           | Sí: qué quedó listo (nada secreto)                            | Pendiente                                                                                   |

Los secretos (keys y credenciales) nunca van por chat, correo ni al repositorio. Si alguno se pega por error, se borra y se crea otro.

La hoja de cálculo, las carpetas de Drive y los calendarios **no** se crean a mano: los crea el sistema con `setup()`.

---

## 2. Paso a paso

### Paso 1 · Cuenta propietaria dedicada ✔

> ✔ Creada el 3 de octubre de 2026. Su dirección no se escribe en el repositorio (es público): basta con que tú la tengas.

Todo lo del portal (hoja, Drive, Apps Script, Firebase) vivirá en esta cuenta. Que sea **una cuenta nueva y solo para el portal**, no tu cuenta personal:

- tus usuarios no verán tu correo personal como remitente, en "Continuar con Google" ni en calendarios compartidos;
- la credencial del despliegue automático (paso 8) solo tendrá acceso a esa cuenta, no a tus otros proyectos;
- los datos de los clientes quedan separados de tu información personal.

Cómo:

1. Abre una ventana de incógnito y entra a <https://accounts.google.com/signup>.
2. Crea la cuenta (por ejemplo `portal.empirica@gmail.com` o el nombre disponible más parecido). Nombre visible: **Empírica Portal**.
3. Activa la **verificación en dos pasos**: <https://myaccount.google.com/security>.
4. Usa esa cuenta en todos los pasos siguientes. Si tienes varias cuentas abiertas, revisa el avatar de arriba a la derecha antes de crear cada cosa.

No hace falta Google Workspace. Solo convendría si un día el portal manda más de 100 correos al día de forma sostenida; el sistema avisa antes.

**Si creaste Firebase o Apps Script antes, con otra cuenta**, pásalos a la dedicada:

- **Firebase** no se rehace (la configuración que me mandaste sigue igual): con la cuenta con la que lo creaste, entra a ⚙ **Configuración del proyecto → Usuarios y permisos → Agregar miembro**, escribe la cuenta dedicada con el rol **Propietario** y acepta la invitación desde la cuenta dedicada. Después, ya con la cuenta dedicada, pon su correo como **correo de asistencia** (paso 2, punto 7). Cuando todo funcione, puedes quitar tu otra cuenta del proyecto.
- **Apps Script** sí se crea de nuevo: entra con la cuenta dedicada, haz el paso 4 y mándame el ID nuevo. El proyecto anterior está vacío; puedes borrarlo.

### Paso 2 · Proyecto de Firebase (plan Spark, gratuito)

1. Entra a <https://console.firebase.google.com> con la cuenta del paso 1 y pulsa **Crear un proyecto**. Nombre: `empirica-portal`. Google Analytics: desactivado.
2. Menú **Compilación → Authentication → Comenzar**. En **Método de acceso** activa:
   - **Correo electrónico/contraseña**: solo el primer interruptor. Deja apagado "Vínculo de correo electrónico (acceso sin contraseña)".
   - **Google**: como correo de asistencia elige la cuenta del paso 1, y guarda.
3. **Authentication → Configuración → Dominios autorizados**: agrega `portal.empirica.mx`.
4. **Authentication → Plantillas**: en cada plantilla de correo cambia el nombre del remitente a **Empírica Portal**.
5. Engrane ⚙ → **Configuración del proyecto → General → Tus apps** → ícono web `</>`. Apodo: `portal-web`. **No** marques Firebase Hosting. Pulsa **Registrar app**.
6. Copia el bloque `firebaseConfig` y mándamelo. ✔ Recibido el 3 de octubre: el proyecto es **`empirica-portal-d86b4`** (Firebase le agregó ese sufijo al nombre).
7. En **Configuración del proyecto → General**, revisa **Nombre público del proyecto** (`Empírica Portal`) y **Correo de asistencia** (la cuenta del paso 1): es lo que los usuarios ven al entrar con Google y en los correos de Firebase.

### Paso 3 · Restringir las API keys (Google Cloud)

1. Entra a <https://console.cloud.google.com/apis/credentials> y elige arriba el proyecto `empirica-portal` (ID `empirica-portal-d86b4`).
2. Abre **Browser key (auto created by Firebase)**:
   - _Restricciones de aplicaciones_: **Sitios web**. Agrega `https://portal.empirica.mx/*`, `https://empirica-portal-d86b4.firebaseapp.com/*`, `http://localhost:5173/*` y `http://localhost:4173/*`. El de `firebaseapp.com` es indispensable: ahí se abren los enlaces de los correos de Firebase (confirmar el correo, restablecer la contraseña) y la ventana de "Continuar con Google"; sin él, el enlace responde `API_KEY_HTTP_REFERRER_BLOCKED` (corregido el 4 de octubre de 2026).
   - _Restricciones de API_: **Restringir clave**. Marca **Identity Toolkit API** y **Token Service API**. Las dos: sin **Token Service API** se puede entrar, pero la sesión no se renueva y, una hora después de entrar, el portal se queda sin conexión.
   - Guarda.
3. **Crear credenciales → Clave de API**. Edítala:
   - Nombre: `portal-servidor`.
   - _Restricciones de aplicaciones_: Ninguna (la usa Apps Script desde los servidores de Google).
   - _Restricciones de API_: solo **Identity Toolkit API**.
   - Guarda y copia la clave: va a Script Properties en el paso 5. **No me la mandes.**

### Paso 4 · Proyecto de Apps Script

1. Entra a <https://script.google.com> → **Nuevo proyecto**. Nombre: `Empírica Portal API`.
2. Engrane ⚙ **Configuración del proyecto** → copia el **ID de la secuencia de comandos** y mándamelo. ✔ Recibido el 3 de octubre: quedó en `apps/api/.clasp.json` (no es secreto: con el ID nadie puede abrir el proyecto si no le diste acceso), así que no hace falta ponerlo en GitHub.
3. Activa la API de Apps Script (la usa el despliegue automático): <https://script.google.com/home/usersettings> → **API de Google Apps Script: Activada**. Hazlo con la misma cuenta dueña del proyecto.
4. No escribas código ahí: lo sube el despliegue automático (paso 8).

El proyecto corre como la cuenta que lo creó: de ella salen los correos y en su Drive viven la hoja y las carpetas. ✔ Confirmado el 3 de octubre: el proyecto es de la cuenta dedicada del paso 1.

### Paso 5 · Script Properties (aquí viven los secretos)

En el editor del proyecto `Empírica Portal API`: ⚙ **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**:

| Propiedad                 | Valor                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVER_API_KEY` | La clave `portal-servidor` del paso 3                                                          |
| `FIREBASE_PROJECT_ID`     | `empirica-portal-d86b4`                                                                        |
| `GEMINI_API_KEY`          | La clave del paso 6                                                                            |
| `ADMIN_EMAILS`            | Los correos de los dos socios titulares, separados por coma: serán los `SOCIO_ADMIN` iniciales |

Guarda. Estos valores no aparecen en el repositorio ni en el navegador.

### Paso 6 · API key de Gemini

1. Entra a <https://aistudio.google.com/apikey> con la cuenta del paso 1 → **Crear clave de API** → proyecto `empirica-portal` (ID `empirica-portal-d86b4`). Antes, haz el paso 3: así la key del navegador no puede usar Gemini.
2. Pégala en Script Properties como `GEMINI_API_KEY` (paso 5). **No me la mandes.**
3. En AI Studio, abre la página de límites de uso del proyecto y mándame cuántas peticiones por día da para Flash y Flash-Lite.
4. No actives facturación: el modo `METADATA_ONLY` está pensado para el nivel gratuito (`IA.md`).
5. Desde la Fase 6 el portal la usa. No hay que autorizar nada nuevo: al fusionar, la primera petición crea los ajustes `modeloIA` (vacío: el portal elige el modelo), `limiteDiarioIA` (1000: el aviso al 80 %) y `pesosSalud`. Si AI Studio muestra otra cifra diaria para tu proyecto, cambia `limiteDiarioIA` en la pestaña `Config`.
6. Para comprobar la key (opcional): con el editor de Apps Script cerrado desde antes de fusionar, ábrelo en una ventana de incógnito y ejecuta `setup`. El registro dice `Revisado: Gemini: la clave funciona; el portal usará gemini-3.5-flash-lite.` (o qué falla). No edites ni guardes nada en el editor.

### Paso 7 · Dominio en GoDaddy (cuando publiquemos)

1. Entra a GoDaddy → **Mis productos** → junto a `empirica.mx`, **DNS**.
2. **Agregar nuevo registro**:

   | Tipo  | Nombre   | Valor               | TTL    |
   | ----- | -------- | ------------------- | ------ |
   | CNAME | `portal` | `jorch01.github.io` | 1 hora |

3. Guarda. El cambio puede tardar desde minutos hasta unas horas.
4. En GitHub: **Settings → Pages → Source: GitHub Actions**; **Custom domain**: `portal.empirica.mx` → **Save**; cuando aparezca, marca **Enforce HTTPS**.
5. En **Settings → Secrets and variables → Actions → Variables**, crea `PAGES_ENABLED` = `true`. Te aviso cuándo.

No toques los demás registros: el correo de `empirica.mx` sigue igual.

### Paso 8 · Despliegue automático del backend (una sola vez)

Así, cada cambio aprobado se sube solo a Apps Script, siempre a la misma dirección y solo si todas las pruebas pasaron. Necesitas iniciar sesión una vez con la cuenta del paso 1 y guardar esa credencial en GitHub. Sin instalar nada en tu computadora:

1. En la página del repositorio en GitHub: botón verde **Code → Codespaces → Create codespace on main**. Se abre un editor en el navegador (gratis dentro de las horas mensuales de GitHub).
2. En la terminal de abajo escribe `npx @google/clasp login --no-localhost` y pulsa Enter. Si pregunta `Ok to proceed? (y)`, escribe `y` y Enter.
3. Aparece `🔑 Authorize clasp by visiting this url:` y un enlace muy largo que ocupa varias líneas. **No lo copies a mano** (si copias solo una parte, el navegador no encuentra nada): mantén presionada **Ctrl** (Windows) o **Cmd** (Mac) y haz clic sobre el enlace. Un clic normal no hace nada. Si el editor pregunta si quieres abrir el sitio externo, elige **Abrir**.
4. En la pestaña nueva, elige la **cuenta del paso 1** y pulsa **Permitir**. Quien pide los permisos es "clasp", la herramienta oficial de Google para Apps Script; son amplios sobre esa cuenta, y por eso la cuenta es solo del portal.
5. Al final el navegador muestra un error, **"No se puede acceder a este sitio"**, con una dirección que empieza con `http://localhost:8888/?state=`. **Es lo esperado.** Haz clic en la barra de direcciones y copia la dirección completa (Ctrl+A y Ctrl+C; en Mac, Cmd).
6. Regresa a la pestaña del Codespace. La terminal dice `After authorizing, copy the URL from your browser and paste it here:`: haz clic en la terminal, pega (Ctrl+V o Cmd+V) y pulsa Enter. Debe responder `You are logged in as` seguido del correo de la cuenta del paso 1.
7. Para copiar la credencial sin errores, ábrela en el editor: escribe `code ~/.clasprc.json` y Enter. Se abre una pestaña con el texto: selecciónalo todo y cópialo (Ctrl+A y Ctrl+C).
8. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre: `CLASPRC_JSON`. Valor: lo que copiaste. Guarda.
9. En la misma página, pestaña **Variables → New repository variable**, crea dos:

   | Nombre                 | Valor                                                                |
   | ---------------------- | -------------------------------------------------------------------- |
   | `API_DEPLOY_ENABLED`   | `true` (en minúsculas)                                               |
   | `FIREBASE_WEB_API_KEY` | El `apiKey` del bloque `firebaseConfig` (el que empieza con `AIza…`) |

   `FIREBASE_WEB_API_KEY` no es secreta (va en el navegador), pero no se guarda en el repositorio para que los detectores de secretos de GitHub no marquen el repositorio público.

10. Cierra el Codespace (**Code → Codespaces → ⋯ → Delete**) para que la credencial no quede ahí.
11. Avísame. Desde entonces, cada versión aprobada que llegue a `main` sube sola el código a Apps Script, solo si todas las pruebas pasaron.

**Versiones de Apps Script.** Cada vez que el backend cambia, la publicación crea una versión nueva en Apps Script; si solo cambió el portal o la documentación, no crea ninguna. Apps Script guarda como máximo 200 versiones por proyecto y solo se borran a mano. Desde la versión 180, la ejecución de GitHub muestra un aviso amarillo; en 200 se detiene. Para liberar espacio: abre el proyecto en una ventana de incógnito con la cuenta del paso 1 → en el menú de la izquierda, **Historial del proyecto** → borra las versiones más viejas. La versión publicada no se puede borrar, y no hace falta.

Si algo se traba a la mitad, haz clic en la terminal, pulsa **Ctrl+C** y vuelve a empezar desde el punto 2.

Si algún día quieres retirar este acceso: borra el secreto en GitHub y revoca "clasp" en <https://myaccount.google.com/permissions> con la cuenta del paso 1.

### Paso 9 · Primera publicación del backend (una sola vez, cuando te avise)

**Antes de empezar, comprueba que el código ya llegó.** Abre el proyecto `Empírica Portal API` en <https://script.google.com> con la cuenta del paso 1: debe haber un archivo **`Code`** y, arriba, la lista de funciones debe ofrecer `setup`. Si solo ves `Código.gs` con `myFunction` y "No hay funciones", el código todavía no se ha subido. No es un error tuyo, pero el paso 9 aún no se puede hacer. Revisa:

- que en GitHub existan el secreto `CLASPRC_JSON` y la variable `API_DEPLOY_ENABLED` con el valor `true`, escrita exactamente así (paso 8);
- que la API de Apps Script esté activada con la cuenta del paso 1 (paso 4, punto 3);
- que el **ID de la secuencia de comandos** del proyecto (⚙ Configuración del proyecto) sea el que me mandaste; si creaste otro proyecto, mándame el ID nuevo.

Luego lanza la subida: en GitHub, **Actions → CI y publicación → Run workflow → Run workflow** (rama `main`). En unos dos minutos el paso "Desplegar el backend (Apps Script)" debe quedar en verde; recarga el editor y aparecerá `Code`.

Cuando el código ya esté en Apps Script:

1. Abre una **ventana de incógnito** (Chrome: Ctrl+Shift+N; en Mac, Cmd+Shift+N), entra a <https://script.google.com> **solo** con la cuenta del paso 1 y abre el proyecto `Empírica Portal API`. Hazlo así aunque tu navegador normal ya tenga esa cuenta: Apps Script no admite varias cuentas de Google abiertas a la vez en el mismo navegador. Si hay más de una, al autorizar Google aprueba con una y regresa al editor con otra, y la página dice "No se pudo abrir el archivo en este momento".
2. Arriba, en la lista de funciones, elige **`setup`** y pulsa **Ejecutar**.
3. Google pedirá autorización (es normal: el proyecto es tuyo y no está publicado en ninguna tienda):
   **Revisar permisos** → elige la cuenta del paso 1 → "Google no verificó esta app" → **Configuración avanzada** → **Ir a Empírica Portal API (no seguro)** → **Permitir**.
   Los permisos que pide son exactamente estos: tus hojas de cálculo, tu Drive, conectarse a servicios externos (para verificar las sesiones con Firebase) y programar tareas (el respaldo nocturno).
   Desde la Fase 5 pide además tus calendarios y enviar correo (paso 11): marca «Seleccionar todo».
   El aviso de que Google no verificó la app no es un problema: la verificación es para apps que autorizan otras personas, y esta solo la autoriza la cuenta del paso 1. Los usuarios del portal nunca ven esta pantalla.
   Si después de **Permitir** aparece "No se pudo abrir el archivo en este momento", había otra cuenta abierta: cierra esa pestaña y repite desde el punto 1 en una ventana de incógnito nueva. Los permisos ya quedaron dados; por eso, la segunda vez Google dice que la app "ya tiene acceso" a 4 servicios.
4. Abajo, en el registro de ejecución, debe aparecer `Hoja: https://docs.google.com/…` con lo que se creó: el libro `EMPIRICA_PORTAL_DB`, la carpeta `Empírica Portal` con `Clientes` y `Respaldos`, los dos socios como administradores y el respaldo de las 3:00. Si dice "Aviso: ADMIN_EMAILS está vacío", revisa el paso 5 y vuelve a ejecutar `setup` (puede ejecutarse las veces que sea: solo crea lo que falta).
   `setup` también prueba la configuración de Firebase. Si todo está bien, dice `Revisado: Firebase: proyecto empirica-portal-d86b4; la key del servidor funciona.` Si en lugar de eso dice "Aviso: Falta …" o "Aviso: FIREBASE_SERVER_API_KEY no funciona…", corrige el paso 5 y vuelve a ejecutarlo. Casi siempre es que se pegó la key del navegador en lugar de `portal-servidor`, o que el valor quedó con espacios o comillas.
5. Arriba a la derecha: **Implementar → Nueva implementación** → engrane ⚙ junto a "Seleccionar tipo" → **Aplicación web**:
   - Descripción: `Empírica Portal API`
   - Ejecutar como: **Yo** (la cuenta del paso 1)
   - Quién tiene acceso: **Cualquier usuario**
   - Pulsa **Implementar**.

   "Cualquier usuario" es correcto: la puerta la cuida el propio backend, que pide en cada petición una sesión válida de Firebase y que el correo esté dado de alta en el portal.

6. Copia el **ID de implementación** y créalo en GitHub como variable `APPS_SCRIPT_DEPLOYMENT_ID` (igual que en el paso 8). Es la parte de la URL entre `/s/` y `/exec`. Con eso, cada versión nueva se publica en esta misma dirección, y después de publicar GitHub comprueba que el Web App responde.
7. Copia la **URL de la aplicación web** (termina en `/exec`) y mándamela: no es secreta, el portal la necesita para llamar al backend. Si la abres en el navegador verás `{"ok":true,…}`. ✔ Recibida el 3 de octubre.

**Después de esto, `setup` ya no hace falta para cada versión.** Si una versión nueva trae pestañas o columnas nuevas (como `Sugerencias`, que llegó al aprobar la Fase 2), el backend las agrega solo en la primera petición después de publicarse, sin tocar lo que ya existe (`PLAN.md`, D31). Volver a ejecutar `setup` sigue siendo seguro: solo crea lo que falta.

### Paso 10 · Antes de abrir el portal a los usuarios (al aprobar la Fase 2)

Hasta ahora `portal.empirica.mx` muestra una portada provisional. Cuando apruebes la Fase 2 y se fusione, la portada se sustituye por la pantalla de entrada del portal. Antes, revisa esto (unos 15 minutos, con la cuenta del paso 1):

1. **Confirma la configuración de Firebase en el backend.** En la ventana de incógnito del paso 9, ejecuta `setup` otra vez y mándame la línea que empieza con `Revisado: Firebase` (o el aviso, si sale otro). No cambia nada de lo que ya existe.
2. **Firebase → Authentication → Método de acceso**: deben estar activos **Correo electrónico/contraseña** y **Google** (paso 2). En **Configuración → Dominios autorizados** debe estar `portal.empirica.mx` (y `localhost`, que viene de fábrica).
3. **Firebase → Authentication → Plantillas**: deja el texto de fábrica (Firebase lo manda en el idioma de cada usuario, español o inglés, porque el portal se lo indica); solo revisa que el remitente diga **Empírica Portal** (paso 2, punto 4).
4. **Pantalla de Google al "Continuar con Google".** En <https://console.cloud.google.com>, con el proyecto `empirica-portal-d86b4`, menú **Google Auth Platform** (antes se llamaba "Pantalla de consentimiento de OAuth"):
   - **Público** (_Audience_): el estado de publicación debe ser **En producción**. Si dice **Prueba**, pulsa **Publicar app**: en modo de prueba solo pueden entrar con Google las cuentas que agregues a mano como "usuarios de prueba". El portal solo pide nombre y correo, así que no hace falta pasar por la verificación de Google para publicarla.
   - **Desarrollo de la marca** (_Branding_): nombre de la app **Empírica Portal**; correo de asistencia, la cuenta del paso 1; página principal `https://portal.empirica.mx`; política de privacidad `https://portal.empirica.mx/privacidad/`; en dominios autorizados, agrega `empirica.mx` (`firebaseapp.com` ya aparece). Guarda.
   - Opcional, cuando quieras: **verificación de la marca**. Sin ella, la pantalla de Google muestra la dirección técnica (`empirica-portal-d86b4.firebaseapp.com`) en lugar de "Empírica Portal". Es gratuita; Google pide comprobar en Search Console que `empirica.mx` es tuyo y tarda unos días.
5. **GitHub → Settings → Secrets and variables → Actions → Variables**: deben existir `PAGES_ENABLED` (`true`, paso 7), `FIREBASE_WEB_API_KEY` (paso 8) y `APPS_SCRIPT_DEPLOYMENT_ID` (paso 9). El portal publicado toma de esta última la dirección del backend.
6. Fusiona la propuesta de cambios de la Fase 2 cuando te avise que está lista. En unos 3 minutos GitHub publica el portal y el backend (en **Actions** todo debe quedar en verde).
7. **Prueba con tu cuenta**: abre `https://portal.empirica.mx` y entra con tu correo de socio (uno de `ADMIN_EMAILS`), con Google o creando una contraseña con ese mismo correo (te llegará un correo para confirmarlo). El portal empieza vacío: crea el primer cliente en **Clientes**, agrégale sus unidades e invita en **Usuarios** a una persona de prueba (por ejemplo, otro correo tuyo) para ver el recorrido completo.

**En iPhone o iPad con el portal instalado** (agregado a la pantalla de inicio), la ventana de "Continuar con Google" puede no responder; ahí conviene entrar con correo y contraseña. La solución definitiva queda para la Fase 7 (`PLAN.md`, D29).

### Paso 11 · Calendarios y correos (al fusionar la Fase 5)

La Fase 5 necesita dos permisos nuevos de la cuenta del paso 1: **sus calendarios** (el portal crea y escribe "Empírica · Despacho" y los de los clientes) y **enviar correo como ella** (el resumen diario y las invitaciones, con el nombre "Empírica Portal"). Google exige que esa cuenta los acepte en el editor; nadie más puede hacerlo por ella. Mientras falten, el portal funciona igual: solo los calendarios de Google y los correos esperan, sin errores.

**Antes de empezar, cierra todas las pestañas del editor de Apps Script.** El código lo sube GitHub; si una pestaña del editor quedó abierta desde antes, al guardar cualquier cosa en ella (por ejemplo, agregar un servicio) reemplaza el código nuevo por su copia vieja. Por eso este paso no pide tocar **Servicios** ni ningún archivo: el servicio de Calendar ya viene en el código.

1. Fusiona la propuesta de cambios cuando te avise y espera a que **Actions** quede en verde (unos 3 minutos).
2. Abre una **ventana de incógnito**, entra a <https://script.google.com> solo con la cuenta del paso 1 (como en el paso 9) y abre el proyecto `Empírica Portal API`. Elige **`setup`** y pulsa **Ejecutar**.
3. Google muestra su ventana de permisos (**Revisar permisos** → la cuenta del paso 1 → **Configuración avanzada** → **Ir a Empírica Portal API (no seguro)**). En la lista de permisos, **marca la casilla «Seleccionar todo»** (o, al menos, las de tus calendarios y enviar correo) y pulsa **Continuar**. Google deja conceder solo algunos permisos: lo que quede sin marcar no se concede.
4. Google termina esa ejecución después de pedir los permisos: pulsa **Ejecutar** otra vez.
5. El registro debe decir `Creado: calendario de Google "Empírica · Despacho"` (o, si ya existía, `Revisado: Calendar: el calendario del despacho existe.`) y `Revisado: Correo: quedan … destinatarios hoy.` Si dice `Aviso: Falta el permiso de …`, repite desde el punto 2 y revisa que las casillas queden marcadas. En **Activadores** (el reloj del menú de la izquierda) debe haber tres: `nightly` (3:00), `syncCalendars` (cada 15 minutos) y `dailyDigest` (cada hora: manda el resumen una vez al día, desde las 7:00).
6. Prueba: entra al portal como socio → **Agenda** → **Compartirlo con mi cuenta de Google** → **Abrir en Google Calendar**. En 15 minutos aparece "Empírica · Despacho" con los vencimientos. Mueve una cita en Google Calendar: en 15 minutos o menos el portal la muestra en la nueva hora.

Si alguna vez quieres revisar o quitar estos permisos: <https://myaccount.google.com/permissions> con la cuenta del paso 1 → **Empírica Portal API**.

**La hora del resumen y los días de espera** están en la pestaña `Config` del libro: `horaResumen` (7), `diasEsperaCliente` (3) y `reservaCorreos` (10, los correos que se guardan para invitaciones). Se cambian ahí, en la columna `valor`.

### Paso 12 · Verificaciones de seguridad (Fase 7)

Son las que el checklist de `SEGURIDAD.md` § 6 pide confirmar a ti. Ninguna es un secreto: mándame solo si quedó lista o qué viste.

1. **Verificación en dos pasos.** En <https://myaccount.google.com> → **Seguridad** → **Verificación en 2 pasos** → actívala en la cuenta propietaria y en la cuenta de Google de cada socio. En la propietaria, revisa también **Tus dispositivos** y **Apps de terceros con acceso a tu cuenta**: no debería haber nada que no reconozcas. Dime quién, además de ti, conoce la contraseña de la cuenta propietaria.
2. **GitHub.** En el repositorio → **Settings**:
   - **Advanced Security** (antes "Code security"): activa **Secret scanning** con **Push protection**, y **Dependabot alerts**.
   - **Rules** → **Rulesets** → **New branch ruleset**: nombre `main`, **Enforcement status: Active**, en **Target branches** agrega la rama predeterminada; marca **Restrict deletions**, **Block force pushes** y **Require status checks to pass**, y agrega los checks **Pruebas** y **Pruebas en el navegador**. No marques que exija aprobaciones de otra persona: tú fusionas tus propios PR.
3. **Key de Gemini.** En <https://console.cloud.google.com> con la cuenta propietaria → proyecto `empirica-portal` → **APIs y servicios** → **Credenciales** → abre la key que creaste en el paso 6 → **Restricciones de API** → **Restringir clave** → marca solo **Generative Language API** → **Guardar**. En **Restricciones de aplicaciones** deja **Ninguna**: la usa el servidor de Apps Script, que no tiene una dirección fija.
4. **Firebase.** En <https://console.firebase.google.com> → proyecto → **Authentication** → **Configuración**:
   - **Acciones del usuario**: confirma que **Protección contra la enumeración de correos** esté activada (en proyectos nuevos viene así).
   - **Dominios autorizados**: deja `portal.empirica.mx` y los dos de Firebase (`…firebaseapp.com` y `…web.app`); quita `localhost`, que solo sirve para programar en una computadora.
5. **Respaldos.** En Google Drive de la cuenta propietaria → **Empírica Portal** → **Respaldos** → abre la copia más reciente (su nombre lleva la fecha): debe abrir y tener los datos de la noche anterior, por ejemplo tus clientes en la pestaña `Clientes`. No la edites. `OPERACION.md` explica cómo restaurar una.
6. **iPhone y Android.** Al cerrar la fase te dejo una lista corta: instalar el portal, usarlo en modo avión y entrar con Google desde la app instalada.
7. **Outlook** (si alguien lo usa). En Outlook → **Calendario** → **Agregar calendario** → **Suscribirse desde la web** → pega el enlace personal del portal (**Agenda** → **Tu calendario**). Dime si lo acepta y muestra las fechas.
8. **Opcional: archivos grandes.** Sube a un documento un archivo de unos 30 MB (por ejemplo, un PDF escaneado o un ZIP) y dime si el portal lo acepta. Si pasa, se puede subir el tope de 10 MB (`Config.mbMaxArchivo`).
9. **Entrar de verdad, después de publicar.** Desde esta fase cada página lleva una política que solo deja cargar lo del portal y lo del inicio de sesión de Google (`SEGURIDAD.md` § 3). Aquí no puedo probar el inicio de sesión real de Google, así que, cuando la fusión se publique, abre `https://portal.empirica.mx` en una ventana de incógnito y entra con **Continuar con Google**; en otra, con correo y contraseña. Si algo no abre o se queda en blanco, dime qué viste o manda un error desde **Sugerencias o errores**: el reporte dice qué bloqueó la política.

### Actualizar el aviso de privacidad

El portal publica el aviso en `https://portal.empirica.mx/privacidad/` (la portada lo enlaza) con el texto exacto de `apps/web/src/legal/aviso-de-privacidad.txt`; una prueba compara la página con ese archivo palabra por palabra. Para cambiarlo, reemplaza el archivo con el texto nuevo, respetando su formato:

- la primera línea es el título;
- `I.`, `II.`… son las secciones, y `a)`, `b)`… sus incisos;
- las líneas con sangría de cuatro espacios son viñetas;
- en la tabla, las columnas se separan con tabuladores.

Al fusionar el cambio, la página se actualiza sola.

---

## 3. Desarrollo local

```bash
npm install          # dependencias de todo el monorepo
npm run dev          # portal en http://localhost:5173 (contra el backend publicado)
npm run dev:mock     # portal con datos ficticios y el backend real en tu computadora, sin cuentas
npm run check        # formato, lint, tipos y pruebas (lo mismo que el CI)
npm run test:e2e     # pruebas en el navegador (Chromium) sobre el modo de demostración
npm run build        # compila el portal y el Apps Script
npm run brand:tokens # regenera tokens y vista previa tras cambiar una regla de color
npm run brand:icons  # regenera los íconos de la app desde los tokens y el símbolo
```

`npm run test:e2e` usa el Chromium de Playwright (`npx playwright install chromium` la primera vez). Si ya tienes otro Chromium, indícalo con `CHROMIUM_PATH=/ruta/al/chrome`.
