import { decryptAESGCM } from '../../_shared/crypto.js';
import { layout } from '../templates/index.js';

export async function onRequestGet(context) {
  const query = `
    SELECT s.*, t.title as template_name 
    FROM submissions s 
    LEFT JOIN templates t ON s.template_id = t.id 
    ORDER BY s.created_at DESC
  `;
  const { results } = await context.env.DB.prepare(query).all();

  let listHtml = '';
  for (const sub of results) {
    let name = 'Unknown';
    try {
      if (sub.field_data_enc && sub.encryption_iv) {
        const dataStr = await decryptAESGCM(sub.field_data_enc, sub.encryption_iv, context.env.ENCRYPTION_KEY);
        const data = JSON.parse(dataStr);
        name = data.name || (data.firstName ? data.firstName + ' ' + data.lastName : null) || data.patient_full_name || data.patient_name || 'Unknown';
      }
    } catch (e) {
      name = 'Error decrypting';
    }

    listHtml += `
      <li class="px-4 py-4 sm:px-6 flex justify-between items-center submission-item" data-search="${name.toLowerCase()} ${(sub.template_name || '').toLowerCase()}">
        <div>
          <p class="text-sm font-medium text-indigo-600 truncate">${name} <span class="text-xs text-gray-400 font-normal ml-2">— ${sub.template_name || 'Unknown Template'}</span></p>
          <p class="text-sm text-gray-500">${new Date(sub.created_at).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: 'short' })}</p>
        </div>
        <div>
          <a href="/admin/submissions/${sub.id}" class="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">View</a>
        </div>
      </li>
    `;
  }

  return new Response(layout(`
    <div class="mb-6 sm:flex sm:justify-between sm:items-center">
      <h1 class="text-2xl font-semibold text-gray-900 mb-4 sm:mb-0">Submissions</h1>
      <div class="relative max-w-sm w-full">
        <input type="text" id="searchInput" placeholder="Search by name or template..." class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-4 py-2 border">
      </div>
    </div>
    
    <div class="bg-white shadow overflow-hidden sm:rounded-md">
      <ul id="submissionList" class="divide-y divide-gray-200">
        ${listHtml || '<li class="px-4 py-4 sm:px-6 text-gray-500">No submissions found.</li>'}
      </ul>
    </div>

    <script>
      document.getElementById('searchInput').addEventListener('input', function(e) {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.submission-item').forEach(item => {
          const text = item.getAttribute('data-search');
          item.style.display = text.includes(term) ? 'flex' : 'none';
        });
      });
    </script>
  `), { headers: { 'Content-Type': 'text/html' } });
}
