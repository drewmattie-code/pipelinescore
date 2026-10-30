"""Independent re-derivation of every exact-compute answer with Python's decimal module.
Reads the prompts (not the TypeScript solver's internals) and recomputes from scratch."""
import json, re, sys
from decimal import Decimal as D, ROUND_HALF_UP, ROUND_CEILING, getcontext
getcontext().prec = 80

def money(s): return D(s.replace('$', '').replace(',', ''))
def r2(x, places=2): return x.quantize(D(1).scaleb(-places), rounding=ROUND_HALF_UP)

def solve(c):
    i, p = c['id'], c['prompt']
    if i == 'compute-big-multiply-1':
        a, b = re.findall(r'(\d+) × (\d+)', p)[0]; return D(int(a) * int(b))
    if i == 'compute-column-total-1':
        return sum(money(m) for m in re.findall(r'\$([\d,]+\.\d\d)', p))
    if i == 'compute-tiered-rebate-1':
        pct = [D(x) / 100 for x in re.findall(r'([\d.]+)%', p)]
        first = money(re.search(r'on the first \$([\d,]+)', p).group(1))
        nxt = money(re.search(r'on the next \$([\d,]+)', p).group(1))
        total = money(re.search(r'bought \$([\d,]+\.\d\d)', p).group(1))
        return r2(first * pct[0] + nxt * pct[1] + (total - first - nxt) * pct[2])
    if i == 'compute-landed-cost-1':
        rows = re.findall(r'- (.+?): (\d+) units at \$([\d,]+\.\d\d) each, total shipping weight (\d+) kg', p)
        freight = money(re.search(r'freight for the whole container is \$([\d,]+\.\d\d)', p).group(1))
        duty = D(re.search(r'duty of ([\d.]+)%', p).group(1)) / 100
        target = re.search(r'per unit of the (.+?), in dollars', p).group(1)
        kg = sum(int(r[3]) for r in rows)
        name, qty, unit, w = next(r for r in rows if r[0] == target)
        goods = int(qty) * money(unit)
        return r2((goods + freight * int(w) / kg) * (1 + duty) / int(qty))
    if i == 'compute-discount-chain-1':
        lst = money(re.search(r'list price is \$([\d,]+\.\d\d)', p).group(1))
        d1, d2 = [D(x) / 100 for x in re.findall(r'([\d.]+)% (?:discount|off)', p)[:2]]
        return r2(lst * (1 - d1) * (1 - d2) * D('1.13'))
    if i == 'compute-fx-chain-1':
        cad = money(re.search(r'CAD \$([\d,]+\.\d\d)', p).group(1))
        r1 = D(re.search(r'1 CAD = ([\d.]+) USD', p).group(1)); r2_ = D(re.search(r'1 USD = ([\d.]+) EUR', p).group(1))
        return r2(r2(cad * r1) * r2_)
    if i == 'compute-reel-takeoff-1':
        runs = [int(x) for x in re.search(r'in feet: ([\d, ]+)\.', p).group(1).split(', ')]
        reel = int(re.search(r'on (\d+) m reels', p).group(1))
        m = sum(runs) * D('0.3048')
        n = (m / reel).to_integral_value(rounding=ROUND_CEILING)
        return n * reel - m
    if i == 'compute-margin-price-1':
        cost = money(re.search(r'costs \$([\d,]+\.\d\d)', p).group(1))
        mg = D(re.search(r'at least ([\d.]+)%', p).group(1)) / 100
        price = cost / (1 - mg)
        return (price / D('0.05')).to_integral_value(rounding=ROUND_CEILING) * D('0.05')
    if i == 'compute-long-division-1':
        n, d = re.search(r'Divide (\d+) by (\d+)', p).groups(); return r2(D(n) / D(d))
    raise ValueError(i)

cases = json.load(open(sys.argv[1])); bad = 0
for c in cases:
    got = solve(c)
    if D(c['want']) != got:
        bad += 1; print(f"MISMATCH {c['id']}: ts={c['want']} py={got}")
print(f'cross-checked {len(cases)} cases, {bad} mismatches')
