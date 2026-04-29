import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh open-meteo weather telemetry",
  { minutes: 15 },
  internal.openMeteo.refreshOpenMeteoTelemetryInternal,
  {
    force: false,
    maxAgeMinutes: 15,
    forecastSteps: 96,
    pastSteps: 4,
  },
);

crons.daily(
  "cleanup cached market data history",
  { hourUTC: 2, minuteUTC: 0 },
  internal.maintenance.cleanupCachedFetchHistory,
  {
    weatherKeepLatest: 96,
    ttfKeepLatest: 96,
    eexKeepLatest: 48,
    batchSize: 50,
  },
);

export default crons;
