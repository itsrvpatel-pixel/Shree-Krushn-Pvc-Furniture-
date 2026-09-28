// Same-origin proxy for gallery photos, so the browser can read their
// pixels.
//
// WHY THIS EXISTS
// Firebase Storage download URLs serve an image happily to <img src>,
// which needs no permission, but the bucket sends no
// Access-Control-Allow-Origin header on the actual GET. Anything that
// wants the BYTES - fetch, XHR, a canvas that will be exported - is
// therefore blocked, and Safari reports it as the famously unhelpful
// "TypeError: Load failed".
//
// That is why the gallery looks fine while the thumbnail backfill failed
// on all 1506 photos: the grid only displays them, the backfill has to
// read them. New uploads were never affected, because their thumbnail is
// made from the data URI already in memory, before anything is fetched.
//
// The real fix is a CORS rule on the bucket, which needs gsutil and the
// project owner (see cors.json at the repo root). This endpoint means
// the backfill works today without it: the browser asks our own domain,
// which is same-origin, and we do the cross-origin fetch server-side
// where CORS does not apply.
//
// Only this project's own bucket is allowed through. An open proxy that
// fetched any URL a caller named would let anyone use this deployment to
// reach hosts it can see, which is a real hole rather than a theoretical
// one.

const ALLOWED_HOST = 'firebasestorage.googleapis.com';
const ALLOWED_PATH = '/v0/b/shree-krushn-pvc-furniture.firebasestorage.app/o/';
const MAX_BYTES = 25 * 1024 * 1024;

export default async function handler(req, res) {
  const raw = req.query && req.query.u;
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: 'u (the photo url) is required' });
    return;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    res.status(400).json({ error: 'u is not a url' });
    return;
  }
  // Host AND path prefix, not just the host: the hostname alone is shared
  // by every Firebase project in the world.
  if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST || !url.pathname.startsWith(ALLOWED_PATH)) {
    res.status(403).json({ error: 'only this project\'s storage bucket is proxied' });
    return;
  }

  try {
    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'storage returned ' + upstream.status });
      return;
    }
    const type = upstream.headers.get('content-type') || '';
    if (!type.startsWith('image/')) {
      res.status(415).json({ error: 'not an image (' + (type || 'no content-type') + ')' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.status(413).json({ error: 'image too large' });
      return;
    }
    // The file at a given key never changes - a caption edit or a move
    // between categories writes metadata elsewhere and leaves the file
    // alone - so this can be cached hard.
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: 'could not fetch the photo: ' + (e.message || 'unknown') });
  }
}
