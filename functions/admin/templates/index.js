export function layout(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CRM Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <nav class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center space-x-8">
          <a href="/admin/" class="font-bold text-xl text-indigo-600">Vita Belle CRM</a>
          <a href="/admin/templates" class="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">Templates</a>
          <a href="/admin/submissions" class="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">Submissions</a>
        </div>
        <div class="flex items-center">
          <form method="POST" action="/admin/logout">
            <button type="submit" class="text-gray-500 hover:text-gray-700 text-sm font-medium">Logout</button>
          </form>
        </div>
      </div>
    </div>
  </nav>
  <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">${content}</main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare('SELECT * FROM templates ORDER BY created_at DESC').all();

  const listHtml = results.map(t => `
    <li class="px-4 py-4 sm:px-6 flex justify-between items-center">
      <div>
        <p class="text-sm font-medium text-indigo-600 truncate">${t.title} <span class="text-xs text-gray-400">(${t.slug})</span></p>
      </div>
      <div class="flex items-center space-x-4">
        <button onclick="navigator.clipboard.writeText(window.location.origin + '/f/${t.slug}'); alert('Link copied: ' + window.location.origin + '/f/${t.slug}')" class="text-sm text-gray-500 hover:text-indigo-600">Copy Link</button>
        <a href="/admin/templates/${t.id}" class="inline-flex items-center px-3 py-1 border border-transparent text-sm leading-5 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">Edit</a>
      </div>
    </li>
  `).join('');

  return new Response(layout(`
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-semibold text-gray-900">Templates</h1>
    </div>
    
    <div class="bg-white shadow overflow-hidden sm:rounded-md mb-8">
      <ul class="divide-y divide-gray-200">
        ${listHtml || '<li class="px-4 py-4 sm:px-6 text-gray-500">No templates found.</li>'}
      </ul>
    </div>

    <div class="bg-white shadow sm:rounded-lg">
      <div class="px-4 py-5 sm:p-6">
        <h3 class="text-lg leading-6 font-medium text-gray-900 mb-2">Import JSON Templates</h3>
        <p class="text-sm text-gray-500 mb-4">Paste your JSON array of templates here. It must contain slug, title, legal_body, and fields_schema.</p>
        <form method="POST" class="mt-2">
          <textarea name="json_payload" rows="10" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border font-mono" placeholder='[{"slug": "iv-consent", "title": "IV Consent", "legal_body": "<p>...</p>", "fields_schema": [...]}]' required></textarea>
          <div class="mt-3">
            <button type="submit" class="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none sm:text-sm">Import Templates</button>
          </div>
        </form>
      </div>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const jsonStr = formData.get('json_payload');

    if (!jsonStr) return new Response('Payload required', { status: 400 });

    const templates = JSON.parse(jsonStr);
    if (!Array.isArray(templates)) {
      return new Response('JSON must be an array of templates', { status: 400 });
    }

    const now = new Date().toISOString();

    for (const t of templates) {
      if (!t.slug || !t.title) continue;

      const id = crypto.randomUUID();
      const versionId = crypto.randomUUID();

      // Check if template with slug exists
      const existing = await context.env.DB.prepare('SELECT id FROM templates WHERE slug = ?').bind(t.slug).first();
      
      let targetTemplateId = id;
      let nextVersion = 1;

      if (existing) {
        targetTemplateId = existing.id;
        const lastVer = await context.env.DB.prepare('SELECT version_number FROM template_versions WHERE template_id = ? ORDER BY version_number DESC LIMIT 1').bind(targetTemplateId).first();
        nextVersion = lastVer ? lastVer.version_number + 1 : 1;
      } else {
        await context.env.DB.prepare('INSERT INTO templates (id, slug, title, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
          .bind(targetTemplateId, t.slug, t.title, now, now)
          .run();
      }

      await context.env.DB.prepare('INSERT INTO template_versions (id, template_id, version_number, legal_body, fields_schema, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(versionId, targetTemplateId, nextVersion, t.legal_body || '', typeof t.fields_schema === 'string' ? t.fields_schema : JSON.stringify(t.fields_schema || []), now)
        .run();

      await context.env.DB.prepare('UPDATE templates SET current_version_id = ?, updated_at = ? WHERE id = ?')
        .bind(versionId, now, targetTemplateId)
        .run();
    }

    return Response.redirect(new URL('/admin/templates', context.request.url), 302);
  } catch (err) {
    return new Response(`Error importing JSON: ${err.message}`, { status: 500 });
  }
}
