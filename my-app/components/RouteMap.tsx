"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip } from "react-leaflet";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import type { MapRoute } from "@/lib/routes";

// Numbered square stop marker, like the stop numbers in the trip list
const stopIcon = (n: number, color: string) => L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 0 0 1px #000;display:flex;align-items:center;justify-content:center;font:700 12px Helvetica,Arial,sans-serif">${n}</div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

// Black & white map. Overview: one color per route, click to open. Detail: line colors, dashed walks, timed stops.
export default function RouteMap({ routes, height = 420, focus = false, labels = false }: {
  routes: MapRoute[]; height?: number | string; focus?: boolean; labels?: boolean;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const all = routes.flatMap((r) => r.legs.flatMap((l) => l.path));
  const bounds = focus && all.length > 1 ? (all as [number, number][]) : undefined;
  const single = routes.length === 1;

  return (
    <MapContainer
      className="map-bw w-full"
      style={{ height }}
      {...(bounds ? { bounds, boundsOptions: { padding: [30, 30] } } : { center: [40.758, -73.965] as [number, number], zoom: 12 })}
      scrollWheelZoom={!focus}
      zoomControl={!focus}
      key={typeof height === "string" ? "fill" : "fixed"}
    >
      {/* One fragment child: react-leaflet passes children through as a list, which otherwise needs keys */}
      <>
        {/* Free OpenStreetMap tiles (no key); turned black & white with CSS (.map-bw in globals.css) */}
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <CircleMarker center={[40.80772, -73.96411]} radius={6} pathOptions={{ color: "#000", fillColor: "#fff", fillOpacity: 1, weight: 3 }}>
          <Tooltip>116 St – Columbia</Tooltip>
        </CircleMarker>
        {routes.map((r, i) => {
          const active = single || hover === r.id;
          const dim = !!hover && !active;
          const events = single ? {} : { mouseover: () => setHover(r.id), mouseout: () => setHover(null), click: () => router.push(`/routes/${r.id}`) };
          return (
            <Fragment key={`${r.id}-${i}`}>
              {r.legs.map((l, k) => (
                <Fragment key={k}>
                  {/* white casing so colored lines read on the gray map */}
                  {!l.dashed && <Polyline positions={l.path} pathOptions={{ color: "#fff", weight: active ? 10 : 7, opacity: dim ? 0.2 : 0.9 }} />}
                  <Polyline positions={l.path} eventHandlers={events}
                    pathOptions={{ color: l.color, weight: l.dashed ? 3 : active ? 6 : 4, dashArray: l.dashed ? "4 8" : undefined, opacity: dim ? 0.2 : 1 }}>
                    {!single && <Tooltip sticky>{r.title}</Tooltip>}
                  </Polyline>
                </Fragment>
              ))}
              {r.markers.map((m, k) => (
                <Marker key={`m${k}`} position={[m.lat, m.lon]} icon={stopIcon(m.n ?? k + 1, single ? "#000" : r.color)} opacity={dim ? 0.3 : 1}
                  eventHandlers={single ? {} : { click: () => router.push(`/routes/${r.id}`) }}>
                  <Tooltip direction="top" offset={[0, -12]} permanent={labels}>{m.label}</Tooltip>
                </Marker>
              ))}
            </Fragment>
          );
        })}
      </>
    </MapContainer>
  );
}
