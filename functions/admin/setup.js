import { hashPassword, encryptAESGCM } from '../_shared/crypto.js';
import { generateTOTPSecret, generateTOTPUri } from '../_shared/totp.js';

function html(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Setup</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8">
    ${body}
  </div>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const existing = await context.env.DB.prepare('SELECT id FROM admins LIMIT 1').first();
  if (existing) {
    return Response.redirect(new URL('/admin/login', context.request.url), 302);
  }

  return new Response(html(`
    <h1 class="text-2xl font-bold mb-6 text-center">Initial Setup</h1>
    <form method="POST" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700">Username</label>
        <input type="text" name="username" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Password</label>
        <input type="password" name="password" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
      </div>
      <button type="submit" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">Create Admin</button>
    </form>
  `), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  try {
    const existing = await context.env.DB.prepare('SELECT id FROM admins LIMIT 1').first();
    if (existing) {
      return new Response('Already setup', { status: 403 });
    }

    if (!context.env.ENCRYPTION_KEY) {
      return new Response(html('<h2>Configuration Error</h2><p class="text-red-600">The <b>ENCRYPTION_KEY</b> is missing in Cloudflare Secrets.</p>'), { headers: { 'Content-Type': 'text/html' }, status: 500 });
    }

    const formData = await context.request.formData();
    const username = formData.get('username');
    const password = formData.get('password');

    if (!username || !password) return new Response('Missing fields', { status: 400 });

    const hashHex = await hashPassword(password);

    const totpSecret = await generateTOTPSecret();
    const totpUri = generateTOTPUri(totpSecret, username, 'VitaBelle');

    const encSecret = await encryptAESGCM(totpSecret, context.env.ENCRYPTION_KEY);
    await context.env.DB.prepare('INSERT INTO admins (id, username, password_hash, totp_secret_enc) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), username, hashHex, JSON.stringify(encSecret))
      .run();

    return new Response(html(`
      <h1 class="text-2xl font-bold mb-6 text-center">Setup Complete</h1>
      <p class="mb-4 text-center text-sm text-gray-600">Please add this TOTP secret to your authenticator app.</p>
      <div class="bg-gray-100 p-4 rounded text-center break-all font-mono text-sm mb-4">
        ${totpSecret}
      </div>
      <div class="text-center mb-6">
        <p class="text-xs text-gray-500 break-all">URI: ${totpUri}</p>
      </div>
      <a href="/admin/login" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">Go to Login</a>
    `), { headers: { 'Content-Type': 'text/html' } });
  } catch (err) {
    return new Response(html(`<h2>Server Error</h2><pre class="text-red-600 text-xs text-left overflow-auto whitespace-pre-wrap">${err.message}\n${err.stack}</pre>`), { headers: { 'Content-Type': 'text/html' }, status: 500 });
  }
}
