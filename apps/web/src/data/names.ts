import { useMemo } from 'react';
import { text } from '@empirica/shared';
import { clientName } from '../portal/scope.ts';
import { useRows } from './hooks.ts';

export interface Names {
  client: (id: string | null | undefined) => string;
  unit: (id: string | null | undefined) => string;
  user: (id: string | null | undefined) => string;
}

/** Names of clients, units and people by id, from the local copy. */
export function useNames(): Names {
  const clientes = useRows('Clientes');
  const entidades = useRows('Entidades');
  const usuarios = useRows('Usuarios');
  return useMemo(() => {
    const clients = new Map((clientes ?? []).map((c) => [c.id, clientName(c)]));
    const units = new Map((entidades ?? []).map((e) => [e.id, text(e, 'nombre') ?? '']));
    const users = new Map((usuarios ?? []).map((u) => [u.id, text(u, 'nombre') ?? '']));
    return {
      client: (id) => (id ? (clients.get(id) ?? '') : ''),
      unit: (id) => (id ? (units.get(id) ?? '') : ''),
      user: (id) => (id ? (users.get(id) ?? '') : ''),
    };
  }, [clientes, entidades, usuarios]);
}
