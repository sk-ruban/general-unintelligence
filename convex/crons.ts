import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "refresh open-meteo weather telemetry",
  { minutes: 15 },
  internal.openMeteo.refreshOpenMeteoTelemetryInternal,
  {
    force: true,
    forecastSteps: 96,
    pastSteps: 4,
  },
);

export default crons;
