import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'wouter';
import { reportId, text, type AiTextData, type ReportSendData, type Row } from '@empirica/shared';
import { useRow, useRows } from '../data/hooks.ts';
import { useNames } from '../data/names.ts';
import { todayInCancun } from '../domain/deadlines.ts';
import { bytesToBase64, saveBlob } from '../domain/files.ts';
import { apiErrorText } from '../i18n/errors.ts';
import { formatDateTime, i18n } from '../i18n/index.ts';
import { clientName } from '../portal/scope.ts';
import { usePortal } from '../session/context.ts';
import { Button } from '../ui/Button.tsx';
import { buttonClass } from '../ui/button-class.ts';
import { Card, EmptyState, PageHeader, Spinner } from '../ui/Card.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { SelectField, TextArea } from '../ui/Field.tsx';
import { Icon } from '../ui/Icon.tsx';
import { aiErrorText, aiOn } from './common/ai.ts';
import { DownloadReport } from './Reports.tsx';
import { useReportModel } from './reports/data.ts';
import { reportDoc, type ReportLang } from './reports/doc.ts';
import { renderReportPdf } from './reports/pdf.ts';
import { ReportPreview } from './reports/Preview.tsx';
import {
  PERIOD_PATTERN,
  maySendReport,
  periodText,
  reportFileName,
  reportLang,
  useRecipients,
} from './reports/reports.ts';

function Notice({ tone, children }: { tone: 'success' | 'info' | 'warning'; children: string }) {
  const style = {
    success: 'border-success-border bg-success-subtle text-success-subtle-foreground',
    info: 'border-info-border bg-info-subtle text-info-subtle-foreground',
    warning: 'border-warning-border bg-warning-subtle text-warning-subtle-foreground',
  }[tone];
  return (
    <p role="status" className={`mb-6 rounded-card border px-4 py-3 ${style}`}>
      {children}
    </p>
  );
}

