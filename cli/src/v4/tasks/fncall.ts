import type { Rng, SingleInstance, ToolCall, ToolDef, V4Task } from '../types.js';
import { canon } from '../util.js';

// FNCALL: one user request, native tool calling, graded on the exact calls
// made. Hardened after a pilot where a 4B model scored like frontier models:
// a large menu of near-miss tools, arguments that need computing (time zones,
// dates, unit and currency maths), requests whose hidden constraints change the
// right call, and calls whose arguments come from an earlier call's RESULT.

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const DAY = 86_400_000;

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const utcMinute = (t: number) => `${new Date(t).toISOString().slice(0, 16)}Z`;
const longDate = (t: number) => { const d = new Date(t); return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const clock = (h: number, m: number) => `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
const offsetLabel = (min: number) => `UTC${min < 0 ? '-' : '+'}${Math.floor(Math.abs(min) / 60)}${Math.abs(min) % 60 ? `:${pad(Math.abs(min) % 60)}` : ''}`;

// ── the shared tool menu: 27 tools, many near-misses of each other ───────────
const CURRENCY_CODES = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'MXN', 'INR', 'AUD', 'SEK'];
const ROOMS = ['living_room', 'bedroom', 'office', 'kitchen'];
const T: Record<string, ToolDef> = {
  create_event: {
    name: 'create_event', description: 'Create a calendar event. Returns the new event_id.',
    parameters: obj({
      title: { type: 'string' },
      start_utc: { type: 'string', description: 'Start time in UTC, format YYYY-MM-DDTHH:MMZ' },
      duration_min: { type: 'integer' },
      attendees: { type: 'array', items: { type: 'string', description: 'email' } },
      location: { type: 'string' },
      reminder: obj({ channel: { type: 'string', enum: ['email', 'sms', 'push'] }, minutes_before: { type: 'integer' } }, ['channel', 'minutes_before']),
    }, ['title', 'start_utc', 'duration_min']),
  },
  update_event: { name: 'update_event', description: 'Change an existing calendar event.', parameters: obj({ event_id: { type: 'string' }, start_utc: { type: 'string' }, title: { type: 'string' } }, ['event_id']) },
  find_free_slot: { name: 'find_free_slot', description: 'Find a time when all attendees are free. Does not book anything.', parameters: obj({ attendees: { type: 'array', items: { type: 'string' } }, duration_min: { type: 'integer' }, window_start_utc: { type: 'string' }, window_end_utc: { type: 'string' } }, ['attendees', 'duration_min']) },
  send_message: { name: 'send_message', description: 'Send a message on the internal company chat. Recipients must be colleagues with an @acme.io address.', parameters: obj({ to: { type: 'string', description: '@acme.io email' }, text: { type: 'string' } }, ['to', 'text']) },
  send_email: { name: 'send_email', description: 'Send an email to any email address.', parameters: obj({ to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, ['to', 'subject', 'body']) },
  create_task: { name: 'create_task', description: 'Add a to-do item to a project board.', parameters: obj({ title: { type: 'string' }, due_date: { type: 'string' }, assignee: { type: 'string' } }, ['title']) },
  set_reminder: { name: 'set_reminder', description: 'A personal reminder for yourself, not attached to any event.', parameters: obj({ text: { type: 'string' }, at_utc: { type: 'string' } }, ['text', 'at_utc']) },
  get_forecast: { name: 'get_forecast', description: 'Daily forecast (temperature and precipitation) for one city and one date, from today up to 7 days ahead.', parameters: obj({ city: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, units: { type: 'string', enum: ['metric', 'imperial'] } }, ['city', 'date', 'units']) },
  convert_currency: { name: 'convert_currency', description: 'Convert an amount between two supported currencies.', parameters: obj({ amount: { type: 'number' }, from: { type: 'string', enum: CURRENCY_CODES }, to: { type: 'string', enum: CURRENCY_CODES } }, ['amount', 'from', 'to']) },
  get_exchange_rate: { name: 'get_exchange_rate', description: 'Current exchange rate between two currencies. Does not convert an amount.', parameters: obj({ from: { type: 'string', enum: CURRENCY_CODES }, to: { type: 'string', enum: CURRENCY_CODES } }, ['from', 'to']) },
  search_flights: {
    name: 'search_flights', description: 'Search flights. Returns options with flight_id, price_usd, stops and cabin. Only pass optional filters the traveller actually requires.',
    parameters: obj({
      origin: { type: 'string', description: 'IATA code' },
      destination: { type: 'string', description: 'IATA code' },
      depart_date: { type: 'string', description: 'YYYY-MM-DD' },
      return_date: { type: 'string', description: 'YYYY-MM-DD, round trips only' },
      cabin: { type: 'string', enum: ['economy', 'premium_economy', 'business', 'first'] },
      max_stops: { type: 'integer', minimum: 0 },
      max_price_usd: { type: 'number' },
      airlines: { type: 'array', items: { type: 'string' } },
      checked_bags: { type: 'integer' },
      flexible_days: { type: 'integer' },
    }, ['origin', 'destination', 'depart_date']),
  },
  book_flight: { name: 'book_flight', description: 'Book a flight option returned by search_flights.', parameters: obj({ flight_id: { type: 'string' } }, ['flight_id']) },
  hold_fare: { name: 'hold_fare', description: 'Hold a fare for 24 hours without booking it.', parameters: obj({ flight_id: { type: 'string' } }, ['flight_id']) },
  create_invoice: {
    name: 'create_invoice', description: 'Create a customer invoice (a bill to be paid).',
    parameters: obj({
      customer: obj({ name: { type: 'string' }, email: { type: 'string' } }, ['name', 'email']),
      currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'CAD'] },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      line_items: { type: 'array', items: obj({ sku: { type: 'string' }, quantity: { type: 'integer' }, unit_price: { type: 'number', description: 'price per unit after any discount, 2 decimals' } }, ['sku', 'quantity', 'unit_price']) },
      po_number: { type: 'string', description: 'only if the customer gave one' },
      notes: { type: 'string' },
    }, ['customer', 'currency', 'due_date', 'line_items']),
  },
  create_quote: { name: 'create_quote', description: 'Create a price quote for a prospect. Not a bill.', parameters: obj({ customer_email: { type: 'string' }, line_items: { type: 'array', items: { type: 'object' } } }, ['customer_email', 'line_items']) },
  create_shipment: {
    name: 'create_shipment', description: 'Create a parcel shipment label.',
    parameters: obj({
      recipient_zip: { type: 'string', description: 'Postal code exactly as written, including leading zeros' },
      account_number: { type: 'string' },
      weight_kg: { type: 'number', description: 'Total kilograms rounded to 2 decimals (1 lb = 0.4536 kg; 16 oz = 1 lb)' },
      pieces: { type: 'integer' },
      fragile: { type: 'boolean' },
    }, ['recipient_zip', 'account_number', 'weight_kg', 'pieces', 'fragile']),
  },
  get_shipping_quote: { name: 'get_shipping_quote', description: 'Price a shipment without creating it.', parameters: obj({ recipient_zip: { type: 'string' }, weight_kg: { type: 'number' } }, ['recipient_zip', 'weight_kg']) },
  set_thermostat: { name: 'set_thermostat', description: 'Set the target temperature for one room now.', parameters: obj({ room: { type: 'string', enum: ROOMS }, celsius: { type: 'number', description: 'multiple of 0.5' } }, ['room', 'celsius']) },
  set_thermostat_schedule: { name: 'set_thermostat_schedule', description: 'Set a recurring daily temperature schedule for a room.', parameters: obj({ room: { type: 'string', enum: ROOMS }, celsius: { type: 'number' }, from_time: { type: 'string' }, to_time: { type: 'string' } }, ['room', 'celsius', 'from_time', 'to_time']) },
  set_lights: { name: 'set_lights', description: "Turn one room's lights on or off, with optional brightness when on.", parameters: obj({ room: { type: 'string', enum: ROOMS }, on: { type: 'boolean' }, brightness_pct: { type: 'integer', minimum: 1, maximum: 100 } }, ['room', 'on']) },
  set_blinds: { name: 'set_blinds', description: "Set one room's blinds: 0 = fully closed, 100 = fully open.", parameters: obj({ room: { type: 'string', enum: ROOMS }, open_pct: { type: 'integer', minimum: 0, maximum: 100 } }, ['room', 'open_pct']) },
  lock_door: { name: 'lock_door', description: 'Lock or unlock a house door.', parameters: obj({ door: { type: 'string', enum: ['front', 'back', 'garage'] }, locked: { type: 'boolean' } }, ['door', 'locked']) },
  set_notification_preferences: {
    name: 'set_notification_preferences', description: "Replace the user's notification settings.",
    parameters: obj({
      channel: { type: 'string', enum: ['email', 'sms', 'push', 'none'] },
      frequency: { type: 'string', enum: ['realtime', 'hourly', 'daily', 'weekly'] },
      categories: { type: 'array', items: { type: 'string', enum: ['billing', 'security', 'product_updates', 'marketing', 'shipping'] } },
      quiet_hours: { type: 'boolean' },
    }, ['channel', 'frequency', 'categories', 'quiet_hours']),
  },
  set_marketing_consent: { name: 'set_marketing_consent', description: 'Record legal consent to marketing (GDPR). Separate from notification settings.', parameters: obj({ consent: { type: 'boolean' } }, ['consent']) },
  schedule_maintenance: {
    name: 'schedule_maintenance', description: 'Schedule a maintenance window for a server.',
    parameters: obj({
      server_id: { type: 'string' },
      start_utc: { type: 'string', description: 'UTC, YYYY-MM-DDTHH:MMZ' },
      duration_min: { type: 'integer' },
      notify_customers: { type: 'boolean' },
      max_cost_usd: { type: 'integer', description: 'whole US dollars' },
    }, ['server_id', 'start_utc', 'duration_min', 'notify_customers', 'max_cost_usd']),
  },
  restart_server: { name: 'restart_server', description: 'Restart a server immediately.', parameters: obj({ server_id: { type: 'string' } }, ['server_id']) },
  cancel_subscription: { name: 'cancel_subscription', description: 'Cancel a subscription bought from this store (ids start with SUB-).', parameters: obj({ subscription_id: { type: 'string' } }, ['subscription_id']) },
};
const MENU: ToolDef[] = Object.values(T);

// ── shared grading ───────────────────────────────────────────────────────────
interface Expect { name: string; args: Record<string, unknown> }

// `oracle` is the exact call set a perfect model makes; `oracleText` is a
// passing reply for call-nothing tasks. Tests use both.
export type FnInstance = SingleInstance & { oracle: ToolCall[] | null; oracleText?: string };

// A UTC timestamp written with zero seconds, milliseconds or +00:00 is the same
// instant; grade the time conversion, not the formatting.
const UTC_FORMS = /^(\d{4}-\d\d-\d\dT\d\d:\d\d)(?::00(?:\.0+)?)?(?:Z|\+00:?00)$/;
const sameInstant = (v: unknown) => (typeof v === 'string' && UTC_FORMS.test(v) ? `${v.match(UTC_FORMS)![1]}Z` : v);

// Arrays whose order carries no meaning are compared as sets.
function normalize(args: Record<string, unknown>, setKeys: string[]): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = setKeys.includes(k) && Array.isArray(v) ? [...v].map((x) => canon(x)).sort() : sameInstant(v);
  }
  return canon(out);
}

function gradeCalls(calls: ToolCall[], expected: Expect[], setKeys: string[] = [], ignoreKeys: string[] = []) {
  const issues: string[] = [];
  if (calls.some((c) => c.invalid !== undefined)) issues.push('malformed arguments');
  // Free-text fields a model may fill in without being wrong are left out of the match.
  if (ignoreKeys.length) {
    calls = calls.map((c) => ({ ...c, arguments: Object.fromEntries(Object.entries(c.arguments).filter(([k]) => !ignoreKeys.includes(k))) }));
  }
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

function single(tools: ToolDef[], user: string, expected: Expect[], opts: { setKeys?: string[]; ignoreKeys?: string[]; system?: string; toolResult?: (c: ToolCall) => string } = {}): FnInstance {
  return {
    kind: 'single',
    tools,
    messages: [...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []), { role: 'user' as const, content: user }],
    ...(opts.toolResult ? { toolResult: opts.toolResult } : {}),
    grade: (res) => gradeCalls(res.toolCalls, expected, opts.setKeys ?? [], opts.ignoreKeys ?? []),
    oracle: expected.map((e, i) => ({ id: `o${i}`, name: e.name, arguments: e.args })),
  };
}

// Right answer is "call nothing": decline, or ask for what's missing. A
// clarifying question must name the missing detail (any of `keywords`).
function noCall(tools: ToolDef[], user: string, mode: 'decline' | 'clarify', system: string, keywords: string[] = [], oracleText?: string): FnInstance {
  return {
    kind: 'single',
    tools,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    grade(res) {
      if (res.toolCalls.length) return { score: 0, detail: `called ${res.toolCalls.map((c) => c.name).join(',')} but should not have` };
      const t = res.text.trim();
      if (!t) return { score: 0, detail: 'empty reply' };
      if (mode === 'clarify') {
        const asks = t.includes('?');
        const names = keywords.some((k) => t.toLowerCase().includes(k));
        if (!asks || !names) return { score: 0.5, detail: `no call (good) but ${asks ? 'the question does not name the missing detail' : 'did not ask for the missing detail'}` };
        return { score: 1, detail: 'asked for the missing detail' };
      }
      return { score: 1, detail: 'correctly declined' };
    },
    oracle: null,
    oracleText: oracleText ?? (mode === 'decline' ? "I can't do that with the tools I have." : `Could you tell me the ${keywords[0]}?`),
  };
}

const DECLINE_SYSTEM = 'Only call a tool when it can actually do exactly what the user asks. If none can, say so briefly and call nothing.';

// A date a few weeks out, fixed per seed.
function baseDate(rng: Rng): number {
  return Date.UTC(2027, rng.int(0, 10), rng.int(1, 20));
}

// ── 1. time-zone conversion + a call that needs the first call's result ──────
const ZONES: Array<[string, number]> = [
  ['Tokyo', 540], ['Mumbai', 330], ['New York', -240], ['London', 60], ['Sydney', 600], ['Los Angeles', -420], ['Kathmandu', 345],
];

export const fncallParallelNested: V4Task = {
  id: 'fncall-parallel-nested-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const [city, off] = rng.pick(ZONES);
    const day = baseDate(rng);
    const h = rng.pick([6, 7, 8, 9, 17, 18, 21, 22]);
    const mi = rng.pick([0, 15, 30, 45]);
    const startUtc = utcMinute(day + (h * 60 + mi - off) * 60_000);
    const dur = rng.pick([30, 45, 60, 90]);
    const people = rng.shuffle(['ana', 'ben', 'chloe', 'dev', 'eli', 'fran']).slice(0, 2).map((n) => `${n}@acme.io`);
    const remind = rng.pick([10, 15, 30, 60]);
    const channel = rng.pick(['sms', 'push', 'email'] as const);
    const topic = rng.pick(['Q3 budget review', 'vendor onboarding', 'launch retro', 'hiring sync']);
    const eventId = `EV-${rng.int(10000, 99999)}`;
    return single(MENU,
      `Book "${topic}" on ${longDate(day)} at ${clock(h, mi)} ${city} time (${offsetLabel(off)}) for ${dur} minutes with ${people[0]} and ${people[1]}, ` +
      `with a ${channel.toUpperCase()} reminder ${remind} minutes before. Then message ${people[0]} on chat with exactly: ` +
      `"Booked ${topic}, event id <the event id the booking returns>".`,
      [
        { name: 'create_event', args: { title: topic, start_utc: startUtc, duration_min: dur, attendees: people, reminder: { channel, minutes_before: remind } } },
        { name: 'send_message', args: { to: people[0], text: `Booked ${topic}, event id ${eventId}` } },
      ],
      {
        setKeys: ['attendees'],
        toolResult: (c) => (c.name === 'create_event' ? JSON.stringify({ event_id: eventId, status: 'confirmed' }) : '{"ok": true}'),
      });
  },
};

// ── 2. abstention: a tool looks close but its scope doesn't cover the ask ────
export const fncallAbstain: V4Task = {
  id: 'fncall-abstain-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const ask = rng.pick([
      () => `Cancel my ${rng.pick(['FitLife gym', 'Spotify', 'city parking permit'])} membership before it renews on the ${rng.int(2, 28)}th.`,
      () => `Text my dentist at +1 416 555 0${rng.int(100, 199)} that I'll be ${rng.int(10, 30)} minutes late.`,
      () => `Convert ${rng.pick(['0.5', '1.25', '2'])} bitcoin to ${rng.pick(['euros', 'US dollars', 'pounds'])}.`,
      () => `Book me a table for ${rng.pick(['two', 'four', 'six'])} at ${rng.pick(['Canoe', 'Alo', 'Lee'])} tonight at ${rng.int(6, 9)}.`,
      () => `Unlock my car, it's parked in the ${rng.pick(['driveway', 'street', 'lot at work'])}.`,
    ])();
    return noCall(MENU, ask, 'decline', DECLINE_SYSTEM);
  },
};

