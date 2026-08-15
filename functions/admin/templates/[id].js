import { layout } from './index.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = context.params.id;

  const template = await context.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(id).first();
  if (!template) return new Response('Not found', { status: 404 });

  const version = await context.env.DB.prepare('SELECT * FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1').bind(id).first();

  return new Response(layout(`
    <div class="mb-6 flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-gray-900">Edit Template: ${template.title} (v${version ? version.version_number : 0})</h1>
      <a href="/admin/templates" class="text-indigo-600 hover:text-indigo-900">&larr; Back</a>
    </div>

    <form method="POST" class="bg-white shadow-sm sm:rounded-lg p-6 space-y-6">
      <div>
        <label class="block text-sm font-medium text-gray-700">Fields Schema (JSON Array)</label>
        <textarea name="fields_schema" rows="5" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border font-mono text-sm">${version ? version.fields_schema : '[]'}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Legal Body (HTML Content)</label>
        <textarea name="legal_body" rows="15" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border font-mono text-sm">${version ? version.legal_body : ''}</textarea>
      </div>
      <div class="flex justify-end">
        <button type="submit" name="action" value="save" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Save New Version</button>
      </div>
    </form>

    <div class="mt-8 bg-white shadow-sm sm:rounded-lg p-6 space-y-6">
      <h2 class="text-lg leading-6 font-medium text-gray-900">Generate Secure Client Link</h2>
      <p class="text-sm text-gray-500">Create a unique, one-time use link that expires automatically.</p>
      <form method="POST" class="flex items-end space-x-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">Expires in (days)</label>
          <input type="number" name="expire_days" value="7" min="1" max="30" class="mt-1 block w-24 rounded-md border-gray-300 shadow-sm p-2 border sm:text-sm">
        </div>
        <button type="submit" name="action" value="generate_link" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700">Generate Link</button>
      </form>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  try {
    const id = context.params.id;
    const formData = await context.request.formData();
    const action = formData.get('action');

    if (action === 'generate_link') {
      const expireDays = parseInt(formData.get('expire_days'), 10) || 7;
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expireDays);
      
      await context.env.DB.prepare('INSERT INTO client_links (id, template_id, token, expires_at) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, token, expiresAt.toISOString())
        .run();
        
      return new Response(layout(`
        <div class="mb-6 flex justify-between items-center">
          <h1 class="text-2xl font-semibold text-gray-900">Secure Link Generated</h1>
          <a href="/admin/templates/${id}" class="text-indigo-600 hover:text-indigo-900">&larr; Back to Template</a>
        </div>
        <div class="bg-white shadow-sm sm:rounded-lg p-6 space-y-4">
          <p class="text-sm text-gray-500">Copy the following unique link and send it to your client. It will expire on ${expiresAt.toLocaleString()} and can only be used once.</p>
          <div class="flex items-center space-x-2">
            <input type="text" readonly value="https://vitabellemiami.com/secure/${token}" class="flex-1 rounded-md border-gray-300 bg-gray-50 shadow-sm p-3 font-mono text-sm border" id="secureLink">
            <button onclick="navigator.clipboard.writeText(document.getElementById('secureLink').value); alert('Copied!')" class="py-3 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Copy</button>
          </div>
        </div>
      `), { headers: { 'Content-Type': 'text/html' } });
    }

    const fieldsSchema = formData.get('fields_schema');
    const legalBody = formData.get('legal_body');

    const latestVersion = await context.env.DB.prepare('SELECT version_number FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1').bind(id).first();
    const nextVersion = (latestVersion ? latestVersion.version_number : 0) + 1;
    const now = new Date().toISOString();
    const versionId = crypto.randomUUID();

    await context.env.DB.prepare('INSERT INTO template_versions (id, template_id, version_number, legal_body, fields_schema, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(versionId, id, nextVersion, legalBody, fieldsSchema, now)
      .run();

    await context.env.DB.prepare('UPDATE templates SET current_version_id = ?, updated_at = ? WHERE id = ?')
      .bind(versionId, now, id)
      .run();

    return Response.redirect(new URL(`/admin/templates/${id}`, context.request.url), 302);
  } catch (err) {
    return new Response(`Error saving template version: ${err.message}`, { status: 500 });
  }
}
