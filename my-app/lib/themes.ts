// Trip themes (for Explore) and moods (for Feeling lucky). No AI or server code here,
// so client components can import it too.
import type { Point } from "./transit";

// The AI tags every new trip with one of these
export const THEMES = ["Views & bridges", "Food & markets", "Parks & outdoors", "Neighborhood wander", "Seasonal & events", "Culture & museums"] as const;
export type Theme = (typeof THEMES)[number];

// Trips made before themes existed only have the old "vibe" — map it over
const FROM_VIBE: Record<string, Theme> = {
  "Scenic views": "Views & bridges", Sunset: "Views & bridges", "Food crawl": "Food & markets",
  "Cheap day out": "Food & markets", "Rainy day": "Culture & museums", "Show a visiting friend": "Neighborhood wander",
};
export function themeOf(r: { vibe: string; card: { theme?: string } }): Theme {
  const t = r.card.theme ?? r.vibe;
  return (THEMES as readonly string[]).includes(t) ? (t as Theme) : FROM_VIBE[r.vibe] ?? "Neighborhood wander";
}

// Whole outing: travel + time spent at the stops
export function outingMinutes(r: { facts: { summary: { minutes: number } }; card: { stops?: { minutes: number }[] } }) {
  return r.facts.summary.minutes + (r.card.stops ?? []).reduce((a, s) => a + (s.minutes || 0), 0);
}
export const hrs = (m: number) => (m < 60 ? `${m} min` : `${Math.round(m / 30) / 2} hr`.replace(".5 hr", "½ hr"));

// "Time you have" on the plan form
export const BUDGETS = [
  { id: "short", label: "A couple of hours", minutes: 150 },
  { id: "half", label: "Half day", minutes: 270 },
  { id: "full", label: "Whole day", minutes: 480 },
] as const;

// Feeling lucky: each mood draws from a theme, and from these places when making a new trip.
// Coordinates are hand-picked (no AI lookup needed = faster).
export type Mood = { id: string; label: string; line: string; theme: Theme; places: Point[] };
export const MOODS: Mood[] = [
  { id: "hungry", label: "Hungry", line: "Cheap, good food somewhere new", theme: "Food & markets", places: [
    { name: "Flushing (Main St)", lat: 40.7596, lon: -73.83 }, { name: "Jackson Heights", lat: 40.747, lon: -73.891 },
    { name: "Manhattan Chinatown", lat: 40.7158, lon: -73.997 }, { name: "Arthur Avenue, Bronx", lat: 40.8551, lon: -73.8885 },
    { name: "Sunset Park (8th Ave)", lat: 40.6413, lon: -74.0115 }, { name: "Chelsea Market", lat: 40.7424, lon: -74.0061 },
  ] },
  { id: "views", label: "Views", line: "Bridges, skyline, water", theme: "Views & bridges", places: [
    { name: "DUMBO", lat: 40.7033, lon: -73.9881 }, { name: "Williamsburg waterfront (Domino Park)", lat: 40.7142, lon: -73.9682 },
    { name: "Roosevelt Island", lat: 40.7615, lon: -73.9496 }, { name: "Long Island City waterfront (Gantry Plaza)", lat: 40.7454, lon: -73.9584 },
    { name: "Brooklyn Heights Promenade", lat: 40.6962, lon: -73.9973 }, { name: "Staten Island Ferry (Whitehall)", lat: 40.7013, lon: -74.0132 },
  ] },
  { id: "outdoors", label: "Outdoorsy", line: "Parks, trees, a long walk", theme: "Parks & outdoors", places: [
    { name: "Prospect Park", lat: 40.6602, lon: -73.969 }, { name: "Fort Tryon Park & The Cloisters", lat: 40.8649, lon: -73.9319 },
    { name: "Inwood Hill Park", lat: 40.8722, lon: -73.9259 }, { name: "Astoria Park", lat: 40.779, lon: -73.922 },
    { name: "Brooklyn Bridge Park", lat: 40.7003, lon: -73.9967 }, { name: "Coney Island", lat: 40.5755, lon: -73.9707 },
  ] },
  { id: "cozy", label: "Cozy / rainy", line: "Indoors, warm, unhurried", theme: "Culture & museums", places: [
    { name: "The Met", lat: 40.7794, lon: -73.9632 }, { name: "Brooklyn Museum", lat: 40.6712, lon: -73.9636 },
    { name: "Museum of the Moving Image", lat: 40.7563, lon: -73.9239 }, { name: "Strand Book Store", lat: 40.7333, lon: -73.9908 },
    { name: "New York Public Library (Bryant Park)", lat: 40.7532, lon: -73.9822 }, { name: "MoMA", lat: 40.7614, lon: -73.9776 },
  ] },
  { id: "new", label: "Something new", line: "A neighborhood you haven't seen", theme: "Neighborhood wander", places: [
    { name: "Greenpoint", lat: 40.73, lon: -73.954 }, { name: "Bushwick murals", lat: 40.7069, lon: -73.9225 },
    { name: "Astoria (30 Ave)", lat: 40.7665, lon: -73.9214 }, { name: "Brighton Beach", lat: 40.5776, lon: -73.9614 },
    { name: "Harlem (125 St)", lat: 40.8094, lon: -73.9481 }, { name: "Ditmas Park", lat: 40.6411, lon: -73.9617 },
  ] },
  { id: "seasonal", label: "Seasonal", line: "Markets and what's on now", theme: "Seasonal & events", places: [
    { name: "Green-Wood Cemetery", lat: 40.6528, lon: -73.9905 }, { name: "New York Botanical Garden", lat: 40.8623, lon: -73.877 },
    { name: "Union Square Greenmarket", lat: 40.7359, lon: -73.9906 }, { name: "Grand Army Plaza Greenmarket", lat: 40.6726, lon: -73.9701 },
  ] },
];
