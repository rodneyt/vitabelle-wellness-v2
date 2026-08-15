export async function onRequest(context) {
  const { request, env, params } = context;
  const { token } = params;
  
  try {
    // Look up token
    const linkQuery = `SELECT id, template_id, status, expires_at FROM client_links WHERE token = ?`;
    const linkResult = await env.DB.prepare(linkQuery).bind(token).first();

    if (!linkResult) {
      return new Response(renderError('Link Not Found', 'The requested secure link does not exist.'), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    if (linkResult.status === 'used') {
      return new Response(renderError('Link Already Used', 'This secure link has already been used and submitted. Links are for one-time use only.'), { status: 403, headers: { 'Content-Type': 'text/html' } });
    }

    if (linkResult.status === 'expired' || new Date(linkResult.expires_at) < new Date()) {
      return new Response(renderError('Link Expired', 'This secure link has expired. Please request a new one.'), { status: 403, headers: { 'Content-Type': 'text/html' } });
    }

    // Look up template by id
    const templateQuery = `SELECT id, slug, current_version_id FROM templates WHERE id = ?`;
    const templateResult = await env.DB.prepare(templateQuery).bind(linkResult.template_id).first();

    if (!templateResult || !templateResult.current_version_id) {
      return new Response(renderError('Not Found', 'Template not found.'), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    const versionQuery = `SELECT legal_body, fields_schema FROM template_versions WHERE id = ?`;
    const versionResult = await env.DB.prepare(versionQuery).bind(templateResult.current_version_id).first();

    if (!versionResult) {
      return new Response(renderError('Not Found', 'Template version not found.'), { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    const legalBody = versionResult.legal_body;
    let fieldsSchema = versionResult.fields_schema;
    if (typeof fieldsSchema === 'string') {
        try {
            fieldsSchema = JSON.parse(fieldsSchema);
        } catch (e) {
            fieldsSchema = [];
        }
    }

    // Note: We pass the TOKEN to the HTML, not the slug.
    const html = renderHTML(token, templateResult.slug, legalBody, fieldsSchema, env.TURNSTILE_SITE_KEY);
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

  } catch (error) {
    console.error('Error fetching secure link:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function renderError(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Vita Belle Wellness</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center h-screen">
    <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 class="text-2xl font-bold text-red-600 mb-4">${title}</h1>
        <p class="text-gray-700">${message}</p>
    </div>
</body>
</html>`;
}

function renderHTML(token, slug, legalBody, fieldsSchema, turnstileSiteKey) {
  // Generate form fields from schema
  const fieldsHTML = (Array.isArray(fieldsSchema) ? fieldsSchema : []).map(field => {
    return `
      <div class="mb-4">
        <label for="${field.name}" class="block text-sm font-medium text-gray-700 mb-1">${field.label} ${field.required ? '<span class="text-red-500">*</span>' : ''}</label>
        <input type="${field.type || 'text'}" id="${field.name}" name="${field.name}" ${field.required ? 'required' : ''} class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Secure Document - Vita Belle Wellness</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <style>
      @media print {
        .no-print { display: none !important; }
        body { background: white; margin: 0; padding: 0; }
        .print-container { box-shadow: none; border: none; padding: 0; }
        .print-only { display: block !important; }
      }
      .print-only { display: none; }
    </style>
</head>
<body class="bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
    <div class="max-w-3xl mx-auto mb-4 flex justify-end no-print">
        <button onclick="window.print()" class="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1 rounded-md bg-white">🖨️ Print Blank Document</button>
    </div>

    <div class="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow print-container">
        
        <form id="consentForm" class="space-y-6">
            <input type="hidden" name="token" value="${token}">
            
            <div id="document-to-print">
                <h1 class="text-2xl font-bold text-center mb-6">Vita Belle Wellness</h1>
                
                <div class="prose max-w-none mb-8 text-gray-700 bg-gray-50 p-6 rounded-md border border-gray-200 print-container">
                    ${legalBody}
                </div>

                <div class="bg-gray-50 p-6 rounded-md border border-gray-200 print-container mb-6">
                    <h2 class="text-lg font-medium text-gray-900 mb-4">Patient Information</h2>
                    ${fieldsHTML}
                </div>

                <div class="bg-gray-50 p-6 rounded-md border border-gray-200 print-container mb-6">
                    <h2 class="text-lg font-medium text-gray-900 mb-4">Signature</h2>
                    <div class="border border-gray-300 rounded-md bg-white no-print">
                        <canvas id="signaturePad" class="w-full h-48 rounded-md touch-none" style="touch-action: none;"></canvas>
                    </div>
                    <div class="print-only mt-8 border-t border-black pt-2 w-64 text-center">
                        Signature
                    </div>
                </div>
            </div>

            <div class="mt-2 flex justify-end no-print">
                <button type="button" id="clearSignature" class="text-sm text-gray-600 hover:text-gray-900 underline">Clear Signature</button>
            </div>

            <div class="cf-turnstile no-print" data-sitekey="${turnstileSiteKey}" data-callback="javascriptCallback"></div>

            <div id="errorMsg" class="hidden text-red-600 text-sm font-medium p-3 bg-red-50 rounded-md border border-red-200 no-print"></div>
            <div id="successMsg" class="hidden text-green-600 text-sm font-medium p-4 bg-green-50 rounded-md border border-green-200 text-center no-print">
                <svg class="mx-auto h-12 w-12 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                Document signed and submitted securely. Thank you!
            </div>

            <button type="submit" id="submitBtn" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors no-print">
                Sign & Submit Document
            </button>
        </form>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const canvas = document.getElementById('signaturePad');
            
            function resizeCanvas() {
                const ratio =  Math.max(window.devicePixelRatio || 1, 1);
                canvas.width = canvas.offsetWidth * ratio;
                canvas.height = canvas.offsetHeight * ratio;
                canvas.getContext("2d").scale(ratio, ratio);
            }
            
            window.addEventListener("resize", resizeCanvas);
            resizeCanvas();

            const signaturePad = new SignaturePad(canvas, {
                backgroundColor: 'rgb(255, 255, 255)'
            });

            document.getElementById('clearSignature').addEventListener('click', () => {
                signaturePad.clear();
            });

            document.getElementById('consentForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const errorMsg = document.getElementById('errorMsg');
                const successMsg = document.getElementById('successMsg');
                const submitBtn = document.getElementById('submitBtn');
                
                errorMsg.classList.add('hidden');
                
                if (signaturePad.isEmpty()) {
                    errorMsg.textContent = 'Please provide a signature.';
                    errorMsg.classList.remove('hidden');
                    return;
                }

                const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]')?.value;
                if (!turnstileResponse) {
                    errorMsg.textContent = 'Please complete the CAPTCHA.';
                    errorMsg.classList.remove('hidden');
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating PDF...';

                try {
                    // Bake input values into DOM so html2canvas captures them
                    const printArea = document.getElementById('document-to-print');
                    printArea.querySelectorAll('input, textarea').forEach(input => {
                        if (input.type === 'checkbox' || input.type === 'radio') {
                            if (input.checked) input.setAttribute('checked', 'checked');
                            else input.removeAttribute('checked');
                        } else {
                            input.setAttribute('value', input.value);
                        }
                    });

                    // Generate PDF locally
                    const opt = {
                        margin: 0.5,
                        filename: 'document.pdf',
                        image: { type: 'jpeg', quality: 0.98 },
                        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
                        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
                        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                    };
                    const pdfBase64 = await html2pdf().from(printArea).set(opt).outputPdf('datauristring');

                    submitBtn.innerHTML = '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Sending Securely...';

                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData.entries());
                    
                    data.signature_svg = signaturePad.toDataURL('image/svg+xml');
                    data.signature_png = signaturePad.toDataURL('image/png');
                    data.pdf_base64 = pdfBase64;
                    const response = await fetch('/api/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    const result = await response.json();

                    if (!response.ok) {
                        throw new Error(result.error || 'Submission failed');
                    }

                    // Success
                    e.target.classList.add('hidden');
                    document.querySelector('.no-print button[onclick="window.print()"]').parentElement.classList.add('hidden');
                    successMsg.classList.remove('hidden');
                } catch (err) {
                    errorMsg.textContent = err.message;
                    errorMsg.classList.remove('hidden');
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign & Submit Document';
                }
            });
        });
    </script>
</body>
</html>`;
}
