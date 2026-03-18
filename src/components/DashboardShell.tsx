"use client";

import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import { SidebarProvider } from "@/contexts/SidebarContext";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  // Enquanto carrega, renderiza shell mínimo (evita flash de sidebar)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAFAF7" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#184036] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Todas as roles → layout padrão com sidebar (motoboy vê só "Protocolo")
  return (
    <SidebarProvider>
      <MobileHeader />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 md:ml-56 mt-14 md:mt-0 min-h-screen" style={{ backgroundColor: "#FAFAF7" }}>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
