import { decryptAESGCM, signHMAC } from '../../src/crypto.js';
import { layout } from '../templates/index.js';

export async function onRequestGet(context) {
  const id = context.params.id;
  const sub = await context.env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  
  if (!sub) return new Response('Not found', { status: 404 });

  let data = {};
  let errorMsg = '';
  try {
    if (sub.encrypted_data) {
      const dataStr = await decryptAESGCM(sub.encrypted_data, context.env.ENCRYPTION_KEY);
      data = JSON.parse(dataStr);
    }
  } catch (e) {
    errorMsg = 'Failed to decrypt submission data.';
  }

  const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const payload = `${sub.pdf_object_key}:${expiration}`;
  const signature = await signHMAC(payload, context.env.URL_SIGN_KEY);
  const downloadToken = btoa(JSON.stringify({ key: sub.pdf_object_key, exp: expiration, sig: signature }));

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

    <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-6">
      <div class="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 class="text-lg leading-6 font-medium text-gray-900">Submitted Data</h3>
          <p class="mt-1 max-w-2xl text-sm text-gray-500">Date: ${new Date(sub.created_at).toLocaleString()}</p>
        </div>
        ${sub.pdf_object_key ? `
          <a href="/api/pdf/${downloadToken}" target="_blank" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">Download PDF</a>
        ` : ''}
      </div>
      <div class="border-t border-gray-200 px-4 py-5 sm:p-0">
        <dl class="sm:divide-y sm:divide-gray-200">
          ${dataHtml}
        </dl>
      </div>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}
