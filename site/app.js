// Pipeline Score — Application Logic
// Leaderboard, filtering, sorting, tabs, compare

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
function renderTable() {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;

  tbody.innerHTML = filteredTeams.map((team, idx) => {
    const rank = idx + 1;
    const trendIcon = team.trend === 'up' ? '▲' : team.trend === 'down' ? '▼' : '—';
    const agentList = team.agents.map(a => `${a.name} <span class="agent-model">(${a.model})</span>`).join(' · ');
    
    return `<tr class="team-row" data-id="${team.id}">
      <td class="td-rank">
        <span class="rank-num">${rank}</span>
        <span class="rank-trend ${team.trend}">${trendIcon}</span>
      </td>
      <td class="td-team">
        <a href="team.html?id=${team.id}" class="team-name">${team.name}</a>
        <div class="team-models">${agentList}</div>
      </td>
      <td class="td-pipeline">
        <span class="score-hero score-${getScoreColor(team.pipeline)}">${team.pipeline}</span>
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
function initLeaderboard() {
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
        <div class="compare-team-title">${team1.name}</div>
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
        <div class="compare-team-title">${team2.name}</div>
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
