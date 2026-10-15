"use client";

import { createContext, useContext, useEffect, useState } from "react";
import MapClient from "./MapClient";
import { DownIcon } from "./Icons";
import type { MapRoute } from "@/lib/routes";

// Home page: the map and the route list share one "selected route".
// Click a route on the map -> its card scrolls into view; click a card -> the map zooms to that route.
const Ctx = createContext<{ selected: string | null; select: (id: string | null, from?: "map" | "card") => void }>({ selected: null, select: () => {} });

export function HomeShell({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const select = (id: string | null, from?: "map" | "card") => {
    setSelected(id);
    // On laptops the list sits next to the map, so bring the card into view.
    // On phones the list is below the map; the floating button links to it instead.
    if (id && from === "map" && window.matchMedia("(min-width: 1024px)").matches)
      document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  // Clicking anywhere in the page that isn't a route card (or the map, which handles its own clicks) clears the selection
  useEffect(() => {
    if (!selected) return;
    const away = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-route-card], .leaflet-container, [data-keep-selection]")) setSelected(null);
    };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [selected]);
  return <Ctx.Provider value={{ selected, select }}>{children}</Ctx.Provider>;
}

export function HomeMap({ routes, details, count }: { routes: MapRoute[]; details: MapRoute[]; count: number }) {
  const { selected, select } = useContext(Ctx);
  const sel = routes.find((r) => r.id === selected);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && select(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });
  return (
    <>
      <MapClient routes={routes} details={details} selected={selected} onSelect={(id) => select(id, "map")} height="100%" />
      {sel && (
        <button onClick={() => select(null)} className="absolute right-3 top-3 z-[500] border border-black bg-white px-3 py-2 text-sm font-bold">Show all routes</button>
      )}
      <a href={sel ? `#card-${sel.id}` : "#routes"} data-keep-selection className="absolute bottom-6 left-1/2 z-[500] flex max-w-[90%] -translate-x-1/2 items-center gap-2 bg-black px-4 py-2.5 text-sm font-bold text-white lg:hidden">
        {sel ? <><span className="h-3 w-3 shrink-0" style={{ background: sel.color }} /> <span className="truncate">{sel.title}</span></> : count ? `${count} routes` : "Routes"} <DownIcon size={16} />
      </a>
    </>
  );
}

// Wraps a (server-rendered) route card: highlights it when selected; clicking its background selects it.
export function SelectableCard({ id, color, children }: { id: string; color?: string; children: React.ReactNode }) {
  const { selected, select } = useContext(Ctx);
  const on = selected === id;
  return (
    <div id={`card-${id}`} data-route-card className="scroll-mt-24 transition-shadow"
      style={on && color ? { boxShadow: `0 0 0 3px ${color}` } : undefined}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,form,summary,input") && color) select(on ? null : id, "card"); }}>
      {children}
    </div>
  );
}
