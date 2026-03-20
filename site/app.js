// Pipeline Score — Application Logic
// Leaderboard, filtering, sorting, tabs, compare

const API_BASE = 'https://pipelinescore.ai';

document.addEventListener('DOMContentLoaded', function() {
  initLeaderboard();
  initFilters();
  initTabs();
  initCompare();
});

// State
let currentTab = 'pipeline';
let currentSort = { column: 'pipeline', direction: 'desc' };
let selectedTeams = [];
let filteredTeams = [...PIPELINESCORE_DATA.teams];

// Try to load live data from API, fall back to static seed data
async function loadLeaderboardData() {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (data.teams && data.teams.length > 0) {
      return data.teams.map(t => ({
        id: t.team_id,
        name: t.team_name,
        rank: t.rank,
        trend: '—',
        pipeline: t.pipeline,
        extraction: t.extraction || 0,
        code: t.code || 0,
        reasoning: t.reasoning || 0,
        research: t.research || 0,
        multitool: t.multitool || 0,
        bugfix: t.bugfix || 0,
        docreview: t.docreview || 0,
        rtresearch: t.rtresearch || 0,
        adversarial: t.adversarial || 0,
        agentCount: t.agents || 1,
        hardwareTier: t.hardwareType || 'cloud',
        hardwareLabel: t.hardwareLabel || '☁ Cloud',
        cost: t.cost || 0,
        agents: (t.agentsList || []).map(a => ({ name: a.name, model: a.model })),
        verified: t.verified,
      }));
    }
  } catch (e) {
    console.log('API unavailable, using seed data');
  }
  return null;
}

// Get score color class
function getScoreColor(score) {
  if (score >= 90) return 'green';
  if (score >= 70) return 'yellow';
  return 'red';
}

// Get cost badge class
function getCostClass(cost) {
  if (cost < 0.10) return 'green';
  if (cost <= 0.50) return 'yellow';
  return 'red';
}

// Format agent list for display
function formatAgentList(agents) {
  return agents.map(a => a.name).join(' · ');
}

// Render the leaderboard table
// ── HTML escaping (must be first — used throughout) ──────────────────────────
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Tier system ──────────────────────────────────────────────────────────────
const TIERS = [
  { min: 80, name: 'LOBSTER', emoji: '🦞',  tagline: 'This stack slaps.',            cls: 'tier-lobster' },
  { min: 50, name: 'CHEF',    emoji: '👨‍🍳', tagline: "Something's cooking.",         cls: 'tier-chef'    },
  { min: 10, name: 'SHRIMP',  emoji: '🦐',  tagline: 'Needs more seasoning.',        cls: 'tier-shrimp'  },
  { min: 0,  name: '💩',      emoji: '💩',  tagline: "We don't talk about this run.", cls: 'tier-poo'     },
];
function getTier(score) {
  return TIERS.find(t => score >= t.min) || TIERS[TIERS.length - 1];
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;

  tbody.innerHTML = filteredTeams.map((team, idx) => {
    const rank = idx + 1;
    const trendIcon = team.trend === 'up' ? '▲' : team.trend === 'down' ? '▼' : '—';
    const agentList = team.agents.map(a => `${escHtml(a.name)} <span class="agent-model">(${escHtml(a.model)})</span>`).join(' · ');
    const tier = getTier(team.pipeline);
    
    return `<tr class="team-row" data-id="${team.id}">
      <td class="td-rank">
        <span class="rank-num">${rank}</span>
        <span class="rank-trend ${team.trend}">${trendIcon}</span>
      </td>
      <td class="td-team">
        <a href="team.html?id=${encodeURIComponent(team.id)}" class="team-name">${escHtml(team.name)}</a>
        <div class="team-models">${agentList}</div>
      </td>
      <td class="td-pipeline">
        <div class="pipeline-cell">
          <span class="score-hero score-${getScoreColor(team.pipeline)}">${team.pipeline}</span>
          <span class="tier-badge ${tier.cls}" title="${tier.tagline}">${tier.emoji} ${tier.name}</span>
        </div>
      </td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.extraction)}">${team.extraction}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.code)}">${team.code}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.reasoning)}">${team.reasoning}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.research)}">${team.research}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.multitool)}">${team.multitool}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.bugfix)}">${team.bugfix}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.docreview)}">${team.docreview}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.rtresearch)}">${team.rtresearch}</span></td>
      <td class="td-score"><span class="score-sm score-${getScoreColor(team.adversarial)}">${team.adversarial}</span></td>
      <td class="td-center">${team.agentCount}</td>
      <td class="td-center"><span class="hw-badge hw-${team.hardware}">${team.hardwareLabel}</span></td>
      <td class="td-cost"><span class="cost-badge cost-${getCostClass(team.cost)}">$${team.cost.toFixed(2)}</span></td>
    </tr>`;
  }).join('');
}

