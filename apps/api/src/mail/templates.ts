/**
 * The portal's emails, in Spanish or English: the daily summary (D14) and
 * the invitation. Each one has an HTML body with the brand's colors (from
 * the generated tokens, never typed here) and a plain-text body for mail
 * apps that show only text. Everything typed by people is escaped.
 */
import tokens from '@empirica/shared/brand/tokens' with { type: 'json' };
import {
  agendaKindLabel,
  agendaUrl,
  type AgendaItem,
  type AgendaLanguage,
  type Digest,
} from '@empirica/shared';

const C = tokens.themes.light.colors;
const SANS = `${tokens.typography.sans.family}, ${tokens.typography.sans.fallback}`;
const DISPLAY = `${tokens.typography.display.family}, ${tokens.typography.display.fallback}`;

export interface Email {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

/** "5 oct 2026" / "Oct 5, 2026", without Intl (Apps Script's locales vary). */
export function formatDay(day: string, lang: AgendaLanguage): string {
  const [y, m, d] = day.split('-').map(Number);
  const month = MONTHS[lang][(m ?? 1) - 1] ?? '';
  return lang === 'en'
    ? `${month} ${String(d)}, ${String(y)}`
    : `${String(d)} ${month} ${String(y)}`;
}

const WORDS = {
  es: {
    digestSubject: (day: string) => `Resumen del portal · ${day}`,
    hello: (name: string) => `Hola, ${name}.`,
    intro: 'Esto es lo que necesita atención en el portal de Empírica Legal Lab.',
    overdue: 'Vencidos',
    today: 'Hoy',
    soon: 'Próximos días',
    waiting: 'Esperan su respuesta',
    dueToday: 'vence hoy',
    overdueBy: (n: number) => (n === 1 ? 'venció ayer' : `venció hace ${String(n)} días`),
    dueIn: (n: number) => (n === 1 ? 'mañana' : `en ${String(n)} días`),
    waitingFor: (n: number) => `lleva ${String(n)} días en espera`,
    more: (n: number) => `y ${String(n)} más en el portal`,
    open: 'Abrir el portal',
    digestFooter:
      'Recibes este resumen porque tienes acceso al portal de Empírica Legal Lab. Puedes apagarlo en el portal, en Avisos (la campana de arriba).',
    inviteSubject: 'Te invitaron al portal de Empírica Legal Lab',
    invited: (who: string, client: string | null) =>
      `${who} te invitó al portal de Empírica Legal Lab${client ? ` para ${client}` : ''}.`,
    inviteHow: (email: string, until: string) =>
      `Para aceptar, abre el enlace y entra con este correo (${email}). El enlace vence el ${until}.`,
    accept: 'Aceptar la invitación',
    inviteFooter:
      'Si no esperabas este correo, ignóralo: sin aceptar el enlace no se crea ningún acceso.',
    linkLine: 'Enlace',
  },
  en: {
    digestSubject: (day: string) => `Portal summary · ${day}`,
    hello: (name: string) => `Hi ${name}.`,
    intro: 'This is what needs attention in the Empírica Legal Lab portal.',
    overdue: 'Overdue',
    today: 'Today',
    soon: 'Coming up',
    waiting: 'Waiting for your answer',
    dueToday: 'due today',
    overdueBy: (n: number) => (n === 1 ? 'due yesterday' : `${String(n)} days overdue`),
    dueIn: (n: number) => (n === 1 ? 'tomorrow' : `in ${String(n)} days`),
    waitingFor: (n: number) => `waiting for ${String(n)} days`,
    more: (n: number) => `and ${String(n)} more in the portal`,
    open: 'Open the portal',
    digestFooter:
      'You receive this summary because you have access to the Empírica Legal Lab portal. You can turn it off in the portal, in Notices (the bell at the top).',
    inviteSubject: 'You are invited to the Empírica Legal Lab portal',
    invited: (who: string, client: string | null) =>
      `${who} invited you to the Empírica Legal Lab portal${client ? ` for ${client}` : ''}.`,
    inviteHow: (email: string, until: string) =>
      `To accept, open the link and sign in with this email (${email}). The link expires on ${until}.`,
    accept: 'Accept the invitation',
    inviteFooter:
      'If you did not expect this email, ignore it: no access is created unless the link is accepted.',
    linkLine: 'Link',
  },
} as const;

/** Each section shows this many; the rest are counted. */
const SHOWN = 15;

function layout(title: string, body: string, footer: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.background};color:${C.foreground};font-family:${SANS};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.background};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:8px;">` +
    `<tr><td style="background:${C.primary};color:${C['primary-foreground']};padding:16px 24px;border-radius:8px 8px 0 0;font-family:${DISPLAY};font-size:22px;">Empírica Legal Lab</td></tr>` +
    `<tr><td style="padding:24px;font-size:15px;line-height:1.5;">${body}</td></tr>` +
    `<tr><td style="padding:16px 24px;border-top:1px solid ${C.border};color:${C['muted-foreground']};font-size:12px;line-height:1.5;">${escapeHtml(footer)}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

const button = (href: string, label: string): string =>
  `<p style="margin:24px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${C.primary};color:${C['primary-foreground']};padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${escapeHtml(label)}</a></p>`;

