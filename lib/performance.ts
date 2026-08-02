import type { PricePoint } from "./types";

export interface CalculatedPerformance {
  latestPrice: number;
  latestDate: string;
  oneMonthReturn: number | null;
  sixMonthReturn: number | null;
  oneYearReturn: number | null;
  distanceFromOneYearHigh: number | null;
}

function formatDate(year: number, monthIndex: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftCalendarMonths(dateString: string, months: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const absoluteMonth = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const finalDay = Math.min(
    day,
    new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate(),
  );
  return formatDate(targetYear, targetMonth, finalDay);
}

function returnFromAnchor(
  points: PricePoint[],
  latestPrice: number,
  targetDate: string,
) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point.date <= targetDate) {
      return ((latestPrice / point.close) - 1) * 100;
    }
  }
  return null;
}

export function calculatePerformance(
  inputPoints: PricePoint[],
): CalculatedPerformance | null {
  if (!inputPoints.length) return null;
  const points = [...inputPoints].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const latest = points[points.length - 1];
  const oneMonthDate = shiftCalendarMonths(latest.date, 1);
  const sixMonthDate = shiftCalendarMonths(latest.date, 6);
  const oneYearDate = shiftCalendarMonths(latest.date, 12);
  const oneYearPoints = points.filter((point) => point.date >= oneYearDate);
  const oneYearHigh = oneYearPoints.reduce<number | null>((best, point) => {
    const value = point.high ?? point.close;
    return best == null || value > best ? value : best;
  }, null);

  return {
    latestPrice: latest.close,
    latestDate: latest.date,
    oneMonthReturn: returnFromAnchor(points, latest.close, oneMonthDate),
    sixMonthReturn: returnFromAnchor(points, latest.close, sixMonthDate),
    oneYearReturn: returnFromAnchor(points, latest.close, oneYearDate),
    distanceFromOneYearHigh:
      oneYearHigh == null ? null : ((latest.close / oneYearHigh) - 1) * 100,
  };
}
