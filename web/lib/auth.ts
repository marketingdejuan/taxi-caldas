import crypto from 'crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'tc_session';

function getSecret(): string {
  return process.env.AUTH_SECRET || 'taxi_caldas_secreto_sesion_2026';
}

export function createSessionToken(username: string): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
  const payload = `${username}.${expiresAt}`;
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token?: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [username, expiresStr, sig] = parts;
  const expiresAt = Number(expiresStr);
  if (!username || isNaN(expiresAt) || Date.now() > expiresAt) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(`${username}.${expiresStr}`)
    .digest('hex');

  if (sig.length !== expectedSig.length) return null;
  const valid = crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSig)
  );
  return valid ? username : null;
}

export async function getAuthenticatedUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}
