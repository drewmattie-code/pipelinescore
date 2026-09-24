import type { Rng, V4Task } from '../types.js';

// Long-document suite: 12K–16K-token synthetic records. Every answer needs a
// few specific facts LOCATED in distant sections (retrieval + cross-reference),
// never an aggregate over hundreds of lines — the v4 pilot showed aggregation
// tasks just burn a reasoning model's budget.

export const DOC_MIN_CHARS = 45_000;
export const DOC_MAX_CHARS = 64_000;
export const NOT_IN_DOC = 'NOT_IN_DOCUMENT';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FIRST = ['Maya', 'Omar', 'Priya', 'Lucas', 'Ines', 'Theo', 'Aiko', 'Sam', 'Nadia', 'Felix', 'Rosa', 'Kwame', 'Elena', 'Jonas', 'Leila', 'Marco', 'Hana', 'Diego', 'Ruth', 'Viktor'];
const LAST = ['Chen', 'Okafor', 'Silva', 'Novak', 'Haddad', 'Larsen', 'Moreau', 'Tanaka', 'Rossi', 'Kowalski', 'Mensah', 'Ortiz', 'Brandt', 'Ivanova', 'Nakamura', 'Dubois'];

// Filler prose deliberately has no digits and none of the answer vocabulary
// (team, clause, amendment, model, finding), so it can't collide with a key.
const SUBJ = ['The regional desk', 'Facilities', 'The audit committee', 'Procurement', 'The night shift', 'Quality assurance', 'The planning office', 'Site security', 'The training group', 'Customer operations', 'The records office', 'Logistics'];
const VERB = ['reviewed', 'flagged', 'deferred', 'approved', 'revisited', 'documented', 'summarised', 'circulated', 'questioned', 'archived'];
const OBJ = ['the quarterly staffing plan', 'badge access logs', 'the vendor scorecard', 'spare-parts inventory', 'the visitor sign-in process', 'weekend coverage rules', 'the parking allocation', 'meeting room bookings', 'the travel request backlog', 'printer maintenance notes', 'the onboarding checklist', 'desk moves on the third floor'];
const TAIL = ['with no further action required.', 'pending sign-off next cycle.', 'after a short discussion.', 'and asked for a cleaner summary.', 'without changing the current practice.', 'and noted the usual exceptions.', 'ahead of the next review.', 'and shared the notes with the wider office.'];

function prose(rng: Rng, chars: number): string[] {
  const paras: string[] = [];
  let total = 0;
  while (total < chars) {
    const n = rng.int(3, 6);
    const p = Array.from({ length: n }, () => `${rng.pick(SUBJ)} ${rng.pick(VERB)} ${rng.pick(OBJ)} ${rng.pick(TAIL)}`).join(' ');
    paras.push(p);
    total += p.length + 1;
  }
  return paras;
}

// Build a document from ordered parts; `null` parts are filler slots that share
// whatever length is left to land the doc inside the target window.
function assemble(rng: Rng, parts: Array<string[] | null>): string {
  const core = parts.filter((p): p is string[] => p !== null).reduce((a, p) => a + p.join('\n').length + 1, 0);
  const slots = parts.filter((p) => p === null).length;
  const target = rng.int(50_000, 56_000);
  const each = Math.max(500, Math.floor((target - core) / Math.max(1, slots)));
  let noteNo = 0;
  return parts
    .map((p) => (p === null ? [`## Office notes, part ${['one', 'two', 'three', 'four'][noteNo++] ?? 'more'}`, ...prose(rng, each)] : p))
    .map((p) => p.join('\n'))
    .join('\n\n');
}

