export function safeURL(value, { image = false, preview = false } = {}) {
  const v = String(value || '').trim();
  if (!v || /[\u0000-\u0020\u007f\\]/.test(v)) return '';
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (preview && image && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  try { const url = new URL(v); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}


// Lien YouTube (youtu.be, watch, shorts, embed, live) → identifiant à 11 caractères, sinon ''
export function youtubeId(value) {
  return (String(value || '').match(/^https:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})(?![\w-])/) || [])[1] || '';
}
export const youtubeThumb = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
