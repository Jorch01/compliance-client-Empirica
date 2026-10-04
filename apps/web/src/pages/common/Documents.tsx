import { useMemo, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  AREAS,
  FILE_ACCEPT,
  TABLES,
  extensionOf,
  fileMimeType,
  maxFileBytes,
  text,
  validateFields,
  type FileDownloadData,
  type Row,
  type TableName,
  type Value,
  type Visibilidad,
} from '@empirica/shared';
import { ApiCallError } from '../../api/client.ts';
import type { UploadEntry } from '../../data/db.ts';
import { usePendingIds, useRows, useUploads } from '../../data/hooks.ts';
import { useNames } from '../../data/names.ts';
import { can } from '../../domain/access.ts';
import { formatBytes, saveFile } from '../../domain/files.ts';
import { linkOf } from '../../domain/work.ts';
import { currentLanguage, formatDateTime } from '../../i18n/index.ts';
import { areaLabel, denialText } from '../../i18n/labels.ts';
import { configNumber, usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Card, EmptyState } from '../../ui/Card.tsx';
import { ConfirmDialog } from '../../ui/ConfirmDialog.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { SelectField, TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Popover } from '../../ui/Popover.tsx';
import { InternalMark, VisibilityField } from './VisibilityField.tsx';

/** The checks a chosen file must pass before it is queued; null when it may go. */
function fileProblem(t: TFunction, name: string, size: number, mb: number): string | null {
  if (!fileMimeType(name)) return t('documents.wrongType');
  if (size > maxFileBytes(mb)) return t('documents.tooLarge', { mb });
  if (size === 0) return t('documents.emptyFile');
  return null;
}

/** A new document: the record now (offline too), its file as soon as there is network. */
function UploadDialog({
  table,
  record,
  defaultArea,
  onClose,
}: {
  table: TableName;
  record: Row;
  defaultArea: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { me, engine } = usePortal();
  const mb = configNumber(me, 'mbMaxArchivo', 10);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [area, setArea] = useState(defaultArea);
  const [visibilidad, setVisibilidad] = useState<Visibilidad>('INTERNO');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError(t('documents.chooseFile'));
      return;
    }
    // The name keeps the file's extension: it decides how the file opens.
    const ext = extensionOf(file.name);
    const base = name.trim() || file.name;
    const nombre = extensionOf(base) === ext ? base : `${base}.${ext}`;
    const problem = fileProblem(t, nombre, file.size, mb);
    if (problem) {
      setError(problem);
      return;
    }
    const fields: Record<string, Value> = {
      clienteId: text(record, 'clienteId'),
      entidadId: text(record, 'entidadId'),
      vinculo: { tipo: table, id: record.id },
      nombre,
      mimeType: fileMimeType(nombre),
      tamanoBytes: file.size,
      visibilidad: me.isFirm ? visibilidad : 'COMPARTIDO',
      categoria: area || null,
      subidoPor: me.id,
    };
    const check = validateFields(TABLES.Documentos, fields);
    if (!check.ok) {
      setError(t('errors.VALIDATION'));
      return;
    }
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const id = crypto.randomUUID();
      await engine.mutate('Documentos', 'create', id, check.fields);
      await engine.queueFile(id, { data, nombre, size: file.size });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      title={t('documents.upload')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="upload-form" icon="check" busy={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="upload-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
        <TextField
          type="file"
          label={t('documents.file')}
          hint={t('documents.fileHint', { mb })}
          accept={FILE_ACCEPT}
          required
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null;
            setFile(chosen);
            if (chosen && !name) setName(chosen.name);
          }}
        />
        <TextField
          label={t('documents.name')}
          maxLength={200}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <SelectField
          label={t('fields.area')}
          value={area}
          onChange={(e) => {
            setArea(e.target.value);
          }}
          options={[
            { value: '', label: t('documents.noArea') },
            ...AREAS.map((a) => ({ value: a, label: areaLabel(t, a) })),
          ]}
        />
        {me.isFirm ? (
          <VisibilityField
            value={visibilidad}
            onChange={setVisibilidad}
            hint={t('documents.visibilityHint')}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t('documents.clientShared')}</p>
        )}
      </form>
    </Dialog>
  );
}

