/**
 * Cloudflare Pages Function — Telegram API Proxy
 * 
 * Routes:  /api/<telegram-dc-host>/<path>
 * Example: /api/pluto.web.telegram.org/apiws
 * 
 * Supports both HTTP and WebSocket proxying.
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

  // WebSocket upgrade — use fetch-based approach
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
    const targetUrl = `https://${targetHost}/${remainingPath}`;

    // Forward the entire request to Telegram, preserving the Upgrade header
    // Cloudflare will handle the WebSocket upgrade transparently
    try {
      const resp = await fetch(targetUrl, {
        headers: {
          'Upgrade': 'websocket',
          'Host': targetHost,
        },
      });

      // If fetch returns a WebSocket, create a WebSocketPair to bridge
      if (resp.webSocket) {
        const upstream = resp.webSocket;
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        upstream.accept();
        server.accept();

        // Bridge messages bidirectionally
        upstream.addEventListener('message', evt => {
          try { server.send(evt.data); } catch {}
        });
        server.addEventListener('message', evt => {
          try { upstream.send(evt.data); } catch {}
        });

        upstream.addEventListener('close', evt => {
          try { server.close(evt.code || 1000, evt.reason || ''); } catch {}
        });
        server.addEventListener('close', evt => {
          try { upstream.close(evt.code || 1000, evt.reason || ''); } catch {}
        });

        upstream.addEventListener('error', () => {
          try { server.close(1011, 'upstream error'); } catch {}
        });
        server.addEventListener('error', () => {
          try { upstream.close(1011, 'client error'); } catch {}
        });

        return new Response(null, { status: 101, webSocket: client });
      }

      // Fallback: return the response as-is (shouldn't happen)
      return new Response('WebSocket upgrade not supported by upstream', { status: 502 });
    } catch (err) {
      return new Response(`WS Proxy error: ${err.message}`, { status: 502 });
    }
  }

  // Regular HTTP proxy
  const targetUrl = `https://${targetHost}/${remainingPath}`;
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: { 'Host': targetHost },
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