// ── 3. compute the amount before converting ──────────────────────────────────
const CURRENCIES: Array<[string, string]> = [
  ['euros', 'EUR'], ['Japanese yen', 'JPY'], ['British pounds', 'GBP'], ['Swiss francs', 'CHF'],
  ['Canadian dollars', 'CAD'], ['Mexican pesos', 'MXN'], ['Indian rupees', 'INR'], ['Australian dollars', 'AUD'],
];

export const fncallSimpleCurrency: V4Task = {
  id: 'fncall-simple-currency-1',
  suite: 'fncall',
  difficulty: 2,
  build(rng) {
    const [from, to] = rng.shuffle(CURRENCIES).slice(0, 2);
    const cents = [0, 1, 2].map(() => rng.int(100, 4000) * 100 + rng.pick([0, 5, 25, 50, 75, 99]));
    const pct = rng.pick([5, 8, 10, 12, 15]);
    const total = cents.reduce((a, b) => a + b, 0);
    const discounted = Math.round((total * (100 - pct)) / 100);
    const money = (c: number) => `${Math.floor(c / 100).toLocaleString('en-US')}.${pad(c % 100)}`;
    return single(MENU,
      `I owe three suppliers ${money(cents[0])}, ${money(cents[1])} and ${money(cents[2])} ${from[0]}. ` +
      `We get ${pct}% off the total for paying early (round the discounted total to the nearest cent). Convert the discounted total into ${to[0]} for me.`,
      [{ name: 'convert_currency', args: { amount: discounted / 100, from: from[1], to: to[1] } }]);
  },
};

