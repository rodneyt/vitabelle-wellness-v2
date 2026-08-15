import { layout } from './index.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = context.params.id;

  const template = await context.env.DB.prepare('SELECT * FROM templates WHERE id = ?').bind(id).first();
  if (!template) return new Response('Not found', { status: 404 });

  const version = await context.env.DB.prepare('SELECT * FROM template_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1').bind(id).first();

  return new Response(layout(`
    <div class="mb-6 flex justify-between items-center">
      <h1 class="text-2xl font-semibold text-gray-900">Edit Template: ${template.name} (v${version ? version.version : 0})</h1>
      <a href="/admin/templates" class="text-indigo-600 hover:text-indigo-900">&larr; Back</a>
    </div>

    <form method="POST" class="bg-white shadow-sm sm:rounded-lg p-6 space-y-6">
      <div>
        <label class="block text-sm font-medium text-gray-700">Content Schema (JSON)</label>
        <textarea name="content_schema" rows="5" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border font-mono text-sm">${version ? version.content_schema : '{}'}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">HTML Content</label>
        <textarea name="html_content" rows="15" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border font-mono text-sm">${version ? version.html_content : ''}</textarea>
      </div>
      <div class="flex justify-end">
        <button type="submit" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Save New Version</button>
      </div>
    </form>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  const id = context.params.id;
  const formData = await context.request.formData();
  const contentSchema = formData.get('content_schema');
  const htmlContent = formData.get('html_content');

  const latestVersion = await context.env.DB.prepare('SELECT version FROM template_versions WHERE template_id = ? ORDER BY version DESC LIMIT 1').bind(id).first();
  const nextVersion = (latestVersion ? latestVersion.version : 0) + 1;
  const now = new Date().toISOString();

  await context.env.DB.prepare('INSERT INTO template_versions (id, template_id, version, content_schema, html_content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, nextVersion, contentSchema, htmlContent, now)
    .run();

  await context.env.DB.prepare('UPDATE templates SET updated_at = ? WHERE id = ?').bind(now, id).run();

  return Response.redirect(new URL(`/admin/templates/${id}`, context.request.url), 302);
}
