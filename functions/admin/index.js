function layout(content) {
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
        <div class="flex">
          <div class="flex-shrink-0 flex items-center font-bold text-xl text-indigo-600">
            Vita Belle CRM
          </div>
          <div class="ml-6 flex space-x-8">
            <a href="/admin/" class="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Dashboard</a>
            <a href="/admin/templates" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Templates</a>
            <a href="/admin/submissions" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Submissions</a>
          </div>
        </div>
        <div class="flex items-center">
          <form method="POST" action="/admin/logout">
            <button type="submit" class="text-gray-500 hover:text-gray-700 text-sm font-medium">Logout</button>
          </form>
        </div>
      </div>
    </div>
  </nav>

  <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
    ${content}
  </main>
</body>
</html>`;
}

export async function onRequestGet(context) {
  return new Response(layout(`
    <div class="px-4 py-6 sm:px-0">
      <h1 class="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Manage Templates</dt>
            <dd class="mt-1 text-sm text-gray-900"><a href="/admin/templates" class="text-indigo-600 hover:text-indigo-900">View and edit document templates &rarr;</a></dd>
          </div>
        </div>
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">View Submissions</dt>
            <dd class="mt-1 text-sm text-gray-900"><a href="/admin/submissions" class="text-indigo-600 hover:text-indigo-900">Review submitted forms &rarr;</a></dd>
          </div>
        </div>
      </div>
    </div>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export { layout }; // exported for reuse if needed
