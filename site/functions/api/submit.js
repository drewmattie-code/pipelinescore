export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // Validate API key
    const authHeader = request.headers.get('Authorization') || '';
    const apiKey = authHeader.replace('Bearer ', '').trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 401, headers: cors });
    }

    const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.CF_DB_ID}/query`;
    const d1Headers = {
      'X-Auth-Email': env.CF_EMAIL,
      'X-Auth-Key': env.CF_API_KEY,
      'Content-Type': 'application/json'
    };

    async function d1(sql, params = []) {
      const r = await fetch(D1_URL, {
        method: 'POST', headers: d1Headers,
        body: JSON.stringify({ sql, params })
      });
      return r.json();
    }

    // Look up user by API key
    const userRes = await d1('SELECT id, email FROM users WHERE api_key=?1', [apiKey]);
    const user = userRes?.result?.[0]?.results?.[0];
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid API key. Register at pipelinescore.ai/submit.html' }), { status: 403, headers: cors });
    }

    // Parse submission bundle
    const bundle = await request.json();
    const { team = {}, scores = {}, hardware = {}, model_verification, version, signature } = bundle;

    const teamName = (team.name || 'Unknown Team').toString().slice(0, 128).replace(/[<>"'&]/g, '');
    const teamId = (teamName + '-' + user.email.split('@')[0])
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 64);
    const now = bundle.submitted_at || new Date().toISOString();

    // Generate submission ID (deterministic per team+timestamp)
    const idSource = `${teamId}-${now}`;
    const submissionId = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(idSource)
    ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 32));

    // Normalize score keys (handle both 'extraction' and 'extraction_001')
    const norm = (k) => scores[k] ?? scores[`${k}_001`] ?? null;

    // Hardware normalization
    const hwType = hardware.type || (hardware.arch === 'arm64' ? 'apple_silicon' : 'unknown');
    const hwLabel = hardware.label || (hardware.ram_gb ? `${hardware.cpu || 'CPU'} · ${hardware.ram_gb}GB RAM` : 'Unknown');

    // Strip sensitive fields from agents before storing
    const agents = (team.agents || []).map(a => ({
      name: a.name, role: a.role, provider: a.provider, model: a.model
    }));

    // Upsert team
    await d1(`INSERT INTO teams (id,name,owner_email,description,agent_count,hardware_type,hardware_label,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,agent_count=excluded.agent_count,
      hardware_type=excluded.hardware_type,hardware_label=excluded.hardware_label,updated_at=excluded.updated_at`,
      [teamId, teamName, user.email, team.description || '', agents.length, hwType, hwLabel, now]);

    // Insert submission
    await d1(`INSERT OR IGNORE INTO submissions
      (id,team_id,team_name,owner_email,submitted_at,
       pipeline_score,extraction_score,code_score,reasoning_score,
       research_score,multitool_score,bugfix_score,docreview_score,
       rtresearch_score,adversarial_score,
       agent_count,agents_json,hardware_type,hardware_label,
       hardware_info_json,model_verification_json,signature,verified,harness_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [submissionId, teamId, teamName, user.email, now,
       scores.pipeline ?? null,
       norm('extraction'), norm('code'), norm('reasoning'), norm('research'),
       norm('multitool'), norm('bugfix'), norm('docreview'),
       norm('rtresearch'), norm('adversarial'),
       agents.length, JSON.stringify(agents), hwType, hwLabel,
       JSON.stringify(hardware), JSON.stringify(model_verification || {}),
       signature || '', 1, version || '2.0.0']);

    // Get run number for this team
    const runRes = await d1('SELECT COUNT(*) as count FROM submissions WHERE team_id=?1', [teamId]);
    const runNumber = runRes?.result?.[0]?.results?.[0]?.count ?? 1;

    // Get rank
    const rankRes = await d1(`SELECT COUNT(*)+1 as rank FROM
      (SELECT team_id, MAX(pipeline_score) as best FROM submissions GROUP BY team_id)
      WHERE best > ?1`, [scores.pipeline ?? 0]);
    const rank = rankRes?.result?.[0]?.results?.[0]?.rank ?? 1;

    return new Response(JSON.stringify({
      success: true,
      submission_id: submissionId,
      team_id: teamId,
      pipeline_score: scores.pipeline,
      run_number: runNumber,
      rank,
      result_url: `https://pipelinescore.ai/result.html?id=${submissionId}`,
      message: `Run #${runNumber} submitted! Pipeline Score: ${scores.pipeline}/100. Rank: #${rank}`
    }), { headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }});
}