// ── 4. pick the one right tool out of 16 close relatives ─────────────────────
const ORDER_TOOLS: ToolDef[] = [
  { name: 'get_order_status', description: 'Fulfilment status of an order (processing, packed, shipped, delivered). No carrier tracking, no dates.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'get_order_details', description: 'Items, prices and addresses on an order.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'get_order_history', description: 'List all past orders for a customer email.', parameters: obj({ email: { type: 'string' } }, ['email']) },
  { name: 'track_shipment', description: 'Live carrier tracking events and the tracking number for a shipped order.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'get_delivery_estimate', description: 'Estimated delivery date only.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'cancel_order', description: 'Cancel a one-time order that has not shipped.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  { name: 'cancel_subscription', description: 'Permanently end a recurring subscription.', parameters: obj({ subscription_id: { type: 'string' } }, ['subscription_id']) },
  { name: 'pause_subscription', description: 'Pause a subscription for a number of whole months, then resume automatically.', parameters: obj({ subscription_id: { type: 'string' }, months: { type: 'integer', minimum: 1, maximum: 6 } }, ['subscription_id', 'months']) },
  { name: 'change_subscription_plan', description: 'Switch a subscription to another plan.', parameters: obj({ subscription_id: { type: 'string' }, plan: { type: 'string', enum: ['basic', 'plus', 'pro'] } }, ['subscription_id', 'plan']) },
  { name: 'return_item', description: 'Return one line of a delivered order for a refund.', parameters: obj({ order_id: { type: 'string' }, line_id: { type: 'string' } }, ['order_id', 'line_id']) },
  { name: 'exchange_item', description: 'Swap one line of a delivered order for another size of the same product.', parameters: obj({ order_id: { type: 'string' }, line_id: { type: 'string' }, new_size: { type: 'string' } }, ['order_id', 'line_id', 'new_size']) },
  { name: 'refund_order', description: 'Refund a whole delivered order.', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
  {
    name: 'update_shipping_address', description: 'Change the delivery address of an order that has not shipped.',
    parameters: obj({ order_id: { type: 'string' }, address: obj({ line1: { type: 'string' }, city: { type: 'string' }, postal_code: { type: 'string' }, country: { type: 'string', description: 'ISO 3166-1 alpha-2' } }, ['line1', 'city', 'postal_code', 'country']) }, ['order_id', 'address']),
  },
  { name: 'update_billing_address', description: 'Change the billing address on the customer account.', parameters: obj({ email: { type: 'string' }, address: { type: 'object' } }, ['email', 'address']) },
  { name: 'get_invoice', description: 'The tax (VAT) invoice document for an order.', parameters: obj({ order_id: { type: 'string' }, format: { type: 'string', enum: ['pdf', 'html', 'csv'] } }, ['order_id', 'format']) },
  { name: 'get_receipt', description: 'The card-payment receipt for an order (not a tax invoice).', parameters: obj({ order_id: { type: 'string' } }, ['order_id']) },
];

export const fncallMultipleNearMiss: V4Task = {
  id: 'fncall-multiple-near-miss-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const oid = `ORD-${rng.int(100000, 999999)}`;
    const sid = `SUB-${rng.int(1000, 9999)}`;
    const line = `L${rng.int(1, 4)}`;
    const months = rng.int(2, 4);
    const size = String(rng.pick([8, 9, 10, 11, 12]));
    const city = rng.pick([['Lyon', 'FR', '69002'], ['Porto', 'PT', '4050-123'], ['Graz', 'AT', '8010'], ['Leeds', 'GB', 'LS1 4DY']] as const);
    const street = `${rng.int(2, 180)} ${rng.pick(['Harbour Road', 'Mill Lane', 'Station Street', 'Park Avenue'])}`;
    const scenarios: Array<[string, Expect]> = [
      [`Can you put my plan ${sid} on hold for ${NUMBER_WORDS[months - 1]} months? I'll want it back after that, so don't cancel it.`, { name: 'pause_subscription', args: { subscription_id: sid, months } }],
      [`My accountant needs the VAT invoice for ${oid}, as a PDF please.`, { name: 'get_invoice', args: { order_id: oid, format: 'pdf' } }],
      [`The boots on line ${line} of ${oid} are too small. I still want them, just in a size ${size}.`, { name: 'exchange_item', args: { order_id: oid, line_id: line, new_size: size } }],
      [`When is ${oid} going to arrive? I just need the date, not the tracking history.`, { name: 'get_delivery_estimate', args: { order_id: oid } }],
      [`${oid} hasn't shipped yet. Please deliver it to ${street}, ${city[0]} ${city[2]}, country code ${city[1]}. My billing address stays the same.`,
        { name: 'update_shipping_address', args: { order_id: oid, address: { line1: street, city: city[0], postal_code: city[2], country: city[1] } } }],
    ];
    const [user, exp] = rng.pick(scenarios);
    return single(ORDER_TOOLS, user, [exp]);
  },
};

// ── 5. relative dates, one city dropped, several calls ───────────────────────
export const fncallParallelSame: V4Task = {
  id: 'fncall-parallel-same-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    // Today is a Monday to Thursday, so the coming weekend is within 7 days.
    let today = baseDate(rng);
    while (![1, 2, 3, 4].includes(new Date(today).getUTCDay())) today += DAY;
    const sat = today + (6 - new Date(today).getUTCDay()) * DAY;
    const sun = sat + DAY;
    const cities = rng.shuffle(['Lisbon', 'Oslo', 'Nairobi', 'Hanoi', 'Denver', 'Quito', 'Tallinn', 'Perth']).slice(0, 4);
    const skip = cities[rng.int(0, 3)];
    const keep = cities.filter((c) => c !== skip);
    const imperial = rng.next() < 0.5;
    const units = imperial ? 'imperial' : 'metric';
    return single(MENU,
      `Today is ${longDate(today)}. What's the weather looking like this coming Saturday and Sunday in ${cities.slice(0, -1).join(', ')} and ${cities[3]}? ` +
      `Actually, skip ${skip}, that trip is off. Temperatures in ${imperial ? 'Fahrenheit' : 'Celsius'} please.`,
      keep.flatMap((city) => [ymd(sat), ymd(sun)].map((date) => ({ name: 'get_forecast', args: { city, date, units } }))));
  },
};

