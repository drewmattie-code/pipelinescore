import type { V4Task } from '../types.js';

// ~16K tokens of synthetic ops records. The answer needs two hops: find the
// longest outage matching a filter in the incident log, then look that host up
// in the ownership table in a different part of the document.

const REGIONS = ['us-east', 'us-west', 'eu-central', 'ap-south'] as const;
const TEAMS = ['Atlas', 'Beacon', 'Cobalt', 'Delta', 'Ember', 'Falcon', 'Garnet', 'Harbor'];

export const longdocTwoHop: V4Task = {
  id: 'longdoc-two-hop-1',
  suite: 'longdoc',
  difficulty: 3,
  build(rng) {
    const hosts = Array.from({ length: 160 }, (_, i) => ({
      host: `srv-${String(i + 100).padStart(4, '0')}`,
      region: rng.pick(REGIONS),
      team: rng.pick(TEAMS),
      rack: `R${rng.int(1, 40)}`,
    }));
    const region = rng.pick(REGIONS);
    const month = rng.pick(['03', '04', '05']);
    const monthName = { '03': 'March', '04': 'April', '05': 'May' }[month]!;
    const incidents: string[] = [];
    let best = { minutes: -1, host: '', ticket: '' };
    for (let i = 0; i < 560; i++) {
      const h = rng.pick(hosts);
      const mo = rng.pick(['02', '03', '04', '05', '06']);
      const minutes = rng.int(3, 170);
      const ticket = `INC-${rng.int(100000, 999999)}`;
      const day = String(rng.int(1, 28)).padStart(2, '0');
      incidents.push(`2027-${mo}-${day} | ${h.host} | ${h.region} | outage ${minutes} min | ${ticket} | ${rng.pick(['disk', 'network', 'power', 'kernel', 'config'])}`);
      if (h.region === region && mo === month && minutes > best.minutes) best = { minutes, host: h.host, ticket };
    }
    // Plant a unique, clearly longest outage so ties can't make the key ambiguous.
    const star = rng.pick(hosts.filter((h) => h.region === region));
    const starTicket = `INC-${rng.int(100000, 999999)}`;
    const starMin = Math.max(best.minutes, 170) + rng.int(5, 40);
    incidents.splice(rng.int(50, 500), 0, `2027-${month}-${String(rng.int(1, 28)).padStart(2, '0')} | ${star.host} | ${star.region} | outage ${starMin} min | ${starTicket} | ${rng.pick(['disk', 'network', 'power'])}`);

    const ownership = rng.shuffle(hosts).map((h) => `${h.host}: team ${h.team}, rack ${h.rack}, on-call rotation ${h.team.toLowerCase()}-primary`);
    const doc = [
      '# Fleet operations record',
      '## Section A: incident log (date | host | region | duration | ticket | cause)',
      ...incidents.slice(0, 280),
      '## Section B: host ownership',
      ...ownership,
      '## Section A (continued)',
      ...incidents.slice(280),
    ].join('\n');

    return {
      kind: 'single',
      messages: [{
        role: 'user',
        content:
          `${doc}\n\n---\nUsing only the record above: in ${monthName} 2027, which host in region ${region} had the single longest outage? ` +
          `Reply with ONLY a JSON object: {"host": "...", "ticket": "...", "team": "..."} where team is the owning team from Section B.`,
      }],
      grade(res) {
        const m = res.text.match(/\{[\s\S]*\}/);
        let got: Record<string, unknown> = {};
        try { got = m ? JSON.parse(m[0]) : {}; } catch { /* not JSON */ }
        const want = { host: star.host, ticket: starTicket, team: star.team };
        const hits = (['host', 'ticket', 'team'] as const).filter((k) => String(got[k] ?? '').trim() === want[k]).length;
        return { score: hits === 3 ? 1 : hits === 2 ? 0.34 : 0, detail: `want ${JSON.stringify(want)}, got ${JSON.stringify(got)}` };
      },
    };
  },
};