// Initialize leaderboard
async function initLeaderboard() {
  // Try to load live data first
  const liveData = await loadLeaderboardData();
  if (liveData) {
    filteredTeams = liveData;
  }
  
  // Initial sort by pipeline (descending)
  filteredTeams.sort((a, b) => b.pipeline - a.pipeline);
  renderTable();
  
  // Setup search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      filterTeams();
    });
  }
  
  // Setup sort headers
  document.querySelectorAll('.th[data-sort]').forEach(th => {
    th.addEventListener('click', function() {
      const column = this.dataset.sort;
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'desc';
      }
      sortTeams();
      renderTable();
    });
  });
}

// Filter teams based on search and filters
function filterTeams() {
  const searchInput = document.getElementById('search-input');
  const query = searchInput ? searchInput.value.toLowerCase() : '';
  
  filteredTeams = PIPELINESCORE_DATA.teams.filter(team => {
    // Search filter
    if (query) {
      const nameMatch = team.name.toLowerCase().includes(query);
      const modelMatch = team.agents.some(a => a.model.toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
      if (!nameMatch && !modelMatch) return false;
    }
    
    // Hardware filter
    const hwSelect = document.getElementById('filter-hardware');
    if (hwSelect && hwSelect.value !== 'all') {
      if (team.hardware !== hwSelect.value) return false;
    }
    
    // Pipeline score filter (use as "overall" filter)
    const overallSlider = document.getElementById('filter-overall');
    if (overallSlider && team.pipeline < parseInt(overallSlider.value)) return false;
    
    // Quality filter (use extraction as proxy for now)
    const qualitySlider = document.getElementById('filter-quality');
    if (qualitySlider && team.extraction < parseInt(qualitySlider.value)) return false;
    
    // Speed filter (use reasoning as proxy)
    const speedSlider = document.getElementById('filter-speed');
    if (speedSlider && team.reasoning < parseInt(speedSlider.value)) return false;
    
    // Cost filter
    const costSlider = document.getElementById('filter-cost');
    if (costSlider && team.cost > parseFloat(costSlider.value)) return false;
    
    // Agents filter
    const agentsSlider = document.getElementById('filter-agents');
    if (agentsSlider && team.agentCount > parseInt(agentsSlider.value)) return false;
    
    return true;
  });
  
  sortTeams();
  renderTable();
  updateTeamCount();
}

// Sort teams
function sortTeams() {
  filteredTeams.sort((a, b) => {
    let valA, valB;
    
    switch(currentSort.column) {
      case 'pipeline':
        valA = a.pipeline;
        valB = b.pipeline;
        break;
      case 'extraction':
        valA = a.extraction;
        valB = b.extraction;
        break;
      case 'code':
        valA = a.code;
        valB = b.code;
        break;
      case 'reasoning':
        valA = a.reasoning;
        valB = b.reasoning;
        break;
      case 'research':
        valA = a.research;
        valB = b.research;
        break;
      case 'multitool':
        valA = a.multitool;
        valB = b.multitool;
        break;
      case 'bugfix':
        valA = a.bugfix;
        valB = b.bugfix;
        break;
      case 'docreview':
        valA = a.docreview;
        valB = b.docreview;
        break;
      case 'rtresearch':
        valA = a.rtresearch;
        valB = b.rtresearch;
        break;
      case 'adversarial':
        valA = a.adversarial;
        valB = b.adversarial;
        break;
      default:
        valA = a.pipeline;
        valB = b.pipeline;
    }
    
    return currentSort.direction === 'asc' ? valA - valB : valB - valA;
  });
}

// Update team count display
function updateTeamCount() {
  const countEl = document.querySelector('.team-count');
  if (countEl) {
    countEl.textContent = `${filteredTeams.length} teams`;
  }
}

// Initialize filters
function initFilters() {
  // Slider filters
  const sliders = ['filter-overall', 'filter-quality', 'filter-speed', 'filter-cost', 'filter-agents'];
  
  sliders.forEach(id => {
    const slider = document.getElementById(id);
    if (!slider) return;
    
    slider.addEventListener('input', function() {
      // Update display value
      const valId = id.replace('filter-', 'val-');
      const valEl = document.getElementById(valId);
      if (valEl) {
        if (id === 'filter-cost') {
          valEl.textContent = parseFloat(this.value).toFixed(2);
        } else {
          valEl.textContent = this.value;
        }
      }
      
      filterTeams();
    });
  });
  
  // Dropdown filters
  const hwSelect = document.getElementById('filter-hardware');
  if (hwSelect) {
    hwSelect.addEventListener('change', filterTeams);
  }
  
  const typeSelect = document.getElementById('filter-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', filterTeams);
  }
}

