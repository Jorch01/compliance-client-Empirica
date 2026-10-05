/**
 * Invitations (PLAN.md § 3): how people get access to the portal.
 *
 * - Firm users are invited only by the SOCIO_ADMIN. Client users by the
 *   SOCIO_ADMIN or the client's lawyers, ready to use; or by a client admin
 *   within their own scope, pending the firm's approval (PERMISOS.md).
 * - The person is written in Usuarios as INVITADO, with their membership,
 *   and the invitation carries the hash of a random secret that expires in
 *   seven days. Only the hash is stored.
 * - The secret goes back once to whoever may share it (who invites, or who
 *   approves). Phase 2 sends no e-mail: they share the link from their own
 *   mail app or as a copied link (decision D26; e-mail comes with phase 5).
 * - Accepting needs a Firebase account whose verified e-mail is the invited
 *   one: then the user becomes ACTIVO, bound to that account.
 */
import {
  INVITATION_DAYS,
  isFirmRole,
  parseAlcance,
  parseInstant,
  text,
  toProjectIso,
  type AcceptData,
  type Alcance,
  type ClientAccess,
  type EstadoInvitacion,
  type InvitationCreate,
  type InvitationOutcome,
  type InvitationView,
  type InvitationsListData,
  type Rol,
  type Row,
  type UserContext,
  type Value,
} from '@empirica/shared';
import type { Identity, Session } from '../auth.ts';
import { readAgendaSettings } from '../config.ts';
import { Database } from '../db/database.ts';
import type { Env } from '../env.ts';
import { ApiError } from '../errors.ts';
import { sendMail } from '../mail/send.ts';
import { invitationEmail } from '../mail/templates.ts';
import { saveNotifications } from '../notify.ts';
import {
  changed,
  freshContext,
  lowerEmail,
  membershipOf,
  newRow,
  saveChange,
  underLock,
  userByEmail,
  type LockedRun,
} from './locked.ts';

const DAY_MS = 86_400_000;
const AUDITED = [
  'email',
  'clienteId',
  'rol',
  'alcance',
  'puesto',
  'estado',
  'venceEn',
  'aprobadoPor',
];
const USER_AUDITED = ['email', 'nombre', 'lado', 'rolBase', 'estado', 'idioma'];
const MEMBERSHIP_AUDITED = ['usuarioId', 'clienteId', 'rol', 'alcance', 'puesto', 'estado'];

const validation = (message: string): ApiError => new ApiError('VALIDATION', message);

/** "ana@cliente.example" → "a***@cliente.example": enough to recognize, not to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** The firm users who manage this client's invitations: the SOCIO_ADMIN and its lawyers. */
function firmManages(ctx: UserContext, clienteId: string | null): boolean {
  if (ctx.isAdmin) return true;
  if (!clienteId || ctx.lado !== 'EMPIRICA') return false;
  return ctx.clients.get(clienteId)?.rol === 'ABOGADO';
}

function expired(inv: Row, nowMs: number): boolean {
  const vence = parseInstant(text(inv, 'venceEn'));
  return vence !== null && vence < nowMs;
}

export function invitationView(db: Database, inv: Row, nowMs: number): InvitationView {
  const email = text(inv, 'email') ?? '';
  const rol = inv.rol as Rol;
  let estado = inv.estado as EstadoInvitacion;
  if (estado === 'ENVIADA' && expired(inv, nowMs)) estado = 'VENCIDA';
  return {
    id: inv.id,
    email,
    nombre: text(userByEmail(db, email) ?? { id: '' }, 'nombre'),
    lado: isFirmRole(rol) ? 'EMPIRICA' : 'CLIENTE',
    clienteId: text(inv, 'clienteId'),
    rol,
    alcance: parseAlcance(inv.alcance),
    puesto: text(inv, 'puesto'),
    estado,
    venceEn: text(inv, 'venceEn'),
    invitadoPor: text(inv, 'invitadoPor'),
    aprobadoPor: text(inv, 'aprobadoPor'),
    createdAt: text(inv, 'createdAt') ?? '',
  };
}

/**
 * Emails a new link (F5), once the lock is released: sending takes a moment
 * and must not hold the other writers. The link is returned either way, so
 * whoever invites can still share it by hand; replies go to them.
 */
