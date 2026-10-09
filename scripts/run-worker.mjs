const app = process.env.NEXT_PUBLIC_APP_URL;
const secret = process.env.CRON_SECRET;
if (!app || !secret || secret.length < 32)
  throw Error("Configure the application URL and CRON_SECRET first.");
const url = new URL("/api/cron", app);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw Error("Use HTTPS for a remote worker endpoint.");
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
while (!stopped) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55000),
      redirect: "error",
    });
    console.log(`Worker HTTP ${response.status}`);
  } catch {
    console.error("Worker connection failed.");
  }
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, 15000));
}
