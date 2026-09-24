// FNCALL suite grader tests: for every task and several seeds, the scripted
// correct call set scores 1 and plausible near-misses score below 1. Where an
// argument has to be computed (time zones, dates, units, discounts), an
// independent solver re-derives it from the prompt text and must agree.
// Run: npx tsx test/v4-fncall.test.ts   (no Docker, no model calls)
import { taskRng } from '../src/v4/rng.js';
import { FNCALL_TASKS, type FnInstance } from '../src/v4/tasks/fncall.js';
import type { ChatResponse, GradeContext, ToolCall } from '../src/v4/types.js';

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  checks++;
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctx = {} as GradeContext; // fncall graders never touch the sandbox
const resp = (toolCalls: ToolCall[], text = ''): ChatResponse => ({ text, toolCalls, latencyMs: 1 });
const SEEDS = ['s1', 's2', 's3', 'alpha', 'beta', 'x9', 'q7', 'k2', 'z0', 'm5'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const task = (id: string) => FNCALL_TASKS.find((t) => t.id === id)!;
const build = (id: string, seed: string) => task(id).build(taskRng(seed, id)) as FnInstance;
const promptOf = (inst: FnInstance) => inst.messages.map((m) => ('content' in m ? m.content : '')).join('\n');
async function score(inst: FnInstance, calls: ToolCall[], text = '') {
  return (await inst.grade(resp(calls, text), ctx)).score;
}
const argOf = (inst: FnInstance, name: string) => inst.oracle!.find((c) => c.name === name)!.arguments;

// Parse "Wednesday, March 10, 2027" → UTC ms, via Date.parse on a plain form.
const parseLongDate = (s: string) => {
  const m = s.match(/(\w+) (\d+), (\d{4})/)!;
  return Date.UTC(Number(m[3]), MONTHS.indexOf(m[1]), Number(m[2]));
};
const iso = (t: number) => new Date(t).toISOString();
// "UTC+5:45" / "UTC-4" → minutes
const parseOffset = (s: string) => {
  const m = s.match(/UTC([+-])(\d+)(?::(\d+))?/)!;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
};
const to24 = (h: number, ap: string) => (ap === 'PM' ? (h % 12) + 12 : h % 12);

// Generic near-misses derived from an oracle call set.
function nearMisses(oracle: ToolCall[]): Array<[string, ToolCall[]]> {
  const out: Array<[string, ToolCall[]]> = [];
  out.push(['no calls', []]);
  if (oracle.length > 1) out.push(['drops one call', oracle.slice(1)]);
  out.push(['extra unneeded call', [...oracle, { id: 'z', name: 'get_exchange_rate', arguments: { from: 'EUR', to: 'USD' } }]]);
  out.push(['duplicated call', [...oracle, clone(oracle[0])]]);
  const first = oracle[0];
  const key = Object.keys(first.arguments).find((k) => ['string', 'number', 'boolean'].includes(typeof first.arguments[k]));
  if (key) {
    const v = first.arguments[key];
    const wrongType = typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : Number.isNaN(Number(v)) ? 7 : Number(v);
    const wrongValue = typeof v === 'number' ? v + 1 : typeof v === 'boolean' ? !v : `${v}x`;
    for (const [label, val] of [['wrong type', wrongType], ['wrong value', wrongValue]] as const) {
      const m = clone(oracle);
      m[0].arguments[key] = val;
      out.push([`${label} on ${key}`, m]);
    }
  }
  out.push(['malformed arguments', oracle.map((c, i) => (i === 0 ? { ...c, arguments: {}, invalid: '{oops' } : c))]);
  return out;
}

// ── every task: oracle passes, order-free, near-misses fail ───────────────────
for (const t of FNCALL_TASKS) {
  for (const seed of SEEDS.slice(0, 7)) {
    const inst = t.build(taskRng(seed, t.id)) as FnInstance;
    if (inst.oracle === null) {
      check(`${t.id} its passing reply scores 1 [${seed}]`, (await score(inst, [], inst.oracleText!)) === 1, inst.oracleText);
      check(`${t.id} any call fails [${seed}]`, (await score(inst, [{ id: 'x', name: 'send_email', arguments: { to: 'a@b.c', subject: 's', body: 'b' } }])) === 0);
      check(`${t.id} empty reply fails [${seed}]`, (await score(inst, [], '')) === 0);
      continue;
    }
    check(`${t.id} oracle passes [${seed}]`, (await score(inst, inst.oracle)) === 1, (await inst.grade(resp(inst.oracle), ctx)).detail);
    check(`${t.id} call order does not matter [${seed}]`, (await score(inst, [...inst.oracle].reverse())) === 1);
    for (const [label, calls] of nearMisses(inst.oracle)) {
      const s = await score(inst, calls);
      check(`${t.id} ${label} scores < 1 [${seed}]`, s < 1, `got ${s}`);
    }
  }
}

// ── independent solvers for computed arguments ─────────────────────────────────
for (const seed of SEEDS) {
  // 1. local time → UTC, and the second call's text carries the returned id.
  {
    const inst = build('fncall-parallel-nested-1', seed);
    const p = promptOf(inst);
    const [, date, h, mi, ap] = p.match(/on (\w+, \w+ \d+, \d{4}) at (\d+):(\d+) (AM|PM)/)!;
    const want = iso(parseLongDate(date) + (to24(Number(h), ap) * 60 + Number(mi) - parseOffset(p)) * 60_000).slice(0, 16) + 'Z';
    check(`nested: independent UTC matches [${seed}]`, argOf(inst, 'create_event').start_utc === want, `${argOf(inst, 'create_event').start_utc} vs ${want}`);
    const result = JSON.parse(inst.toolResult!({ id: 'c', name: 'create_event', arguments: argOf(inst, 'create_event') }));
    check(`nested: message quotes the id the booking returns [${seed}]`, String(argOf(inst, 'send_message').text).endsWith(result.event_id));
    const placeholder = clone(inst.oracle!);
    placeholder.find((c) => c.name === 'send_message')!.arguments.text = String(argOf(inst, 'send_message').text).replace(result.event_id, '<event id>');
    check(`nested: placeholder text instead of the id fails [${seed}]`, (await score(inst, placeholder)) < 1);
    const local = clone(inst.oracle!);
    local.find((c) => c.name === 'create_event')!.arguments.start_utc = `${iso(parseLongDate(date)).slice(0, 10)}T${String(to24(Number(h), ap)).padStart(2, '0')}:${mi}Z`;
    if (local[0].arguments.start_utc !== argOf(inst, 'create_event').start_utc) check(`nested: local time sent as UTC fails [${seed}]`, (await score(inst, local)) < 1);
  }
  // UTC timestamps: equivalent spellings pass, a different minute does not.
  {
    const inst = build('fncall-types-units-1', seed);
    const base = String(argOf(inst, 'schedule_maintenance').start_utc);
    for (const form of [base.replace('Z', ':00Z'), base.replace('Z', ':00.000Z'), base.replace('Z', '+00:00')]) {
      const o = clone(inst.oracle!);
      o[0].arguments.start_utc = form;
      check(`utc: ${form.slice(16)} spelling accepted [${seed}]`, (await score(inst, o)) === 1);
    }
    const o = clone(inst.oracle!);
    o[0].arguments.start_utc = base.replace(/:(\d\d)Z$/, (_m, mm) => `:${String((Number(mm) + 1) % 60).padStart(2, '0')}Z`);
    check(`utc: a different minute fails [${seed}]`, (await score(inst, o)) < 1);
  }
  // 3. discount then convert.
  {
    const inst = build('fncall-simple-currency-1', seed);
    const p = promptOf(inst);
    const amounts = [...p.matchAll(/([\d,]+\.\d\d)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, '')) * 100));
    const pct = Number(p.match(/get (\d+)% off/)![1]);
    const want = Math.round(amounts.reduce((a, b) => a + b, 0) * (100 - pct) / 100) / 100;
    check(`currency: independent discounted amount matches [${seed}]`, argOf(inst, 'convert_currency').amount === want, `${argOf(inst, 'convert_currency').amount} vs ${want}`);
    const raw = clone(inst.oracle!);
    raw[0].arguments.amount = amounts.reduce((a, b) => a + b, 0) / 100;
    check(`currency: undiscounted total fails [${seed}]`, (await score(inst, raw)) < 1);
  }
  // 5. coming Saturday and Sunday, skipped city excluded.
  {
    const inst = build('fncall-parallel-same-1', seed);
    const p = promptOf(inst);
    const today = parseLongDate(p.match(/Today is (\w+, \w+ \d+, \d{4})/)![1]);
    let sat = today;
    while (new Date(sat).getUTCDay() !== 6) sat += 86_400_000;
    const dates = new Set(inst.oracle!.map((c) => c.arguments.date));
    check(`forecast: dates are the coming weekend [${seed}]`, dates.size === 2 && dates.has(iso(sat).slice(0, 10)) && dates.has(iso(sat + 86_400_000).slice(0, 10)), [...dates].join(','));
    const skip = p.match(/skip (\w+)/)![1];
    check(`forecast: skipped city not in the oracle [${seed}]`, inst.oracle!.every((c) => c.arguments.city !== skip) && inst.oracle!.length === 6);
    const withSkip = [...inst.oracle!, { id: 'k', name: 'get_forecast', arguments: { ...inst.oracle![0].arguments, city: skip } }];
    check(`forecast: including the skipped city fails [${seed}]`, (await score(inst, withSkip)) < 1);
  }
  // 6. Fahrenheit → nearest half degree Celsius.
  {
    const inst = build('fncall-parallel-multiple-1', seed);
    const p = promptOf(inst);
    const fs = [...p.matchAll(/to (\d+)°F/g)].map((m) => Number(m[1]));
    const want = fs.map((f) => Math.round(((f - 32) / 1.8) * 2) / 2);
    const got = inst.oracle!.filter((c) => c.name === 'set_thermostat').map((c) => c.arguments.celsius);
    check(`home: independent Celsius matches [${seed}]`, JSON.stringify(got) === JSON.stringify(want), `${got} vs ${want}`);
    const rawF = clone(inst.oracle!);
    rawF.find((c) => c.name === 'set_thermostat')!.arguments.celsius = fs[0];
    check(`home: Fahrenheit passed raw fails [${seed}]`, (await score(inst, rawF)) < 1);
    const garage = [...inst.oracle!, { id: 'g', name: 'lock_door', arguments: { door: 'garage', locked: true } }];
    check(`home: touching the garage fails [${seed}]`, (await score(inst, garage)) < 1);
  }
  // 7. invoice: net terms, discount, excluded line, PO only when given.
  {
    const inst = build('fncall-nested-array-1', seed);
    const p = promptOf(inst);
    const a = argOf(inst, 'create_invoice');
    const issued = parseLongDate(p.match(/Issued (\w+, \w+ \d+, \d{4})/)![1]);
    const net = Number(p.match(/net (\d+) days/)![1]);
    check(`invoice: independent due date matches [${seed}]`, a.due_date === iso(issued + net * 86_400_000).slice(0, 10));
    const pct = Number(p.match(/Give them (\d+)% off the unit price of (\S+)\./)![1]);
    const sku = p.match(/Give them \d+% off the unit price of (\S+)\./)![1];
    const listed = Number(p.match(new RegExp(`of ${sku} at ([\\d.]+) each`))![1]);
    const line = (a.line_items as Array<{ sku: string; unit_price: number }>).find((l) => l.sku === sku)!;
    check(`invoice: independent discounted price matches [${seed}]`, line.unit_price === Math.round(listed * (100 - pct)) / 100, `${line.unit_price}`);
    const noted = clone(inst.oracle!);
    noted[0].arguments.notes = 'Delivery fee waived, customer collecting.';
    check(`invoice: an added free-text note is ignored [${seed}]`, (await score(inst, noted)) === 1);
    const withFee = clone(inst.oracle!);
    (withFee[0].arguments.line_items as unknown[]).push({ sku: 'DELIVERY', quantity: 1, unit_price: 25 });
    check(`invoice: including the waived delivery fee fails [${seed}]`, (await score(inst, withFee)) < 1);
    const po = clone(inst.oracle!);
    if (po[0].arguments.po_number) delete po[0].arguments.po_number; else po[0].arguments.po_number = 'PO-0000-A';
    check(`invoice: wrong PO handling fails [${seed}]`, (await score(inst, po)) < 1);
  }
  // 8. "everything except" → complement set, consent tool untouched.
  {
    const inst = build('fncall-enums-1', seed);
    const cats = argOf(inst, 'set_notification_preferences').categories as string[];
    check(`enums: complement has 3 categories [${seed}]`, cats.length === 3);
    const all5 = clone(inst.oracle!);
    all5[0].arguments.categories = ['billing', 'security', 'product_updates', 'marketing', 'shipping'];
    check(`enums: sending all five fails [${seed}]`, (await score(inst, all5)) < 1);
    check(`enums: also touching marketing consent fails [${seed}]`, (await score(inst, [...inst.oracle!, { id: 'm', name: 'set_marketing_consent', arguments: { consent: false } }])) < 1);
  }
  // 9. maintenance: UTC and EUR → USD.
  {
    const inst = build('fncall-types-units-1', seed);
    const p = promptOf(inst);
    const a = argOf(inst, 'schedule_maintenance');
    const [, h, , ap] = p.match(/starting (\d+):(\d+) (AM|PM)/)!;
    const date = parseLongDate(p.match(/on (\w+, \w+ \d+, \d{4})/)![1]);
    const want = iso(date + (to24(Number(h), ap) * 60 - parseOffset(p)) * 60_000).slice(0, 16) + 'Z';
    check(`maintenance: independent UTC matches [${seed}]`, a.start_utc === want, `${a.start_utc} vs ${want}`);
    const eur = Number(p.match(/€([\d.]+)k/)![1]) * 1000;
    const rate = Number(p.match(/1 EUR = ([\d.]+) USD/)![1]);
    check(`maintenance: independent USD budget matches [${seed}]`, a.max_cost_usd === Math.round(eur * rate));
    const unconverted = clone(inst.oracle!);
    unconverted[0].arguments.max_cost_usd = eur;
    check(`maintenance: EUR amount sent as USD fails [${seed}]`, (await score(inst, unconverted)) < 1);
  }
  // 10. lb/oz → kg, leading zeros kept.
  {
    const inst = build('fncall-types-strings-1', seed);
    const p = promptOf(inst);
    const [, lb, oz] = p.match(/(\d+) lb (\d+) oz/)!;
    const want = Math.round((Number(lb) + Number(oz) / 16) * 0.4536 * 100) / 100;
    check(`shipment: independent kg matches [${seed}]`, argOf(inst, 'create_shipment').weight_kg === want);
    const zipNum = clone(inst.oracle!);
    zipNum[0].arguments.recipient_zip = Number(zipNum[0].arguments.recipient_zip);
    check(`shipment: ZIP as a number fails [${seed}]`, (await score(inst, zipNum)) < 1);
    const pounds = clone(inst.oracle!);
    pounds[0].arguments.weight_kg = Number(lb) + Number(oz) / 16;
    check(`shipment: pounds instead of kg fails [${seed}]`, (await score(inst, pounds)) < 1);
    check(`shipment: quoting first as well fails [${seed}]`, (await score(inst, [{ id: 'q', name: 'get_shipping_quote', arguments: { recipient_zip: zipNum[0].arguments.recipient_zip, weight_kg: want } }, ...inst.oracle!])) < 1);
  }
  // 11. first <weekday> of next month; stated non-requirements omitted.
  {
    const inst = build('fncall-optional-omit-1', seed);
    const p = promptOf(inst);
    const today = new Date(parseLongDate(p.match(/Today is (\w+, \w+ \d+, \d{4})/)![1]));
    const wd = WEEKDAYS.indexOf(p.match(/the first (\w+) of next month/)![1]);
    let d = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1);
    while (new Date(d).getUTCDay() !== wd) d += 86_400_000;
    check(`omit: independent depart date matches [${seed}]`, argOf(inst, 'search_flights').depart_date === iso(d).slice(0, 10));
    for (const [k, v] of [['cabin', 'business'], ['max_stops', 0]] as const) {
      const o = clone(inst.oracle!);
      o[0].arguments[k] = v;
      check(`omit: adding ${k} the traveller waived fails [${seed}]`, (await score(inst, o)) < 1);
    }
  }
  // 12. required filters, then book the cheapest option that truly fits.
  {
    const inst = build('fncall-optional-include-1', seed);
    const p = promptOf(inst);
    const search = argOf(inst, 'search_flights');
    const { options } = JSON.parse(inst.toolResult!({ id: 's', name: 'search_flights', arguments: search }));
    const budget = Number(p.match(/no more than \$([\d,]+)/)![1].replace(/,/g, ''));
    const fits = options.filter((o: { stops: number; cabin: string; price_usd: number }) => o.stops === 0 && o.cabin === search.cabin && o.price_usd <= budget)
      .sort((x: { price_usd: number }, y: { price_usd: number }) => x.price_usd - y.price_usd);
    check(`include: independent pick matches the booking [${seed}]`, argOf(inst, 'book_flight').flight_id === fits[0].flight_id);
    const cheapest = [...options].sort((x: { price_usd: number }, y: { price_usd: number }) => x.price_usd - y.price_usd)[0];
    const wrongBook = clone(inst.oracle!);
    wrongBook.find((c) => c.name === 'book_flight')!.arguments.flight_id = cheapest.flight_id;
    check(`include: booking the cheapest non-fitting option fails [${seed}]`, cheapest.flight_id !== fits[0].flight_id && (await score(inst, wrongBook)) < 1);
    const noStops = clone(inst.oracle!);
    delete noStops.find((c) => c.name === 'search_flights')!.arguments.max_stops;
    check(`include: dropping max_stops fails [${seed}]`, (await score(inst, noStops)) < 1);
    const searchOnly = inst.oracle!.filter((c) => c.name === 'search_flights');
    check(`include: search without booking is partial [${seed}]`, (await score(inst, searchOnly)) === 0.25);
  }
  // 14. clarify must name the missing detail.
  {
    const inst = build('fncall-clarify-missing-1', seed);
    check(`clarify: a vague question is partial [${seed}]`, (await score(inst, [], 'Sure, anything else?')) === 0.5);
    check(`clarify: a statement is partial [${seed}]`, (await score(inst, [], 'Okay, I will do that.')) === 0.5);
  }
}

// ── suite shape ────────────────────────────────────────────────────────────────
{
  const ids = new Set(FNCALL_TASKS.map((t) => t.id));
  check('14 fncall tasks with unique ids', FNCALL_TASKS.length === 14 && ids.size === 14, `${FNCALL_TASKS.length} tasks, ${ids.size} ids`);
  check('all tasks are in the fncall suite', FNCALL_TASKS.every((t) => t.suite === 'fncall'));
  for (const t of FNCALL_TASKS) {
    const variety = new Set(SEEDS.map((s) => JSON.stringify(t.build(taskRng(s, t.id)).messages)));
    check(`${t.id} varies by seed`, variety.size >= 3, `${variety.size} distinct`);
  }
  const menu = (build('fncall-parallel-nested-1', 's1').tools ?? []).length;
  check('shared menu has at least 20 tools', menu >= 20, String(menu));
}

console.log(failures ? `\n${failures} of ${checks} FAILED` : `\nall ${checks} fncall grader tests passed`);
process.exit(failures ? 1 : 0);
