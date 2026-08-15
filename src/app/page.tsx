import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getCachedUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  redirect(profile?.username ? "/dashboard" : "/onboarding");
}
