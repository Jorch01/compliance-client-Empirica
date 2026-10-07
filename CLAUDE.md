# CLAUDE.md · Empírica Portal

Portal de seguimiento para clientes corporativos de Empírica Legal Lab (Fractional Legal Team). El encargo completo está en el prompt del socio (Jorge Clemente); el plan vigente, en `docs/PLAN.md`.

## Cómo trabajamos

- **Por fases** (`docs/PLAN.md` § 11). Al cerrar cada fase: pruebas en verde, resumen, instrucciones para probar, y **detenerse hasta que el socio apruebe**. No avanzar de fase sin su visto bueno.
- Si algo choca con la seguridad, el costo cero o un límite técnico, se dice y se propone alternativa; nunca se resuelve en silencio.
- Cuotas, modelos y términos de Google cambian: verificarlos en la documentación oficial y anotar la fecha en `docs/LIMITES.md`.
- Pedir al socio de una vez todos los datos que hagan falta (cuentas, ids), para que nada quede pendiente (`docs/SETUP.md` § 1). Los secretos nunca se piden por chat: van a Script Properties.
- El repositorio de referencia TSJ Filing (`Jorch01/TSJ_Filing_online`) es **solo de consulta**: no se modifica; si se reutiliza código, se copia aquí con sus pruebas (`docs/REUSO_TSJ.md`).

## Estado

