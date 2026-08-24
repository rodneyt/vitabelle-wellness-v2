import { layout } from '../templates/index.js';
import { decryptAESGCM } from '../../_shared/crypto.js';

export async function onRequestGet(context) {
  const id = context.params.id;
  const sub = await context.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  
  if (!sub) return new Response('Not found', { status: 404 });
  if (sub.status !== 'pendiente_proveedor') {
      return new Response('Submission is not pending provider signature.', { status: 400 });
  }

  const patientAudit = await context.env.DB.prepare('SELECT * FROM audit_log WHERE resource_id = ? AND action = ? ORDER BY created_at ASC LIMIT 1').bind(id, 'SUBMISSION_CREATED').first();

  let data = {};
  
  try {
    if (sub.field_data_enc && sub.encryption_iv) {
      const ivParts = sub.encryption_iv.split(':');
      const fieldsIv = ivParts[0];
      const dataStr = await decryptAESGCM(sub.field_data_enc, fieldsIv, context.env.ENCRYPTION_KEY);
      data = JSON.parse(dataStr);
    }
  } catch (e) {
    console.error("Decryption failed:", e);
    return new Response('Failed to decrypt patient data', { status: 500 });
  }

  const tv = await context.env.DB.prepare(`
    SELECT tv.*, t.title 
    FROM template_versions tv 
    JOIN templates t ON t.id = tv.template_id 
    WHERE tv.id = ?
  `).bind(sub.template_version_id).first();

  let fieldsSchema = tv.fields_schema;
  if (typeof fieldsSchema === 'string') {
    try { fieldsSchema = JSON.parse(fieldsSchema); } catch (e) { fieldsSchema = []; }
  }

  const getFieldLabel = (key) => {
    const field = (Array.isArray(fieldsSchema) ? fieldsSchema : []).find(f => f.name === key);
    return field?.label || key;
  };

  const signatureFields = (Array.isArray(fieldsSchema) ? fieldsSchema : []).filter(f => f.type === 'signature');
  const providerSignatureField = signatureFields.length > 1 ? signatureFields[1] : null;

  const htmlContent = `
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
    
    <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    
    <div class="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-xl print-container my-10">
        
        <form id="providerForm" class="space-y-6">
            
            <div id="document-to-print" class="px-8 py-4 bg-white">
                <div class="text-center mb-10">
                    <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuCoWT3y7hI8OgYqWYAkGGLGUhoHx4WJFrGe_3Xbfrjv34HvM9aCIoxf9c0Bb3izQmfmH7OV-rpRH5UqRMF9W71btkgCFhp_JQt52rjpZxFHsJjQ7DFWex_aMDYCxeiq001D1eIgCq7-uCe_n79-aQX0T3fjUdcEu1xC45SC6QsAOiIu2r3YhlgveN0nrEK-z676vp1WhDgqF9jfZo8PQzjKcbR8vNU5JgYBrNUQxyEdP7E2hcxB8l7f8Mn3q8Nm4J4taA" alt="Vita Belle Wellness Logo" class="mx-auto h-32 w-32 rounded-full border-2 border-[#735a36] shadow-sm mb-6">
                    <h1 class="text-4xl font-bold tracking-widest text-[#1e1b18] uppercase playfair-title mb-2">${tv.title || 'Document'}</h1>
                </div>
                
                <div class="prose max-w-none mb-12 text-gray-800 text-justify">
                    ${tv.legal_body}
                </div>
                
                <div class="mb-10">
                    <div class="space-y-4">
                        ${Object.entries(data).map(([k, v]) => '<p><strong>' + getFieldLabel(k) + ':</strong> ' + v + '</p>').join('')}
                    </div>
                </div>

                <!-- Patient Audit Trail -->
                ${patientAudit ? `
                <div class="mt-8 pt-8 border-t border-gray-300 text-sm text-gray-600" style="page-break-inside: avoid; display: inline-block; width: 100%;">
                  <h3 class="font-bold text-lg mb-4 text-black playfair-title">Signer 1 Audit Trail</h3>
                  <p><strong>Signed by:</strong> ${data.patient_full_name || data.provider_name || data.full_name || data.name || data.signer_name || 'Signer 1'}</p>
                  <p><strong>Timestamp:</strong> ${new Date(patientAudit.created_at + 'Z').toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
                  <p><strong>Device:</strong> ${patientAudit.user_agent}</p>
                  <p><strong>IP:</strong> ${patientAudit.ip_address}</p>
                  <p><strong>Document ID:</strong> ${sub.id}</p>
                </div>
                ` : ''}

                <!-- Placeholder for Provider Data to be injected on submit -->
                <div id="provider-data-injection" class="mt-8 pt-8"></div>
            </div>

            <!-- Provider Signature Form (Outside Print Area initially) -->
            <div id="signing-panel" class="px-8 py-6 bg-gray-50 border-t border-gray-200 rounded-b-lg">
                <h3 class="text-xl font-bold text-gray-900 mb-4">Complete Document Signature</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                      <label class="block text-sm font-medium text-gray-700">Provider Name / Full Name</label>
                      <input type="text" name="s2_full_name" required class="mt-1 shadow-sm focus:ring-[#735a36] focus:border-[#735a36] block w-full sm:text-sm border-gray-300 rounded-md">
                  </div>
                  <div>
                      <label class="block text-sm font-medium text-gray-700">Signature Date</label>
                      <input type="date" name="s2_signature_date" required class="mt-1 shadow-sm focus:ring-[#735a36] focus:border-[#735a36] block w-full sm:text-sm border-gray-300 rounded-md">
                  </div>
                </div>

                <div class="mt-6">
                    <label class="block text-sm font-medium text-gray-700 mb-2">${providerSignatureField ? providerSignatureField.label : 'Provider Signature'} *</label>
                    <div class="border border-gray-300 rounded-md bg-white">
                        <canvas id="signaturePad" class="w-full h-40 rounded-md touch-none" style="touch-action: none;"></canvas>
                    </div>
                    <div class="flex justify-between mt-2">
                        <button type="button" id="clearBtn" class="text-sm text-gray-500 hover:text-gray-700">Clear</button>
                    </div>
                </div>

                <div id="submitButtons" class="pt-4 mt-6 flex justify-between">
                    <a href="/admin/submissions/${sub.id}" class="text-gray-600 hover:text-gray-800 text-sm font-medium">Cancel / Back</a>
                    <button type="button" id="submitBtn" class="bg-[#735a36] text-white px-6 py-2 rounded-md hover:bg-[#594321] transition-colors shadow">Sign & Finalize</button>
                </div>
                
                <div id="loadingIndicator" class="hidden text-center text-gray-600 py-4">
                    <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-[#735a36]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p>Processing and generating final PDF...</p>
                </div>
            </div>

        </form>
    </div>

    <script>
      const canvas = document.getElementById('signaturePad');
      function resizeCanvas() {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          canvas.width = canvas.offsetWidth * ratio;
          canvas.height = canvas.offsetHeight * ratio;
          canvas.getContext("2d").scale(ratio, ratio);
      }
      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      const signaturePad = new SignaturePad(canvas, { penColor: "rgb(0, 0, 0)" });

      document.getElementById('clearBtn').addEventListener('click', () => {
          signaturePad.clear();
      });

      document.getElementById('submitBtn').addEventListener('click', async () => {
          if (signaturePad.isEmpty()) {
              alert("Por favor, provee una firma.");
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

          // Inject Provider Data into the PDF preview before snapshot
          let providerHtml = '<div class="space-y-4" style="page-break-inside: avoid; display: inline-block; width: 100%; border-top: 1px solid #d1d5db; padding-top: 2rem;">';
          for (const key in s2Data) {
            if (key !== 'submission_id' && key !== 'provider_signature_svg' && key !== 'cf-turnstile-response') {
              let displayLabel = key;
              if (key === 's2_full_name') displayLabel = 'Provider Name';
              if (key === 's2_signature_date') displayLabel = 'Signature Date';
              providerHtml += '<p><strong>' + displayLabel + ':</strong> ' + s2Data[key] + '</p>';
            }
          }
          providerHtml += '</div>';
          providerHtml += '<div class="mt-4" style="page-break-inside: avoid; display: inline-block; width: 100%;"><img src="' + svgData + '" style="max-height: 150px; width: auto;" /></div>';
          
          // Inject Audit Trail 
          const signerName = s2Data.s2_full_name || 'Signer 2';
          providerHtml += '<div class="html2pdf__page-break"></div>' +
              '<div class="mt-8 pt-8 border-t border-gray-300 text-sm text-gray-600" style="page-break-inside: avoid; display: inline-block; width: 100%;">' +
              '<h3 class="font-bold text-lg mb-4 text-black playfair-title">Signer 2 Audit Trail</h3>' +
              '<p><strong>Signed by:</strong> ' + signerName + '</p>' +
              '<p><strong>Timestamp:</strong> ' + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + ' ET</p>' +
              '<p><strong>Device:</strong> ' + navigator.userAgent + '</p>' +
              '<p><strong>Document ID:</strong> ' + '${sub.id}' + '</p>' +
            '</div>';

          document.getElementById('provider-data-injection').innerHTML = providerHtml;

          const printArea = document.getElementById('document-to-print');
          
          try {
              const pdfBlobUrl = await html2pdf().set({
                  margin: 0.5,
                  filename: 'document.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 1.5, useCORS: true, scrollY: 0 },
                  pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
                  jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
              }).from(printArea).outputPdf('datauristring');
              
              s2Data.pdf_base64 = pdfBlobUrl;

              const response = await fetch('/api/provider-submit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(s2Data)
              });

              if (response.ok) {
                  alert("Documento completado exitosamente.");
                  window.location.href = '/admin/submissions';
              } else {
                  const errInfo = await response.json();
                  alert("Error al guardar: " + (errInfo.error || "Desconocido"));
                  document.getElementById('submitButtons').classList.remove('hidden');
                  document.getElementById('loadingIndicator').classList.add('hidden');
              }
          } catch (e) {
              alert("Error generando PDF: " + e.message);
              document.getElementById('submitButtons').classList.remove('hidden');
              document.getElementById('loadingIndicator').classList.add('hidden');
          }
      });
    </script>
  `;

  return new Response(layout(htmlContent, 'Provider Sign Document'), {
    headers: { 'Content-Type': 'text/html' }
  });
}
