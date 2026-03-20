-- Users / API Keys
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  description TEXT,
  agent_count INTEGER DEFAULT 1,
  hardware_type TEXT,
  hardware_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Submissions (each harness run)
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  submitted_at TEXT NOT NULL,

  -- Pipeline Score (flagship)
  pipeline_score REAL NOT NULL,

  -- 9 supporting scores
  extraction_score REAL,
  code_score REAL,
  reasoning_score REAL,
  research_score REAL,
  multitool_score REAL,
  bugfix_score REAL,
  docreview_score REAL,
  rtresearch_score REAL,
  adversarial_score REAL,

  -- Team metadata
  agent_count INTEGER,
  agents_json TEXT,        -- JSON array of {name, model, role}
  hardware_type TEXT,
  hardware_label TEXT,
  cost_per_task REAL,

  -- Verification
  hardware_info_json TEXT, -- JSON from HardwareCollector
  model_verification_json TEXT, -- JSON from ModelVerifier
  signature TEXT,
  verified INTEGER DEFAULT 0,

  -- Harness version
  harness_version TEXT,

  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- Leaderboard view (best pipeline score per team)
CREATE VIEW IF NOT EXISTS leaderboard AS
SELECT
  t.id as team_id,
  t.name as team_name,
  t.owner_email,
  s.id as submission_id,
  s.submitted_at,
  s.pipeline_score,
  s.extraction_score,
  s.code_score,
  s.reasoning_score,
  s.research_score,
  s.multitool_score,
  s.bugfix_score,
  s.docreview_score,
  s.rtresearch_score,
  s.adversarial_score,
  s.agent_count,
  s.agents_json,
  s.hardware_type,
  s.hardware_label,
  s.cost_per_task,
  s.verified,
  COUNT(s2.id) as total_runs
FROM teams t
JOIN submissions s ON s.team_id = t.id
  AND s.pipeline_score = (SELECT MAX(s3.pipeline_score) FROM submissions s3 WHERE s3.team_id = t.id)
LEFT JOIN submissions s2 ON s2.team_id = t.id
GROUP BY t.id
ORDER BY s.pipeline_score DESC;
