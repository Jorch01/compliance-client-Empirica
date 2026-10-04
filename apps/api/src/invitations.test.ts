/**
 * Invitations, users and memberships (phase 2): who may invite whom, the
 * life of a link, and what each change does to the devices.
 */
import type {
  AcceptData,
  ApiFailure,
  ApiResponse,
  BootstrapData,
  InvitationOutcome,
  InvitationsListData,
  PullData,
  Row,
} from '@empirica/shared';
import { ID } from '@empirica/shared/testing';
import { describe, expect, it } from 'vitest';
import { maskEmail } from './actions/invitations.ts';
import { Device } from './testing/device.ts';
import { createWorld, type World } from './testing/harness.ts';

const failure = (res: ApiResponse<unknown>): ApiFailure['error'] => {
  if (res.ok) throw new Error(`Expected a failure, got ${JSON.stringify(res.data)}`);
  return res.error;
};

const invite = (w: World, as: string, fields: Record<string, unknown>) =>
  w.call<InvitationOutcome>(
    'invitations.create',
    { lado: 'CLIENTE', nombre: 'Persona Nueva', ...fields },
    { as },
  );

const ok = <T>(res: ApiResponse<T>): T => {
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.data;
};

/** A Firebase account of someone who is not in the demo data yet. */
function newcomer(w: World, email: string, uid = `fb-${email}`, emailVerified = true): string {
  return w.google.firebase.issue({ uid, email, emailVerified });
}

const userByEmail = (w: World, email: string): Row | undefined =>
  w.rows('Usuarios').find((u) => u.email === email);

