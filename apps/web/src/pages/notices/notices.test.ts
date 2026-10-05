import type { Row, Value } from '@empirica/shared';
import { describe, expect, it } from 'vitest';
import { isUnread, noticeKind, noticePath } from './notices.ts';

const notice = (fields: Record<string, Value>): Row => ({ id: 'n1', ...fields });

describe('notices', () => {
  it('opens the page the notice names, with or without a leading #', () => {
    expect(noticePath(notice({ link: '/tareas/t1' }))).toBe('/tareas/t1');
    expect(noticePath(notice({ link: '#/conflictos/c1' }))).toBe('/conflictos/c1');
    expect(noticePath(notice({ link: 'https://example.test' }))).toBeNull();
    expect(noticePath(notice({ link: null }))).toBeNull();
  });

  it('knows its kind and whether it was read', () => {
    expect(noticeKind(notice({ tipo: 'TAREA_ASIGNADA' }))).toBe('TAREA_ASIGNADA');
    expect(noticeKind(notice({ tipo: 'OTRA_COSA' }))).toBeNull();
    expect(isUnread(notice({ leida: false }))).toBe(true);
    expect(isUnread(notice({ leida: true }))).toBe(false);
  });
});
