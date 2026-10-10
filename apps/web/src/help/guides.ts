/**
 * "¿Qué va aquí?" (D79): one guide per section of the portal, so a person
 * learns what to record in each one, with an example, and where something
 * goes when it does not belong here. The texts live in guides-es.ts and
 * guides-en.ts, outside the first load: only the screens that show a guide
 * bring them.
 */
import { useTranslation } from 'react-i18next';
import { guidesEn } from './guides-en.ts';
import { guidesEs } from './guides-es.ts';

export const SECTIONS = [
  'requests',
  'matters',
  'tasks',
  'filings',
  'compliance',
  'contracts',
  'documents',
  'agenda',
] as const;
export type Section = (typeof SECTIONS)[number];

/** The firm records and organizes; a client follows, answers and asks. */
export type Audience = 'firm' | 'client';

/** "If what you have is this, it goes there." */
export interface Pointer {
  text: string;
  to: Section;
}

export interface FieldTip {
  name: string;
  tip: string;
}

export interface Guide {
  title: string;
  /** What the section is for, in a sentence or two. */
  purpose: string;
  /** What gets recorded here (firm), or what the person can do here (client). */
  goes: string[];
  /** What to write in each field; empty where this audience fills nothing in. */
  fields: FieldTip[];
  /** One case, filled in, a line per part. */
  example: string[];
  /** What people confuse with this section, and where it goes instead. */
  notHere: Pointer[];
}

export interface GuideTexts {
  ui: {
    /** The button next to a page's title. */
    button: string;
    /** The dialog's title: "{{section}}: qué va aquí". */
    dialogTitle: string;
    purpose: string;
    goes: Record<Audience, string>;
    fields: string;
    example: string;
    notHere: string;
    /** After a pointer's text: "va en {{section}}". */
    goesIn: string;
    back: string;
    goTo: string;
    close: string;
    whereTitle: Record<Audience, string>;
    whereIntro: Record<Audience, string>;
    mapTitle: string;
    allTitle: string;
  };
  firm: Record<Section, Guide>;
  client: Record<Section, Guide>;
  /** The Help page's "¿Dónde registro…?": situations and their section. */
  where: Record<Audience, Pointer[]>;
  /** How the sections connect, in order. */
  map: Record<Audience, string[]>;
  /** One-line hints under the fields of the forms that create each record. */
  hints: {
    matterTitle: string;
    matterTarget: string;
    taskTitle: string;
    taskSide: string;
    filingTitle: string;
    filingAuthority: string;
    filingFolio: string;
    obligationName: string;
    obligationEvidence: string;
    contractCounterpart: string;
    requestTitle: string;
    requestDetails: string;
    appointmentTitle: string;
  };
}

export function guideTexts(language: string): GuideTexts {
  return language === 'en' ? guidesEn : guidesEs;
}

/** The texts in the interface's language. */
export function useGuideTexts(): GuideTexts {
  const { i18n } = useTranslation();
  return guideTexts(i18n.language);
}

/** Where each section lives; a client's tasks are their "Pendientes". */
export function sectionPath(section: Section, audience: Audience): string {
  switch (section) {
    case 'requests':
      return '/solicitudes';
    case 'matters':
      return '/asuntos';
    case 'tasks':
      return audience === 'firm' ? '/tareas' : '/pendientes';
    case 'filings':
      return '/tramites';
    case 'compliance':
      return '/compliance';
    case 'contracts':
      return '/contratos';
    case 'documents':
      return '/documentos';
    case 'agenda':
      return '/agenda';
  }
}

/** "{{section}}" in a label, filled in. */
export function fill(label: string, section: string): string {
  return label.replace('{{section}}', section);
}
