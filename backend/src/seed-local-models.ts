// Top ~100 local LLM models trending on Ollama / LM Studio / Hugging Face
// as of mid-2026. Curated by hand to reflect what's actually popular in
// r/LocalLLaMA / HN / dev communities — not just everything ever released.
//
// `target_score` is a rough plausible PipelineScore for the model on
// average hardware. Synthetic submissions wobble around it by ~3-8 points.
// Big-model scores skew higher (more capable) but their speed scores tank
// on consumer hardware, which the hardware-tag distribution captures.

export type LocalSeedModel = {
  slug: string;
  display_name: string;
  provider: string;        // family/lab name for the leaderboard column
  provider_model: string;  // canonical ID people pass to --model
  family: string;
  released_at: string;
  context_window: number;
  // 0-100 expected average composite score. Submissions vary +/-6 points around this.
  target_score: number;
  // 'small' (<=4B): runs on anything    -> CPU + mobile + cloud
  // 'medium' (5-15B): runs on most rigs -> 16GB+ Mac, midrange GPU, A100
  // 'large' (16-40B): needs serious rig -> Mac 64GB+, RTX 4090, A100
  // 'huge'  (>=40B): top hardware only  -> Mac Ultra, multi-GPU, H100
  size_class: 'small' | 'medium' | 'large' | 'huge';
};

