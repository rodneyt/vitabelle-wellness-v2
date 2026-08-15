import { decryptAESGCM } from '../../src/crypto.js';
import { layout } from '../templates/index.js';

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare('SELECT * FROM submissions ORDER BY created_at DESC').all();

  let listHtml = '';
  for (const sub of results) {
    let name = 'Unknown';
    try {
      if (sub.encrypted_data) {
        const dataStr = await decryptAESGCM(sub.encrypted_data, context.env.ENCRYPTION_KEY);
        const data = JSON.parse(dataStr);
        name = data.name || data.firstName + ' ' + data.lastName || 'Unknown';
      }
    } catch (e) {
      name = 'Error decrypting';
    }

    listHtml += `
      <li class="px-4 py-4 sm:px-6 flex justify-between items-center">
        <div>
          <p class="text-sm font-medium text-indigo-600 truncate">${name}</p>
          <p class="text-sm text-gray-500">${new Date(sub.created_at).toLocaleString()}</p>
        </div>
        <div>
          <a href="/admin/submissions/${sub.id}" class="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">View</a>
        </div>
      </li>
    `;
  }

  return new Response(layout(`
    <div class="mb-6 flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-gray-900">Submissions</h1>
    </div>
    
    <div class="bg-white shadow overflow-hidden sm:rounded-md">
      <ul class="divide-y divide-gray-200">
        ${listHtml || '<li class="px-4 py-4 sm:px-6 text-gray-500">No submissions found.</li>'}
      </ul>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}
