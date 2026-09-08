const { createHash, randomUUID } = require('node:crypto');

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

exports.handler = async (event, context) => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return reply(405, { error: 'Méthode non autorisée.' });
  // Populated by Netlify after verification of the site's Identity bearer token.
  const user = context.clientContext?.user;
  if (!user?.sub && !user?.id) return reply(401, { error: 'Connecte-toi pour importer des médias.' });
  const env = process.env;
  const configured = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET && env.ADMIN_EMAILS);
  if (!configured) return reply(event.httpMethod === 'GET' ? 200 : 503, {
    configured: false,
    error: 'Le stockage vidéo reste à connecter. Renseigner Cloudinary et les adresses autorisées dans Netlify ; les photos optimisées restent disponibles.',
  });
  const allowed = env.ADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(user.email || '').toLowerCase())) return reply(403, { error: 'Ce compte n’est pas autorisé à importer sur Cloudinary.' });
  const videoLimitMB = Math.min(2000, Math.max(1, Number(env.MEDIA_MAX_VIDEO_MB) || 100));
  const limits = { image: 30 * 1024 * 1024, video: videoLimitMB * 1024 * 1024 };
  if (event.httpMethod === 'GET') return reply(200, { configured: true, limits });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Demande invalide.' }); }
  if (!['image', 'video'].includes(body.kind) || !Number.isFinite(body.size) || body.size <= 0 || body.size > limits[body.kind]) {
    return reply(400, { error: 'Type ou taille de fichier non autorisé.' });
  }
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: `portfolio-tom/${body.kind}/${randomUUID()}`,
    overwrite: false,
    allowed_formats: body.kind === 'image' ? 'jpg,jpeg,png,webp,avif,heic,heif,gif' : 'mp4,mov,webm,m4v',
  };
  const canonical = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  const signature = createHash('sha256').update(canonical + env.CLOUDINARY_API_SECRET).digest('hex');
  return reply(200, { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, params, signature, kind: body.kind });
};
