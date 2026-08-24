import { layout } from '../templates/index.js';
import { decryptAESGCM, createHMAC } from '../../_shared/crypto.js';

function renderProviderHTML(sub, tv, data, patientSigSvg, patientAudit, turnstileSiteKey) {
  let fieldsSchema = tv.fields_schema;
  if (typeof fieldsSchema === 'string') {
    try { fieldsSchema = JSON.parse(fieldsSchema); } catch (e) { fieldsSchema = []; }
  }

  const getFieldLabel = (key) => {
    const field = (Array.isArray(fieldsSchema) ? fieldsSchema : []).find(f => f.name === key);
    return field?.label || key;
  };

  // Filter only s2_ fields for the provider to fill
  const providerFields = (Array.isArray(fieldsSchema) ? fieldsSchema : [])
    .filter(f => f.name && f.name.startsWith('s2_'));

  const providerFieldsHTML = providerFields.map(field => {
    const requiredStr = field.required ? ' *' : '';
    const reqAttr = field.required ? 'required' : '';
    
    if (field.type === 'checkbox') {
      return `
        <div class="flex items-start">
          <div class="flex items-center h-5">
            <input id="${field.name}" name="${field.name}" type="checkbox" ${reqAttr} class="focus:ring-pink-500 h-4 w-4 text-pink-600 border-gray-300 rounded">
          </div>
          <div class="ml-3 text-sm">
            <label for="${field.name}" class="font-medium text-gray-700">${field.label || field.name}<span class="text-red-500">${requiredStr}</span></label>
          </div>
        </div>
      `;
    }
    
    return `
      <div>
        <label for="${field.name}" class="block text-sm font-medium text-gray-700">${field.label || field.name}<span class="text-red-500">${requiredStr}</span></label>
        <div class="mt-1">
          <input type="${field.type}" id="${field.name}" name="${field.name}" ${reqAttr} class="shadow-sm focus:ring-pink-500 focus:border-pink-500 block w-full sm:text-sm border-gray-300 rounded-md">
        </div>
      </div>
    `;
  }).join('');

  // Read-only patient data HTML
  const readOnlyFields = Object.entries(data).map(([k, v]) => `
    <div class="mb-4">
      <dt class="text-sm font-medium text-gray-500">${k}</dt>
      <dd class="mt-1 text-sm text-gray-900">${v}</dd>
    </div>
  `).join('');

  return `
    <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      <!-- Right Side: Provider Signing Form -->
      <div class="bg-white p-6 rounded-lg shadow order-1 md:order-2 h-fit">
        <h2 class="text-xl font-bold mb-4">Complete Document</h2>
        <form id="providerForm" class="space-y-6">
          ${providerFieldsHTML}
          
          <div class="mt-6">
            <h3 class="text-lg font-medium text-gray-900 mb-2">Provider Signature *</h3>
            <div class="border border-gray-300 rounded-md bg-gray-50">
              <canvas id="signaturePad" class="w-full h-40 rounded-md touch-none" style="touch-action: none;"></canvas>
            </div>
            <div class="flex justify-between mt-2">
              <button type="button" id="clearBtn" class="text-sm text-gray-500 hover:text-gray-700">Clear</button>
            </div>
          </div>

          <div class="cf-turnstile mt-4" data-sitekey="${turnstileSiteKey}"></div>

          <div id="submitButtons" class="pt-4 border-t border-gray-200 mt-6 flex justify-between">
            <button type="button" onclick="rejectSubmission()" class="text-red-600 hover:text-red-800 text-sm font-medium">Reject / Void</button>
            <button type="button" id="submitBtn" class="bg-[#735a36] text-white px-4 py-2 rounded-md hover:bg-[#594321] transition-colors">Sign & Complete</button>
          </div>
          
          <div id="loadingIndicator" class="hidden text-center text-gray-600 py-4">
            <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-[#735a36]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p>Processing and generating final PDF...</p>
          </div>
        </form>
      </div>

      <!-- Left Side: Live PDF Preview -->
      <div class="bg-gray-100 p-8 rounded-lg shadow order-2 md:order-1 overflow-x-auto">
        <h2 class="text-xl font-bold mb-4 text-gray-700">Document Preview</h2>
        <div id="document-to-print" class="bg-white p-10 shadow-sm min-w-[800px] text-justify relative">
          
          <div class="text-center mb-10">
            <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuCoWT3y7hI8OgYqWYAkGGLGUhoHx4WJFrGe_3Xbfrjv34HvM9aCIoxf9c0Bb3izQmfmH7OV-rpRH5UqRMF9W71btkgCFhp_JQt52rjpZxFHsJjQ7DFWex_aMDYCxeiq001D1eIgCq7-uCe_n79-aQX0T3fjUdcEu1xC45SC6QsAOiIu2r3YhlgveN0nrEK-z676vp1WhDgqF9jfZo8PQzjKcbR8vNU5JgYBrNUQxyEdP7E2hcxB8l7f8Mn3q8Nm4J4taA" alt="Vita Belle Wellness Logo" class="mx-auto h-32 w-32 rounded-full border-2 border-[#735a36] shadow-sm mb-6">
            <h1 class="text-4xl font-bold tracking-widest text-[#1e1b18] uppercase playfair-title mb-2">${tv.title || 'Document'}</h1>
          </div>

          <div class="prose max-w-none mb-12 text-gray-800 text-justify">
              ${tv.legal_body}
          </div>

          <!-- Submitted Patient Data -->
          <div class="mb-10">
              <div class="space-y-4">
                  ${Object.entries(data).map(([k, v]) => '<p><strong>' + getFieldLabel(k) + ':</strong> ' + v + '</p>').join('')}
              </div>
          </div>

          <div class="mb-8 mt-12">
              <div class="mb-2 no-print">
                  <img src="${patientSigSvg}" alt="Patient Signature" style="max-height: 150px; width: auto;" />
              </div>
          </div>

          <!-- Patient Audit Trail -->
          ${patientAudit ? `
          <div class="mt-8 pt-8 border-t border-gray-300 text-sm text-gray-600">
            <h3 class="font-bold text-lg mb-4 text-black playfair-title">Signer 1 Audit Trail</h3>
            <p><strong>Signed by:</strong> ${data.patient_full_name || data.provider_name || data.full_name || data.name || data.signer_name || 'Signer 1'}</p>
            <p><strong>Timestamp:</strong> ${new Date(patientAudit.created_at + 'Z').toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
            <p><strong>Device:</strong> ${patientAudit.user_agent}</p>
            <p><strong>IP:</strong> ${patientAudit.ip_address}</p>
            <p><strong>Document ID:</strong> ${sub.id}</p>
          </div>
          ` : ''}

          <!-- Placeholder for Provider Data to be injected on submit -->
          <div id="provider-data-injection" class="mt-8 border-t border-gray-300 pt-8"></div>
        </div>
      </div>
    </div>

    <script>
      const canvas = document.getElementById('signaturePad');
      const signaturePad = new SignaturePad(canvas, { backgroundColor: 'rgb(255, 255, 255)' });

      function resizeCanvas() {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext("2d").scale(ratio, ratio);
          signaturePad.clear();
      }

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      document.getElementById('clearBtn').addEventListener('click', () => signaturePad.clear());

      async function rejectSubmission() {
        const reason = prompt("Ingrese el motivo de anulación:");
        if (reason) {
          try {
            const res = await fetch('/api/provider-submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ submission_id: '${sub.id}', reject: true, reason })
            });
            if (res.ok) window.location.reload();
            else alert("Error al anular.");
          } catch(e) { alert("Error: " + e.message); }
        }
      }

      document.getElementById('submitBtn').addEventListener('click', async () => {
          if (signaturePad.isEmpty()) {
              alert("Por favor provea su firma antes de completar el documento.");
              return;
          }
          
          const form = document.getElementById('providerForm');
          if (!form.checkValidity()) {
              form.reportValidity();
              return;
          }

          document.getElementById('submitButtons').classList.add('hidden');
          document.getElementById('loadingIndicator').classList.remove('hidden');

          const formData = new FormData(form);
          const s2Data = Object.fromEntries(formData.entries());
          s2Data.submission_id = '${sub.id}';
          
          const svgData = signaturePad.toDataURL('image/svg+xml');
          s2Data.provider_signature_svg = svgData;

          // Pass fieldsSchema to the frontend JS to map labels
          const fieldsSchemaJson = ${JSON.stringify(fieldsSchema)};
          function getJsFieldLabel(key) {
            const field = fieldsSchemaJson.find(f => f.name === key);
            return field && field.label ? field.label : key;
          }

          // Inject Provider Data into the PDF preview before snapshot
          let providerHtml = '<div class="space-y-4">';
          for (const key in s2Data) {
            if (key !== 'submission_id' && key !== 'provider_signature_svg' && key !== 'cf-turnstile-response') {
              providerHtml += '<p><strong>' + getJsFieldLabel(key) + ':</strong> ' + s2Data[key] + '</p>';
            }
          }
          providerHtml += '</div>';
          providerHtml += '<div class="mt-4"><img src="' + svgData + '" style="max-height: 150px; width: auto;" /></div>';
          
          // Inject Audit Trail 
          const signerName = s2Data.s2_provider_name || s2Data.s2_name || s2Data.s2_full_name || 'Signer 2';
          providerHtml += '<div class="mt-16 pt-8 border-t border-gray-300 text-sm text-gray-600">' +
              '<h3 class="font-bold text-lg mb-4 text-black playfair-title">Signer 2 Audit Trail</h3>' +
              '<p><strong>Signed by:</strong> ' + signerName + '</p>' +
              '<p><strong>Timestamp:</strong> ' + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + ' ET</p>' +
              '<p><strong>Device:</strong> ' + navigator.userAgent + '</p>' +
              '<p><strong>Document ID:</strong> ${sub.id}</p>' +
            '</div>';

          document.getElementById('provider-data-injection').innerHTML = providerHtml;

          const element = document.getElementById('document-to-print');
          
          try {
              const pdfBlobUrl = await html2pdf().set({
                  margin: 0.5,
                  filename: 'document.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 1.5, useCORS: true, scrollY: 0 },
                  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
                  jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
              }).from(element).outputPdf('datauristring');
              
              s2Data.pdf_base64 = pdfBlobUrl;

              const response = await fetch('/api/provider-submit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(s2Data)
              });

              if (response.ok) {
                  alert("Documento completado exitosamente.");
                  window.location.reload();
              } else {
                  const errInfo = await response.json();
                  alert("Error al guardar: " + (errInfo.error || "Desconocido"));
                  window.location.reload();
              }
          } catch (e) {
              alert("Error generando PDF: " + e.message);
              window.location.reload();
          }
      });
    </script>
  `;
}

export async function onRequestGet(context) {
  const id = context.params.id;
  const sub = await context.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  
  if (!sub) return new Response('Not found', { status: 404 });

  const patientAudit = await context.env.DB.prepare('SELECT * FROM audit_log WHERE resource_id = ? AND action = ? ORDER BY created_at ASC LIMIT 1').bind(id, 'SUBMISSION_CREATED').first();

  let data = {};
  let errorMsg = '';
  let patientSigSvg = '';
  
  try {
    if (sub.field_data_enc && sub.encryption_iv) {
      const ivParts = sub.encryption_iv.split(':');
      const fieldsIv = ivParts[0];
      const dataStr = await decryptAESGCM(sub.field_data_enc, fieldsIv, context.env.ENCRYPTION_KEY);
      data = JSON.parse(dataStr);
      
      const sigIv = ivParts[1] || 'unencrypted';
      if (sigIv !== 'unencrypted' && sub.signature_svg_enc) {
        patientSigSvg = await decryptAESGCM(sub.signature_svg_enc, sigIv, context.env.ENCRYPTION_KEY);
      } else {
        patientSigSvg = sub.signature_svg_enc;
      }
    }
  } catch (e) {
    errorMsg = 'Failed to decrypt submission data.';
  }

  if (sub.status === 'pendiente_proveedor') {
    const tv = await context.env.DB.prepare('SELECT * FROM template_versions WHERE id = ?').bind(sub.template_version_id).first();
    const htmlContent = renderProviderHTML(sub, tv, data, patientSigSvg, patientAudit, context.env.TURNSTILE_SITE_KEY);
    
    return new Response(layout(`
      <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500&family=Playfair+Display:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
      <style>
        .prose h2, .prose h3 {
          font-family: 'Playfair Display', serif;
          text-transform: uppercase;
          background-color: #fbdbe2;
          display: inline-block;
          padding: 6px 16px;
          margin-top: 2.5rem;
          margin-bottom: 1.5rem;
          color: #1e1b18;
          letter-spacing: 0.05em;
          font-size: 1.25rem;
          font-weight: 600;
          border-radius: 4px;
        }
        .prose p { margin-bottom: 1rem; line-height: 1.6; }
        .cursive-subtitle { font-family: 'Dancing Script', cursive; }
        .playfair-title { font-family: 'Playfair Display', serif; }
      </style>
      <div class="mb-6 flex justify-between items-center">
        <h1 class="text-2xl font-semibold text-gray-900">Provider Sign-off Required</h1>
        <a href="/admin/submissions" class="text-indigo-600 hover:text-indigo-900">&larr; Back to List</a>
      </div>
      ${errorMsg ? `<div class="bg-red-100 text-red-700 p-4 rounded mb-6">${errorMsg}</div>` : ''}
      ${!errorMsg ? htmlContent : ''}
    `), { headers: { 'Content-Type': 'text/html' } });
  }

  // COMPLETED OR ANULADO VIEW
  const dataHtml = Object.entries(data).map(([k, v]) => `
    <div class="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
      <dt class="text-sm font-medium text-gray-500">${k}</dt>
      <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${v}</dd>
    </div>
  `).join('');

  return new Response(layout(`
    <div class="mb-6 flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-gray-900">Submission Details</h1>
      <a href="/admin/submissions" class="text-indigo-600 hover:text-indigo-900">&larr; Back</a>
    </div>

    ${errorMsg ? `<div class="bg-red-100 text-red-700 p-4 rounded mb-6">${errorMsg}</div>` : ''}

    ${sub.status === 'anulado' ? `
      <div class="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-red-800">Documento Anulado</h3>
            <p class="text-sm text-red-700 mt-2">Motivo: ${sub.rejection_reason || 'Rechazado por proveedor'}</p>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
      <div class="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 class="text-lg leading-6 font-medium text-gray-900">Submitted Data</h3>
          <p class="mt-1 max-w-2xl text-sm text-gray-500">Date: ${new Date(sub.created_at).toLocaleString("en-US", { timeZone: 'America/New_York' })}</p>
          <p class="mt-1 max-w-2xl text-sm text-gray-500">Status: <span class="font-bold">${sub.status ? sub.status.toUpperCase() : 'COMPLETED'}</span></p>
        </div>
        ${sub.pdf_r2_key ? `
          <a href="/admin/submissions/${sub.id}/pdf" target="_blank" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">Download / Print PDF</a>
        ` : ''}
      </div>
      <div class="border-t border-gray-200 px-4 py-5 sm:p-0">
        <dl class="sm:divide-y sm:divide-gray-200">
          ${dataHtml}
        </dl>
      </div>
    </div>
    
    <div class="mt-8 flex justify-end">
      <button onclick="deleteSubmission('${sub.id}')" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">
        Delete Submission
      </button>
    </div>

    <script>
      async function deleteSubmission(id) {
        if (!confirm('Are you sure you want to permanently delete this submission? This action cannot be undone.')) {
          return;
        }
        
        try {
          const response = await fetch('/admin/submissions/' + id, { method: 'DELETE' });
          if (response.ok) {
            window.location.href = '/admin/submissions';
          } else {
            alert('Failed to delete submission');
          }
        } catch (e) {
          alert('Error: ' + e.message);
        }
      }
    </script>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestDelete(context) {
  const id = context.params.id;
  
  // Get submission first to delete PDF
  const sub = await context.env.DB.prepare('SELECT pdf_r2_key FROM submissions WHERE id = ?').bind(id).first();
  
  if (sub && sub.pdf_r2_key && context.env.PDF_BUCKET) {
    await context.env.PDF_BUCKET.delete(sub.pdf_r2_key);
  }
  
  await context.env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
  
  return new Response('Deleted', { status: 200 });
}
