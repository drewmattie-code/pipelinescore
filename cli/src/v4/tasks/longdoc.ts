import type { Rng, V4Task } from '../types.js';

// Long-document suite: ~16K–20K-token synthetic records. Every answer needs a
// handful of specific facts LOCATED in distant sections and then reconciled:
// later corrections, transfers, rescissions and errata override what was
// printed first, near-duplicate ids and names sit next to the real ones, and
// some answers need a small calculation over the retrieved values. Nothing
// asks for an aggregate over hundreds of lines: the v4 pilot showed that just
// burns a reasoning model's budget without measuring reading.

export const DOC_MIN_CHARS = 82_000;
export const DOC_MAX_CHARS = 112_000;
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
  const target = rng.int(90_000, 102_000);
  const each = Math.max(500, Math.floor((target - core) / Math.max(1, slots)));
  let noteNo = 0;
  return parts
    .map((p) => (p === null ? [`## Office notes, part ${['one', 'two', 'three', 'four', 'five'][noteNo++] ?? 'more'}`, ...prose(rng, each)] : p))
    .map((p) => p.join('\n'))
    .join('\n\n');
}

function uniqueInts(rng: Rng, n: number, lo: number, hi: number): number[] {
  const s = new Set<number>();
  while (s.size < n) s.add(rng.int(lo, hi));
  return [...s];
}

