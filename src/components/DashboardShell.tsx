"use client";

import { useAuth } from "@/hooks/useAuth";
import Sidebar from "@/components/Sidebar";
import MotoboyLayout from "@/components/layout/MotoboyLayout";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();

  // Enquanto carrega, renderiza shell mínimo (evita flash de sidebar)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAFAF7" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#184036] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Motoboy → experiência mobile dark, sem sidebar desktop
  if (role === "motoboy") {
    return <MotoboyLayout>{children}</MotoboyLayout>;
  }

  // Todos os outros roles → layout desktop com sidebar
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen" style={{ backgroundColor: "#FAFAF7" }}>
        {children}
      </main>
    </div>
  );
}
