import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { AREAS, text } from '@empirica/shared';
import { usePendingIds, useRows, useUploads } from '../data/hooks.ts';
import { linkOf } from '../domain/work.ts';
import { areaLabel } from '../i18n/labels.ts';
import { useScope, useScopedRows } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Card, EmptyState, PageHeader } from '../ui/Card.tsx';
import { SelectField, TextField } from '../ui/Field.tsx';
import { DocumentItem } from './common/Documents.tsx';

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * "Documentos": every document in view, newest first, with the matter or
 * task it belongs to. Uploading happens there, where the context is.
 */
export function DocumentsPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const { scope } = useScope();
  const docs = useScopedRows('Documentos');
  const asuntos = useRows('Asuntos', scope.clientId);
  const tareas = useRows('Tareas', scope.clientId);
  const uploads = useUploads();
  const pending = usePendingIds('Documentos');
  const [area, setArea] = useState('');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const matters = new Map((asuntos ?? []).map((a) => [a.id, a]));
    const tasks = new Map((tareas ?? []).map((x) => [x.id, x]));
    const q = fold(query.trim());
    return (docs ?? [])
      .flatMap((doc) => {
        const link = linkOf(doc);
        // Out of sight with what it belongs to (a deleted matter or task).
        const matter = link?.tipo === 'Asuntos' ? matters.get(link.id) : undefined;
        const task = link?.tipo === 'Tareas' ? tasks.get(link.id) : undefined;
        const owner: { href: string; label: string } | null = matter
          ? { href: `/asuntos/${matter.id}`, label: text(matter, 'titulo') ?? '' }
          : task
            ? { href: `/tareas/${task.id}`, label: text(task, 'titulo') ?? '' }
            : null;
        if ((link?.tipo === 'Asuntos' || link?.tipo === 'Tareas') && !owner) return [];
        return [{ doc, owner }];
      })
      .filter(({ doc }) => !area || doc.categoria === area)
      .filter(({ doc }) => !q || fold(text(doc, 'nombre') ?? '').includes(q))
      .sort((a, b) =>
        (text(b.doc, 'createdAt') ?? '').localeCompare(text(a.doc, 'createdAt') ?? ''),
      );
  }, [docs, asuntos, tareas, area, query]);

  return (
    <>
      <PageHeader title={t('documents.title')}>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {me.isFirm ? t('documents.intro') : t('documents.introClient')}
        </p>
      </PageHeader>
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('common.search')}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <SelectField
            label={t('fields.area')}
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
            }}
            options={[
              { value: '', label: t('matters.anyArea') },
              ...AREAS.map((a) => ({ value: a, label: areaLabel(t, a) })),
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState icon="copy" title={t('documents.empty')} />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map(({ doc, owner }) => (
              <DocumentItem
                key={doc.id}
                doc={doc}
                upload={uploads.get(doc.id)}
                pending={pending.has(doc.id)}
                where={
                  owner ? (
                    <Link href={owner.href} className="text-link hover:underline">
                      {owner.label}
                    </Link>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
