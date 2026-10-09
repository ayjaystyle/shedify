// Preserve the hospital's wall-clock day in Timefold while retaining the exact UTC instant.
export function zonedIso(instant: string, timezone: string) {
  const date = new Date(instant);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const local = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const offset = Math.round(
    (Date.parse(`${local}Z`) - Math.floor(date.getTime() / 1000) * 1000) /
      60000,
  );
  const sign = offset >= 0 ? "+" : "-";
  const minutes = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
