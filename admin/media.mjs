import { ApiError, safeURL } from './api.mjs';
export const CHUNK_SIZE = 6 * 1024 * 1024;
export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.gif';
export const VIDEO_ACCEPT = '.mp4,.mov,.webm,.m4v';
export const fileKind = file => {
  if (/\.(jpe?g|png|webp|avif|heic|heif|gif)$/i.test(file.name)) return 'image';
  if (/\.(mp4|mov|webm|m4v)$/i.test(file.name)) return 'video';
  throw new Error('Format non pris en charge. Choisis une photo JPG, PNG, WebP, AVIF, HEIC ou GIF, ou une vidéo MP4, MOV ou WebM.');
};
export async function mediaRequest(token, body) {
  let response;
  try {
    response = await fetch('/.netlify/functions/media-sign', {
      method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error('Impossible de joindre le stockage des médias. Vérifie ta connexion.'); }
  const data = await response.json().catch(() => null);
  if (!data) throw new Error('La fonction de stockage n’est pas déployée. Les photos optimisées restent disponibles.');
  if (!response.ok) throw new ApiError(data.error || 'Stockage indisponible.', response.status);
  return data;
}
export function uploadPart(url, form, headers, signal, progress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = fn => value => { signal?.removeEventListener('abort', abort); fn(value); };
    const fail = done(reject); const success = done(resolve);
    xhr.open('POST', url); xhr.timeout = 180000;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(event.loaded / event.total); };
    xhr.onload = () => {
      let result;
      try { result = JSON.parse(xhr.responseText); } catch { return fail(new ApiError('Réponse du stockage illisible.', xhr.status)); }
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = result.error?.message || '';
        const friendly = /size|too large|maximum/i.test(message) ? 'Ce fichier dépasse la limite du compte Cloudinary. Réduis sa taille ou adapte la limite du compte.'
          : /format|unsupported|invalid video/i.test(message) ? 'Ce format ne peut pas être lu. Exporte la vidéo en MP4 (H.264) ou la photo en JPG.'
          : /quota|limit exceeded/i.test(message) ? 'Le quota Cloudinary est atteint. Vérifie le compte de stockage.'
          : `Le stockage a refusé le transfert (${xhr.status}). Vérifie la configuration ou réessaie.`;
        return fail(new ApiError(friendly, xhr.status));
      }
      success(result);
    };
    xhr.onerror = () => fail(new ApiError('Connexion interrompue pendant le transfert.'));
    xhr.ontimeout = () => fail(new ApiError('Le transfert a pris trop de temps.'));
    xhr.onabort = () => fail(new DOMException('Import annulé.', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return fail(new DOMException('Import annulé.', 'AbortError'));
    xhr.send(form);
  });
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Import annulé.', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function uploadCloud(file, auth, { signal, progress = () => {}, transfer = uploadPart, pause = delay } = {}) {
  const id = crypto.randomUUID();
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(auth.cloudName)}/${auth.kind}/upload`;
  const chunked = file.size > CHUNK_SIZE;
  let result;
  for (let start = 0; start < file.size; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, file.size);
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new DOMException('Import annulé.', 'AbortError');
      const form = new FormData();
      form.append('file', file.slice(start, end), file.name);
      for (const [key, value] of Object.entries(auth.params)) form.append(key, String(value));
      form.append('signature', auth.signature); form.append('api_key', auth.apiKey);
      try {
        result = await transfer(url, form, chunked ? { 'X-Unique-Upload-Id': id, 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` } : {}, signal,
          fraction => progress(Math.min(99, Math.round(100 * (start + (end - start) * fraction) / file.size)), attempt));
        break;
      } catch (error) {
        if (error.name === 'AbortError' || ![0, 408, 420, 429, 500, 502, 503, 504].includes(error.status) || attempt >= 3) throw error;
        progress(Math.round(100 * start / file.size), attempt + 1);
        await pause(1000 * 2 ** attempt, signal);
      }
    }
  }
  if (!result?.secure_url || !result.public_id || result.done === false || result.resource_type !== auth.kind) throw new Error('Le transfert n’a pas été confirmé. Réessaie cet import.');
  if (!safeURL(result.secure_url) || new URL(result.secure_url).hostname !== 'res.cloudinary.com') throw new Error('Adresse du média importé invalide.');
  progress(100, 0);
  const root = `https://res.cloudinary.com/${encodeURIComponent(auth.cloudName)}`;
  const asset = `v${Number(result.version)}/${result.public_id.split('/').map(encodeURIComponent).join('/')}`;
  return auth.kind === 'video'
    ? { video: `${root}/video/upload/f_mp4,vc_h264,q_auto/${asset}.mp4`, image: `${root}/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/${asset}.jpg` }
    : { image: `${root}/image/upload/f_auto,q_auto,w_2400,c_limit/${asset}.${result.format}` };
}
export async function optimizePhoto(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('Cette photo dépasse 30 Mo. Exporte une version plus légère.');
  if (/\.(heic|heif|gif)$/i.test(file.name)) throw new Error('Pour ce format, connecte Cloudinary ou exporte la photo en JPG.');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Cette photo ne peut pas être décodée. Exporte-la en JPG ou PNG.'); }
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Ce navigateur ne permet pas l’optimisation des images.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const quality of [0.86, 0.76, 0.64, 0.5]) {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob?.type === 'image/webp' && blob.size <= 850 * 1024) break;
    }
    if (!blob || blob.type !== 'image/webp' || blob.size > 850 * 1024) throw new Error('Cette photo reste trop volumineuse. Réduis sa résolution ou connecte Cloudinary.');
    const dataURL = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
    });
    return { path: `/img/uploads/${crypto.randomUUID()}.webp`, base64: dataURL.split(',')[1] };
  } finally { bitmap.close(); }
}
