import { Fragment } from 'react';
import { linkify, parseNotice, type Block } from './notice.ts';

const LINK = 'break-words text-link underline underline-offset-2';

/** One line of a legal text, with its e-mail and web addresses as links. */
function Line({ text }: { text: string }) {
  return linkify(text).map((piece, i) =>
    'href' in piece ? (
      <a key={i} href={piece.href} className={LINK}>
        {piece.text}
      </a>
    ) : (
      <Fragment key={i}>{piece.text}</Fragment>
    ),
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'h1':
      return <h1 className="text-3xl font-semibold sm:text-4xl">{block.text}</h1>;
    case 'h2':
      return <h2 className="pt-6 text-2xl font-semibold">{block.text}</h2>;
    case 'h3':
      return <h3 className="pt-2 text-xl font-semibold">{block.text}</h3>;
    case 'p':
      return (
        <p>
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <Line text={line} />
            </Fragment>
          ))}
        </p>
      );
    case 'ul':
      return (
        <ul className="list-disc space-y-1 pl-6">
          {block.items.map((item, i) => (
            <li key={i}>
              <Line text={item} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      // On a phone each row becomes a card that names its fields. Changing
      // `display` hides a table from screen readers, so the roles are explicit.
      return (
        <table role="table" className="w-full border-collapse text-left text-sm max-sm:block">
          <thead role="rowgroup" className="max-sm:sr-only">
            <tr role="row">
              {block.head.map((cell, i) => (
                <th
                  key={i}
                  role="columnheader"
                  scope="col"
                  className="border border-border bg-muted px-3 py-2 font-semibold"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup" className="max-sm:block max-sm:space-y-3">
            {block.rows.map((row, r) => (
              <tr
                key={r}
                role="row"
                className="max-sm:block max-sm:rounded-card max-sm:border max-sm:border-border"
              >
                {row.map((cell, c) => (
                  <td
                    key={c}
                    role="cell"
                    data-label={block.head[c]}
                    className="border border-border px-3 py-2 align-top max-sm:block max-sm:border-0 max-sm:border-b max-sm:last:border-b-0 max-sm:before:block max-sm:before:text-xs max-sm:before:font-semibold max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]"
                  >
                    <Line text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

/** A legal text exactly as the firm wrote it (see notice.ts for how it is read). */
export function LegalText({ source }: { source: string }) {
  return (
    <article className="space-y-4 leading-relaxed">
      {parseNotice(source).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </article>
  );
}
