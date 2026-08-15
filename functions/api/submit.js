import { checkRateLimit } from '../../src/rate-limiter.js';
import { generateConsentPDF } from '../../src/pdf-generator.js';
import { encryptAESGCM } from '../../src/crypto.js';

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
      const isAllowed = await checkRateLimit(env.DB, ip);
      if (!isAllowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const data = await request.json();
    const { slug, 'cf-turnstile-response': turnstileToken, signature_svg, signature_png, ...fields } = data;

    if (!slug || !turnstileToken || !signature_svg) {
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

    // Lookup template
    const templateQuery = `SELECT id, current_version_id FROM templates WHERE slug = ?`;
    const templateResult = await env.DB.prepare(templateQuery).bind(slug).first();
    if (!templateResult) {
       return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404 });
    }

    const versionQuery = `SELECT id, legal_body, fields_schema FROM template_versions WHERE id = ?`;
    const versionResult = await env.DB.prepare(versionQuery).bind(templateResult.current_version_id).first();
    if (!versionResult) {
        return new Response(JSON.stringify({ error: 'Template version not found' }), { status: 404 });
    }

    let schema = versionResult.fields_schema;
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
    let pdf_r2_key = null;
    let pdfHash = null;
    if (typeof generateConsentPDF === 'function') {
      const pdfBytes = await generateConsentPDF(versionResult.legal_body, fields, signature_png);
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
      encryptedFields = encryptedFieldsData.encryptedText;
      fieldsIv = encryptedFieldsData.iv;
      
      const encryptedSigData = await encryptAESGCM(signature_svg, env.ENCRYPTION_KEY);
      encryptedSig = encryptedSigData.encryptedText;
      sigIv = encryptedSigData.iv;
    }

    // Insert submission
    const insertSubQuery = `
      INSERT INTO submissions 
      (template_id, version_id, encrypted_pii_data, encrypted_pii_iv, encrypted_signature_svg, encrypted_signature_iv, pdf_r2_key, pdf_hash, created_at, client_ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `;
    
    // IP Hash
    const ipHash = await sha256(new TextEncoder().encode(ip));

    const insertResult = await env.DB.prepare(insertSubQuery).bind(
      templateResult.id,
      versionResult.id,
      encryptedFields,
      fieldsIv,
      encryptedSig,
      sigIv,
      pdf_r2_key,
      pdfHash,
      ipHash
    ).run();

    const submissionId = insertResult.meta.last_row_id;

    // Insert Audit Log
    try {
      // Trying to import audit log if exists, else just write to DB
      const { logAudit } = await import('../../src/audit.js').catch(() => ({ logAudit: null }));
      if (typeof logAudit === 'function') {
          await logAudit(env.DB, 'SUBMISSION_CREATED', { submissionId, templateId: templateResult.id });
      } else {
          const auditQuery = `INSERT INTO audit_log (action, details, created_at) VALUES (?, ?, datetime('now'))`;
          await env.DB.prepare(auditQuery).bind('SUBMISSION_CREATED', JSON.stringify({ submissionId, templateId: templateResult.id })).run();
      }
    } catch (e) {
       // fallback audit log
       const auditQuery = `INSERT INTO audit_log (action, details, created_at) VALUES (?, ?, datetime('now'))`;
       await env.DB.prepare(auditQuery).bind('SUBMISSION_CREATED', JSON.stringify({ submissionId, templateId: templateResult.id })).run();
    }

    return new Response(JSON.stringify({ success: true, id: submissionId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Submission error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
