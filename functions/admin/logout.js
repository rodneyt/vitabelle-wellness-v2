export async function onRequestPost(context) {
  const cookie = context.request.headers.get('cookie') || '';
  const sessionMatch = cookie.match(/session_id=([^;]+)/);
  const sessionId = sessionMatch ? sessionMatch[1] : null;

  if (sessionId) {
    await context.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }

  return new Response('', {
    status: 302,
    headers: {
      'Location': '/admin/login',
      'Set-Cookie': 'session_id=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
    }
  });
}
