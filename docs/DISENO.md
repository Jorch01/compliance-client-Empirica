# Diseño visual: paleta, tokens y tipografía

> **Propuesta pendiente de aprobación.** La vista previa completa (interfaz en claro y oscuro, semáforo, gráficas, tipografías y tabla de contraste) está en [`design/paleta-propuesta.html`](design/paleta-propuesta.html): descárgala y ábrela en el navegador (GitHub muestra el código, no la página).

## 1. De dónde salen los colores

Ningún color está escrito a mano. Los cuatro colores de la marca se **extraen** de los archivos de `/brand` con `npm run brand:palette` (`scripts/brand/extract-palette.ts`), y todos los demás se **calculan** a partir de ellos con reglas OKLCH escritas en `scripts/brand/build-tokens.ts` (`npm run brand:tokens`). Cambiar un color es cambiar una regla, visible en el historial.

| Color               | sRGB (pantalla) | OKLCH               | Fuente                              | Cómo se obtuvo                                                                                                                                                                                         |
| ------------------- | --------------- | ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verde institucional | `#002e29`       | 27.1 % 0.048 183.6° | Logotipo del membrete               | Mediana del grupo de tinta más oscuro. En el archivo original es Adobe RGB (13, 50, 45), apenas fuera del gamut sRGB: en pantalla se usa el sRGB más cercano (ΔE OK 0.026, apenas perceptible)         |
| Durazno             | `#e5a386`       | 77.2 % 0.088 44.6°  | Texto de contacto del membrete      | Mediana del grupo de tinta más cromático. Adobe RGB (212, 162, 134)                                                                                                                                    |
| Salmón              | `#f4b79f`       | 82.9 % 0.079 42.4°  | Titulares de las tres publicaciones | El valor exacto más repetido en el área del titular; **idéntico en las tres**                                                                                                                          |
| Rubor               | `#fbefe7`       | 95.9 % 0.017 56.2°  | Marca de agua circular del membrete | La capa está al 20 % de opacidad y premultiplicada contra blanco: su color guardado es el que se ve en el papel. La tinta de esa capa, recuperada, es durazno (`#e7ac86`): el rubor es durazno al 20 % |

Dos hallazgos técnicos del proceso, porque explican por qué no basta con "tomar el color con el gotero":

1. **El membrete está codificado en Adobe RGB (1998)**, no en sRGB. Leer sus píxeles como sRGB desplaza todos los colores; el script verifica el perfil ICC incrustado y convierte píxel por píxel.
2. **La marca de agua usa transparencia premultiplicada** (`/Matte [1 1 1]` en la máscara del PDF). Volver a mezclarla con blanco la habría dejado casi invisible (`#fefcfa`); el script lee el matte y lo resuelve.

## 2. Rampas

Tres familias con los mismos 11 pasos de luminosidad (50 a 950); el valor exacto de la marca ocupa su paso:

- **Verde institucional** (tono 183.6°): el verde de la marca es el paso 900. Los pasos medios llevan más croma para que el verde siga reconociéndose al aclararse.
- **Durazno / salmón** (tono 44.6°): rubor = 50, salmón = 300, durazno = 400; los pasos oscuros forman un terracota que sirve para texto.
- **Neutros cálidos "papel"** (tono del rubor, 56.2°, croma 0.004–0.010): grises que acompañan al papel del membrete; la fotografía de la marca usa la misma familia.

## 3. Tokens semánticos

| Token                | Claro     | Oscuro    |
| -------------------- | --------- | --------- |
| `background`         | `#fcf9f7` | `#061210` |
| `foreground`         | `#23201d` | `#f6f1ef` |
| `heading`            | `#002e29` | `#fcf9f7` |
| `card`               | `#ffffff` | `#0c1a18` |
| `muted`              | `#f6f1ef` | `#152421` |
| `muted-foreground`   | `#69635f` | `#aaa39f` |
| `primary`            | `#002e29` | `#9bcdc4` |
| `primary-foreground` | `#fbefe7` | `#001e1a` |
| `primary-hover`      | `#05443e` | `#c3e2dd` |
| `accent`             | `#fbefe7` | `#33221a` |
| `accent-foreground`  | `#002e29` | `#f4b79f` |
| `accent-strong`      | `#e5a386` | `#e5a386` |
| `border`             | `#ebe5e1` | `#253431` |
| `input`              | `#857f7b` | `#857f7b` |
| `ring`               | `#1c786e` | `#6fb4a9` |
| `link`               | `#065d54` | `#9bcdc4` |
| `sidebar`            | `#002e29` | `#010b09` |
| `sidebar-foreground` | `#fbefe7` | `#f6f1ef` |
| `sidebar-accent`     | `#e5a386` | `#e5a386` |

Criterios:

- El **botón primario** es verde institucional con texto rubor, como la tarjeta de presentación (verde con logotipo durazno).
- El **modo oscuro** no es un gris genérico: sus superficies "noche" se derivan del verde institucional y la navegación queda un tono más oscura que la página.
- **Bordes de campos** (`input`) llegan a 3:1, como pide WCAG 1.4.11; los bordes decorativos de tarjetas (`border`) son más suaves porque no identifican controles.
- En Tailwind se **eliminó la paleta por defecto**: solo existen utilidades con estos tokens (no hay `bg-blue-500` que usar por error).

