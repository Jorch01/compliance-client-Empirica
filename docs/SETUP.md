# Puesta en marcha

Guía para alguien que no programa. Todo se hace con la **cuenta institucional del despacho** (no con una cuenta personal) y todo es gratuito: nunca aceptes pasar Firebase al plan Blaze ni agregar una tarjeta.

## 1. Lo que necesito de ti, todo junto

### 1a. Respuestas

Las 15 preguntas de `PLAN.md` § 13 (cuenta, dominio, usuarios, alertas, IA, días sin conexión, paleta y tipografía, etc.).

### 1b. Datos que **sí** puedes mandarme por el chat

No son secretos: terminan visibles en el navegador de cualquier usuario.

| Dato                                                                                              | Dónde se obtiene      | Paso |
| ------------------------------------------------------------------------------------------------- | --------------------- | ---- |
| Correo de la cuenta institucional y si es Google Workspace                                        | —                     | 1    |
| Configuración web de Firebase (`apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`) | Consola de Firebase   | 2    |
| ID del proyecto de Apps Script (Script ID)                                                        | Editor de Apps Script | 4    |
| Cuota diaria de Gemini que muestra AI Studio para Flash y Flash-Lite                              | AI Studio             | 6    |
| Dominio definitivo y quién administra el DNS de `empirica.mx`                                     | —                     | 7    |
| Usuarios del despacho: nombre, correo y rol                                                       | —                     | —    |
| URL o texto del aviso de privacidad                                                               | —                     | —    |

### 1c. Secretos: **no me los mandes**; pégalos tú en Script Properties (paso 5)

| Secreto                                                     | Paso |
| ----------------------------------------------------------- | ---- |
| API key de servidor de Firebase (`FIREBASE_SERVER_API_KEY`) | 3    |
| API key de Gemini (`GEMINI_API_KEY`)                        | 6    |

Si alguno se pega por error en un chat, un correo o el repositorio, se borra y se crea otro.

### 1d. Lo que no tienes que crear

La hoja de cálculo, las carpetas de Drive y los calendarios los crea el propio sistema con `setup()` en la Fase 1.

---

## 2. Paso a paso

### Paso 1 · Cuenta institucional

1. Usa (o crea) una cuenta dedicada, por ejemplo `portal@empirica.mx`. Si Empírica tiene Google Workspace, créala ahí: sus cuotas son mucho mayores (`LIMITES.md` § 1).
2. Activa la **verificación en dos pasos** en <https://myaccount.google.com/security>.
3. Usa esa cuenta en todos los pasos siguientes. Si en tu navegador hay varias cuentas abiertas, revisa el avatar de arriba a la derecha antes de crear cada cosa.

### Paso 2 · Proyecto de Firebase (plan Spark, gratuito)

1. Entra a <https://console.firebase.google.com> y pulsa **Crear un proyecto**. Nombre: `empirica-portal`. Google Analytics: desactivado (no se necesita).
2. Menú **Compilación → Authentication → Comenzar**. En **Método de acceso** activa:
   - **Correo electrónico/contraseña**: solo el primer interruptor. Deja apagado "Vínculo de correo electrónico (acceso sin contraseña)": en el plan gratuito solo manda 5 correos al día.
   - **Google**: elige el correo de asistencia y guarda.
3. **Authentication → Configuración → Dominios autorizados**: agrega `portal.empirica.mx` (`localhost` ya viene).
4. Engrane ⚙ → **Configuración del proyecto → General → Tus apps** → ícono web `</>`. Apodo: `portal-web`. **No** marques Firebase Hosting. Pulsa **Registrar app**.
5. Copia el bloque `firebaseConfig` que aparece y mándamelo.

### Paso 3 · Restringir las API keys (Google Cloud)

1. Entra a <https://console.cloud.google.com/apis/credentials> y elige el proyecto `empirica-portal` arriba.
2. Abre **Browser key (auto created by Firebase)**:
   - _Restricciones de aplicaciones_: **Sitios web**. Agrega `https://portal.empirica.mx/*`, `http://localhost:5173/*` y `http://localhost:4173/*`.
   - _Restricciones de API_: **Restringir clave**. Marca **Identity Toolkit API** y **Token Service API**.
   - Guarda.
3. **Crear credenciales → Clave de API**. Edítala:
   - Nombre: `portal-servidor`.
   - _Restricciones de aplicaciones_: Ninguna (la usa Apps Script desde servidores de Google).
   - _Restricciones de API_: solo **Identity Toolkit API**.
   - Guarda y copia la clave: va a Script Properties en el paso 5. **No me la mandes.**

### Paso 4 · Proyecto de Apps Script

1. Entra a <https://script.google.com> → **Nuevo proyecto**. Cámbiale el nombre a `Empírica Portal API`.
2. Engrane ⚙ **Configuración del proyecto** → copia el **ID de la secuencia de comandos** y mándamelo.
3. Activa la API de Apps Script (la necesita `clasp` para subir el código): <https://script.google.com/home/usersettings> → **API de Google Apps Script: Activada**.

### Paso 5 · Script Properties (aquí viven los secretos)

En el editor del proyecto `Empírica Portal API`: ⚙ **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad de secuencia de comandos**:

| Propiedad                 | Valor                                           |
| ------------------------- | ----------------------------------------------- |
| `FIREBASE_SERVER_API_KEY` | La clave `portal-servidor` del paso 3           |
| `FIREBASE_PROJECT_ID`     | `empirica-portal` (o el id que te dio Firebase) |
| `GEMINI_API_KEY`          | La clave del paso 6                             |

Guarda. Estos valores no aparecen en el repositorio ni en el navegador.

### Paso 6 · API key de Gemini

1. Entra a <https://aistudio.google.com/apikey> → **Crear clave de API** → elige el proyecto `empirica-portal`.
2. Pégala en Script Properties como `GEMINI_API_KEY` (paso 5). **No me la mandes.**
3. En AI Studio, abre la página de límites de uso de tu proyecto y mándame cuántas peticiones por día te da para Flash y Flash-Lite.
4. No actives facturación: el modo de IA por defecto (`METADATA_ONLY`) está pensado para el nivel gratuito (`IA.md`).

### Paso 7 · Dominio (cuando publiquemos)

Quien administra el DNS de `empirica.mx` agrega este registro:

| Tipo  | Nombre   | Valor                |
| ----- | -------- | -------------------- |
| CNAME | `portal` | `jorch01.github.io.` |

Después, en GitHub: **Settings → Pages → Source: GitHub Actions**; **Custom domain**: `portal.empirica.mx`; **Enforce HTTPS**. Y en **Settings → Secrets and variables → Actions → Variables**, crea `PAGES_ENABLED` = `true` para que el CI publique. Te aviso cuándo.

### Paso 8 · Subir el backend (Fase 1)

Cuando llegue el momento te dejo un comando único. Necesitarás Node.js 22 LTS (<https://nodejs.org>) y, una sola vez, iniciar sesión con la cuenta institucional (`npx @google/clasp login`). Las credenciales quedan en tu computadora, no en el repositorio.

---

## 3. Desarrollo local

```bash
npm install          # dependencias de todo el monorepo
npm run dev          # portal en http://localhost:5173
npm run check        # formato, lint, tipos y pruebas (lo mismo que el CI)
npm run build        # compila el portal y el Apps Script
npm run brand:tokens # regenera tokens y vista previa tras cambiar una regla de color
```
