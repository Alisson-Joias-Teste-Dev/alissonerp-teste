"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Role } from "@/lib/auth/permissions";

interface AuthState {
  user: User | null;
  role: Role | null;
  nome: string | null;
  fotoUrl: string | null;
  loading: boolean;
  modulos_leitura: string[];
  modulos_escrita: string[];
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    nome: null,
    fotoUrl: null,
    loading: true,
    modulos_leitura: [],
    modulos_escrita: [],
  });

  useEffect(() => {
    function handleFotoAtualizada(e: Event) {
      const url = (e as CustomEvent<string>).detail;
      setState(prev => prev.user ? { ...prev, fotoUrl: url } : prev);
    }
    window.addEventListener("perfil:foto-atualizada", handleFotoAtualizada);
    return () => window.removeEventListener("perfil:foto-atualizada", handleFotoAtualizada);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const roleFromToken = user.user_metadata?.role as Role ?? null;
        const nome = user.user_metadata?.nome as string ?? null;
        // Buscar perfil (nome/avatar) e permissões em paralelo
        const [profileRes, permRes] = await Promise.all([
          fetch(`/api/user/role?user_id=${user.id}`).catch(() => null),
          fetch(`/api/user/permissoes?user_id=${user.id}`).catch(() => null),
        ]);
        const profile = profileRes?.ok ? await profileRes.json() : null;
        const perm    = permRes?.ok    ? await permRes.json()    : null;
        setState({
          user,
          role:            (perm?.role ?? roleFromToken) as Role | null,
          nome:            profile?.name ?? nome,
          fotoUrl:         profile?.avatar_url ?? null,
          loading:         false,
          modulos_leitura: perm?.modulos_leitura ?? [],
          modulos_escrita: perm?.modulos_escrita ?? [],
        });
      } else {
        setState({ user: null, role: null, nome: null, fotoUrl: null, loading: false, modulos_leitura: [], modulos_escrita: [] });
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const roleFromToken = user?.user_metadata?.role as Role ?? null;
      const nome = user?.user_metadata?.nome as string ?? null;
      if (user) {
        Promise.all([
          fetch(`/api/user/role?user_id=${user.id}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/user/permissoes?user_id=${user.id}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]).then(([profile, perm]) => {
          setState({
            user,
            role:            (perm?.role ?? roleFromToken) as Role | null,
            nome:            profile?.name ?? nome,
            fotoUrl:         profile?.avatar_url ?? null,
            loading:         false,
            modulos_leitura: perm?.modulos_leitura ?? [],
            modulos_escrita: perm?.modulos_escrita ?? [],
          });
        }).catch(() => setState({ user, role: roleFromToken, nome, fotoUrl: null, loading: false, modulos_leitura: [], modulos_escrita: [] }));
      } else {
        setState({ user: null, role: null, nome: null, fotoUrl: null, loading: false, modulos_leitura: [], modulos_escrita: [] });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
