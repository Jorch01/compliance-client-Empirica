/**
 * Email (F5), against the fake MailApp: the daily summary (D14) and the
 * invitations sent by the portal.
 */
import type { InvitationOutcome } from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { SCOPES } from './consent.ts';
import { runDigest } from './mail/digest.ts';
import { PROP } from './env.ts';
import { createWorld, type World } from './testing/harness.ts';

const to = (w: World, email: string) => w.google.mail.sent.filter((m) => m.to === email);
const only = (w: World, email: string) => {
  const [first, ...more] = to(w, email);
  if (!first || more.length)
    throw new Error(`${email}: ${String(more.length + (first ? 1 : 0))} emails`);
  return first;
};

/** A world where one shared task falls due tomorrow: everyone of client A has something to read. */
function withTomorrow(): World {
  const w = createWorld();
  w.edit('Tareas', ID.tNorte1, { fechaLimite: '2026-10-03' });
  return w;
}

describe('the daily summary', () => {
  it('goes to each person with what they may see, once a day, from its hour on', () => {
    const w = withTomorrow();
    const report = runDigest(w.env);
    expect(report).toMatchObject({ skipped: null, failed: 0 });
    expect(report.sent).toBeGreaterThan(0);
    const colab = only(w, 'norte@cliente-a.example');
    expect(colab.subject).toBe('Resumen del portal · 2 oct 2026');
    expect(colab.body).toContain('Vence: Entregar acta constitutiva');
    expect(colab.body).toContain('mañana');
    expect(colab.htmlBody).toContain('#/tareas/');
    // A user of the south unit does not read about the north.
    expect(to(w, 'sur@cliente-a.example').every((m) => !m.body.includes('Entregar acta'))).toBe(
      true,
    );
    // The client's internal obligation is overdue: only the firm reads about it.
    const internal = `#/compliance/${ID.obInterna}`;
    expect(only(w, 'admin@cliente-a.example').body).not.toContain(internal);
    expect(only(w, 'abogado@despacho.example').body).toContain(internal);

    expect(runDigest(w.env).skipped).toBe('DONE');
    // The next day, not before its hour.
    w.clock.set('2026-10-03T06:30:00.000-05:00');
    expect(runDigest(w.env).skipped).toBe('EARLY');
    w.clock.set('2026-10-03T07:05:00.000-05:00');
    expect(runDigest(w.env).skipped).toBeNull();
    expect(w.google.props.get(PROP.digestSent)).toBe('2026-10-03');
  });

  it('waits for the owner’s permission to email, without closing the day', () => {
    const w = withTomorrow();
    w.google.grantedScopes.delete(SCOPES.mail);
    expect(runDigest(w.env).skipped).toBe('NO_PERMISSION');
    expect(w.google.props.has(PROP.digestSent)).toBe(false);
    expect(w.rows('Notificaciones').filter((n) => n.tipo === 'CUOTA_CORREO')).toEqual([]);
    // Granted later that day: the next hourly run sends it.
    w.google.grantedScopes.add(SCOPES.mail);
    expect(runDigest(w.env)).toMatchObject({ skipped: null, failed: 0, noQuota: 0 });
    expect(to(w, 'norte@cliente-a.example')).toHaveLength(1);
  });

  it('answers to the client’s lawyer, in each person’s language', () => {
    const w = withTomorrow();
    w.ok('profile.update', { idioma: 'en' }, { as: ID.cColab });
    runDigest(w.env);
    const colab = only(w, 'norte@cliente-a.example');
    expect(colab).toMatchObject({
      name: 'Empírica Portal',
      replyTo: 'abogado@despacho.example',
    });
    expect(colab.subject).toBe('Portal summary · Oct 2, 2026');
    expect(colab.body).toContain('Due: Entregar acta constitutiva');
    // The firm's own summary has nobody to answer to.
    expect(only(w, 'abogado@despacho.example').replyTo).toBeUndefined();
  });

  it('respects whoever turned it off, and says nothing on a quiet day', () => {
    const w = withTomorrow();
    w.ok('profile.update', { resumenDiario: false }, { as: ID.cAdmin });
    expect(w.row('Usuarios', ID.cAdmin)?.prefsNotificacion).toEqual({ resumenDiario: false });
    const report = runDigest(w.env);
    expect(to(w, 'admin@cliente-a.example')).toEqual([]);
    expect(report.optedOut).toBe(1);

    const quiet = createWorld({ data: null, adminEmails: 'socia@despacho.example' });
    expect(runDigest(quiet.env)).toMatchObject({ sent: 0, empty: 1 });
    expect(quiet.google.mail.sent).toEqual([]);
  });

  it('keeps the emails meant for invitations, and tells the partners when they run short', () => {
    const w = withTomorrow();
    w.google.mail.quota = 12;
    const report = runDigest(w.env);
    // The setting keeps 10 back: two summaries go, clients first.
    expect(report.sent).toBe(2);
    expect(report.noQuota).toBeGreaterThan(0);
    expect(w.google.mail.sent.every((m) => m.to.endsWith('@cliente-a.example'))).toBe(true);
    expect(
      w
        .rows('Notificaciones')
        .filter((n) => n.tipo === 'CUOTA_CORREO')
        .map((n) => [n.usuarioId, n.mensaje]),
    ).toEqual([[ID.socio, '10']]);
  });

  it('reminds whoever must answer a task waiting for the client, every few days', () => {
    const w = createWorld();
    w.edit('Tareas', ID.tSurAsignada, {
      estado: 'EN_ESPERA_CLIENTE',
      enEsperaDesde: '2026-09-29T09:00:00.000-05:00',
    });
    runDigest(w.env);
    expect(only(w, 'norte@cliente-a.example').body).toContain('ESPERAN SU RESPUESTA');
    expect(only(w, 'norte@cliente-a.example').body).toContain(
      'Firmar contrato (lleva 3 días en espera',
    );
    // Not to the admin of the south unit: the task is someone else's.
    expect(
      to(w, 'sur@cliente-a.example').every((m) => !m.body.includes('Firmar contrato (lleva')),
    ).toBe(true);
  });

  it('escapes what people typed', () => {
    const w = createWorld();
    w.edit('Tareas', ID.tNorte1, { fechaLimite: '2026-10-03', titulo: '<b>Acta</b> & "firmas"' });
    runDigest(w.env);
    const html = only(w, 'norte@cliente-a.example').htmlBody ?? '';
    expect(html).toContain('&lt;b&gt;Acta&lt;/b&gt; &amp; &quot;firmas&quot;');
    expect(html).not.toContain('<b>Acta</b>');
  });
});

