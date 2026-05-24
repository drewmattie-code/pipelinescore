# Contributing to PipelineScore

Thanks for considering a contribution. PipelineScore is a small, opinionated project — focused contributions land fastest.

## Things we actually need help on

In priority order:

### 1. More benchmark tasks
The 25-task suite in [`benchmarks/tasks-v1.json`](benchmarks/tasks-v1.json) is intentionally narrow for v1. We want:
- Tool-use tasks with realistic schemas (OpenAI / Anthropic function-call formats)
- RAG grounding tasks with real (non-fabricated) source documents
- Reasoning tasks that don't appear in MMLU / GSM8K / SWE-Bench (anti-contamination)
- Speed tasks calibrated for 8B–70B models on 24GB consumer GPUs

PR a single task to start. Format:
```json
{
  "id": "<category>-<short-name>-<n>",
  "category": "code | reason | write | tool_use | rag | speed",
  "difficulty": 1-3,
  "prompt": "...",
  "judge_type": "exact_match | passes_tests | rubric",
  "rubric": ["list", "of", "scoring", "criteria"]
}
```

### 2. More local server endpoints
[`web/src/app/run/page.tsx`](web/src/app/run/page.tsx) lists Ollama, LM Studio, llama.cpp, MLX-Omni, LiteLLM. We want to confirm + add:
- vLLM (port 8000 by default)
- TGI / Text Generation Inference
- Ramalama
- LocalAI
- Jan.ai
- ONNX Runtime
- TensorRT-LLM

If you've tested PipelineScore against any of these, PR a port + a short verification note.

### 3. Hardware tags we're missing
[`backend/src/seed-local-models.ts`](backend/src/seed-local-models.ts) has the `HARDWARE_POOL`. Pop your rig in. Examples we already have: `m3-max-128gb`, `rtx-4090-24gb`, `a100-80gb`, `cloud-api`. Examples we want: `intel-arc-a770`, `radeon-7900xtx`, `jetson-orin-64gb`, multi-GPU layouts, custom dataconnect setups.

### 4. Bug reports
File an issue with:
- The exact CLI command you ran
- The nickname / model / hardware combo
- The actual output + the expected output
- `--cli-version` if known

## Workflow

1. **Open an issue first** for anything non-trivial (>30 LOC). Saves wasted work.
2. **Fork + branch off `main`**. Name the branch `feature/<thing>` or `fix/<thing>`.
3. **Run `npx turbo typecheck`** before pushing — we keep TypeScript clean across all 4 packages (backend, cli, mcp, web).
4. **One commit per logical change**. We squash on merge but readable history helps review.
5. **PR description**: what + why + how-to-verify.

## Code style

- TypeScript strict mode. No `any` without a `// @ts-expect-error` + reason comment.
- Functions over classes unless lifecycle requires class.
- 2-space indent. Default Prettier settings.
- Comments explain *why*, not *what*. Code shows *what*.

## License

By contributing, you agree your work is licensed under Apache 2.0 (see [LICENSE](LICENSE)).

## Code of conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). TL;DR: be a person.