function uniqueInts(rng: Rng, n: number, lo: number, hi: number): number[] {
  const s = new Set<number>();
  while (s.size < n) s.add(rng.int(lo, hi));
  return [...s];
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (m: number, d: number) => `2027-${pad2(m)}-${pad2(d)}`;
const longDate = (m: number, d: number) => `${MONTHS[m - 1]} ${d}, 2027`;

// ── answer parsing / grading ───────────────────────────────────────────────

export function parseAnswer(text: string): Record<string, unknown> {
  const t = text.replace(/```(?:json)?/g, '');
  const greedy = t.match(/\{[\s\S]*\}/);
  const candidates = [greedy?.[0], ...[...t.matchAll(/\{[^{}]*\}/g)].map((m) => m[0]).reverse()];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const v = JSON.parse(c);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* try next */ }
  }
  return {};
}

type Norm = (v: unknown) => string;
const text: Norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const num: Norm = (v) => {
  const s = String(v ?? '').trim().replace(/[$,%]/g, '').replace(/\s*(days?|months?)$/i, '');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? String(n) : `?${s}`;
};
const stripPrefix = (prefix: string): Norm => (v) => text(v).replace(new RegExp(`^${prefix}\\s+`), '');
const sentinelOrNum: Norm = (v) => (String(v ?? '').trim().toUpperCase() === NOT_IN_DOC ? NOT_IN_DOC : num(v));

function gradeFields(res: { text: string }, want: Record<string, unknown>, norms: Record<string, Norm>) {
  const got = parseAnswer(res.text);
  const keys = Object.keys(want);
  const bad = keys.filter((k) => norms[k](got[k]) !== norms[k](want[k]));
  return {
    score: (keys.length - bad.length) / keys.length,
    detail: bad.length ? `wrong ${bad.join(',')}: want ${JSON.stringify(want)}, got ${JSON.stringify(got)}` : `all ${keys.length} fields exact`,
  };
}

// ── 1. three-hop lookup: ticket → host → owning team → escalation manager ───

const REGIONS = ['us-east', 'us-west', 'eu-central', 'ap-south'];
const TEAMS = ['Atlas', 'Beacon', 'Cobalt', 'Delta', 'Ember', 'Falcon', 'Garnet', 'Harbor'];
const CAUSES = ['disk', 'network', 'power', 'kernel', 'config'];

export const longdocTwoHop: V4Task = {
  id: 'longdoc-two-hop-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const people = rng.shuffle(FIRST).slice(0, 16).map((f, i) => `${f} ${LAST[i % LAST.length]}`);
    const directory = TEAMS.map((t, i) => ({ team: t, manager: people[i], deputy: people[i + 8], pager: `PG-${rng.int(1000, 9999)}` }));
    const hosts = Array.from({ length: 150 }, (_, i) => ({ host: `srv-${String(i + 100).padStart(4, '0')}`, team: rng.pick(TEAMS), region: rng.pick(REGIONS), rack: `R${rng.int(1, 40)}` }));
    const tickets = uniqueInts(rng, 220, 100000, 999999);
    const incidents = tickets.map((tk) => {
      const h = rng.pick(hosts);
      return { ticket: `INC-${tk}`, host: h.host, line: `${isoDate(rng.int(1, 12), rng.int(1, 28))} | ${h.host} | ${h.region} | outage ${rng.int(3, 170)} min | INC-${tk} | ${rng.pick(CAUSES)}` };
    });
    const target = incidents[rng.int(20, 200)];
    const owner = hosts.find((h) => h.host === target.host)!;
    const mgr = directory.find((d) => d.team === owner.team)!;

    const doc = assemble(rng, [
      ['# Fleet operations record', '## Section C: team directory', ...directory.map((d) => `Team ${d.team}: escalation manager ${d.manager}; deputy ${d.deputy}; pager ${d.pager}`)],
      null,
      ['## Section A: incident log (date | host | region | duration | ticket | cause)', ...incidents.slice(0, 110).map((i) => i.line)],
      null,
      ['## Section B: host ownership', ...rng.shuffle(hosts).map((h) => `${h.host}: team ${h.team}, rack ${h.rack}, region ${h.region}`)],
      null,
      ['## Section A (continued)', ...incidents.slice(110).map((i) => i.line)],
    ]);
    const want = { host: target.host, team: owner.team, manager: mgr.manager };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the record above: ticket ${target.ticket} was raised for an outage. Which host did it affect, which team owns that host (Section B), ` +
          `and who is that team's escalation manager (Section C)? Reply with ONLY a JSON object: {"host": "...", "team": "...", "manager": "..."}`,
      }],
      grade: (res) => gradeFields(res, want, { host: text, team: stripPrefix('team'), manager: text }),
    };
  },
};

// ── 2. needle + cross-reference: one email invokes a clause defined elsewhere ─

const CLAUSE_TITLES = ['Termination for convenience', 'Service credits', 'Data return', 'Change requests', 'Subcontracting', 'Price review', 'Force majeure', 'Audit rights', 'Transition assistance', 'Escalation path'];
const PROJECTS = ['Harbor Street', 'Northgate', 'Riverside depot', 'Elm Park', 'Westfield hub', 'Quarry Road'];