// Swap two adjacent digits of a numeric string, producing a look-alike that differs.
function digitSwap(rng: Rng, digits: string): string {
  for (let tries = 0; tries < 20; tries++) {
    const i = rng.int(0, digits.length - 2);
    if (digits[i] !== digits[i + 1]) return digits.slice(0, i) + digits[i + 1] + digits[i] + digits.slice(i + 2);
  }
  return digits.slice(0, -1) + String((Number(digits.slice(-1)) + 1) % 10);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (m: number, d: number) => `2027-${pad2(m)}-${pad2(d)}`;
const longDate = (m: number, d: number) => `${MONTHS[m - 1]} ${d}, 2027`;
const dayToIso = (n: number) => isoDate(Math.min(12, Math.floor((n - 1) / 28) + 1), ((n - 1) % 28) + 1);
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

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
  const s = String(v ?? '').trim().replace(/[$,%]/g, '').replace(/\s*(days?|months?|dollars?|usd)$/i, '');
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

// ── 1. four-hop lookup with later changes: ticket → host → current owner
//       (after transfers) → current escalation manager (after directory updates)

const REGIONS = ['us-east', 'us-west', 'eu-central', 'ap-south'];
const TEAMS = ['Atlas', 'Beacon', 'Cobalt', 'Delta', 'Ember', 'Falcon', 'Garnet', 'Harbor'];
const CAUSES = ['disk', 'network', 'power', 'kernel', 'config'];

export const longdocTwoHop: V4Task = {
  id: 'longdoc-two-hop-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const names = rng.shuffle(FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`))).slice(0, 36);
    const directory = TEAMS.map((t, i) => ({ team: t, manager: names[i], deputy: names[i + 8], pager: `PG-${rng.int(1000, 9999)}` }));
    const hosts = uniqueInts(rng, 160, 100, 999).map((n) => ({ host: `srv-${String(n).padStart(4, '0')}`, team: rng.pick(TEAMS), region: rng.pick(REGIONS), rack: `R${rng.int(1, 40)}` }));
    const byHost = new Map(hosts.map((h) => [h.host, h]));
    const incidents = uniqueInts(rng, 240, 100000, 999999).map((tk) => {
      const h = rng.pick(hosts);
      return { ticket: `INC-${tk}`, host: h.host, line: `${isoDate(rng.int(1, 12), rng.int(1, 28))} | ${h.host} | ${h.region} | outage ${rng.int(3, 170)} min | INC-${tk} | ${rng.pick(CAUSES)}` };
    });
    const target = incidents[rng.int(20, 220)];
    // A look-alike ticket (two digits swapped) on a different host sits in the log too.
    const lookTicket = `INC-${digitSwap(rng, target.ticket.slice(4))}`;
    if (!incidents.some((i) => i.ticket === lookTicket)) {
      const other = rng.pick(hosts.filter((h) => h.host !== target.host));
      incidents.splice(rng.int(0, incidents.length), 0, { ticket: lookTicket, host: other.host, line: `${isoDate(rng.int(1, 12), rng.int(1, 28))} | ${other.host} | ${other.region} | outage ${rng.int(3, 170)} min | ${lookTicket} | ${rng.pick(CAUSES)}` });
    }
    const owner0 = byHost.get(target.host)!;

    // Ownership transfers: the target host moves in most seeds; a look-alike host always moves.
    // A host may move twice; lines are shuffled, so the latest-dated transfer decides.
    const transferred = new Map<string, string>();
    const transferLines: string[] = [];
    const addTransfer = (host: string, hops = 1) => {
      let from = byHost.get(host)!.team;
      const ds = uniqueInts(rng, hops, 30, 320).sort((a, b) => a - b);
      for (const d of ds) {
        const to = rng.pick(TEAMS.filter((t) => t !== from));
        transferLines.push(`${dayToIso(d)}: ${host} transferred from Team ${from} to Team ${to}.`);
        from = to;
      }
      transferred.set(host, from);
    };
    if (rng.next() < 0.75) addTransfer(target.host, rng.next() < 0.6 ? 2 : 1);
    const lookHost = hosts.find((h) => h.host !== target.host && h.host.slice(0, 6) === target.host.slice(0, 6))
      ?? rng.pick(hosts.filter((h) => h.host !== target.host));
    addTransfer(lookHost.host, 2);
    for (const h of rng.shuffle(hosts.filter((x) => x.host !== target.host && x.host !== lookHost.host)).slice(0, 18)) addTransfer(h.host);
    const ownerTeam = transferred.get(target.host) ?? owner0.team;

    // Directory updates: the owning team's manager changes in most seeds; others change as decoys.
    const current = new Map(directory.map((d) => [d.team, d.manager]));
    const updateLines: string[] = [];
    const spare = names.slice(16);
    let spareIdx = 0;
    // Some teams change manager twice; lines are shuffled, so the latest effective date decides.
    const updTeams = rng.shuffle(TEAMS.filter((t) => t !== ownerTeam)).slice(0, 3).map((t) => ({ t, n: rng.next() < 0.4 ? 2 : 1 }));
    if (rng.next() < 0.7) updTeams.push({ t: ownerTeam, n: rng.next() < 0.6 ? 2 : 1 });
    for (const { t, n } of updTeams) {
      for (const d of uniqueInts(rng, n, 60, 330).sort((a, b) => a - b)) {
        const now = spare[spareIdx++];
        updateLines.push(`Effective ${dayToIso(d)}, the escalation manager for Team ${t} is ${now} (previously ${current.get(t)}).`);
        current.set(t, now);
      }
    }
    rng.shuffle(updateLines).forEach((l, i) => { updateLines[i] = l; });
    // A deputy change for the owning team never affects the answer.
    updateLines.splice(rng.int(0, updateLines.length), 0, `Effective ${dayToIso(rng.int(60, 330))}, the deputy for Team ${ownerTeam} is ${spare[spareIdx++]}.`);
    const mgr = current.get(ownerTeam)!;

    const doc = assemble(rng, [
      ['# Fleet operations record', '## Section C: team directory (as printed 2027-01-01)', ...directory.map((d) => `Team ${d.team}: escalation manager ${d.manager}; deputy ${d.deputy}; pager ${d.pager}`)],
      null,
      ['## Section A: incident log (date | host | region | duration | ticket | cause)', ...incidents.slice(0, 120).map((i) => i.line)],
      null,
      ['## Section B: host ownership (as printed 2027-01-01)', ...rng.shuffle(hosts).map((h) => `${h.host}: team ${h.team}, rack ${h.rack}, region ${h.region}`)],
      null,
      ['## Section A (continued)', ...incidents.slice(120).map((i) => i.line)],
      null,
      ['## Section D: ownership transfers since printing', ...rng.shuffle(transferLines)],
      ['## Section E: directory updates since printing', ...updateLines],
      null,
    ]);
    const want = { host: target.host, team: ownerTeam, manager: mgr };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the record above, with every later transfer and directory update applied: ticket ${target.ticket} was raised for an outage. ` +
          `Which host did it affect, which team owns that host now, and who is that team's current escalation manager? ` +
          `Reply with ONLY a JSON object: {"host": "...", "team": "...", "manager": "..."}`,
      }],
      grade: (res) => gradeFields(res, want, { host: text, team: stripPrefix('team'), manager: text }),
    };
  },
};

