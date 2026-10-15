"use client";
import dynamic from "next/dynamic";
import type { MapRoute } from "@/lib/routes";

// Leaflet needs the browser (window), so the map is loaded client-side only.
const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[320px] w-full animate-pulse bg-neutral-100" />,
});
export type MapProps = {
  routes: MapRoute[]; details?: MapRoute[]; selected?: string | null; onSelect?: (id: string | null) => void;
  height?: number | string; focus?: boolean; labels?: boolean;
};
export default function MapClient(props: MapProps) {
  return <RouteMap {...props} />;
}
