# PipelineScore Methodology v2

> Status: v2 spec, 2026-06-09. Supersedes the v1 scoring described in the taxonomy. v1 and v2 results stay comparable because every submission is tagged with its `testpack_version`; the leaderboard distinguishes them.
> Author: Drew Mattie, SaaSquach AI Labs (a division of Charles & Roe Inc.).

## Why v2

v1 is a clean first cut and its hardware-aware framing (a score tied to the machine the model ran on) is the part nobody else does. v2 keeps that spine and fixes the five things that kept v1 from being a credible ranking instrument:

1. **Sample too small to rank.** Five tasks per category means one bad task moves a category roughly twenty points, and v1 reported a bare number with no uncertainty. v2 reports a **confidence band** on every category and on the composite, computed from the per-task spread and the sample size, so two models that are statistically tied look tied.
2. **Most tasks graded by one small model.** v1 had 60 percent of tasks rubric-graded by a single Haiku-class judge at temperature 0, which has a real ceiling and a style bias on frontier outputs. v2 uses **self-consistency** (grade each rubric task several times and take the median, with the spread feeding the confidence band) and a **configurable, optionally ensembled judge**.
3. **Speed rewarded terseness.** v1 speed was `100 - p50_latency/100`, so a model that wrote shorter answers scored higher regardless of hardware. v2 measures **throughput (tokens per second)**, which is a rate and therefore length-independent.
4. **Public static tasks are gameable.** All v1 tasks live in the public repo, so a model can be trained on them or a user can pre-tune. v2 defines a **public community set** plus a **private, rotating, held-out set** used for canonical lab-verified runs (mechanism below; the held-out content is never published).
5. **One composite hid the shape.** v2 **leads with the per-category profile** and offers **named weighting profiles** so the number reflects a use case instead of an unexplained average.

## Categories

Six dimensions: `code`, `reason`, `write`, `tool_use`, `rag` (each scored from tasks), and `speed` (derived from throughput). Task categories carry equal task counts; speed is measured across all task calls.

## Weighting profiles

The composite is a weighted average of the six category scores. v2 ships named profiles instead of one fixed weighting, because the right weighting depends on what you are using the model for. The leaderboard leads with the per-category profile and lets the viewer pick a profile for the composite ranking.

| Profile | code | reason | write | tool_use | rag | speed | For |
|---|---|---|---|---|---|---|---|
| **balanced** (default) | 0.25 | 0.20 | 0.15 | 0.15 | 0.12 | 0.13 | General use |
| **coding** | 0.40 | 0.18 | 0.05 | 0.20 | 0.07 | 0.10 | Coding assistants |
| **writing** | 0.05 | 0.20 | 0.45 | 0.05 | 0.15 | 0.10 | Drafting / content |
| **agentic** | 0.22 | 0.22 | 0.06 | 0.30 | 0.12 | 0.08 | Tool-using agents |
| **local-first** | 0.22 | 0.18 | 0.12 | 0.13 | 0.10 | 0.25 | Throughput-sensitive local runs |

A profile's weights sum to 1. If a category has no scorable tasks (for example rubric tasks skipped because no judge key was present), its weight is dropped and the remaining weights are renormalized, so the composite is always on a 0 to 100 scale.

## Task scoring

Each task is run once at temperature 0 (`max_tokens` 1024) and scored 0 to 10 by its judge:

