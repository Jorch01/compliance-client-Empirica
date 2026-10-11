/**
 * "¿Qué va aquí?" (D79): the guide of a section, and from it the guides of
 * the sections people confuse it with, and back.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GuideDialog } from './SectionGuide.tsx';
import type { Audience, Section } from './guides.ts';

function renderGuide(section: Section, audience: Audience, here: Section | null = section) {
  const onClose = vi.fn();
  render(<GuideDialog section={section} audience={audience} here={here} onClose={onClose} />);
  return { onClose, dialog: () => screen.getByRole('dialog') };
}

describe('the guide of a section', () => {
  it('says what goes in it, what to write in each field, with an example', () => {
    const { dialog } = renderGuide('matters', 'firm');
    const box = within(dialog());
    expect(box.getByRole('heading', { name: 'Asuntos: qué va aquí' })).toBeInTheDocument();
    expect(box.getByText(/encargo completo del cliente/)).toBeInTheDocument();
    expect(box.getByRole('heading', { name: 'Qué poner en cada campo' })).toBeInTheDocument();
    expect(box.getByText('Fecha objetivo')).toBeInTheDocument();
    expect(box.getByText(/Revisión de los contratos de proveedores/)).toBeInTheDocument();
    // Already on Asuntos: nowhere to go.
    expect(box.queryByRole('link')).toBeNull();
  });

  it('leads to the section something belongs in, and back', () => {
    const { dialog, onClose } = renderGuide('matters', 'firm');
    fireEvent.click(
      within(dialog()).getByRole('button', { name: /Es una sola acción con fecha.*va en Tareas/ }),
    );
    const box = within(dialog());
    expect(box.getByRole('heading', { name: 'Tareas: qué va aquí' })).toBeInTheDocument();
    // The button that was pressed is gone: the focus waits at the new guide's start.
    expect(document.activeElement).toBe(
      box.getByRole('button', { name: 'Volver a Asuntos' }).parentElement,
    );
    expect(box.getByText(/Empieza con un verbo/)).toBeInTheDocument();
    const go = box.getByRole('link', { name: 'Ir a Tareas' });
    expect(go).toHaveAttribute('href', '/tareas');

    fireEvent.click(box.getByRole('button', { name: 'Volver a Asuntos' }));
    expect(
      within(dialog()).getByRole('heading', { name: 'Asuntos: qué va aquí' }),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole('button', { name: /Volver/ })).toBeNull();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Entendido' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a client reads what they can do there, and their tasks are their to-dos', () => {
    const { dialog } = renderGuide('compliance', 'client');
    const box = within(dialog());
    expect(box.getByRole('heading', { name: 'Qué puede hacer aquí' })).toBeInTheDocument();
    expect(box.getByText(/Enviar la evidencia/)).toBeInTheDocument();
    // Clients fill nothing in here.
    expect(box.queryByRole('heading', { name: 'Qué poner en cada campo' })).toBeNull();

    fireEvent.click(box.getByRole('button', { name: /va en Pendientes/ }));
    expect(within(dialog()).getByRole('link', { name: 'Ir a Pendientes' })).toHaveAttribute(
      'href',
      '/pendientes',
    );
  });

  it('from the Help page, every guide leads to its section', () => {
    const { dialog } = renderGuide('filings', 'firm', null);
    expect(within(dialog()).getByRole('link', { name: 'Ir a Trámites' })).toHaveAttribute(
      'href',
      '/tramites',
    );
  });
});
