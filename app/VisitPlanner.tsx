"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { mountVisitPlanner } from "@/lib/visit-planner";
import { signOut } from "./actions";

export default function VisitPlanner({ name }: { name: string }) {
  useEffect(() => mountVisitPlanner(createClient()), []);

  return (
    <>
      <header className="top">
        <div className="brand">
          <b>IKPM Operations</b>
          <span id="today"></span>
        </div>
        <span className="note" style={{ marginBottom: 6 }}>
          {name}
        </span>
        <form action={signOut}>
          <button type="submit" className="link">
            Sign out
          </button>
        </form>
      </header>
      <div className="layout" id="layout">
        <aside className="side" id="side" aria-label="Clients and sites"></aside>
        <section className="center" id="center" aria-label="Calendar"></section>
        <main className="main" id="main" aria-label="Visits, meetings and inspections"></main>
      </div>
    </>
  );
}
