// Rolling 60s request limiters. Every Jerin route that calls Gemini's generate endpoint shares the
// "chat" bucket so they stay under the free-tier RPM cap together. File uploads use the Files API,
// which has its own, much looser limits, so they get a separate bucket and never eat into the
// chat allowance.
const buckets = new Map<string, number[]>();

export function isRateLimited(limit = 18, bucket = "chat"): boolean {
  const now = Date.now();
  const log = (buckets.get(bucket) ?? []).filter((t) => now - t < 60_000);
  if (log.length >= limit) {
    buckets.set(bucket, log);
    return true;
  }
  log.push(now);
  buckets.set(bucket, log);
  return false;
}
