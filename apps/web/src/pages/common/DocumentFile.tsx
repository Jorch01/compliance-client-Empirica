import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { text, type FileDownloadData } from '@empirica/shared';
import { ApiCallError } from '../../api/client.ts';
import { useRow, useUploads } from '../../data/hooks.ts';
import { saveFile } from '../../domain/files.ts';
import { denialText } from '../../i18n/labels.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/Icon.tsx';

/**
 * One document named by another record (a compliance record's evidence, a
 * contract's signed copy): its name and its file to download, or why it
 * cannot be downloaded yet. Nothing when the document is gone or unseen.
 */
export function DocumentFile({ docId }: { docId: string }) {
  const { t } = useTranslation();
  const { call } = usePortal();
  const doc = useRow('Documentos', docId);
  const uploads = useUploads();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!doc || doc.deleted) return null;
  const upload = uploads.get(docId);
  // Clients never receive the Drive id: a version number says the file is there.
  const hasFile =
    (typeof doc.versionDoc === 'number' && doc.versionDoc > 0) || Boolean(doc.driveFileId);

  const download = async (): Promise<void> => {
    setMessage(null);
    setBusy(true);
    try {
      const { data } = await call<FileDownloadData>('files.download', { documentoId: docId });
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

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <Icon name="file" className="size-4 text-muted-foreground" />
      <span className="break-words">{text(doc, 'nombre')}</span>
      {upload?.error ? (
        <span role="alert" className="font-medium text-danger-subtle-foreground">
          {t('documents.uploadFailed', {
            reason: denialText(t, upload.error.reason, upload.error.code),
          })}
        </span>
      ) : upload ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Icon name="cloudOff" className="size-3.5" />
          {t('documents.pendingUpload')}
        </span>
      ) : hasFile ? (
        <Button
          size="sm"
          variant="secondary"
          icon="download"
          busy={busy}
          aria-label={`${t('documents.download')}: ${text(doc, 'nombre') ?? ''}`}
          onClick={() => void download()}
        >
          {t('documents.download')}
        </Button>
      ) : (
        <span className="text-muted-foreground">{t('documents.noFile')}</span>
      )}
      {message ? (
        <span role="alert" className="text-danger-subtle-foreground">
          {message}
        </span>
      ) : null}
    </div>
  );
}
