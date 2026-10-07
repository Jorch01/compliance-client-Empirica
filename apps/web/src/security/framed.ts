/**
 * Whether the page runs inside another page's frame, where a site could
 * dress it up and trick a click (clickjacking). GitHub Pages cannot send
 * frame-ancestors, so the portal checks it itself and, framed, only offers
 * to open in its own window (main.tsx).
 */
export function isFramed(win: { readonly top: unknown; readonly self: unknown } = window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    // A cross-origin parent that cannot even be compared: framed.
    return true;
  }
}
