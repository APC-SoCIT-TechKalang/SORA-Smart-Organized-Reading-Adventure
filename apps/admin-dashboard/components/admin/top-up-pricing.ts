export const MAX_TOP_UP_PESOS = 100_000;

// The transaction stores pesos to two decimal places, while reading time is whole minutes.
export function quoteTimeTopUp(hours: string, minutes: string, hourlyRate: number) {
  const wholeNumber = (value: string) => value === "" || /^\d+$/.test(value);
  if (!wholeNumber(hours) || !wholeNumber(minutes)) return null;

  const hourCount = Number(hours || 0);
  const minuteCount = Number(minutes || 0);
  if (!Number.isSafeInteger(hourCount) || !Number.isSafeInteger(minuteCount)
    || minuteCount >= 60 || !Number.isFinite(hourlyRate) || hourlyRate <= 0) return null;

  const totalMinutes = hourCount * 60 + minuteCount;
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes <= 0) return null;

  const amount = Math.round((totalMinutes * hourlyRate / 60) * 100) / 100;
  if (amount <= 0 || amount > MAX_TOP_UP_PESOS) return null;
  return { minutes: totalMinutes, amount };
}
