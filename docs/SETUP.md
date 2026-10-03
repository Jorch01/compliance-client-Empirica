# Puesta en marcha

Guía para alguien que no programa. Todo es gratuito: nunca aceptes pasar Firebase al plan Blaze ni agregar una tarjeta.

## 1. Lo que falta, todo junto

| #   | Qué                             | Cómo                                                 | Se manda por el chat                                          | Estado                                                      |
| --- | ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Decidir la cuenta propietaria   | Recomendación: una cuenta gratuita dedicada (paso 1) | Sí: el correo de la cuenta                                    | ✔ 3 oct: cuenta dedicada creada                             |
| 2   | Proyecto de Firebase            | Paso 2                                               | Sí: el bloque `firebaseConfig` (no es secreto)                | ✔ 3 oct: proyecto `empirica-portal-d86b4`                   |
| 3   | Restringir las API keys         | Paso 3                                               | No                                                            | Pendiente (la key del navegador aún no tiene restricciones) |
| 4   | Proyecto de Apps Script         | Paso 4                                               | Sí: el ID de la secuencia de comandos                         | ✔ 3 oct: guardado en `apps/api/.clasp.json`                 |
| 5   | Script Properties               | Paso 5                                               | **No: son secretos**                                          | Pendiente                                                   |
| 6   | API key de Gemini               | Paso 6                                               | **No: es secreto**. Sí: la cuota diaria que muestra AI Studio | Pendiente                                                   |
| 7   | URL del aviso de privacidad     | —                                                    | Sí                                                            | Pendiente                                                   |
| 8   | DNS en GoDaddy                  | Paso 7, cuando publiquemos                           | —                                                             | Más adelante                                                |
| 9   | Despliegue automático           | Paso 8, una sola vez                                 | **No: es secreto**                                            | Pendiente                                                   |
| 10  | Primera publicación del backend | Paso 9, una sola vez, cuando yo te avise             | Sí: la URL del Web App (no es secreta)                        | Más adelante                                                |

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
   - _Restricciones de aplicaciones_: **Sitios web**. Agrega `https://portal.empirica.mx/*`, `http://localhost:5173/*` y `http://localhost:4173/*`.
   - _Restricciones de API_: **Restringir clave**. Marca **Identity Toolkit API** y **Token Service API**.
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

El proyecto corre como la cuenta que lo creó: de ella salen los correos y en su Drive viven la hoja y las carpetas. Si al final eliges otra cuenta propietaria (paso 1), se crea un proyecto nuevo con esa cuenta y me mandas su ID; no cuesta nada rehacerlo antes de publicar.

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

Si algo se traba a la mitad, haz clic en la terminal, pulsa **Ctrl+C** y vuelve a empezar desde el punto 2.

Si algún día quieres retirar este acceso: borra el secreto en GitHub y revoca "clasp" en <https://myaccount.google.com/permissions> con la cuenta del paso 1.

### Paso 9 · Primera publicación del backend (una sola vez, cuando te avise)

**Antes de empezar, comprueba que el código ya llegó.** Abre el proyecto `Empírica Portal API` en <https://script.google.com> con la cuenta del paso 1: debe haber un archivo **`Code`** y, arriba, la lista de funciones debe ofrecer `setup`. Si solo ves `Código.gs` con `myFunction` y "No hay funciones", el código todavía no se ha subido. No es un error tuyo, pero el paso 9 aún no se puede hacer. Revisa:

- que en GitHub existan el secreto `CLASPRC_JSON` y la variable `API_DEPLOY_ENABLED` con el valor `true`, escrita exactamente así (paso 8);
- que la API de Apps Script esté activada con la cuenta del paso 1 (paso 4, punto 3);
- que el **ID de la secuencia de comandos** del proyecto (⚙ Configuración del proyecto) sea el que me mandaste; si creaste otro proyecto, mándame el ID nuevo.

Luego lanza la subida: en GitHub, **Actions → CI y publicación → Run workflow → Run workflow** (rama `main`). En unos dos minutos el paso "Desplegar el backend (Apps Script)" debe quedar en verde; recarga el editor y aparecerá `Code`.

Cuando el código ya esté en Apps Script:

1. Abre el proyecto `Empírica Portal API` en <https://script.google.com> con la cuenta del paso 1.
2. Arriba, en la lista de funciones, elige **`setup`** y pulsa **Ejecutar**.
3. Google pedirá autorización (es normal: el proyecto es tuyo y no está publicado en ninguna tienda):
   **Revisar permisos** → elige la cuenta del paso 1 → "Google no verificó esta app" → **Configuración avanzada** → **Ir a Empírica Portal API (no seguro)** → **Permitir**.
   Los permisos que pide son exactamente estos: tus hojas de cálculo, tu Drive, conectarse a servicios externos (para verificar las sesiones con Firebase) y programar tareas (el respaldo nocturno).
4. Abajo, en el registro de ejecución, debe aparecer `Hoja: https://docs.google.com/…` con lo que se creó: el libro `EMPIRICA_PORTAL_DB`, la carpeta `Empírica Portal` con `Clientes` y `Respaldos`, los dos socios como administradores y el respaldo de las 3:00. Si dice "Aviso: ADMIN_EMAILS está vacío", revisa el paso 5 y vuelve a ejecutar `setup` (puede ejecutarse las veces que sea: solo crea lo que falta).
5. Arriba a la derecha: **Implementar → Nueva implementación** → engrane ⚙ junto a "Seleccionar tipo" → **Aplicación web**:
   - Descripción: `Empírica Portal API`
   - Ejecutar como: **Yo** (la cuenta del paso 1)
   - Quién tiene acceso: **Cualquier usuario**
   - Pulsa **Implementar**.

   "Cualquier usuario" es correcto: la puerta la cuida el propio backend, que pide en cada petición una sesión válida de Firebase y que el correo esté dado de alta en el portal.

6. Copia el **ID de implementación** y créalo en GitHub como variable `APPS_SCRIPT_DEPLOYMENT_ID` (igual que en el paso 8). Con eso, cada versión nueva se publica en esta misma dirección.
7. Copia la **URL de la aplicación web** (termina en `/exec`) y mándamela: no es secreta, el portal la necesita para llamar al backend. Si la abres en el navegador verás `{"ok":true,…}`.

---

## 3. Desarrollo local

```bash
npm install          # dependencias de todo el monorepo
npm run dev          # portal en http://localhost:5173
npm run check        # formato, lint, tipos y pruebas (lo mismo que el CI)
npm run build        # compila el portal y el Apps Script
npm run brand:tokens # regenera tokens y vista previa tras cambiar una regla de color
```
