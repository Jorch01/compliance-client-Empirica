/**
 * The technical details of a report, as they are sent. The box scrolls, so
 * it takes keyboard focus: the details can be read without a mouse.
 */
export function DetailsBlock({ value }: { value: unknown }) {
  return (
    <pre
      tabIndex={0}
      className="mt-2 max-h-48 overflow-auto rounded-control border border-border bg-muted p-3 text-xs whitespace-pre-wrap"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
