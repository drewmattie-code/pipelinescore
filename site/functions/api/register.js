export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const body = await request.json();
    const nickname = (body.nickname || '').toString().slice(0, 64).trim();
    const email = (body.email || '').toString().slice(0, 254).trim().toLowerCase();

    if (!nickname || !email) {
      return new Response(JSON.stringify({ error: 'nickname and email are required' }), { status: 400, headers: cors });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), { status: 400, headers: cors });
    }
    if (!/^[a-zA-Z0-9 _\-\.]+$/.test(nickname)) {
      return new Response(JSON.stringify({ error: 'Nickname: letters, numbers, spaces, hyphens only' }), { status: 400, headers: cors });
    }

    // Generate API key
    const slug = nickname.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    const rand = Math.random().toString(36).slice(2, 10);
    const apiKey = `ps_${slug}_${rand}`;
    const userId = `${slug}-${email.split('@')[0]}`.slice(0, 64);

    const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.CF_DB_ID}/query`;
    const headers = {
      'X-Auth-Email': env.CF_EMAIL,
      'X-Auth-Key': env.CF_API_KEY,
      'Content-Type': 'application/json'
    };

    // Check if email already registered
    const check = await fetch(D1_URL, {
      method: 'POST', headers,
      body: JSON.stringify({ sql: 'SELECT api_key, id FROM users WHERE email=?1', params: [email] })
    });
    const checkData = await check.json();
    const existing = checkData?.result?.[0]?.results?.[0];

    if (existing) {
      // Return existing key
      return new Response(JSON.stringify({
        success: true,
        returning: true,
        api_key: existing.api_key,
        team_id: existing.id,
        message: 'Welcome back! Here is your existing API key.'
      }), { headers: cors });
    }

    // Insert new user
    await fetch(D1_URL, {
      method: 'POST', headers,
      body: JSON.stringify({
        sql: `INSERT INTO users (id, email, api_key, created_at) VALUES (?1, ?2, ?3, datetime('now'))`,
        params: [userId, email, apiKey]
      })
    });

    return new Response(JSON.stringify({
      success: true,
      returning: false,
      api_key: apiKey,
      team_id: userId,
      message: `You're registered! Add your API key to team.yaml and run the harness.`
    }), { headers: cors });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}
