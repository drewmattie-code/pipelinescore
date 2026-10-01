import type { ToolDef, V4Task } from '../types.js';
import { agentRebook } from './agent-rebook.js';
import { agentCalendar } from './agent-calendar.js';
import { agentInventory } from './agent-inventory.js';
import { agentHelpdesk } from './agent-helpdesk.js';
import { agentExpense } from './agent-expense.js';

// τ-bench style: a support agent with a written policy and a mock orders
// database. Graded on the database's end state, not on what the model says.

const CATALOG = [
  { sku: 'KB-210', name: 'mechanical keyboard', price: 89 },
  { sku: 'MS-044', name: 'wireless mouse', price: 29 },
  { sku: 'HD-730', name: 'noise-cancelling headphones', price: 199 },
  { sku: 'CB-015', name: 'USB-C cable', price: 12 },
  { sku: 'MN-270', name: '27-inch monitor', price: 279 },
  { sku: 'WC-100', name: 'webcam', price: 64 },
  { sku: 'LS-330', name: 'laptop stand', price: 45 },
];

interface Item { line_id: string; sku: string; name: string; price: number; final_sale: boolean; returned: boolean }
interface Order { order_id: string; customer_id: string; status: 'delivered' | 'shipped'; delivered_days_ago: number | null; items: Item[] }
interface Return { return_id: string; order_id: string; line_ids: string[]; reason: string }

const TOOLS: ToolDef[] = [
  {
    name: 'find_customer',
    description: 'Look up a customer by email. Returns the customer id and name.',
    parameters: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
  },
  {
    name: 'list_orders',
    description: 'List order ids for a customer id, newest first.',
    parameters: { type: 'object', properties: { customer_id: { type: 'string' } }, required: ['customer_id'] },
  },
  {
    name: 'get_order',
    description: 'Get an order with its status, days since delivery, and line items (line_id, sku, name, price, final_sale, returned).',
    parameters: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] },
  },
  {
    name: 'create_return',
    description: 'Create a return for specific line items of one order. Refund goes to the original payment method automatically.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
        line_ids: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string', enum: ['defective', 'no_longer_needed', 'wrong_item'] },
      },
      required: ['order_id', 'line_ids', 'reason'],
    },
  },
];

const POLICY = `You are the support agent for Northwind Electronics. Follow this policy exactly.
- Verify the customer by email before looking at orders.
- An item can be returned only if its order is delivered, it was delivered at most 30 days ago, it is not marked final_sale, and it has not already been returned.
- Never return items the customer did not ask about.
- Put every eligible item from the same order into ONE return.
- If some requested items are not eligible, return the eligible ones and tell the customer which ones were refused and why.
- Use tools for every fact; never guess ids.`;

export const agentReturns: V4Task = {
  id: 'agent-returns-1',
  suite: 'agent',
  difficulty: 3,
  build(rng) {
    const cust = `C-${rng.int(10000, 99999)}`;
    const first = rng.pick(['Maya', 'Omar', 'Priya', 'Lucas', 'Ines', 'Theo', 'Aiko', 'Sam']);
    const email = `${first.toLowerCase()}.${rng.int(10, 99)}@example.com`;
    const pool = rng.shuffle(CATALOG);
    let line = 1;
    const mkItem = (i: number, final_sale = false, returned = false): Item => ({
      line_id: `L${line++}`, sku: pool[i].sku, name: pool[i].name, price: pool[i].price, final_sale, returned,
    });
    const target: Order = {
      order_id: `W${rng.int(100000, 999999)}`, customer_id: cust, status: 'delivered', delivered_days_ago: rng.int(4, 25),
      items: [mkItem(0), mkItem(1, true), mkItem(2), mkItem(3, false, true)],
    };
    const old: Order = {
      order_id: `W${rng.int(100000, 999999)}`, customer_id: cust, status: 'delivered', delivered_days_ago: rng.int(45, 90),
      items: [mkItem(4)],
    };
    const orders = new Map([target, old].map((o) => [o.order_id, o]));
    const returns: Return[] = [];

    // Asked for: two eligible, one final sale, one already returned, one from the too-old order.
    const ask = [target.items[0], target.items[1], target.items[2], target.items[3], old.items[0]];
    const eligible = new Set([target.items[0].line_id, target.items[2].line_id]);
    const askNames = ask.map((i) => `the ${i.name}`);
    const userMsg =
      `Hi, this is ${first}, my email is ${email}. I want to return ${askNames.slice(0, -1).join(', ')} and ${askNames[askNames.length - 1]} ` +
      `from my recent orders — they're all no longer needed. Please process whatever you can.`;

    return {
      kind: 'agent',
      maxTurns: 12,
      tools: TOOLS,
      messages: [{ role: 'system', content: POLICY }, { role: 'user', content: userMsg }],
      handle(call) {
        const a = call.arguments as Record<string, unknown>;
        switch (call.name) {
          case 'find_customer':
            return String(a.email).trim().toLowerCase() === email ? JSON.stringify({ customer_id: cust, name: first }) : 'error: no customer with that email';
          case 'list_orders':
            return a.customer_id === cust ? JSON.stringify({ order_ids: [target.order_id, old.order_id] }) : 'error: unknown customer';
          case 'get_order': {
            const o = orders.get(String(a.order_id));
            return o ? JSON.stringify(o) : 'error: unknown order';
          }
          case 'create_return': {
            const o = orders.get(String(a.order_id));
            if (!o) return 'error: unknown order';
            const ids = Array.isArray(a.line_ids) ? a.line_ids.map(String) : [];
            const r: Return = { return_id: `R${returns.length + 1}`, order_id: o.order_id, line_ids: ids, reason: String(a.reason) };
            returns.push(r);
            for (const it of o.items) if (ids.includes(it.line_id)) it.returned = true;
            return JSON.stringify({ ok: true, return_id: r.return_id });
          }
          default:
            return `error: unknown tool ${call.name}`;
        }
      },
      grade(finalText) {
        const issues: string[] = [];
        const returned = returns.flatMap((r) => r.line_ids);
        const bad = returned.filter((id) => !eligible.has(id));
        if (bad.length) issues.push(`returned ineligible lines ${bad.join(',')}`);
        const missing = [...eligible].filter((id) => !returned.includes(id));
        if (missing.length) issues.push(`missed eligible lines ${missing.join(',')}`);
        if (returns.length !== 1) issues.push(`${returns.length} returns created, policy wants exactly 1`);
        if (returns.some((r) => r.reason !== 'no_longer_needed')) issues.push('wrong reason code');
        const t = finalText.toLowerCase();
        const explained = ['final', '30', 'already'].filter((w) => t.includes(w)).length;
        if (explained < 2) issues.push('did not explain the refused items');
        // State is what matters; the explanation is worth a fifth.
        const stateOk = issues.filter((i) => !i.startsWith('did not explain')).length === 0;
        const score = (stateOk ? 0.8 : 0) + (explained >= 2 ? 0.2 : 0);
        return { score, detail: issues.length ? issues.join('; ') : 'correct return, refusals explained' };
      },
    };
  },
};

export const AGENT_TASKS: V4Task[] = [agentReturns, agentRebook, agentCalendar, agentInventory, agentHelpdesk, agentExpense];
