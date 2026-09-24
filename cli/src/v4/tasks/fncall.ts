import type { ToolCall, ToolDef, V4Task } from '../types.js';
import { canon } from '../util.js';

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
      () => `Cancel my ${rng.pick(['gym', 'streaming', 'newspaper', 'meal-kit'])} subscription before it renews on the ${rng.int(2, 28)}th.`,
      () => `Order me a ${rng.pick(['large', 'medium'])} ${rng.pick(['pepperoni', 'margherita', 'veggie'])} pizza for delivery at ${rng.int(5, 9)}pm.`,
      () => `Reset the password on my ${rng.pick(['bank', 'email', 'payroll'])} account ending in ${rng.int(1000, 9999)}.`,
      () => `Book me a seat on the ${rng.int(5, 9)}pm train to ${rng.pick(['Ottawa', 'Montreal', 'Kingston', 'Windsor'])}.`,
      () => `Transfer $${rng.int(50, 900)} from my chequing to my savings account.`,
    ])();
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

// ── shared grading for the templated tasks below ─────────────────────────────
// Each instance also carries `oracle`: the exact call set a perfect model makes.
// Tests use it to prove the grader passes it and fails near-misses.

interface Expect {
  name: string;
  args: Record<string, unknown>;
}

type FnInstance = import('../types.js').SingleInstance & { oracle: ToolCall[] | null };

// Arrays whose order carries no meaning are compared as sets.
function normalize(args: Record<string, unknown>, setKeys: string[]): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = setKeys.includes(k) && Array.isArray(v) ? [...v].map((x) => canon(x)).sort() : v;
  }
  return canon(out);
}

