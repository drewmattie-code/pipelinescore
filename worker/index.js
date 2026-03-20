export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route: POST /api/register
      if (path === '/api/register' && method === 'POST') {
        return handleRegister(request, env, corsHeaders);
      }

      // Route: POST /api/submit
      if (path === '/api/submit' && method === 'POST') {
        return handleSubmit(request, env, corsHeaders);
      }

      // Route: GET /api/leaderboard
      if (path === '/api/leaderboard' && method === 'GET') {
        return handleLeaderboard(request, env, corsHeaders);
      }

      // Route: GET /api/team/:id
      if (path.startsWith('/api/team/') && method === 'GET') {
        const teamId = path.replace('/api/team/', '');
        return handleTeam(teamId, env, corsHeaders);
      }

      // Route: GET /api/stats
      if (path === '/api/stats' && method === 'GET') {
        return handleStats(env, corsHeaders);
      }

      // Route: GET /api/runs — all individual runs, serialized
      if (path === '/api/runs' && method === 'GET') {
        return handleRuns(request, env, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);

    } catch (err) {
      console.error(err);
      return jsonResponse({ error: 'Internal server error', detail: err.message }, 500, corsHeaders);
    }
  }
};

// ─── POST /api/register ───────────────────────────────────────────
async function handleRegister(request, env, cors) {
  const body = await request.json();
  const { email } = body;

  if (!email || !email.includes('@')) {
    return jsonResponse({ error: 'Valid email required' }, 400, cors);
  }

  // Check if already registered
  const existing = await env.DB.prepare(
    'SELECT api_key FROM users WHERE email = ?'
  ).bind(email).first();

  if (existing) {
    // Return existing key (idempotent)
    return jsonResponse({
      success: true,
      api_key: existing.api_key,
      message: 'Welcome back! Your existing API key.',
      download_url: 'https://github.com/drewmattie-code/pipelinescore/releases/latest'
    }, 200, cors);
  }

  // Generate new API key
  const id = crypto.randomUUID();
  const api_key = 'ps_' + generateKey(32);
  const created_at = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO users (id, email, api_key, created_at) VALUES (?, ?, ?, ?)'
  ).bind(id, email, api_key, created_at).run();

  return jsonResponse({
    success: true,
    api_key,
    message: 'API key created. Add to team.yaml as PIPELINESCORE_API_KEY.',
    download_url: 'https://github.com/drewmattie-code/pipelinescore/releases/latest'
  }, 201, cors);
}