function withEmail(
  env: Env,
  session: Session,
  outcome: InvitationOutcome,
  send: boolean | undefined,
): InvitationOutcome {
  if (!send || !outcome.token) return outcome;
  const db = new Database(env);
  const settings = readAgendaSettings(db.rows('Config'));
  const inv = outcome.invitation;
  const invitee = userByEmail(db, inv.email);
  const client = inv.clienteId ? db.table('Clientes').get(inv.clienteId) : undefined;
  const email = invitationEmail({
    lang: invitee && text(invitee, 'idioma') === 'en' ? 'en' : 'es',
    name: inv.nombre ?? (invitee ? text(invitee, 'nombre') : null),
    email: inv.email,
    inviter: text(session.user, 'nombre') ?? 'Empírica Legal Lab',
    client: client ? (text(client, 'nombreComercial') ?? text(client, 'razonSocial')) : null,
    link: `${settings.portalUrl.replace(/\/*$/, '/')}#/invitacion/${outcome.token}`,
    until: (inv.venceEn ?? '').slice(0, 10),
  });
  const result = sendMail(env, {
    to: inv.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: text(session.user, 'email'),
  });
  return result.sent
    ? { ...outcome, emailedTo: inv.email }
    : { ...outcome, emailError: result.error ?? 'UNKNOWN' };
}

/** The secret of a link: 244 random bits from two UUIDs, as 64 hex characters. */
function newSecret(r: LockedRun): { token: string; tokenHash: string; venceEn: string } {
  const token = (r.env.uuid() + r.env.uuid()).replace(/-/g, '').toLowerCase();
  return {
    token,
    tokenHash: r.env.sha256Hex(token),
    venceEn: toProjectIso(r.nowMs + INVITATION_DAYS * DAY_MS),
  };
}

/**
 * A scope for a new client user: units and matters of that client. A client
 * admin with a scope may only give part of their own, never the whole hub.
 */
function checkAlcance(
  db: Database,
  clienteId: string,
  alcance: Alcance | null,
  inviter: ClientAccess | null,
): Alcance | null {
  if (inviter?.alcance) {
    const units = inviter.units ?? new Set<string>();
    const own = new Set(inviter.alcance.asuntos);
    const inside =
      alcance !== null &&
      alcance.entidades.length + alcance.asuntos.length > 0 &&
      alcance.entidades.every((e) => units.has(e)) &&
      alcance.asuntos.every((a) => {
        const asunto = db.table('Asuntos').get(a);
        const unit = asunto ? text(asunto, 'entidadId') : null;
        return own.has(a) || (unit !== null && units.has(unit));
      });
    if (!inside) throw new ApiError('FORBIDDEN', 'Solo puedes invitar dentro de tus unidades.');
  }
  if (!alcance) return null;
  const entidades = [...new Set(alcance.entidades)];
  const asuntos = [...new Set(alcance.asuntos)];
  for (const [table, ids] of [
    ['Entidades', entidades],
    ['Asuntos', asuntos],
  ] as const) {
    for (const id of ids) {
      const row = db.table(table).get(id);
      if (!row || row.deleted || row.clienteId !== clienteId) {
        throw validation('El alcance nombra unidades o asuntos que no son de este cliente.');
      }
    }
  }
  return { entidades, asuntos };
}

const asValue = (alcance: Alcance | null): Value => alcance as unknown as Value;

/** Older open invitations of the same person to the same client stop working. */
function closeOlder(r: LockedRun, email: string, clienteId: string | null): void {
  for (const inv of r.db.rows('Invitaciones')) {
    if (inv.deleted || lowerEmail(text(inv, 'email')) !== email) continue;
    if ((text(inv, 'clienteId') ?? null) !== clienteId) continue;
    if (inv.estado !== 'ENVIADA' && inv.estado !== 'PENDIENTE_APROBACION') continue;
    saveChange(
      r,
      'Invitaciones',
      inv,
      changed(r, inv, { estado: 'RECHAZADA', tokenHash: null }),
      clienteId,
      AUDITED,
    );
  }
}

export function createInvitation(
  env: Env,
  session: Session,
  input: InvitationCreate,
): InvitationOutcome {
  return withEmail(env, session, createUnderLock(env, session, input), input.enviarCorreo);
}

