import geoip from 'geoip-lite';

export function resolveIp(ip) {
  if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
    return { country: 'Unknown', region: 'Unknown', city: 'Unknown' };
  }

  try {
    const geo = geoip.lookup(ip);
    if (!geo) {
      return { country: 'Unknown', region: 'Unknown', city: 'Unknown' };
    }
    
    return {
      country: geo.country || 'Unknown',
      region: geo.region || 'Unknown',
      city: geo.city || 'Unknown'
    };
  } catch (err) {
    return { country: 'Unknown', region: 'Unknown', city: 'Unknown' };
  }
}