// Initialize tabs
function initTabs() {
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Update active tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // Set current tab and re-render
      currentTab = this.dataset.tab;

      const allRunsPanel = document.getElementById('all-runs-panel');
      const tableWrapper = document.getElementById('leaderboard-table-wrapper');

      if (currentTab === 'all-runs') {
        if (allRunsPanel) allRunsPanel.style.display = 'block';
        if (tableWrapper) tableWrapper.style.display = 'none';
        loadAllRuns().then(runs => renderAllRuns(runs));
        return;
      }

      if (allRunsPanel) allRunsPanel.style.display = 'none';
      if (tableWrapper) tableWrapper.style.display = '';

      // For hardware/value tabs, special handling
      if (currentTab === 'hardware') {
        sortByHardware();
      } else if (currentTab === 'value') {
        sortByValue();
      } else if (currentTab !== 'pipeline') {
        // Sort by the selected test score
        currentSort.column = currentTab;
        currentSort.direction = 'desc';
      } else {
        // Pipeline tab - reset to pipeline sorting
        currentSort.column = 'pipeline';
        currentSort.direction = 'desc';
      }
      
      filterTeams();
    });
  });
}

// Sort by value (cost efficiency)
function sortByValue() {
  filteredTeams.sort((a, b) => {
    // Higher pipeline score, lower cost = better value
    const valueA = a.pipeline / a.cost;
    const valueB = b.pipeline / b.cost;
    return valueB - valueA;
  });
}

// Sort by hardware tier
function sortByHardware() {
  const hwOrder = { enterprise: 0, apple: 1, cloud: 2, gpu: 3 };
  filteredTeams.sort((a, b) => {
    const orderA = hwOrder[a.hardware] ?? 99;
    const orderB = hwOrder[b.hardware] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return b.pipeline - a.pipeline;
  });
}

// Initialize compare functionality
function initCompare() {
  const modal = document.getElementById('compare-modal');
  const closeBtn = document.getElementById('modal-close');
  
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', function() {
      modal.classList.remove('active');
    });
    
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  }
  
  // Compare bar buttons
  const runCompare = document.getElementById('run-compare');
  if (runCompare) {
    runCompare.addEventListener('click', showCompareModal);
  }
  
  const clearCompare = document.getElementById('clear-compare');
  if (clearCompare) {
    clearCompare.addEventListener('click', function() {
      selectedTeams = [];
      document.getElementById('compare-bar').style.display = 'none';
      renderTable();
    });
  }
  
  // Sidebar buttons
  const btnTest = document.getElementById('btn-test');
  if (btnTest) {
    btnTest.addEventListener('click', () => window.location.href = 'submit.html');
  }
  
  const btnSubmit = document.getElementById('btn-submit');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => window.location.href = 'submit.html');
  }
  
  const btnCsv = document.getElementById('btn-csv');
  if (btnCsv) {
    btnCsv.addEventListener('click', downloadCSV);
  }
  
  const btnCompare = document.getElementById('btn-compare');
  if (btnCompare) {
    btnCompare.addEventListener('click', function() {
      if (selectedTeams.length >= 2) {
        showCompareModal();
      } else {
        alert('Please select at least 2 teams to compare');
      }
    });
  }
}

