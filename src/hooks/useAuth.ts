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
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    nome: null,
    fotoUrl: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const role = user.user_metadata?.role as Role ?? null;
        const nome = user.user_metadata?.nome as string ?? null;
        // Buscar avatar_url e name do DB
        const profileRes = await fetch(`/api/user/role?user_id=${user.id}`).catch(() => null);
        const profile = profileRes?.ok ? await profileRes.json() : null;
        setState({
          user,
          role,
          nome: profile?.name ?? nome,
          fotoUrl: profile?.avatar_url ?? null,
          loading: false,
        });
      } else {
        setState({ user: null, role: null, nome: null, fotoUrl: null, loading: false });
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const role = user?.user_metadata?.role as Role ?? null;
      const nome = user?.user_metadata?.nome as string ?? null;
      if (user) {
        fetch(`/api/user/role?user_id=${user.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((profile) => {
            setState({
              user,
              role,
              nome: profile?.name ?? nome,
              fotoUrl: profile?.avatar_url ?? null,
              loading: false,
            });
          })
          .catch(() => setState({ user, role, nome, fotoUrl: null, loading: false }));
      } else {
        setState({ user: null, role: null, nome: null, fotoUrl: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
