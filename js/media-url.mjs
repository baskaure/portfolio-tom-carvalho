export function safeURL(value, { image = false, preview = false } = {}) {
  const v = String(value || '').trim();
  if (!v || /[\u0000-\u0020\u007f\\]/.test(v)) return '';
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  if (preview && image && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  try { const url = new URL(v); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}

