import type { ToolCall, ToolDef, V4Task } from '../types.js';

const TOOLS: ToolDef[] = [
  {
    name: 'create_event',
    description: 'Create a calendar event.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start: { type: 'string', description: '24h HH:MM' },
        duration_min: { type: 'integer' },
        attendees: { type: 'array', items: { type: 'string', description: 'email' } },
        reminder: {
          type: 'object',
          properties: { channel: { type: 'string', enum: ['email', 'sms', 'push'] }, minutes_before: { type: 'integer' } },
          required: ['channel', 'minutes_before'],
        },
      },
      required: ['title', 'date', 'start', 'duration_min'],
    },
  },
  {
    name: 'send_message',
    description: 'Send a chat message to one person.',
    parameters: {
      type: 'object',
      properties: { to: { type: 'string', description: 'email' }, text: { type: 'string' } },
      required: ['to', 'text'],
    },
  },
  {
    name: 'get_weather',
    description: 'Get the forecast for a city and date.',
    parameters: { type: 'object', properties: { city: { type: 'string' }, date: { type: 'string' } }, required: ['city', 'date'] },
  },
  {
    name: 'convert_currency',
    description: 'Convert an amount between ISO currency codes.',
    parameters: {
      type: 'object',
      properties: { amount: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } },
      required: ['amount', 'from', 'to'],
    },
  },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Two independent actions in one request: both calls must come back in the same
// turn, with nested/enum/integer arguments exact, and no extra tools called.
export const fncallParallelNested: V4Task = {
  id: 'fncall-parallel-nested-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const m = rng.int(1, 12);
    const d = rng.int(1, 28);
    const hour = rng.int(8, 16);
    const min = rng.pick([0, 15, 30, 45]);
    const dur = rng.pick([30, 45, 60, 90]);
    const people = rng.shuffle(['ana', 'ben', 'chloe', 'dev', 'eli', 'fran']).slice(0, 2).map((n) => `${n}@acme.io`);
    const remind = rng.pick([10, 15, 30, 60]);
    const channel = rng.pick(['sms', 'push'] as const);
    const topic = rng.pick(['Q3 budget review', 'vendor onboarding', 'launch retro', 'hiring sync']);
    const date = `2027-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const start = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const h12 = hour > 12 ? hour - 12 : hour;
    const when = `${MONTHS[m - 1]} ${d}, 2027 at ${h12}:${String(min).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
    const note = `Heads up: ${topic} is booked for ${when}.`;
    return {
      kind: 'single',
      tools: TOOLS,
      messages: [{
        role: 'user',
        content:
          `Book "${topic}" on ${when} for ${dur} minutes with ${people[0]} and ${people[1]}, ` +
          `and set a ${channel.toUpperCase()} reminder ${remind} minutes before. ` +
          `Also message ${people[0]} exactly this text: "${note}". Do both now.`,
      }],
      grade(res) {
        const calls = res.toolCalls;
        const issues: string[] = [];
        const ev = calls.find((c) => c.name === 'create_event');
        const msg = calls.find((c) => c.name === 'send_message');
        const extra = calls.filter((c) => c.name !== 'create_event' && c.name !== 'send_message');
        if (calls.some((c) => c.invalid !== undefined)) issues.push('malformed arguments');
        if (extra.length) issues.push(`unneeded calls: ${extra.map((c) => c.name).join(',')}`);
        if (calls.filter((c) => c.name === 'create_event').length !== 1) issues.push('create_event not called exactly once');
        if (calls.filter((c) => c.name === 'send_message').length !== 1) issues.push('send_message not called exactly once');
        let points = 0;
        if (ev) points += checkEvent(ev, { title: topic, date, start, dur, people, channel, remind }, issues);
        if (msg) {
          const a = msg.arguments;
          if (a.to === people[0] && String(a.text ?? '').trim() === note) points += 1;
          else issues.push(`message wrong: ${JSON.stringify(a)}`);
        }
        const clean = issues.length === 0;
        return { score: clean ? 1 : (points / 2) * 0.5, detail: clean ? 'both calls exact' : issues.join('; ') };
      },
    };
  },
};

function checkEvent(
  c: ToolCall,
  w: { title: string; date: string; start: string; dur: number; people: string[]; channel: string; remind: number },
  issues: string[],
): number {
  const a = c.arguments as Record<string, unknown>;
  const r = (a.reminder ?? {}) as Record<string, unknown>;
  const att = Array.isArray(a.attendees) ? [...a.attendees].map(String).sort() : [];
  const checks: Array<[string, boolean]> = [
    ['title', String(a.title ?? '').toLowerCase() === w.title.toLowerCase()],
    ['date', a.date === w.date],
    ['start', a.start === w.start],
    ['duration_min', a.duration_min === w.dur],
    ['attendees', JSON.stringify(att) === JSON.stringify([...w.people].sort())],
    ['reminder.channel', r.channel === w.channel],
    ['reminder.minutes_before', r.minutes_before === w.remind],
  ];
  const bad = checks.filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) issues.push(`event fields wrong: ${bad.join(',')} (${JSON.stringify(a)})`);
  return bad.length ? 0 : 1;
}

// Abstention: no tool fits, so the right answer is to call nothing and say so.
export const fncallAbstain: V4Task = {
  id: 'fncall-abstain-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const ask = rng.pick([
      'Cancel my gym membership renewal.',
      'Order me a large pepperoni pizza for delivery.',
      'Reset my bank password.',
      'Book me a seat on the 6pm train to Ottawa.',
    ]);
    return {
      kind: 'single',
      tools: TOOLS,
      messages: [
        { role: 'system', content: 'Only use a tool when it can actually do what the user asks. If none can, say so plainly.' },
        { role: 'user', content: ask },
      ],
      grade(res) {
        if (res.toolCalls.length) return { score: 0, detail: `called ${res.toolCalls.map((c) => c.name).join(',')} though no tool fits` };
        return res.text.trim() ? { score: 1, detail: 'correctly declined' } : { score: 0, detail: 'empty reply' };
      },
    };
  },
};