// ── 6. several devices, Fahrenheit → rounded Celsius, a no-touch zone ────────
const ROOM_WORDS: Record<string, string> = { living_room: 'living room', bedroom: 'bedroom', office: 'office', kitchen: 'kitchen' };
export const toHalfC = (f: number) => Math.round(((f - 32) * 5 / 9) * 2) / 2;

export const fncallParallelMultiple: V4Task = {
  id: 'fncall-parallel-multiple-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const [r1, r2, r3, r4] = rng.shuffle(Object.keys(ROOM_WORDS));
    const f1 = rng.int(60, 78);
    const f2 = rng.int(60, 78);
    const bright = rng.pick([20, 35, 40, 60, 75]);
    const blinds = rng.pick([0, 25, 50]);
    const door = rng.pick(['front', 'back'] as const);
    const blindsWords = blinds === 0 ? 'close the blinds fully' : blinds === 50 ? 'close the blinds halfway' : 'leave the blinds a quarter open';
    return single(MENU,
      `Going to bed. Thermostats take Celsius, so convert and round to the nearest half degree: ${ROOM_WORDS[r1]} to ${f1}°F, ${ROOM_WORDS[r2]} to ${f2}°F. ` +
      `Switch the ${ROOM_WORDS[r3]} lights off, put the ${ROOM_WORDS[r2]} lights on at ${bright}%, in the ${ROOM_WORDS[r4]} ${blindsWords}, and lock the ${door} door. ` +
      `Leave the garage alone, someone's still out.`,
      [
        { name: 'set_thermostat', args: { room: r1, celsius: toHalfC(f1) } },
        { name: 'set_thermostat', args: { room: r2, celsius: toHalfC(f2) } },
        { name: 'set_lights', args: { room: r3, on: false } },
        { name: 'set_lights', args: { room: r2, on: true, brightness_pct: bright } },
        { name: 'set_blinds', args: { room: r4, open_pct: blinds } },
        { name: 'lock_door', args: { door, locked: true } },
      ]);
  },
};

