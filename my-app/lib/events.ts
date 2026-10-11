// Recurring markets & events (hand-checked Oct 2026 — schedules change, each has a source link).
import eventsData from "@/data/events.json";
import { distanceKm } from "./transit";

export type CityEvent = { id: string; name: string; area: string; lat: number; lon: number; days: number[]; months: number[]; hours: string; note: string; url: string };
export const EVENTS = eventsData as CityEvent[];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ny = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
export const isOn = (e: CityEvent, d: Date) => e.days.includes(ny(d).getDay()) && e.months.includes(ny(d).getMonth() + 1);
export const eventsOn = (d: Date) => EVENTS.filter((e) => isOn(e, d));
export const daysText = (e: CityEvent) => (e.days.length === 7 ? "Daily" : e.days.map((x) => DAY[x]).join(" & "));
// Events happening on that day within ~1.5 km of a point
export const eventsNear = (p: { lat: number; lon: number }, d: Date) => eventsOn(d).filter((e) => distanceKm(p, e) < 1.5);
