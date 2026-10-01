import type { ToolDef, V4Task } from '../types.js';

// Expense approvals with per-day and per-night caps. Traps: two meal lines on
// the same day that are each under the cap but over it together, a multi-night
// hotel line that looks over the cap but is under it per night, and the
// approver's own report, which must be left alone.

const TOOLS: ToolDef[] = [
  { name: 'list_pending_reports', description: 'Ids of expense reports waiting for your decision.', parameters: { type: 'object', properties: {} } },
  { name: 'get_report', description: 'A report with its submitter and lines (category, date, amount, nights for hotel, has_receipt).', parameters: { type: 'object', properties: { report_id: { type: 'string' } }, required: ['report_id'] } },
  { name: 'approve_report', description: 'Approve a report for payment.', parameters: { type: 'object', properties: { report_id: { type: 'string' } }, required: ['report_id'] } },
  {
    name: 'reject_report', description: 'Reject a report with a reason code.',
    parameters: { type: 'object', properties: { report_id: { type: 'string' }, reason: { type: 'string', enum: ['over_limit', 'missing_receipt'] } }, required: ['report_id', 'reason'] },
  },
];

interface Line { category: 'meal' | 'hotel' | 'taxi' | 'supplies'; date: string; amount: number; nights?: number; has_receipt: boolean }
interface Report { report_id: string; submitted_by: string; lines: Line[] }

export const agentExpense: V4Task = {
  id: 'agent-expense-1',
  suite: 'agent',
  difficulty: 3,
  build(rng) {
    const meal = rng.pick([60, 70, 75, 80]);
    const hotel = rng.pick([180, 200, 220, 250]);
    const receiptOver = rng.pick([25, 40, 50]);
    const me = rng.pick(['jpark', 'mdiaz', 'aokoye', 'tkowalski']);
    const staff = rng.shuffle(['lchen', 'rsingh', 'ebrown', 'kmueller', 'nadeyemi', 'sfarah']).filter((x) => x !== me);
    const d = (n: number) => `2027-03-${String(n).padStart(2, '0')}`;
    const day = rng.int(2, 20);
    const ids = rng.shuffle(Array.from({ length: 5 }, (_, i) => `EXP-${rng.int(1000, 9999)}${i}`));
    const small = () => rng.int(8, receiptOver - 1);

    const reports: Report[] = [
      // Compliant: meals under cap, receipts where needed.
      { report_id: ids[0], submitted_by: staff[0], lines: [
        { category: 'meal', date: d(day), amount: meal - rng.int(5, 20), has_receipt: true },
        { category: 'taxi', date: d(day), amount: small(), has_receipt: false },
      ] },
      // Same-day meals each under the cap, together over it.
      { report_id: ids[1], submitted_by: staff[1], lines: [
        { category: 'meal', date: d(day + 1), amount: Math.ceil(meal * 0.6), has_receipt: true },
        { category: 'meal', date: d(day + 1), amount: Math.ceil(meal * 0.6), has_receipt: true },
      ] },
      // A line over the receipt threshold with no receipt.
      { report_id: ids[2], submitted_by: staff[2], lines: [
        { category: 'supplies', date: d(day), amount: receiptOver + rng.int(5, 60), has_receipt: false },
        { category: 'meal', date: d(day), amount: meal - 10, has_receipt: true },
      ] },
      // Multi-night hotel: total above the nightly cap, per night below it.
      { report_id: ids[3], submitted_by: staff[3], lines: [
        { category: 'hotel', date: d(day), amount: 3 * (hotel - rng.int(10, 40)), nights: 3, has_receipt: true },
      ] },
      // The approver's own report, otherwise compliant.
      { report_id: ids[4], submitted_by: me, lines: [
        { category: 'meal', date: d(day + 2), amount: meal - 15, has_receipt: true },
      ] },
    ];
    const want: Record<string, string> = {
      [ids[0]]: 'approved', [ids[1]]: 'rejected:over_limit', [ids[2]]: 'rejected:missing_receipt', [ids[3]]: 'approved', [ids[4]]: 'pending',
    };
    const byId = new Map(reports.map((r) => [r.report_id, r]));
    const decisions = new Map<string, string>(reports.map((r) => [r.report_id, 'pending']));
    const order = rng.shuffle(reports.map((r) => r.report_id));

    const policy = `You are ${me}, an expense approver at Kestrel Labs. Decide every pending report using this policy exactly.
- Meals: at most $${meal} per person per calendar day, summed across all meal lines on that day.
- Hotel: at most $${hotel} per night (a line's amount divided by its nights).
- Any single line over $${receiptOver} needs a receipt.
- Approve a report only if every line complies. Otherwise reject it: reason "over_limit" if any cap is exceeded, else "missing_receipt".
- Never approve or reject a report you submitted yourself; leave it pending and say so.`;

    return {
      kind: 'agent',
      maxTurns: 14,
      tools: TOOLS,
      messages: [{ role: 'system', content: policy }, { role: 'user', content: 'Please clear my pending expense approvals.' }],
      handle(call) {
        const a = call.arguments as Record<string, unknown>;
        const id = String(a.report_id ?? '');
        switch (call.name) {
          case 'list_pending_reports':
            return JSON.stringify({ report_ids: order.filter((x) => decisions.get(x) === 'pending') });
          case 'get_report':
            return byId.has(id) ? JSON.stringify(byId.get(id)) : 'error: unknown report';
          case 'approve_report':
            if (!byId.has(id)) return 'error: unknown report';
            decisions.set(id, 'approved');
            return 'ok';
          case 'reject_report':
            if (!byId.has(id)) return 'error: unknown report';
            decisions.set(id, `rejected:${a.reason}`);
            return 'ok';
          default:
            return `error: unknown tool ${call.name}`;
        }
      },
      grade() {
        const issues: string[] = [];
        let right = 0;
        for (const r of reports) {
          const got = decisions.get(r.report_id)!;
          if (got === want[r.report_id]) right++;
          else issues.push(`${r.report_id}: ${got}, want ${want[r.report_id]}`);
        }
        const selfDecided = decisions.get(ids[4]) !== 'pending';
        const score = selfDecided ? 0 : right === reports.length ? 1 : 0.5 * (right / reports.length);
        return { score, detail: issues.length ? issues.join('; ') : 'all 5 decisions correct' };
      },
    };
  },
};
