"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import type { MapRoute } from "@/lib/routes";

// Stops of a trip are stars (numbers are already taken by train lines and transfers)
const starIcon = (color: string, size = 26) => L.divIcon({
  className: "",
  html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.6l-6.4 3.6 1.5-7.1L1.7 9.2l7.2-.8z" fill="${color}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  iconSize: [size, size], iconAnchor: [size / 2, size / 2],
});

// Zooms to the selected route (or back out to everything)
function FitTo({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.length ? `${points[0]}|${points[points.length - 1]}|${points.length}` : "";
  useEffect(() => {
    if (points.length > 1) map.flyToBounds(points, { padding: [40, 40], duration: 0.6, maxZoom: 15 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
// Clicking empty map (anything that isn't a route) clears the selection.
// Route lines set bubblingMouseEvents: false so their own clicks don't reach the map.
function ClickAway({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}
// Trek labels only stay on screen once you've zoomed in far enough to read them
function useZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return zoom;
}
function Treks({ route }: { route: MapRoute }) {
  const zoom = useZoom();
  return (
    <>
      {(route.treks ?? []).map((t, i) => (
        <Fragment key={`t${i}`}>
          <Polyline positions={t.path} pathOptions={{ color: "#000", weight: 2, dashArray: "2 6", bubblingMouseEvents: false }} />
          {t.spots.map((g, k) => (
            <CircleMarker key={`${k}-${zoom >= 15}`} center={[g.lat, g.lon]} radius={5} pathOptions={{ color: "#000", weight: 2, fillColor: "#fff", fillOpacity: 1, bubblingMouseEvents: false }}>
              <Tooltip direction="right" offset={[6, 0]} permanent={zoom >= 15}>{g.label}</Tooltip>
            </CircleMarker>
          ))}
        </Fragment>
      ))}
    </>
  );
}

// Black & white map.
// Overview: every route in its own color, stars at its stops. Selecting one zooms to it and swaps in its
// per-line colors (from `details`). A single route (trip page): line colors, dashed walks, labeled trek spots.
export default function RouteMap({ routes, details, selected, onSelect, height = 420, focus = false, labels = false }: {
  routes: MapRoute[]; details?: MapRoute[]; selected?: string | null; onSelect?: (id: string | null) => void;
  height?: number | string; focus?: boolean; labels?: boolean;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const single = routes.length === 1;
  const pick = (id: string) => (onSelect ? onSelect(id) : router.push(`/routes/${id}`));
  const sel = selected ? details?.find((d) => d.id === selected) ?? routes.find((r) => r.id === selected) : undefined;
  const all = routes.flatMap((r) => r.legs.flatMap((l) => l.path));
  const bounds = focus && all.length > 1 ? (all as [number, number][]) : undefined;
  const selPoints = sel ? [...sel.legs.flatMap((l) => l.path), ...(sel.treks ?? []).flatMap((t) => t.path)] : [];

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
        {onSelect && <FitTo points={selPoints.length ? selPoints : all} />}
        {onSelect && sel && <ClickAway onClear={() => onSelect(null)} />}

        {/* Background routes: everything except the selected one */}
        {routes.filter((r) => r.id !== sel?.id).map((r, i) => {
          const dim = !!sel || (!!hover && hover !== r.id);
          const active = single || hover === r.id;
          const events = single ? {} : { mouseover: () => setHover(r.id), mouseout: () => setHover(null), click: () => pick(r.id) };
          return (
            <Fragment key={`${r.id}-${i}`}>
              {r.legs.map((l, k) => (
                <Fragment key={k}>
                  {/* white casing so colored lines read on the gray map */}
                  {!l.dashed && <Polyline positions={l.path} eventHandlers={events} pathOptions={{ color: "#fff", weight: active ? 10 : 7, opacity: dim ? 0.15 : 0.9, bubblingMouseEvents: false }} />}
                  <Polyline positions={l.path} eventHandlers={events}
                    pathOptions={{ color: l.color, weight: l.dashed ? 3 : active ? 6 : 4, dashArray: l.dashed ? "4 8" : undefined, opacity: dim ? 0.18 : 1, bubblingMouseEvents: false }}>
                    {!single && <Tooltip sticky>{r.title}</Tooltip>}
                  </Polyline>
                </Fragment>
              ))}
              {r.markers.map((m, k) => (
                <Marker key={`m${k}`} position={[m.lat, m.lon]} icon={starIcon(single ? "#000" : r.color)} opacity={dim ? 0.25 : 1}
                  eventHandlers={single ? {} : { click: () => pick(r.id) }}>
                  <Tooltip direction="top" offset={[0, -12]} permanent={labels}>{m.label}</Tooltip>
                </Marker>
              ))}
              {single && <Treks route={r} />}
            </Fragment>
          );
        })}

        {/* Selected route on top: colored by train line, stars in the route's own color */}
        {sel && (
          <>
            {sel.legs.map((l, k) => (
              <Fragment key={`s${k}`}>
                {!l.dashed && <Polyline positions={l.path} pathOptions={{ color: "#fff", weight: 11, bubblingMouseEvents: false }} />}
                <Polyline positions={l.path} pathOptions={{ color: l.color, weight: l.dashed ? 3 : 6, dashArray: l.dashed ? "4 8" : undefined, bubblingMouseEvents: false }} />
              </Fragment>
            ))}
            <Treks route={sel} />
            {sel.markers.map((m, k) => (
              <Marker key={`sm${k}`} position={[m.lat, m.lon]} icon={starIcon(routes.find((r) => r.id === sel.id)?.color ?? "#000", 32)}>
                <Tooltip direction="top" offset={[0, -14]} permanent>{m.label}</Tooltip>
              </Marker>
            ))}
          </>
        )}
      </>
    </MapContainer>
  );
}