// ─── POST /api/submit ─────────────────────────────────────────────
async function handleSubmit(request, env, cors) {
  // Validate API key from Authorization header or body
  const authHeader = request.headers.get('Authorization') || '';
  const body = await request.json();
  const apiKey = authHeader.replace('Bearer ', '') || body.api_key;

  if (!apiKey) {
    return jsonResponse({ error: 'API key required. Get one at pipelinescore.ai' }, 401, cors);
  }

  // Verify API key
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE api_key = ?'
  ).bind(apiKey).first();

  if (!user) {
    return jsonResponse({ error: 'Invalid API key' }, 401, cors);
  }

  // Validate required fields
  const { team, scores, hardware, model_verification, signature, version } = body;

  if (!team?.name || !scores?.pipeline) {
    return jsonResponse({ error: 'Missing required fields: team.name, scores.pipeline' }, 400, cors);
  }

  if (scores.pipeline < 0 || scores.pipeline > 100) {
    return jsonResponse({ error: 'Invalid pipeline score (must be 0-100)' }, 400, cors);
  }

  // Upsert team
  const teamId = slugify(team.name + '-' + user.email.split('@')[0]);
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO teams (id, name, owner_email, description, agent_count, hardware_type, hardware_label, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      agent_count = excluded.agent_count,
      hardware_type = excluded.hardware_type,
      hardware_label = excluded.hardware_label,
      updated_at = excluded.updated_at
  `).bind(
    teamId,
    team.name,
    user.email,
    team.description || '',
    team.agents?.length || 1,
    hardware?.type || 'unknown',
    hardware?.label || 'Unknown',
    now,
    now
  ).run();

  // Insert submission
  const submissionId = crypto.randomUUID();

  // Normalize score keys — handle both "extraction" and "extraction_001" formats
  const s = scores;
  const norm = (key) => s[key] ?? s[`${key}_001`] ?? null;

  // Normalize hardware — harness sends os/arch/ram_gb, not type/label
  const hwType = hardware?.type || (hardware?.arch === 'arm64' ? 'apple_silicon' : 'unknown');
  const hwLabel = hardware?.label ||
    (hardware?.ram_gb ? `${hardware.cpu || 'Apple'} · ${hardware.ram_gb}GB RAM` : 'Unknown');

  // Normalize agents — strip api_key_env before storing
  const agents = (team.agents || []).map(a => ({
    name: a.name, role: a.role, provider: a.provider, model: a.model
  }));

  await env.DB.prepare(`
    INSERT INTO submissions (
      id, team_id, team_name, owner_email, submitted_at,
      pipeline_score, extraction_score, code_score, reasoning_score,
      research_score, multitool_score, bugfix_score, docreview_score,
      rtresearch_score, adversarial_score,
      agent_count, agents_json, hardware_type, hardware_label, cost_per_task,
      hardware_info_json, model_verification_json, signature, verified, harness_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    submissionId, teamId, team.name, user.email, now,
    s.pipeline,
    norm('extraction'),
    norm('code'),
    norm('reasoning'),
    norm('research'),
    norm('multitool'),
    norm('bugfix'),
    norm('docreview'),
    norm('rtresearch'),
    norm('adversarial'),
    agents.length || 1,
    JSON.stringify(agents),
    hwType,
    hwLabel,
    s.cost_per_task || null,
    JSON.stringify(hardware || {}),
    JSON.stringify(model_verification || {}),
    signature || '',
    model_verification ? 1 : 0,
    version || '2.0.0'
  ).run();

  // Get current rank (best score per team)
  const rank = await env.DB.prepare(`
    SELECT COUNT(*) + 1 as rank FROM (
      SELECT team_id, MAX(pipeline_score) as best
      FROM submissions GROUP BY team_id
    ) WHERE best > ?
  `).bind(scores.pipeline).first();

  // Get run number for this team
  const runNum = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM submissions WHERE team_id = ?'
  ).bind(teamId).first();
  const runNumber = runNum?.count || 1;

  return jsonResponse({
    success: true,
    submission_id: submissionId,
    team_id: teamId,
    pipeline_score: scores.pipeline,
    run_number: runNumber,
    rank: rank?.rank || 1,
    leaderboard_url: `https://pipelinescore.ai`,
    message: `Run #${runNumber} submitted! Pipeline Score: ${scores.pipeline}/100. Rank: #${rank?.rank || 1}`
  }, 201, cors);
}

// ─── GET /api/leaderboard ─────────────────────────────────────────
async function handleLeaderboard(request, env, cors) {
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab') || 'pipeline';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const sortCol = {
    pipeline: 'pipeline_score',
    extraction: 'extraction_score',
    code: 'code_score',
    reasoning: 'reasoning_score',
    research: 'research_score',
    multitool: 'multitool_score',
    bugfix: 'bugfix_score',
    docreview: 'docreview_score',
    rtresearch: 'rtresearch_score',
    adversarial: 'adversarial_score',
    value: 'cost_per_task',
    agents: 'agent_count',
  }[tab] || 'pipeline_score';

  const order = tab === 'value' ? 'ASC' : 'DESC';

  const rows = await env.DB.prepare(`
    SELECT * FROM leaderboard
    ORDER BY ${sortCol} ${order} NULLS LAST
    LIMIT ?
  `).bind(limit).all();

  // Parse JSON fields
  const teams = (rows.results || []).map((row, idx) => ({
    rank: idx + 1,
    team_id: row.team_id,
    team_name: row.team_name,
    submitted_at: row.submitted_at,
    pipeline: row.pipeline_score,
    extraction: row.extraction_score,
    code: row.code_score,
    reasoning: row.reasoning_score,
    research: row.research_score,
    multitool: row.multitool_score,
    bugfix: row.bugfix_score,
    docreview: row.docreview_score,
    rtresearch: row.rtresearch_score,
    adversarial: row.adversarial_score,
    agents: row.agent_count,
    agentsList: tryParse(row.agents_json, []),
    hardwareType: row.hardware_type,
    hardwareLabel: row.hardware_label,
    cost: row.cost_per_task,
    verified: row.verified === 1,
    totalRuns: row.total_runs,
  }));

  return jsonResponse({ success: true, count: teams.length, teams }, 200, cors);
}

