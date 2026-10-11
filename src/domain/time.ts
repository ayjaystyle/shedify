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
export function localMidnight(day: string, timezone: string) {
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const rendered = zonedIso(new Date(instant).toISOString(), timezone);
    const local = Date.parse(rendered.slice(0, 19) + "Z");
    instant += target - local;
  }
  if (
    !zonedIso(new Date(instant).toISOString(), timezone).startsWith(
      `${day}T00:00:00`,
    )
  )
    throw new Error("This calendar date has no local midnight.");
  return new Date(instant).toISOString();
}
