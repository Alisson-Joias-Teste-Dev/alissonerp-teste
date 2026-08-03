"use client";

import { useEffect, useState, useRef } from "react";
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
  isOperadorService: boolean;
  /** Existe vendedora ativa ligada a este usuário — mostra "Minha comissão" no menu. */
  isVendedora: boolean;
}

// Cache module-global: deduplica fetch entre os 17+ componentes que usam useAuth()
// Sem isso, cada componente faz 2 fetches paralelos → satura limite de 6 conexões do browser
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos — role/permissões revalidam automaticamente

let cachedState: AuthState | null = null;
let cachedAt: number | null = null;
let inflightPromise: Promise<AuthState> | null = null;
const subscribers = new Set<(s: AuthState) => void>();

async function fetchAuthData(): Promise<AuthState> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, role: null, nome: null, fotoUrl: null, loading: false, modulos_leitura: [], modulos_escrita: [], isOperadorService: false, isVendedora: false };
  }
  const roleFromToken = user.user_metadata?.role as Role ?? null;
  const nome = user.user_metadata?.nome as string ?? null;
  const [profileRes, permRes] = await Promise.all([
    fetch(`/api/user/role?user_id=${user.id}`).catch(() => null),
    fetch(`/api/user/permissoes?user_id=${user.id}`).catch(() => null),
  ]);
  // BLINDAGEM: backend retorna 403 quando usuario esta com ativo=false.
  // Forca signOut imediato e manda pro login. Sem isso o ex-funcionario
  // permanece com sessao Supabase valida e consegue carregar telas (ainda
  // que sem dados).
  if (profileRes?.status === 403 || permRes?.status === 403) {
    try { await supabase.auth.signOut(); } catch { /* segue redirect mesmo se signOut falhar */ }
    if (typeof window !== "undefined") {
      window.location.href = "/login?reason=desativado";
    }
    return { user: null, role: null, nome: null, fotoUrl: null, loading: false, modulos_leitura: [], modulos_escrita: [], isOperadorService: false, isVendedora: false };
  }
  const profile = profileRes?.ok ? await profileRes.json() : null;
  const perm    = permRes?.ok    ? await permRes.json()    : null;
  return {
    user,
    role:              (perm?.role ?? roleFromToken) as Role | null,
    nome:              profile?.name ?? nome,
    fotoUrl:           profile?.avatar_url ?? null,
    loading:           false,
    modulos_leitura:   perm?.modulos_leitura ?? [],
    modulos_escrita:   perm?.modulos_escrita ?? [],
    isOperadorService: perm?.is_operador_service ?? false,
    isVendedora:       perm?.is_vendedora ?? false,
  };
}

function notifyAll(s: AuthState) {
  cachedState = s;
  cachedAt = Date.now();
  subscribers.forEach((cb) => cb(s));
}

async function ensureLoaded(): Promise<AuthState> {
  const expired = cachedAt !== null && (Date.now() - cachedAt > CACHE_TTL_MS);
  if (cachedState && !cachedState.loading && !expired) return cachedState;
  if (inflightPromise) return inflightPromise;
  inflightPromise = fetchAuthData()
    .then((s) => { notifyAll(s); inflightPromise = null; return s; })
    .catch((e) => { inflightPromise = null; throw e; });
  return inflightPromise;
}

/** Força revalidação imediata das permissões (chamar após mutations de role/perfil) */
export function invalidarCacheAuth() {
  cachedState = null;
  cachedAt = null;
  inflightPromise = null;
}

let authChangeHooked = false;
let authChangeTimer: ReturnType<typeof setTimeout> | null = null;
function hookAuthChangeOnce() {
  if (authChangeHooked) return;
  authChangeHooked = true;
  const supabase = createClient();
  supabase.auth.onAuthStateChange((event) => {
    // Ignora INITIAL_SESSION (disparado ao subscrever) — o useEffect já chama ensureLoaded
    if (event === "INITIAL_SESSION") return;
    // Debounce de 2s para evitar múltiplas chamadas em rápida sucessão (token refresh, etc.)
    if (authChangeTimer) clearTimeout(authChangeTimer);
    authChangeTimer = setTimeout(() => {
      cachedState = null;
      cachedAt = null;
      inflightPromise = null;
      authChangeTimer = null;
      ensureLoaded().catch(() => {});
    }, 2000);
  });
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(
    cachedState ?? {
      user: null, role: null, nome: null, fotoUrl: null,
      loading: true, modulos_leitura: [], modulos_escrita: [], isOperadorService: false, isVendedora: false,
    }
  );

  useEffect(() => {
    function handleFotoAtualizada(e: Event) {
      const url = (e as CustomEvent<string>).detail;
      setState(prev => prev.user ? { ...prev, fotoUrl: url } : prev);
    }
    window.addEventListener("perfil:foto-atualizada", handleFotoAtualizada);
    return () => window.removeEventListener("perfil:foto-atualizada", handleFotoAtualizada);
  }, []);

  useEffect(() => {
    hookAuthChangeOnce();
    const sub = (s: AuthState) => setState(s);
    subscribers.add(sub);
    if (cachedState && !cachedState.loading) {
      setState(cachedState);
    } else {
      ensureLoaded().then((s) => setState(s)).catch(() => {});
    }
    return () => { subscribers.delete(sub); };
  }, []);

  // ── Tiny OAuth2 keepalive: renova token a cada 30 min (admin/dev apenas) ──
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state.loading) return;
    const roleOk = state.role === "admin" || state.role === "desenvolvedor";
    if (!roleOk || keepaliveRef.current) return;
    keepaliveRef.current = setInterval(() => {
      fetch("/api/admin/tiny-keepalive").catch(() => {});
    }, 30 * 60 * 1000);
    return () => {
      if (keepaliveRef.current) { clearInterval(keepaliveRef.current); keepaliveRef.current = null; }
    };
  }, [state.loading, state.role]);

  return state;
}