// ── 2. needle + cross-reference + amendment + calculation: one email invokes a
//       clause; an amendment may restate the clause; the fee applies to the
//       project's remaining value from a separate register.

const CLAUSE_TITLES = ['Termination for convenience', 'Service credits', 'Data return', 'Change requests', 'Subcontracting', 'Price review', 'Force majeure', 'Audit rights', 'Transition assistance', 'Escalation path'];
const PROJECTS = ['Harbor Street', 'Northgate', 'Riverside depot', 'Elm Park', 'Westfield hub', 'Quarry Road', 'Harbor Street East', 'Northgate Annex'];
const RESTATED_NOTICE = [20, 40, 75, 100, 150];

export const longdocClauseXref: V4Task = {
  id: 'longdoc-clause-xref-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const clauses = rng.shuffle(Array.from({ length: 12 }, (_, s) => Array.from({ length: 6 }, (_, u) => `${s + 1}.${u + 1}`)).flat()).slice(0, 60)
      .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]) || Number(a.split('.')[1]) - Number(b.split('.')[1]))
      .map((id) => ({ id, title: rng.pick(CLAUSE_TITLES), notice: rng.pick([15, 30, 45, 60, 90, 120]), fee: rng.int(3, 19) / 2 }));
    const firsts = rng.shuffle(FIRST).slice(0, 7);
    // Two senders share a first name, so the full name matters.
    const senders = [...firsts.map((f, i) => `${f} ${LAST[(i * 3) % LAST.length]}`), `${firsts[0]} ${LAST[(1 + 3 * 7) % LAST.length]}`]
      .map((name) => ({ name, email: `${name.toLowerCase().replace(' ', '.')}@contoso-build.com` }));
    const who = senders[0];
    const twin = senders[senders.length - 1];
    const tm = rng.int(2, 11);
    const td = rng.int(2, 26);
    const targetClause = rng.pick(clauses);
    const project = rng.pick(PROJECTS);

    // Amendment No. 2 restates some clauses: the invoked one in most seeds, a neighbour always.
    const restated = new Map<string, { notice: number; fee: number }>();
    if (rng.next() < 0.65) restated.set(targetClause.id, { notice: rng.pick(RESTATED_NOTICE), fee: rng.int(4, 21) / 2 });
    const [sec] = targetClause.id.split('.');
    const neighbour = clauses.find((c) => c.id !== targetClause.id && c.id.startsWith(`${sec}.`)) ?? rng.pick(clauses.filter((c) => c.id !== targetClause.id));
    restated.set(neighbour.id, { notice: rng.pick(RESTATED_NOTICE), fee: rng.int(4, 21) / 2 });
    for (const c of rng.shuffle(clauses.filter((x) => !restated.has(x.id) && x.id !== targetClause.id)).slice(0, 7)) {
      restated.set(c.id, { notice: rng.pick(RESTATED_NOTICE), fee: rng.int(4, 21) / 2 });
    }
    const eff = restated.get(targetClause.id) ?? { notice: targetClause.notice, fee: targetClause.fee };

    // Project register: remaining value (the one to use) next to original value (a decoy).
    const register = PROJECTS.map((p) => {
      const original = rng.int(80, 600) * 10_000;
      return { p, original, remaining: rng.int(10, Math.floor(original / 1000) - 5) * 1000 };
    });
    const proj = register.find((r) => r.p === project)!;
    const feeDollars = Math.round((proj.remaining * eff.fee) / 100);

    const emails: string[][] = [];
    const taken = new Set<string>([`${who.name}|${isoDate(tm, td)}`, `${who.name}|${isoDate(tm, td + 1)}`, `${twin.name}|${isoDate(tm, td)}`]);
    for (let i = 0; i < 46; i++) {
      const s = rng.pick(senders);
      let m = rng.int(1, 12);
      let d = rng.int(1, 28);
      while (taken.has(`${s.name}|${isoDate(m, d)}`)) {
        d = d === 28 ? 1 : d + 1;
        if (d === 1) m = (m % 12) + 1;
      }
      taken.add(`${s.name}|${isoDate(m, d)}`);
      const c = rng.pick(clauses.filter((x) => x.id !== targetClause.id));
      const body = rng.next() < 0.6
        ? `Quick note on ${rng.pick(PROJECTS)}: as provided in Clause ${c.id}, we should keep the paperwork tidy. ${prose(rng, 150)[0]}`
        : prose(rng, 220)[0];
      emails.push([`From: ${s.name} <${s.email}> | Date: ${isoDate(m, d)} | Subject: ${rng.pick(PROJECTS)} update`, body]);
    }
    // Decoys: the same sender the next day on another clause, and the name-twin on the same day.
    const decoyClause = rng.pick(clauses.filter((x) => x.id !== targetClause.id));
    emails.splice(rng.int(4, 40), 0, [
      `From: ${who.name} <${who.email}> | Date: ${isoDate(tm, td + 1)} | Subject: ${rng.pick(PROJECTS.filter((p) => p !== project))} formal notice`,
      `Team, I am invoking Clause ${decoyClause.id} of the Master Services Agreement for this project. Please log this as formal notice.`,
    ]);
    const twinClause = rng.pick(clauses.filter((x) => x.id !== targetClause.id && x.id !== decoyClause.id));
    emails.splice(rng.int(4, 40), 0, [
      `From: ${twin.name} <${twin.email}> | Date: ${isoDate(tm, td)} | Subject: ${rng.pick(PROJECTS)} formal notice`,
      `Colleagues, please treat this as formal notice under Clause ${twinClause.id} of the Master Services Agreement.`,
    ]);
    emails.splice(rng.int(8, 40), 0, [
      `From: ${who.name} <${who.email}> | Date: ${isoDate(tm, td)} | Subject: ${project} formal notice`,
      `Team, I am invoking Clause ${targetClause.id} of the Master Services Agreement for the ${project} project. Please treat this message as formal notice and log it accordingly.`,
    ]);

    const doc = assemble(rng, [
      ['# Project correspondence and agreement pack', '## Part 1: email thread', ...emails.slice(0, 25).flat()],
      null,
      ['## Part 2: Master Services Agreement, schedule of clauses (original)', ...clauses.map((c) => `Clause ${c.id}: ${c.title}. Notice period: ${c.notice} days. Early-termination fee: ${c.fee}% of remaining contract value.`)],
      null,
      ['## Part 3: project register', ...rng.shuffle(register).map((r) => `${r.p}: original contract value ${money(r.original)}; remaining contract value ${money(r.remaining)}`)],
      null,
      ['## Part 1 (continued): email thread', ...emails.slice(25).flat()],
      null,
      ['## Part 4: Amendment No. 2 to the Master Services Agreement', 'The following clauses are restated in full and replace the original schedule entries.',
        ...rng.shuffle([...restated.entries()]).map(([id, v]) => `Clause ${id} (restated): Notice period: ${v.notice} days. Early-termination fee: ${v.fee}% of remaining contract value.`)],
    ]);
    const want = { clause: targetClause.id, notice_days: eff.notice, fee_dollars: feeDollars };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the pack above, with Amendment No. 2 applied: on ${longDate(tm, td)}, ${who.name} sent a formal notice invoking a contract clause. ` +
          `Which clause, what notice period applies to it, and what early-termination fee in dollars would apply to that email's project ` +
          `(the clause's fee percentage times the project's remaining contract value)? ` +
          `Reply with ONLY a JSON object: {"clause": "X.Y", "notice_days": <number>, "fee_dollars": <number>}`,
      }],
      grade: (res) => gradeFields(res, want, { clause: stripPrefix('clause'), notice_days: num, fee_dollars: num }),
    };
  },
};

