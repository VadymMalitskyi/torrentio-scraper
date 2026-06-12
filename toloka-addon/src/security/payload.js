import crypto from 'node:crypto';
import { z } from 'zod';

const payloadSchema = z.object({
  v: z.literal(1),
  topicId: z.number().int().positive(),
  attachmentId: z.number().int().positive(),
  infoHash: z.string().regex(/^[a-f0-9]{40}$/),
  path: z.string().min(1).max(2048),
  size: z.number().int().positive(),
  imdbId: z.string().regex(/^tt\d+$/),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().nonnegative().optional(),
  issuedAt: z.number().int().positive(),
});

export function signPayload(value, secret) {
  const validated = payloadSchema.parse(value);
  const payload = Buffer.from(JSON.stringify(validated)).toString('base64url');
  return {
    payload,
    signature: signatureFor(payload, secret),
  };
}

export function verifyPayload(payload, signature, secret, {
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 86400,
  maxPayloadLength = 8192,
} = {}) {
  if (payload.length > maxPayloadLength) {
    throw new InvalidPayloadError();
  }
  const expected = Buffer.from(signatureFor(payload, secret));
  const actual = Buffer.from(signature || '');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new InvalidPayloadError();
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidPayloadError();
  }
  const result = payloadSchema.safeParse(decoded);
  if (!result.success || result.data.issuedAt > nowSeconds + 60) {
    throw new InvalidPayloadError();
  }
  if (nowSeconds - result.data.issuedAt > ttlSeconds) {
    throw new ExpiredPayloadError();
  }
  return result.data;
}

function signatureFor(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export class InvalidPayloadError extends Error {
  constructor() {
    super('Invalid resolver payload');
    this.name = 'InvalidPayloadError';
  }
}

export class ExpiredPayloadError extends Error {
  constructor() {
    super('Expired resolver payload');
    this.name = 'ExpiredPayloadError';
  }
}
