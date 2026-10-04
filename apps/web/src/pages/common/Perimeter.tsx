import { useTranslation } from 'react-i18next';
import { parsePerimeter, type Row } from '@empirica/shared';
import { Icon } from '../../ui/Icon.tsx';

/**
 * What a client's retainer covers and leaves out, in the firm's words
 * (`Clientes.perimetroIguala`). The client sees it too (PERMISOS.md, note 2).
 */
export function Perimeter({ client }: { client: Row | undefined }) {
  const { t } = useTranslation();
  if (!client) return null;
  if (client.servicio !== 'FLT_IGUALA') {
    return <p className="text-sm text-muted-foreground">{t('requests.noRetainer')}</p>;
  }
  const p = parsePerimeter(client.perimetroIguala);
  if (!p.cubiertos.length && !p.excluidos.length) {
    return <p className="text-sm text-muted-foreground">{t('requests.perimeterEmpty')}</p>;
  }
  return (
    <div className="space-y-4">
      {p.cubiertos.length ? (
        <div>
          <p className="label-caps text-muted-foreground">{t('requests.covered')}</p>
          <ul className="mt-1 space-y-1">
            {p.cubiertos.map((line) => (
              <li key={line} className="flex gap-2">
                <Icon name="check" className="mt-0.5 size-4 text-success" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.excluidos.length ? (
        <div>
          <p className="label-caps text-muted-foreground">{t('requests.excluded')}</p>
          <ul className="mt-1 space-y-1">
            {p.excluidos.map((line) => (
              <li key={line} className="flex gap-2">
                <Icon name="x" className="mt-0.5 size-4 text-muted-foreground" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