// Toggle team selection for compare
function toggleTeamCompare(teamId) {
  const idx = selectedTeams.indexOf(teamId);
  
  if (idx > -1) {
    selectedTeams.splice(idx, 1);
  } else {
    if (selectedTeams.length >= 2) {
      selectedTeams.shift();
    }
    selectedTeams.push(teamId);
  }
  
  // Update compare bar
  const compareBar = document.getElementById('compare-bar');
  const compareCount = document.getElementById('compare-count');
  
  if (compareBar && compareCount) {
    compareCount.textContent = selectedTeams.length;
    compareBar.style.display = selectedTeams.length > 0 ? 'flex' : 'none';
  }
  
  renderTable();
}

// Show compare modal
function showCompareModal() {
  const modal = document.getElementById('compare-modal');
  const body = document.getElementById('compare-modal-body');
  
  if (!modal || !body || selectedTeams.length < 2) return;
  
  const team1 = PIPELINESCORE_DATA.teams.find(t => t.id === selectedTeams[0]);
  const team2 = PIPELINESCORE_DATA.teams.find(t => t.id === selectedTeams[1]);
  
  if (!team1 || !team2) return;
  
  body.innerHTML = `
    <div class="compare-grid">
      <div class="compare-team-card">
        <div class="compare-team-title">${escHtml(team1.name)}</div>
        <div class="compare-stat-row highlight">
          <span class="compare-stat-label">Pipeline Score</span>
          <span class="compare-stat-value score-hero ${getScoreColor(team1.pipeline)}">${team1.pipeline}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Extraction</span>
          <span class="compare-stat-value">${team1.extraction}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Code Generation</span>
          <span class="compare-stat-value">${team1.code}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Logical Reasoning</span>
          <span class="compare-stat-value">${team1.reasoning}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Research Synthesis</span>
          <span class="compare-stat-value">${team1.research}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Multi-Tool</span>
          <span class="compare-stat-value">${team1.multitool}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Bug Diagnosis</span>
          <span class="compare-stat-value">${team1.bugfix}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Agents</span>
          <span class="compare-stat-value">${team1.agentCount}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Hardware</span>
          <span class="compare-stat-value">${team1.hardwareLabel}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Cost/Task</span>
          <span class="compare-stat-value cost-badge ${getCostClass(team1.cost)}">$${team1.cost.toFixed(2)}</span>
        </div>
      </div>
      <div class="compare-team-card">
        <div class="compare-team-title">${escHtml(team2.name)}</div>
        <div class="compare-stat-row highlight">
          <span class="compare-stat-label">Pipeline Score</span>
          <span class="compare-stat-value score-hero ${getScoreColor(team2.pipeline)}">${team2.pipeline}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Extraction</span>
          <span class="compare-stat-value">${team2.extraction}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Code Generation</span>
          <span class="compare-stat-value">${team2.code}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Logical Reasoning</span>
          <span class="compare-stat-value">${team2.reasoning}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Research Synthesis</span>
          <span class="compare-stat-value">${team2.research}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Multi-Tool</span>
          <span class="compare-stat-value">${team2.multitool}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Bug Diagnosis</span>
          <span class="compare-stat-value">${team2.bugfix}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Agents</span>
          <span class="compare-stat-value">${team2.agentCount}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Hardware</span>
          <span class="compare-stat-value">${team2.hardwareLabel}</span>
        </div>
        <div class="compare-stat-row">
          <span class="compare-stat-label">Cost/Task</span>
          <span class="compare-stat-value cost-badge ${getCostClass(team2.cost)}">$${team2.cost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
}

// Download CSV
function downloadCSV() {
  const headers = ['Rank', 'Team Name', 'Pipeline', 'Extraction', 'Code', 'Reasoning', 'Research', 'Multi-Tool', 'Bug Fix', 'Doc Review', 'RT Research', 'Adversarial', 'Agents', 'Hardware', 'Cost'];
  const rows = PIPELINESCORE_DATA.teams.map(t => [
    t.rank,
    t.name,
    t.pipeline,
    t.extraction,
    t.code,
    t.reasoning,
    t.research,
    t.multitool,
    t.bugfix,
    t.docreview,
    t.rtresearch,
    t.adversarial,
    t.agentCount,
    t.hardwareLabel,
    '$' + t.cost.toFixed(2)
  ]);
  
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pipelinescore-leaderboard.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Make functions available globally
window.toggleTeamCompare = toggleTeamCompare;

// ─── ALL RUNS VIEW ────────────────────────────────────────────────
async function loadAllRuns() {
  try {
    const res = await fetch(`${API_BASE}/api/runs?limit=200`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    return data.runs || [];
  } catch (e) {
    console.log('Could not load runs:', e);
    return [];
  }
}

function renderAllRuns(runs) {
  const container = document.getElementById('all-runs-container');
  if (!container) return;

  if (!runs.length) {
    container.innerHTML = '<div class="empty-state">No runs submitted yet. Run the harness to appear here.</div>';
    return;
  }

  // Group by team
  const byTeam = {};
  runs.forEach(r => {
    if (!byTeam[r.team_id]) byTeam[r.team_id] = { name: r.team_name, runs: [] };
    byTeam[r.team_id].runs.push(r);
  });

  container.innerHTML = Object.entries(byTeam).map(([teamId, team]) => `
    <div class="team-runs-block">
      <div class="team-runs-header">
        <span class="team-runs-name">${escHtml(team.name)}</span>
        <span class="team-runs-count">${team.runs.length} run${team.runs.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="runs-list">
        ${team.runs.map(r => `
          <div class="run-row ${r.pipeline >= 80 ? 'run-good' : r.pipeline >= 60 ? 'run-ok' : 'run-poor'}">
            <span class="run-badge">Run #${r.run_number}</span>
            <span class="run-date">${new Date(r.submitted_at).toLocaleDateString('en-CA', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            <span class="run-pipeline score-${r.pipeline >= 80 ? 'green' : r.pipeline >= 60 ? 'yellow' : 'red'}">${r.pipeline}<small>/100</small></span>
            <div class="run-subtasks">
              ${['extraction','code','reasoning','research','multitool','bugfix','docreview','rtresearch','adversarial']
                .filter(k => r[k] != null)
                .map(k => `<span class="subtask-chip" title="${k}">${r[k]}</span>`)
                .join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// Hook into tab system
document.addEventListener('DOMContentLoaded', function() {
  const allRunsTab = document.querySelector('[data-tab="all-runs"]');
  if (allRunsTab) {
    allRunsTab.addEventListener('click', async () => {
      const runs = await loadAllRuns();
      renderAllRuns(runs);
    });
  }
});

// ─── Notes Tab ────────────────────────────────────────────────────────────
async function loadNotes(teamFilter = 'all') {
  const container = document.getElementById('notes-container');
  if (!container) return;
  container.innerHTML = '<div class="notes-loading">Loading run notes...</div>';

  // Fetch all submissions with notes from D1 via Worker
  let runs = [];
  try {
    const resp = await fetch('https://api.pipelinescore.ai/api/runs?limit=100');
    if (resp.ok) {
      const data = await resp.json();
      runs = data.submissions || data.runs || [];
    }
  } catch(e) {}

  // Fallback: use hardcoded C&R data if API unavailable
  if (!runs.length) {
    runs = STATIC_RUNS;
  }

  // Populate team selector
  const sel = document.getElementById('notes-team-select');
  if (sel && sel.options.length <= 1) {
    const teams = [...new Set(runs.map(r => r.team_name).filter(Boolean))];
    teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => loadNotes(sel.value));
  }

  // Filter
  const filtered = teamFilter === 'all' ? runs : runs.filter(r => r.team_name === teamFilter);
  const withNotes = filtered.filter(r => r.notes);

  if (!withNotes.length) {
    container.innerHTML = '<div class="notes-empty">No notes for this selection yet.</div>';
    return;
  }

  // Sort newest last (show the story chronologically)
  withNotes.sort((a,b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  // Group by team
  const byTeam = {};
  withNotes.forEach(r => {
    const t = r.team_name || 'Unknown';
    if (!byTeam[t]) byTeam[t] = [];
    byTeam[t].push(r);
  });

  container.innerHTML = Object.entries(byTeam).map(([team, teamRuns]) => `
    <div class="notes-team-block">
      <div class="notes-team-header">
        <span class="notes-team-name">${escHtml(team)}</span>
        <span class="notes-team-count">${teamRuns.length} annotated run${teamRuns.length > 1 ? 's' : ''}</span>
      </div>
      <div class="notes-run-list">
        ${teamRuns.map((r, i) => {
          const score = r.pipeline_score ?? r.pipeline ?? 0;
          const trend = i === 0 ? null : score > (teamRuns[i-1].pipeline_score ?? 0) ? 'up' : score < (teamRuns[i-1].pipeline_score ?? 0) ? 'down' : 'flat';
          const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '→' : '';
          const trendClass = trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : 'trend-flat';
          const date = r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
          const runLabel = r.run_number ? `Run #${r.run_number}` : `Run`;
          return `
          <div class="notes-run-card">
            <div class="notes-run-meta">
              <div class="notes-run-left">
                <span class="notes-run-label">${runLabel}</span>
                <span class="notes-score-badge notes-score-${score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low'}">${score}<span class="notes-score-denom">/100</span></span>
                ${trendIcon ? `<span class="notes-trend ${trendClass}">${trendIcon} ${Math.abs(score - (teamRuns[i-1].pipeline_score??0))}</span>` : ''}
              </div>
              <span class="notes-run-date">${date}</span>
            </div>
            <div class="notes-run-note">${escHtml(r.notes)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

// Static fallback data (C&R Stack v8 full history)
const STATIC_RUNS = [
  {team_name:'C&R Stack v8',pipeline_score:31,run_number:1,submitted_at:'2026-03-03T10:50:48Z',notes:"First real run. Ollama was truncating responses at ~512 tokens (no num_predict set). Analysis and build stages came back short. Pipeline collapsed. Fixed by adding num_predict: 4096 and num_ctx: 32768."},
  {team_name:'C&R Stack v8',pipeline_score:18,run_number:2,submitted_at:'2026-03-03T11:15:20Z',notes:"Longer prompts overwhelmed the default Ollama context window (2048 tokens). Analysis and communicate stages returned empty strings — the model just stopped. The retry logic caught it but couldn't recover gracefully. Fixed by explicitly setting num_ctx: 32768."},
  {team_name:'C&R Stack v8',pipeline_score:82,run_number:3,submitted_at:'2026-03-03T11:50:41Z',notes:"First clean run after the Ollama context fix. Retry logic caught 2 empty responses mid-run (build + communicate) and recovered successfully. This established our baseline: 82/100 pipeline was achievable with the right config."},
  {team_name:'C&R Stack v8',pipeline_score:31,run_number:4,submitted_at:'2026-03-03T12:39:35Z',notes:"Regression. The judge rubric was still holistic ('stage quality, 40pts') giving the LLM too much latitude. Same stack, same config — scored 31 vs 82 the run before. Confirmed the rubric was the problem, not the model outputs."},
  {team_name:'C&R Stack v8',pipeline_score:84,run_number:5,submitted_at:'2026-03-03T14:01:32Z',notes:"Scoring consistency fix confirmed. Rewrote rubric as binary checkboxes (specific criteria, specific points). Set judge temperature to 0. Lowered pipeline agent temperature to 0.2. Pipeline task now has guided inputs to reduce cascade variance. Runs #3 and #5 within 2 points of each other (82 vs 84). First submission to the live leaderboard."},
  {team_name:'C&R Stack v8',pipeline_score:62,run_number:6,submitted_at:'2026-03-03T15:40:02Z',notes:"Analysis stage fired the empty-response retry again. When temp=0.2 is too low for the 27b model on complex prompts, it stops early and the retry produces weaker output. The cascade hurt communicate. Individual tasks improved across the board (+15 on research, +4 on multi-tool, +3 on doc review). Pipeline still needs work. Bumping agent temp to 0.4 for Run #7."},
];

// Hook into tab switching
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', e => {
      if (tab.dataset.tab === 'notes') {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('[id$="-panel"], #all-runs-panel, #notes-panel').forEach(p => p.style.display = 'none');
        const np = document.getElementById('notes-panel');
        if (np) { np.style.display = 'block'; loadNotes(); }
        e.preventDefault();
      }
    });
  });
});
