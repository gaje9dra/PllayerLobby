import { APP_TIMEZONE } from "@/config/timezone";

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = value.match(/^GMT(?:(\+|-)(\d{2}):?(\d{2}))?$/);

  if (!match?.[1]) return 0;

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const sign = match[1] === "-" ? -1 : 1;

  return sign * ((hours * 60 + minutes) * 60 * 1000);
}

export function parseAppLocalDateTime(value: string) {
  const match = value.match(DATE_TIME_PATTERN);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const wallTime = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  );

  if (
    wallTime.getUTCFullYear() !== Number(year) ||
    wallTime.getUTCMonth() !== Number(month) - 1 ||
    wallTime.getUTCDate() !== Number(day) ||
    wallTime.getUTCHours() !== Number(hour) ||
    wallTime.getUTCMinutes() !== Number(minute)
  ) {
    return null;
  }

  const firstOffset = getTimeZoneOffsetMs(wallTime, APP_TIMEZONE);
  let utcMs = wallTime.getTime() - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(utcMs), APP_TIMEZONE);
  utcMs = wallTime.getTime() - secondOffset;

  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function appTimeZoneLabel() {
  return APP_TIMEZONE.replace(/_/g, " ");
}
