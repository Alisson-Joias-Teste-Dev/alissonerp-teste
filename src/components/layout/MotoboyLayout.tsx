"use client";

import { useRouter } from "next/navigation";
import { Gem, LogOut, Truck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";

const BG   = "#184036";
const CARD = "rgba(255,255,255,0.07)";
const CREME = "#F3EADA";
const SAGE  = "#80A795";
const DOURADO = "#DB9864";
const BORDER = "rgba(255,255,255,0.08)";

export default function MotoboyLayout({ children }: { children: React.ReactNode }) {
  const { nome } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG }}>
      {/* Header fixo */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur-lg"
        style={{ backgroundColor: "rgba(15,41,34,0.9)", borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: CARD }}
          >
            <Gem size={15} style={{ color: DOURADO }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-[0.12em]" style={{ color: CREME }}>
              ALISSON
            </p>
            <p className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: SAGE }}>
              Motoboy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[12px] font-medium" style={{ color: CREME }}>{nome ?? "—"}</p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[9px]" style={{ color: SAGE }}>Online</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: CARD }}
            aria-label="Sair"
          >
            <LogOut size={14} style={{ color: SAGE }} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-4 pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-center py-3 backdrop-blur-lg"
        style={{
          backgroundColor: "rgba(15,41,34,0.95)",
          borderTop: `1px solid ${BORDER}`,
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center gap-2" style={{ color: DOURADO }}>
          <Truck size={17} />
          <span className="text-[12px] font-semibold">Protocolos</span>
        </div>
      </nav>
    </div>
  );
}
