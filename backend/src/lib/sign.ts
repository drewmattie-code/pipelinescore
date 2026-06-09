import { createHmac, timingSafeEqual } from 'node:crypto';

const DEV_SECRET = 'dev-secret-change-me-in-prod';
const SECRET = process.env.TESTPACK_SIGNING_SECRET ?? DEV_SECRET;

// The signing secret protects testpack integrity. If it is left at the public
// dev default in production, anyone can forge a valid signature. Warn loudly
// rather than throw, so an existing deploy that has not set the var yet keeps
// serving (the CLI does not enforce the signature today — see the security
// review; the real fix is asymmetric Ed25519 verification in the CLI).
if (process.env.NODE_ENV === 'production' && SECRET === DEV_SECRET) {
  console.warn(
    '[pipelinescore-api] WARNING: TESTPACK_SIGNING_SECRET is unset in production; ' +
    'using the public dev default. Testpack signatures are forgeable until this is set.'
  );
}

export function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

export function verify(payload: string, signature: string): boolean {
  // Constant-time comparison to avoid leaking the expected HMAC byte-by-byte
  // via response timing.
  const expected = Buffer.from(sign(payload), 'hex');
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}