// ── 7. nested invoice: a line left off, a discount, net terms, optional PO ───
export const fncallNestedArray: V4Task = {
  id: 'fncall-nested-array-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const name = rng.pick(['Harbor Coffee Co', 'Pine & Oak Studio', 'Nordlys Labs', 'Blue Heron Dental']);
    const email = `billing@${name.toLowerCase().replace(/[^a-z]+/g, '')}.com`;
    const cur = rng.pick([['USD', 'US dollars'], ['EUR', 'euros'], ['GBP', 'pounds sterling'], ['CAD', 'Canadian dollars']] as const);
    const issued = baseDate(rng);
    const net = rng.pick([14, 30, 45]);
    const items = rng.shuffle(['WID-100', 'WID-220', 'SVC-HR', 'CAB-3M', 'KIT-PRO']).slice(0, 3).map((sku) => ({
      sku, quantity: rng.int(2, 12), cents: rng.int(5, 400) * 100 + rng.pick([0, 50, 99]),
    }));
    const disc = rng.int(0, 2);
    const pct = rng.pick([10, 15, 20]);
    const po = rng.next() < 0.5 ? `PO-${rng.int(1000, 9999)}-${rng.pick(['A', 'B', 'C'])}` : null;
    const lines = items.map((i) => `${NUMBER_WORDS[i.quantity - 1]} of ${i.sku} at ${(i.cents / 100).toFixed(2)} each`).join('; ');
    const expected = items.map((i, k) => ({
      sku: i.sku, quantity: i.quantity,
      unit_price: (k === disc ? Math.round((i.cents * (100 - pct)) / 100) : i.cents) / 100,
    }));
    const args: Record<string, unknown> = { customer: { name, email }, currency: cur[0], due_date: ymd(issued + net * DAY), line_items: expected };
    if (po) args.po_number = po;
    return single(MENU,
      `Invoice the customer "${name}" (${email}) in ${cur[1]}: ${lines}; plus the delivery fee of 25.00, but leave that off, they're collecting in person. ` +
      `Give them ${pct}% off the unit price of ${items[disc].sku}. Issued ${longDate(issued)}, payment due net ${net} days. ` +
      `${po ? `Their PO number is ${po}.` : "They don't use PO numbers."}`,
      [{ name: 'create_invoice', args }],
      { setKeys: ['line_items'], ignoreKeys: ['notes'] });
  },
};

