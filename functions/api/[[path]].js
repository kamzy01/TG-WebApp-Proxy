/**
 * Cloudflare Pages Function — Telegram API Proxy
 * 
 * Routes:  /api/<telegram-dc-host>/<path>
 * Example: /api/venus-1.telegram.org/apiw1
 * 
 * This allows the browser client to connect to Telegram servers
 * through Cloudflare's network when direct connections are blocked.
 * WebSocket upgrade is supported for MTProto over WS.
 */

export async function onRequest(context) {
  const { request, params } = context;
  
  // params.path is an array of path segments after /api/
  const pathSegments = params.path;
  if (!pathSegments || pathSegments.length < 1) {
    return new Response('Missing target host', { status: 400 });
  }

  // First segment is the target Telegram host
  const targetHost = pathSegments[0];
  
  // Validate it's a Telegram domain
  const allowedDomains = [
    /^venus(-\d+)?\.telegram\.org$/,
    /^flora(-\d+)?\.telegram\.org$/,
    /^vesta(-\d+)?\.telegram\.org$/,
    /^pluto(-\d+)?\.telegram\.org$/,
    /^aurora(-\d+)?\.telegram\.org$/,
    /^(\d+\.)?web\.telegram\.org$/,
    /^(\w+\.)?telegram\.org$/,
    /^t\.me$/,
  ];

  const isAllowed = allowedDomains.some(re => re.test(targetHost));
  if (!isAllowed) {
    return new Response('Forbidden: not a Telegram domain', { status: 403 });
  }

  // Remaining path segments
  const remainingPath = pathSegments.slice(1).join('/');
  const targetUrl = `https://${targetHost}/${remainingPath}`;

  // Handle WebSocket upgrade
  if (request.headers.get('Upgrade') === 'websocket') {
    // Cloudflare Pages Functions support WebSocket proxying
    const upgradeRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return fetch(upgradeRequest);
  }

  // Regular HTTP proxy
  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.set('Host', targetHost);
  // Remove CF-specific headers that might confuse upstream
  proxyHeaders.delete('cf-connecting-ip');
  proxyHeaders.delete('cf-ipcountry');
  proxyHeaders.delete('cf-ray');
  proxyHeaders.delete('cf-visitor');

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    // Return response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
