# Diseño visual: paleta, logos, tokens, tipografía y ayudas

> **Aprobado el 2 de octubre de 2026: paleta y tipografía A.** Después de aprobarla, el socio envió el archivo maestro en vector; el verde y el durazno se anclaron a sus tintas Pantone oficiales (diferencia con lo aprobado: ΔE OK 0.022, apenas perceptible). Vista previa completa en [`design/paleta-propuesta.html`](design/paleta-propuesta.html) (descárgala y ábrela en el navegador; GitHub muestra el código, no la página).

## 1. De dónde salen los colores

Ningún color está escrito a mano. Se **extraen** de los archivos de marca con scripts y todos los demás se **calculan** con reglas OKLCH escritas en `scripts/brand/build-tokens.ts`. Cambiar un color es cambiar una regla, visible en el historial.

| Color               | sRGB      | OKLCH               | Fuente                                       | Cómo se obtuvo                                                                                                                                |
| ------------------- | --------- | ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Verde institucional | `#11322c` | 29.1 % 0.040 179.6° | **PANTONE 627 C**, archivo maestro en vector | Lab (D50) 18.04 / −14 / 0 convertido a sRGB (adaptación Bradford a D65)                                                                       |
| Durazno             | `#d7a386` | 75.7 % 0.074 50.4°  | **PANTONE 7514 C**, archivo maestro          | Lab 71.37 / 17 / 23 convertido igual                                                                                                          |
| Rubor               | `#f8ece6` | 95.1 % 0.015 48.6°  | 7514 C al 20 %                               | La tinta al mismo 20 % que usa la marca de agua del membrete (medido en su máscara), interpolada como Illustrator interpola una tinta directa |
| Salmón              | `#f4b79f` | 82.9 % 0.079 42.4°  | Titulares de las tres publicaciones          | El valor exacto más repetido en el área del titular; idéntico en las tres                                                                     |

Tres lecturas independientes coinciden con el maestro: la conversión de arriba, el render de poppler (`#10322c` y `#d6a389`) y el PNG del logo que envió el socio (`#1b312b` y `#d0a589`). El membrete, una imagen exportada en Adobe RGB, se había desviado un poco (`#002e29` y `#e5a386`); queda en `brand/palette.json` solo como evidencia.

Hallazgos técnicos del proceso:

1. **El archivo maestro usa tintas directas Pantone** con valores Lab exactos: la fuente más fiel posible.
2. **El membrete está codificado en Adobe RGB (1998)** y su marca de agua usa **transparencia premultiplicada** (`/Matte`): leerlo con gotero da colores equivocados; el script lo resuelve.
3. **El maestro contiene datos de contacto personales** (son firmas de correo): se guarda fuera del repositorio (`brand/private/`) y solo salen de él los colores y los contornos de los logos, con una comprobación que impide que se cuele texto.

## 2. Logos

Contornos en vector, sacados del archivo maestro (`npm run brand:vector`), en verde y en durazno (`brand/logo/`):

| Archivo          | Qué es                                | Uso                                                                                               |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `logo-*.svg`     | Símbolo + "empírica" + "LEGAL LAB"    | Login, reportes PDF, pantalla de bienvenida                                                       |
| `logotipo-*.svg` | "empírica" + "LEGAL LAB", sin símbolo | Barra superior. Es un recorte del logo oficial: confirmar con la agencia que su manual lo permite |
| `simbolo-*.svg`  | Nudo con estrella                     | Ícono de la app instalada, favicon, avatar                                                        |
| `sello-*.svg`    | Sello circular                        | Marca de agua de reportes, estados vacíos                                                         |

En la app, el componente `Logo` dibuja estos contornos con el color del texto, así que se adapta solo al modo claro u oscuro.

## 3. Rampas

Tres familias con los mismos 11 pasos de luminosidad (50 a 950); el valor exacto de la marca ocupa su paso:

| Familia                                          | 50 → 950                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Verde (627 C = 900)                              | `#f0f9f7` `#e2f1ed` `#c8e1db` `#a3cbc2` `#7ab1a6` `#539487` `#34766a` `#215b51` `#17433b` `#11322c` `#031d19` |
| Durazno (rubor = 50, salmón = 300, 7514 C = 400) | `#f8ece6` `#f9e3d7` `#f8cfb9` `#f4b79f` `#d7a386` `#be8260` `#a46641` `#864d2a` `#6a391b` `#512910` `#3a1a06` |
| Neutros cálidos "papel"                          | `#fcf9f8` `#f6f1ef` `#ebe5e2` `#d9d3cf` `#aaa39f` `#867f7b` `#6a6360` `#514c49` `#393432` `#231f1e` `#13100e` |

## 4. Tokens semánticos