describe('invitations: who may invite whom', () => {
  it('the partner invites a client user: the link works once, for that e-mail, and gives access', () => {
    const w = createWorld();
    const out = ok(
      invite(w, ID.socio, {
        email: 'Nueva@Cliente-A.example',
        rol: 'CLIENTE_ADMIN',
        clienteId: ID.clienteA,
      }),
    );
    expect(out.token).toMatch(/^[0-9a-f]{64}$/);
    expect(out.invitation).toMatchObject({
      email: 'nueva@cliente-a.example',
      estado: 'ENVIADA',
      lado: 'CLIENTE',
      clienteId: ID.clienteA,
      invitadoPor: ID.socio,
      aprobadoPor: ID.socio,
    });
    expect(userByEmail(w, 'nueva@cliente-a.example')).toMatchObject({
      estado: 'INVITADO',
      lado: 'CLIENTE',
    });
    // Only the hash is kept, and it never leaves the server.
    const tokenHash = w.env.sha256Hex(out.token ?? '');
    expect(w.rows('Invitaciones')[0]?.tokenHash).toBe(tokenHash);
    expect(JSON.stringify(ok(w.call('invitations.list', {}, { as: ID.socio })))).not.toContain(
      tokenHash,
    );

    // Before accepting, the account has no access, and is told why.
    const token = newcomer(w, 'nueva@cliente-a.example');
    expect(failure(w.call('session.bootstrap', {}, { token }))).toMatchObject({
      code: 'NOT_WHITELISTED',
      details: { reason: 'INVITADO' },
    });

    expect(ok(w.call<AcceptData>('invitations.accept', { token: out.token }, { token }))).toEqual({
      clienteId: ID.clienteA,
    });
    expect(userByEmail(w, 'nueva@cliente-a.example')).toMatchObject({
      estado: 'ACTIVO',
      firebaseUid: 'fb-nueva@cliente-a.example',
    });
    const boot = ok(w.call<BootstrapData>('session.bootstrap', {}, { token }));
    expect(boot.clients.map((c) => [c.id, c.rol])).toEqual([[ID.clienteA, 'CLIENTE_ADMIN']]);
    const pulled = ok(w.call<PullData>('sync.pull', { cursor: 0 }, { token }));
    expect(pulled.changes.some((c) => c.t === 'Asuntos' && c.row.id === ID.asHub)).toBe(true);
    expect(pulled.changes.some((c) => c.row.id === ID.asInterno)).toBe(false);

    // Accepting again with the same account is harmless; another account cannot reuse it.
    expect(ok(w.call('invitations.accept', { token: out.token }, { token }))).toEqual({
      clienteId: ID.clienteA,
    });
    const other = newcomer(w, 'nueva@cliente-a.example', 'otra-cuenta');
    expect(
      failure(w.call('invitations.accept', { token: out.token }, { token: other })),
    ).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(w.rows('Bitacora').filter((b) => b.entidad === 'Invitaciones').length).toBeGreaterThan(
      1,
    );
  });

  it('a lawyer invites to their clients only; assistants and collaborators cannot invite', () => {
    const w = createWorld();
    expect(
      ok(
        invite(w, ID.abogado, {
          email: 'x@cliente-a.example',
          rol: 'CLIENTE_COLABORADOR',
          clienteId: ID.clienteA,
        }),
      ).token,
    ).toBeDefined();
    expect(
      failure(
        invite(w, ID.abogado, {
          email: 'y@cliente-b.example',
          rol: 'CLIENTE_ADMIN',
          clienteId: ID.clienteB,
        }),
      ).code,
    ).toBe('NOT_FOUND');
    for (const as of [ID.asistente, ID.cColab, ID.cLectura]) {
      expect(
        failure(
          invite(w, as, {
            email: 'z@cliente-a.example',
            rol: 'CLIENTE_LECTURA',
            clienteId: ID.clienteA,
          }),
        ).code,
      ).toBe('FORBIDDEN');
    }
  });

  it('only the partner invites people of the firm', () => {
    const w = createWorld();
    const out = ok(
      invite(w, ID.socio, {
        lado: 'EMPIRICA',
        email: 'nuevo@despacho.example',
        rol: 'ABOGADO',
        clienteId: ID.clienteB,
      }),
    );
    expect(out.invitation).toMatchObject({
      lado: 'EMPIRICA',
      rol: 'ABOGADO',
      clienteId: ID.clienteB,
    });
    const user = userByEmail(w, 'nuevo@despacho.example');
    expect(w.rows('Membresias').find((m) => m.usuarioId === user?.id)).toMatchObject({
      clienteId: ID.clienteB,
      rol: 'ABOGADO',
      estado: 'ACTIVA',
    });
    expect(
      failure(
        invite(w, ID.abogado, {
          lado: 'EMPIRICA',
          email: 'otro@despacho.example',
          rol: 'ASISTENTE',
        }),
      ).code,
    ).toBe('FORBIDDEN');
    // Role and side must agree, and a client user needs a client.
    expect(
      failure(invite(w, ID.socio, { lado: 'EMPIRICA', email: 'a@b.example', rol: 'CLIENTE_ADMIN' }))
        .code,
    ).toBe('VALIDATION');
    expect(failure(invite(w, ID.socio, { email: 'a@b.example', rol: 'CLIENTE_ADMIN' })).code).toBe(
      'VALIDATION',
    );
    // An e-mail of the firm cannot become a client user, nor the other way round.
    expect(
      failure(
        invite(w, ID.socio, {
          email: 'abogado@despacho.example',
          rol: 'CLIENTE_LECTURA',
          clienteId: ID.clienteA,
        }),
      ).code,
    ).toBe('VALIDATION');
  });

  it('a client admin invites within their scope, pending the firm', () => {
    const w = createWorld();
    // The admin of unit Sur: inside Sur, yes; Norte or the whole hub, no.
    const pending = ok(
      invite(w, ID.cAdminSur, {
        email: 'colab.sur@cliente-a.example',
        rol: 'CLIENTE_COLABORADOR',
        clienteId: ID.clienteA,
        alcance: { entidades: [ID.sur], asuntos: [] },
        puesto: 'Recursos humanos',
      }),
    );
    expect(pending.token).toBeUndefined();
    expect(pending.invitation).toMatchObject({ estado: 'PENDIENTE_APROBACION', aprobadoPor: null });
    for (const alcance of [
      { entidades: [ID.norte], asuntos: [] },
      null,
      { entidades: [], asuntos: [] },
    ]) {
      expect(
        failure(
          invite(w, ID.cAdminSur, {
            email: 'n@cliente-a.example',
            rol: 'CLIENTE_LECTURA',
            clienteId: ID.clienteA,
            alcance,
          }),
        ).code,
      ).toBe('FORBIDDEN');
    }
    // The hub's admin may invite to the whole company, also pending.
    expect(
      ok(
        invite(w, ID.cAdmin, {
          email: 'hub@cliente-a.example',
          rol: 'CLIENTE_LECTURA',
          clienteId: ID.clienteA,
        }),
      ).invitation.estado,
    ).toBe('PENDIENTE_APROBACION');
    // A scope must name units of this client.
    expect(
      failure(
        invite(w, ID.socio, {
          email: 'q@cliente-a.example',
          rol: 'CLIENTE_LECTURA',
          clienteId: ID.clienteA,
          alcance: { entidades: [ID.unidadB], asuntos: [] },
        }),
      ).code,
    ).toBe('VALIDATION');

    // The client admin sees what they sent; the firm sees everything of its clients.
    const theirs = ok(w.call<InvitationsListData>('invitations.list', {}, { as: ID.cAdminSur }));
    expect(theirs.invitations.map((i) => i.email)).toEqual(['colab.sur@cliente-a.example']);
    const firm = ok(
      w.call<InvitationsListData>(
        'invitations.list',
        { clienteId: ID.clienteA },
        { as: ID.abogado },
      ),
    );
    expect(firm.invitations).toHaveLength(2);
    expect(
      ok(w.call<InvitationsListData>('invitations.list', {}, { as: ID.abogadoB })).invitations,
    ).toEqual([]);

    // The lawyer approves: now there is a link, and the membership counts.
    const approved = ok(
      w.call<InvitationOutcome>(
        'invitations.decide',
        { invitacionId: pending.invitation.id, approve: true },
        { as: ID.abogado },
      ),
    );
    expect(approved.token).toMatch(/^[0-9a-f]{64}$/);
    expect(approved.invitation).toMatchObject({ estado: 'ENVIADA', aprobadoPor: ID.abogado });
    expect(
      failure(
        w.call(
          'invitations.decide',
          { invitacionId: pending.invitation.id, approve: true },
          { as: ID.abogado },
        ),
      ).code,
    ).toBe('CONFLICT');
    // Client admins never approve.
    const hub = firm.invitations.find((i) => i.email === 'hub@cliente-a.example');
    expect(
      failure(
        w.call('invitations.decide', { invitacionId: hub?.id, approve: true }, { as: ID.cAdmin }),
      ).code,
    ).toBe('NOT_FOUND');
    const rejected = ok(
      w.call<InvitationOutcome>(
        'invitations.decide',
        { invitacionId: hub?.id, approve: false },
        { as: ID.socio },
      ),
    );
    expect(rejected.invitation.estado).toBe('RECHAZADA');
    const hubUser = userByEmail(w, 'hub@cliente-a.example');
    expect(w.rows('Membresias').find((m) => m.usuarioId === hubUser?.id)?.estado).toBe('REVOCADA');
  });
});

