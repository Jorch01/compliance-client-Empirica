# Empírica Portal

Portal de clientes de **Empírica Legal Lab** · _Fractional Legal Team: an external legal team that works as an extension of your business._

Un solo lugar, en tiempo casi real, para que el cliente y el despacho vean asuntos y tareas conjuntas, trámites, el calendario de cumplimiento, documentos, contratos, solicitudes, la agenda y los reportes mensuales. Funciona sin internet (local-first), se instala en el teléfono y sincroniza con Google Sheets. En `https://portal.empirica.mx`.

> **Estado: fases 0 a 7 aprobadas (7 de octubre de 2026); sigue la entrada en producción con los pilotos.** Empieza por [`docs/PLAN.md`](docs/PLAN.md): cada fase cerrada tiene su resumen y lo que sigue está en la § 23.

|                                                         |                                                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Plan, decisiones y fases                                | [`docs/PLAN.md`](docs/PLAN.md)                                                                                              |
| Puesta en marcha (cuentas, llaves)                      | [`docs/SETUP.md`](docs/SETUP.md)                                                                                            |
| Dar de alta a un cliente                                | [`docs/ARRANQUE.md`](docs/ARRANQUE.md)                                                                                      |
| Operación: respaldos, publicar, qué hacer si algo falla | [`docs/OPERACION.md`](docs/OPERACION.md)                                                                                    |
| Permisos por rol                                        | [`docs/PERMISOS.md`](docs/PERMISOS.md)                                                                                      |
| Diseño y accesibilidad                                  | [`docs/DISENO.md`](docs/DISENO.md) · vista previa: [`docs/design/paleta-propuesta.html`](docs/design/paleta-propuesta.html) |
| Límites y cuotas verificados                            | [`docs/LIMITES.md`](docs/LIMITES.md)                                                                                        |
| Seguridad (y su checklist) · IA                         | [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) · [`docs/IA.md`](docs/IA.md)                                                       |
| Reuso de TSJ Filing                                     | [`docs/REUSO_TSJ.md`](docs/REUSO_TSJ.md)                                                                                    |

## Desarrollo

```bash
npm install
npm run dev:mock  # el portal con datos ficticios y el backend real, sin cuentas: http://localhost:5173
npm run check     # formato, lint, tipos y pruebas (lo mismo que el CI)
npm run test:e2e  # pruebas en el navegador (Chromium); en el CI también en WebKit (Safari)
```

Más comandos en [`CLAUDE.md`](CLAUDE.md). Cada fusión a `main` con todas las pruebas en verde publica el portal y el servidor.

Stack sin costo: React + Vite + TypeScript, Tailwind, IndexedDB (Dexie), Service Worker; Firebase Auth (Spark); Google Apps Script (TypeScript → esbuild → clasp) sobre Sheets, Drive, Calendar y el correo de Google; Gemini (nivel gratuito, solo desde el servidor y con datos seudonimizados); GitHub Pages y GitHub Actions.
