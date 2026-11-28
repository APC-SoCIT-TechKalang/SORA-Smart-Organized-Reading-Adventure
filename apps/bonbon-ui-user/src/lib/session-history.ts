export interface SessionBalance {
  return_date: string | null;
  remaining_minutes_after?: number | null;
  unlimited_time_after?: boolean | null;
  food_charge?: number | string | null;
  other_charge?: number | string | null;
  food_other_charges_payment?: string | null;
}

export function remainingTimeLabel(session: SessionBalance) {
  if (!session.return_date) return 'Available after session ends';
  if (session.unlimited_time_after === true) return 'Unlimited';
  const minutes = session.remaining_minutes_after;
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return 'Not recorded';
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function sessionCharges(session: SessionBalance) {
  const food = session.food_charge == null ? NaN : Number(session.food_charge);
  const other = session.other_charge == null ? NaN : Number(session.other_charge);
  const known = Number.isFinite(food) && food >= 0 && Number.isFinite(other) && other >= 0;
  const total = known ? food + other : 0;
  const paid = session.food_other_charges_payment === 'PAID';
  const unpaid = session.food_other_charges_payment === 'UNPAID';
  return { food, other, total, known, paid, unsettled: known && total > 0 && unpaid,
    label: !known ? 'Not recorded' : total === 0 ? 'No charges' : paid ? 'Paid' : unpaid ? 'Unsettled' : 'Payment status unavailable' };
}
