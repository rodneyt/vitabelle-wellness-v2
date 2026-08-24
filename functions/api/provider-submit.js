import { encryptAESGCM, decryptAESGCM } from '../_shared/crypto.js';

// SHA-256 Hashing
async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const data = await request.json();
    const { submission_id, provider_signature_svg, reject, reason, pdf_base64, ...s2Fields } = data;
    const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';

    if (!submission_id) return new Response(JSON.stringify({ error: 'Missing submission ID' }), { status: 400 });

    const sub = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(submission_id).first();
    if (!sub) return new Response(JSON.stringify({ error: 'Submission not found' }), { status: 404 });
    if (sub.status !== 'pendiente_proveedor') return new Response(JSON.stringify({ error: 'Invalid state' }), { status: 400 });

    if (reject) {
        await env.DB.prepare('UPDATE submissions SET status = ?, rejection_reason = ? WHERE id = ?')
            .bind('anulado', reason || 'Rechazado por proveedor', submission_id).run();
        
        await env.DB.prepare('INSERT INTO audit_log (id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))')
            .bind(crypto.randomUUID(), 'SUBMISSION_REJECTED', 'submission', submission_id, JSON.stringify({ reason })).run();
            
        return new Response(JSON.stringify({ success: true }));
    }

    // Merge new fields with existing fields
    let originalData = {};
    const ivParts = sub.encryption_iv.split(':');
    const fieldsIv = ivParts[0];
    
    if (sub.field_data_enc && env.ENCRYPTION_KEY) {
        const dataStr = await decryptAESGCM(sub.field_data_enc, fieldsIv, env.ENCRYPTION_KEY);
        originalData = JSON.parse(dataStr);
    }
    
    const mergedData = { ...originalData, ...s2Fields };
    let newEncryptedFields = sub.field_data_enc;
    let newFieldsIv = fieldsIv;

    if (env.ENCRYPTION_KEY) {
        const encResult = await encryptAESGCM(JSON.stringify(mergedData), env.ENCRYPTION_KEY);
        newEncryptedFields = encResult.ciphertext;
        newFieldsIv = encResult.iv;
    }

    // Encrypt Provider Signature
    let encryptedProviderSig = provider_signature_svg;
    let providerSigIv = 'unencrypted';
    if (env.ENCRYPTION_KEY && provider_signature_svg) {
        const encSig = await encryptAESGCM(provider_signature_svg, env.ENCRYPTION_KEY);
        encryptedProviderSig = encSig.ciphertext;
        providerSigIv = encSig.iv;
    }

    // Process new PDF
    let newPdfKey = sub.pdf_r2_key;
    let newPdfHash = sub.pdf_hash;
    
    if (pdf_base64 && env.PDF_BUCKET) {
      const b64Data = pdf_base64.includes(',') ? pdf_base64.split(',')[1] : pdf_base64;
      const binaryString = atob(b64Data);
      const pdfBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        pdfBytes[i] = binaryString.charCodeAt(i);
      }
      
      newPdfHash = await sha256(pdfBytes);
      newPdfKey = crypto.randomUUID() + '.pdf';
      
      await env.PDF_BUCKET.put(newPdfKey, pdfBytes);
      
      // Delete old PDF
      if (sub.pdf_r2_key) {
        await env.PDF_BUCKET.delete(sub.pdf_r2_key);
      }
    }

    const newCombinedIv = `${newFieldsIv}:${ivParts[1] || 'unencrypted'}:${providerSigIv}`;

    // Update submission
    await env.DB.prepare(`
        UPDATE submissions 
        SET status = 'completado',
            field_data_enc = ?,
            provider_signature_svg_enc = ?,
            encryption_iv = ?,
            pdf_r2_key = ?,
            pdf_hash = ?
        WHERE id = ?
    `).bind(
        newEncryptedFields,
        encryptedProviderSig,
        newCombinedIv,
        newPdfKey || '',
        newPdfHash || '',
        submission_id
    ).run();

    await env.DB.prepare('INSERT INTO audit_log (id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))')
        .bind(crypto.randomUUID(), 'PROVIDER_SIGNED', 'submission', submission_id, JSON.stringify({ ip })).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
