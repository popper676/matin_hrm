import { dbFetch } from './supabase.js';
import { criteriaSnapshot, openingIsOpen } from './jobOpenings.js';
import { draftOpeningCaption } from './recruitmentAi.js';
import {
  isZernioConfigured,
  uploadMedia,
  createPost,
  pollForFacebookUrl,
  facebookAccountId,
  getAccountHealth,
} from './zernioClient.js';


export async function getFacebookConnectionStatus() {
  if (!isZernioConfigured()) {
    const hasGraph = !!(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
    return {
      provider: hasGraph ? 'graph_api' : 'none',
      configured: hasGraph,
      zernioConfigured: false,
      message: hasGraph
        ? 'Using legacy Facebook Graph API (text-only). Set ZERNIO_API_KEY + ZERNIO_FACEBOOK_ACCOUNT_ID for image posts.'
        : 'Set ZERNIO_API_KEY and ZERNIO_FACEBOOK_ACCOUNT_ID (connect page in Zernio dashboard first).',
    };
  }

  try {
    const health = await getAccountHealth();
    return {
      provider: 'zernio',
      configured: true,
      zernioConfigured: true,
      accountId: facebookAccountId(),
      healthStatus: health?.status || health?.healthStatus || 'active',
      message: health?.name || health?.message || 'Facebook page connected via Zernio',
    };
  } catch (e) {
    return {
      provider: 'zernio',
      configured: true,
      zernioConfigured: true,
      accountId: facebookAccountId(),
      healthStatus: 'error',
      message: e.message,
    };
  }
}

export async function getPublishedPositionOpening(positionId) {
  const openings = await dbFetch('job_openings','*',{position_id:positionId,status:'published'},{order:'published_at'});
  const opening = openings.find(o => openingIsOpen(o));
  if (!opening) throw new Error('Create and publish a job opening with reviewed requirements in Recruitment first.');
  return opening;
}
export async function generatePositionCaption(pos, appUrl) {
  return draftOpeningCaption(criteriaSnapshot(await getPublishedPositionOpening(pos.id)), appUrl);
}

async function publishViaGraphApi(caption) {
  const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
  const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!PAGE_ID || !PAGE_TOKEN) {
    throw new Error('Facebook credentials not configured');
  }

  const fbResponse = await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: caption, access_token: PAGE_TOKEN }),
  });
  const fbData = await fbResponse.json();
  if (fbData.error) throw new Error(fbData.error.message || 'Failed to post to Facebook');
  return {
    provider: 'graph_api',
    postId: fbData.id,
    facebookUrl: `https://www.facebook.com/${fbData.id}`,
    zernioPostId: null,
  };
}

async function publishViaZernio(caption, imageBuffer, imageMeta) {
  let mediaItems = [];
  if (imageBuffer?.length) {
    const uploaded = await uploadMedia(
      imageBuffer,
      imageMeta?.filename || 'announcement.png',
      imageMeta?.mimetype || 'image/png'
    );
    mediaItems = [{
      type: 'image',
      url: uploaded.url,
      filename: uploaded.filename,
      mimeType: uploaded.contentType,
      size: uploaded.size,
    }];
  }

  const zernioPost = await createPost({
    content: caption,
    publishNow: true,
    mediaItems,
  });

  const zernioPostId = zernioPost?._id || zernioPost?.id;
  if (!zernioPostId) throw new Error('Zernio did not return a post id');

  let facebookUrl = null;
  const polled = await pollForFacebookUrl(zernioPostId);
  facebookUrl = polled.facebookUrl;

  return {
    provider: 'zernio',
    postId: zernioPostId,
    zernioPostId,
    facebookUrl,
    status: polled.post?.status || zernioPost?.status,
  };
}

export async function publishPositionToFacebook(caption, imageBuffer, imageMeta) {
  if (!caption?.trim()) throw new Error('Post caption is required');

  if (isZernioConfigured()) {
    return publishViaZernio(caption.trim(), imageBuffer, imageMeta);
  }

  if (imageBuffer?.length) {
    throw new Error('Image posts require Zernio. Configure ZERNIO_API_KEY and ZERNIO_FACEBOOK_ACCOUNT_ID.');
  }

  return publishViaGraphApi(caption.trim());
}