function gradeCalls(calls: ToolCall[], expected: Expect[], setKeys: string[] = []) {
  const issues: string[] = [];
  if (calls.some((c) => c.invalid !== undefined)) issues.push('malformed arguments');
  const pool = expected.map((e) => ({ e, key: `${e.name}|${normalize(e.args, setKeys)}`, used: false }));
  let matched = 0;
  const unmatched: ToolCall[] = [];
  for (const c of calls) {
    const key = `${c.name}|${normalize(c.arguments, setKeys)}`;
    const hit = pool.find((p) => !p.used && p.key === key);
    if (hit) { hit.used = true; matched++; } else unmatched.push(c);
  }
  const missing = pool.filter((p) => !p.used);
  if (unmatched.length) issues.push(`unexpected/wrong calls: ${unmatched.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`).join(' ; ').slice(0, 300)}`);
  if (missing.length) issues.push(`missing: ${missing.map((p) => `${p.e.name}(${JSON.stringify(p.e.args)})`).join(' ; ').slice(0, 300)}`);
  const clean = issues.length === 0;
  return { score: clean ? 1 : 0.5 * (matched / expected.length), detail: clean ? `all ${expected.length} calls exact` : issues.join('; ') };
}

function toCalls(expected: Expect[]): ToolCall[] {
  return expected.map((e, i) => ({ id: `o${i}`, name: e.name, arguments: e.args }));
}

function single(tools: ToolDef[], user: string, expected: Expect[], setKeys: string[] = [], system?: string): FnInstance {
  return {
    kind: 'single',
    tools,
    maxTokens: undefined,
    messages: [...(system ? [{ role: 'system' as const, content: system }] : []), { role: 'user' as const, content: user }],
    grade: (res) => gradeCalls(res.toolCalls, expected, setKeys),
    oracle: toCalls(expected),
  };
}

// Right answer is "call nothing": decline, or ask for what's missing.
function noCall(tools: ToolDef[], user: string, mode: 'decline' | 'clarify', system?: string): FnInstance {
  return {
    kind: 'single',
    tools,
    messages: [...(system ? [{ role: 'system' as const, content: system }] : []), { role: 'user' as const, content: user }],
    grade(res) {
      if (res.toolCalls.length) return { score: 0, detail: `called ${res.toolCalls.map((c) => c.name).join(',')} but should not have` };
      const t = res.text.trim();
      if (!t) return { score: 0, detail: 'empty reply' };
      if (mode === 'clarify' && !t.includes('?')) return { score: 0.5, detail: 'no call (good) but did not ask for the missing detail' };
      return { score: 1, detail: mode === 'clarify' ? 'asked for the missing detail' : 'correctly declined' };
    },
    oracle: null,
  };
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

const pad = (n: number) => String(n).padStart(2, '0');

// ── simple ───────────────────────────────────────────────────────────────────
const CURRENCIES: Array<[string, string]> = [
  ['euros', 'EUR'], ['Japanese yen', 'JPY'], ['British pounds', 'GBP'], ['Swiss francs', 'CHF'],
  ['Canadian dollars', 'CAD'], ['Mexican pesos', 'MXN'], ['Indian rupees', 'INR'], ['Australian dollars', 'AUD'],
];

export const fncallSimpleCurrency: V4Task = {
  id: 'fncall-simple-currency-1',
  suite: 'fncall',
  difficulty: 1,
  build(rng) {
    const [from, to] = rng.shuffle(CURRENCIES).slice(0, 2);
    const whole = rng.int(1, 9) * 1000 + rng.int(0, 999);
    const cents = rng.pick([0, 5, 25, 50, 75, 99]);
    const amount = whole + cents / 100;
    const shown = `${whole.toLocaleString('en-US')}${cents ? '.' + pad(cents) : ''}`;
    return single(TOOLS, `How much is ${shown} ${from[0]} in ${to[0]}?`, [
      { name: 'convert_currency', args: { amount, from: from[1], to: to[1] } },
    ]);
  },
};

// ── multiple: near-miss tool names ───────────────────────────────────────────
const ORDER_TOOLS: ToolDef[] = [
  { name: 'get_order_status', description: 'Get the fulfilment status of an order (processing, packed, shipped, delivered). Does not include carrier tracking.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'get_order_history', description: 'List all past orders for a customer email.', parameters: obj({ email: { type: 'string' } }, ['email']) },
  { name: 'track_shipment', description: 'Get live carrier tracking events and the tracking number for a shipped order.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'cancel_order', description: 'Cancel a one-time order that has not shipped yet.', parameters: obj({ order_id: { type: 'string' }, reason: { type: 'string' } }, ['order_id']) },
  { name: 'cancel_subscription', description: 'Stop a recurring subscription so it does not renew.', parameters: obj({ subscription_id: { type: 'string' }, effective: { type: 'string', enum: ['immediately', 'end_of_period'] } }, ['subscription_id', 'effective']) },
  { name: 'refund_order', description: 'Refund a delivered order to the original payment method.', parameters: obj({ order_id: { type: 'string' }, amount: { type: 'number' } }, ['order_id']) },
  {
    name: 'update_shipping_address', description: 'Change the delivery address of an order that has not shipped.',
    parameters: obj({
      order_id: { type: 'string' },
      address: obj({ line1: { type: 'string' }, city: { type: 'string' }, postal_code: { type: 'string' }, country: { type: 'string', description: 'ISO 3166-1 alpha-2' } }, ['line1', 'city', 'postal_code', 'country']),
    }, ['order_id', 'address']),
  },
  { name: 'get_invoice', description: 'Get the invoice document for an order.', parameters: obj({ order_id: { type: 'string' }, format: { type: 'string', enum: ['pdf', 'html', 'csv'] } }, ['order_id', 'format']) },
];

export const fncallMultipleNearMiss: V4Task = {
  id: 'fncall-multiple-near-miss-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const oid = `ORD-${rng.int(100000, 999999)}`;
    const sid = `SUB-${rng.int(1000, 9999)}`;
    const city = rng.pick([['Lyon', 'FR', '69002'], ['Porto', 'PT', '4050-123'], ['Graz', 'AT', '8010'], ['Leeds', 'GB', 'LS1 4DY']] as const);
    const street = `${rng.int(2, 180)} ${rng.pick(['Harbour Road', 'Mill Lane', 'Station Street', 'Park Avenue'])}`;
    const scenarios: Array<[string, Expect]> = [
      [`Order ${oid} shipped yesterday. Give me the carrier tracking number and where it is right now.`, { name: 'track_shipment', args: { order_id: oid } }],
      [`Please stop my monthly plan ${sid} from renewing, but let me use it until the current period ends.`, { name: 'cancel_subscription', args: { subscription_id: sid, effective: 'end_of_period' } }],
      [`I need the invoice for ${oid} as a PDF for my accountant.`, { name: 'get_invoice', args: { order_id: oid, format: 'pdf' } }],
      [`Order ${oid} hasn't shipped yet. Please send it to ${street}, ${city[0]} ${city[2]}, country code ${city[1]} instead.`,
        { name: 'update_shipping_address', args: { order_id: oid, address: { line1: street, city: city[0], postal_code: city[2], country: city[1] } } }],
    ];
    const [user, exp] = rng.pick(scenarios);
    return single(ORDER_TOOLS, user, [exp]);
  },
};