describe('invitations by email', () => {
  const invite = (w: World, as: string, email: string, extra: Record<string, unknown> = {}) =>
    w.ok<InvitationOutcome>(
      'invitations.create',
      {
        email,
        nombre: 'Persona Nueva',
        lado: 'CLIENTE',
        rol: 'CLIENTE_COLABORADOR',
        clienteId: ID.clienteA,
        enviarCorreo: true,
        ...extra,
      },
      { as },
    );

  it('emails the link, and still returns it to share by hand', () => {
    const w = createWorld();
    const outcome = invite(w, ID.socio, 'nueva@cliente-a.example');
    expect(outcome.emailedTo).toBe('nueva@cliente-a.example');
    const email = only(w, 'nueva@cliente-a.example');
    expect(email).toMatchObject({
      subject: 'Te invitaron al portal de Empírica Legal Lab',
      replyTo: 'socia@despacho.example',
      name: 'Empírica Portal',
    });
    expect(email.body).toContain(`https://portal.empirica.mx/#/invitacion/${outcome.token ?? ''}`);
    expect(email.body).toContain(
      'Socia Demo te invitó al portal de Empírica Legal Lab para Cliente Demo.',
    );
  });

  it('without the owner’s permission to email, says so and returns the link', () => {
    const w = createWorld();
    w.google.grantedScopes.delete(SCOPES.mail);
    const outcome = invite(w, ID.socio, 'nueva@cliente-a.example');
    expect(outcome).toMatchObject({ emailError: 'NO_PERMISSION' });
    expect(outcome.token).toMatch(/^[0-9a-f]{64}$/);
    expect(w.google.mail.sent).toEqual([]);
  });

  it('without emails left today, says so and returns the link', () => {
    const w = createWorld();
    w.google.mail.quota = 0;
    const outcome = invite(w, ID.socio, 'nueva@cliente-a.example');
    expect(outcome).toMatchObject({ emailError: 'QUOTA' });
    expect(outcome.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('only when asked', () => {
    const w = createWorld();
    invite(w, ID.socio, 'nueva@cliente-a.example', { enviarCorreo: false });
    expect(w.google.mail.sent).toEqual([]);
  });

  it('waits for the firm when a client admin invites; the firm hears it and the approval emails the link', () => {
    const w = createWorld();
    const pending = invite(w, ID.cAdmin, 'otra@cliente-a.example');
    expect(pending.token).toBeUndefined();
    expect(w.google.mail.sent).toEqual([]);
    expect(
      w
        .rows('Notificaciones')
        .filter((n) => n.tipo === 'INVITACION_POR_APROBAR')
        .map((n) => n.usuarioId)
        .sort(),
    ).toEqual([ID.socio, ID.abogado].sort());
    const approved = w.ok<InvitationOutcome>(
      'invitations.decide',
      { invitacionId: pending.invitation.id, approve: true, enviarCorreo: true },
      { as: ID.abogado },
    );
    expect(approved.emailedTo).toBe('otra@cliente-a.example');
    expect(only(w, 'otra@cliente-a.example').replyTo).toBe('abogado@despacho.example');
  });

  it('a resend emails the new link', () => {
    const w = createWorld();
    const first = invite(w, ID.socio, 'nueva@cliente-a.example', { enviarCorreo: false });
    const again = w.ok<InvitationOutcome>(
      'invitations.resend',
      { invitacionId: first.invitation.id, enviarCorreo: true },
      { as: ID.socio },
    );
    expect(again.token).not.toBe(first.token);
    expect(only(w, 'nueva@cliente-a.example').body).toContain(again.token ?? '');
  });
});
