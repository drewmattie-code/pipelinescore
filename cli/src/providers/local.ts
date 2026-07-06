import { OpenAIProvider } from './openai.js';
import { normalizeLocalEndpoint } from '../util.js';

/**
 * Local OpenAI-compatible provider (Ollama, LM Studio, llama.cpp, vLLM, MLX,
 * LiteLLM). Defaults to http://localhost:8080/v1 if no endpoint is provided.
 * A bare origin (http://localhost:11434) gets /v1 appended — every common
 * local server keeps its OpenAI-compatible API there, and without the suffix
 * every request 404s and the whole run scores 0.
 */
export class LocalProvider extends OpenAIProvider {
  constructor(opts: { model: string; baseURL?: string; apiKey?: string }) {
    super({
      apiKey: opts.apiKey ?? 'local-no-key',
      model: opts.model,
      baseURL: opts.baseURL ? normalizeLocalEndpoint(opts.baseURL) : 'http://localhost:8080/v1',
      name: 'local',
    });
  }
}
