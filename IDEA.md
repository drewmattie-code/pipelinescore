# Pipeline Score — Agent Team Benchmarking Platform
*Idea captured: March 1, 2026 | Status: Concept — Q2/Q3 2026 project*

---

## The Gap

Individual model benchmarks exist (SWE-bench, BFCL, TauBench, WebArena, Artificial Analysis, LMArena). Academic multi-agent benchmarks exist (AgentBench, GAIA, AgentEval). 

**Nothing exists that benchmarks a configured agent team** — specific models, specific roles, specific orchestration architecture — against a standardized real-world problem set and ranks the result publicly.

That gap is closing fast. MCP standardization is the unlock — for the first time, agent stack configs are portable and reproducible enough to compare fairly. Six months ago this wasn't buildable. Now it is.

---

## What It Is

A public leaderboard where teams submit their agent configuration (models, roles, constitutions, orchestration logic) and run against a fixed problem set. Results ranked by category: output quality, speed, cost efficiency, task completion rate, failure rate.

Leaderboard shows team composition alongside results — the community learns which architectures actually work.

---

## Problem Set Tiers

### Consumer Tier
- Write a product launch campaign end-to-end
- Manage a simulated support inbox (50 tickets, 24hr window)
- Plan and scope a 3-month project with milestones and resource allocation

### Enterprise Tier
- Analyze a supply chain exception dataset and produce a recommended action plan
- Produce a board-ready financial summary from raw P&L data
- Identify contract risks in a 40-page document set

### Agentic Tier
- Multi-day autonomous workflow completion (tool-use chains, no human in loop)
- Error recovery: deliberate failure injected mid-pipeline, score on recovery quality
- Cross-system orchestration: 3+ tool integrations, single coherent output

---

## Scoring Methodology

**Auto-scored (objective):**
- Task completion rate
- Time to completion
- Cost per task (tokens × model pricing)
- Tool call accuracy
- Failure / hallucination rate

**Human-scored (subjective — hybrid rubric):**
- Output quality (rubric-based, community-reviewed criteria)
- Brand voice / tone consistency
- Decision coherence across pipeline handoffs
- Handoff quality between agents

**Scoring governance:** Open criteria, published rubrics, community review process. Neutral — losers can't cry foul if the methodology is transparent.

---

## Submission Format

Teams submit:
- Agent roster (model, role, constitution — sanitized)
- Orchestration topology (who routes to whom)
- Tool manifest (what external tools are available)
- Cost profile (API vs local, estimated $/task)

Reproduced by evaluator harness. Results tied to submitted config version.

---

## Business Model

| Revenue Stream | Mechanics | Est. Value |
|----------------|-----------|------------|
| **Certification** | "Pipeline Score Certified Architecture" — trust signal for enterprise buyers | $5K–25K/cert |
| **Lead gen** | Enterprises searching "best agent stack for supply chain" land on leaderboard | Inbound with intent |
| **Sponsored tiers** | Model providers (Mistral, Qwen, etc.) sponsor category leaderboards | $10K–50K/yr per sponsor |
| **Enterprise eval** | Private benchmarking runs for companies evaluating vendors | $15K–50K/engagement |
| **Data/research** | Aggregate architecture insights sold to VCs, analysts, model labs | TBD |

---

## Strategic Angles

### SaaSquach Lead Gen
Enterprises searching for "best agent team for supply chain" land on a leaderboard where SaaSquach consistently ranks in the top tier for enterprise supply chain tasks. That's high-intent inbound with zero ad spend.

### Community Moat
Open-weight builders submit their stacks. Charles & Roe owns the data on what architectures actually work. That's a research asset that compounds over time — no one else will have it.

### Partnership Targets (ranked by fit)

| Partner | Why | Risk |
|---------|-----|------|
| **Ollama** | Deployment layer for most open-weight agent builders. Direct distribution to exactly the people who submit. Logo on leaderboard = instant community reach. | Low — they're infrastructure, not a product competitor |
| **Qwen / Alibaba** | C&R stack is predominantly Qwen3.5. They have a vested interest in a leaderboard where Qwen-based teams perform well. Sponsorship conversation is straightforward. | Low — they want visibility in the Western open-weight community |
| **LM Studio** | Strong local inference community, adjacent to Ollama. Less likely to absorb the idea than HuggingFace. | Low |
| **Hugging Face** | Canonical home for open-weight models, already runs leaderboards, has the infrastructure and audience. | High — they could absorb the idea and own it. Approach last, if at all. |

**Mistral:** Removed — less relevant than the above. Their community overlap is smaller and the co-sponsorship angle is weaker.

**Sequencing:** Ollama first (distribution), Qwen second (sponsorship + validation), LM Studio third (community breadth). HuggingFace only if the others don't move.

### Certification Layer
"Pipeline Score Certified Architecture" becomes a procurement requirement at enterprise accounts. Buyers start asking vendors: "are you certified?" That's a standard Charles & Roe sets and owns.

---

## Perception Risk & Mitigation

**Risk:** SaaSquach consistently winning on a platform C&R owns looks self-serving.

**Mitigation:**
- Open governance board (3–5 respected community members)
- Published, versioned scoring rubrics
- SaaSquach competes under the same submission process as everyone else
- Consider a separate "C&R reference architecture" showcase vs. the open leaderboard

---

## Build Plan (Draft)

### Phase 1 — Problem Set Design (Q2 2026)
- Bruno + Ethan design the enterprise tier problem sets
- Rocky validates against real supply chain/finance scenarios
- Publish problem set publicly for community feedback before scoring goes live

### Phase 2 — Evaluation Harness (Q2/Q3 2026)
- Q builds the submission format parser and auto-scoring harness
- Bruno designs the human-scoring rubric methodology
- Alpha: run C&R's own stack through it first

### Phase 3 — Private Beta (Q3 2026)
- Invite 10–20 known multi-agent builders to submit
- Validate scoring methodology against community feedback
- Approach Mistral and 1–2 model providers for co-sponsorship

### Phase 4 — Public Launch (Q4 2026)
- Public leaderboard goes live
- Press: "The first public benchmark for agent teams, not just models"
- Certification program opens

---

## Domain

**pipelinescore.ai** — check availability. Alternatives: AgentLeaderboard.ai, TeamBench.ai, StackBench.ai

---

## Why Charles & Roe Owns This

Not Anthropic. Not a VC-backed AI startup. An operator who built a production multi-agent stack to solve real enterprise problems and iterated on it weekly. That's the credibility no one else in this space has right now. The neutrality argument is actually stronger coming from a practitioner than from a lab.

---

## Related Projects

- SaaSquach AI (`projects/saasquach-ai/`) — primary product that benefits from leaderboard positioning
- Agent architecture docs (`projects/charles-and-roe/infrastructure/`) — the stack that becomes the reference submission
- Marketing infrastructure (`marketing/`) — leaderboard launch is a major content event

---
*Next step: revisit Q2 2026. Assign Rocky to competitive landscape research when ready to move.*
