import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { stripReasoning } from '../normalize.js';
import type { ChatMessage, ChatProvider, ChatResponse, ToolCall, ToolDef } from './types.js';

function parseArgs(id: string, name: string, raw: string): ToolCall {
  if (!raw || !raw.trim()) return { id, name, arguments: {} };
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { id, name, arguments: v as Record<string, unknown> };
  } catch {
    /* fall through */
  }
  return { id, name, arguments: {}, invalid: raw };
}

// Native tool calling over the OpenAI Chat Completions wire format: local
// servers (Ollama, LM Studio, llama.cpp, vLLM, MLX, LiteLLM) and OpenAI-compatible
// clouds (MiniMax, OpenRouter, OpenAI).
export class OpenAIChatProvider implements ChatProvider {
  maxOutputTokens?: number;
  private client: OpenAI;
  constructor(public name: string, public model: string, opts: { baseURL?: string; apiKey?: string }) {
    this.client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey ?? 'local-no-key', timeout: 3_600_000, maxRetries: 4 });
  }

  async chat(messages: ChatMessage[], opts: { tools?: ToolDef[]; maxTokens: number }): Promise<ChatResponse> {
    const wire: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => {
      switch (m.role) {
        case 'system':
        case 'user':
          return { role: m.role, content: m.content };
        case 'assistant':
          return {
            role: 'assistant',
            content: m.content || null,
            ...(m.toolCalls?.length
              ? {
                  tool_calls: m.toolCalls.map((c) => ({
                    id: c.id,
                    type: 'function' as const,
                    function: { name: c.name, arguments: c.invalid ?? JSON.stringify(c.arguments) },
                  })),
                }
              : {}),
          };
        case 'tool':
          return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
    });
    const start = Date.now();
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: wire,
      max_tokens: opts.maxTokens,
      temperature: 0,
      ...(opts.tools?.length
        ? { tools: opts.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
    });
    const latencyMs = Date.now() - start;
    const choice = res.choices?.[0];
    if (!choice) throw new Error('endpoint returned no choices (check the base URL and model id)');
    // A crashed backend (seen: Ollama after a Metal compute error) keeps answering
    // HTTP 200 with an empty choice, zero prompt tokens and no finish reason.
    // Scoring that as a wrong answer would blame the model for the server.
    if (!choice.finish_reason && !choice.message?.content && !choice.message?.tool_calls?.length && !res.usage?.prompt_tokens) {
      throw new Error('model server returned an empty completion with no tokens processed (it is likely in an error state; restart it)');
    }
    const toolCalls = (choice.message.tool_calls ?? []).map((c, i) =>
      parseArgs(c.id || `call_${i}`, c.function.name, c.function.arguments),
    );
    return {
      text: stripReasoning(choice.message.content ?? ''),
      toolCalls,
      tokensIn: res.usage?.prompt_tokens,
      tokensOut: res.usage?.completion_tokens,
      latencyMs,
    };
  }
}

// Native tool calling over the Anthropic Messages wire format (Anthropic, and
// Anthropic-compatible endpoints such as MiniMax's).
export class AnthropicChatProvider implements ChatProvider {
  maxOutputTokens?: number;
  private client: Anthropic;
  constructor(public name: string, public model: string, opts: { baseURL?: string; apiKey: string }) {
    this.client = new Anthropic({ baseURL: opts.baseURL, apiKey: opts.apiKey, timeout: 3_600_000, maxRetries: 4 });
  }

  async chat(messages: ChatMessage[], opts: { tools?: ToolDef[]; maxTokens: number }): Promise<ChatResponse> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const wire: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'user') wire.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        const blocks: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments });
        wire.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '' }] });
      } else {
        const block: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        const last = wire[wire.length - 1];
        // Consecutive tool results must share one user turn.
        if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) {
          (last.content as Anthropic.ToolResultBlockParam[]).push(block);
        } else wire.push({ role: 'user', content: [block] });
      }
    }
    const start = Date.now();
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens,
      temperature: 0,
      ...(system ? { system } : {}),
      messages: wire,
      ...(opts.tools?.length
        ? { tools: opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })) }
        : {}),
    });
    const latencyMs = Date.now() - start;
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    const toolCalls: ToolCall[] = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) =>
        b.input && typeof b.input === 'object' && !Array.isArray(b.input)
          ? { id: b.id, name: b.name, arguments: b.input as Record<string, unknown> }
          : { id: b.id, name: b.name, arguments: {}, invalid: JSON.stringify(b.input) },
      );
    return {
      text: stripReasoning(text),
      toolCalls,
      tokensIn: res.usage?.input_tokens,
      tokensOut: res.usage?.output_tokens,
      latencyMs,
    };
  }
}
