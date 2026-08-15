export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (path === '/admin/login' || path === '/admin/setup') {
    return context.next();
  }

  const cookie = context.request.headers.get('cookie') || '';
  const sessionMatch = cookie.match(/session_id=([^;]+)/);
  const sessionId = sessionMatch ? sessionMatch[1] : null;

  if (!sessionId) {
    return Response.redirect(new URL('/admin/login', context.request.url), 302);
  }

  try {
    const session = await context.env.DB.prepare('SELECT admin_id FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(sessionId, Math.floor(Date.now() / 1000))
      .first();

    if (!session) {
      return Response.redirect(new URL('/admin/login', context.request.url), 302);
    }

    context.data = { admin_id: session.admin_id };
    return context.next();
  } catch (err) {
    return new Response(`Middleware Error: ${err.message}\n${err.stack}`, { status: 500 });
  }
}
