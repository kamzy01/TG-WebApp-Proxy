/**
 * Cloudflare Pages Function — Telegram API Proxy
 * Uses Durable Objects from the tg-ws-api Worker for WebSocket proxying.
 * 
 * Routes: /api/<telegram-dc-host>/<path>
 * Example: /api/pluto.web.telegram.org/apiws
 */

export async function onRequest(context) {
  const { request, params, env } = context;
  
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

  const remainingPath = pathSegments.slice(1).join('/') || 'apiws';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  // WebSocket upgrade — route to Durable Object
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    // Check if DO binding is available
    if (env.WS_PROXY) {
      const id = env.WS_PROXY.newUniqueId();
      const stub = env.WS_PROXY.get(id);
      
      const doUrl = new URL(request.url);
      doUrl.searchParams.set('targetHost', targetHost);
      doUrl.searchParams.set('targetPath', remainingPath);
      
      return stub.fetch(new Request(doUrl.toString(), request));
    }
    
    // If no DO binding, try service binding to tg-ws-api worker
    if (env.WS_API) {
      const workerUrl = `https://tg-ws-api.hashhackersapi.workers.dev/${targetHost}/${remainingPath}`;
      return env.WS_API.fetch(new Request(workerUrl, request));
    }

    // Fallback: direct fetch (won't work for WS but provides error info)
    return new Response(JSON.stringify({
      error: 'No Durable Object binding available',
      hint: 'Configure WS_PROXY or WS_API binding in Pages settings',
    }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  // Regular HTTP proxy
  const targetUrl = `https://${targetHost}/${remainingPath}`;
  try {
    const resp = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(resp.body, { status: resp.status, headers });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
