/**
 * Renders docs/design/paleta-propuesta.html: the palette and typography
 * proposal the firm approves before the tokens are frozen.
 *
 * Self-contained static HTML styled with the proposed tokens themselves, so
 * what the reviewer sees is what the portal will use. Fonts load from Google
 * Fonts here only for convenience; the app self-hosts them (works offline).
 */
import { formatOklch, hexToOklch } from '../../packages/shared/src/brand/color.ts';
import type {
  CategoricalReport,
  ThemeMode,
} from '../../packages/shared/src/brand/chart-palette.ts';
import {
  RAMP_STEPS,
  SEMANTIC_COLORS,
  STATUS_PARTS,
  STATUS_TONES,
  type BrandTokens,
  type StatusTone,
  type ThemeTokens,
} from '../../packages/shared/src/brand/tokens.ts';

interface PreviewInput {
  tokens: BrandTokens;
  palette: {
    letterhead: { clusters: { hex: string; source?: { space: string; rgb: number[] } }[] };
  };
  wheel: number[];
  chartOrder: number[];
  chartReports: Record<
    ThemeMode,
    { adjacent: CategoricalReport; firstThreeAllPairs: CategoricalReport }
  >;
  contrastRows: {
    mode: ThemeMode;
    fg: string;
    bg: string;
    fgHex: string;
    bgHex: string;
    ratio: number;
    min: number;
    use: string;
    pass: boolean;
  }[];
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function vars(theme: ThemeTokens): string {
  const lines: string[] = [];
  for (const name of SEMANTIC_COLORS) lines.push(`--${name}:${theme.colors[name]};`);
  for (const tone of STATUS_TONES) {
    for (const part of STATUS_PARTS)
      lines.push(`--status-${tone}-${part}:${theme.status[tone][part]};`);
  }
  theme.chart.categorical.forEach((c, i) => lines.push(`--chart-${i + 1}:${c};`));
  return lines.join('');
}

// Lucide icons (ISC license), inlined so the page has no dependencies.
const ICON: Record<StatusTone, string> = {
  success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  danger: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  neutral: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
};
const svgIcon = (tone: StatusTone): string =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[tone]}</svg>`;

const SEMAFORO: { tone: StatusTone; label: string; detail: string }[] = [
  { tone: 'success', label: 'Cumplido', detail: 'Evidencia validada por el despacho' },
  { tone: 'warning', label: 'Por vencer', detail: 'Vence en los próximos días' },
  { tone: 'danger', label: 'Vencido', detail: 'Pasó la fecha límite sin cumplir' },
  { tone: 'info', label: 'En revisión', detail: 'Evidencia cargada, pendiente de validar' },
  { tone: 'neutral', label: 'No aplica', detail: 'Sin obligación en el periodo' },
];

function swatch(hex: string, label: string, extra = ''): string {
  return `<div class="swatch"><div class="chip" style="background:${hex}"></div><div class="meta"><strong>${esc(label)}</strong><code>${hex}</code><small>${formatOklch(hexToOklch(hex))}</small>${extra}</div></div>`;
}

function mock(mode: ThemeMode): string {
  const dark = mode === 'dark';
  return `<div class="t-${mode} mock" ${dark ? 'data-mock="dark"' : ''}>
  <div class="mock-bar"><span class="mock-brand">empírica</span><span class="mock-tag">Fractional Legal Team</span><span class="mock-dot" title="En línea · sincronizado">●</span></div>
  <div class="mock-body">
    <p class="label">Inicio del cliente · ${dark ? 'modo oscuro' : 'modo claro'}</p>
    <h3 class="mock-title">Cliente Demo, S.A. de C.V.</h3>
    <p class="mock-text">Texto principal del portal. Las tarjetas usan radios amplios, sombras suaves y mucho aire.</p>
    <p class="mock-muted">Texto secundario: última sincronización hace 2 min · 3 cambios pendientes</p>
    <div class="pending"><p class="label">Pendientes de su lado</p><p>Firmar el acta de asamblea · <strong>en espera desde hace 4 días</strong></p></div>
    <div class="mock-row">
      <button class="btn primary" type="button">Crear solicitud</button>
      <button class="btn secondary" type="button">Ver tareas</button>
      <span class="badge-peach">Dentro de iguala</span>
    </div>
    <label class="field"><span>Buscar (⌘K)</span><input type="text" placeholder="Asuntos, tareas, trámites…"></label>
    <p class="mock-text"><a href="#" onclick="return false">Abrir el expediente del asunto</a></p>
    <div class="status-row">${SEMAFORO.map(
      (s) =>
        `<span class="status status-${s.tone}">${svgIcon(s.tone)}<span>${s.label}</span></span>`,
    ).join('')}</div>
  </div>
