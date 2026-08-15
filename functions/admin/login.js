import { verifyPassword, decryptAESGCM } from '../_shared/crypto.js';
import { verifyTOTP } from '../_shared/totp.js';

function html(body, error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-white rounded-lg shadow-md p-8">
    <h1 class="text-2xl font-bold mb-6 text-center">Admin Login</h1>
    ${error ? `<div class="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">${error}</div>` : ''}
    <form method="POST" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700">Username</label>
        <input type="text" name="username" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">Password</label>
        <input type="password" name="password" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700">TOTP Code</label>
        <input type="text" name="totp" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
      </div>
      <button type="submit" class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">Login</button>
    </form>
  </div>
</body>
</html>`;
}

export async function onRequestGet(context) {
  return new Response(html(''), { headers: { 'Content-Type': 'text/html' } });
}

export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const username = formData.get('username');
    const password = formData.get('password');
    const totp = formData.get('totp');

    if (!username || !password || !totp) {
      return new Response(html('', 'Missing fields'), { headers: { 'Content-Type': 'text/html' } });
    }

    const admin = await context.env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(username).first();
    if (!admin) {
      return new Response(html('', 'Invalid credentials'), { headers: { 'Content-Type': 'text/html' } });
    }

    const isValidPassword = await verifyPassword(password, admin.password_hash);
    if (!isValidPassword) {
      return new Response(html('', 'Invalid credentials'), { headers: { 'Content-Type': 'text/html' } });
    }

    const encObj = JSON.parse(admin.totp_secret_enc);
    const totpSecret = await decryptAESGCM(encObj.ciphertext, encObj.iv, context.env.ENCRYPTION_KEY);
    const isValidTOTP = await verifyTOTP(totp, totpSecret);
    if (!isValidTOTP) {
      return new Response(html('', 'Invalid TOTP code'), { headers: { 'Content-Type': 'text/html' } });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * 24); // 24 hours

    await context.env.DB.prepare('INSERT INTO sessions (session_id, admin_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, admin.id, expiresAt)
      .run();

    return new Response('', {
      status: 302,
      headers: {
        'Location': '/admin/',
        'Set-Cookie': `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
      }
    });
  } catch (err) {
    return new Response(html('', `Server Error: ${err.message}\n${err.stack}`), { headers: { 'Content-Type': 'text/html' }, status: 500 });
  }
}
