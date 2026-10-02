# Archivos de marca

| Archivo                                                          | Origen                                                                                                                   | Uso                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `private/EMPIRICA_FIRMAS.ai` (**no se sube**)                    | Archivo maestro en vector de la agencia (firmas de correo). Contiene datos de contacto personales, por eso git lo ignora | Fuente oficial de colores (tintas directas Pantone) y de los logos |
| `spot-colors.json`                                               | **Generado** por `npm run brand:vector`                                                                                  | PANTONE 627 C y 7514 C con sus valores Lab y su conversión a sRGB  |
| `logo/*.svg`                                                     | **Generados** por `npm run brand:vector`: solo contornos, sin texto                                                      | Logo, logotipo, símbolo y sello circular, en verde y en durazno    |
| `EmpiricaLab_C1.png`, `EmpiricaLab_C2.png`, `EmpiricaLab_C3.png` | Publicaciones de la marca, 1080 × 1350, sRGB                                                                             | Color exacto de los titulares (salmón)                             |
| `hoja_membretada.pdf`                                            | Hoja membretada oficial. Imagen JPEG en Adobe RGB (1998) con máscara premultiplicada                                     | Opacidad de la marca de agua (20 %) y evidencia de los colores     |
| `palette.json`                                                   | **Generado** por `npm run brand:palette`. No se edita a mano                                                             | Fuente de los tokens (`npm run brand:tokens`)                      |

Orden de regeneración: `npm run brand:vector` → `npm run brand:palette` → `npm run brand:tokens`. Los archivos generados registran el SHA-256 de su fuente.

**Por qué manda el archivo maestro.** Illustrator define la marca con dos tintas directas Pantone con valores Lab exactos. El membrete es una imagen exportada que se desvió ligeramente al convertir sus colores (ΔE OK ≈ 0.022 en el verde y el durazno), así que queda solo como evidencia.

**Tipografías.** El archivo maestro confirma **Montserrat** (la sans de la interfaz) y **Velour Bold** para el logotipo. El logotipo se usa en vector, así que Velour no hace falta como fuente web.
