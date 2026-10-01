import type { ToolDef, V4Task } from '../types.js';

// Airline rebooking after a cancellation. Traps: a flight to a different
// airport in the same city, a flight with enough seats only in another cabin,
// and the cancelled flight itself still listed.

const TOOLS: ToolDef[] = [
  {
    name: 'get_booking', description: 'Fetch a booking by reference and passenger last name.',
    parameters: { type: 'object', properties: { booking_ref: { type: 'string' }, last_name: { type: 'string' } }, required: ['booking_ref', 'last_name'] },
  },
  {
    name: 'search_flights', description: 'List flights between two cities on a date (YYYY-MM-DD) with status and free seats per cabin.',
    parameters: { type: 'object', properties: { origin_city: { type: 'string' }, destination_city: { type: 'string' }, date: { type: 'string' } }, required: ['origin_city', 'destination_city', 'date'] },
  },
  {
    name: 'rebook', description: 'Move every passenger on a booking to another flight and cabin.',
    parameters: {
      type: 'object',
      properties: {
        booking_ref: { type: 'string' }, flight_no: { type: 'string' },
        cabin: { type: 'string', enum: ['economy', 'business'] }, waive_change_fee: { type: 'boolean' },
      },
      required: ['booking_ref', 'flight_no', 'cabin', 'waive_change_fee'],
    },
  },
];

const POLICY = `You are a rebooking agent for Maple Air. Follow this policy exactly.
- Verify the booking with its reference AND the passenger's last name before anything else.
- When Maple Air cancels a flight, rebook the whole booking onto the earliest-departing scheduled flight on the same date or the next day that lands at the SAME arrival airport as the original and has enough free seats in the SAME cabin for every passenger. Never split passengers, never change cabin, never pick a different airport even in the same city.
- Always waive the change fee for airline cancellations.
- A booking can be rebooked only once; get it right the first time.
- Tell the passenger the new flight number and departure time.`;

const ROUTES = [
  { dest: 'New York', airports: ['JFK', 'LGA'] },
  { dest: 'London', airports: ['LHR', 'LGW'] },
  { dest: 'Chicago', airports: ['ORD', 'MDW'] },
  { dest: 'Paris', airports: ['CDG', 'ORY'] },
] as const;

interface Flight { flight_no: string; date: string; depart: string; arrive_airport: string; status: 'scheduled' | 'cancelled'; seats: { economy: number; business: number } }