// ── 3. conflicting versions: only amendments in force on the as-of date count
//       (not future-dated, not rescinded); the latest of those wins; the trip
//       total needs one multiplication. A near-name city carries decoys.

const CITY_PAIRS: Array<[string, string]> = [['Porto', 'Porto Alegre'], ['Perth', 'Perth Amboy'], ['York', 'New York'], ['Newport', 'Newport News'], ['Santiago', 'Santiago de Cuba'], ['Richmond', 'Richmond Hill']];
const CITIES = ['Lisbon', 'Montreal', 'Osaka', 'Nairobi', 'Denver', 'Krakow', 'Lyon', 'Nashville', 'Bogota', 'Tallinn', 'Halifax', 'Seville', 'Leeds', 'Auckland', 'Accra', 'Hamburg', 'Calgary', 'Valencia', 'Brno', 'Cork', 'Tucson', 'Busan', 'Quito', ...CITY_PAIRS.flat()];

export const longdocAmendments: V4Task = {
  id: 'longdoc-amendments-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const [city, twin] = rng.pick(CITY_PAIRS);
    const asOfDay = rng.int(200, 300);
    const asOfIso = dayToIso(asOfDay);
    const asOfLong = longDate(Number(asOfIso.slice(5, 7)), Number(asOfIso.slice(8, 10)));
    type Am = { id: string; day: number; date: string; city: string; rate: number };
    const idPool = rng.shuffle(Array.from({ length: 70 }, (_, i) => i + 1));
    let idNext = 0;
    const newId = () => `A-${idPool[idNext++]}`;
    const others: Am[] = uniqueInts(rng, 50, 1, 336).map((d) => ({ id: newId(), day: d, date: dayToIso(d), city: rng.pick(CITIES.filter((c) => c !== city)), rate: rng.int(90, 290) }));
    // Target-city amendments: two or three in force, one or two dated after the as-of date.
    const inForceDays = uniqueInts(rng, rng.int(2, 3), 10, asOfDay - 1);
    const futureDays = uniqueInts(rng, rng.int(1, 2), asOfDay + 1, 336);
    const tgt: Am[] = [...inForceDays, ...futureDays].map((d) => ({ id: newId(), day: d, date: dayToIso(d), city, rate: rng.int(90, 290) }));
    const inForce = tgt.filter((t) => t.day < asOfDay).sort((a, b) => b.day - a.day);
    // In about half the seeds the latest in-force amendment was rescinded, so the one before it wins.
    const rescinded = new Set<string>();
    if (rng.next() < 0.5) rescinded.add(inForce[0].id);
    const winner = inForce.find((t) => !rescinded.has(t.id))!;
    // Twin-city amendments look like the target's; one is dated just before the as-of date.
    const twins: Am[] = [asOfDay - 1, rng.int(1, 336), rng.int(1, 336)].map((d) => ({ id: newId(), day: d, date: dayToIso(d), city: twin, rate: rng.int(90, 290) }));
    for (const a of rng.shuffle(others).slice(0, 4)) rescinded.add(a.id);
    // Section 6 corrects some effective dates; the corrected date replaces the printed one.
    // Most seeds: a future-dated target amendment is corrected INTO force after the
    // printed winner, so it wins. Otherwise, sometimes the printed winner is corrected
    // OUT of force (after the as-of date), so the next valid one wins.
    const corrections: Array<{ id: string; to: string }> = [];
    let finalWinner = winner;
    const latestInForce = inForce[0].day;
    const future = tgt.filter((t) => t.day > asOfDay);
    const roll = rng.next();
    if (roll < 0.55 && future.length && asOfDay - 1 > latestInForce) {
      const f = future[0];
      corrections.push({ id: f.id, to: dayToIso(rng.int(latestInForce + 1, asOfDay - 1)) });
      finalWinner = f;
    } else if (roll < 0.85) {
      const valid = inForce.filter((t) => !rescinded.has(t.id));
      if (valid.length >= 2) {
        corrections.push({ id: valid[0].id, to: dayToIso(rng.int(asOfDay + 1, 336)) });
        finalWinner = valid[1];
      }
    }
    for (const a of rng.shuffle(others).slice(0, 5)) corrections.push({ id: a.id, to: dayToIso(rng.int(1, 336)) });
    const lines = rng.shuffle([...others, ...tgt, ...twins]).map((a) => `Amendment ${a.id} (effective ${a.date}): per-diem for ${a.city} set to $${a.rate}.`);
    lines.splice(rng.int(5, lines.length - 5), 0, `Proposal P-${rng.int(2, 30)} (not adopted): per-diem for ${city} would be set to $${rng.int(300, 400)}.`);
    const base = CITIES.map((c) => ({ city: c, rate: rng.int(90, 260) }));
    const tripDays = rng.int(3, 9);

    const doc = assemble(rng, [
      ['# Travel and expenses policy', '## Section 2: base daily per-diem by city (as issued 2026-12-01)', ...base.map((b) => `${b.city}: $${b.rate} per day`)],
      null,
      ['## Section 4: amendments (listed in the order they were filed, not by effective date)', ...lines.slice(0, 28)],
      null,
      ['## Section 4 (continued)', ...lines.slice(28)],
      null,
      ['## Section 5: rescissions (a rescinded amendment never took effect)', ...rng.shuffle([...rescinded]).map((id) => `Amendment ${id} is rescinded.`)],
      null,
      ['## Section 6: effective-date corrections (the corrected date replaces the one printed in Section 4)', ...rng.shuffle(corrections).map((c) => `Amendment ${c.id}: effective date corrected to ${c.to}.`)],
    ]);
    const want = { per_diem: finalWinner.rate, amendment: finalWinner.id, trip_total: finalWinner.rate * tripDays };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the policy above, with the date corrections applied: as of ${asOfLong}, counting only amendments in force on that date and not rescinded, ` +
          `what is the daily per-diem for ${city}, which amendment set it, and what is the total per-diem for a ${tripDays}-day trip there? ` +
          `Reply with ONLY a JSON object: {"per_diem": <number>, "amendment": "A-N", "trip_total": <number>}`,
      }],
      grade: (res) => gradeFields(res, want, { per_diem: num, amendment: (v) => text(v).toUpperCase().replace(/\s+/g, ''), trip_total: num }),
    };
  },
};

// ── 4. abstention + errata: of four asked-for models, one is catalogued and
//       corrected by an erratum, one is a near-miss id that isn't catalogued,
//       one is discontinued with a service plan but no stated warranty, and one
//       is a plain catalogued model next to a look-alike that has an erratum.

const SERIES = ['Nova', 'Atlas', 'Pulse', 'Vertex', 'Orbit', 'Summit'];
const WARRANTIES = [12, 18, 24, 36, 48, 60];

export const longdocAbstain: V4Task = {
  id: 'longdoc-abstain-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const prefixes = ['ZX', 'QR', 'LT', 'MV'];
    const nums = uniqueInts(rng, 230, 1000, 9999);
    const catalog = nums.slice(0, 200).map((n) => ({
      id: `${rng.pick(prefixes)}-${n}`, series: rng.pick(SERIES), warranty: rng.pick(WARRANTIES),
      weight: rng.int(8, 95) / 10, price: rng.int(90, 2400),
    }));
    const ids = new Set(catalog.map((c) => c.id));
    const corrected = rng.pick(catalog.slice(10, 190));
    const fixedWarranty = rng.pick(WARRANTIES.filter((w) => w !== corrected.warranty));
    // Near miss: one digit off a catalogued model, not catalogued itself,
    // with a catalogued neighbour one digit further on.
    const src = rng.pick(catalog.filter((c) => c.id !== corrected.id));
    const [pre, digits] = src.id.split('-');
    let missing = '';
    for (let tries = 0; tries < 400 && !missing; tries++) {
      const pos = rng.int(0, 3);
      const cand = `${pre}-${digits.slice(0, pos)}${rng.int(0, 9)}${digits.slice(pos + 1)}`;
      if (!ids.has(cand)) missing = cand;
    }
    const neighbourId = `${missing.slice(0, -1)}${(Number(missing.slice(-1)) + 1) % 10}`;
    if (!ids.has(neighbourId) && neighbourId !== missing) {
      catalog.splice(rng.int(10, 190), 0, { id: neighbourId, series: rng.pick(SERIES), warranty: rng.pick([12, 24, 36]), weight: 4.2, price: 499 });
      ids.add(neighbourId);
    }
    // Discontinued models: listed with a service plan length, never a warranty.
    const discontinued = nums.slice(200)
      .map((n) => ({ id: `${rng.pick(prefixes)}-${n}`, plan: rng.pick([12, 24, 36]) }))
      .filter((d) => !ids.has(d.id) && d.id !== missing);
    const disc = rng.pick(discontinued);
    // Look-alike: a catalogued model whose id is one digit off a model that HAS an
    // erratum. It keeps its printed warranty.
    const discIds = new Set(discontinued.map((d) => d.id));
    let plain = catalog[0];
    let siblingId = '';
    for (let tries = 0; tries < 50; tries++) {
      plain = rng.pick(catalog.filter((c) => c.id !== corrected.id && c.id !== neighbourId && !c.id.startsWith(`${pre}-`)));
      const [pPre, pDigits] = plain.id.split('-');
      siblingId = `${pPre}-${digitSwap(rng, pDigits)}`;
      if (siblingId !== plain.id && siblingId !== corrected.id && siblingId !== neighbourId && !discIds.has(siblingId)) break;
    }
    let sibling = catalog.find((c) => c.id === siblingId);
    if (!sibling) {
      sibling = { id: siblingId, series: rng.pick(SERIES), warranty: rng.pick(WARRANTIES), weight: rng.int(8, 95) / 10, price: rng.int(90, 2400) };
      catalog.splice(rng.int(10, 190), 0, sibling);
      ids.add(siblingId);
    }
    const keepPrinted = new Set([plain.id, neighbourId]);
    const errata = [
      { id: corrected.id, from: corrected.warranty, to: fixedWarranty },
      { id: sibling.id, from: sibling.warranty, to: rng.pick(WARRANTIES.filter((w) => w !== sibling!.warranty)) },
      ...rng.shuffle(catalog.filter((c) => c.id !== corrected.id && c.id !== sibling!.id && !keepPrinted.has(c.id))).slice(0, 6)
        .map((c) => ({ id: c.id, from: c.warranty, to: rng.pick(WARRANTIES.filter((w) => w !== c.warranty)) })),
    ];
    const asked = rng.shuffle([
      { id: corrected.id, want: fixedWarranty as number | string },
      { id: missing, want: NOT_IN_DOC as number | string },
      { id: disc.id, want: NOT_IN_DOC as number | string },
      { id: plain.id, want: plain.warranty as number | string },
    ]);
    const rows = catalog.map((c) => `Model ${c.id} | series ${c.series} | warranty ${c.warranty} months | weight ${c.weight} kg | list price $${c.price}`);

    const doc = assemble(rng, [
      ['# Product catalogue, spring edition', '## Catalogue A', ...rows.slice(0, 100)],
      null,
      ['## Catalogue B', ...rows.slice(100)],
      null,
      ['## Appendix: discontinued models (no longer sold; service plans only)', ...discontinued.map((d) => `Model ${d.id} | discontinued | service plan ${d.plan} months`)],
      null,
      ['## Errata to this edition', ...rng.shuffle(errata).map((e) => `Model ${e.id}: warranty is ${e.to} months, not ${e.from} as printed.`)],
    ]);
    const want = { first: asked[0].want, second: asked[1].want, third: asked[2].want, fourth: asked[3].want };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the catalogue above, with the errata applied: what is the warranty, in months, of model ${asked[0].id}, of model ${asked[1].id}, ` +
          `of model ${asked[2].id}, and of model ${asked[3].id}? If the document does not state a warranty for a model, use exactly the string "${NOT_IN_DOC}" for it. ` +
          `Reply with ONLY a JSON object: {"first": <number or "${NOT_IN_DOC}">, "second": <number or "${NOT_IN_DOC}">, "third": <number or "${NOT_IN_DOC}">, "fourth": <number or "${NOT_IN_DOC}">}`,
      }],
      grade: (res) => gradeFields(res, want, { first: sentinelOrNum, second: sentinelOrNum, third: sentinelOrNum, fourth: sentinelOrNum }),
    };
  },
};

