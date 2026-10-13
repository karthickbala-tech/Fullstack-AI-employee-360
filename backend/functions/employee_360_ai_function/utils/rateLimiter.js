'use strict';

const { RateLimitError } = require('./errors');

// Bounded so a flood of distinct keys cannot grow memory without limit.
const MAX_KEYS = 2000;

/**
 * Sliding-window request limiter held in one function instance's memory.
 * Best effort (each instance counts on its own), but it stops a single
 * client's loop or double-clicks from burning shared API quota.
 */
class RateLimiter {
  constructor() {
    this.hits = new Map();
  }

  /**
   * Records one request for `key` under `bucket`, or throws RateLimitError
   * (HTTP 429 with Retry-After) when `max` requests already fell in `windowMs`.
   */
  consume(bucket, key, [max, windowMs], now = Date.now()) {
    const id = `${bucket}:${key}`;
    const recent = (this.hits.get(id) || []).filter(time => now - time < windowMs);
    if (recent.length >= max) {
      this.hits.set(id, recent);
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      throw new RateLimitError('Too many requests. Please wait a moment and try again.', retryAfterSeconds);
    }
    recent.push(now);
    this.hits.delete(id);
    this.hits.set(id, recent);
    if (this.hits.size > MAX_KEYS) {
      this.hits.delete(this.hits.keys().next().value);
    }
  }

  /** The caller's identity for limiting: the verified user, else the client address. */
  keyFor(context, req) {
    const user = context?.user;
    if (user?.employeeId) return `emp:${user.employeeId}`;
    if (user?.email) return `mail:${String(user.email).toLowerCase()}`;
    if (user?.userId) return `user:${user.userId}`;
    const forwarded = req?.headers?.['x-forwarded-for'];
    const address = (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req?.socket?.remoteAddress;
    return `ip:${address || 'unknown'}`;
  }

  reset() {
    this.hits.clear();
  }
}

// One limiter per function instance, shared by all controllers.
module.exports = new RateLimiter();
module.exports.RateLimiter = RateLimiter;
