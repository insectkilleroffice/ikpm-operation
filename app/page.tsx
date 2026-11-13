import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import VisitPlanner from "./VisitPlanner";

export default function Home() {
  return (
    <Suspense fallback={<p style={{ padding: 24, color: "var(--mute)" }}>Loading…</p>}>
      <Gate />
    </Suspense>
  );
}

/** Only operations managers and admins can open the planner. */
async function Gate() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  if (me?.role !== "operations" && me?.role !== "admin") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
        <div className="panel">
          <h2>Operations only</h2>
          <p>{user.email} is not an operations account.</p>
          <form action={signOut}>
            <button className="btn alt">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  return <VisitPlanner name={me.full_name || user.email || ""} />;
}