| Token                | Claro     | Oscuro    |
| -------------------- | --------- | --------- |
| `background`         | `#fcf9f8` | `#071210` |
| `foreground`         | `#231f1e` | `#f6f1ef` |
| `heading`            | `#11322c` | `#fcf9f8` |
| `card`               | `#ffffff` | `#0d1a17` |
| `muted`              | `#f6f1ef` | `#162421` |
| `muted-foreground`   | `#6a6360` | `#aaa39f` |
| `primary`            | `#11322c` | `#a3cbc2` |
| `primary-foreground` | `#f8ece6` | `#031d19` |
| `primary-hover`      | `#17433b` | `#c8e1db` |
| `accent`             | `#f8ece6` | `#332219` |
| `accent-foreground`  | `#11322c` | `#f4b79f` |
| `accent-strong`      | `#d7a386` | `#d7a386` |
| `border`             | `#ebe5e2` | `#253431` |
| `input`              | `#867f7b` | `#867f7b` |
| `ring`               | `#34766a` | `#7ab1a6` |
| `link`               | `#215b51` | `#a3cbc2` |
| `sidebar`            | `#11322c` | `#010b08` |
| `sidebar-foreground` | `#f8ece6` | `#f6f1ef` |
| `sidebar-accent`     | `#d7a386` | `#d7a386` |

Criterios: el botón primario es verde con texto rubor, como la tarjeta de presentación; el modo oscuro usa superficies "noche" derivadas del verde; los bordes de campos llegan a 3:1 (WCAG 1.4.11); en Tailwind se eliminó la paleta por defecto, así que solo existen estos tokens.

**Contraste: 92 de 92 combinaciones cumplen WCAG 2.2 AA** en claro y en oscuro. Se prueban en cada cambio (`packages/shared/src/brand/tokens.test.ts`).

## 5. Semáforo

Siempre **icono y texto**, nunca solo color. Verde, ámbar y rojo no existen en la marca: siguen la convención universal, con luminosidad y croma calculados para AA.

| Estado               | Claro: icono / fondo / texto      | Oscuro: icono / fondo / texto     |
| -------------------- | --------------------------------- | --------------------------------- |
| Cumplido (success)   | `#0a7e3a` / `#eaf8ec` / `#005725` | `#62bb78` / `#152d1a` / `#b7e5bf` |
| Por vencer (warning) | `#b17000` / `#fdf1e4` / `#653e00` | `#d8953d` / `#34220b` / `#f6d0a6` |
| Vencido (danger)     | `#ab413a` / `#ffefed` / `#782a25` | `#eb8278` / `#3a1d1a` / `#ffc8c1` |
| En revisión (info)   | `#007a6b` / `#e5f9f4` / `#005449` | `#09bfa7` / `#052d27` / `#a5e7d9` |
| No aplica (neutral)  | `#6a6360` / `#f6f1ef` / `#393432` | `#aaa39f` / `#162421` / `#ebe5e2` |

## 6. Gráficas

**Categórica**: 8 tonos anclados en el verde institucional (179.6°, pasos de 45°); el más cercano al durazno usa el tono exacto del 7514 C, así que las dos primeras series son los colores de Empírica. El orden y la luminosidad salieron de una búsqueda que maximiza la separación entre series vecinas, también simulando daltonismo, con croma contenido para un aspecto sobrio.

| Serie | Claro     | Oscuro    |
| ----- | --------- | --------- |
| 1     | `#00a490` | `#00ad97` |
| 2     | `#a04a00` | `#a3521b` |
| 3     | `#384d9f` | `#4f66b4` |
| 4     | `#c96386` | `#d27293` |
| 5     | `#336400` | `#4b7b29` |
| 6     | `#009cc5` | `#0ba4ce` |
| 7     | `#703988` | `#86539d` |
| 8     | `#927300` | `#927300` |

| Comprobación                                          | Claro | Oscuro | Mínimo |
| ----------------------------------------------------- | ----- | ------ | ------ |
| Vecinas con daltonismo (ΔE OKLab ×100)                | 15.6  | 12.3   | 8      |
| Vecinas con visión normal                             | 26.1  | 22.4   | 15     |
| Las tres primeras, todas contra todas, con daltonismo | 16.7  | 16.8   | 8      |
| Contraste de cada serie contra la superficie          | ≥ 3:1 | ≥ 3:1  | 3:1    |

Reglas: orden fijo y el color sigue a la entidad; más de 8 series se agrupan en "Otros"; en dispersión o mapas, máximo 3 series. **Secuencial** (heatmap de compliance): rampa verde de claro a oscuro, invertida en modo oscuro.

## 7. Tipografía (opción A, aprobada)