</div>`;
}

function bars(mode: ThemeMode, theme: ThemeTokens): string {
  const months = ['Jul', 'Ago', 'Sep', 'Oct'];
  const series = ['Corporativo', 'Contratos', 'Compliance', 'Laboral'];
  const values = [
    [6, 4, 7, 5],
    [3, 5, 4, 6],
    [8, 6, 5, 7],
    [2, 3, 4, 3],
  ];
  const w = 520;
  const h = 210;
  const base = 175;
  const groupW = w / months.length;
  const barW = 18;
  const gap = 2;
  const unit = 17;
  let marks = '';
  months.forEach((m, gi) => {
    const x0 = gi * groupW + (groupW - (barW * 4 + gap * 3)) / 2;
    series.forEach((s, si) => {
      const v = values[si]?.[gi] ?? 0;
      const bh = v * unit;
      const x = x0 + si * (barW + gap);
      const y = base - bh;
      marks += `<path d="M${x},${base} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + barW - 4} Q${x + barW},${y} ${x + barW},${y + 4} V${base} Z" fill="${theme.chart.categorical[si]}"><title>${s} · ${m}: ${v} asuntos</title></path>`;
    });
    marks += `<text x="${gi * groupW + groupW / 2}" y="${base + 20}" text-anchor="middle" class="axis">${m}</text>`;
  });
  const legend = series
    .map(
      (s, i) =>
        `<span class="legend-item"><i style="background:${theme.chart.categorical[i]}"></i>${s}</span>`,
    )
    .join('');
  return `<figure class="t-${mode} chart-card"><figcaption>Asuntos activos por área · ${mode === 'dark' ? 'oscuro' : 'claro'}</figcaption><div class="legend">${legend}</div><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Ejemplo de barras agrupadas con las primeras cuatro series"><line x1="0" x2="${w}" y1="${base}" y2="${base}" class="baseline"/>${marks}</svg></figure>`;
}

