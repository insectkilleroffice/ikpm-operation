import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signedInUser } from "@/lib/supabase/user";
import { signOut } from "./actions";
import VisitPlanner from "./VisitPlanner";

export default function Home() {
  return (
    <Suspense fallback={<p style={{ padding: 24, color: "var(--mute)" }}>Loading…</p>}>
      <Gate />
    </Suspense>
  );
}

/** Only operations managers open the planner. Each one sees only the sites admin gave them. */
async function Gate() {
  await connection();
  const supabase = await createClient();
  const user = await signedInUser(supabase);
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  if (me?.role !== "operations") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, textAlign: "center" }}>
        <div className="panel">
          <h2>Operations only</h2>
          <p>
            {user.email} {me ? `is a ${me.role} account.` : "has no staff profile yet."} Only operations managers can use this portal.
          </p>
          <form action={signOut}>
            <button className="btn alt">Sign out</button>
          </form>
        </div>
      </main>
    );
  }

  return <VisitPlanner name={me.full_name || user.email || ""} />;
}