- **F0 aprobada** (2026-10-02): paleta y tipografía A; respuestas del socio en `docs/PLAN.md` § 13.
- **F1 aprobada** (2026-10-03): backend núcleo, resumen en `docs/PLAN.md` § 14.
- **F2 aprobada** (2026-10-04): el portal en el navegador, resumen en `docs/PLAN.md` § 15. Al aprobarla, el socio pidió el botón "Sugerencias o errores" (D30, § 16).
- **F3 aprobada** (2026-10-04): asuntos, tareas, comentarios, documentos (archivos en Drive) y conflictos; resumen en `docs/PLAN.md` § 17.
- **F4 aprobada** (2026-10-04): trámites (tablero y etapas), compliance (matriz, periodos, evidencia y validación), contratos y solicitudes (clasificar y convertir); resumen en `docs/PLAN.md` § 18.
- **F5 aprobada** (2026-10-05): agenda, enlace personal (ICS), calendarios de Google (el del despacho para los socios y uno por cliente), campana, resumen diario e invitaciones por correo; resumen en `docs/PLAN.md` § 19. La cuenta propietaria autorizó Calendar y correo ese día (`docs/SETUP.md`, paso 11).
- **F6 aprobada** (2026-10-07): reportes mensuales (PDF hecho en el navegador), índice de salud e IA seudonimizada; resumen en `docs/PLAN.md` § 20.
- **F7 aprobada** (2026-10-07): rendimiento, sin conexión e iOS (WebKit en el CI), accesibilidad, seguridad, operación y documentación; resumen en `docs/PLAN.md` § 22. Fusionada en `main` (PR #18). Quedan las verificaciones del socio (`docs/SETUP.md`, paso 12).
- **Qué sigue** (propuesta en `docs/PLAN.md` § 23): producción con los pilotos y una Fase 8 de estabilización; esperar a que el socio la confirme antes de empezarla.
- **Backend publicado** (2026-10-03): Web App en la implementación fija de la variable de GitHub `APPS_SCRIPT_DEPLOYMENT_ID`; el CI lo actualiza y lo comprueba (`apps/api/deploy.ts`).
- **Sitio** en `portal.empirica.mx` (GitHub Pages, HTTPS): el portal desde la fusión de F2 (2026-10-04) y el aviso de privacidad en `/privacidad/`. Cada fusión a `main` publica el portal y el backend.

## Comandos

```bash
npm install            # todo el monorepo (npm workspaces)
npm run dev            # portal en http://localhost:5173
npm run dev:mock       # portal con datos ficticios: el backend real (apps/api) dentro de Vite, sin cuentas
npm run check          # formato + lint + tipos + pruebas (igual que el CI)
npm run test:e2e       # Playwright (Chromium) sobre el build de demostración (CHROMIUM_PATH=/opt/pw-browsers/chromium aquí)
npm run test:e2e:webkit # las mismas en WebKit (Safari); aquí no hay WebKit: corren en el CI
npm run build          # web (apps/web/dist) y Apps Script (apps/api/build/Code.js)
npm run size           # peso de la primera carga del portal y su tope (tras build; lo corre el CI)
npm test               # solo pruebas (Vitest, todos los paquetes)
npm run brand:vector   # Pantone y logos desde brand/private/EMPIRICA_FIRMAS.ai (requiere pdftocairo)
npm run brand:palette  # extrae colores de /brand -> brand/palette.json (requiere pdfimages/poppler)
npm run brand:tokens   # tokens.json, tokens.css y docs/design/paleta-propuesta.html
npm run brand:icons    # íconos de la PWA desde tokens y logos.json (Chromium; CHROMIUM_PATH)
```

Node 22.18 o posterior (corre TypeScript nativo: los scripts `.ts` se ejecutan con `node` directamente).

## Estructura

| Ruta              | Qué es                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 19 + Vite 8 + Tailwind 4, local-first (Dexie) y PWA. `src/session` (estados de la sesión), `src/sync` (cola y motor), `src/portal` (marco), `src/pages` (pantallas), `src/ui` (componentes), `src/feedback` (sugerencias y errores) |
| `apps/web/…`      | `sw/` Service Worker (Workbox), `mock/` backend real para `dev:mock` (en `/mock-api/correos`, los correos que habría mandado), `integration/` motor contra el backend real (Vitest), `e2e/` Playwright con axe                            |
| `apps/api`        | Apps Script en TypeScript; `build.ts` lo empaqueta con esbuild en `build/Code.js`; se sube con clasp 3 y `deploy.ts` lo publica (CI)                                                                                                      |
| `apps/api/src`    | `router.ts` (sobre y despacho), `auth.ts`, `actions/` (bootstrap, pull, push), `db/` (hoja, secuencia, historial, escritor con bitácora), `setup.ts`, `maintenance.ts`; `testing/` con los dobles de Google                               |
| `packages/shared` | Código común a web y API: tokens y color (`src/brand`); modelo (`domain`), permisos, sincronización y contrato                                                                                                                            |
| `brand/`          | Logos, membrete y `palette.json` extraída (generada)                                                                                                                                                                                      |
| `scripts/brand`   | Extracción de paleta y generación de tokens                                                                                                                                                                                               |
| `docs/`           | Plan y anexos (en español)                                                                                                                                                                                                                |

## Convenciones

- **Idiomas**: código, identificadores y comentarios en inglés. Interfaz en español de México con traducción completa al inglés (i18next, F2). Documentación en español. Excepción: **pestañas y columnas de la hoja** usan los nombres del modelo de datos del socio (español), sin capa de traducción.
- **TypeScript estricto** (`tsconfig.base.json`): `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (nada de `enum` ni `namespace`: usar objetos `as const` y uniones), imports relativos **con extensión `.ts`**.
- `packages/shared/src` y `apps/api/src` también corren en Apps Script: **sin APIs de Node** fuera de las pruebas (lo vigila ESLint).
- **Colores**: solo tokens. Tailwind no tiene paleta por defecto. Ningún hex se escribe a mano: se cambia la regla en `scripts/brand/build-tokens.ts` y se regenera. Los archivos generados (`palette.json`, `tokens.json`, `tokens.css`, y `apps/web/public/favicon.svg` e `icons/`, de `npm run brand:icons`) no se formatean con Prettier ni se editan a mano.
- **Política de contenido (CSP)**: cada build lleva la de `apps/web/src/security/csp.ts` (no el servidor de desarrollo). Un dominio nuevo (script, conexión, marco) se agrega ahí con su prueba; las pruebas en el navegador fallan si la política rechaza algo. Nada de scripts en línea ni `eval`.
- **Accesibilidad**: WCAG 2.2 AA. El semáforo siempre lleva icono y texto. Las pruebas de contraste y de paleta de gráficas son parte del CI. Una pantalla nueva: un `h1`, tablas anchas en `relative overflow-x-auto`, y su ruta en `e2e/a11y.spec.ts` y `e2e/keyboard.spec.ts` (`docs/DISENO.md` § 11).
- **Datos de prueba 100 % ficticios** ("Cliente Demo, S.A. de C.V."). Nunca nombres de clientes reales: los dos pilotos son empresas reales y **sus nombres no se escriben en el repositorio** (es público). Tampoco correos de personas reales ni el de la cuenta propietaria: los socios iniciales van en Script Properties (`ADMIN_EMAILS`).
- Excepción: el aviso de privacidad (`apps/web/src/legal/aviso-de-privacidad.txt`) publica tal cual el contacto que el despacho ya publica en empirica.mx. Es texto jurídico: solo cambia con el texto que mande el socio, y una prueba compara la página con el archivo palabra por palabra.
- `brand/private/` (ignorado por git) guarda el archivo maestro de la marca: tiene datos de contacto personales. Solo se publican sus derivados (`spot-colors.json`, `brand/logo/*.svg`).
- **Nada jurídico se inventa** (fundamentos, plazos, fechas): las semillas van marcadas "BORRADOR: validar".
- **Sin métricas de horas** de la iguala en ningún lado.
- Pruebas que ejecutan lo que se despliega: el `Code.js` empaquetado se prueba en un sandbox con servicios de Google simulados.
- **Toda escritura a la hoja** pasa por `SheetTable`/`Writer` (`apps/api/src/db`): el texto lleva `'` delante (sin fórmulas), cada cambio se numera con la secuencia (reserva y publicación), guarda su historial de alcance y deja rastro en `Bitacora`. Nunca `setValues` directo desde una acción.
- **Permisos en un solo lugar**: `packages/shared/src/permissions`. Una regla nueva va ahí, con su prueba en `permissions.test.ts`; si afecta lo que viaja, también en `apps/api/src/sync.test.ts`.
- Las pruebas del backend usan `createWorld()` (`apps/api/src/testing/harness.ts`): servicios de Google simulados, `setup()` ya corrido y el conjunto ficticio de `@empirica/shared/testing`. Un `Device` simula el navegador que sincroniza.
- Se usa `zod/mini`, no `zod`, siempre como `import * as z from 'zod/mini'`: el `z` con nombre mete todos los idiomas de zod al `Code.js` (pasó de 390 KB a 1 MB; lo vigila ESLint). El `Code.js` debe seguir pequeño. Nada de APIs que Apps Script no tiene (`TextEncoder`, `URL`, `crypto.randomUUID`, `structuredClone`): el sandbox de pruebas no las trae, así que fallan las pruebas antes que producción.

## Decisiones tomadas (registro)

| Fecha      | Decisión                                                                                                                                        | Motivo                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-10-02 | npm workspaces, Node 22                                                                                                                         | Sin herramientas extra para el CI ni para el socio                                      |
| 2026-10-02 | TypeScript 6.0, no 7                                                                                                                            | `typescript-eslint` aún exige `<6.1`                                                    |
| 2026-10-02 | GitHub Pages                                                                                                                                    | El repo es público; Pages en plan gratuito solo admite repos públicos                   |
| 2026-10-02 | Sin enlace mágico de Firebase                                                                                                                   | Spark lo limita a 5 correos al día; invitaciones propias por MailApp                    |
| 2026-10-02 | Dos API keys (navegador con dominio; servidor solo Identity Toolkit)                                                                            | Con una sola, la restricción por dominio bloquearía la verificación en el servidor      |
| 2026-10-02 | Paleta extraída por script; membrete en Adobe RGB convertido a sRGB                                                                             | "No inventes hex": todo color sale de `/brand` o de una regla documentada               |
| 2026-10-02 | Publicación desactivada hasta `PAGES_ENABLED=true`                                                                                              | Que el CI no intente publicar antes de configurar Pages y el dominio                    |
| 2026-10-02 | Verde y durazno = PANTONE 627 C y 7514 C del archivo maestro                                                                                    | El maestro define la marca con Lab exactos; el membrete se había desviado (ΔE 0.022)    |
| 2026-10-02 | Clientes con hub y unidades: `Entidades.parentId` + alcance por unidad en cualquier rol de cliente                                              | Piloto corporativo con varias unidades de negocio                                       |
| 2026-10-02 | Resumen diario para todos; tour guiado con instalación por sistema; botones "¿Cómo se lee?"                                                     | Pedido del socio                                                                        |
| 2026-10-02 | Despliegue del backend automatizado (clasp en GitHub Actions) con cuenta propietaria dedicada                                                   | Pregunta 15; recomendación D12                                                          |
| 2026-10-02 | `zod/mini` para validar en navegador y servidor                                                                                                 | 22 KB en el `Code.js` frente a 454 KB de `zod`                                          |
| 2026-10-02 | `alcanceHist` + `seqAlta` en lugar de `ocultadoEnSeq`                                                                                           | Cubre ocultar, mover, reasignar y borrar sin delatar lo que siempre fue interno         |
| 2026-10-02 | Anexos siguen a su registro; tareas conservan su alcance pero se ocultan bajo asunto interno                                                    | Un usuario de unidad ve los comentarios de lo que le asignaron                          |
| 2026-10-02 | Permisos OAuth explícitos en `appsscript.json`                                                                                                  | El código usa los servicios vía un objeto; la detección automática podría fallar        |
| 2026-10-02 | Primera implementación del Web App a mano; el CI solo actualiza esa                                                                             | La URL nunca cambia y el socio no lee registros del CI                                  |
| 2026-10-03 | Cuenta propietaria: Gmail gratuita dedicada al portal; su dirección no va en el repo                                                            | D12: los usuarios no ven datos personales del socio                                     |
| 2026-10-03 | Versión nueva de Apps Script solo si cambió el backend; comprobación de salud tras publicar                                                     | Apps Script guarda 200 versiones por proyecto y solo se borran a mano (`LIMITES.md`)    |
| 2026-10-03 | Aviso de privacidad propio en `/privacidad/`, con su propio HTML y el texto del socio sin cambios                                               | Pedido del socio; dirección propia, útil también para el consentimiento de Google       |
| 2026-10-03 | F2 sin correos: quien invita comparte el enlace (D26)                                                                                           | Agregar Gmail a Apps Script obliga a reautorizar la cuenta propietaria; se hace en F5   |
| 2026-10-03 | Modo mock = backend real dentro de Vite, no MSW (D27)                                                                                           | Se prueba el código que se despliega; dos ventanas son dos dispositivos                 |
| 2026-10-03 | Rutas con `#` (D28); Google solo con ventana emergente (D29)                                                                                    | GitHub Pages sin reglas; la redirección de Firebase falla fuera de Firebase Hosting     |
| 2026-10-03 | Una base IndexedDB por cuenta; Service Worker que guarda solo la app, nunca la API                                                              | Computadoras compartidas; los datos solo los decide el motor de sincronización          |
| 2026-10-04 | Sugerencias y errores en la pestaña `Sugerencias`, audiencia `own` (D30)                                                                        | Pedido del socio; la ve su autor y los `SOCIO_ADMIN`, sin cliente ni datos de clientes  |
| 2026-10-04 | Pestañas y columnas nuevas se crean solas en la primera petición (`SCHEMA_VERSION`, D31)                                                        | El CI publica sin volver a correr `setup()`; una pestaña faltante no tumba el portal    |
| 2026-10-04 | Archivos: el registro por `sync.push`, el archivo después con `files.upload` (D32)                                                              | Igual sin red; tipo por extensión, nada ejecutable; Drive por cliente, área e `Interno` |
| 2026-10-04 | Borrar un asunto borra sus tareas; restaurarlo las devuelve (D33)                                                                               | Nada suelto en las listas                                                               |
| 2026-10-04 | `Asuntos.avance` solo para el despacho; cada pantalla cuenta las tareas que ve (D34)                                                            | El cliente no deduce tareas internas                                                    |
| 2026-10-04 | Conflictos: deciden `SOCIO_ADMIN` o `ABOGADO` del cliente, en línea (D35)                                                                       | La matriz de permisos                                                                   |
| 2026-10-04 | Periodo = fecha de la regla; `proximoVencimiento` = primer periodo sin validar, lo mueve el servidor (D37)                                      | Historial y pendientes con las columnas del socio                                       |
| 2026-10-04 | Recurrencia: subconjunto de RRULE (mensual o anual, cada N, día 1–28 o último) (D38)                                                            | Fechas que todo mes tiene; F5 lee la misma regla                                        |
| 2026-10-04 | Evidencia = documento de la obligación + registro `EN_REVISION`; `validadoPor` solo quien valida (D40)                                          | El cliente no edita cumplimientos; nadie firma por otro                                 |
| 2026-10-04 | Matriz: color por parte validada (rampa secuencial 1/3/6/7) + número + ícono (D41)                                                              | DISENO.md: nunca el color solo                                                          |
| 2026-10-04 | `Tramites.titulo` nuevo; etapas en `historialEtapas`, plantillas solo del despacho (D42)                                                        | Nombrar el trámite; las plantillas son catálogo interno                                 |
| 2026-10-04 | Una edición se une a la pendiente de su registro solo si nada se encoló después (D45)                                                           | Un campo que nombra un registro nuevo no debe llegar antes que él                       |
| 2026-10-05 | Una sola agenda (`agendaItems`) para Google, el ICS, el resumen y la pantalla (D46)                                                             | Lo mismo en todas partes, siempre con lo que cada quien ve                              |
| 2026-10-05 | Calendario de Google del despacho solo para `SOCIO_ADMIN`; el de un cliente, para quien ve toda la empresa; los demás, su enlace personal (D49) | El del despacho tiene todos los clientes y la matriz limita al abogado a los suyos      |
| 2026-10-05 | Citas movidas en Google regresan; un vencimiento movido vuelve y se avisa (D48)                                                                 | Los plazos solo se cambian en el portal                                                 |
| 2026-10-05 | Enlace personal: secreto que se muestra una vez; el servidor guarda su hash (D50)                                                               | Revocable y sin nada que delatar en la hoja                                             |
| 2026-10-05 | Resumen por trigger horario; 10 correos de reserva; aviso a los socios con menos de 20 (D51)                                                    | 100 destinatarios al día en cuenta gratuita                                             |
| 2026-10-05 | Permisos de Calendar y correo: sin ellos el portal sigue y calendarios y correos esperan; `setup` los vuelve a pedir (`requireAllScopes`) (D54) | La ventana de Google deja conceder solo algunos permisos                                |
| 2026-10-07 | PDF del reporte hecho en el navegador con pdfmake, no plantilla de Docs (D55)                                                                   | Vista previa y PDF salen del mismo documento; sin permisos nuevos; funciona sin red     |
| 2026-10-07 | Reporte = lo que ve un usuario de toda la empresa; uno por cliente y mes; enviado, congelado (D56–D58)                                          | Nada interno; el cliente recibe lo que el abogado revisó                                |
| 2026-10-07 | Índice de salud con `Config.pesosSalud`, igual en Centro de control, inicio del cliente y reporte (D59)                                         | Un número que significa lo mismo para todos                                             |
| 2026-10-07 | IA solo en el servidor, `METADATA_ONLY` con marcadores; modelo autodetectado; aviso al 80 % de `limiteDiarioIA` (D60, D61)                      | Términos de la capa gratuita de Gemini                                                  |
| 2026-10-07 | Sin extracción ni clasificación con IA hasta que el socio decida (D62)                                                                          | Requieren documentos completos o texto libre                                            |
| 2026-10-07 | App y `MIN_APP_VERSION` 0.6.0; los ajustes nuevos de `Config` se crean solos (D63)                                                              | Una app vieja no tiene dónde guardar los reportes                                       |
| 2026-10-07 | Bitácora: se agrega al final sin leerla (`AppendLog`, D64)                                                                                      | Leerla en cada guardado hacía cada uno más lento                                        |
| 2026-10-07 | Avisos leídos, 60 días; sin leer, un año; cada dispositivo los borra con la misma regla (D65)                                                   | La campana y la sincronización leen menos, sin avisar a nadie                           |
| 2026-10-07 | Bitácora del año anterior a un libro propio en `Respaldos` cada 1 de enero (D66)                                                                | El tope de celdas del libro                                                             |
| 2026-10-07 | Cada pantalla, su propio archivo, precargadas en segundo plano; tope de 260 KB a la primera carga en el CI (D67)                                | 312 → 240 KB; que no vuelva a crecer sin darnos cuenta                                  |
| 2026-10-07 | CSP en una `<meta>` de cada página y el portal no arranca dentro de un marco ajeno (D68)                                                        | GitHub Pages no admite cabeceras propias                                                |
| 2026-10-07 | `npm audit` de producción en el CI, falla con alta o crítica (D69)                                                                              | Lo de desarrollo no se publica                                                          |
| 2026-10-07 | En el iPhone instalado, sin respuesta de Google en 15 s, a correo y contraseña; crear contraseña desde el menú de la cuenta (D70)               | La ventana de Google puede no volver dentro de la app instalada                         |
| 2026-10-07 | Pruebas en el navegador también en WebKit, trabajo propio del CI que bloquea la publicación (D71)                                               | iPhone y Mac usan el motor de Safari                                                    |
| 2026-10-07 | axe en todas las pantallas (dos temas) y con formularios abiertos; teclado; 320 px; tablas en `relative overflow-x-auto` (D72)                  | WCAG 2.2 AA en todo el portal                                                           |

## Gotchas del entorno

- Playwright: usar el Chromium preinstalado (`executablePath: '/opt/pw-browsers/chromium'`) si la versión del paquete no coincide; no correr `playwright install`. Aquí no hay WebKit: sus pruebas corren en el CI. El WebKit de Playwright no puede recargar una página sin red (`setOffline` + `reload` → "internal error"), ni servida por el Service Worker: esa prueba se salta en WebKit y en el iPhone se prueba a mano (`docs/SETUP.md`, paso 12.6).
- La red del entorno de desarrollo bloquea Drive y los dominios de Google Docs; los archivos de marca se trajeron con el conector de Drive.
- También bloquea `script.google.com`, `developers.google.com`, `firebase.google.com` y `docs.cloud.google.com`: el Web App se comprueba desde el CI (paso "Publicar en la misma dirección") y la documentación de Google, con búsqueda web.
- **No se edita ni se guarda nada en el editor de Apps Script**: el código lo sube el CI, y guardar desde una pestaña abierta antes lo revierte (pasó al publicar F5). Para Calendar y correo, `setup` en incógnito y «Seleccionar todo» (`docs/SETUP.md`, paso 11).
- Prettier se corre **desde la raíz** del repo: desde `apps/web` no lee `.prettierignore` y reformatea `tokens.css` (generado).
- pdfmake 0.3 (PDF del reporte): en jsdom no acepta las fuentes (otro reino de `Uint8Array`), así que la prueba que renderiza el PDF corre en el entorno `node` (`apps/web/integration/report-pdf.test.ts`); lee WOFF, no WOFF2; `pageBreakBefore` recibe un objeto con consultas, y una fila movida por `dontBreakRows` sigue reportando su página original.
- Reglas nuevas de `eslint-plugin-react-hooks` 7: nada de `setState` síncrono dentro de un efecto (derivar en el render o medir con refs) y nada de `Date.now()` en el render; los archivos de componentes solo exportan componentes (hooks y utilidades van en `.ts`).