// ── 8. enums, with the category list given as "everything except" ───────────
const ALL_CATS = ['billing', 'security', 'product_updates', 'marketing', 'shipping'];
const CAT_WORDS: Record<string, string> = { billing: 'billing', security: 'security alerts', product_updates: 'new features', marketing: 'promotions', shipping: 'delivery updates' };

export const fncallEnums: V4Task = {
  id: 'fncall-enums-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const ch = rng.pick([['sms', 'by text'], ['push', 'as phone notifications'], ['email', 'by email']] as const);
    const fr = rng.pick([['daily', 'as a once-a-day digest'], ['weekly', 'in a weekly roundup'], ['hourly', 'bundled up every hour'], ['realtime', 'the moment anything happens']] as const);
    const excluded = rng.shuffle(ALL_CATS).slice(0, 2);
    const quiet = rng.next() < 0.5;
    return single(MENU,
      `Update my notifications: send them ${ch[1]}, ${fr[1]}, about everything except ${CAT_WORDS[excluded[0]]} and ${CAT_WORDS[excluded[1]]}. ` +
      `${quiet ? "And don't buzz me overnight." : 'Overnight is fine, no quiet hours.'} (Leave my legal marketing consent as it is.)`,
      [{ name: 'set_notification_preferences', args: { channel: ch[0], frequency: fr[0], categories: ALL_CATS.filter((c) => !excluded.includes(c)), quiet_hours: quiet } }],
      { setKeys: ['categories'] });
  },
};

