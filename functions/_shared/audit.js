export async function logAudit(db, adminId, action, resourceType, resourceId, ip, userAgent, metadata = {}) {
  await db.prepare(
    `INSERT INTO audit_log (admin_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    adminId || null,
    action,
    resourceType,
    resourceId || null,
    ip || '0.0.0.0',
    userAgent || 'Unknown',
    JSON.stringify(metadata),
    new Date().toISOString()
  ).run();
}