**Contraste: 92 de 92 combinaciones cumplen WCAG 2.2 AA** (texto ≥ 4.5:1; iconos, bordes de campos y foco ≥ 3:1), en claro y en oscuro. Las mismas combinaciones se prueban en cada cambio (`packages/shared/src/brand/tokens.test.ts`); si alguien rompe el contraste, el CI no publica.

## 4. Semáforo

Nunca solo color: cada estado lleva **icono y texto**. Verde, ámbar y rojo **no existen en la marca**; siguen la convención universal del semáforo y su luminosidad y croma se calcularon para cumplir AA. Necesitan tu visto bueno explícito.

| Estado               | Claro: icono / fondo / texto      | Oscuro: icono / fondo / texto     |
| -------------------- | --------------------------------- | --------------------------------- |
| Cumplido (success)   | `#0a7e3a` / `#eaf8ec` / `#005725` | `#62bb78` / `#152d1a` / `#b7e5bf` |
| Por vencer (warning) | `#b17000` / `#fdf1e4` / `#653e00` | `#d8953d` / `#34220b` / `#f6d0a6` |
| Vencido (danger)     | `#ab413a` / `#ffefed` / `#782a25` | `#eb8278` / `#3a1d1a` / `#ffc8c1` |
| En revisión (info)   | `#007a6f` / `#e4f9f5` / `#00544c` | `#00bead` / `#042d29` / `#a3e7dc` |
| No aplica (neutral)  | `#69635f` / `#f6f1ef` / `#393431` | `#aaa39f` / `#152421` / `#ebe5e1` |

El ámbar es ocre a propósito: un amarillo lo bastante claro para verse amarillo no alcanza 3:1 sobre blanco, y los iconos de estado deben alcanzarlo.

## 5. Gráficas

**Categórica (series distintas)**: 8 tonos anclados en el verde institucional (183.6°, pasos de 45°); el más cercano al durazno se sustituyó por el tono exacto de la marca, así que las dos primeras series son los dos colores de Empírica. El orden y la luminosidad de cada serie salieron de una búsqueda que maximiza la separación entre series vecinas, también simulando daltonismo (protanopía y deuteranopía, modelo de Machado et al. 2009), con croma contenido para un aspecto sobrio.

| Serie | Claro     | Oscuro    |
| ----- | --------- | --------- |
| 1     | `#00a495` | `#00ac9d` |
| 2     | `#a74b1b` | `#a55026` |
| 3     | `#3f4b9f` | `#5664b3` |
| 4     | `#7f6800` | `#816a00` |
| 5     | `#00a0d1` | `#18a0ce` |
| 6     | `#8e2c4d` | `#cd6c87` |
| 7     | `#4f8e3a` | `#437c30` |
| 8     | `#743784` | `#8a5299` |

Validación (dos implementaciones independientes coinciden):

| Comprobación                                                           | Claro | Oscuro | Mínimo |
| ---------------------------------------------------------------------- | ----- | ------ | ------ |
| Separación entre vecinas con daltonismo (ΔE OKLab ×100)                | 14.4  | 11.8   | 8      |
| Separación entre vecinas con visión normal                             | 25.4  | 22.7   | 15     |
| Las tres primeras, todas contra todas (dispersión y mapas), daltonismo | 15.9  | 16.8   | 8      |
| Contraste de cada serie contra la superficie                           | ≥ 3:1 | ≥ 3:1  | 3:1    |

Reglas de uso: los colores se asignan en orden fijo y siguen a la entidad (filtrar no repinta); más de 8 series se agrupan en "Otros"; en dispersión o mapas, máximo 3 series. **Secuencial** (heatmap de compliance): rampa verde de claro a oscuro, invertida en modo oscuro.

## 6. Tipografía

El membrete es una imagen sin fuentes incrustadas, así que la tipografía exacta no se puede identificar. Dos combinaciones libres (licencia OFL, sin costo), guardadas dentro de la app para funcionar sin internet:

|                     | Títulos (serif)    | Interfaz (sans) | Carácter                                                                                                                                                                    |
| ------------------- | ------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · recomendada** | Cormorant Garamond | Montserrat      | Fiel a la marca: serif clásica de alto contraste, cercana al logotipo y al texto del membrete; sans geométrica y amplia como "LEGAL LAB" y los rótulos de las publicaciones |
| **B**               | Fraunces           | Inter           | Máxima legibilidad en tablas densas y en el celular; se aleja un poco del carácter de la marca                                                                              |

**Rótulos en versalitas** (como "LEGAL LAB"): mayúsculas, 0.75 rem, peso 600, espaciado 0.14 em (`label-caps`). Si la agencia nos confirma las fuentes originales, se usan (si son libres) o se igualan.

## 7. Otros tokens

Radios amplios (controles 10 px, tarjetas 16 px, paneles 24 px), sombras suaves teñidas del verde más oscuro, foco visible de 3 px, y animaciones que respetan "reducir movimiento" del sistema.

## 8. Cómo se cambia algo

1. Editar la regla en `scripts/brand/build-tokens.ts` (o reemplazar un archivo de `/brand` y correr `npm run brand:palette`).
2. `npm run brand:tokens`: regenera `tokens.json`, `tokens.css` y la vista previa, e imprime contraste y validación de gráficas.
3. `npm run check`: si el contraste o la paleta de gráficas dejan de cumplir, las pruebas fallan.
