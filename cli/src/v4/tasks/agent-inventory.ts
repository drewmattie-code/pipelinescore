import type { ToolDef, V4Task } from '../types.js';

// Fulfil an order with a stock transfer under a safety-stock rule. Trap: the
// warehouse with the most units on hand is not the one with the most units
// AVAILABLE (on hand minus safety stock).

const TOOLS: ToolDef[] = [
  { name: 'get_order', description: 'Order details: sku, quantity and ship-to region.', parameters: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] } },
  { name: 'get_stock', description: 'Stock of a SKU in every warehouse: on_hand and safety_stock.', parameters: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] } },
  {
    name: 'transfer_stock', description: 'Move units of a SKU from one warehouse to another.',
    parameters: { type: 'object', properties: { sku: { type: 'string' }, from_warehouse: { type: 'string' }, to_warehouse: { type: 'string' }, qty: { type: 'integer' } }, required: ['sku', 'from_warehouse', 'to_warehouse', 'qty'] },
  },
  { name: 'ship_order', description: 'Ship an order from a warehouse.', parameters: { type: 'object', properties: { order_id: { type: 'string' }, warehouse: { type: 'string' } }, required: ['order_id', 'warehouse'] } },
  { name: 'backorder', description: 'Put an order on backorder.', parameters: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] } },
];

const REGION_WH: Record<string, string> = { west: 'WH-VAN', central: 'WH-WPG', east: 'WH-TOR', atlantic: 'WH-HFX' };

const POLICY = `You run fulfilment for Borealis Supply. Follow this policy exactly.
- An order ships from its region's warehouse: west=WH-VAN, central=WH-WPG, east=WH-TOR, atlantic=WH-HFX.
- Available stock = on_hand - safety_stock. Never take any warehouse below its safety stock.
- If the regional warehouse's available stock covers the order, ship it with no transfer.
- Otherwise transfer exactly the shortfall (order qty minus the regional warehouse's available stock) in ONE transfer from the other warehouse with the MOST available stock, then ship from the regional warehouse.
- If no single other warehouse can cover the shortfall, backorder the order instead and do not transfer anything.`;

export const agentInventory: V4Task = {
  id: 'agent-inventory-1',
  suite: 'agent',
  difficulty: 2,
  build(rng) {
    const region = rng.pick(Object.keys(REGION_WH));
    const home = REGION_WH[region];
    const others = Object.values(REGION_WH).filter((w) => w !== home);
    const [bigOnHand, bestAvail, small] = rng.shuffle(others);
    const sku = `SKU-${rng.int(10000, 99999)}`;
    const orderId = `SO-${rng.int(100000, 999999)}`;

    const homeSafety = rng.int(5, 15);
    const homeAvail = rng.int(3, 20);
    const qty = homeAvail + rng.int(10, 40);
    const shortfall = qty - homeAvail;
    // bestAvail: fewer on hand than bigOnHand, but more available, and enough.
    const bestSafety = rng.int(5, 20);
    const bestAvailable = shortfall + rng.int(5, 30);
    const bigSafety = rng.int(150, 300);
    const bigOnHandUnits = bestSafety + bestAvailable + rng.int(61, 140);
    const bigAvailable = Math.max(0, Math.min(bigOnHandUnits - bigSafety, bestAvailable - rng.int(1, 5)));
    const stock: Record<string, { on_hand: number; safety_stock: number }> = {
      [home]: { on_hand: homeSafety + homeAvail, safety_stock: homeSafety },
      [bestAvail]: { on_hand: bestSafety + bestAvailable, safety_stock: bestSafety },
      [bigOnHand]: { on_hand: bigOnHandUnits, safety_stock: bigOnHandUnits - bigAvailable },
      [small]: { on_hand: rng.int(20, 60), safety_stock: 0 },
    };
    stock[small].safety_stock = stock[small].on_hand - rng.int(0, Math.max(0, shortfall - 1));

    const transfers: Array<{ from: string; to: string; qty: number }> = [];
    let shippedFrom: string | null = null;
    let backordered = false;
    let violation = '';

    return {
      kind: 'agent',
      maxTurns: 10,
      tools: TOOLS,
      messages: [{ role: 'system', content: POLICY }, { role: 'user', content: `Please fulfil order ${orderId}.` }],
      handle(call) {
        const a = call.arguments as Record<string, unknown>;
        switch (call.name) {
          case 'get_order':
            return a.order_id === orderId ? JSON.stringify({ order_id: orderId, sku, qty, region }) : 'error: unknown order';
          case 'get_stock':
            return a.sku === sku ? JSON.stringify(Object.entries(stock).map(([warehouse, s]) => ({ warehouse, ...s }))) : 'error: unknown sku';
          case 'transfer_stock': {
            const from = String(a.from_warehouse);
            const to = String(a.to_warehouse);
            const n = Number(a.qty);
            if (!stock[from] || !stock[to] || a.sku !== sku || !Number.isInteger(n) || n <= 0) return 'error: bad transfer';
            if (n > stock[from].on_hand) return 'error: not enough units on hand';
            stock[from].on_hand -= n;
            stock[to].on_hand += n;
            if (stock[from].on_hand < stock[from].safety_stock) violation = `${from} taken below safety stock`;
            transfers.push({ from, to, qty: n });
            return JSON.stringify({ ok: true });
          }
          case 'ship_order': {
            const w = String(a.warehouse);
            if (a.order_id !== orderId || !stock[w]) return 'error: bad shipment';
            if (stock[w].on_hand < qty) return 'error: not enough units on hand';
            stock[w].on_hand -= qty;
            if (stock[w].on_hand < stock[w].safety_stock) violation ||= `${w} taken below safety stock by the shipment`;
            shippedFrom = w;
            return JSON.stringify({ ok: true, shipment: `SH-${orderId.slice(3)}` });
          }
          case 'backorder':
            backordered = true;
            return JSON.stringify({ ok: true });
          default:
            return `error: unknown tool ${call.name}`;
        }
      },
      grade() {
        const issues: string[] = [];
        if (violation) issues.push(violation);
        if (backordered) issues.push('backordered although stock could cover it');
        if (transfers.length !== 1) issues.push(`${transfers.length} transfers, want 1`);
        const t = transfers[0];
        if (t && (t.from !== bestAvail || t.to !== home || t.qty !== shortfall)) issues.push(`transfer ${t.qty} ${t.from}->${t.to}, want ${shortfall} ${bestAvail}->${home}`);
        if (shippedFrom !== home) issues.push(`shipped from ${shippedFrom ?? 'nowhere'}, want ${home}`);
        return { score: issues.length ? 0 : 1, detail: issues.length ? issues.join('; ') : `moved ${shortfall} from ${bestAvail}, shipped from ${home}` };
      },
    };
  },
};
