import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';

/**
 * Verify GitHub webhook HMAC-SHA256 signature.
 * @param {Buffer|string} payload - Raw request body
 * @param {string} signature - Value of x-hub-signature-256 header
 * @returns {boolean}
 */
export function verifyWebhookSignature(payload, signature) {
  if (!env.webhookSecret) {
    throw new Error('GITHUB_WEBHOOK_SECRET not configured');
  }

  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expected = 'sha256=' + createHmac('sha256', env.webhookSecret)
    .update(payload)
    .digest('hex');

  if (expected.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