export const LOCAL_MODELS: LocalSeedModel[] = [
  // ---- LLAMA FAMILY (Meta) ----
  { slug: 'llama-3-2-1b-instruct',  display_name: 'Llama 3.2 1B Instruct',  provider: 'meta', provider_model: 'llama-3.2-1b-instruct',  family: 'llama', released_at: '2024-09-25', context_window: 128000, target_score: 38.4, size_class: 'small' },
  { slug: 'llama-3-2-3b-instruct',  display_name: 'Llama 3.2 3B Instruct',  provider: 'meta', provider_model: 'llama-3.2-3b-instruct',  family: 'llama', released_at: '2024-09-25', context_window: 128000, target_score: 52.1, size_class: 'small' },
  { slug: 'llama-3-1-8b-instruct',  display_name: 'Llama 3.1 8B Instruct',  provider: 'meta', provider_model: 'llama-3.1-8b-instruct',  family: 'llama', released_at: '2024-07-23', context_window: 128000, target_score: 64.7, size_class: 'medium' },
  { slug: 'llama-3-1-70b-instruct', display_name: 'Llama 3.1 70B Instruct', provider: 'meta', provider_model: 'llama-3.1-70b-instruct', family: 'llama', released_at: '2024-07-23', context_window: 128000, target_score: 78.9, size_class: 'huge' },
  { slug: 'llama-3-3-70b-instruct', display_name: 'Llama 3.3 70B Instruct', provider: 'meta', provider_model: 'llama-3.3-70b-instruct', family: 'llama', released_at: '2024-12-06', context_window: 128000, target_score: 81.6, size_class: 'huge' },
  // Llama 4 not yet released as open weights as of mid-2025 — leaving out
  // of the sample seed to keep every row truthfully downloadable today.

  // ---- QWEN FAMILY (Alibaba) ----
  { slug: 'qwen-2-5-0-5b-instruct', display_name: 'Qwen 2.5 0.5B Instruct', provider: 'alibaba', provider_model: 'qwen2.5-0.5b-instruct', family: 'qwen', released_at: '2024-09-19', context_window: 32768,  target_score: 31.2, size_class: 'small' },
  { slug: 'qwen-2-5-1-5b-instruct', display_name: 'Qwen 2.5 1.5B Instruct', provider: 'alibaba', provider_model: 'qwen2.5-1.5b-instruct', family: 'qwen', released_at: '2024-09-19', context_window: 32768,  target_score: 44.7, size_class: 'small' },
  { slug: 'qwen-2-5-3b-instruct',   display_name: 'Qwen 2.5 3B Instruct',   provider: 'alibaba', provider_model: 'qwen2.5-3b-instruct',   family: 'qwen', released_at: '2024-09-19', context_window: 32768,  target_score: 56.2, size_class: 'small' },
  { slug: 'qwen-2-5-7b-instruct',   display_name: 'Qwen 2.5 7B Instruct',   provider: 'alibaba', provider_model: 'qwen2.5-7b-instruct',   family: 'qwen', released_at: '2024-09-19', context_window: 131072, target_score: 67.8, size_class: 'medium' },
  { slug: 'qwen-2-5-14b-instruct',  display_name: 'Qwen 2.5 14B Instruct',  provider: 'alibaba', provider_model: 'qwen2.5-14b-instruct',  family: 'qwen', released_at: '2024-09-19', context_window: 131072, target_score: 73.4, size_class: 'medium' },
  { slug: 'qwen-2-5-32b-instruct',  display_name: 'Qwen 2.5 32B Instruct',  provider: 'alibaba', provider_model: 'qwen2.5-32b-instruct',  family: 'qwen', released_at: '2024-09-19', context_window: 131072, target_score: 78.6, size_class: 'large' },
  { slug: 'qwen-2-5-72b-instruct',  display_name: 'Qwen 2.5 72B Instruct',  provider: 'alibaba', provider_model: 'qwen2.5-72b-instruct',  family: 'qwen', released_at: '2024-09-19', context_window: 131072, target_score: 82.4, size_class: 'huge' },
  { slug: 'qwen-2-5-coder-1-5b',    display_name: 'Qwen 2.5 Coder 1.5B',    provider: 'alibaba', provider_model: 'qwen2.5-coder-1.5b',    family: 'qwen', released_at: '2024-11-12', context_window: 131072, target_score: 51.3, size_class: 'small' },
  { slug: 'qwen-2-5-coder-7b',      display_name: 'Qwen 2.5 Coder 7B',      provider: 'alibaba', provider_model: 'qwen2.5-coder-7b',      family: 'qwen', released_at: '2024-11-12', context_window: 131072, target_score: 71.9, size_class: 'medium' },
  { slug: 'qwen-2-5-coder-32b',     display_name: 'Qwen 2.5 Coder 32B',     provider: 'alibaba', provider_model: 'qwen2.5-coder-32b',     family: 'qwen', released_at: '2024-11-12', context_window: 131072, target_score: 82.1, size_class: 'large' },
  { slug: 'qwen-3-4b-instruct',     display_name: 'Qwen 3 4B Instruct',     provider: 'alibaba', provider_model: 'qwen3-4b-instruct',     family: 'qwen', released_at: '2025-06-15', context_window: 131072, target_score: 62.5, size_class: 'small' },
  { slug: 'qwen-3-8b-instruct',     display_name: 'Qwen 3 8B Instruct',     provider: 'alibaba', provider_model: 'qwen3-8b-instruct',     family: 'qwen', released_at: '2025-06-15', context_window: 131072, target_score: 71.2, size_class: 'medium' },
  { slug: 'qwen-3-14b-instruct',    display_name: 'Qwen 3 14B Instruct',    provider: 'alibaba', provider_model: 'qwen3-14b-instruct',    family: 'qwen', released_at: '2025-06-15', context_window: 131072, target_score: 76.0, size_class: 'medium' },
  { slug: 'qwen-3-32b-instruct',    display_name: 'Qwen 3 32B Instruct',    provider: 'alibaba', provider_model: 'qwen3-32b-instruct',    family: 'qwen', released_at: '2025-06-15', context_window: 131072, target_score: 80.4, size_class: 'large' },
  { slug: 'qwen-3-72b-instruct',    display_name: 'Qwen 3 72B Instruct',    provider: 'alibaba', provider_model: 'qwen3-72b-instruct',    family: 'qwen', released_at: '2025-06-15', context_window: 131072, target_score: 84.0, size_class: 'huge' },
  { slug: 'qwen-3-235b-a22b',       display_name: 'Qwen 3 235B-A22B MoE',   provider: 'alibaba', provider_model: 'qwen3-235b-a22b',       family: 'qwen', released_at: '2025-08-30', context_window: 131072, target_score: 86.5, size_class: 'huge' },

  // ---- DEEPSEEK FAMILY ----
  { slug: 'deepseek-v2-5',          display_name: 'DeepSeek V2.5',          provider: 'deepseek', provider_model: 'deepseek-v2.5',           family: 'deepseek', released_at: '2024-09-05', context_window: 128000, target_score: 79.2, size_class: 'huge' },
  { slug: 'deepseek-v3',            display_name: 'DeepSeek V3 671B-A37B',  provider: 'deepseek', provider_model: 'deepseek-v3',             family: 'deepseek', released_at: '2024-12-26', context_window: 128000, target_score: 84.7, size_class: 'huge' },
  { slug: 'deepseek-coder-v2-16b',  display_name: 'DeepSeek Coder V2 16B',  provider: 'deepseek', provider_model: 'deepseek-coder-v2-16b',   family: 'deepseek', released_at: '2024-06-17', context_window: 163840, target_score: 75.6, size_class: 'large' },
  { slug: 'deepseek-coder-v2-236b', display_name: 'DeepSeek Coder V2 236B', provider: 'deepseek', provider_model: 'deepseek-coder-v2-236b',  family: 'deepseek', released_at: '2024-06-17', context_window: 163840, target_score: 83.9, size_class: 'huge' },
  { slug: 'deepseek-r1-distill-llama-8b', display_name: 'DeepSeek R1 Distill Llama 8B', provider: 'deepseek', provider_model: 'deepseek-r1-distill-llama-8b', family: 'deepseek', released_at: '2025-01-20', context_window: 128000, target_score: 71.3, size_class: 'medium' },
  { slug: 'deepseek-r1-distill-qwen-32b', display_name: 'DeepSeek R1 Distill Qwen 32B', provider: 'deepseek', provider_model: 'deepseek-r1-distill-qwen-32b', family: 'deepseek', released_at: '2025-01-20', context_window: 131072, target_score: 81.8, size_class: 'large' },
  { slug: 'deepseek-r1',            display_name: 'DeepSeek R1 671B-A37B',  provider: 'deepseek', provider_model: 'deepseek-r1',             family: 'deepseek', released_at: '2025-01-20', context_window: 128000, target_score: 86.4, size_class: 'huge' },
  // DeepSeek V4 not yet released — sample seed sticks to V3 + R1 which are the
  // current state-of-the-art downloadable releases.

  // ---- MISTRAL FAMILY ----
  { slug: 'mistral-7b-instruct-v0-3',  display_name: 'Mistral 7B Instruct v0.3', provider: 'mistral', provider_model: 'mistral-7b-instruct-v0.3',  family: 'mistral', released_at: '2024-05-22', context_window: 32768,  target_score: 60.4, size_class: 'medium' },
  { slug: 'mistral-nemo-12b-instruct', display_name: 'Mistral Nemo 12B Instruct', provider: 'mistral', provider_model: 'mistral-nemo-12b-instruct', family: 'mistral', released_at: '2024-07-18', context_window: 131072, target_score: 68.2, size_class: 'medium' },
  { slug: 'mistral-small-24b-instruct', display_name: 'Mistral Small 24B Instruct', provider: 'mistral', provider_model: 'mistral-small-24b-instruct', family: 'mistral', released_at: '2025-01-30', context_window: 32768, target_score: 74.7, size_class: 'large' },
  { slug: 'codestral-22b',             display_name: 'Codestral 22B',            provider: 'mistral', provider_model: 'codestral-22b',             family: 'mistral', released_at: '2024-05-29', context_window: 32768,  target_score: 77.5, size_class: 'large' },
  { slug: 'mixtral-8x7b-instruct',     display_name: 'Mixtral 8x7B Instruct',    provider: 'mistral', provider_model: 'mixtral-8x7b-instruct',     family: 'mistral', released_at: '2023-12-11', context_window: 32768,  target_score: 70.8, size_class: 'huge' },
  { slug: 'mixtral-8x22b-instruct',    display_name: 'Mixtral 8x22B Instruct',   provider: 'mistral', provider_model: 'mixtral-8x22b-instruct',    family: 'mistral', released_at: '2024-04-10', context_window: 65536,  target_score: 78.3, size_class: 'huge' },
  { slug: 'mistral-large-2',           display_name: 'Mistral Large 2',          provider: 'mistral', provider_model: 'mistral-large-2-2026',       family: 'mistral', released_at: '2026-02-28', context_window: 128000, target_score: 79.4, size_class: 'huge' },
  { slug: 'devstral-small-24b',        display_name: 'Devstral Small 24B',       provider: 'mistral', provider_model: 'devstral-small-24b',         family: 'mistral', released_at: '2025-05-21', context_window: 131072, target_score: 76.2, size_class: 'large' },

  // ---- GEMMA FAMILY (Google) ----
  { slug: 'gemma-2-2b-it',  display_name: 'Gemma 2 2B IT',   provider: 'google', provider_model: 'gemma-2-2b-it',   family: 'gemma', released_at: '2024-07-31', context_window: 8192, target_score: 47.3, size_class: 'small' },
  { slug: 'gemma-2-9b-it',  display_name: 'Gemma 2 9B IT',   provider: 'google', provider_model: 'gemma-2-9b-it',   family: 'gemma', released_at: '2024-06-27', context_window: 8192, target_score: 66.1, size_class: 'medium' },
  { slug: 'gemma-2-27b-it', display_name: 'Gemma 2 27B IT',  provider: 'google', provider_model: 'gemma-2-27b-it',  family: 'gemma', released_at: '2024-06-27', context_window: 8192, target_score: 73.4, size_class: 'large' },
  { slug: 'gemma-3-4b-it',  display_name: 'Gemma 3 4B IT',   provider: 'google', provider_model: 'gemma-3-4b-it',   family: 'gemma', released_at: '2025-03-12', context_window: 131072, target_score: 60.7, size_class: 'small' },
  { slug: 'gemma-3-12b-it', display_name: 'Gemma 3 12B IT',  provider: 'google', provider_model: 'gemma-3-12b-it',  family: 'gemma', released_at: '2025-03-12', context_window: 131072, target_score: 71.8, size_class: 'medium' },
  { slug: 'gemma-3-27b-it', display_name: 'Gemma 3 27B IT',  provider: 'google', provider_model: 'gemma-3-27b-it',  family: 'gemma', released_at: '2025-03-12', context_window: 131072, target_score: 76.9, size_class: 'large' },

  // ---- PHI FAMILY (Microsoft) ----
  { slug: 'phi-3-mini-3-8b',   display_name: 'Phi 3 Mini 3.8B',   provider: 'microsoft', provider_model: 'phi-3-mini-3.8b-128k', family: 'phi', released_at: '2024-04-23', context_window: 128000, target_score: 54.7, size_class: 'small' },
  { slug: 'phi-3-small-7b',    display_name: 'Phi 3 Small 7B',    provider: 'microsoft', provider_model: 'phi-3-small-7b',       family: 'phi', released_at: '2024-05-21', context_window: 128000, target_score: 62.8, size_class: 'medium' },
  { slug: 'phi-3-5-mini',      display_name: 'Phi 3.5 Mini',      provider: 'microsoft', provider_model: 'phi-3.5-mini',         family: 'phi', released_at: '2024-08-20', context_window: 131072, target_score: 58.1, size_class: 'small' },
  { slug: 'phi-3-5-moe',       display_name: 'Phi 3.5 MoE 42B',   provider: 'microsoft', provider_model: 'phi-3.5-moe-42b',      family: 'phi', released_at: '2024-08-20', context_window: 131072, target_score: 69.5, size_class: 'large' },
  { slug: 'phi-4',             display_name: 'Phi 4 14B',         provider: 'microsoft', provider_model: 'phi-4-14b',            family: 'phi', released_at: '2024-12-12', context_window: 16384,  target_score: 71.6, size_class: 'medium' },

  // ---- YI FAMILY (01.ai) ----
  { slug: 'yi-1-5-6b-chat',  display_name: 'Yi 1.5 6B Chat',  provider: 'yi', provider_model: 'yi-1.5-6b-chat',  family: 'yi', released_at: '2024-05-13', context_window: 32768, target_score: 60.1, size_class: 'medium' },
  { slug: 'yi-1-5-9b-chat',  display_name: 'Yi 1.5 9B Chat',  provider: 'yi', provider_model: 'yi-1.5-9b-chat',  family: 'yi', released_at: '2024-05-13', context_window: 32768, target_score: 65.4, size_class: 'medium' },
  { slug: 'yi-1-5-34b-chat', display_name: 'Yi 1.5 34B Chat', provider: 'yi', provider_model: 'yi-1.5-34b-chat', family: 'yi', released_at: '2024-05-13', context_window: 32768, target_score: 74.6, size_class: 'large' },
  { slug: 'yi-coder-9b',     display_name: 'Yi Coder 9B',     provider: 'yi', provider_model: 'yi-coder-9b',     family: 'yi', released_at: '2024-09-04', context_window: 131072, target_score: 67.3, size_class: 'medium' },

  // ---- COMMAND R / COMMAND R+ (Cohere) ----
  { slug: 'command-r',     display_name: 'Command R',     provider: 'cohere', provider_model: 'command-r-08-2024',     family: 'command', released_at: '2024-08-30', context_window: 128000, target_score: 67.8, size_class: 'large' },
  { slug: 'command-r-plus', display_name: 'Command R+',   provider: 'cohere', provider_model: 'command-r-plus-08-2026', family: 'command', released_at: '2026-03-20', context_window: 128000, target_score: 75.4, size_class: 'huge' },
  { slug: 'command-a',     display_name: 'Command A',     provider: 'cohere', provider_model: 'command-a-2025-03',     family: 'command', released_at: '2025-03-13', context_window: 256000, target_score: 81.2, size_class: 'huge' },

  // ---- CODING-SPECIFIC ----
  { slug: 'starcoder2-3b',       display_name: 'StarCoder2 3B',       provider: 'bigcode',     provider_model: 'starcoder2-3b',         family: 'starcoder',  released_at: '2024-02-28', context_window: 16384,  target_score: 49.8, size_class: 'small' },
  { slug: 'starcoder2-7b',       display_name: 'StarCoder2 7B',       provider: 'bigcode',     provider_model: 'starcoder2-7b',         family: 'starcoder',  released_at: '2024-02-28', context_window: 16384,  target_score: 58.7, size_class: 'medium' },
  { slug: 'starcoder2-15b',      display_name: 'StarCoder2 15B',      provider: 'bigcode',     provider_model: 'starcoder2-15b',        family: 'starcoder',  released_at: '2024-02-28', context_window: 16384,  target_score: 69.2, size_class: 'medium' },
  { slug: 'codegemma-7b',        display_name: 'CodeGemma 7B',        provider: 'google',      provider_model: 'codegemma-7b',          family: 'gemma',      released_at: '2024-04-09', context_window: 8192,   target_score: 64.3, size_class: 'medium' },
  { slug: 'codellama-34b-instruct', display_name: 'Code Llama 34B Instruct', provider: 'meta',  provider_model: 'codellama-34b-instruct', family: 'llama',    released_at: '2024-01-29', context_window: 16384, target_score: 67.5, size_class: 'large' },

  // ---- KIMI / MOONSHOT ----
  { slug: 'kimi-k2-instruct',   display_name: 'Kimi K2 Instruct',     provider: 'moonshot',    provider_model: 'kimi-k2-instruct',      family: 'kimi',       released_at: '2024-11-15', context_window: 200000, target_score: 76.4, size_class: 'huge' },

  // ---- SMALL UTILITY ----
  { slug: 'smollm-1-7b',         display_name: 'SmolLM 1.7B',         provider: 'huggingface', provider_model: 'smollm-1.7b',           family: 'smollm',     released_at: '2024-07-15', context_window: 2048,   target_score: 32.6, size_class: 'small' },
  { slug: 'smollm2-1-7b',        display_name: 'SmolLM2 1.7B',        provider: 'huggingface', provider_model: 'smollm2-1.7b',          family: 'smollm',     released_at: '2024-11-04', context_window: 8192,   target_score: 43.2, size_class: 'small' },
  { slug: 'tinyllama-1-1b',      display_name: 'TinyLlama 1.1B Chat', provider: 'community',   provider_model: 'tinyllama-1.1b-chat',   family: 'llama',      released_at: '2024-01-04', context_window: 2048,   target_score: 28.4, size_class: 'small' },

  // ---- VISION ----
  { slug: 'llava-1-6-mistral-7b',  display_name: 'LLaVA 1.6 Mistral 7B',  provider: 'community', provider_model: 'llava-1.6-mistral-7b',  family: 'llava',    released_at: '2024-01-30', context_window: 4096,   target_score: 56.2, size_class: 'medium' },
  { slug: 'llava-onevision-7b',    display_name: 'LLaVA OneVision 7B',    provider: 'community', provider_model: 'llava-onevision-7b',    family: 'llava',    released_at: '2024-08-07', context_window: 8192,   target_score: 62.8, size_class: 'medium' },
  { slug: 'minicpm-v-2-6',         display_name: 'MiniCPM-V 2.6 8B',      provider: 'openbmb',   provider_model: 'minicpm-v-2.6',         family: 'minicpm',  released_at: '2024-08-04', context_window: 32768,  target_score: 64.1, size_class: 'medium' },
  { slug: 'qwen-2-5-vl-7b',        display_name: 'Qwen 2.5 VL 7B',        provider: 'alibaba',   provider_model: 'qwen2.5-vl-7b',         family: 'qwen',     released_at: '2025-01-26', context_window: 131072, target_score: 66.9, size_class: 'medium' },
  { slug: 'qwen-2-5-vl-72b',       display_name: 'Qwen 2.5 VL 72B',       provider: 'alibaba',   provider_model: 'qwen2.5-vl-72b',        family: 'qwen',     released_at: '2025-01-26', context_window: 131072, target_score: 80.2, size_class: 'huge' },

  // ---- HERMES / NOUS ----
  { slug: 'hermes-3-llama-3-1-8b',  display_name: 'Hermes 3 Llama 3.1 8B',  provider: 'nous',  provider_model: 'hermes-3-llama-3.1-8b',  family: 'hermes', released_at: '2024-08-16', context_window: 128000, target_score: 66.1, size_class: 'medium' },
  { slug: 'hermes-3-llama-3-1-70b', display_name: 'Hermes 3 Llama 3.1 70B', provider: 'nous',  provider_model: 'hermes-3-llama-3.1-70b', family: 'hermes', released_at: '2024-08-16', context_window: 128000, target_score: 79.4, size_class: 'huge' },
  { slug: 'hermes-3-llama-3-1-405b', display_name: 'Hermes 3 Llama 3.1 405B', provider: 'nous', provider_model: 'hermes-3-llama-3.1-405b', family: 'hermes', released_at: '2024-08-16', context_window: 128000, target_score: 83.5, size_class: 'huge' },

  // ---- ABLITERATED / UNCENSORED ----
  { slug: 'dolphin-2-9-llama-3-8b', display_name: 'Dolphin 2.9 Llama 3 8B', provider: 'cognitivecomputations', provider_model: 'dolphin-2.9-llama-3-8b', family: 'dolphin', released_at: '2024-05-20', context_window: 8192, target_score: 64.5, size_class: 'medium' },
  { slug: 'dolphin-3-0-llama-3-1-8b', display_name: 'Dolphin 3.0 Llama 3.1 8B', provider: 'cognitivecomputations', provider_model: 'dolphin-3.0-llama-3.1-8b', family: 'dolphin', released_at: '2025-01-04', context_window: 131072, target_score: 65.8, size_class: 'medium' },

  // ---- WIZARD / VICUNA / OPENCHAT ----
  { slug: 'wizardlm-2-8x22b',    display_name: 'WizardLM 2 8x22B',     provider: 'microsoft',  provider_model: 'wizardlm-2-8x22b',    family: 'wizardlm', released_at: '2024-04-15', context_window: 65536,  target_score: 79.1, size_class: 'huge' },
  { slug: 'openchat-3-6-8b',     display_name: 'OpenChat 3.6 8B',      provider: 'openchat',   provider_model: 'openchat-3.6-8b',     family: 'openchat', released_at: '2024-05-15', context_window: 8192,   target_score: 65.7, size_class: 'medium' },

  // ---- INTERNLM / SOLAR / DBRX ----
  { slug: 'internlm-2-5-7b-chat',    display_name: 'InternLM 2.5 7B Chat',    provider: 'internlm',   provider_model: 'internlm-2.5-7b-chat',    family: 'internlm', released_at: '2024-07-03', context_window: 1000000, target_score: 65.3, size_class: 'medium' },
  { slug: 'internlm-2-5-20b-chat',   display_name: 'InternLM 2.5 20B Chat',   provider: 'internlm',   provider_model: 'internlm-2.5-20b-chat',   family: 'internlm', released_at: '2024-08-21', context_window: 32768,   target_score: 72.0, size_class: 'large' },
  { slug: 'solar-10-7b-instruct',    display_name: 'SOLAR 10.7B Instruct',    provider: 'upstage',    provider_model: 'solar-10.7b-instruct',    family: 'solar',    released_at: '2023-12-22', context_window: 4096,    target_score: 65.9, size_class: 'medium' },
  { slug: 'dbrx-instruct',           display_name: 'DBRX Instruct 132B-MoE',  provider: 'databricks', provider_model: 'dbrx-instruct',           family: 'dbrx',     released_at: '2024-03-27', context_window: 32768,   target_score: 76.5, size_class: 'huge' },

  // ---- AYA / GROK / OTHER OPEN ----
  { slug: 'aya-23-8b',              display_name: 'Aya 23 8B',               provider: 'cohere',     provider_model: 'aya-23-8b',              family: 'aya',     released_at: '2024-05-23', context_window: 8192, target_score: 62.4, size_class: 'medium' },
  { slug: 'aya-23-35b',             display_name: 'Aya 23 35B',              provider: 'cohere',     provider_model: 'aya-23-35b',             family: 'aya',     released_at: '2024-05-23', context_window: 8192, target_score: 72.6, size_class: 'large' },
  { slug: 'grok-1',                 display_name: 'Grok-1 314B',             provider: 'xai',        provider_model: 'grok-1',                 family: 'grok',    released_at: '2024-03-17', context_window: 8192, target_score: 68.9, size_class: 'huge' },

  // ---- FALCON / ZAMBA ----
  { slug: 'falcon-3-10b-instruct',  display_name: 'Falcon 3 10B Instruct',   provider: 'tii',        provider_model: 'falcon-3-10b-instruct',  family: 'falcon',  released_at: '2024-12-17', context_window: 32768,   target_score: 67.1, size_class: 'medium' },
  { slug: 'falcon-mamba-7b',        display_name: 'Falcon Mamba 7B',         provider: 'tii',        provider_model: 'falcon-mamba-7b',        family: 'falcon',  released_at: '2024-08-12', context_window: 8192,    target_score: 61.0, size_class: 'medium' },
  { slug: 'zamba-2-7b-instruct',    display_name: 'Zamba 2 7B Instruct',     provider: 'zyphra',     provider_model: 'zamba-2-7b-instruct',    family: 'zamba',   released_at: '2024-10-15', context_window: 32768,   target_score: 62.7, size_class: 'medium' },

  // ---- GRANITE (IBM) ----
  { slug: 'granite-3-1-2b-instruct',  display_name: 'Granite 3.1 2B Instruct',  provider: 'ibm', provider_model: 'granite-3.1-2b-instruct',  family: 'granite', released_at: '2024-12-18', context_window: 131072, target_score: 50.3, size_class: 'small' },
  { slug: 'granite-3-1-8b-instruct',  display_name: 'Granite 3.1 8B Instruct',  provider: 'ibm', provider_model: 'granite-3.1-8b-instruct',  family: 'granite', released_at: '2024-12-18', context_window: 131072, target_score: 65.8, size_class: 'medium' },

  // ---- GLM (Zhipu) ----
  { slug: 'glm-4-9b-chat',           display_name: 'GLM 4 9B Chat',           provider: 'zhipu',      provider_model: 'glm-4-9b-chat',           family: 'glm',     released_at: '2024-06-04', context_window: 131072, target_score: 67.2, size_class: 'medium' },
  { slug: 'glm-4-plus',              display_name: 'GLM 4 Plus',              provider: 'zhipu',      provider_model: 'glm-4-plus',              family: 'glm',     released_at: '2024-08-29', context_window: 131072, target_score: 78.4, size_class: 'huge' },

  // ---- EMBEDDING & RERANK (not benchmarked here but trending on LM Studio) ----
  // Skipped — these aren't chat models, PipelineScore tasks don't apply.

  // ---- COMMUNITY TRENDING (Hugging Face top this month) ----
  { slug: 'magnum-v4-72b',           display_name: 'Magnum V4 72B',           provider: 'community', provider_model: 'magnum-v4-72b',          family: 'magnum',   released_at: '2024-10-24', context_window: 131072, target_score: 73.8, size_class: 'huge' },
  { slug: 'sao-10k-l3-70b-euryale',  display_name: 'L3 70B Euryale',          provider: 'community', provider_model: 'l3-70b-euryale-v2.1',     family: 'community', released_at: '2024-06-12', context_window: 8192,   target_score: 72.1, size_class: 'huge' },
];

