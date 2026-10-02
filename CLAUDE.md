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
- **F1 en curso**: backend núcleo (ver `docs/PLAN.md` § 11). Al cerrarla: pruebas en verde, resumen y detenerse.

## Comandos

```bash
npm install            # todo el monorepo (npm workspaces)
npm run dev            # portal en http://localhost:5173
npm run check          # formato + lint + tipos + pruebas (igual que el CI)
npm run build          # web (apps/web/dist) y Apps Script (apps/api/build/Code.js)
npm test               # solo pruebas (Vitest, todos los paquetes)
npm run brand:vector   # Pantone y logos desde brand/private/EMPIRICA_FIRMAS.ai (requiere pdftocairo)
npm run brand:palette  # extrae colores de /brand -> brand/palette.json (requiere pdfimages/poppler)
npm run brand:tokens   # tokens.json, tokens.css y docs/design/paleta-propuesta.html
```

Node 22.18 o posterior (corre TypeScript nativo: los scripts `.ts` se ejecutan con `node` directamente).

## Estructura

| Ruta              | Qué es                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/web`        | React 19 + Vite 8 + Tailwind 4. Local-first (Dexie) y PWA a partir de F2                               |
| `apps/api`        | Apps Script en TypeScript; `build.ts` lo empaqueta con esbuild en `build/Code.js`; se sube con clasp 3 |
| `packages/shared` | Código común a web y API: tokens y color (`src/brand`); desde F1, tipos, zod, permisos y contrato      |
| `brand/`          | Logos, membrete y `palette.json` extraída (generada)                                                   |
| `scripts/brand`   | Extracción de paleta y generación de tokens                                                            |
| `docs/`           | Plan y anexos (en español)                                                                             |

## Convenciones

- **Idiomas**: código, identificadores y comentarios en inglés. Interfaz en español de México con traducción completa al inglés (i18next, F2). Documentación en español. Excepción: **pestañas y columnas de la hoja** usan los nombres del modelo de datos del socio (español), sin capa de traducción.
- **TypeScript estricto** (`tsconfig.base.json`): `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (nada de `enum` ni `namespace`: usar objetos `as const` y uniones), imports relativos **con extensión `.ts`**.
- `packages/shared/src` y `apps/api/src` también corren en Apps Script: **sin APIs de Node** fuera de las pruebas (lo vigila ESLint).
- **Colores**: solo tokens. Tailwind no tiene paleta por defecto. Ningún hex se escribe a mano: se cambia la regla en `scripts/brand/build-tokens.ts` y se regenera. Los archivos generados (`palette.json`, `tokens.json`, `tokens.css`) no se formatean con Prettier ni se editan a mano.
- **Accesibilidad**: WCAG 2.2 AA. El semáforo siempre lleva icono y texto. Las pruebas de contraste y de paleta de gráficas son parte del CI.
- **Datos de prueba 100 % ficticios** ("Cliente Demo, S.A. de C.V."). Nunca nombres de clientes reales: los dos pilotos son empresas reales y **sus nombres no se escriben en el repositorio** (es público). Tampoco correos de personas reales: los socios iniciales van en Script Properties (`ADMIN_EMAILS`).
- `brand/private/` (ignorado por git) guarda el archivo maestro de la marca: tiene datos de contacto personales. Solo se publican sus derivados (`spot-colors.json`, `brand/logo/*.svg`).
- **Nada jurídico se inventa** (fundamentos, plazos, fechas): las semillas van marcadas "BORRADOR: validar".
- **Sin métricas de horas** de la iguala en ningún lado.
- Pruebas que ejecutan lo que se despliega: el `Code.js` empaquetado se prueba en un sandbox con servicios de Google simulados.

## Decisiones tomadas (registro)

| Fecha      | Decisión                                                                                           | Motivo                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 2026-10-02 | npm workspaces, Node 22                                                                            | Sin herramientas extra para el CI ni para el socio                                   |
| 2026-10-02 | TypeScript 6.0, no 7                                                                               | `typescript-eslint` aún exige `<6.1`                                                 |
| 2026-10-02 | GitHub Pages                                                                                       | El repo es público; Pages en plan gratuito solo admite repos públicos                |
| 2026-10-02 | Sin enlace mágico de Firebase                                                                      | Spark lo limita a 5 correos al día; invitaciones propias por MailApp                 |
| 2026-10-02 | Dos API keys (navegador con dominio; servidor solo Identity Toolkit)                               | Con una sola, la restricción por dominio bloquearía la verificación en el servidor   |
| 2026-10-02 | Paleta extraída por script; membrete en Adobe RGB convertido a sRGB                                | "No inventes hex": todo color sale de `/brand` o de una regla documentada            |
| 2026-10-02 | Publicación desactivada hasta `PAGES_ENABLED=true`                                                 | Que el CI no intente publicar antes de configurar Pages y el dominio                 |
| 2026-10-02 | Verde y durazno = PANTONE 627 C y 7514 C del archivo maestro                                       | El maestro define la marca con Lab exactos; el membrete se había desviado (ΔE 0.022) |
| 2026-10-02 | Clientes con hub y unidades: `Entidades.parentId` + alcance por unidad en cualquier rol de cliente | Piloto corporativo con varias unidades de negocio                                    |
| 2026-10-02 | Resumen diario para todos; tour guiado con instalación por sistema; botones "¿Cómo se lee?"        | Pedido del socio                                                                     |
| 2026-10-02 | Despliegue del backend automatizado (clasp en GitHub Actions) con cuenta propietaria dedicada      | Pregunta 15; recomendación D12                                                       |

## Gotchas del entorno

- Playwright: usar el Chromium preinstalado (`executablePath: '/opt/pw-browsers/chromium'`) si la versión del paquete no coincide; no correr `playwright install`.
- La red del entorno de desarrollo bloquea Drive y los dominios de Google Docs; los archivos de marca se trajeron con el conector de Drive.
