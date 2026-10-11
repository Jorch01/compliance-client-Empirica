/**
 * The "¿Qué va aquí?" guides (D79): one per section, for the firm and for
 * clients, the same in both languages, every pointer to another section,
 * and nothing legal made up.
 */
import { describe, expect, it } from 'vitest';
import routes from '../portal/Portal.tsx?raw';
import { guidesEn } from './guides-en.ts';
import { guidesEs } from './guides-es.ts';
import { SECTIONS, guideTexts, sectionPath, type Audience, type Guide } from './guides.ts';

const AUDIENCES: Audience[] = ['firm', 'client'];
const LANGUAGES = { es: guidesEs, en: guidesEn };

/** The part of a guide that must not depend on the language. */
const shape = (guide: Guide) => ({
  goes: guide.goes.length,
  fields: guide.fields.length,
  example: guide.example.length,
  notHere: guide.notHere.map((p) => p.to),
});

describe('the section guides (D79)', () => {
  for (const [language, texts] of Object.entries(LANGUAGES)) {
    for (const audience of AUDIENCES) {
      it(`${language}, ${audience}: every section says what it is for, what goes in it and an example`, () => {
        expect(Object.keys(texts[audience])).toEqual([...SECTIONS]);
        for (const section of SECTIONS) {
          const guide = texts[audience][section];
          expect(guide.title, section).not.toBe('');
          expect(guide.purpose, section).not.toBe('');
          expect(guide.goes.length, section).toBeGreaterThan(0);
          expect(guide.example.length, section).toBeGreaterThan(0);
          expect(guide.notHere.length, section).toBeGreaterThan(0);
          // A pointer always leads somewhere else.
          for (const pointer of guide.notHere) expect(pointer.to, section).not.toBe(section);
        }
      });

      it(`${language}, ${audience}: "¿Dónde…?" leads to every section`, () => {
        const reached = new Set(texts.where[audience].map((p) => p.to));
        expect([...reached].sort()).toEqual([...SECTIONS].sort());
      });
    }
  }

  it('English has the same guides as Spanish, part for part and link for link', () => {
    for (const audience of AUDIENCES) {
      for (const section of SECTIONS) {
        expect(shape(guidesEn[audience][section]), `${audience} ${section}`).toEqual(
          shape(guidesEs[audience][section]),
        );
      }
      expect(guidesEn.where[audience].map((p) => p.to)).toEqual(
        guidesEs.where[audience].map((p) => p.to),
      );
      expect(guidesEn.map[audience]).toHaveLength(guidesEs.map[audience].length);
    }
  });

  it('nothing legal is made up: no articles or legal grounds in the examples', () => {
    for (const texts of Object.values(LANGUAGES)) {
      const all = JSON.stringify(texts);
      expect(all).not.toMatch(/art[íi]culo\s*\d|\bart\.\s*\d|fracci[oó]n|article\s*\d/i);
    }
  });

  it('every section leads to a screen of the portal; a client’s tasks are their to-dos', () => {
    for (const audience of AUDIENCES) {
      for (const section of SECTIONS) {
        expect(routes, `${audience} ${section}`).toContain(
          `path="${sectionPath(section, audience)}"`,
        );
      }
    }
    expect(sectionPath('tasks', 'firm')).toBe('/tareas');
    expect(sectionPath('tasks', 'client')).toBe('/pendientes');
  });

  it('the texts follow the interface language', () => {
    expect(guideTexts('es')).toBe(guidesEs);
    expect(guideTexts('en')).toBe(guidesEn);
    expect(guideTexts('fr')).toBe(guidesEs);
  });
});
