/**
 * Zernio REST client (Wise Invest pattern) — Facebook page posts via Zernio, not direct Graph API.
 */

const DIRECT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

function baseUrl() {
  return (process.env.ZERNIO_BASE_URL || 'https://zernio.com/api').replace(/\/$/, '');
}

function apiKey() {
  return process.env.ZERNIO_API_KEY || '';
}

export function facebookAccountId() {
  return process.env.ZERNIO_FACEBOOK_ACCOUNT_ID || '';
}

export function isZernioConfigured() {
  return !!apiKey() && !!facebookAccountId();
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${apiKey()}`, ...extra };
}

async function parseJson(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.detail || text || res.statusText;
    const err = new Error(`Zernio ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function getAccountHealth(accountId = facebookAccountId()) {
  if (!apiKey()) throw new Error('ZERNIO_API_KEY is not configured');
  const res = await fetch(`${baseUrl()}/v1/accounts/${accountId}/health`, {
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function uploadMediaDirect(buffer, filename, contentType) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);
  form.append('contentType', contentType);

  const res = await fetch(`${baseUrl()}/v1/media/upload-direct`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const data = await parseJson(res);
  return {
    url: data.url || data.publicUrl,
    filename: data.filename || filename,
    contentType: data.contentType || contentType,
    size: data.size || buffer.length,
  };
}

export async function presignMedia(filename, contentType, sizeBytes) {
  const res = await fetch(`${baseUrl()}/v1/media/presign`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ filename, contentType, size: sizeBytes }),
  });
  return parseJson(res);
}

export async function uploadToPresignedUrl(uploadUrl, buffer, contentType) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Presigned upload failed: ${res.status}`);
  }
}

export async function uploadMedia(buffer, filename, contentType) {
  if (buffer.length <= DIRECT_UPLOAD_MAX_BYTES) {
    return uploadMediaDirect(buffer, filename, contentType);
  }
  const presign = await presignMedia(filename, contentType, buffer.length);
  if (!presign.uploadUrl || !presign.publicUrl) {
    throw new Error('Zernio presign did not return upload URLs');
  }
  await uploadToPresignedUrl(presign.uploadUrl, buffer, contentType);
  return {
    url: presign.publicUrl,
    filename,
    contentType,
    size: buffer.length,
  };
}

export async function createPost({ content, publishNow = true, mediaItems = [] }) {
  const body = {
    content,
    publishNow,
    timezone: 'UTC',
    platforms: [{ platform: 'facebook', accountId: facebookAccountId() }],
  };
  if (mediaItems.length) body.mediaItems = mediaItems;

  const res = await fetch(`${baseUrl()}/v1/posts`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  return data?.post || data;
}

export async function getPost(zernioPostId) {
  const res = await fetch(`${baseUrl()}/v1/posts/${zernioPostId}`, {
    headers: authHeaders(),
  });
  const data = await parseJson(res);
  return data?.post || data;
}

export function extractFacebookUrl(zernioPost) {
  const platforms = zernioPost?.platforms || [];
  for (const p of platforms) {
    const url = p.platformPostUrl || p.platform_post_url;
    if (url) return url;
  }
  return null;
}

export async function pollForFacebookUrl(zernioPostId, attempts = 3, delayMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs));
    const post = await getPost(zernioPostId);
    const url = extractFacebookUrl(post);
    if (url) return { post, facebookUrl: url };
  }
  const post = await getPost(zernioPostId);
  return { post, facebookUrl: extractFacebookUrl(post) };
}