describe('invitations: the life of a link', () => {
  it('expires after seven days; a new link replaces the old one', () => {
    const w = createWorld();
    const out = ok(
      invite(w, ID.socio, {
        email: 'tarde@cliente-a.example',
        rol: 'CLIENTE_LECTURA',
        clienteId: ID.clienteA,
      }),
    );
    w.clock.advance(8 * 86_400_000);
    const token = newcomer(w, 'tarde@cliente-a.example');
    expect(failure(w.call('invitations.accept', { token: out.token }, { token }))).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'EXPIRED' },
    });
    const listed = ok(w.call<InvitationsListData>('invitations.list', {}, { as: ID.socio }));
    expect(listed.invitations[0]?.estado).toBe('VENCIDA');

    const again = ok(
      w.call<InvitationOutcome>(
        'invitations.resend',
        { invitacionId: out.invitation.id },
        { as: ID.socio },
      ),
    );
    expect(again.token).not.toBe(out.token);
    expect(failure(w.call('invitations.accept', { token: out.token }, { token })).code).toBe(
      'NOT_FOUND',
    );
    expect(ok(w.call('invitations.accept', { token: again.token }, { token }))).toEqual({
      clienteId: ID.clienteA,
    });
  });

  it('asks for the invited e-mail, verified, and refuses cancelled or made-up links', () => {
    const w = createWorld();
    const out = ok(
      invite(w, ID.socio, {
        email: 'ana.perez@cliente-a.example',
        rol: 'CLIENTE_LECTURA',
        clienteId: ID.clienteA,
      }),
    );
    const wrong = newcomer(w, 'otra@correo.example');
    const mismatch = failure(w.call('invitations.accept', { token: out.token }, { token: wrong }));
    expect(mismatch).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'EMAIL_MISMATCH', email: 'a***@cliente-a.example' },
    });
    expect(JSON.stringify(mismatch)).not.toContain('ana.perez');

    const unverified = newcomer(w, 'ana.perez@cliente-a.example', 'fb-x', false);
    expect(
      failure(w.call('invitations.accept', { token: out.token }, { token: unverified })).code,
    ).toBe('EMAIL_NOT_VERIFIED');

    const right = newcomer(w, 'ana.perez@cliente-a.example');
    expect(
      failure(w.call('invitations.accept', { token: 'f'.repeat(64) }, { token: right })),
    ).toMatchObject({ code: 'NOT_FOUND', details: { reason: 'INVALID_LINK' } });
    expect(
      failure(w.call('invitations.accept', { token: 'no-es-un-token' }, { token: right })).code,
    ).toBe('VALIDATION');

    ok(w.call('invitations.revoke', { invitacionId: out.invitation.id }, { as: ID.abogado }));
    expect(failure(w.call('invitations.accept', { token: out.token }, { token: right })).code).toBe(
      'NOT_FOUND',
    );
    const user = userByEmail(w, 'ana.perez@cliente-a.example');
    expect(w.rows('Membresias').find((m) => m.usuarioId === user?.id)?.estado).toBe('REVOCADA');
    expect(maskEmail('b@x.example')).toBe('b***@x.example');
  });

  it('a client admin may cancel what they sent while it is pending; nobody else on the client side', () => {
    const w = createWorld();
    const out = ok(
      invite(w, ID.cAdmin, {
        email: 'p@cliente-a.example',
        rol: 'CLIENTE_LECTURA',
        clienteId: ID.clienteA,
      }),
    );
    expect(
      failure(
        w.call('invitations.revoke', { invitacionId: out.invitation.id }, { as: ID.cAdminSur }),
      ).code,
    ).toBe('NOT_FOUND');
    expect(
      ok(
        w.call<InvitationOutcome>(
          'invitations.revoke',
          { invitacionId: out.invitation.id },
          { as: ID.cAdmin },
        ),
      ).invitation.estado,
    ).toBe('RECHAZADA');
  });

  it('someone who already has an account simply gets the new client', () => {
    const w = createWorld();
    const device = new Device(w, ID.cB).sync();
    expect(device.has('Asuntos', ID.asHub)).toBe(false);
    const out = ok(
      invite(w, ID.socio, {
        email: 'admin@cliente-b.example',
        rol: 'CLIENTE_LECTURA',
        clienteId: ID.clienteA,
      }),
    );
    expect(out).toMatchObject({ alreadyActive: true, invitation: { estado: 'ACEPTADA' } });
    expect(out.token).toBeUndefined();
    device.sync();
    expect(device.last.resets).toContain(ID.clienteA);
    expect(device.has('Asuntos', ID.asHub)).toBe(true);
    // Twice is an error: they already have it.
    expect(
      failure(
        invite(w, ID.socio, {
          email: 'admin@cliente-b.example',
          rol: 'CLIENTE_LECTURA',
          clienteId: ID.clienteA,
        }),
      ).code,
    ).toBe('VALIDATION');
  });
});

