/**
 * session.bootstrap: the first call after signing in. Who the user is, which
 * clients they may open and with what role and scope, the public settings
 * and the minimum version of the app.
 *
 * It also ties the user to their Firebase account on first access, and
 * records the last access (at most once an hour, and only if the lock is
 * free: it is never worth making the user wait for it).
 */
import {
  buildSnapshot,
  parseInstant,
  text,
  toProjectIso,
  type BootstrapData,
  type Row,
} from '@empirica/shared';
import type { Session } from '../auth.ts';
import type { Settings } from '../config.ts';
import { Database, Sequence } from '../db/database.ts';
import { Writer } from '../db/writer.ts';
import type { Env } from '../env.ts';

const TOUCH_EVERY_MS = 60 * 60_000;

function touchUser(env: Env, session: Session): void {
  const user = session.user;
  const last = parseInstant(user.ultimoAcceso);
  const needsBinding = !text(user, 'firebaseUid');
  if (!needsBinding && last !== null && env.now() - last < TOUCH_EVERY_MS) return;

  const lock = env.g.LockService.getScriptLock();
  if (!lock.tryLock(needsBinding ? 10_000 : 1_000)) return;
  try {
    const db = new Database(env);
    const fresh = db.table('Usuarios').get(user.id);
    if (!fresh) return;
    const serverNow = toProjectIso(env.now());
    const next: Row = { ...fresh, ultimoAcceso: serverNow };
    if (!text(fresh, 'firebaseUid')) next.firebaseUid = session.identity.uid;
    const seq = new Sequence(env);
    new Writer(db, seq, { userId: user.id, serverNow }).save('Usuarios', fresh, next);
    seq.reserve();
    db.flush();
    seq.commit();
  } finally {
    lock.releaseLock();
  }
}

export function bootstrap(
  env: Env,
  db: Database,
  session: Session,
  settings: Settings,
): BootstrapData {
  touchUser(env, session);
  const { ctx, user } = session;
  const snapshot = buildSnapshot(ctx, {
    usuarios: [user],
    membresias: [],
    entidades: [],
    config: db.rows('Config'),
  });
  const self = snapshot.Usuarios.find((u) => u.id === user.id) ?? { id: user.id };

  return {
    user: self,
    clients: [...ctx.clients.values()]
      .map((access) => {
        const cliente = db.table('Clientes').get(access.clienteId);
        return {
          id: access.clienteId,
          razonSocial: cliente ? (text(cliente, 'razonSocial') ?? '') : '',
          nombreComercial: cliente ? text(cliente, 'nombreComercial') : null,
          rol: access.rol,
          alcance: access.alcance,
        };
      })
      .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')),
    config: snapshot.Config.filter((c) => c.publica === true),
    minAppVersion: settings.minAppVersion,
  };
}
