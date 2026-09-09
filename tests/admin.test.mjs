import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { GitStore, ApiError, encode, decode, safeURL, validatePage } from '../admin/api.mjs';
import { uploadCloud, CHUNK_SIZE, fileKind } from '../admin/media.mjs';
const { handler } = createRequire(import.meta.url)('../netlify/functions/media-sign.js');
const original = JSON.parse(await readFile(new URL('../data/accueil.json', import.meta.url)));
const changed = structuredClone(original); changed.hero.alt = 'Été — tournage à São João 🎬';
const json = value => new Response(JSON.stringify(value), { status: 200 });
function gateway({ conflict = false, race = false, lostReply = false, assets = false } = {}) {
  const calls = []; let head = 'old-head'; let sha = conflict ? 'other-page-sha' : 'original-sha'; let patches = 0;
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname.replace('/.netlify/git/github', '');
    const body = options.body && JSON.parse(options.body); calls.push({ path, body, options, url });
    if (options.method === 'GET') {
      assert.match(url, /_fresh=/); assert.equal(options.cache, 'no-store'); assert.equal(options.headers.Authorization, 'Bearer test-token');
      if (path === '/branches/main') return json({ commit: { sha: head } });
      if (path.startsWith('/contents/')) { assert.equal(new URL(url).searchParams.get('ref'), head); return json({ sha, content: encode(JSON.stringify(original)) }); }
      if (path.startsWith('/git/commits/')) return json({ tree: { sha: `tree-${head}` } });
    }
    if (path === '/git/blobs') return json({ sha: body.encoding === 'base64' ? 'photo-blob' : 'json-blob' });
    if (path === '/git/trees') { assert.equal(body.base_tree, `tree-${head}`); assert.equal(body.tree.length, assets ? 2 : 1); return json({ sha: 'new-tree' }); }
    if (path === '/git/commits') { assert.deepEqual(body.parents, [head]); return json({ sha: 'new-commit' }); }
    if (path === '/git/refs/heads/main') {
      assert.equal(body.force, false); patches++;
      if (race && patches === 1) { head = 'concurrent-head'; return new Response('{}', { status: 422 }); }
      head = 'new-commit'; sha = 'json-blob';
      if (lostReply && patches === 1) throw new TypeError('Connection lost after commit');
      return json({ object: { sha: head } });
    }
    throw new Error(`Unexpected request ${options.method} ${path}`);
  };
  return { calls, store: new GitStore(async () => 'test-token', fetcher, async () => {}) };
}
test('Unicode content survives base64 encoding', () => assert.equal(decode(encode(changed.hero.alt)), changed.hero.alt));
test('unsafe URLs and non-preview data URLs are rejected', () => {
  for (const url of ['javascript:alert(1)', '//evil.example/x', '/\\evil.example', 'http://example.com/a', 'https://user:secret@example.com/a', 'data:text/html,x', 'https://exa\nmple.com', '/\u0000x']) assert.equal(safeURL(url), '');
  assert.equal(safeURL('/img/photo.webp'), '/img/photo.webp'); assert.equal(safeURL('https://example.com/a.mp4'), 'https://example.com/a.mp4');
  assert.equal(safeURL('data:image/webp;base64,YQ=='), ''); assert.equal(safeURL('data:image/webp;base64,YQ==', { preview: true, image: true }), 'data:image/webp;base64,YQ==');
});
test('empty lists are valid; missing images and unsafe links are rejected', () => {
  assert.deepEqual(validatePage('accueil', { ...original, galerie: [], projets: [] }), []);
  const bad = structuredClone(original); bad.hero.image = ''; bad.projets[0].lien = 'javascript:alert(1)'; assert.equal(validatePage('accueil', bad).length, 2);
});
test('numbered categories are validated on service pages', () => {
  const page = { hero: { image: '/img/a.jpg', alt: '' }, periode: '2024', categories: [{ id: 'c-1', titre: 'Portraits' }, { id: 'c-2', titre: 'Automobile' }],
    medias: [{ titre: 'A', image: '/img/a.jpg', categorie: 'c-1' }, { titre: 'B', image: '/img/b.jpg', categorie: '' }, { titre: 'C', image: '/img/c.jpg' }] };
  assert.deepEqual(validatePage('shooting', page), []);
  // Pages published before categories existed carry neither the list nor the field.
  assert.deepEqual(validatePage('shooting', { ...page, categories: undefined, medias: page.medias.slice(1) }), []);
  const bad = structuredClone(page); bad.categories[1].titre = ' '; bad.categories.push({ id: 'c-1', titre: 'Doublon' }); bad.medias[0].categorie = 'c-supprimee';
  const errors = validatePage('shooting', bad);
  assert.equal(errors.length, 3); assert.match(errors[0], /Catégorie 2 : donne-lui un nom/); assert.match(errors[1], /Catégorie 3 : identifiant en double/); assert.match(errors[2], /Projet 1 : sa catégorie n’existe plus/);
  // A broken list also orphans every media that pointed into it.
  assert.deepEqual(validatePage('shooting', { ...page, categories: 'oops' }).map(e => e.split(' :')[0]), ['La liste des catégories est invalide.', 'Projet 1']);
});
test('JSON and referenced photos are committed atomically without forcing main', async () => {
  const data = structuredClone(changed); data.hero.image = '/img/uploads/photo-1.webp';
  const mock = gateway({ assets: true });
  const result = await mock.store.publish('accueil', data, 'original-sha', [{ path: '/img/uploads/photo-1.webp', base64: 'YQ==' }, { path: '/img/uploads/unused.webp', base64: 'Yg==' }]);
  assert.equal(result.sha, 'json-blob');
  const blobs = mock.calls.filter(call => call.path === '/git/blobs'); assert.equal(blobs.length, 2); assert.equal(JSON.parse(blobs[0].body.content).hero.alt, changed.hero.alt);
});
test('concurrent changes to the same page are never overwritten', async () => {
  const mock = gateway({ conflict: true }); await assert.rejects(() => mock.store.publish('accueil', changed, 'original-sha'), error => error.status === 409);
  assert.equal(mock.calls.filter(call => call.path === '/git/refs/heads/main').length, 0);
});
test('a concurrent unrelated commit is retained on retry', async () => {
  const mock = gateway({ race: true }); await mock.store.publish('accueil', changed, 'original-sha');
  assert.deepEqual(mock.calls.filter(call => call.path === '/git/commits').map(call => call.body.parents), [['old-head'], ['concurrent-head']]);
});
test('lost successful publish responses are reconciled without duplicate commits', async () => {
  const mock = gateway({ lostReply: true }); const result = await mock.store.publish('accueil', changed, 'original-sha');
  assert.equal(result.sha, 'json-blob'); assert.equal(mock.calls.filter(call => call.path === '/git/commits').length, 1);
});
test('expired sessions get actionable errors', async () => {
  const store = new GitStore(async () => 'expired', async () => new Response('{}', { status: 401 }));
  await assert.rejects(() => store.load('accueil'), error => error.status === 401 && /session/.test(error.message));
});
const auth = { cloudName: 'test-cloud', apiKey: 'test-key', signature: 'signed', kind: 'video', params: { timestamp: 123, public_id: 'portfolio-tom/video/abc', overwrite: false } };
const uploaded = { secure_url: 'https://res.cloudinary.com/test-cloud/video/upload/v1/portfolio-tom/video/abc.mov', public_id: 'portfolio-tom/video/abc', version: 1, resource_type: 'video', format: 'mov', done: true };
test('video chunks have exact boundaries and retry only the failed chunk', async () => {
  const file = new File([new Uint8Array(CHUNK_SIZE * 2 + 7)], 'film.mov', { type: 'video/quicktime' });
  const parts = []; let failed = false;
  const result = await uploadCloud(file, auth, { pause: async () => {}, transfer: async (url, form, headers) => {
    parts.push({ headers, size: form.get('file').size }); assert.equal(form.get('signature'), 'signed');
    if (headers['Content-Range'].startsWith(`bytes ${CHUNK_SIZE}-`) && !failed) { failed = true; throw new ApiError('Disconnected'); }
    return headers['Content-Range'].endsWith(`-${file.size - 1}/${file.size}`) ? uploaded : { done: false };
  } });
  assert.equal(parts.length, 4); assert.deepEqual(parts.map(p => p.size), [CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, 7]); assert.equal(new Set(parts.map(p => p.headers['X-Unique-Upload-Id'])).size, 1);
  assert.equal(parts[1].headers['Content-Range'], parts[2].headers['Content-Range']); assert.equal(parts[3].headers['Content-Range'], `bytes ${CHUNK_SIZE * 2}-${file.size - 1}/${file.size}`);
  assert.match(result.video, /f_mp4,vc_h264/); assert.match(result.video, /\.mp4$/); assert.match(result.image, /so_0,f_jpg/);
});
test('small uploads use no range headers, and incomplete results are not successful', async () => {
  await assert.rejects(() => uploadCloud(new File(['abc'], 'film.mp4'), auth, { transfer: async (_, __, headers) => { assert.deepEqual(headers, {}); return { done: false }; } }), /confirmé/);
});
test('unsupported formats, cancellation and permanent errors are handled', async () => {
  assert.throws(() => fileKind({ name: 'malware.svg' }), /Format/); assert.equal(fileKind({ name: 'IMG.HEIC' }), 'image'); assert.equal(fileKind({ name: 'clip.MOV' }), 'video');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => uploadCloud(new File(['a'], 'film.mp4'), auth, { signal: controller.signal }), { name: 'AbortError' });
  let calls = 0; await assert.rejects(() => uploadCloud(new File(['a'], 'film.mp4'), auth, { transfer: async () => { calls++; throw new ApiError('Quota', 400); } }), /Quota/); assert.equal(calls, 1);
});
test('signing requires authentication and an explicitly allowed account; secret stays server-side', async () => {
  const names = ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','ADMIN_EMAILS','MEDIA_MAX_VIDEO_MB']; const saved = Object.fromEntries(names.map(key => [key, process.env[key]]));
  try {
    names.forEach(key => delete process.env[key]); assert.equal((await handler({ httpMethod: 'POST' }, {})).statusCode, 401);
    const context = { clientContext: { user: { sub: 'tom', email: 'tom@example.test' } } };
    assert.equal(JSON.parse((await handler({ httpMethod: 'GET' }, context)).body).configured, false);
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret', ADMIN_EMAILS: 'tom@example.test' });
    assert.equal((await handler({ httpMethod: 'POST' }, { clientContext: { user: { sub: 'visitor', email: 'visitor@example.test' } } })).statusCode, 403);
    assert.equal((await handler({ httpMethod: 'POST', body: '{' }, context)).statusCode, 400);
    assert.equal((await handler({ httpMethod: 'POST', body: JSON.stringify({ kind: 'video', size: 101 * 1024 * 1024 }) }, context)).statusCode, 400);
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ kind: 'video', size: 100 }) }, context);
    assert.equal(response.statusCode, 200); assert.equal(response.headers['Cache-Control'], 'no-store');
    const payload = JSON.parse(response.body); assert.equal(payload.params.overwrite, false); assert.match(payload.params.public_id, /^portfolio-tom\/video\//); assert.ok(!response.body.includes('secret'));
    const string = Object.keys(payload.params).sort().map(key => `${key}=${payload.params[key]}`).join('&') + 'secret'; assert.equal(payload.signature, createHash('sha256').update(string).digest('hex'));
  } finally { names.forEach(key => saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key]); }
});
