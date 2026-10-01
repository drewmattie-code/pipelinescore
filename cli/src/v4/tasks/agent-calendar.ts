import type { Rng, ToolDef, V4Task } from '../types.js';

// Scheduling across three calendars with hard rules. Instances are rejection-
// sampled so that ignoring lunch, or ignoring one attendee, gives a different
// (wrong) slot than the policy-correct one.

const TOOLS: ToolDef[] = [
  {
    name: 'get_busy', description: 'Busy blocks for one person on one date, as [start, end) pairs of "HH:MM".',
    parameters: { type: 'object', properties: { email: { type: 'string' }, date: { type: 'string' } }, required: ['email', 'date'] },
  },
  {
    name: 'create_meeting', description: 'Create a meeting on everyone\'s calendar.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }, date: { type: 'string' }, start: { type: 'string', description: 'HH:MM' },
        duration_min: { type: 'integer' }, attendees: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'date', 'start', 'duration_min', 'attendees'],
    },
  },
];

const POLICY = `You are a scheduling assistant. Follow this policy exactly.
- Meetings must start and end within working hours 09:00-17:00.
- Nobody may be booked during lunch, 12:00-13:00: a meeting may not overlap it at all.
- Start times are on 15-minute boundaries (:00, :15, :30, :45).
- Every attendee, including the organizer, must be free for the whole meeting. Check every calendar.
- Pick the earliest slot that satisfies all of this, on the earliest allowed date.
- Create exactly one meeting, then confirm the date and start time.`;

type Block = [number, number]; // minutes from midnight
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function earliest(busy: Block[][], dur: number, lunch: boolean): number | null {
  for (let s = 9 * 60; s + dur <= 17 * 60; s += 15) {
    if (lunch && s < 13 * 60 && s + dur > 12 * 60) continue;
    if (busy.every((bs) => bs.every(([a, b]) => s + dur <= a || s >= b))) return s;
  }
  return null;
}

function randomDay(rng: Rng): Block[] {
  const blocks: Block[] = [];
  let t = 9 * 60 + rng.pick([0, 15, 30]);
  while (t < 16 * 60) {
    const len = rng.pick([30, 45, 60, 90]);
    if (rng.next() < 0.55) blocks.push([t, Math.min(t + len, 17 * 60)]);
    t += len + rng.pick([15, 30, 45]);
  }
  return blocks;
}

export const agentCalendar: V4Task = {
  id: 'agent-calendar-1',
  suite: 'agent',
  difficulty: 3,
  build(rng) {
    const names = rng.shuffle(['amara', 'bo', 'carmen', 'dmitri', 'esme', 'farid', 'greta', 'hiro']).slice(0, 3);
    const emails = names.map((n) => `${n}@globex.co`);
    const dur = rng.pick([45, 60, 75, 90]);
    const day = rng.int(4, 20);
    const dates = [`2027-11-${String(day).padStart(2, '0')}`, `2027-11-${String(day + 1).padStart(2, '0')}`];
    const topic = rng.pick(['pricing review', 'incident postmortem', 'roadmap sync', 'contract walkthrough']);

    let cal: Record<string, Block[]>[] = [];
    let answer: { date: string; start: number } | null = null;
    for (let attempt = 0; attempt < 5000 && !answer; attempt++) {
      cal = dates.map(() => Object.fromEntries(emails.map((e) => [e, randomDay(rng)])));
      const good: Array<number | null> = cal.map((c) => earliest(emails.map((e) => c[e]), dur, true));
      const di = good.findIndex((x) => x !== null);
      if (di < 0) continue;
      const noLunch = earliest(emails.map((e) => cal[di][e]), dur, false);
      const twoOnly = earliest(emails.slice(0, 2).map((e) => cal[di][e]), dur, true);
      // Require both traps on the answer day, and the answer not simply first thing.
      if (noLunch === good[di] || twoOnly === good[di] || good[di] === 9 * 60) continue;
      answer = { date: dates[di], start: good[di]! };
    }
    if (!answer) throw new Error('agent-calendar: no instance with both traps');
    const target = answer;

    const created: Array<{ date: string; start: string; duration_min: number; attendees: string[] }> = [];
    return {
      kind: 'agent',
      maxTurns: 12,
      tools: TOOLS,
      messages: [
        { role: 'system', content: POLICY },
        {
          role: 'user',
          content: `I'm ${emails[0]}. Set up a ${dur}-minute "${topic}" with ${emails[1]} and ${emails[2]} on ${dates[0]} or ${dates[1]}, as early as possible.`,
        },
      ],
      handle(call) {
        const a = call.arguments as Record<string, unknown>;
        if (call.name === 'get_busy') {
          const di = dates.indexOf(String(a.date));
          const e = String(a.email).toLowerCase();
          if (di < 0 || !emails.includes(e)) return 'error: unknown person or date outside the request';
          return JSON.stringify({ email: e, date: dates[di], busy: cal[di][e].map(([s, t]) => [fmt(s), fmt(t)]) });
        }
        if (call.name === 'create_meeting') {
          const att = Array.isArray(a.attendees) ? a.attendees.map((x) => String(x).toLowerCase()) : [];
          created.push({ date: String(a.date), start: String(a.start), duration_min: Number(a.duration_min), attendees: att });
          return JSON.stringify({ ok: true, meeting_id: `M${created.length}` });
        }
        return `error: unknown tool ${call.name}`;
      },
      grade(finalText) {
        const want = { date: target.date, start: fmt(target.start) };
        const issues: string[] = [];
        if (created.length !== 1) issues.push(`${created.length} meetings created, want 1`);
        const m = created[0];
        if (m) {
          if (m.date !== want.date || m.start !== want.start) issues.push(`booked ${m.date} ${m.start}, want ${want.date} ${want.start}`);
          if (m.duration_min !== dur) issues.push(`duration ${m.duration_min}, want ${dur}`);
          const need = emails.slice(1);
          if (!need.every((e) => m.attendees.includes(e))) issues.push('missing attendees');
        }
        const stateOk = issues.length === 0;
        const told = finalText.includes(want.start) || finalText.includes(want.start.replace(/^0/, ''));
        if (!told) issues.push('did not confirm the start time');
        return { score: (stateOk ? 0.8 : 0) + (stateOk && told ? 0.2 : 0), detail: issues.length ? issues.join('; ') : `booked ${want.date} ${want.start}` };
      },
    };
  },
};