function createUnderLock(env: Env, session: Session, input: InvitationCreate): InvitationOutcome {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    const email = lowerEmail(input.email);
    if (isFirmRole(input.rol) !== (input.lado === 'EMPIRICA')) {
      throw validation('El rol no corresponde al tipo de usuario.');
    }
    // A partner sees every client: a membership would mean nothing.
    const clienteId = input.rol === 'SOCIO_ADMIN' ? null : (input.clienteId ?? null);
    if (input.lado === 'CLIENTE' && !clienteId) throw validation('Falta el cliente.');
    if (clienteId) {
      const cliente = r.db.table('Clientes').get(clienteId);
      const visible = ctx.isAdmin || ctx.clients.has(clienteId);
      if (!cliente || cliente.deleted || !visible) throw new ApiError('NOT_FOUND');
    }

    let needsApproval = false;
    let inviter: ClientAccess | null = null;
    if (input.lado === 'EMPIRICA') {
      if (!ctx.isAdmin) throw new ApiError('FORBIDDEN');
    } else if (!firmManages(ctx, clienteId)) {
      inviter = clienteId ? (ctx.clients.get(clienteId) ?? null) : null;
      if (ctx.lado !== 'CLIENTE' || inviter?.rol !== 'CLIENTE_ADMIN') {
        throw new ApiError('FORBIDDEN');
      }
      needsApproval = true;
    }
    const alcance =
      input.lado === 'CLIENTE' && clienteId
        ? checkAlcance(r.db, clienteId, input.alcance ?? null, inviter)
        : null;

    let user = userByEmail(r.db, email);
    if (user && user.lado !== input.lado) {
      throw validation(
        user.lado === 'EMPIRICA'
          ? 'Ese correo pertenece a alguien del despacho.'
          : 'Ese correo pertenece a un usuario de cliente.',
      );
    }
    const alreadyActive = user?.estado === 'ACTIVO';
    if (alreadyActive && !clienteId) throw validation('Esa persona ya tiene acceso al portal.');
    if (!user) {
      user = saveChange(
        r,
        'Usuarios',
        undefined,
        newRow(r, {
          email,
          nombre: input.nombre.trim(),
          lado: input.lado,
          rolBase: input.rol,
          estado: 'INVITADO',
          idioma: input.idioma ?? 'es',
        }),
        clienteId,
        USER_AUDITED,
      );
    } else if (user.estado === 'INACTIVO') {
      // Coming back: the new invitation is what gives access again.
      user = saveChange(r, 'Usuarios', user, changed(r, user, { estado: 'INVITADO' }), clienteId, [
        'estado',
      ]);
    }

    if (clienteId) {
      const existing = membershipOf(r.db, user.id, clienteId);
      if (alreadyActive && existing?.estado === 'ACTIVA') {
        throw validation('Esa persona ya tiene acceso a este cliente.');
      }
      const fields: Record<string, Value> = {
        rol: input.rol,
        alcance: asValue(alcance),
        puesto: input.puesto?.trim() ? input.puesto.trim() : null,
        estado: needsApproval ? 'PENDIENTE_APROBACION' : 'ACTIVA',
      };
      saveChange(
        r,
        'Membresias',
        existing,
        existing
          ? changed(r, existing, fields)
          : newRow(r, { usuarioId: user.id, clienteId, ...fields }),
        clienteId,
        MEMBERSHIP_AUDITED,
      );
    }

    closeOlder(r, email, clienteId);
    const secret = needsApproval || alreadyActive ? null : newSecret(r);
    const inv = saveChange(
      r,
      'Invitaciones',
      undefined,
      newRow(r, {
        email,
        clienteId,
        rol: input.rol,
        alcance: asValue(alcance),
        puesto: input.puesto?.trim() ? input.puesto.trim() : null,
        invitadoPor: ctx.userId,
        estado: needsApproval ? 'PENDIENTE_APROBACION' : alreadyActive ? 'ACEPTADA' : 'ENVIADA',
        tokenHash: secret?.tokenHash ?? null,
        venceEn: secret?.venceEn ?? null,
        aprobadoPor: needsApproval ? null : ctx.userId,
      }),
      clienteId,
      AUDITED,
    );
    if (needsApproval && clienteId) {
      // The firm approves it: the client's lawyer and the partners hear at once.
      const cliente = r.db.table('Clientes').get(clienteId);
      const lawyer = cliente ? text(cliente, 'abogadoResponsableId') : null;
      const partners = r.db
        .rows('Usuarios')
        .filter((u) => !u.deleted && u.lado === 'EMPIRICA' && u.rolBase === 'SOCIO_ADMIN')
        .map((u) => u.id);
      saveNotifications(
        r.db,
        r.writer,
        [...new Set([lawyer, ...partners])].map((usuarioId) => ({
          usuarioId,
          tipo: 'INVITACION_POR_APROBAR' as const,
          about: null,
          mensaje: input.nombre.trim() || email,
          link: '/usuarios',
          clienteId,
        })),
        ctx.userId,
      );
    }
    return {
      invitation: invitationView(r.db, inv, r.nowMs),
      ...(secret ? { token: secret.token } : {}),
      ...(alreadyActive && !needsApproval ? { alreadyActive: true } : {}),
    };
  });
}

