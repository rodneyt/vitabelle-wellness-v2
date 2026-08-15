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
        <p class="text-sm font-medium text-indigo-600 truncate">${t.name}</p>
      </div>
      <div>
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
        <h3 class="text-lg leading-6 font-medium text-gray-900">Create New Template</h3>
        <form method="POST" class="mt-5 sm:flex sm:items-center">
          <div class="w-full sm:max-w-xs">
            <label for="name" class="sr-only">Name</label>
            <input type="text" name="name" id="name" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border" placeholder="Template Name" required>
          </div>
          <button type="submit" class="mt-3 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Create</button>
        </form>
      </div>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  const formData = await context.request.formData();
  const name = formData.get('name');

  if (!name) return new Response('Name required', { status: 400 });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await context.env.DB.prepare('INSERT INTO templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .bind(id, name, now, now)
    .run();

  await context.env.DB.prepare('INSERT INTO template_versions (id, template_id, version, content_schema, html_content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, 1, '{}', '<h1>New Template</h1>', now)
    .run();

  return Response.redirect(new URL(`/admin/templates/${id}`, context.request.url), 302);
}
