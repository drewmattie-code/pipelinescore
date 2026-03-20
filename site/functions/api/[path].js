export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Proxy to the Worker on api.pipelinescore.ai
  const workerUrl = 'https://api.pipelinescore.ai' + url.pathname + url.search;
  try {
    const resp = await fetch(workerUrl, {
      method,
      headers: request.headers,
      body: (method !== 'GET' && method !== 'HEAD') ? request.body : undefined,
      duplex: 'half'
    });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'API unavailable', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