// ─── GET /api/team/:id ────────────────────────────────────────────
async function handleTeam(teamId, env, cors) {
  const team = await env.DB.prepare(
    'SELECT * FROM teams WHERE id = ?'
  ).bind(teamId).first();

  if (!team) {
    return jsonResponse({ error: 'Team not found' }, 404, cors);
  }

  const submissions = await env.DB.prepare(
    'SELECT * FROM submissions WHERE team_id = ? ORDER BY submitted_at DESC LIMIT 20'
  ).bind(teamId).all();

  return jsonResponse({
    success: true,
    team,
    submissions: submissions.results || []
  }, 200, cors);
}

// ─── GET /api/runs ────────────────────────────────────────────────
async function handleRuns(request, env, cors) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
  const teamId = url.searchParams.get('team') || null;

  let query, params;
  if (teamId) {
    query = `SELECT * FROM submissions WHERE team_id = ? ORDER BY submitted_at ASC LIMIT ?`;
    params = [teamId, limit];
  } else {
    query = `SELECT * FROM submissions ORDER BY submitted_at DESC LIMIT ?`;
    params = [limit];
  }

  const rows = await env.DB.prepare(query).bind(...params).all();
  const results = rows.results || [];

  // Compute run_number per team (sequential by submitted_at ASC)
  const teamRunCounts = {};
  // Process in ASC order per team for correct numbering
  const asc = [...results].sort((a, b) =>
    a.team_id.localeCompare(b.team_id) || a.submitted_at.localeCompare(b.submitted_at)
  );
  asc.forEach(row => {
    if (!teamRunCounts[row.team_id]) teamRunCounts[row.team_id] = 0;
    teamRunCounts[row.team_id]++;
    row.run_number = teamRunCounts[row.team_id];
  });

  const runs = results.map(row => ({
    run_number: row.run_number,
    submission_id: row.id,
    team_id: row.team_id,
    team_name: row.team_name,
    submitted_at: row.submitted_at,
    pipeline: row.pipeline_score,
    extraction: row.extraction_score,
    code: row.code_score,
    reasoning: row.reasoning_score,
    research: row.research_score,
    multitool: row.multitool_score,
    bugfix: row.bugfix_score,
    docreview: row.docreview_score,
    rtresearch: row.rtresearch_score,
    adversarial: row.adversarial_score,
    agents: row.agent_count,
    hardwareLabel: row.hardware_label,
    verified: row.verified === 1,
    harness_version: row.harness_version,
  }));

  return jsonResponse({ success: true, count: runs.length, runs }, 200, cors);
}

// ─── GET /api/stats ───────────────────────────────────────────────
async function handleStats(env, cors) {
  const [teams, submissions, users] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM teams').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM submissions').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM users').first(),
  ]);

  return jsonResponse({
    success: true,
    teams: teams?.count || 0,
    submissions: submissions?.count || 0,
    registered_users: users?.count || 0,
  }, 200, cors);
}

// ─── Helpers ──────────────────────────────────────────────────────
function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}

function generateKey(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 64);
}

function tryParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}
