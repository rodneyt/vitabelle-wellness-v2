import { checkRateLimit } from '../_shared/rate-limiter.js';
import { generateConsentPDF } from '../_shared/pdf-generator.js';
import { encryptAESGCM } from '../_shared/crypto.js';

async function verifyTurnstile(token, secret, ip) {
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  formData.append('remoteip', ip);

  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  const result = await fetch(url, {
    body: formData,
    method: 'POST',
  });

  const outcome = await result.json();
  return outcome.success;
}

async function sha256(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    
    // Rate Limit Check
    if (typeof checkRateLimit === 'function') {
      const rateLimitResult = await checkRateLimit(env.DB, ip, '/api/submit', 5);
      if (!rateLimitResult.allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const data = await request.json();
    const { slug, token, 'cf-turnstile-response': turnstileToken, signature_svg, signature_png, ...fields } = data;

    if (!(slug || token) || !turnstileToken || !signature_svg) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify Turnstile
    if (env.TURNSTILE_SECRET_KEY) {
      const isHuman = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
      if (!isHuman) {
        return new Response(JSON.stringify({ error: 'CAPTCHA verification failed' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Lookup template by token or slug
    let templateId, versionId, legalBody, schemaStr;

    if (token) {
      const linkQuery = `SELECT template_id, status, expires_at FROM client_links WHERE token = ?`;
      const linkResult = await env.DB.prepare(linkQuery).bind(token).first();
      
      if (!linkResult || linkResult.status !== 'active' || new Date(linkResult.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Invalid or expired secure link' }), { status: 403 });
      }

      const templateResult = await env.DB.prepare(`SELECT current_version_id FROM templates WHERE id = ?`).bind(linkResult.template_id).first();
      if (!templateResult) return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404 });

      templateId = linkResult.template_id;
      versionId = templateResult.current_version_id;
    } else {
      const templateQuery = `SELECT id, current_version_id FROM templates WHERE slug = ?`;
      const templateResult = await env.DB.prepare(templateQuery).bind(slug).first();
      if (!templateResult) return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404 });
      
      templateId = templateResult.id;
      versionId = templateResult.current_version_id;
    }

    const versionQuery = `SELECT id, legal_body, fields_schema FROM template_versions WHERE id = ?`;
    const versionResult = await env.DB.prepare(versionQuery).bind(versionId).first();
    if (!versionResult) {
        return new Response(JSON.stringify({ error: 'Template version not found' }), { status: 404 });
    }

    legalBody = versionResult.legal_body;
    schemaStr = versionResult.fields_schema;

    let schema = schemaStr;
    if (typeof schema === 'string') {
        try { schema = JSON.parse(schema); } catch(e) { schema = []; }
    }

    // Validate fields against schema
    if (Array.isArray(schema)) {
      for (const field of schema) {
        if (field.required && !fields[field.name]) {
          return new Response(JSON.stringify({ error: `Field ${field.name} is required` }), { status: 400 });
        }
      }
    }

    // Generate PDF
    const userAgent = request.headers.get('user-agent') || 'Unknown';
    const auditData = { ip, userAgent };

    let pdf_r2_key = null;
    let pdfHash = null;
    if (typeof generateConsentPDF === 'function') {
      const pdfBytes = await generateConsentPDF(templateId, fields, signature_png, auditData);
      pdfHash = await sha256(pdfBytes);
      
      pdf_r2_key = crypto.randomUUID() + '.pdf';
      
      // Upload PDF to R2
      if (env.PDF_BUCKET) {
        await env.PDF_BUCKET.put(pdf_r2_key, pdfBytes);
      }
    }

    // Encrypt PII fields
    let encryptedFields = JSON.stringify(fields);
    let fieldsIv = 'unencrypted';
    let encryptedSig = signature_svg;
    let sigIv = 'unencrypted';

    if (typeof encryptAESGCM === 'function' && env.ENCRYPTION_KEY) {
      const encryptedFieldsData = await encryptAESGCM(JSON.stringify(fields), env.ENCRYPTION_KEY);
      encryptedFields = encryptedFieldsData.ciphertext;
      fieldsIv = encryptedFieldsData.iv;
      
      const encryptedSigData = await encryptAESGCM(signature_svg, env.ENCRYPTION_KEY);
      encryptedSig = encryptedSigData.ciphertext;
      sigIv = encryptedSigData.iv;
    }

    // Fix for schema mismatch
    const submissionId = crypto.randomUUID();
    const combinedIv = `${fieldsIv}:${sigIv}`;
    const userAgentHash = await sha256(new TextEncoder().encode(userAgent));
    const ipHash = await sha256(new TextEncoder().encode(ip));
    
    // Ensure no variables are undefined (D1 throws type error for undefined)
    const safeTemplateId = templateId || null;
    const safeVersionId = versionId || null;
    const safePdfKey = pdf_r2_key || '';
    const safePdfHash = pdfHash || '';

    const insertSubQuery = `
      INSERT INTO submissions 
      (id, template_id, template_version_id, field_data_enc, signature_svg_enc, encryption_iv, consent_accepted, pdf_r2_key, pdf_hash, ip_hash, user_agent_hash)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `;

    const insertResult = await env.DB.prepare(insertSubQuery).bind(
      submissionId,
      safeTemplateId,
      safeVersionId,
      encryptedFields,
      encryptedSig,
      combinedIv,
      safePdfKey,
      safePdfHash,
      ipHash,
      userAgentHash

    ).run();

    if (token) {
      await env.DB.prepare(`UPDATE client_links SET status = 'used' WHERE token = ?`).bind(token).run();
    }

    // Insert Audit Log
    try {
      // Trying to import audit log if exists, else just write to DB
      const { logAudit } = await import('../../src/audit.js').catch(() => ({ logAudit: null }));
      if (typeof logAudit === 'function') {
          await logAudit(env.DB, 'SUBMISSION_CREATED', { submissionId, templateId });
      } else {
          const auditQuery = `INSERT INTO audit_log (action, details, created_at) VALUES (?, ?, datetime('now'))`;
          await env.DB.prepare(auditQuery).bind('SUBMISSION_CREATED', JSON.stringify({ submissionId, templateId })).run();
      }
    } catch (e) {
       // fallback audit log
       const auditQuery = `INSERT INTO audit_log (action, details, created_at) VALUES (?, ?, datetime('now'))`;
       await env.DB.prepare(auditQuery).bind('SUBMISSION_CREATED', JSON.stringify({ submissionId, templateId })).run();
    }

    return new Response(JSON.stringify({ success: true, id: submissionId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Submission error:', error);
    return new Response(JSON.stringify({ error: `Internal Server Error: ${error.message}\n${error.stack}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
