import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import fs from "fs";
import path from "path";
import DocContent from "./DocContent";

export default async function DocInventarioRfidPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const apkPath = path.join(process.cwd(), "public", "apk", "alisson-rfid.apk");
  let apkExists = false;
  let apkSize = 0;

  try {
    if (fs.existsSync(apkPath)) {
      apkExists = true;
      apkSize = fs.statSync(apkPath).size;
    }
  } catch {}

  return <DocContent apkExists={apkExists} apkSize={apkSize} />;
}