const paragraphs = (value: string | null): string[] =>
  (value ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** A sent report: its summary, when and by whom, and the PDF the client received. */
function SentReport({ row, cliente, result }: { row: Row; cliente: Row; result: string | null }) {
  const { t } = useTranslation();
  const { me } = usePortal();
  const names = useNames();
  const periodo = text(row, 'periodo') ?? '';
  const recipients = Array.isArray(row.enviadoA)
    ? row.enviadoA.filter((e): e is string => typeof e === 'string')
    : [];
  return (
    <>
      <PageHeader
        eyebrow={t('reports.eyebrow', { client: clientName(cliente) })}
        title={periodText(periodo)}
        actions={<DownloadReport reporteId={row.id} />}
      >
        <Link href="/reportes" className="mt-2 inline-flex items-center gap-1 text-sm text-link">
          <Icon name="chevronLeft" className="size-4" />
          {t('reports.back')}
        </Link>
      </PageHeader>
      {result ? <Notice tone="success">{result}</Notice> : null}
      <Card>
        <p className="mb-4 flex items-start gap-2 text-sm text-muted-foreground">
          <Icon name="lock" className="mt-0.5 size-4" />
          {t('reports.frozen', {
            date: formatDateTime(text(row, 'fecha')),
            name: names.user(text(row, 'enviadoPor')) || '—',
          })}
        </p>
        <h2 className="mb-2 text-xl font-semibold">{t('reports.summary')}</h2>
        {paragraphs(text(row, 'resumen')).map((p, i) => (
          <p key={i} className="mb-2 whitespace-pre-line">
            {p}
          </p>
        ))}
        {me.isFirm && recipients.length ? (
          <>
            <h2 className="mt-6 mb-2 text-xl font-semibold">{t('reports.recipients')}</h2>
            <ul className="list-disc pl-5 text-sm">
              {recipients.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>
    </>
  );
}

/**
 * The firm prepares a month's report: the summary (written, or drafted by
 * the AI and corrected), the language, the preview with today's data, the
 * PDF, and sending it, which freezes it.
 */
function DraftReport({
  row,
  cliente,
  periodo,
  onSent,
}: {
  row: Row | null;
  cliente: Row;
  periodo: string;
  onSent: (message: string) => void;
}) {
  const { t } = useTranslation();
  const { me, engine, call, db } = usePortal();
  const names = useNames();
  const id = row?.id ?? reportId(cliente.id, periodo);
  const today = todayInCancun();
  const savedSummary = row ? (text(row, 'resumen') ?? '') : '';
  const savedLang = reportLang(row, cliente);
  const [summary, setSummary] = useState(savedSummary);
  const [lang, setLang] = useState<ReportLang>(savedLang);
  const [message, setMessage] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [proposal, setProposal] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = useReportModel(cliente.id, periodo, today);
  const entidades = useRows('Entidades', cliente.id);
  const recipients = useRecipients(cliente.id);
  const units = useMemo(
    () => new Map((entidades ?? []).map((e) => [e.id, text(e, 'nombre') ?? ''] as const)),
    [entidades],
  );
  const signer = names.user(text(cliente, 'abogadoResponsableId')) || me.name;
  const doc = useMemo(
    () =>
      model
        ? reportDoc({
            model,
            t: i18n.getFixedT(lang),
            lang,
            client: text(cliente, 'razonSocial') ?? clientName(cliente),
            units,
            summary,
            signer,
          })
        : null,
    [model, lang, cliente, units, summary, signer],
  );
  const dirty = !row || summary !== savedSummary || lang !== savedLang;
  const maySend = maySendReport(me, cliente.id);
  const fileName = reportFileName(periodo, clientName(cliente), lang);

  const save = async (): Promise<void> => {
    await engine.mutate(
      'Reportes',
      row ? 'update' : 'create',
      id,
      row
        ? { resumen: summary, idioma: lang }
        : { clienteId: cliente.id, periodo, estado: 'BORRADOR', resumen: summary, idioma: lang },
    );
  };

  const draftWithAi = async (): Promise<void> => {
    setDrafting(true);
    setError(null);
    try {
      const { data } = await call<AiTextData>('ai.summary', {
        clienteId: cliente.id,
        periodo,
        idioma: lang,
      });
      if (summary.trim()) setProposal(data.texto);
      else setSummary(data.texto);
    } catch (e) {
      setError(aiErrorText(t, e));
    } finally {
      setDrafting(false);
    }
  };

  const downloadPdf = async (): Promise<void> => {
    if (!doc) return;
    setPdfBusy(true);
    setError(null);
    try {
      saveBlob(fileName, await renderReportPdf(doc));
    } catch {
      setError(t('reports.pdfFailed'));
    } finally {
      setPdfBusy(false);
    }
  };

  const send = async (): Promise<void> => {
    if (!doc) return;
    setSending(true);
    setError(null);
    try {
      // The server must hold the draft as reviewed: saved and sent first.
      if (dirty) await save();
      await engine.sync();
      const waiting = await db.outbox.where('[table+id]').equals(['Reportes', id]).count();
      if (waiting) {
        setError(t('reports.offlineSend'));
        return;
      }
      const pdf = bytesToBase64(await (await renderReportPdf(doc)).arrayBuffer());
      const { data } = await call<ReportSendData>('reports.send', { reporteId: id, pdf });
      await engine.accept('Reportes', [data.row]);
      onSent(
        data.emailError === 'NO_RECIPIENTS' ||
          data.emailError === 'QUOTA' ||
          data.emailError === 'NO_PERMISSION'
          ? t(`reports.emailError.${data.emailError}`)
          : data.emailError
            ? t('reports.emailError.other', { error: data.emailError })
            : t('reports.sent', { count: data.enviadoA.length }),
      );
    } catch (e) {
      setError(apiErrorText(t, e));
    } finally {
      setSending(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={t('reports.eyebrow', { client: clientName(cliente) })}
        title={periodText(periodo)}
        actions={
          <>
            <Button
              variant="secondary"
              icon="download"
              busy={pdfBusy}
              busyLabel={t('reports.generating')}
              disabled={!doc}
              onClick={() => void downloadPdf()}
            >
              {t('reports.pdf')}
            </Button>
            {maySend ? (
              <Button
                icon="send"
                disabled={!doc}
                onClick={() => {
                  setConfirm(true);
                }}
              >
                {t('reports.send')}
              </Button>
            ) : null}
          </>
        }
      >
        <Link href="/reportes" className="mt-2 inline-flex items-center gap-1 text-sm text-link">
          <Icon name="chevronLeft" className="size-4" />
          {t('reports.back')}
        </Link>
        {!maySend ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('reports.assistantNote')}</p>
        ) : null}
      </PageHeader>
      {message ? <Notice tone="info">{message}</Notice> : null}
      {error ? (
        <p
          role="alert"
          className="mb-6 rounded-card border border-danger-border bg-danger-subtle px-4 py-3 text-danger-subtle-foreground"
        >
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title={t('reports.summary')} className="self-start">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save().then(() => {
                setMessage(t('reports.saved'));
              });
            }}
          >
            <TextArea
              label={t('reports.summary')}
              hint={t('reports.summaryHint')}
              rows={10}
              maxLength={4000}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setMessage(null);
              }}
            />
            <SelectField
              label={t('reports.language')}
              value={lang}
              onChange={(e) => {
                setLang(e.target.value === 'en' ? 'en' : 'es');
                setMessage(null);
              }}
              options={[
                { value: 'es', label: t('language.es') },
                { value: 'en', label: t('language.en') },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary" icon="check" disabled={!dirty}>
                {t('reports.save')}
              </Button>
              {aiOn(me, cliente.id) ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="sparkles"
                  busy={drafting}
                  busyLabel={t('reports.drafting')}
                  onClick={() => void draftWithAi()}
                >
                  {t('reports.draftWithAi')}
                </Button>
              ) : null}
            </div>
            {aiOn(me, cliente.id) ? (
              <p className="text-sm text-muted-foreground">{t('reports.aiPrivacy')}</p>
            ) : null}
          </form>
        </Card>
        <section aria-labelledby="preview-title" className="min-w-0">
          <h2 id="preview-title" className="text-xl font-semibold">
            {t('reports.preview')}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">{t('reports.previewHint')}</p>
          {doc ? <ReportPreview doc={doc} /> : <Spinner label={t('common.loading')} />}
        </section>
      </div>

      <ConfirmDialog
        open={proposal !== null}
        title={t('reports.replaceTitle')}
        confirmLabel={t('reports.replace')}
        onConfirm={() => {
          if (proposal !== null) setSummary(proposal);
          setProposal(null);
        }}
        onClose={() => {
          setProposal(null);
        }}
      >
        <p>{t('reports.replaceBody')}</p>
        <p className="mt-3 rounded-control bg-muted p-3 text-sm whitespace-pre-line">{proposal}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm}
        title={t('reports.sendTitle', { period: periodText(periodo) })}
        confirmLabel={t('reports.sendConfirm')}
        busy={sending}
        onConfirm={() => void send()}
        onClose={() => {
          if (!sending) setConfirm(false);
        }}
      >
        {recipients.length ? (
          <>
            <p>{t('reports.sendBody')}</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {recipients.map((r) => (
                <li key={r.email}>{`${r.name} · ${r.email}`}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>{t('reports.sendNobody', { client: clientName(cliente) })}</p>
        )}
        {!summary.trim() ? (
          <p className="mt-3 text-sm font-medium">{t('reports.sendNoSummary')}</p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

/** /reportes/:clienteId/:periodo — the month's report of a client. */
export function ReportDetailPage() {
  const { t } = useTranslation();
  const { me } = usePortal();
  const params = useParams<{ clienteId: string; periodo: string }>();
  const periodo = params.periodo;
  const valid = PERIOD_PATTERN.test(periodo);
  const cliente = useRow('Clientes', params.clienteId);
  const reportes = useRows('Reportes', params.clienteId);
  // One report per client and month: found by both (a sent one first), whatever its id.
  const row =
    reportes === undefined
      ? undefined
      : (reportes
          .filter((r) => r.periodo === periodo)
          .sort((a, b) => Number(b.estado === 'ENVIADO') - Number(a.estado === 'ENVIADO'))[0] ??
        null);
  const [sent, setSent] = useState<string | null>(null);

  const missing = (
    <EmptyState
      icon="search"
      title={t('notFound.title')}
      action={
        <Link href="/reportes" className={`${buttonClass('primary')} mt-2`}>
          {t('reports.back')}
        </Link>
      }
    />
  );
  if (!valid) return missing;
  if (cliente === undefined || row === undefined) return <Spinner label={t('common.loading')} />;
  if (!cliente) return missing;
  if (row?.estado === 'ENVIADO') return <SentReport row={row} cliente={cliente} result={sent} />;
  if (!me.isFirm) return missing;
  return (
    <DraftReport
      key={`${cliente.id}/${periodo}`}
      row={row}
      cliente={cliente}
      periodo={periodo}
      onSent={setSent}
    />
  );
}
