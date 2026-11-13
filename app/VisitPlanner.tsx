"use client";

import { useEffect } from "react";
import { mountVisitPlanner } from "@/lib/visit-planner";

export default function VisitPlanner() {
  useEffect(() => mountVisitPlanner(), []);

  return (
    <>
      <header className="top">
        <div className="brand">
          <b>IKPM Operations</b>
          <span id="today"></span>
        </div>
        <button type="button" className="link" data-a="reset">
          Start over with sample data
        </button>
      </header>
      <div className="layout" id="layout">
        <aside className="side" id="side" aria-label="Clients and sites"></aside>
        <section className="center" id="center" aria-label="Calendar"></section>
        <main className="main" id="main" aria-label="Visits, meetings and inspections"></main>
      </div>
    </>
  );
}
