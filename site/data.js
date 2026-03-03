// Pipeline Score — Data Store
// Seed data matching UserBenchmark's data density style

const PIPELINESCORE_DATA = {
  stats: {
    teamsSubmitted: 1423,
    testTypes: 10,
    runs: 1284,
    lastUpdated: "Mar 2, 2026"
  },

  // Seed teams with Pipeline as the hero metric
  teams: [
    {
      id: 1,
      name: "C&R Stack v8",
      rank: 1,
      trend: "up",
      agents: [
        { name: "Bruno", model: "claude-sonnet-4-6" },
        { name: "Rocky", model: "qwen3.5:27b" },
        { name: "Ethan", model: "qwen3.5:122b-a10b" },
        { name: "Sterling", model: "qwen3.5:122b-a10b" },
        { name: "007", model: "claude-sonnet-4-6" }
      ],
      pipeline: 91,
      extraction: 96,
      code: 95,
      reasoning: 93,
      research: 97,
      multitool: 91,
      bugfix: 94,
      docreview: 95,
      rtresearch: 90,
      adversarial: 92,
      agentCount: 5,
      hardware: "apple",
      hardwareLabel: "🍎 Apple Silicon",
      cost: 0.12,
      age: 15,
      submissions: 23
    },
    {
      id: 2,
      name: "GPT-5 Solo",
      rank: 2,
      trend: "up",
      agents: [
        { name: "GPT-5", model: "gpt-5" }
      ],
      pipeline: 83,
      extraction: 89,
      code: 91,
      reasoning: 90,
      research: 85,
      multitool: 88,
      bugfix: 90,
      docreview: 84,
      rtresearch: 88,
      adversarial: 86,
      agentCount: 1,
      hardware: "cloud",
      hardwareLabel: "☁ Cloud",
      cost: 0.45,
      age: 20,
      submissions: 45
    },
    {
      id: 3,
      name: "Claude Sonnet 4.6 Solo",
      rank: 3,
      trend: "down",
      agents: [
        { name: "Claude", model: "claude-sonnet-4-6" }
      ],
      pipeline: 81,
      extraction: 88,
      code: 87,
      reasoning: 91,
      research: 86,
      multitool: 84,
      bugfix: 86,
      docreview: 88,
      rtresearch: 83,
      adversarial: 89,
      agentCount: 1,
      hardware: "cloud",
      hardwareLabel: "☁ Cloud",
      cost: 0.38,
      age: 22,
      submissions: 52
    },
    {
      id: 4,
      name: "Qwen3.5-122B Solo",
      rank: 4,
      trend: "up",
      agents: [
        { name: "Qwen", model: "qwen3.5:122b-a10b" }
      ],
      pipeline: 77,
      extraction: 84,
      code: 83,
      reasoning: 85,
      research: 82,
      multitool: 80,
      bugfix: 83,
      docreview: 81,
      rtresearch: 78,
      adversarial: 80,
      agentCount: 1,
      hardware: "apple",
      hardwareLabel: "🍎 Apple Silicon",
      cost: 0.09,
      age: 25,
      submissions: 38
    },
    {
      id: 5,
      name: "Community Stack Alpha",
      rank: 5,
      trend: "same",
      agents: [
        { name: "Orchestrator", model: "qwen3.5:27b" },
        { name: "Coder", model: "qwen3.5:27b" },
        { name: "Reviewer", model: "qwen3.5:27b" }
      ],
      pipeline: 74,
      extraction: 80,
      code: 82,
      reasoning: 76,
      research: 78,
      multitool: 79,
      bugfix: 81,
      docreview: 74,
      rtresearch: 72,
      adversarial: 74,
      agentCount: 3,
      hardware: "apple",
      hardwareLabel: "🍎 Apple Silicon",
      cost: 0.08,
      age: 30,
      submissions: 15
    },
    {
      id: 6,
      name: "DeepSeek V3 Solo",
      rank: 6,
      trend: "up",
      agents: [
        { name: "DeepSeek", model: "deepseek-v3" }
      ],
      pipeline: 71,
      extraction: 78,
      code: 80,
      reasoning: 77,
      research: 74,
      multitool: 75,
      bugfix: 79,
      docreview: 72,
      rtresearch: 76,
      adversarial: 73,
      agentCount: 1,
      hardware: "cloud",
      hardwareLabel: "☁ Cloud",
      cost: 0.07,
      age: 28,
      submissions: 67
    },
    {
      id: 7,
      name: "Gemini 2.5 Pro Solo",
      rank: 7,
      trend: "down",
      agents: [
        { name: "Gemini", model: "gemini-2.5-pro" }
      ],
      pipeline: 69,
      extraction: 76,
      code: 75,
      reasoning: 78,
      research: 77,
      multitool: 72,
      bugfix: 74,
      docreview: 76,
      rtresearch: 80,
      adversarial: 75,
      agentCount: 1,
      hardware: "cloud",
      hardwareLabel: "☁ Cloud",
      cost: 0.52,
      age: 18,
      submissions: 41
    },
    {
      id: 8,
      name: "Budget Local Stack",
      rank: 8,
      trend: "same",
      agents: [
        { name: "Worker", model: "qwen3.5:27b" },
        { name: "Checker", model: "qwen3.5:27b" }
      ],
      pipeline: 65,
      extraction: 73,
      code: 72,
      reasoning: 70,
      research: 71,
      multitool: 69,
      bugfix: 73,
      docreview: 68,
      rtresearch: 65,
      adversarial: 67,
      agentCount: 2,
      hardware: "apple",
      hardwareLabel: "🍎 Apple Silicon",
      cost: 0.02,
      age: 35,
      submissions: 8
    }
  ],

  // Test types (for tabs)
  testTypes: [
    { id: "pipeline", name: "Pipeline" },
    { id: "extraction", name: "Extraction" },
    { id: "code", name: "Code Gen" },
    { id: "reasoning", name: "Reasoning" },
    { id: "research", name: "Research" },
    { id: "multitool", name: "Multi-Tool" },
    { id: "bugfix", name: "Bug Fix" },
    { id: "docreview", name: "Doc Review" },
    { id: "rtresearch", name: "RT Research" },
    { id: "adversarial", name: "Adversarial" }
  ],

  // Hardware tiers
  hardwareTiers: [
    { id: "all", name: "All Hardware" },
    { id: "cloud", name: "Cloud API" },
    { id: "apple", name: "Apple Silicon" },
    { id: "gpu", name: "Consumer GPU" },
    { id: "enterprise", name: "Enterprise GPU" }
  ],

  // Team types
  teamTypes: [
    { id: "all", name: "All Types" },
    { id: "solo", name: "Solo Model" },
    { id: "2agent", name: "2-Agent" },
    { id: "3to5", name: "3-5 Agent" },
    { id: "6plus", name: "6+ Agent" }
  ]
};

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PIPELINESCORE_DATA;
}
