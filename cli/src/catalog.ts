/**
 * Local-model catalog for `pipelinescore fit`.
 *
 * Generated from the backend's hand-curated LOCAL_MODELS list (the same ~90 models
 * the leaderboard tracks), filtered to those whose id carries a parameter count —
 * without one there is no honest way to estimate whether it fits.
 *
 * Shipped with the CLI rather than fetched, because `fit` must answer in seconds
 * with zero prerequisites and no network. That is the whole point of the command:
 * the question "what can I run" arrives BEFORE the user has installed anything.
 */
export interface CatalogModel {
  id: string;      // what you'd pass to --model
  name: string;    // display
  slug: string;    // leaderboard slug
  family: string;
  params: number;  // billions
  ctx: number;     // context window
}

export const CATALOG: CatalogModel[] = [
  { id: "aya-23-8b", name: "Aya 23 8B", slug: "aya-23-8b", family: "aya", params: 8.0, ctx: 8192 },
  { id: "aya-23-35b", name: "Aya 23 35B", slug: "aya-23-35b", family: "aya", params: 35.0, ctx: 8192 },
  { id: "l3-70b-euryale-v2.1", name: "L3 70B Euryale", slug: "sao-10k-l3-70b-euryale", family: "community", params: 70.0, ctx: 8192 },
  { id: "deepseek-r1-distill-llama-8b", name: "DeepSeek R1 Distill Llama 8B", slug: "deepseek-r1-distill-llama-8b", family: "deepseek", params: 8.0, ctx: 128000 },
  { id: "deepseek-coder-v2-16b", name: "DeepSeek Coder V2 16B", slug: "deepseek-coder-v2-16b", family: "deepseek", params: 16.0, ctx: 163840 },
  { id: "deepseek-r1-distill-qwen-32b", name: "DeepSeek R1 Distill Qwen 32B", slug: "deepseek-r1-distill-qwen-32b", family: "deepseek", params: 32.0, ctx: 131072 },
  { id: "deepseek-coder-v2-236b", name: "DeepSeek Coder V2 236B", slug: "deepseek-coder-v2-236b", family: "deepseek", params: 236.0, ctx: 163840 },
  { id: "dolphin-2.9-llama-3-8b", name: "Dolphin 2.9 Llama 3 8B", slug: "dolphin-2-9-llama-3-8b", family: "dolphin", params: 8.0, ctx: 8192 },
  { id: "dolphin-3.0-llama-3.1-8b", name: "Dolphin 3.0 Llama 3.1 8B", slug: "dolphin-3-0-llama-3-1-8b", family: "dolphin", params: 8.0, ctx: 131072 },
  { id: "falcon-mamba-7b", name: "Falcon Mamba 7B", slug: "falcon-mamba-7b", family: "falcon", params: 7.0, ctx: 8192 },
  { id: "falcon-3-10b-instruct", name: "Falcon 3 10B Instruct", slug: "falcon-3-10b-instruct", family: "falcon", params: 10.0, ctx: 32768 },
  { id: "gemma-2-2b-it", name: "Gemma 2 2B IT", slug: "gemma-2-2b-it", family: "gemma", params: 2.0, ctx: 8192 },
  { id: "gemma-3-4b-it", name: "Gemma 3 4B IT", slug: "gemma-3-4b-it", family: "gemma", params: 4.0, ctx: 131072 },
  { id: "codegemma-7b", name: "CodeGemma 7B", slug: "codegemma-7b", family: "gemma", params: 7.0, ctx: 8192 },
  { id: "gemma-2-9b-it", name: "Gemma 2 9B IT", slug: "gemma-2-9b-it", family: "gemma", params: 9.0, ctx: 8192 },
  { id: "gemma-3-12b-it", name: "Gemma 3 12B IT", slug: "gemma-3-12b-it", family: "gemma", params: 12.0, ctx: 131072 },
  { id: "gemma-2-27b-it", name: "Gemma 2 27B IT", slug: "gemma-2-27b-it", family: "gemma", params: 27.0, ctx: 8192 },
  { id: "gemma-3-27b-it", name: "Gemma 3 27B IT", slug: "gemma-3-27b-it", family: "gemma", params: 27.0, ctx: 131072 },
  { id: "glm-4-9b-chat", name: "GLM 4 9B Chat", slug: "glm-4-9b-chat", family: "glm", params: 9.0, ctx: 131072 },
  { id: "granite-3.1-2b-instruct", name: "Granite 3.1 2B Instruct", slug: "granite-3-1-2b-instruct", family: "granite", params: 2.0, ctx: 131072 },
  { id: "granite-3.1-8b-instruct", name: "Granite 3.1 8B Instruct", slug: "granite-3-1-8b-instruct", family: "granite", params: 8.0, ctx: 131072 },
  { id: "hermes-3-llama-3.1-8b", name: "Hermes 3 Llama 3.1 8B", slug: "hermes-3-llama-3-1-8b", family: "hermes", params: 8.0, ctx: 128000 },
  { id: "hermes-3-llama-3.1-70b", name: "Hermes 3 Llama 3.1 70B", slug: "hermes-3-llama-3-1-70b", family: "hermes", params: 70.0, ctx: 128000 },
  { id: "hermes-3-llama-3.1-405b", name: "Hermes 3 Llama 3.1 405B", slug: "hermes-3-llama-3-1-405b", family: "hermes", params: 405.0, ctx: 128000 },
  { id: "internlm-2.5-7b-chat", name: "InternLM 2.5 7B Chat", slug: "internlm-2-5-7b-chat", family: "internlm", params: 7.0, ctx: 1000000 },
  { id: "internlm-2.5-20b-chat", name: "InternLM 2.5 20B Chat", slug: "internlm-2-5-20b-chat", family: "internlm", params: 20.0, ctx: 32768 },
  { id: "llama-3.2-1b-instruct", name: "Llama 3.2 1B Instruct", slug: "llama-3-2-1b-instruct", family: "llama", params: 1.0, ctx: 128000 },
  { id: "tinyllama-1.1b-chat", name: "TinyLlama 1.1B Chat", slug: "tinyllama-1-1b", family: "llama", params: 1.1, ctx: 2048 },
  { id: "llama-3.2-3b-instruct", name: "Llama 3.2 3B Instruct", slug: "llama-3-2-3b-instruct", family: "llama", params: 3.0, ctx: 128000 },
  { id: "llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", slug: "llama-3-1-8b-instruct", family: "llama", params: 8.0, ctx: 128000 },
  { id: "codellama-34b-instruct", name: "Code Llama 34B Instruct", slug: "codellama-34b-instruct", family: "llama", params: 34.0, ctx: 16384 },
  { id: "llama-3.1-70b-instruct", name: "Llama 3.1 70B Instruct", slug: "llama-3-1-70b-instruct", family: "llama", params: 70.0, ctx: 128000 },
  { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", slug: "llama-3-3-70b-instruct", family: "llama", params: 70.0, ctx: 128000 },
  { id: "llava-1.6-mistral-7b", name: "LLaVA 1.6 Mistral 7B", slug: "llava-1-6-mistral-7b", family: "llava", params: 7.0, ctx: 4096 },
  { id: "llava-onevision-7b", name: "LLaVA OneVision 7B", slug: "llava-onevision-7b", family: "llava", params: 7.0, ctx: 8192 },
  { id: "magnum-v4-72b", name: "Magnum V4 72B", slug: "magnum-v4-72b", family: "magnum", params: 72.0, ctx: 131072 },
  { id: "mistral-7b-instruct-v0.3", name: "Mistral 7B Instruct v0.3", slug: "mistral-7b-instruct-v0-3", family: "mistral", params: 7.0, ctx: 32768 },
  { id: "mistral-nemo-12b-instruct", name: "Mistral Nemo 12B Instruct", slug: "mistral-nemo-12b-instruct", family: "mistral", params: 12.0, ctx: 131072 },
  { id: "codestral-22b", name: "Codestral 22B", slug: "codestral-22b", family: "mistral", params: 22.0, ctx: 32768 },
  { id: "mistral-small-24b-instruct", name: "Mistral Small 24B Instruct", slug: "mistral-small-24b-instruct", family: "mistral", params: 24.0, ctx: 32768 },
  { id: "devstral-small-24b", name: "Devstral Small 24B", slug: "devstral-small-24b", family: "mistral", params: 24.0, ctx: 131072 },
  { id: "openchat-3.6-8b", name: "OpenChat 3.6 8B", slug: "openchat-3-6-8b", family: "openchat", params: 8.0, ctx: 8192 },
  { id: "phi-3-mini-3.8b-128k", name: "Phi 3 Mini 3.8B", slug: "phi-3-mini-3-8b", family: "phi", params: 3.8, ctx: 128000 },
  { id: "phi-3-small-7b", name: "Phi 3 Small 7B", slug: "phi-3-small-7b", family: "phi", params: 7.0, ctx: 128000 },
  { id: "phi-4-14b", name: "Phi 4 14B", slug: "phi-4", family: "phi", params: 14.0, ctx: 16384 },
  { id: "phi-3.5-moe-42b", name: "Phi 3.5 MoE 42B", slug: "phi-3-5-moe", family: "phi", params: 42.0, ctx: 131072 },
  { id: "qwen2.5-0.5b-instruct", name: "Qwen 2.5 0.5B Instruct", slug: "qwen-2-5-0-5b-instruct", family: "qwen", params: 0.5, ctx: 32768 },
  { id: "qwen2.5-1.5b-instruct", name: "Qwen 2.5 1.5B Instruct", slug: "qwen-2-5-1-5b-instruct", family: "qwen", params: 1.5, ctx: 32768 },
  { id: "qwen2.5-coder-1.5b", name: "Qwen 2.5 Coder 1.5B", slug: "qwen-2-5-coder-1-5b", family: "qwen", params: 1.5, ctx: 131072 },
  { id: "qwen2.5-3b-instruct", name: "Qwen 2.5 3B Instruct", slug: "qwen-2-5-3b-instruct", family: "qwen", params: 3.0, ctx: 32768 },
  { id: "qwen3-4b-instruct", name: "Qwen 3 4B Instruct", slug: "qwen-3-4b-instruct", family: "qwen", params: 4.0, ctx: 131072 },
  { id: "qwen2.5-7b-instruct", name: "Qwen 2.5 7B Instruct", slug: "qwen-2-5-7b-instruct", family: "qwen", params: 7.0, ctx: 131072 },
  { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B", slug: "qwen-2-5-coder-7b", family: "qwen", params: 7.0, ctx: 131072 },
  { id: "qwen2.5-vl-7b", name: "Qwen 2.5 VL 7B", slug: "qwen-2-5-vl-7b", family: "qwen", params: 7.0, ctx: 131072 },
  { id: "qwen3-8b-instruct", name: "Qwen 3 8B Instruct", slug: "qwen-3-8b-instruct", family: "qwen", params: 8.0, ctx: 131072 },
  { id: "qwen2.5-14b-instruct", name: "Qwen 2.5 14B Instruct", slug: "qwen-2-5-14b-instruct", family: "qwen", params: 14.0, ctx: 131072 },
  { id: "qwen3-14b-instruct", name: "Qwen 3 14B Instruct", slug: "qwen-3-14b-instruct", family: "qwen", params: 14.0, ctx: 131072 },
  { id: "qwen2.5-32b-instruct", name: "Qwen 2.5 32B Instruct", slug: "qwen-2-5-32b-instruct", family: "qwen", params: 32.0, ctx: 131072 },
  { id: "qwen2.5-coder-32b", name: "Qwen 2.5 Coder 32B", slug: "qwen-2-5-coder-32b", family: "qwen", params: 32.0, ctx: 131072 },
  { id: "qwen3-32b-instruct", name: "Qwen 3 32B Instruct", slug: "qwen-3-32b-instruct", family: "qwen", params: 32.0, ctx: 131072 },
  { id: "qwen2.5-72b-instruct", name: "Qwen 2.5 72B Instruct", slug: "qwen-2-5-72b-instruct", family: "qwen", params: 72.0, ctx: 131072 },
  { id: "qwen3-72b-instruct", name: "Qwen 3 72B Instruct", slug: "qwen-3-72b-instruct", family: "qwen", params: 72.0, ctx: 131072 },
  { id: "qwen2.5-vl-72b", name: "Qwen 2.5 VL 72B", slug: "qwen-2-5-vl-72b", family: "qwen", params: 72.0, ctx: 131072 },
  { id: "qwen3-235b-a22b", name: "Qwen 3 235B-A22B MoE", slug: "qwen-3-235b-a22b", family: "qwen", params: 235.0, ctx: 131072 },
  { id: "smollm-1.7b", name: "SmolLM 1.7B", slug: "smollm-1-7b", family: "smollm", params: 1.7, ctx: 2048 },
  { id: "smollm2-1.7b", name: "SmolLM2 1.7B", slug: "smollm2-1-7b", family: "smollm", params: 1.7, ctx: 8192 },
  { id: "solar-10.7b-instruct", name: "SOLAR 10.7B Instruct", slug: "solar-10-7b-instruct", family: "solar", params: 10.7, ctx: 4096 },
  { id: "starcoder2-3b", name: "StarCoder2 3B", slug: "starcoder2-3b", family: "starcoder", params: 3.0, ctx: 16384 },
  { id: "starcoder2-7b", name: "StarCoder2 7B", slug: "starcoder2-7b", family: "starcoder", params: 7.0, ctx: 16384 },
  { id: "starcoder2-15b", name: "StarCoder2 15B", slug: "starcoder2-15b", family: "starcoder", params: 15.0, ctx: 16384 },
  { id: "yi-1.5-6b-chat", name: "Yi 1.5 6B Chat", slug: "yi-1-5-6b-chat", family: "yi", params: 6.0, ctx: 32768 },
  { id: "yi-1.5-9b-chat", name: "Yi 1.5 9B Chat", slug: "yi-1-5-9b-chat", family: "yi", params: 9.0, ctx: 32768 },
  { id: "yi-coder-9b", name: "Yi Coder 9B", slug: "yi-coder-9b", family: "yi", params: 9.0, ctx: 131072 },
  { id: "yi-1.5-34b-chat", name: "Yi 1.5 34B Chat", slug: "yi-1-5-34b-chat", family: "yi", params: 34.0, ctx: 32768 },
  { id: "zamba-2-7b-instruct", name: "Zamba 2 7B Instruct", slug: "zamba-2-7b-instruct", family: "zamba", params: 7.0, ctx: 32768 },
];
