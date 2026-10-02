# Archivos de marca

| Archivo                                                          | Origen                                                                                                                         | Uso                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `EmpiricaLab_C1.png`, `EmpiricaLab_C2.png`, `EmpiricaLab_C3.png` | Publicaciones de la marca (Drive del despacho, agencia Marela), 1080 × 1350, sRGB                                              | Color exacto de los titulares (salmón)                  |
| `hoja_membretada.pdf`                                            | Hoja membretada oficial (Drive del despacho). Imagen JPEG en **Adobe RGB (1998)** con máscara de transparencia premultiplicada | Verde del logotipo, durazno y rubor de la marca de agua |
| `palette.json`                                                   | **Generado** por `npm run brand:palette`. No se edita a mano                                                                   | Fuente de los tokens (`npm run brand:tokens`)           |

`palette.json` registra el SHA-256 de cada archivo fuente: si se reemplaza un logo o el membrete, hay que regenerar la paleta y los tokens, y revisar la vista previa (`docs/design/paleta-propuesta.html`).

**Falta**: el logotipo en vector (SVG o PDF vectorial) y los nombres de las tipografías originales. Se pidieron a la agencia (ver `docs/PLAN.md`, pregunta 13).
