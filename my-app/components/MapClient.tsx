"use client";
import dynamic from "next/dynamic";
import type { MapRoute } from "@/lib/routes";

// Leaflet needs the browser (window), so the map is loaded client-side only.
const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[320px] w-full animate-pulse bg-neutral-100" />,
});
export default function MapClient(props: { routes: MapRoute[]; height?: number | string; focus?: boolean; labels?: boolean }) {
  return <RouteMap {...props} />;
}