// ── 9. local time → UTC, words → minutes, EUR budget → whole USD ─────────────
const DURATIONS: Array<[string, number]> = [
  ['two and a half hours', 150], ['an hour and forty-five minutes', 105], ['three hours', 180],
  ['ninety minutes', 90], ['four and a quarter hours', 255], ['forty minutes', 40],
];

export const fncallTypesUnits: V4Task = {
  id: 'fncall-types-units-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const server = `web-${pad(rng.int(1, 40))}`;
    const [durWords, durMin] = rng.pick(DURATIONS);
    const [city, off] = rng.pick(ZONES);
    const day = baseDate(rng);
    const h = rng.pick([0, 1, 2, 3, 22, 23]);
    const startUtc = utcMinute(day + (h * 60 - off) * 60_000);
    const notify = rng.next() < 0.5;
    const eurK = rng.pick([1.2, 2.5, 0.8, 3.75]);
    const rate = rng.pick([1.08, 1.1, 1.12]);
    return single(MENU,
      `Schedule maintenance on ${server} starting ${clock(h, 0)} ${city} time (${offsetLabel(off)}) on ${longDate(day)}, lasting ${durWords}. ` +
      `${notify ? 'Tell customers beforehand.' : 'No need to tell customers.'} Budget is up to €${eurK}k; use 1 EUR = ${rate} USD and round to whole dollars.`,
      [{ name: 'schedule_maintenance', args: { server_id: server, start_utc: startUtc, duration_min: durMin, notify_customers: notify, max_cost_usd: Math.round(eurK * 1000 * rate) } }]);
  },
};

// ── 10. numeric-looking strings stay strings; pounds/ounces → kg ─────────────
export const fncallTypesStrings: V4Task = {
  id: 'fncall-types-strings-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const zip = `0${rng.int(1000, 9999)}`;
    const acct = `00${rng.int(100000, 999999)}`;
    const lb = rng.int(1, 30);
    const oz = rng.int(1, 15);
    const kg = Math.round((lb + oz / 16) * 0.4536 * 100) / 100;
    const pieces = rng.int(2, 6);
    const fragile = rng.next() < 0.5;
    return single(MENU,
      `Ship ${NUMBER_WORDS[pieces - 1]} boxes, ${lb} lb ${oz} oz altogether, to ZIP ${zip}, billed to account ${acct}. ` +
      `${fragile ? "There's glassware inside." : "It's just paperback books."} Don't bother quoting it first, just create the label.`,
      [{ name: 'create_shipment', args: { recipient_zip: zip, account_number: acct, weight_kg: kg, pieces, fragile } }]);
  },
};

// ── 11. optional filters: stated preferences that are NOT requirements ────────
const AIRPORTS: Array<[string, string]> = [
  ['Toronto Pearson', 'YYZ'], ['Lisbon', 'LIS'], ['Tokyo Haneda', 'HND'], ['Denver', 'DEN'],
  ['Amsterdam Schiphol', 'AMS'], ['Mexico City', 'MEX'], ['Singapore Changi', 'SIN'], ["Chicago O'Hare", 'ORD'],
];

export function firstWeekdayOfNextMonth(today: number, weekday: number): number {
  const d = new Date(today);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  while (new Date(t).getUTCDay() !== weekday) t += DAY;
  return t;
}

export const fncallOptionalOmit: V4Task = {
  id: 'fncall-optional-omit-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const [a, b] = rng.shuffle(AIRPORTS).slice(0, 2);
    const today = baseDate(rng);
    const wd = rng.int(1, 5);
    const depart = firstWeekdayOfNextMonth(today, wd);
    return single(MENU,
      `Today is ${longDate(today)}. Find one-way flights from ${a[0]} (${a[1]}) to ${b[0]} (${b[1]}) on the first ${WEEKDAYS[wd]} of next month. ` +
      `I usually fly ${rng.pick(['business', 'premium economy'])} and prefer nonstop, but honestly neither matters this time. Just show me everything.`,
      [{ name: 'search_flights', args: { origin: a[1], destination: b[1], depart_date: ymd(depart) } }]);
  },
};