// ── parallel: same tool several times ────────────────────────────────────────
const WEATHER_TOOL: ToolDef = {
  name: 'get_forecast',
  description: 'Daily forecast for one city and one date (today through 7 days ahead).',
  parameters: obj({ city: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, units: { type: 'string', enum: ['metric', 'imperial'] } }, ['city', 'date', 'units']),
};

export const fncallParallelSame: V4Task = {
  id: 'fncall-parallel-same-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const cities = rng.shuffle(['Lisbon', 'Oslo', 'Nairobi', 'Hanoi', 'Denver', 'Quito', 'Tallinn', 'Perth']).slice(0, rng.int(3, 4));
    const date = `2027-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`;
    const imperial = rng.next() < 0.5;
    const list = `${cities.slice(0, -1).join(', ')} and ${cities[cities.length - 1]}`;
    return single([WEATHER_TOOL, TOOLS[3]],
      `Get me the forecast for ${list} on ${date}, in ${imperial ? 'Fahrenheit' : 'Celsius'}. Fetch them all at once.`,
      cities.map((city) => ({ name: 'get_forecast', args: { city, date, units: imperial ? 'imperial' : 'metric' } })));
  },
};

// ── parallel multiple: several tools, several times ──────────────────────────
const HOME_TOOLS: ToolDef[] = [
  { name: 'set_thermostat', description: 'Set the target temperature for one room.', parameters: obj({ room: { type: 'string', enum: ['living_room', 'bedroom', 'office', 'kitchen'] }, celsius: { type: 'number' } }, ['room', 'celsius']) },
  { name: 'set_lights', description: 'Turn one room\'s lights on or off, with optional brightness when on.', parameters: obj({ room: { type: 'string', enum: ['living_room', 'bedroom', 'office', 'kitchen'] }, on: { type: 'boolean' }, brightness_pct: { type: 'integer', minimum: 1, maximum: 100 } }, ['room', 'on']) },
  { name: 'lock_door', description: 'Lock or unlock a door.', parameters: obj({ door: { type: 'string', enum: ['front', 'back', 'garage'] }, locked: { type: 'boolean' } }, ['door', 'locked']) },
  { name: 'play_music', description: 'Play a playlist in a room.', parameters: obj({ room: { type: 'string' }, playlist: { type: 'string' } }, ['room', 'playlist']) },
];

const ROOM_WORDS: Record<string, string> = { living_room: 'living room', bedroom: 'bedroom', office: 'office', kitchen: 'kitchen' };

export const fncallParallelMultiple: V4Task = {
  id: 'fncall-parallel-multiple-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const [r1, r2, r3] = rng.shuffle(Object.keys(ROOM_WORDS));
    const t1 = rng.int(17, 23) + rng.pick([0, 0.5]);
    const t2 = rng.int(17, 23) + rng.pick([0, 0.5]);
    const bright = rng.pick([20, 35, 40, 60, 75]);
    const door = rng.pick(['front', 'back', 'garage'] as const);
    return single(HOME_TOOLS,
      `Going to bed. Set the ${ROOM_WORDS[r1]} to ${t1}°C and the ${ROOM_WORDS[r2]} to ${t2}°C, switch the ${ROOM_WORDS[r3]} lights off, ` +
      `put the ${ROOM_WORDS[r2]} lights on at ${bright}% brightness, and lock the ${door} door. Do it all in one go.`,
      [
        { name: 'set_thermostat', args: { room: r1, celsius: t1 } },
        { name: 'set_thermostat', args: { room: r2, celsius: t2 } },
        { name: 'set_lights', args: { room: r3, on: false } },
        { name: 'set_lights', args: { room: r2, on: true, brightness_pct: bright } },
        { name: 'lock_door', args: { door, locked: true } },
      ]);
  },
};

