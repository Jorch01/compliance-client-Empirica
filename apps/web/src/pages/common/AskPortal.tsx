import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import type { AiAnswerData, AiStatusData } from '@empirica/shared';
import { useScope } from '../../portal/scope.ts';
import { usePortal } from '../../session/context.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { TextField } from '../../ui/Field.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { aiErrorText, aiOn } from './ai.ts';

/** The partners who administer the portal see today's AI use (online; nothing offline). */
function useAiStatus(enabled: boolean): AiStatusData | null {
  const { call } = usePortal();
  const [status, setStatus] = useState<AiStatusData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    call<AiStatusData>('ai.status', {})
      .then(({ data }) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        /* offline: nothing to show */
      });
    return () => {
      cancelled = true;
    };
  }, [call, enabled]);
  return status;
}

/**
 * "Pregúntale al portal" (IA.md): a question about what this person sees,
 * answered by the AI with names masked, with links to the records it names.
 * Online only; hidden where the AI is off.
 */
export function AskPortal() {
  const { t } = useTranslation();
  const { me, call } = usePortal();
  const { scope } = useScope();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<AiAnswerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = aiOn(me, scope.clientId);
  const status = useAiStatus(on && me.isAdmin);
  if (!on) return null;

  const ask = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const pregunta = question.trim();
    if (pregunta.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await call<AiAnswerData>('ai.ask', {
        pregunta,
        ...(scope.clientId ? { clienteId: scope.clientId } : {}),
      });
      setAnswer(data);
    } catch (e) {
      setAnswer(null);
      setError(aiErrorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Icon name="sparkles" className="size-5 text-heading" />
          {t('ai.askTitle')}
        </span>
      }
    >
      <form className="space-y-2" onSubmit={(e) => void ask(e)}>
        <TextField
          label={t('ai.askLabel')}
          placeholder={t('ai.askPlaceholder')}
          hint={t('ai.askPrivacy')}
          maxLength={500}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
        />
        <Button
          type="submit"
          size="sm"
          icon="search"
          busy={busy}
          disabled={question.trim().length < 3}
        >
          {busy ? t('ai.asking') : t('ai.ask')}
        </Button>
      </form>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger-subtle-foreground">
            {error}
          </p>
        ) : null}
        {answer ? (
          <div className="mt-4 rounded-control border border-border bg-muted p-3">
            <p className="label-caps text-muted-foreground">{t('ai.answer')}</p>
            <p className="mt-1 whitespace-pre-line">{answer.respuesta}</p>
            {answer.enlaces.length ? (
              <>
                <p className="label-caps mt-3 text-muted-foreground">{t('ai.related')}</p>
                <ul className="mt-1 space-y-1">
                  {answer.enlaces.map((l) => (
                    <li key={l.ruta}>
                      <Link href={l.ruta} className="text-link underline-offset-2 hover:underline">
                        {l.titulo}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">{t('ai.disclaimer')}</p>
          </div>
        ) : null}
      </div>
      {status ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {status.agotada
            ? t('ai.errors.AI_QUOTA')
            : status.limiteDiario
              ? t('ai.usage', { used: status.usadasHoy, limit: status.limiteDiario })
              : t('ai.usageNoLimit', { used: status.usadasHoy })}
        </p>
      ) : null}
    </Card>
  );
}