export interface DigestLine {
  title: string;
  /** "Cliente Demo · Unidad Norte". */
  context: string | null;
  /** "vence hoy", "en 7 días". */
  when: string;
  url: string;
}

export interface DigestEmailInput {
  lang: AgendaLanguage;
  name: string;
  today: string;
  portalUrl: string;
  digest: Digest;
  contextOf: (item: AgendaItem) => string | null;
  /** The waiting tasks' titles and contexts, already worded. */
  waitingLines: DigestLine[];
}

function itemLine(item: AgendaItem, days: number, input: DigestEmailInput): DigestLine {
  const w = WORDS[input.lang];
  const when = days < 0 ? w.overdueBy(-days) : days === 0 ? w.dueToday : w.dueIn(days);
  return {
    title: `${agendaKindLabel(item, input.lang)}: ${item.titulo}`,
    context: input.contextOf(item),
    when: `${when} · ${formatDay(item.date, input.lang)}`,
    url: agendaUrl(input.portalUrl, item),
  };
}

export function digestEmail(input: DigestEmailInput): Email {
  const w = WORDS[input.lang];
  const sections: [string, DigestLine[]][] = [
    [w.overdue, input.digest.overdue.map((e) => itemLine(e.item, e.days, input))],
    [w.today, input.digest.today.map((e) => itemLine(e.item, e.days, input))],
    [w.soon, input.digest.soon.map((e) => itemLine(e.item, e.days, input))],
    [w.waiting, input.waitingLines],
  ];
  const visible = sections.filter(([, lines]) => lines.length);
  const html = visible
    .map(([heading, lines]) => {
      const items = lines
        .slice(0, SHOWN)
        .map(
          (l) =>
            `<li style="margin:0 0 10px;"><a href="${escapeHtml(l.url)}" style="color:${C.link};font-weight:600;">${escapeHtml(l.title)}</a>` +
            `<br><span style="color:${C['muted-foreground']};font-size:13px;">${escapeHtml(
              [l.when, l.context].filter(Boolean).join(' · '),
            )}</span></li>`,
        )
        .join('');
      const more =
        lines.length > SHOWN
          ? `<p style="margin:0;color:${C['muted-foreground']};">${escapeHtml(w.more(lines.length - SHOWN))}</p>`
          : '';
      return (
        `<h2 style="margin:20px 0 8px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${C.heading};">${escapeHtml(heading)}</h2>` +
        `<ul style="margin:0;padding:0 0 0 18px;">${items}</ul>${more}`
      );
    })
    .join('');
  const text = [
    w.hello(input.name),
    w.intro,
    ...visible.flatMap(([heading, lines]) => [
      '',
      heading.toUpperCase(),
      ...lines
        .slice(0, SHOWN)
        .map(
          (l) => `- ${l.title} (${[l.when, l.context].filter(Boolean).join(' · ')})\n  ${l.url}`,
        ),
      ...(lines.length > SHOWN ? [w.more(lines.length - SHOWN)] : []),
    ]),
    '',
    `${w.open}: ${input.portalUrl}`,
    '',
    w.digestFooter,
  ].join('\n');
  const subject = w.digestSubject(formatDay(input.today, input.lang));
  return {
    subject,
    html: layout(
      subject,
      `<p style="margin:0 0 4px;">${escapeHtml(w.hello(input.name))}</p><p style="margin:0;">${escapeHtml(w.intro)}</p>${html}${button(input.portalUrl, w.open)}`,
      w.digestFooter,
    ),
    text,
  };
}

/** A waiting task, worded for the summary. */
export function waitingLine(
  title: string,
  context: string | null,
  days: number,
  url: string,
  lang: AgendaLanguage,
): DigestLine {
  return { title, context, when: WORDS[lang].waitingFor(days), url };
}

export interface InvitationEmailInput {
  lang: AgendaLanguage;
  name: string | null;
  email: string;
  inviter: string;
  client: string | null;
  link: string;
  /** "YYYY-MM-DD" in Cancún. */
  until: string;
}

export function invitationEmail(input: InvitationEmailInput): Email {
  const w = WORDS[input.lang];
  const hello = w.hello(input.name ?? input.email);
  const invited = w.invited(input.inviter, input.client);
  const how = w.inviteHow(input.email, formatDay(input.until, input.lang));
  return {
    subject: w.inviteSubject,
    html: layout(
      w.inviteSubject,
      `<p style="margin:0 0 12px;">${escapeHtml(hello)}</p><p style="margin:0 0 12px;">${escapeHtml(invited)}</p>` +
        `<p style="margin:0;">${escapeHtml(how)}</p>${button(input.link, w.accept)}` +
        `<p style="margin:16px 0 0;font-size:12px;color:${C['muted-foreground']};word-break:break-all;">${escapeHtml(w.linkLine)}: ${escapeHtml(input.link)}</p>`,
      w.inviteFooter,
    ),
    text: [hello, '', invited, how, '', `${w.accept}: ${input.link}`, '', w.inviteFooter].join(
      '\n',
    ),
  };
}