/** A document: name, area, size, who sent it; its file to download; the firm's actions. */
export function DocumentItem({
  doc,
  upload,
  pending,
  where,
}: {
  doc: Row;
  upload: UploadEntry | undefined;
  pending: boolean;
  /** What it belongs to, on the pages that list documents of many records. */
  where?: ReactNode;
}) {
  const { t } = useTranslation();
  const { me, engine, call } = usePortal();
  const names = useNames();
  const clientId = text(doc, 'clienteId');
  const mb = configNumber(me, 'mbMaxArchivo', 10);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const version = typeof doc.versionDoc === 'number' ? doc.versionDoc : 0;
  // Clients never receive the Drive id: a version number says the file is there.
  const hasFile = version > 0 || Boolean(text(doc, 'driveFileId'));
  const size = typeof doc.tamanoBytes === 'number' ? doc.tamanoBytes : null;
  const canEdit = me.isFirm && can(me, 'Documentos', 'update', clientId);
  const canDelete = me.isFirm && can(me, 'Documentos', 'delete', clientId);

  const download = async (): Promise<void> => {
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await call<FileDownloadData>('files.download', { documentoId: doc.id });
      saveFile(data.nombre, data.mimeType, data.base64);
    } catch (error) {
      setMessage(
        error instanceof ApiCallError
          ? denialText(t, error.reason, error.code)
          : t('documents.offline'),
      );
    } finally {
      setBusy(false);
    }
  };

  /** A new file for this document (firm): the record keeps its name, unless the type changes. */
  const replace = async (file: File): Promise<void> => {
    setMessage(null);
    const current = text(doc, 'nombre') ?? file.name;
    const nombre =
      extensionOf(current) === extensionOf(file.name)
        ? current
        : `${current.replace(/\.[^.]+$/, '')}.${extensionOf(file.name)}`;
    const problem = fileProblem(t, nombre, file.size, mb);
    if (problem) {
      setMessage(problem);
      return;
    }
    if (nombre !== current) {
      await engine.mutate('Documentos', 'update', doc.id, {
        nombre,
        mimeType: fileMimeType(nombre),
      });
    }
    await engine.queueFile(doc.id, { data: await file.arrayBuffer(), nombre, size: file.size });
  };

  const status = upload?.error ? (
    <p role="alert" className="text-sm font-medium text-danger-subtle-foreground">
      {t('documents.uploadFailed', {
        reason: denialText(t, upload.error.reason, upload.error.code),
      })}
    </p>
  ) : upload ? (
    <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Icon name="cloudOff" className="size-4" />
      {t('documents.pendingUpload')}
    </p>
  ) : !hasFile ? (
    <p className="text-sm text-muted-foreground">{t('documents.noFile')}</p>
  ) : null;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <Icon name="file" className="mt-0.5 size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-medium break-words">
            {text(doc, 'nombre')}
            {me.isFirm && doc.visibilidad === 'INTERNO' ? <InternalMark /> : null}
          </p>
          {where ? <p className="text-sm">{where}</p> : null}
          <p className="text-sm text-muted-foreground">
            {[
              areaLabel(t, doc.categoria),
              size !== null ? formatBytes(size, currentLanguage()) : '',
              version > 1 ? t('documents.version', { n: version }) : '',
              names.user(text(doc, 'subidoPor')),
              formatDateTime(text(doc, 'createdAt')),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {status}
          {pending && !upload ? (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="cloudOff" className="size-3.5" />
              {t('common.pendingSync')}
            </p>
          ) : null}
          {message ? (
            <p role="alert" className="mt-1 text-sm text-danger-subtle-foreground">
              {message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasFile ? (
            <Button
              size="sm"
              variant="secondary"
              icon="download"
              busy={busy}
              onClick={() => void download()}
            >
              {t('documents.download')}
            </Button>
          ) : null}
          {upload?.error ? (
            <Button size="sm" variant="ghost" onClick={() => void engine.dropFile(doc.id)}>
              {t('documents.dropFile')}
            </Button>
          ) : null}
          {canEdit ? (
            <input
              ref={picker}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void replace(file);
              }}
            />
          ) : null}
          {canEdit || canDelete ? (
            <Popover
              className="w-64 p-2"
              trigger={(props) => (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="more"
                  aria-label={t('documents.more', { name: text(doc, 'nombre') ?? '' })}
                  {...props}
                />
              )}
            >
              {(close) => (
                <div className="flex flex-col items-stretch">
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      icon="refresh"
                      className="justify-start"
                      onClick={() => {
                        close();
                        picker.current?.click();
                      }}
                    >
                      {t('documents.newVersion')}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      icon={doc.visibilidad === 'INTERNO' ? 'users' : 'lock'}
                      className="justify-start"
                      onClick={() => {
                        close();
                        void engine.mutate('Documentos', 'update', doc.id, {
                          visibilidad: doc.visibilidad === 'INTERNO' ? 'COMPARTIDO' : 'INTERNO',
                        });
                      }}
                    >
                      {doc.visibilidad === 'INTERNO'
                        ? t('documents.share')
                        : t('documents.makeInternal')}
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="ghost"
                      icon="trash"
                      className="justify-start"
                      onClick={() => {
                        close();
                        setConfirm(true);
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  ) : null}
                </div>
              )}
            </Popover>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('documents.deleteTitle')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          void engine.mutate('Documentos', 'delete', doc.id).then(() => engine.dropFile(doc.id));
          setConfirm(false);
        }}
        onClose={() => {
          setConfirm(false);
        }}
      >
        <p>{t('documents.deleteBody')}</p>
      </ConfirmDialog>
    </li>
  );
}

/** The documents of a matter or a task, with their files. */
export function Documents({
  table,
  record,
  defaultArea = '',
}: {
  table: TableName;
  record: Row;
  defaultArea?: string;
}) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const clientId = text(record, 'clienteId') ?? '';
  const all = useRows('Documentos', clientId);
  const uploads = useUploads();
  const pending = usePendingIds('Documentos');
  const [adding, setAdding] = useState(false);
  const docs = useMemo(
    () =>
      (all ?? [])
        .filter((d) => {
          const link = linkOf(d);
          return link?.tipo === table && link.id === record.id;
        })
        .sort((a, b) => (text(b, 'createdAt') ?? '').localeCompare(text(a, 'createdAt') ?? '')),
    [all, table, record.id],
  );
  return (
    <Card
      title={t('documents.title')}
      actions={
        can(me, 'Documentos', 'create', clientId) ? (
          <Button
            size="sm"
            icon="plus"
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('documents.upload')}
          </Button>
        ) : undefined
      }
    >
      {docs.length === 0 ? (
        <EmptyState icon="file" title={t('documents.empty')} />
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <DocumentItem
              key={d.id}
              doc={d}
              upload={uploads.get(d.id)}
              pending={pending.has(d.id)}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <UploadDialog
          table={table}
          record={record}
          defaultArea={defaultArea}
          onClose={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </Card>
  );
}
