/**
 * Cloudflare Pages Function — Telegram API Proxy
 * 
 * Routes:  /api/<telegram-dc-host>/<path>
 * Example: /api/pluto.web.telegram.org/apiws
 * 
 * Supports both HTTP and WebSocket proxying.
 * Based on: https://developers.cloudflare.com/workers/examples/websockets/
 */

export async function onRequest(context) {
  const { request, params } = context;
  
  const pathSegments = params.path;
  if (!pathSegments || pathSegments.length < 1) {
    return new Response('Missing target host', { status: 400 });
  }

  const targetHost = pathSegments[0];
  
  // Validate Telegram domain
  const allowedPattern = /^[a-z0-9\-]+\.(?:web\.)?telegram\.org$/i;
  if (!allowedPattern.test(targetHost)) {
    return new Response('Forbidden: not a Telegram domain', { status: 403 });
  }

  const remainingPath = pathSegments.slice(1).join('/');

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  // WebSocket upgrade — per CF docs, just fetch() the target with the original request
  // CF automatically handles WebSocket upgrade when request has Upgrade header
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    const targetUrl = `https://${targetHost}/${remainingPath}`;
    
    // Per CF docs: pass the incoming request to fetch() which handles WS upgrade
    return fetch(targetUrl, {
      headers: request.headers,
    });
  }

  // Regular HTTP proxy
  const targetUrl = `https://${targetHost}/${remainingPath}`;
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
