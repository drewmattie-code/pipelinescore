import { createHmac } from 'node:crypto';

const SECRET = process.env.TESTPACK_SIGNING_SECRET ?? 'dev-secret-change-me-in-prod';

export function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

export function verify(payload: string, signature: string): boolean {
  return sign(payload) === signature;
}
