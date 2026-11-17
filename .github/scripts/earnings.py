"""Fetch the Nasdaq earnings calendar for this week and next, keep only the companies that move markets."""
import json, datetime as dt, urllib.request, time, sys

WATCH = {  # always shown, whatever their market cap that day
    'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'AVGO', 'NFLX', 'AMD', 'ORCL', 'CRM', 'ADBE',
    'INTC', 'QCOM', 'MU', 'TSM', 'ASML', 'ARM', 'PLTR', 'COST', 'WMT', 'TGT', 'HD', 'LOW', 'JPM', 'GS', 'MS', 'BAC',
    'WFC', 'C', 'V', 'MA', 'UNH', 'LLY', 'NKE', 'DIS', 'BA', 'CSCO', 'SNOW', 'PANW', 'CRWD', 'SHOP', 'UBER', 'COIN', 'MSTR', 'SMCI',
}
MIN_CAP = 150e9
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}

def num(s):
    try: return float(str(s).replace('$', '').replace(',', '').replace('(', '-').replace(')', ''))
    except Exception: return None

today = dt.date.today(); mon = today - dt.timedelta(days=today.weekday())
out, ok = [], 0
for i in range(14):
    d = mon + dt.timedelta(days=i)
    if d.weekday() > 4: continue
    url = f'https://api.nasdaq.com/api/calendar/earnings?date={d.isoformat()}'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                j = json.load(r); break
        except Exception as e:
            print('retry', d, e, file=sys.stderr); time.sleep(3); j = None
    if not j: continue
    ok += 1
    for row in ((j.get('data') or {}).get('rows') or []):
        sym = (row.get('symbol') or '').upper(); cap = num(row.get('marketCap'))
        if sym not in WATCH and (cap or 0) < MIN_CAP: continue
        t = row.get('time') or ''
        out.append({'d': d.isoformat(), 'sym': sym, 'name': row.get('name') or sym, 'cap': cap,
                    'when': 'bmo' if 'pre' in t else 'amc' if 'after' in t else '',
                    'q': row.get('fiscalQuarterEnding') or '', 'est': row.get('epsForecast') or '', 'n': row.get('noOfEsts') or '',
                    'ly': row.get('lastYearEPS') or '', 'eps': row.get('eps') or '', 'surp': row.get('surprise') or ''})
    time.sleep(1)
if not ok: sys.exit('nasdaq unreachable')
out.sort(key=lambda e: (e['d'], -(e['cap'] or 0)))
old = None
try: old = json.load(open('earnings.json')).get('events')
except Exception: pass
if old == out: print('unchanged'); sys.exit(0)
json.dump({'at': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'from': mon.isoformat(), 'events': out}, open('earnings.json', 'w'), separators=(',', ':'))
print('wrote', len(out))