describe('administration of users and memberships', () => {
  it('deactivating someone cuts their access at the next request; a partner cannot lock themselves out', () => {
    const w = createWorld();
    ok(
      w.call(
        'admin.users.update',
        { usuarioId: ID.cLectura, estado: 'INACTIVO' },
        { as: ID.socio },
      ),
    );
    expect(failure(w.call('sync.pull', { cursor: 0 }, { as: ID.cLectura }))).toMatchObject({
      code: 'NOT_WHITELISTED',
      details: { reason: 'INACTIVO' },
    });
    expect(
      failure(
        w.call('admin.users.update', { usuarioId: ID.socio, estado: 'INACTIVO' }, { as: ID.socio }),
      ).code,
    ).toBe('VALIDATION');
    expect(
      failure(
        w.call('admin.users.update', { usuarioId: ID.socio, rolBase: 'ABOGADO' }, { as: ID.socio }),
      ).code,
    ).toBe('VALIDATION');
    expect(
      failure(
        w.call(
          'admin.users.update',
          { usuarioId: ID.cLectura, estado: 'ACTIVO' },
          { as: ID.abogado },
        ),
      ).code,
    ).toBe('FORBIDDEN');
    expect(
      failure(
        w.call(
          'admin.users.update',
          { usuarioId: ID.cAdmin, rolBase: 'ABOGADO' },
          { as: ID.socio },
        ),
      ).code,
    ).toBe('VALIDATION');
  });

  it('a new Firebase account works again once the firm resets it', () => {
    const w = createWorld();
    w.call('session.bootstrap', {}, { as: ID.cAdmin });
    const fresh = w.google.firebase.issue({
      uid: 'cuenta-nueva',
      email: 'admin@cliente-a.example',
    });
    expect(failure(w.call('session.bootstrap', {}, { token: fresh }))).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    ok(
      w.call('admin.users.update', { usuarioId: ID.cAdmin, resetAccount: true }, { as: ID.socio }),
    );
    expect(ok(w.call<BootstrapData>('session.bootstrap', {}, { token: fresh })).user.id).toBe(
      ID.cAdmin,
    );
    expect(w.row('Usuarios', ID.cAdmin)?.firebaseUid).toBe('cuenta-nueva');
  });

  it('a new scope sends that client again to every device; revoking removes it', () => {
    const w = createWorld();
    const colab = new Device(w, ID.cColab).sync();
    const other = new Device(w, ID.cLectura).sync();
    expect(colab.has('Asuntos', ID.asNorte)).toBe(true);
    expect(colab.has('Asuntos', ID.asSur)).toBe(false);

    ok(
      w.call(
        'admin.memberships.save',
        {
          usuarioId: ID.cColab,
          clienteId: ID.clienteA,
          rol: 'CLIENTE_COLABORADOR',
          alcance: { entidades: [ID.sur], asuntos: [] },
        },
        { as: ID.socio },
      ),
    );
    colab.sync();
    other.sync();
    expect(colab.last.resets).toEqual([ID.clienteA]);
    expect(other.last.resets).toEqual([ID.clienteA]);
    expect(colab.has('Asuntos', ID.asSur)).toBe(true);
    expect(colab.has('Asuntos', ID.asNorte)).toBe(false);

    // Only the job title changes: nobody downloads anything again.
    ok(
      w.call(
        'admin.memberships.save',
        {
          usuarioId: ID.cColab,
          clienteId: ID.clienteA,
          rol: 'CLIENTE_COLABORADOR',
          alcance: { entidades: [ID.sur], asuntos: [] },
          puesto: 'Finanzas',
        },
        { as: ID.socio },
      ),
    );
    other.sync();
    expect(other.last.resets).toEqual([]);

    ok(
      w.call(
        'admin.memberships.save',
        {
          usuarioId: ID.cColab,
          clienteId: ID.clienteA,
          rol: 'CLIENTE_COLABORADOR',
          estado: 'REVOCADA',
        },
        { as: ID.socio },
      ),
    );
    colab.sync();
    // Only what belongs to no client stays (public holidays).
    expect(colab.rows().map((r) => r.id)).toEqual([ID.inhabil]);
    expect(
      failure(
        w.call(
          'admin.memberships.save',
          { usuarioId: ID.cColab, clienteId: ID.clienteA, rol: 'ABOGADO' },
          { as: ID.socio },
        ),
      ).code,
    ).toBe('VALIDATION');
    expect(
      failure(
        w.call(
          'admin.memberships.save',
          { usuarioId: ID.cColab, clienteId: ID.clienteA, rol: 'CLIENTE_ADMIN' },
          { as: ID.abogado },
        ),
      ).code,
    ).toBe('FORBIDDEN');
  });

  it('each user edits their own name and language, nothing else', () => {
    const w = createWorld();
    const out = ok(
      w.call<{ user: Row }>(
        'profile.update',
        { nombre: '  Lectura Nueva ', idioma: 'en' },
        { as: ID.cLectura },
      ),
    );
    expect(out.user).toMatchObject({ id: ID.cLectura, nombre: 'Lectura Nueva', idioma: 'en' });
    expect(out.user.firebaseUid).toBeUndefined();
    // Anything else in the payload is ignored.
    ok(
      w.call('profile.update', { estado: 'INACTIVO', rolBase: 'SOCIO_ADMIN' }, { as: ID.cLectura }),
    );
    expect(w.row('Usuarios', ID.cLectura)).toMatchObject({
      estado: 'ACTIVO',
      rolBase: 'CLIENTE_LECTURA',
    });
  });
});