/** The invitation, if the caller may manage it (and see it at all). */
function managed(r: LockedRun, ctx: UserContext, invitacionId: string): Row {
  const inv = r.db.table('Invitaciones').get(invitacionId);
  const clienteId = inv ? text(inv, 'clienteId') : null;
  if (!inv || inv.deleted || !firmManages(ctx, clienteId)) throw new ApiError('NOT_FOUND');
  return inv;
}

export function decideInvitation(
  env: Env,
  session: Session,
  input: { invitacionId: string; approve: boolean; enviarCorreo?: boolean | undefined },
): InvitationOutcome {
  return withEmail(env, session, decideUnderLock(env, session, input), input.enviarCorreo);
}

function decideUnderLock(
  env: Env,
  session: Session,
  input: { invitacionId: string; approve: boolean },
): InvitationOutcome {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    const inv = managed(r, ctx, input.invitacionId);
    if (inv.estado !== 'PENDIENTE_APROBACION') {
      throw new ApiError('CONFLICT', 'Esta invitación ya no está pendiente.');
    }
    const clienteId = text(inv, 'clienteId');
    const user = userByEmail(r.db, text(inv, 'email') ?? '');
    const membership = user && clienteId ? membershipOf(r.db, user.id, clienteId) : undefined;
    const setMembership = (estado: string): void => {
      if (membership?.estado === 'PENDIENTE_APROBACION') {
        saveChange(
          r,
          'Membresias',
          membership,
          changed(r, membership, { estado }),
          clienteId,
          MEMBERSHIP_AUDITED,
        );
      }
    };

    if (!input.approve) {
      setMembership('REVOCADA');
      const saved = saveChange(
        r,
        'Invitaciones',
        inv,
        changed(r, inv, { estado: 'RECHAZADA', aprobadoPor: ctx.userId }),
        clienteId,
        AUDITED,
      );
      return { invitation: invitationView(r.db, saved, r.nowMs) };
    }

    setMembership('ACTIVA');
    if (user?.estado === 'ACTIVO') {
      const saved = saveChange(
        r,
        'Invitaciones',
        inv,
        changed(r, inv, { estado: 'ACEPTADA', aprobadoPor: ctx.userId }),
        clienteId,
        AUDITED,
      );
      return { invitation: invitationView(r.db, saved, r.nowMs), alreadyActive: true };
    }
    const secret = newSecret(r);
    const saved = saveChange(
      r,
      'Invitaciones',
      inv,
      changed(r, inv, {
        estado: 'ENVIADA',
        tokenHash: secret.tokenHash,
        venceEn: secret.venceEn,
        aprobadoPor: ctx.userId,
      }),
      clienteId,
      AUDITED,
    );
    return { invitation: invitationView(r.db, saved, r.nowMs), token: secret.token };
  });
}

/** A new link for an invitation that was sent (or expired): the old one stops working. */
export function resendInvitation(
  env: Env,
  session: Session,
  input: { invitacionId: string; enviarCorreo?: boolean | undefined },
): InvitationOutcome {
  return withEmail(env, session, resendUnderLock(env, session, input), input.enviarCorreo);
}

function resendUnderLock(
  env: Env,
  session: Session,
  input: { invitacionId: string },
): InvitationOutcome {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    const inv = managed(r, ctx, input.invitacionId);
    if (inv.estado !== 'ENVIADA' && inv.estado !== 'VENCIDA') {
      throw new ApiError('CONFLICT', 'Esta invitación ya no se puede reenviar.');
    }
    const secret = newSecret(r);
    const saved = saveChange(
      r,
      'Invitaciones',
      inv,
      changed(r, inv, { estado: 'ENVIADA', tokenHash: secret.tokenHash, venceEn: secret.venceEn }),
      text(inv, 'clienteId'),
      AUDITED,
    );
    return { invitation: invitationView(r.db, saved, r.nowMs), token: secret.token };
  });
}