// ── nested object + array ─────────────────────────────────────────────────────
const INVOICE_TOOL: ToolDef = {
  name: 'create_invoice',
  description: 'Create a customer invoice.',
  parameters: obj({
    customer: obj({ name: { type: 'string' }, email: { type: 'string' } }, ['name', 'email']),
    currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'CAD'] },
    due_date: { type: 'string', description: 'YYYY-MM-DD' },
    line_items: {
      type: 'array',
      items: obj({ sku: { type: 'string' }, quantity: { type: 'integer' }, unit_price: { type: 'number' } }, ['sku', 'quantity', 'unit_price']),
    },
  }, ['customer', 'currency', 'due_date', 'line_items']),
};

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export const fncallNestedArray: V4Task = {
  id: 'fncall-nested-array-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const name = rng.pick(['Harbor Coffee Co', 'Pine & Oak Studio', 'Nordlys Labs', 'Blue Heron Dental']);
    const email = `billing@${name.toLowerCase().replace(/[^a-z]+/g, '')}.com`;
    const cur = rng.pick([['USD', 'US dollars'], ['EUR', 'euros'], ['GBP', 'pounds sterling'], ['CAD', 'Canadian dollars']] as const);
    const m = rng.int(1, 12);
    const d = rng.int(1, 28);
    const items = rng.shuffle(['WID-100', 'WID-220', 'SVC-HR', 'CAB-3M', 'KIT-PRO']).slice(0, 3).map((sku) => ({
      sku, quantity: rng.int(1, 12), unit_price: rng.int(5, 400) + rng.pick([0, 0.5, 0.99]),
    }));
    const lines = items.map((i) => `${NUMBER_WORDS[i.quantity - 1]} of ${i.sku} at ${i.unit_price} each`).join('; ');
    return single([INVOICE_TOOL, TOOLS[1]],
      `Invoice ${name} (${email}) in ${cur[1]}, due ${MONTHS[m - 1]} ${d}, 2027: ${lines}.`,
      [{ name: 'create_invoice', args: { customer: { name, email }, currency: cur[0], due_date: `2027-${pad(m)}-${pad(d)}`, line_items: items } }],
      ['line_items']);
  },
};

// ── enums, including a set-valued enum array ──────────────────────────────────
const NOTIFY_TOOL: ToolDef = {
  name: 'set_notification_preferences',
  description: 'Replace the user\'s notification settings.',
  parameters: obj({
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'none'] },
    frequency: { type: 'string', enum: ['realtime', 'hourly', 'daily', 'weekly'] },
    categories: { type: 'array', items: { type: 'string', enum: ['billing', 'security', 'product_updates', 'marketing', 'shipping'] } },
    quiet_hours: { type: 'boolean' },
  }, ['channel', 'frequency', 'categories', 'quiet_hours']),
};

export const fncallEnums: V4Task = {
  id: 'fncall-enums-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const ch = rng.pick([['sms', 'text me'], ['push', 'send a phone notification'], ['email', 'email me']] as const);
    const fr = rng.pick([['daily', 'once a day'], ['weekly', 'once a week'], ['hourly', 'every hour'], ['realtime', 'the moment something happens']] as const);
    const cats = rng.shuffle([['billing', 'billing'], ['security', 'security alerts'], ['shipping', 'delivery updates'], ['product_updates', 'new features']] as const).slice(0, 2);
    const quiet = rng.next() < 0.5;
    return single([NOTIFY_TOOL],
      `Change my notifications: ${ch[1]} ${fr[1]}, only about ${cats[0][1]} and ${cats[1][1]}, nothing else. ` +
      `${quiet ? 'And turn on quiet hours.' : 'Quiet hours off.'}`,
      [{ name: 'set_notification_preferences', args: { channel: ch[0], frequency: fr[0], categories: cats.map((c) => c[0]), quiet_hours: quiet } }],
      ['categories']);
  },
};

