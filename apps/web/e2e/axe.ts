/** WCAG 2.2 AA with axe: every violation, named, or an empty list. */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function audit(page: Page, label: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = result.violations.map(
    (v) =>
      `${label}: ${v.id} (${v.impact ?? '?'}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(problems).toEqual([]);
}
