"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { mountVisitPlanner } from "@/lib/visit-planner";
import { signOut } from "./actions";

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function VisitPlanner({ name }: { name: string }) {
  useEffect(() => mountVisitPlanner(createClient()), []);

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            IK
          </span>
          <b>Operations</b>
        </div>
        <span className="today" id="today"></span>
        <div className="acct">
          <span className="av" aria-hidden="true">
            {initials(name)}
          </span>
          <span className="acct-n">{name}</span>
          <form action={signOut}>
            <button type="submit" className="link">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="layout" id="layout">
        <aside className="side" id="side" aria-label="Filters"></aside>
        <section className="center" id="center" aria-label="Calendar"></section>
        <main className="main" id="main" aria-label="Day"></main>
      </div>
      {/* Visit details slide in from the right; lib/visit-planner.js fills and opens it. */}
      <div className="drawer" id="drawer" inert>
        <div className="dr-scrim" data-a="unfocus"></div>
        <aside className="dr-panel" role="dialog" aria-modal="true" aria-labelledby="dr-title">
          <header className="dr-h">
            <h2 id="dr-title">Visit</h2>
            <button type="button" className="dr-x" data-a="unfocus" aria-label="Close">
              ×
            </button>
          </header>
          <div className="dr-b" id="drawer-body"></div>
        </aside>
      </div>
    </>
  );
}