// ── strict types and unit conversion before calling ───────────────────────────
const MAINT_TOOL: ToolDef = {
  name: 'schedule_maintenance',
  description: 'Schedule a maintenance window for a server.',
  parameters: obj({
    server_id: { type: 'string' },
    start: { type: 'string', description: 'Local time, YYYY-MM-DDTHH:MM (24-hour)' },
    duration_min: { type: 'integer', description: 'Length in minutes' },
    notify_customers: { type: 'boolean' },
    max_cost_usd: { type: 'number' },
  }, ['server_id', 'start', 'duration_min', 'notify_customers', 'max_cost_usd']),
};

const DURATIONS: Array<[string, number]> = [
  ['two and a half hours', 150], ['an hour and forty-five minutes', 105], ['three hours', 180],
  ['ninety minutes', 90], ['a quarter of an hour', 15], ['four and a quarter hours', 255],
];

export const fncallTypesUnits: V4Task = {
  id: 'fncall-types-units-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const server = `web-${pad(rng.int(1, 40))}`;
    const [durWords, durMin] = rng.pick(DURATIONS);
    const m = rng.int(1, 12);
    const d = rng.int(1, 28);
    const hour = rng.int(13, 23);
    const notify = rng.next() < 0.5;
    const budgetK = rng.pick([1.2, 2.5, 0.8, 3.75]);
    return single([MAINT_TOOL],
      `Schedule maintenance on ${server} starting at ${hour - 12} p.m. on ${MONTHS[m - 1]} ${d}, 2027, lasting ${durWords}. ` +
      `${notify ? 'Please notify customers.' : "Don't notify customers."} Budget is up to $${budgetK}k.`,
      [{ name: 'schedule_maintenance', args: { server_id: server, start: `2027-${pad(m)}-${pad(d)}T${pad(hour)}:00`, duration_min: durMin, notify_customers: notify, max_cost_usd: Math.round(budgetK * 1000) } }]);
  },
};

// ── strict types: numeric-looking strings stay strings ───────────────────────
const SHIP_TOOL: ToolDef = {
  name: 'create_shipment',
  description: 'Create a parcel shipment label.',
  parameters: obj({
    recipient_zip: { type: 'string', description: 'Postal code exactly as written, including leading zeros' },
    account_number: { type: 'string' },
    weight_kg: { type: 'number' },
    pieces: { type: 'integer' },
    fragile: { type: 'boolean' },
  }, ['recipient_zip', 'account_number', 'weight_kg', 'pieces', 'fragile']),
};

export const fncallTypesStrings: V4Task = {
  id: 'fncall-types-strings-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const zip = `0${rng.int(1000, 9999)}`;
    const acct = `00${rng.int(100000, 999999)}`;
    const grams = rng.int(3, 49) * 100;
    const pieces = rng.int(2, 6);
    const fragile = rng.next() < 0.5;
    return single([SHIP_TOOL],
      `Ship ${NUMBER_WORDS[pieces - 1]} boxes, ${grams} grams in total, to ZIP ${zip}, billed to account ${acct}. ` +
      `${fragile ? 'Mark them fragile.' : 'Nothing fragile inside.'}`,
      [{ name: 'create_shipment', args: { recipient_zip: zip, account_number: acct, weight_kg: grams / 1000, pieces, fragile } }]);
  },
};

// ── optional parameters: omit what wasn't asked, include what was ─────────────
const FLIGHT_TOOL: ToolDef = {
  name: 'search_flights',
  description: 'Search flights. Only pass optional filters the traveller actually asked for.',
  parameters: obj({
    origin: { type: 'string', description: 'IATA code' },
    destination: { type: 'string', description: 'IATA code' },
    depart_date: { type: 'string', description: 'YYYY-MM-DD' },
    return_date: { type: 'string', description: 'YYYY-MM-DD, round trips only' },
    cabin: { type: 'string', enum: ['economy', 'premium_economy', 'business', 'first'] },
    max_stops: { type: 'integer', minimum: 0 },
  }, ['origin', 'destination', 'depart_date']),
};

