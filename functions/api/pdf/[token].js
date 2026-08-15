import { createHMAC } from '../../_shared/crypto.js';

export async function onRequestGet(context) {
  const token = context.params.token;
  if (!token) return new Response('Missing token', { status: 400 });

  let payload;
  try {
    payload = JSON.parse(atob(token));
  } catch (e) {
    return new Response('Invalid token format', { status: 400 });
  }

  const { key, exp, sig } = payload;

  if (Math.floor(Date.now() / 1000) > exp) {
    return new Response('Token expired', { status: 403 });
  }

  const dataToVerify = `${key}:${exp}`;
  const isValid = (await createHMAC(dataToVerify, context.env.PDF_SIGNING_SECRET)) === sig;

  if (!isValid) {
    return new Response('Invalid signature', { status: 403 });
  }

  const object = await context.env.PDF_BUCKET.get(key);
  if (!object) {
    return new Response('PDF not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Content-Type', 'application/pdf');

  return new Response(object.body, { headers });
}