| Uso                   | Familia                                                                      | Por qué                                                                              |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Títulos               | Cormorant Garamond                                                           | Serif clásica de alto contraste, emparentada con el logotipo                         |
| Interfaz y cifras     | **Montserrat**                                                               | El archivo maestro confirma que es tipografía de la marca ("LEGAL LAB" y las firmas) |
| Rótulos en versalitas | Montserrat, mayúsculas, 0.75 rem, peso 600, espaciado 0.14 em (`label-caps`) | Como "LEGAL LAB"                                                                     |

El logotipo usa Velour Bold, pero se dibuja en vector, así que no hace falta como fuente web. Las fuentes viajan dentro de la app (licencia OFL) para funcionar sin internet.

## 8. Ayudas para aprender a usar el portal

Pedido del socio: que los usuarios aprendan solos.

**Botones "¿Cómo se lee?"** (FYI). Un ícono `ⓘ` junto al título de cada gráfica o indicador complejo (heatmap de compliance, índice de salud, avance por asunto, carga de trabajo). Abre un panel corto con tres partes, siempre en el mismo orden:

1. **Para qué sirve**, en una frase.
2. **Cómo se lee**: qué es cada eje, qué significa cada color o tamaño, con los iconos y textos del semáforo.
3. **Ejemplo**: una celda o barra concreta leída en voz alta ("La celda Fiscal · marzo en ámbar significa…").

Accesible con teclado y lector de pantalla; en ES y EN; los textos viven en los archivos de traducción, no en el código.

**Tour guiado rápido.** Al primer ingreso, 5 o 6 pasos que señalan la barra lateral, el selector de cliente o unidad, "Pendientes de su lado", el semáforo y la búsqueda (⌘K). Se puede saltar y se repite desde **Ayuda → Ver el recorrido**. Distinto para el despacho y para el cliente.

**Instalar en la pantalla de inicio.** El último paso del tour, y luego un aviso discreto que se puede cerrar, piden instalar el portal. Las instrucciones dependen del sistema detectado:

| Sistema                                  | Instrucciones                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| iPhone / iPad (Safari)                   | Botón **Compartir** → **Agregar a inicio**, con ilustración del ícono. En otro navegador de iOS, indica abrir el portal en Safari |
| Android (Chrome, Edge, Samsung Internet) | Botón **Instalar** que abre el diálogo del sistema; si el sistema no lo ofrece, menú ⋮ → **Instalar app**                         |
| Computadora (Chrome, Edge)               | Ícono de instalar en la barra de direcciones, o menú → **Instalar Empírica Portal**                                               |

Si el portal ya está instalado (se detecta), el aviso no aparece. En iPhone importa más: Safari borra los datos locales de los sitios no instalados tras 7 días sin uso.

## 9. Otros tokens

Radios amplios (controles 10 px, tarjetas 16 px, paneles 24 px), sombras suaves teñidas del verde más oscuro, foco visible de 3 px y animaciones que respetan "reducir movimiento".

## 10. Cómo se cambia algo

1. Nuevos archivos de marca: `npm run brand:vector` (archivo maestro en `brand/private/`) y `npm run brand:palette`.
2. Cambiar una regla: editar `scripts/brand/build-tokens.ts` y correr `npm run brand:tokens` (regenera `tokens.json`, `tokens.css` y la vista previa, e imprime contraste y validación de gráficas).
3. `npm run check`: si el contraste o la paleta de gráficas dejan de cumplir, las pruebas fallan.

## 11. Accesibilidad (WCAG 2.2 AA, Fase 7)

Lo que se prueba en cada cambio:

- **Contraste** de cada par de tokens, en claro y en oscuro (`packages/shared/src/brand/tokens.test.ts`).
- **axe en todas las pantallas**, de los cuatro tipos de usuario, cada una en el tema claro y en el oscuro (`apps/web/e2e/a11y.spec.ts`), y con **los formularios y diálogos abiertos** (`a11y-dialogs.spec.ts`). Incluye el tamaño mínimo de 24 px de botones y enlaces (regla `target-size` de WCAG 2.2).
- **Teclado** (`keyboard.spec.ts`): «Ir al contenido» salta el menú; al cambiar de pantalla el foco pasa al contenido, no se queda en el enlace del menú; un diálogo retiene el foco, se cierra con Esc y lo devuelve al botón que lo abrió; un cliente manda una solicitud solo con el teclado.
- **320 px de ancho** sin desplazamiento horizontal en ninguna pantalla (WCAG 1.4.10): las tablas anchas se desplazan dentro de su caja.

Reglas para una pantalla nueva:

- Un solo título `h1`.
- Una tabla ancha va dentro de un contenedor `relative overflow-x-auto`. Sin `relative`, los textos solo para lectores de pantalla (`sr-only`) escapan del recorte y ensanchan la página; una prueba de convenciones lo exige.
- Los diálogos, con el componente `Dialog` (el `<dialog>` nativo); los menús, con `Popover`.
- Su ruta se agrega a `a11y.spec.ts` y a la lista de 320 px de `keyboard.spec.ts`.