// ── 5. bounded count, scoped to one section, with later status updates ───────

const SITES = ['Hamilton', 'Oakville', 'Guelph', 'Barrie', 'Kingston', 'Windsor', 'Kingsville', 'Oakwood'];
const AREAS = ['loading dock', 'paint booth', 'mezzanine', 'boiler room', 'cold store', 'forklift lane', 'battery room', 'roof access'];
const SEVS = ['HIGH', 'MEDIUM', 'LOW'];
const STATUSES = ['OPEN', 'IN REVIEW', 'CLOSED'];

export const longdocBoundedCount: V4Task = {
  id: 'longdoc-bounded-count-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const site = rng.pick(['Kingston', 'Oakville', 'Hamilton', 'Windsor', 'Guelph', 'Barrie']);
    const k = rng.int(3, 7);
    const idNums = uniqueInts(rng, 160, 1000, 9999);
    let next = 0;
    type Row = { id: string; site: string; sev: string; st: string; area: string };
    const row = (s: string, sev: string, st: string): Row => ({ id: `F-${idNums[next++]}`, site: s, sev, st, area: rng.pick(AREAS) });
    const register: Row[] = Array.from({ length: k }, () => row(site, 'HIGH', 'OPEN'));
    // Near misses: two of the three fields match.
    const nearStatus: Row[] = [];
    for (let i = 0; i < 12; i++) {
      const miss = rng.int(0, 2);
      const r = row(miss === 0 ? rng.pick(SITES.filter((x) => x !== site)) : site, miss === 1 ? rng.pick(['MEDIUM', 'LOW']) : 'HIGH', miss === 2 ? rng.pick(['IN REVIEW', 'CLOSED']) : 'OPEN');
      if (miss === 2) nearStatus.push(r);
      register.push(r);
    }
    if (!nearStatus.length) {
      const r = row(site, 'HIGH', 'IN REVIEW');
      nearStatus.push(r);
      register.push(r);
    }
    while (register.length < 56) {
      const r = row(rng.pick(SITES), rng.pick(SEVS), rng.pick(STATUSES));
      if (!(r.site === site && r.sev === 'HIGH' && r.st === 'OPEN')) register.push(r);
    }
    // Status updates since printing: close one or two matches, reopen one near
    // miss, plus unrelated churn. Each finding is updated at most once.
    const updates: Array<{ id: string; to: string }> = [];
    for (const r of rng.shuffle(register.slice(0, k)).slice(0, rng.int(1, 2))) updates.push({ id: r.id, to: rng.pick(['CLOSED', 'IN REVIEW']) });
    updates.push({ id: rng.pick(nearStatus).id, to: 'OPEN' });
    const touched = new Set(updates.map((u) => u.id));
    for (const r of rng.shuffle(register.slice(k)).filter((x) => !touched.has(x.id)).slice(0, 10)) {
      const to = rng.pick(STATUSES.filter((s) => s !== r.st));
      if (r.site === site && r.sev === 'HIGH' && to === 'OPEN') continue;
      updates.push({ id: r.id, to });
    }
    const current = new Map(register.map((r) => [r.id, r.st]));
    for (const u of updates) current.set(u.id, u.to);
    const matches = register.filter((r) => r.site === site && r.sev === 'HIGH' && current.get(r.id) === 'OPEN').map((r) => r.id).sort();

    // The archive repeats the same format, including matches, to test section scoping.
    const archive = Array.from({ length: 70 }, (_, i) => (i < 6 ? row(site, 'HIGH', 'OPEN') : row(rng.pick(SITES), rng.pick(SEVS), rng.pick(STATUSES))));
    const fmt = (r: Row) => `${r.id} | site: ${r.site} | severity: ${r.sev} | status: ${r.st} | area: ${r.area}`;

    const doc = assemble(rng, [
      ['# Health and safety binder', '## Section 3: findings archive (historical copies, not current)', ...rng.shuffle(archive).map(fmt)],
      null,
      ['## Section 7: current findings register (as printed)', ...rng.shuffle(register).map(fmt)],
      null,
      ['## Section 8: sign-off notes'],
      null,
      ['## Section 9: status updates since the register was printed', ...rng.shuffle(updates).map((u) => `${u.id}: status changed to ${u.to}.`)],
    ]);
    const want = { count: matches.length, ids: matches };
    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing Section 7 only, with the status updates in Section 9 applied: how many findings are at site ${site} with severity HIGH and status OPEN? ` +
          `List their ids. Reply with ONLY a JSON object: {"count": <number>, "ids": ["F-...", ...]}`,
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
