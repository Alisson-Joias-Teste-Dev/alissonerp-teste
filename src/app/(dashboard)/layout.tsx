import DashboardShell from "@/components/DashboardShell";
import { RfidPrintScripts } from "@/components/rfid/RfidPrintScripts";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RfidPrintScripts />
      <DashboardShell>{children}</DashboardShell>
    </>
  );
}