function heatmap(mode: ThemeMode, theme: ThemeTokens): string {
  const cats = ['Corporativo', 'Fiscal', 'Laboral y SS', 'PI', 'Licencias', 'Datos personales'];
  const months = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const seq = theme.chart.sequential;
  let rows = '';
  cats.forEach((c, ci) => {
    let cells = '';
    months.forEach((m, mi) => {
      const v = (ci * 3 + mi * 5) % seq.length;
      cells += `<td style="background:${seq[v]}" title="${c} · ${m}: ${Math.round(((v + 1) / seq.length) * 100)} % cumplido"></td>`;
    });
    rows += `<tr><th scope="row">${c}</th>${cells}</tr>`;
  });
  return `<figure class="t-${mode} chart-card"><figcaption>Heatmap de cumplimiento (rampa secuencial) · ${mode === 'dark' ? 'oscuro' : 'claro'}</figcaption><table class="heat"><thead><tr><th></th>${months.map((m) => `<th scope="col">${m}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></figure>`;
}

function chartSummary(r: CategoricalReport, all: CategoricalReport): string {
  const ok = (b: boolean): string =>
    b ? '<span class="ok">✓ pasa</span>' : '<span class="bad">✗ falla</span>';
  return `<ul class="checks">
    <li>Banda de luminosidad y croma mínimo: ${ok(!r.offBand.length && !r.lowChroma.length)}</li>
    <li>Separación entre series vecinas con daltonismo (protan/deutan, meta ≥ 8): <strong>${r.worstCvd.value.toFixed(1)}</strong> ${ok(r.worstCvd.value >= 6)}</li>
    <li>Separación con visión normal (mínimo 15): <strong>${r.worstNormal.value.toFixed(1)}</strong> ${ok(r.worstNormal.value >= 15)}</li>
    <li>Contraste de cada serie contra la superficie (≥ 3:1): ${ok(!r.lowContrast.length)}</li>
    <li>Las tres primeras, comparadas todas contra todas (dispersión, mapas): ${ok(all.ok)} (daltonismo ${all.worstCvd.value.toFixed(1)}, normal ${all.worstNormal.value.toFixed(1)})</li>
  </ul>`;
}

export function renderPreview(input: PreviewInput): string {
  const { tokens, palette, wheel, chartOrder, chartReports, contrastRows } = input;
  const t = tokens;
  const adobe = (hex: string): string => {
    const c = palette.letterhead.clusters.find((x) => x.hex === hex);
    return c?.source ? `<small>Membrete: ${c.source.space} ${c.source.rgb.join(', ')}</small>` : '';
  };
  const passCount = contrastRows.filter((r) => r.pass).length;

  const ramps = (['green', 'accent', 'neutral'] as const)
    .map(
      (name) =>
        `<div class="ramp"><h4>${{ green: 'Verde institucional', accent: 'Durazno / salmón', neutral: 'Neutros cálidos (papel)' }[name]}</h4><div class="ramp-row">${RAMP_STEPS.map(
          (s) =>
            `<div class="ramp-step" style="background:${t.ramps[name][s]};color:${Number(s) >= 500 ? '#fff' : '#111'}"><b>${s}</b><span>${t.ramps[name][s]}</span></div>`,
        ).join('')}</div></div>`,
    )
    .join('');

  const contrastTable = contrastRows
    .map(
      (r) =>
        `<tr class="${r.pass ? '' : 'row-bad'}"><td>${r.mode === 'light' ? 'Claro' : 'Oscuro'}</td><td>${esc(r.use)}</td><td><span class="pair" style="color:${r.fgHex};background:${r.bgHex}">Aa</span> <code>${r.fg}</code> / <code>${r.bg}</code></td><td>${r.ratio.toFixed(2)}:1</td><td>${r.min}:1</td><td>${r.pass ? '✓' : '✗'}</td></tr>`,
    )
    .join('');

  const chartSwatches = (mode: ThemeMode): string =>
    t.themes[mode].chart.categorical
      .map(
        (hex, i) =>
          `<div class="cat"><i style="background:${hex}"></i><span>${i + 1}</span><code>${hex}</code></div>`,
      )
      .join('');

  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paleta propuesta · Empírica Portal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Montserrat:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light;${vars(t.themes.light)}--font-display:'Cormorant Garamond',Georgia,serif;--font-sans:'Montserrat',system-ui,sans-serif;--radius-card:${t.radius.card};--radius-control:${t.radius.control};--shadow-md:${t.shadow.md}}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme='light'])){color-scheme:dark;${vars(t.themes.dark)}}}
:root[data-theme='dark']{color-scheme:dark;${vars(t.themes.dark)}}
.t-light{${vars(t.themes.light)}color-scheme:light}
.t-dark{${vars(t.themes.dark)}color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--background);color:var(--foreground);font:15px/1.6 var(--font-sans)}
main{max-width:1120px;margin:0 auto;padding:32px 16px 64px}
h1,h2,h3,h4{font-family:var(--font-display);color:var(--heading);font-weight:600;line-height:1.15;margin:0 0 .4em}
h1{font-size:clamp(2rem,4vw,2.9rem)}h2{font-size:1.9rem;margin-top:2.2em}h4{font-size:1.25rem}
.label{font:600 .72rem/1.4 var(--font-sans);text-transform:uppercase;letter-spacing:.14em;color:var(--muted-foreground);margin:0 0 .5em}
.lead{color:var(--muted-foreground);max-width:70ch}
.card{background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow-md);padding:20px}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}.g4{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.swatch{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);padding:12px}
.chip{width:64px;height:64px;border-radius:12px;flex:none;border:1px solid rgb(0 0 0 / .08)}
.meta{display:flex;flex-direction:column;font-size:.85rem}.meta code{font-size:.85rem}.meta small{color:var(--muted-foreground)}
.ramp{margin:14px 0}.ramp-row{display:grid;grid-template-columns:repeat(11,1fr);border-radius:12px;overflow:hidden}
.ramp-step{padding:10px 4px;font-size:.62rem;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0}.ramp-step span{overflow:hidden;text-overflow:ellipsis;max-width:100%}
.mock{background:var(--background);color:var(--foreground);border-radius:var(--radius-card);overflow:hidden;border:1px solid var(--border)}
.mock-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--sidebar);color:var(--sidebar-foreground);border-bottom:1px solid var(--sidebar-border)}
.mock-brand{font:600 1.35rem var(--font-display)}.mock-tag{font:600 .62rem var(--font-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--sidebar-muted-foreground)}.mock-dot{margin-left:auto;color:var(--sidebar-accent)}
.mock-body{padding:18px;display:flex;flex-direction:column;gap:10px;background:var(--card)}
.mock-title{font-size:1.6rem;color:var(--heading)}.mock-text{margin:0;color:var(--card-foreground)}.mock-muted{margin:0;color:var(--muted-foreground);font-size:.88rem}
.mock a,.link{color:var(--link);text-underline-offset:3px}
.pending{background:var(--accent);color:var(--accent-foreground);border-left:4px solid var(--accent-strong);border-radius:12px;padding:12px 14px}.pending p{margin:0}.pending .label{color:var(--accent-foreground)}
.mock-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.btn{font:600 .9rem var(--font-sans);border-radius:var(--radius-control);padding:9px 16px;border:1px solid transparent;cursor:pointer}
.btn.primary{background:var(--primary);color:var(--primary-foreground)}.btn.primary:hover{background:var(--primary-hover)}
.btn.secondary{background:var(--secondary);color:var(--secondary-foreground);border-color:var(--border)}
.btn:focus-visible,input:focus-visible{outline:3px solid var(--ring);outline-offset:2px}
.badge-peach{background:var(--accent-strong);color:var(--accent-strong-foreground);font:600 .72rem var(--font-sans);border-radius:999px;padding:4px 10px;letter-spacing:.04em}
.field{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:var(--muted-foreground)}
.field input{font:inherit;color:var(--foreground);background:var(--card);border:1px solid var(--input);border-radius:var(--radius-control);padding:9px 12px}
.status-row{display:flex;flex-wrap:wrap;gap:8px}
.status{display:inline-flex;align-items:center;gap:6px;font:600 .8rem var(--font-sans);border-radius:999px;padding:4px 10px 4px 7px;border:1px solid}
${STATUS_TONES.map((s) => `.status-${s}{background:var(--status-${s}-subtle);color:var(--status-${s}-on-subtle);border-color:var(--status-${s}-border)}.status-${s} svg{color:var(--status-${s}-solid)}`).join('')}
.semaforo{display:grid;gap:10px}.sem{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--border)}
.sem .status{min-width:140px}.sem small{color:var(--muted-foreground)}
table.contrast{width:100%;border-collapse:collapse;font-size:.82rem}table.contrast td,table.contrast th{padding:6px 8px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}
.pair{display:inline-block;padding:2px 8px;border-radius:6px;font-weight:700;border:1px solid rgb(127 127 127 / .3)}
.row-bad td{background:var(--status-danger-subtle);color:var(--status-danger-on-subtle)}
.chart-card{margin:0;background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:var(--radius-card);padding:16px}
.chart-card figcaption{font:600 .72rem var(--font-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--muted-foreground);margin-bottom:8px}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:.8rem;margin-bottom:6px}.legend-item{display:inline-flex;align-items:center;gap:6px}.legend-item i{width:12px;height:12px;border-radius:3px;display:inline-block}
svg .axis{fill:var(--muted-foreground);font:12px var(--font-sans)}svg .baseline{stroke:var(--border);stroke-width:1}
table.heat{border-collapse:separate;border-spacing:2px;font-size:.72rem;width:100%}table.heat td{height:22px;border-radius:4px}table.heat th{font-weight:500;color:var(--muted-foreground);text-align:left;white-space:nowrap;padding-right:6px}
.cats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cat{display:flex;align-items:center;gap:6px;font-size:.78rem}.cat i{width:22px;height:22px;border-radius:6px;flex:none}
.checks{margin:.5em 0 0;padding-left:1.2em;font-size:.86rem}.ok{color:var(--status-success-on-subtle);font-weight:600}.bad{color:var(--status-danger-on-subtle);font-weight:600}
.type-a{--d:'Cormorant Garamond',Georgia,serif;--s:'Montserrat',system-ui,sans-serif}.type-b{--d:'Fraunces',Georgia,serif;--s:'Inter',system-ui,sans-serif}
.specimen h3{font-family:var(--d);font-size:2.2rem;color:var(--heading)}.specimen h4{font-family:var(--d);font-size:1.35rem}.specimen p{font-family:var(--s);margin:.3em 0}.specimen .label{font-family:var(--s)}
.specimen .num{font-family:var(--s);font-variant-numeric:tabular-nums;font-size:1.6rem;font-weight:600;color:var(--heading)}
.rec{display:inline-block;background:var(--accent-strong);color:var(--accent-strong-foreground);border-radius:999px;padding:2px 10px;font:600 .7rem var(--font-sans);letter-spacing:.08em;text-transform:uppercase;margin-left:6px}
.toggle{position:fixed;top:12px;right:12px;z-index:2}
footer{margin-top:48px;color:var(--muted-foreground);font-size:.85rem}
@media (max-width:640px){.ramp-row{grid-template-columns:repeat(6,1fr)}.cats{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<button class="btn secondary toggle" type="button" onclick="var r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">Claro / oscuro</button>
<main>
<p class="label">Empírica Portal · Fase 0 · Propuesta pendiente de aprobación</p>
<h1>Paleta, tokens y tipografía</h1>
<p class="lead">Todos los colores salen de los archivos de marca (membrete y publicaciones) con un script reproducible (<code>npm run brand:palette</code>). Los tonos intermedios se calculan con reglas OKLCH documentadas en <code>scripts/brand/build-tokens.ts</code>; ningún valor está escrito a mano. Contraste WCAG 2.2 AA: <strong>${passCount} de ${contrastRows.length}</strong> combinaciones cumplen.</p>

<h2>1. Colores de la marca</h2>
<p class="lead">El membrete está codificado en Adobe RGB (1998); se convirtió a sRGB píxel por píxel. El verde del logotipo queda apenas fuera del gamut sRGB, así que en pantalla se usa el sRGB más cercano (diferencia apenas perceptible).</p>
<div class="grid g4">
${swatch(t.brand.green, 'Verde institucional', `<small>Logotipo del membrete</small>${adobe(t.brand.green)}`)}
${swatch(t.brand.peach, 'Durazno', `<small>Texto de contacto del membrete</small>${adobe(t.brand.peach)}`)}
${swatch(t.brand.salmon, 'Salmón', '<small>Titulares de las 3 publicaciones (idéntico)</small>')}
${swatch(t.brand.blush, 'Rubor', '<small>Marca de agua: durazno al 20 % sobre papel</small>')}
</div>

<h2>2. Rampas derivadas</h2>
<p class="lead">Mismos pasos de luminosidad para las tres familias. Los valores exactos de la marca ocupan su paso: verde = 900; rubor = 50, salmón = 300 y durazno = 400.</p>
${ramps}

<h2>3. Así se ve la interfaz</h2>
<p class="lead">Mismo contenido en modo claro y oscuro. El modo oscuro usa superficies “noche” derivadas del verde institucional, no un gris genérico.</p>
<div class="grid g2">${mock('light')}${mock('dark')}</div>

<h2>4. Semáforo accesible</h2>
<p class="lead">Nunca solo color: cada estado lleva icono y texto. Verde, ámbar y rojo no existen en la marca; siguen la convención universal del semáforo, con luminosidad y croma calculados para cumplir AA. <strong>Requiere tu visto bueno explícito.</strong></p>
<div class="grid g2">
${(['light', 'dark'] as const)
  .map(
    (mode) =>
      `<div class="t-${mode} card semaforo"><p class="label">${mode === 'light' ? 'Claro' : 'Oscuro'}</p>${SEMAFORO.map(
        (s) =>
          `<div class="sem"><span class="status status-${s.tone}">${svgIcon(s.tone)}<span>${s.label}</span></span><small>${s.detail}</small></div>`,
      ).join('')}</div>`,
  )
  .join('')}
</div>

<h2>5. Gráficas</h2>
<p class="lead">Paleta categórica de 8 tonos anclada en el verde institucional (h ${wheel[0]?.toFixed(1)}°, pasos de 45°); el tono más cercano al durazno se sustituyó por el de la marca. El orden y la luminosidad de cada serie salieron de una búsqueda que maximiza la separación entre series vecinas, también para personas con daltonismo. Orden de tonos: ${chartOrder.map((k) => `${wheel[k]?.toFixed(0)}°`).join(' → ')}.</p>
<div class="grid g2">
${(['light', 'dark'] as const)
  .map(
    (mode) =>
      `<div class="t-${mode} card"><p class="label">Categórica · ${mode === 'light' ? 'claro' : 'oscuro'}</p><div class="cats">${chartSwatches(mode)}</div>${chartSummary(chartReports[mode].adjacent, chartReports[mode].firstThreeAllPairs)}</div>`,
  )
  .join('')}
${bars('light', t.themes.light)}${bars('dark', t.themes.dark)}
${heatmap('light', t.themes.light)}${heatmap('dark', t.themes.dark)}
</div>

<h2>6. Tipografía: dos opciones</h2>
<p class="lead">El membrete es una imagen sin fuentes incrustadas, así que no se puede identificar la tipografía exacta. Propongo dos combinaciones libres (licencia OFL, sin costo) que el portal guardará en el propio dispositivo para funcionar sin internet. Si la agencia de diseño nos confirma las fuentes originales, las usamos (si son libres) o las igualamos.</p>
<div class="grid g2">
<div class="card specimen type-a"><p class="label">Opción A · fiel a la marca <span class="rec">Recomendada</span></p><h3>Un laboratorio jurídico</h3><h4>Cormorant Garamond + Montserrat</h4><p>Serif clásica de alto contraste para títulos, emparentada con el logotipo y el texto lateral del membrete. Montserrat, geométrica y amplia, repite el trazo de “LEGAL LAB” y de los rótulos de las publicaciones.</p><p class="label">Rótulo en versalitas · próximos vencimientos</p><p class="num">87 % · 12 tareas · 3 fatales</p></div>
<div class="card specimen type-b"><p class="label">Opción B · máxima legibilidad de datos</p><h3>Un laboratorio jurídico</h3><h4>Fraunces + Inter</h4><p>Fraunces es una serif contemporánea que se lee bien en tamaños medianos del celular. Inter es la sans más legible para tablas densas y cifras, aunque se aleja un poco del carácter de la marca.</p><p class="label">Rótulo en versalitas · próximos vencimientos</p><p class="num">87 % · 12 tareas · 3 fatales</p></div>
</div>

<h2>7. Contraste WCAG 2.2 AA</h2>
<p class="lead">Texto ≥ 4.5:1; iconos, bordes de campos y foco ≥ 3:1. Las mismas combinaciones se prueban en cada cambio (CI), así que una edición que rompa el contraste no se publica.</p>
<div class="card" style="overflow-x:auto"><table class="contrast"><thead><tr><th>Modo</th><th>Uso</th><th>Par</th><th>Contraste</th><th>Mínimo</th><th></th></tr></thead><tbody>${contrastTable}</tbody></table></div>

<footer>Generado por <code>scripts/brand/build-tokens.ts</code> a partir de <code>brand/palette.json</code>. Para aprobar: responde “apruebo la paleta y la tipografía A” (o B), o dime qué cambiar.</footer>
</main>
</body>
</html>
`;
}
