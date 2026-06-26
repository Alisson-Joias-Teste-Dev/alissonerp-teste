"use client";

import { useRouter } from "next/navigation";
import { LogOut, Gem } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Design tokens ─────────────────────────────────────────────────────────────
export const S = {
  bg:         "#184036",
  cardBg:     "rgba(255,255,255,0.06)",
  cardHover:  "rgba(255,255,255,0.10)",
  text:       "rgba(255,255,255,0.85)",
  textMuted:  "rgba(255,255,255,0.5)",
  textFaint:  "rgba(255,255,255,0.3)",
  gold:       "#d4af37",
  border:     "rgba(255,255,255,0.08)",
  btnGreen:   "#1D9E75",
  btnBlue:    "#378ADD",
};

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { nome } = useAuth();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = nome
    ? nome.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "?";

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "100dvh", backgroundColor: S.bg }}
    >
      {/* ── Header sticky ──────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          backgroundColor: S.bg,
          borderBottom: `1px solid ${S.border}`,
          paddingTop: "calc(12px + env(safe-area-inset-top))",
        }}
      >
        {/* Logo + título */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "rgba(212,175,55,0.15)", border: "1px solid rgba(212,175,55,0.3)" }}
          >
            <Gem size={16} color={S.gold} />
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-[0.15em]" style={{ color: S.gold }}>
              ALISSON
            </p>
            <p className="text-[9px] tracking-widest uppercase leading-none" style={{ color: S.textMuted }}>
              Service
            </p>
          </div>
        </div>

        {/* Usuário + status + logout */}
        <div className="flex items-center gap-3">
          {/* Nome + online */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ backgroundColor: "rgba(212,175,55,0.2)", color: S.gold }}
            >
              {initials}
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-medium leading-none" style={{ color: S.text }}>
                {nome ?? "Operador"}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" />
                <span className="text-[9px]" style={{ color: S.textMuted }}>Online</span>
              </div>
            </div>
          </div>

          {/* Sair */}
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            title="Sair"
          >
            <LogOut size={14} color={S.textMuted} />
          </button>
        </div>
      </header>

      {/* ── Conteúdo ───────────────────────────────────────────────────────── */}
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
