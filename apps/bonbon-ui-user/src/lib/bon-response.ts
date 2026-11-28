export interface BonPayload {
  message?: unknown;
  navigateTo?: unknown;
  suggestions?: unknown;
  recommendations?: unknown;
  recommendationState?: unknown;
  widgets?: unknown;
  error?: unknown;
}

export async function readBonPayload(response: Pick<Response, 'ok' | 'text'>): Promise<BonPayload & { message: string }> {
  const body = await response.text();
  let payload: BonPayload;
  try { payload = JSON.parse(body) as BonPayload; }
  catch { throw new Error('BON’s online service is unavailable right now. Please try again later.'); }
  if (!payload || typeof payload !== 'object') throw new Error('BON’s online service is unavailable right now. Please try again later.');
  const message = payload.message;
  if (!response.ok || typeof message !== 'string' || !message.trim()) {
    throw new Error(typeof payload.error === 'string' && payload.error.trim() ? payload.error : 'BON’s online service is unavailable right now. Please try again later.');
  }
  return { ...payload, message };
}
