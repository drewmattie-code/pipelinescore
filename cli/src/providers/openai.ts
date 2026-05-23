import OpenAI from 'openai';
import type { LLMProvider, LLMResponse } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  name: string;
  private client: OpenAI;
  private model: string;

  constructor(opts: { apiKey: string; model: string; baseURL?: string; name?: string }) {
    this.name = opts.name ?? 'openai';
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.model = opts.model;
  }

  async complete(prompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<LLMResponse> {
    const start = Date.now();
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0,
      messages: [{ role: 'user', content: prompt }],
    });
    const latency_ms = Date.now() - start;
    const text = res.choices[0]?.message?.content ?? '';
    return {
      text,
      tokens_in: res.usage?.prompt_tokens,
      tokens_out: res.usage?.completion_tokens,
      latency_ms,
    };
  }
}
