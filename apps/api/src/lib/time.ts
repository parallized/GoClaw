export function getTomorrowDateString(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const now = new Date();
  const nowInTargetZone = formatter.format(now);
  const next = new Date(`${nowInTargetZone}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return formatter.format(next);
}

export function pickHoursForDate(targetDate: string, hours: { time: string }[]): { time: string }[] {
  return hours.filter((hour) => hour.time.startsWith(targetDate));
}

export function minutesToHuman(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }

  const hour = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hour} 小时` : `${hour} 小时 ${rest} 分钟`;
}

export function addMinutesToClock(clock: string, minutes: number): string {
  const [hour = 0, minute = 0] = clock.split(":").map(Number);
  const date = new Date(2000, 0, 1, hour, minute + minutes, 0, 0);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
