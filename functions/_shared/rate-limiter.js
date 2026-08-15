export async function checkRateLimit(db, ipHash, endpoint, limit = 5) {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Optional cleanup of old records
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?')
    .bind(windowStart)
    .run();
    
  const result = await db.prepare(
    'SELECT request_count FROM rate_limits WHERE ip_hash = ? AND endpoint = ? AND window_start >= ?'
  )
    .bind(ipHash, endpoint, windowStart)
    .first();
    
  let count = result ? result.request_count : 0;
  
  if (count >= limit) {
    return { allowed: false, count };
  }
  
  if (count === 0) {
    await db.prepare(
      'INSERT INTO rate_limits (ip_hash, endpoint, request_count, window_start) VALUES (?, ?, 1, ?)'
    )
      .bind(ipHash, endpoint, new Date().toISOString())
      .run();
  } else {
    await db.prepare(
      'UPDATE rate_limits SET request_count = request_count + 1 WHERE ip_hash = ? AND endpoint = ? AND window_start >= ?'
    )
      .bind(ipHash, endpoint, windowStart)
      .run();
  }
  
  return { allowed: true, count: count + 1 };
}
