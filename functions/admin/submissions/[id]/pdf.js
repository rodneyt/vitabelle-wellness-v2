export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  try {
    const sub = await env.DB.prepare('SELECT pdf_r2_key FROM submissions WHERE id = ?').bind(id).first();

    if (!sub || !sub.pdf_r2_key) {
      return new Response('PDF not found', { status: 404 });
    }

    if (!env.PDF_BUCKET) {
      return new Response('R2 Bucket not configured', { status: 500 });
    }

    const object = await env.PDF_BUCKET.get(sub.pdf_r2_key);

    if (object === null) {
      return new Response('PDF file not found in storage', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Use inline to allow printing directly from browser
    headers.set('Content-Disposition', `inline; filename="submission-${id}.pdf"`);
    headers.set('Content-Type', 'application/pdf');

    return new Response(object.body, { headers });
  } catch (err) {
    return new Response(`Error retrieving PDF: ${err.message}`, { status: 500 });
  }
}