export const agentRebook: V4Task = {
  id: 'agent-rebook-1',
  suite: 'agent',
  difficulty: 3,
  build(rng) {
    const route = rng.pick(ROUTES);
    const [home, other] = rng.shuffle(route.airports);
    const cabin = rng.pick(['economy', 'business'] as const);
    const otherCabin = cabin === 'economy' ? 'business' : 'economy';
    const pax = rng.int(2, 4);
    const last = rng.pick(['Okafor', 'Lindqvist', 'Tanaka', 'Moreau', 'Haddad', 'Novak']);
    const ref = `${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))}${rng.int(1000, 9999)}`;
    const day = rng.int(3, 26);
    const d1 = `2027-06-${String(day).padStart(2, '0')}`;
    const d2 = `2027-06-${String(day + 1).padStart(2, '0')}`;
    const num = () => `MA${rng.int(100, 989)}`;
    const hh = (h: number, m = rng.pick([0, 15, 30, 45])) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const seats = (enough: boolean) => (enough ? pax + rng.int(0, 5) : rng.int(0, pax - 1));

    const orig: Flight = { flight_no: num(), date: d1, depart: hh(7), arrive_airport: home, status: 'cancelled', seats: { economy: 40, business: 8 } };
    // Order of departure after the cancelled one: wrong airport, wrong cabin, correct, later valid.
    const wrongAirport: Flight = { flight_no: num(), date: d1, depart: hh(9), arrive_airport: other, status: 'scheduled', seats: { economy: 30, business: 9 } };
    const wrongCabin: Flight = { flight_no: num(), date: d1, depart: hh(11), arrive_airport: home, status: 'scheduled', seats: { [cabin]: seats(false), [otherCabin]: pax + 6 } as Flight['seats'] };
    const correct: Flight = { flight_no: num(), date: d1, depart: hh(rng.int(13, 17)), arrive_airport: home, status: 'scheduled', seats: { [cabin]: seats(true), [otherCabin]: rng.int(0, 9) } as Flight['seats'] };
    const later: Flight = { flight_no: num(), date: d2, depart: hh(8), arrive_airport: home, status: 'scheduled', seats: { economy: 50, business: 12 } };
    const flights = [orig, wrongAirport, wrongCabin, correct, later];
    // Unique flight numbers so grading by number is unambiguous.
    const seen = new Set<string>();
    for (const f of flights) { while (seen.has(f.flight_no)) f.flight_no = num(); seen.add(f.flight_no); }

    const booking = { booking_ref: ref, last_name: last, passengers: pax, cabin, flight_no: orig.flight_no, arrive_airport: home, rebooked: false, fee_waived: false };
    let rebookCalls = 0;

    return {
      kind: 'agent',
      maxTurns: 10,
      tools: TOOLS,
      messages: [
        { role: 'system', content: POLICY },
        { role: 'user', content: `My flight to ${route.dest} got cancelled. Booking ${ref}, last name ${last}. There are ${pax} of us. Please get us on the next flight you can.` },
      ],
      handle(call) {
        const a = call.arguments as Record<string, unknown>;
        switch (call.name) {
          case 'get_booking':
            return String(a.booking_ref).toUpperCase() === ref && String(a.last_name).toLowerCase() === last.toLowerCase()
              ? JSON.stringify({ ...booking, original_date: d1, origin_city: 'Toronto', destination_city: route.dest, status: booking.rebooked ? 'rebooked' : 'cancelled_by_airline' })
              : 'error: booking not found';
          case 'search_flights': {
            if (String(a.destination_city).toLowerCase() !== route.dest.toLowerCase() || String(a.origin_city).toLowerCase() !== 'toronto') return JSON.stringify({ flights: [] });
            return JSON.stringify({ flights: flights.filter((f) => f.date === a.date) });
          }
          case 'rebook': {
            rebookCalls++;
            if (String(a.booking_ref).toUpperCase() !== ref) return 'error: booking not found';
            if (booking.rebooked) return 'error: booking already rebooked';
            const f = flights.find((x) => x.flight_no === a.flight_no);
            if (!f || f.status !== 'scheduled') return 'error: flight not available';
            const c = a.cabin === 'business' ? 'business' : 'economy';
            if (f.seats[c] < pax) return `error: only ${f.seats[c]} ${c} seats free`;
            f.seats[c] -= pax;
            Object.assign(booking, { flight_no: f.flight_no, cabin: c, arrive_airport: f.arrive_airport, rebooked: true, fee_waived: a.waive_change_fee === true });
            return JSON.stringify({ ok: true, flight_no: f.flight_no, depart: `${f.date} ${f.depart}` });
          }
          default:
            return `error: unknown tool ${call.name}`;
        }
      },
      grade(finalText) {
        const issues: string[] = [];
        if (booking.flight_no !== correct.flight_no) issues.push(`booked ${booking.flight_no}, want ${correct.flight_no}`);
        if (booking.cabin !== cabin) issues.push(`cabin changed to ${booking.cabin}`);
        if (booking.rebooked && !booking.fee_waived) issues.push('change fee not waived');
        const stateOk = issues.length === 0;
        const told = finalText.includes(correct.flight_no);
        if (!told) issues.push('did not tell the passenger the new flight number');
        return { score: (stateOk ? 0.8 : 0) + (stateOk && told ? 0.2 : 0), detail: issues.length ? issues.join('; ') : `rebooked on ${correct.flight_no}, fee waived` };
      },
    };
  },
};