// ── 12. required filters + book the right result from the search ─────────────
export const fncallOptionalInclude: V4Task = {
  id: 'fncall-optional-include-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const [a, b] = rng.shuffle(AIRPORTS).slice(0, 2);
    const depart = baseDate(rng);
    const stay = rng.int(3, 8);
    const cabin = rng.pick([['business', 'business class'], ['premium_economy', 'premium economy'], ['first', 'first class']] as const);
    const budget = rng.pick([2500, 3000, 4000]);
    const ids = rng.shuffle(['FL-1107', 'FL-2291', 'FL-3380', 'FL-4452', 'FL-5536']);
    const best = budget - rng.int(200, 600);
    // The search returns a mix: the right pick is the cheapest nonstop in the
    // asked cabin under budget. Cheaper wrong options sit next to it.
    const options = rng.shuffle([
      { flight_id: ids[0], price_usd: best, stops: 0, cabin: cabin[0] },
      { flight_id: ids[1], price_usd: best - rng.int(150, 400), stops: 1, cabin: cabin[0] },
      { flight_id: ids[2], price_usd: best + rng.int(100, 300), stops: 0, cabin: cabin[0] },
      { flight_id: ids[3], price_usd: best - rng.int(500, 900), stops: 0, cabin: 'economy' },
      { flight_id: ids[4], price_usd: budget + rng.int(100, 500), stops: 0, cabin: cabin[0] },
    ]);
    const search = { origin: a[1], destination: b[1], depart_date: ymd(depart), return_date: ymd(depart + stay * DAY), cabin: cabin[0], max_stops: 0, max_price_usd: budget };
    return single(MENU,
      `Round trip ${a[0]} (${a[1]}) to ${b[0]} (${b[1]}): leave ${longDate(depart)}, come back ${stay} days later. ` +
      `${cabin[1]} only, nonstop only, and no more than $${budget.toLocaleString('en-US')}. Book the cheapest option that meets all of that.`,
      [{ name: 'search_flights', args: search }, { name: 'book_flight', args: { flight_id: ids[0] } }],
      {
        toolResult: (c) => (c.name === 'search_flights'
          ? JSON.stringify({ note: 'results may include options outside your filters', options })
          : '{"ok": true}'),
      });
  },
};

// ── 13. relevance: the forecast tool looks right but can't answer ────────────
export const fncallAbstainLookalike: V4Task = {
  id: 'fncall-abstain-lookalike-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const city = rng.pick(['Paris', 'Montreal', 'Kyoto', 'Cape Town', 'Reykjavik']);
    const ask = rng.pick([
      () => `What was the weather in ${city} on ${MONTHS[rng.int(0, 11)]} ${rng.int(1, 28)}, ${rng.int(2011, 2019)}? I need the actual recorded conditions.`,
      () => `Today is ${longDate(baseDate(rng))}. What will the weather be in ${city} exactly ${rng.int(12, 20)} days from today?`,
      () => `What's the air quality index in ${city} tomorrow? I have asthma.`,
      () => `Will there be northern lights visible from ${city} tomorrow night?`,
    ])();
    return noCall(MENU, ask, 'decline', DECLINE_SYSTEM);
  },
};

// ── 14. a required argument is missing: ask, naming what's missing ───────────
export const fncallClarifyMissing: V4Task = {
  id: 'fncall-clarify-missing-1',
  suite: 'fncall',
  difficulty: 3,
  build(rng) {
    const variant = rng.pick([
      () => ({ user: `Book me a flight to ${rng.pick(['Lisbon', 'Denver', 'Tokyo'])} on ${MONTHS[rng.int(0, 11)]} ${rng.int(1, 28)}, 2027. Cheapest is fine.`, keys: ['from', 'origin', 'depart', 'leaving', 'airport'], text: 'Which airport will you be flying from?' }),
      () => ({ user: `Ship the ${NUMBER_WORDS[rng.int(1, 4)]} boxes to my sister, account 00${rng.int(100000, 999999)}, about ${rng.int(2, 9)} kg, nothing fragile.`, keys: ['zip', 'postal', 'address', 'where'], text: "What's your sister's ZIP code?" }),
      () => ({ user: `Schedule maintenance on web-${pad(rng.int(1, 40))} for ${rng.pick(['two hours', 'ninety minutes'])}, notify customers, budget $${rng.int(5, 30)}00.`, keys: ['when', 'time', 'start', 'date', 'day'], text: 'When should the maintenance start?' }),
    ])();
    return noCall(MENU, variant.user, 'clarify',
      'Never invent or assume values for required tool arguments. If something required is missing, ask the user for it instead of calling a tool.',
      variant.keys, variant.text);
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