export const longdocClauseXref: V4Task = {
  id: 'longdoc-clause-xref-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const clauses = rng.shuffle(Array.from({ length: 12 }, (_, s) => Array.from({ length: 5 }, (_, u) => `${s + 1}.${u + 1}`)).flat()).slice(0, 55)
      .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]) || Number(a.split('.')[1]) - Number(b.split('.')[1]))
      .map((id) => ({ id, title: rng.pick(CLAUSE_TITLES), notice: rng.pick([15, 30, 45, 60, 90, 120]), fee: rng.int(3, 19) / 2 }));
    const senders = rng.shuffle(FIRST).slice(0, 8).map((f, i) => ({ name: `${f} ${LAST[(i * 3) % LAST.length]}`, email: `${f.toLowerCase()}@contoso-build.com` }));
    const who = senders[0];
    const tm = rng.int(2, 11);
    const td = rng.int(2, 27);
    const targetClause = rng.pick(clauses);
    const project = rng.pick(PROJECTS);

    const emails: string[][] = [];
    for (let i = 0; i < 44; i++) {
      const s = rng.pick(senders);
      let m = rng.int(1, 12);
      let d = rng.int(1, 28);
      if (s === who && m === tm && d === td) d = d === 28 ? 1 : d + 1; // keep the target email unique
      const c = rng.pick(clauses.filter((x) => x.id !== targetClause.id));
      const body = rng.next() < 0.6
        ? `Quick note on ${rng.pick(PROJECTS)}: as provided in Clause ${c.id}, we should keep the paperwork tidy. ${prose(rng, 150)[0]}`
        : prose(rng, 220)[0];
      emails.push([`From: ${s.name} <${s.email}> | Date: ${isoDate(m, d)} | Subject: ${rng.pick(PROJECTS)} update`, body]);
    }
    emails.splice(rng.int(8, 36), 0, [
      `From: ${who.name} <${who.email}> | Date: ${isoDate(tm, td)} | Subject: ${project} formal notice`,
      `Team, I am invoking Clause ${targetClause.id} of the Master Services Agreement for the ${project} project. Please treat this message as formal notice and log it accordingly.`,
    ]);

    const doc = assemble(rng, [
      ['# Project correspondence and agreement pack', '## Part 1: email thread'],
      ...emails.slice(0, 22),
      null,
      ['## Part 2: Master Services Agreement, schedule of clauses', ...clauses.map((c) => `Clause ${c.id}: ${c.title}. Notice period: ${c.notice} days. Early-termination fee: ${c.fee}% of remaining contract value.`)],
      null,
      ['## Part 1 (continued): email thread'],
      ...emails.slice(22),
    ]);
    const want = { clause: targetClause.id, notice_days: targetClause.notice, fee_percent: targetClause.fee };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the pack above: on ${longDate(tm, td)}, ${who.name} sent a formal notice invoking a contract clause. Which clause, what notice period does ` +
          `that clause set, and what early-termination fee? Reply with ONLY a JSON object: {"clause": "X.Y", "notice_days": <number>, "fee_percent": <number>}`,
      }],
      grade: (res) => gradeFields(res, want, { clause: stripPrefix('clause'), notice_days: num, fee_percent: num }),
    };
  },
};

// ── 3. conflicting versions: the latest-dated amendment wins, not the last one ─

const CITIES = ['Lisbon', 'Montreal', 'Osaka', 'Nairobi', 'Denver', 'Krakow', 'Lyon', 'Perth', 'Bogota', 'Tallinn', 'Halifax', 'Porto', 'Seville', 'Leeds', 'Auckland', 'Accra', 'Hamburg', 'Calgary', 'Valencia', 'Brno', 'Cork', 'Tucson', 'Busan', 'Quito'];

export const longdocAmendments: V4Task = {
  id: 'longdoc-amendments-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const base = CITIES.map((c) => ({ city: c, rate: rng.int(90, 260) }));
    const city = rng.pick(CITIES);
    const nTarget = rng.int(3, 4);
    const nAll = 40;
    const ids = rng.shuffle(Array.from({ length: nAll }, (_, i) => i + 1));
    const days = uniqueInts(rng, nAll, 1, 330);
    const dayToDate = (n: number) => {
      const m = Math.min(12, Math.floor((n - 1) / 28) + 1);
      return isoDate(m, ((n - 1) % 28) + 1);
    };
    const amends = days.map((d, i) => ({
      id: `A-${ids[i]}`, idNum: ids[i], day: d, date: dayToDate(d),
      city: i < nTarget ? city : rng.pick(CITIES.filter((c) => c !== city)), rate: rng.int(90, 290),
    }));
    const tgt = amends.slice(0, nTarget).sort((a, b) => b.day - a.day);
    // The winner must not also be the highest id or the last one in the text, so neither shortcut works.
    if (tgt[0].idNum === Math.max(...tgt.map((t) => t.idNum))) {
      const other = tgt[1];
      [tgt[0].id, other.id] = [other.id, tgt[0].id];
      [tgt[0].idNum, other.idNum] = [other.idNum, tgt[0].idNum];
    }
    const others = rng.shuffle(amends.slice(nTarget));
    // Target amendments spread through the list, latest-dated first.
    const order = [...others];
    const slots = uniqueInts(rng, nTarget, 0, others.length).sort((a, b) => a - b);
    tgt.forEach((t, i) => order.splice(slots[i] + i, 0, t));
    const proposal = `Proposal P-${rng.int(2, 30)} (not adopted): per-diem for ${city} would be set to $${rng.int(300, 400)}.`;
    const lines = order.map((a) => `Amendment ${a.id} (effective ${a.date}): per-diem for ${a.city} set to $${a.rate}.`);
    lines.splice(rng.int(5, lines.length - 5), 0, proposal);

    const doc = assemble(rng, [
      ['# Travel and expenses policy', '## Section 2: base daily per-diem by city (as issued 2026-12-01)', ...base.map((b) => `${b.city}: $${b.rate} per day`)],
      null,
      ['## Section 4: amendments (listed in the order they were filed, not by effective date)', ...lines.slice(0, 20)],
      null,
      ['## Section 4 (continued)', ...lines.slice(20)],
      null,
    ]);
    const want = { per_diem: tgt[0].rate, amendment: tgt[0].id };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the policy above, with all adopted amendments applied: what is the current daily per-diem for ${city}, and which amendment set it? ` +
          `Reply with ONLY a JSON object: {"per_diem": <number>, "amendment": "A-N"}`,
      }],
      grade: (res) => gradeFields(res, want, { per_diem: num, amendment: (v) => text(v).toUpperCase().replace(/\s+/g, '') }),
    };
  },
};