const AIRPORTS: Array<[string, string]> = [
  ['Toronto Pearson', 'YYZ'], ['Lisbon', 'LIS'], ['Tokyo Haneda', 'HND'], ['Denver', 'DEN'],
  ['Amsterdam Schiphol', 'AMS'], ['Mexico City', 'MEX'], ['Singapore Changi', 'SIN'], ['Chicago O\'Hare', 'ORD'],
];

export const fncallOptionalOmit: V4Task = {
  id: 'fncall-optional-omit-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const [a, b] = rng.shuffle(AIRPORTS).slice(0, 2);
    const m = rng.int(1, 12);
    const d = rng.int(1, 28);
    return single([FLIGHT_TOOL],
      `Find me one-way flights from ${a[0]} (${a[1]}) to ${b[0]} (${b[1]}) on ${MONTHS[m - 1]} ${d}, 2027. I'm flexible on everything else.`,
      [{ name: 'search_flights', args: { origin: a[1], destination: b[1], depart_date: `2027-${pad(m)}-${pad(d)}` } }]);
  },
};

export const fncallOptionalInclude: V4Task = {
  id: 'fncall-optional-include-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const [a, b] = rng.shuffle(AIRPORTS).slice(0, 2);
    const m = rng.int(1, 11);
    const d = rng.int(1, 20);
    const stay = rng.int(3, 8);
    const cabin = rng.pick([['business', 'business class'], ['premium_economy', 'premium economy'], ['first', 'first class']] as const);
    const nonstop = rng.next() < 0.6;
    const stops = nonstop ? 0 : 1;
    return single([FLIGHT_TOOL],
      `Round trip ${a[0]} (${a[1]}) to ${b[0]} (${b[1]}): leave ${MONTHS[m - 1]} ${d}, 2027 and come back ${MONTHS[m - 1]} ${d + stay}, 2027. ` +
      `${cabin[1]}, ${nonstop ? 'nonstop only' : 'at most one stop'}.`,
      [{ name: 'search_flights', args: { origin: a[1], destination: b[1], depart_date: `2027-${pad(m)}-${pad(d)}`, return_date: `2027-${pad(m)}-${pad(d + stay)}`, cabin: cabin[0], max_stops: stops } }]);
  },
};

// ── relevance: a tool looks right but can't do the job ────────────────────────
export const fncallAbstainLookalike: V4Task = {
  id: 'fncall-abstain-lookalike-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const city = rng.pick(['Paris', 'Montreal', 'Kyoto', 'Cape Town', 'Reykjavik']);
    const year = rng.int(2011, 2019);
    const m = rng.int(1, 12);
    const d = rng.int(1, 28);
    return noCall([WEATHER_TOOL, TOOLS[3]],
      `What was the weather in ${city} on ${MONTHS[m - 1]} ${d}, ${year}? I need the actual recorded conditions.`,
      'decline',
      'Only call a tool if it can actually answer the request. If no tool can, say so briefly.');
  },
};

// ── relevance: a required argument is missing, so ask ─────────────────────────
export const fncallClarifyMissing: V4Task = {
  id: 'fncall-clarify-missing-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const who = rng.pick(['ana@acme.io', 'ben@acme.io', 'chloe@acme.io']);
    const topic = rng.pick(['a design review', 'a catch-up', 'the budget sync']);
    return noCall(TOOLS,
      `Set up ${topic} with ${who} sometime next week.`,
      'clarify',
      'Never invent values for required tool arguments. If something required is missing, ask the user for it instead of calling a tool.');
  },
};

export const FNCALL_TASKS: V4Task[] = [
  fncallParallelNested,
  fncallAbstain,
  fncallSimpleCurrency,
  fncallMultipleNearMiss,
  fncallParallelSame,
  fncallParallelMultiple,
  fncallNestedArray,
  fncallEnums,
  fncallTypesUnits,
  fncallTypesStrings,
  fncallOptionalOmit,
  fncallOptionalInclude,
  fncallAbstainLookalike,
  fncallClarifyMissing,
];