// Per-size hardware pool. Random selection from the size-appropriate pool
// when generating a sample submission, so a 1B model doesn't show up on H100
// (overkill) and a 405B model doesn't show up on M1 Air (impossible).
export const HARDWARE_POOL: Record<LocalSeedModel['size_class'], string[]> = {
  small: [
    'm1-air-8gb',
    'm2-air-16gb',
    'm3-air-16gb',
    'rtx-3060-12gb',
    'ryzen-7950x-cpu-only',
    'macbook-pro-m3-pro-18gb',
    'snapdragon-x-elite-32gb',
  ],
  medium: [
    'm2-pro-16gb',
    'm3-pro-36gb',
    'rtx-3060-12gb',
    'rtx-3080-10gb',
    'rtx-4070-12gb',
    'rtx-4080-16gb',
    'ryzen-7950x-cpu-only',
    'macbook-pro-m3-pro-18gb',
  ],
  large: [
    'm3-max-128gb',
    'm3-max-64gb',
    'rtx-4090-24gb',
    'rtx-3090-24gb',
    'rtx-4080-16gb-offload',
    'a100-40gb',
    'a6000-48gb',
    'ryzen-7950x-rtx-3090',
  ],
  huge: [
    'm2-ultra-192gb',
    'm3-ultra-256gb',
    'a100-80gb',
    'h100-80gb',
    'h200-141gb',
    '2x-rtx-4090',
    '4x-rtx-3090',
    'b200-192gb',
    'dgx-h100',
    'cloud-api',
  ],
};
