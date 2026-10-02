# Puesta en marcha

Guía para alguien que no programa. Todo es gratuito: nunca aceptes pasar Firebase al plan Blaze ni agregar una tarjeta.

## 1. Lo que falta, todo junto

| #   | Qué                               | Cómo                                                 | Se manda por el chat                                          |
| --- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Decidir la cuenta propietaria     | Recomendación: una cuenta gratuita dedicada (paso 1) | Sí: el correo de la cuenta                                    |
| 2   | Proyecto de Firebase              | Paso 2                                               | Sí: el bloque `firebaseConfig` (no es secreto)                |
| 3   | Restringir las API keys           | Paso 3                                               | No                                                            |
| 4   | Proyecto de Apps Script           | Paso 4                                               | Sí: el ID de la secuencia de comandos                         |
| 5   | Script Properties                 | Paso 5                                               | **No: son secretos**                                          |
| 6   | API key de Gemini                 | Paso 6                                               | **No: es secreto**. Sí: la cuota diaria que muestra AI Studio |
| 7   | URL del aviso de privacidad       | —                                                    | Sí                                                            |
| 8   | DNS en GoDaddy                    | Paso 7, cuando publiquemos                           | —                                                             |
| 9   | Despliegue automático del backend | Paso 8, una sola vez                                 | **No: es secreto**                                            |

Los secretos (keys y credenciales) nunca van por chat, correo ni al repositorio. Si alguno se pega por error, se borra y se crea otro.

La hoja de cálculo, las carpetas de Drive y los calendarios **no** se crean a mano: los crea el sistema con `setup()`.

---

## 2. Paso a paso

### Paso 1 · Cuenta propietaria dedicada (recomendado)

Todo lo del portal (hoja, Drive, Apps Script, Firebase) vivirá en esta cuenta. Que sea **una cuenta nueva y solo para el portal**, no `enlilh@gmail.com`:

- tus usuarios no verán tu correo personal como remitente, en "Continuar con Google" ni en calendarios compartidos;
- la credencial del despliegue automático (paso 8) solo tendrá acceso a esa cuenta, no a tus otros proyectos;
- los datos de los clientes quedan separados de tu información personal.

Cómo:

1. Abre una ventana de incógnito y entra a <https://accounts.google.com/signup>.
2. Crea la cuenta (por ejemplo `portal.empirica@gmail.com` o el nombre disponible más parecido). Nombre visible: **Empírica Portal**.
3. Activa la **verificación en dos pasos**: <https://myaccount.google.com/security>.
4. Usa esa cuenta en todos los pasos siguientes. Si tienes varias cuentas abiertas, revisa el avatar de arriba a la derecha antes de crear cada cosa.

No hace falta Google Workspace. Solo convendría si un día el portal manda más de 100 correos al día de forma sostenida; el sistema avisa antes.

### Paso 2 · Proyecto de Firebase (plan Spark, gratuito)

1. Entra a <https://console.firebase.google.com> con la cuenta del paso 1 y pulsa **Crear un proyecto**. Nombre: `empirica-portal`. Google Analytics: desactivado.
2. Menú **Compilación → Authentication → Comenzar**. En **Método de acceso** activa:
   - **Correo electrónico/contraseña**: solo el primer interruptor. Deja apagado "Vínculo de correo electrónico (acceso sin contraseña)".
   - **Google**: como correo de asistencia elige la cuenta del paso 1, y guarda.
3. **Authentication → Configuración → Dominios autorizados**: agrega `portal.empirica.mx`.
4. **Authentication → Plantillas**: en cada plantilla de correo cambia el nombre del remitente a **Empírica Portal**.
5. Engrane ⚙ → **Configuración del proyecto → General → Tus apps** → ícono web `</>`. Apodo: `portal-web`. **No** marques Firebase Hosting. Pulsa **Registrar app**.
6. Copia el bloque `firebaseConfig` y mándamelo.

### Paso 3 · Restringir las API keys (Google Cloud)

1. Entra a <https://console.cloud.google.com/apis/credentials> y elige el proyecto `empirica-portal` arriba.
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
2. Engrane ⚙ **Configuración del proyecto** → copia el **ID de la secuencia de comandos** y mándamelo.
3. Activa la API de Apps Script (la usa el despliegue automático): <https://script.google.com/home/usersettings> → **API de Google Apps Script: Activada**.

### Paso 5 · Script Properties (aquí viven los secretos)

En el editor del proyecto `Empírica Portal API`: ⚙ **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**:

| Propiedad                 | Valor                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVER_API_KEY` | La clave `portal-servidor` del paso 3                                                          |
| `FIREBASE_PROJECT_ID`     | `empirica-portal` (o el id que te dio Firebase)                                                |
| `GEMINI_API_KEY`          | La clave del paso 6                                                                            |
| `ADMIN_EMAILS`            | Los correos de los dos socios titulares, separados por coma: serán los `SOCIO_ADMIN` iniciales |

Guarda. Estos valores no aparecen en el repositorio ni en el navegador.

### Paso 6 · API key de Gemini

1. Entra a <https://aistudio.google.com/apikey> con la cuenta del paso 1 → **Crear clave de API** → proyecto `empirica-portal`.
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
2. En la terminal de abajo escribe `npx @google/clasp login --no-localhost` y pulsa Enter.
3. Abre el enlace que aparece, entra con la cuenta del paso 1, acepta los permisos, copia el código que te da Google y pégalo en la terminal.
4. Escribe `cat ~/.clasprc.json` y copia todo el texto que aparece.
5. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre: `CLASPRC_JSON`. Valor: lo que copiaste. Guarda.
6. Cierra el Codespace (**Code → Codespaces → ⋯ → Delete**) para que la credencial no quede ahí.
7. Avísame: dejo configurados el ID del proyecto y la dirección fija del Web App.

Si algún día quieres retirar este acceso: borra el secreto en GitHub y revoca "clasp" en <https://myaccount.google.com/permissions> con la cuenta del paso 1.

---

## 3. Desarrollo local

```bash
npm install          # dependencias de todo el monorepo
npm run dev          # portal en http://localhost:5173
npm run check        # formato, lint, tipos y pruebas (lo mismo que el CI)
npm run build        # compila el portal y el Apps Script
npm run brand:tokens # regenera tokens y vista previa tras cambiar una regla de color
```
