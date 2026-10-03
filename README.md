# Empírica Portal

Portal de clientes de **Empírica Legal Lab** · _Fractional Legal Team: an external legal team that works as an extension of your business._

Un solo lugar, en tiempo casi real, para que el cliente y el despacho vean tareas conjuntas, trámites, el calendario de cumplimiento, documentos, contratos, solicitudes y reportes. Funciona sin internet (local-first) y sincroniza con Google Sheets.

> **Estado: Fase 1 (backend núcleo) entregada, en revisión; Fase 0 aprobada.** Empieza por [`docs/PLAN.md`](docs/PLAN.md) (resumen de la Fase 1 en la § 14).

|                                     |                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Plan y preguntas abiertas           | [`docs/PLAN.md`](docs/PLAN.md)                                                                                              |
| Qué necesito para arrancar          | [`docs/SETUP.md`](docs/SETUP.md)                                                                                            |
| Permisos por rol                    | [`docs/PERMISOS.md`](docs/PERMISOS.md)                                                                                      |
| Diseño (paleta, tokens, tipografía) | [`docs/DISENO.md`](docs/DISENO.md) · vista previa: [`docs/design/paleta-propuesta.html`](docs/design/paleta-propuesta.html) |
| Límites y cuotas verificados        | [`docs/LIMITES.md`](docs/LIMITES.md)                                                                                        |
| Seguridad · IA                      | [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) · [`docs/IA.md`](docs/IA.md)                                                       |
| Reuso de TSJ Filing                 | [`docs/REUSO_TSJ.md`](docs/REUSO_TSJ.md)                                                                                    |

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5173
npm run check   # formato, lint, tipos y pruebas
```

Stack sin costo: React + Vite + TypeScript, Tailwind, IndexedDB (Dexie), Service Worker; Firebase Auth (Spark); Google Apps Script (TypeScript → esbuild → clasp) sobre Sheets, Drive, Calendar y Docs; Gemini (nivel gratuito, solo desde el servidor); GitHub Pages y GitHub Actions.
