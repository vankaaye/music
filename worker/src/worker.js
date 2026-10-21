/* Music admin Worker.
 *
 * Fronts the R2 bucket so the library can be managed from inside the app:
 * upload, delete and list songs, each guarded by an admin passcode held in the
 * ADMIN_PASSCODE secret. After any change it rebuilds library.json in the
 * bucket, which is what every reader (phone, desktop, anyone else) loads from
 * the public r2.dev URL. Readers never touch this Worker.
 */

const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma)$/i;
const MANIFEST = 'library.json';

/* ---------- CORS ---------- */

function allowedOrigins(env) {
  // Comma-separated in ALLOWED_ORIGINS, else the app's own origin.
  const raw = (env.ALLOWED_ORIGINS || 'https://vankaaye.github.io').trim();
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  const ok = list.includes('*') ? '*' : (list.includes(origin) ? origin : '');
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Passcode',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (ok) h['Access-Control-Allow-Origin'] = ok;
  return h;
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  });
}

/* ---------- auth ---------- */

// Constant-time compare so a wrong passcode leaks nothing through timing.
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function authorized(request, env) {
  const given = request.headers.get('X-Admin-Passcode') || '';
  const want = env.ADMIN_PASSCODE || '';
  if (!want) return false;          // secret not set: refuse everything
  return sameSecret(given, want);
}

/* ---------- helpers ---------- */

// Encode each path segment so spaces and unicode survive as a URL.
function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

// Keep uploads to a safe, predictable key.
function safeKey(name) {
  const base = String(name || '')
    .replace(/\\/g, '/')
    .split('/').pop()                 // no directory traversal
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return base.slice(0, 180);
}

function titleFromName(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const m = /^\s*\d{1,3}\s*[-–—._)\]]\s*(.+)$/.exec(base);
  return (m ? m[1] : base).trim() || base;
}

/* ---------- library.json ---------- */

async function listAudio(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.MUSIC.list({
      cursor,
      limit: 1000,
      include: ['customMetadata'],
    });
    for (const o of page.objects) {
      if (o.key === MANIFEST) continue;
      if (!AUDIO_RE.test(o.key)) continue;
      out.push(o);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function rebuildManifest(env) {
  const objects = await listAudio(env);
  const tracks = objects.map(o => {
    const m = o.customMetadata || {};
    const t = { url: encodeKey(o.key) };
    const title = (m.title || '').trim() || titleFromName(o.key);
    if (title) t.title = title;
    if ((m.artist || '').trim()) t.artist = m.artist.trim();
    if ((m.album || '').trim()) t.album = m.album.trim();
    const dur = parseFloat(m.duration);
    if (dur > 0) t.duration = Math.round(dur * 10) / 10;
    if (o.size) t.size = o.size;
    return t;
  });

  tracks.sort((a, b) => {
    const A = (a.album || '') + '\u0000' + (a.title || '');
    const B = (b.album || '') + '\u0000' + (b.title || '');
    return A.localeCompare(B, undefined, { sensitivity: 'base' });
  });

  await env.MUSIC.put(MANIFEST, JSON.stringify({ tracks }, null, 1), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      // r2.dev caches aggressively; the manifest must not go stale after a change.
      cacheControl: 'no-cache, max-age=0',
    },
  });
  return tracks.length;
}

/* ---------- routes ---------- */

async function handleUpload(request, env) {
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'No file in the request.' }, 400, request, env);
  }
  const key = safeKey(form.get('name') || file.name);
  if (!key) return json({ error: 'Could not work out a filename.' }, 400, request, env);
  if (!AUDIO_RE.test(key)) {
    return json({ error: 'Not an audio file: ' + key }, 415, request, env);
  }

  let meta = {};
  const rawMeta = form.get('meta');
  if (typeof rawMeta === 'string' && rawMeta) {
    try { meta = JSON.parse(rawMeta) || {}; } catch (e) { meta = {}; }
  }

  const custom = {};
  for (const k of ['title', 'artist', 'album']) {
    if (meta[k]) custom[k] = String(meta[k]).slice(0, 300);
  }
  if (meta.duration) custom.duration = String(meta.duration);

  await env.MUSIC.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'audio/mpeg' },
    customMetadata: custom,
  });

  const count = await rebuildManifest(env);
  return json({ ok: true, key, tracks: count }, 200, request, env);
}

async function handleDelete(request, env) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const keys = Array.isArray(body.keys) ? body.keys
             : (body.key ? [body.key] : []);
  if (!keys.length) return json({ error: 'No key given.' }, 400, request, env);

  const cleaned = keys.map(k => safeKey(k)).filter(k => k && k !== MANIFEST);
  for (const k of cleaned) await env.MUSIC.delete(k);

  const count = await rebuildManifest(env);
  return json({ ok: true, deleted: cleaned, tracks: count }, 200, request, env);
}

async function handleList(request, env) {
  const objects = await listAudio(env);
  const songs = objects.map(o => {
    const m = o.customMetadata || {};
    return {
      key: o.key,
      url: encodeKey(o.key),
      size: o.size || 0,
      title: (m.title || '').trim() || titleFromName(o.key),
      artist: (m.artist || '').trim() || '',
      album: (m.album || '').trim() || '',
      uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null,
    };
  }).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return json({ ok: true, songs, count: songs.length }, 200, request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === '/' || path === '/api') {
      return json({ ok: true, service: 'music-admin' }, 200, request, env);
    }

    if (!path.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404, request, env);
    }

    if (!env.ADMIN_PASSCODE) {
      return json({ error: 'ADMIN_PASSCODE secret is not set on the Worker.' }, 503, request, env);
    }
    if (!authorized(request, env)) {
      return json({ error: 'Wrong passcode.' }, 401, request, env);
    }

    try {
      if (path === '/api/ping'    && request.method === 'GET')  return json({ ok: true }, 200, request, env);
      if (path === '/api/list'    && request.method === 'GET')  return handleList(request, env);
      if (path === '/api/upload'  && request.method === 'POST') return handleUpload(request, env);
      if (path === '/api/delete'  && request.method === 'POST') return handleDelete(request, env);
      if (path === '/api/rebuild' && request.method === 'POST') {
        const n = await rebuildManifest(env);
        return json({ ok: true, tracks: n }, 200, request, env);
      }
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500, request, env);
    }

    return json({ error: 'Not found' }, 404, request, env);
  },
};