// ── 4. abstention: one asked-for model exists, a near-miss id does not ──────

const SERIES = ['Nova', 'Atlas', 'Pulse', 'Vertex', 'Orbit', 'Summit'];

export const longdocAbstain: V4Task = {
  id: 'longdoc-abstain-1',
  suite: 'longdoc',
  difficulty: 2,
  build(rng) {
    const prefixes = ['ZX', 'QR', 'LT', 'MV'];
    const catalog = uniqueInts(rng, 130, 1000, 9999).map((n) => ({
      id: `${rng.pick(prefixes)}-${n}`, series: rng.pick(SERIES), warranty: rng.pick([12, 18, 24, 36, 48, 60]),
      weight: rng.int(8, 95) / 10, price: rng.int(90, 2400),
    }));
    const present = rng.pick(catalog);
    // Near miss: same prefix, one digit changed, and absent from the catalog.
    const ids = new Set(catalog.map((c) => c.id));
    const [pre, digits] = present.id.split('-');
    let missing = '';
    for (let tries = 0; tries < 200 && !missing; tries++) {
      const pos = rng.int(0, 3);
      const cand = `${pre}-${digits.slice(0, pos)}${rng.int(0, 9)}${digits.slice(pos + 1)}`;
      if (!ids.has(cand) && cand !== present.id) missing = cand;
    }
    // A catalogued neighbour of the missing id makes guessing tempting.
    const neighbour = { id: `${missing.slice(0, -1)}${(Number(missing.slice(-1)) + 1) % 10}`, series: rng.pick(SERIES), warranty: rng.pick([12, 24, 36]), weight: 4.2, price: 499 };
    if (!ids.has(neighbour.id) && neighbour.id !== missing) catalog.splice(rng.int(10, 120), 0, neighbour);
    const missingFirst = rng.next() < 0.5;
    const [first, second] = missingFirst ? [missing, present.id] : [present.id, missing];
    const rows = catalog.map((c) => `Model ${c.id} | series ${c.series} | warranty ${c.warranty} months | weight ${c.weight} kg | list price $${c.price}`);

    const doc = assemble(rng, [
      ['# Product catalogue, spring edition', '## Catalogue A', ...rows.slice(0, 65)],
      null,
      ['## Catalogue B', ...rows.slice(65)],
      null,
    ]);
    const want = { first: first === missing ? NOT_IN_DOC : present.warranty, second: second === missing ? NOT_IN_DOC : present.warranty };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the catalogue above: what is the warranty, in months, of model ${first}, and of model ${second}? ` +
          `If the document does not state a value, use exactly the string "${NOT_IN_DOC}" for it. Reply with ONLY a JSON object: {"first": <number or "${NOT_IN_DOC}">, "second": <number or "${NOT_IN_DOC}">}`,
      }],
      grade: (res) => gradeFields(res, want, { first: sentinelOrNum, second: sentinelOrNum }),
    };
  },
};

// ── 5. bounded count, scoped to one clearly marked section ───────────────────

const SITES = ['Hamilton', 'Oakville', 'Guelph', 'Barrie', 'Kingston', 'Windsor'];
const AREAS = ['loading dock', 'paint booth', 'mezzanine', 'boiler room', 'cold store', 'forklift lane', 'battery room', 'roof access'];
const SEVS = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['OPEN', 'IN REVIEW', 'CLOSED'];

export const longdocBoundedCount: V4Task = {
  id: 'longdoc-bounded-count-1',
  suite: 'longdoc',
  difficulty: 2,
  build(rng) {
    const site = rng.pick(SITES);
    const k = rng.int(2, 7);
    const idNums = uniqueInts(rng, 110, 1000, 9999);
    let next = 0;
    const row = (s: string, sev: string, st: string) => ({ id: `F-${idNums[next++]}`, site: s, sev, st, area: rng.pick(AREAS) });
    const register = Array.from({ length: k }, () => row(site, 'HIGH', 'OPEN'));
    // Near misses: two of the three fields match.
    for (let i = 0; i < 8; i++) {
      const miss = rng.int(0, 2);
      register.push(row(miss === 0 ? rng.pick(SITES.filter((x) => x !== site)) : site, miss === 1 ? rng.pick(['MEDIUM', 'LOW']) : 'HIGH', miss === 2 ? rng.pick(['IN REVIEW', 'CLOSED']) : 'OPEN'));
    }
    while (register.length < 36) {
      const r = row(rng.pick(SITES), rng.pick(SEVS), rng.pick(STATUSES));
      if (!(r.site === site && r.sev === 'HIGH' && r.st === 'OPEN')) register.push(r);
    }
    // The archive repeats the same format, including matches, to test section scoping.
    const archive = Array.from({ length: 60 }, (_, i) => (i < 5 ? row(site, 'HIGH', 'OPEN') : row(rng.pick(SITES), rng.pick(SEVS), rng.pick(STATUSES))));
    const fmt = (r: { id: string; site: string; sev: string; st: string; area: string }) => `${r.id} | site: ${r.site} | severity: ${r.sev} | status: ${r.st} | area: ${r.area}`;
    const matches = register.filter((r) => r.site === site && r.sev === 'HIGH' && r.st === 'OPEN').map((r) => r.id).sort();

    const doc = assemble(rng, [
      ['# Health and safety binder', '## Section 3: findings archive (historical copies, not current)', ...rng.shuffle(archive).map(fmt)],
      null,
      ['## Section 7: current findings register', ...rng.shuffle(register).map(fmt)],
      ['## Section 8: sign-off notes'],
      null,
    ]);
    const want = { count: matches.length, ids: matches };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing Section 7 only: how many findings are at site ${site} with severity HIGH and status OPEN? List their ids. ` +
          `Reply with ONLY a JSON object: {"count": <number>, "ids": ["F-...", ...]}`,
      }],
      grade(res) {
        const got = parseAnswer(res.text);
        const ids = Array.isArray(got.ids) ? got.ids.map((x) => String(x).trim().toUpperCase()).sort() : [];
        const countOk = num(got.count) === String(matches.length);
        const idsOk = JSON.stringify(ids) === JSON.stringify(matches);
        return {
          score: (countOk ? 0.5 : 0) + (idsOk ? 0.5 : 0),
          detail: countOk && idsOk ? `count ${matches.length} and ids exact` : `want ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
        };
      },
    };
  },
};

export const LONGDOC_TASKS: V4Task[] = [longdocTwoHop, longdocClauseXref, longdocAmendments, longdocAbstain, longdocBoundedCount];