- **Deterministic judges** (preferred, expand their share over time): `execute_python` (run the model's function against hidden test cases, all-or-nothing), `execute_python_snippet`, `exact_final_line` (regex/equality on the final line), `json_match` (structural compare). These are reproducible and judge-free.
- **Rubric judge** (for open-ended `write` / `reason` / design tasks): the task carries explicit rubric items. v2 grades each rubric task **`S` times** (default `S = 3`, env `PS_JUDGE_SAMPLES`) at a non-zero judge temperature so the samples vary, then takes the **median** score. The sample **standard deviation** is retained and folded into the category confidence band, so a task the judge is unsure about widens the band rather than silently averaging out. The judge model is configurable (env `PS_JUDGE_MODEL`, default `claude-haiku-4-5`); multiple judges can be listed for an **ensemble** (their per-task medians are averaged). A stronger judge than Haiku is recommended for grading frontier outputs.

A task's raw score is rescaled to 0 to 100 for aggregation. `passed` is raw score >= 7.

## Category scoring and confidence bands

For a category with scorable task scores `x_1..x_n` (each 0 to 100):

- **point estimate**: `mean = (1/n) * sum(x_i)`.
- **spread**: sample standard deviation `s = sqrt( sum((x_i - mean)^2) / (n - 1) )` for `n >= 2`, else `s = 0`. For rubric tasks, each task's own judge-sample variance is added in (law of total variance) so judge uncertainty is not lost.
- **standard error**: `se = s / sqrt(n)`.
- **95% confidence half-width**: `h = t(0.975, n-1) * se`, using the Student t critical value (not the normal 1.96), because `n` is small. The band is `mean ± h`, clamped to 0 to 100.

The band is the headline statistical honesty: with `n = 5` the t-multiplier is 2.776, so a noisy category shows a wide band and the path to a tighter ranking is literally "add more tasks" (the band shrinks as `1/sqrt(n)`).

## Speed (throughput)

For every task call that reports output tokens and a positive latency:

- **per-task throughput**: `tps_i = tokens_out_i / (latency_ms_i / 1000)`.
- **point estimate**: `tps_p50 = median(tps_i)`.
- **speed score**: `clamp(0, 100, 100 * tps_p50 / TPS_TARGET)` with `TPS_TARGET = 100` tokens/sec mapped to 100 points (documented anchor; linear and interpretable). Throughput is a rate, so it does not reward short answers.
- If fewer than 3 calls report token counts (some local servers do not), speed is **unscored** (`null`) rather than guessed, and its weight is renormalized out of the composite.

Time-to-first-token is a planned addition once the providers stream; it is the better latency signal for interactive use and will be reported alongside throughput.

## Tiers

Unchanged bands on the composite: TRUNK 90 to 100, MAINLINE 75 to 89, FEEDER 60 to 74, TAP 40 to 59, DRIP 0 to 39. The tier is assigned from the selected profile's composite point estimate; the band is shown next to it.

## Contamination defense: public set + private rotating held-out set

- **Public community set** (`benchmarks/tasks-vN.json`): open, reproducible, used for community submissions. These are inherently gameable and are labeled as community, not verified.
- **Private held-out set**: a separate, unpublished task pool. Canonical **lab-verified** runs draw a **deterministic, seed-rotated subset** from the held-out pool (the same rotation idea as the SGCT signed-rotating-testpack mechanism: reproducible by the lab from the seed, unpredictable to a model author because the pool is private and the subset rotates). Held-out content never ships in the public repo, so it cannot be trained on or pre-tuned against. Only runs scored against the held-out set may carry `lab_verified = true`.

This makes the trust gradient explicit: community numbers are directional, lab-verified numbers (private, rotating) are the trusted ranking.

## Score integrity

Community submissions remain client-computed and are labeled accordingly. To raise the floor, the backend should **recompute the category point estimates from the submitted per-task results** rather than trusting the client's top-line numbers, so a forged row must at least be internally consistent. Full integrity is reserved for lab-verified runs executed by the lab against the private set.

## Versioning and comparability

Every submission stores `testpack_version`. v2 introduces a new version string, so v2 scores never silently overwrite v1 comparisons; the board can filter or badge by version. A score is only ever compared within the same `(testpack_version, profile)` and, for hardware-sensitive categories, the same `hardware_tag`.

## Build phases

1. **Scoring engine (this cut):** confidence bands, throughput speed, self-consistency + configurable/ensemble judge, weighting profiles. Pure, unit-tested, runs on the existing tasks immediately.
2. **Surfacing:** backend stores the v2 detail (band, per-profile, throughput) and the web leads with the per-category profile, shows bands, and offers the profile switcher.
3. **Corpus expansion:** grow each category toward 12 to 15 tasks, shifting the mix toward deterministic judges, to tighten the bands.
4. **Private held-out + rotation:** stand up the private pool and the seed-rotated lab-verified path.