/** Cancels an open invitation: the firm, or the client admin who sent it while pending. */
export function revokeInvitation(
  env: Env,
  session: Session,
  input: { invitacionId: string },
): InvitationOutcome {
  return underLock(env, session.user.id, (r) => {
    const ctx = freshContext(r.db, session.user.id);
    const inv = r.db.table('Invitaciones').get(input.invitacionId);
    const clienteId = inv ? text(inv, 'clienteId') : null;
    const own = inv?.invitadoPor === ctx.userId && inv.estado === 'PENDIENTE_APROBACION';
    if (!inv || inv.deleted || !(firmManages(ctx, clienteId) || own)) {
      throw new ApiError('NOT_FOUND');
    }
    if (!['PENDIENTE_APROBACION', 'ENVIADA', 'VENCIDA'].includes(text(inv, 'estado') ?? '')) {
      throw new ApiError('CONFLICT', 'Esta invitación ya no se puede cancelar.');
    }
    const user = userByEmail(r.db, text(inv, 'email') ?? '');
    const membership = user && clienteId ? membershipOf(r.db, user.id, clienteId) : undefined;
    // An active user keeps whatever access they already had.
    if (
      membership &&
      (user?.estado !== 'ACTIVO' || membership.estado === 'PENDIENTE_APROBACION') &&
      membership.estado !== 'REVOCADA'
    ) {
      saveChange(
        r,
        'Membresias',
        membership,
        changed(r, membership, { estado: 'REVOCADA' }),
        clienteId,
        MEMBERSHIP_AUDITED,
      );
    }
    const saved = saveChange(
      r,
      'Invitaciones',
      inv,
      changed(r, inv, { estado: 'RECHAZADA', tokenHash: null }),
      clienteId,
      AUDITED,
    );
    return { invitation: invitationView(r.db, saved, r.nowMs) };
  });
}

export function listInvitations(
  env: Env,
  db: Database,
  session: Session,
  input: { clienteId?: string | undefined },
): InvitationsListData {
  const { ctx } = session;
  const nowMs = env.now();
  return {
    invitations: db
      .rows('Invitaciones')
      .filter((inv) => !inv.deleted)
      .filter((inv) => !input.clienteId || inv.clienteId === input.clienteId)
      .filter((inv) => firmManages(ctx, text(inv, 'clienteId')) || inv.invitadoPor === ctx.userId)
      .map((inv) => invitationView(db, inv, nowMs))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/**
 * The invited person, signed in with Firebase (verified e-mail), presents
 * the secret of their link. Accepting twice with the same account is
 * harmless: the hash stays on the accepted invitation for that.
 */
export function acceptInvitation(
  env: Env,
  identity: Identity,
  input: { token: string },
): AcceptData {
  const tokenHash = env.sha256Hex(input.token);
  const invalid = (): ApiError =>
    new ApiError(
      'NOT_FOUND',
      'Este enlace de invitación no es válido. Pide uno nuevo a quien te invitó.',
      { reason: 'INVALID_LINK' },
    );
  return underLock(env, 'invitacion', (r) => {
    const inv = r.db.rows('Invitaciones').find((i) => !i.deleted && i.tokenHash === tokenHash);
    if (!inv) throw invalid();
    const email = lowerEmail(text(inv, 'email'));
    if (email !== lowerEmail(identity.email)) {
      throw new ApiError(
        'FORBIDDEN',
        `Esta invitación es para ${maskEmail(email)}. Entra con esa cuenta.`,
        { reason: 'EMAIL_MISMATCH', email: maskEmail(email) },
      );
    }
    const user = userByEmail(r.db, email);
    if (!user) throw invalid();
    const clienteId = text(inv, 'clienteId');
    if (inv.estado === 'ACEPTADA') {
      if (user.estado === 'ACTIVO' && text(user, 'firebaseUid') === identity.uid) {
        return { clienteId };
      }
      throw invalid();
    }
    if (inv.estado === 'RECHAZADA') {
      throw new ApiError('FORBIDDEN', 'Esta invitación fue cancelada.', { reason: 'REVOKED' });
    }
    if (inv.estado !== 'ENVIADA' || expired(inv, r.nowMs)) {
      throw new ApiError('FORBIDDEN', 'La invitación venció. Pide una nueva a quien te invitó.', {
        reason: 'EXPIRED',
      });
    }
    const bound = text(user, 'firebaseUid');
    if (bound && bound !== identity.uid) {
      throw new ApiError('UNAUTHENTICATED', undefined, { reason: 'ACCOUNT_CHANGED' });
    }

    r.writer.meta = { ...r.writer.meta, userId: user.id };
    saveChange(
      r,
      'Usuarios',
      user,
      changed(r, user, { estado: 'ACTIVO', firebaseUid: identity.uid }),
      clienteId,
      ['estado'],
    );
    saveChange(r, 'Invitaciones', inv, changed(r, inv, { estado: 'ACEPTADA' }), clienteId, [
      'estado',
    ]);
    return { clienteId };
  });
}
