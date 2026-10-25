/* ================= Compound · core ================= */
const {html, render, useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect} = window.htmPreact;

/* ---------- small utils ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const pad = n => String(n).padStart(2, '0');
const isNum = v => v !== '' && v != null && !isNaN(+v);
const num = v => isNum(v) ? +v : null;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch (e) { return false } },
  del(k) { try { localStorage.removeItem(k) } catch (e) { } }
};
const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined || (typeof v === 'number' && !isFinite(v))) ? null : v));
const dayKey = d => { d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` };
const todayKey = () => dayKey(new Date());
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) };
const localISO = d => { d = d || new Date(); return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` };
const weekStart = d => { d = new Date(d); d.setHours(0, 0, 0, 0); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return d };
const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmtDate = (d, o = {}) => { d = d instanceof Date ? d : new Date(d); if (isNaN(d)) return '—'; return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(o.year ? { year: 'numeric' } : {}), ...(o.wd ? { weekday: 'short' } : {}) }) };
const fmtTime = d => { d = d instanceof Date ? d : new Date(d); if (isNaN(d)) return ''; return `${pad(d.getHours())}:${pad(d.getMinutes())}` };
const fmtLong = d => (d instanceof Date ? d : new Date(d)).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const fmtDur = m => { if (m == null || !isFinite(m)) return '—'; m = Math.round(m); if (m < 60) return m + 'm'; const h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- money (respects Hide P&L) ---------- */
const UIS = { hide: LS.get('compound.hide', false) };
function money(v, o = {}) {
  if (v == null || !isFinite(v)) return o.inf && v === Infinity ? '∞' : '—';
  if (UIS.hide && !o.show) return '$•••';
  const dec = o.dec ?? (Math.abs(v) < 1000 && v % 1 !== 0 && o.cents !== false ? 2 : 0);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const sign = v < 0 ? '-' : (o.sign && v > 0 ? '+' : '');
  return `${sign}$${s}`;
}
const moneyK = (v, o = {}) => { if (UIS.hide && !o.show) return '$•••'; const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'K' : a.toLocaleString('en-US', { maximumFractionDigits: 0 }); return (v < 0 ? '-' : (o.sign && v > 0 ? '+' : '')) + '$' + s };
const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%';
const rfmt = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d) + 'R';
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';

/* ---------- instruments ---------- */
const INSTR = {
  MNQ: { pv: 2, tick: .25, name: 'Micro E-mini Nasdaq-100', tv: 'CME_MINI:MNQ1!', fam: 'NQ', com: 0.74 },
  NQ: { pv: 20, tick: .25, name: 'E-mini Nasdaq-100', tv: 'CME_MINI:NQ1!', fam: 'NQ', com: 2.8 },
  MES: { pv: 5, tick: .25, name: 'Micro E-mini S&P 500', tv: 'CME_MINI:MES1!', fam: 'ES', com: 0.74 },
  ES: { pv: 50, tick: .25, name: 'E-mini S&P 500', tv: 'CME_MINI:ES1!', fam: 'ES', com: 2.8 },
  M2K: { pv: 5, tick: .1, name: 'Micro Russell 2000', tv: 'CME_MINI:M2K1!', fam: 'RTY', com: 0.74 },
  RTY: { pv: 50, tick: .1, name: 'E-mini Russell 2000', tv: 'CME_MINI:RTY1!', fam: 'RTY', com: 2.8 },
  MYM: { pv: .5, tick: 1, name: 'Micro Dow', tv: 'CBOT_MINI:MYM1!', fam: 'YM', com: 0.74 },
  YM: { pv: 5, tick: 1, name: 'E-mini Dow', tv: 'CBOT_MINI:YM1!', fam: 'YM', com: 2.8 },
  MGC: { pv: 10, tick: .1, name: 'Micro Gold', tv: 'COMEX_MINI:MGC1!', fam: 'GC', com: 0.94 },
  GC: { pv: 100, tick: .1, name: 'Gold', tv: 'COMEX:GC1!', fam: 'GC', com: 3.1 },
  MCL: { pv: 100, tick: .01, name: 'Micro Crude Oil', tv: 'NYMEX:MCL1!', fam: 'CL', com: 0.94 },
  CL: { pv: 1000, tick: .01, name: 'Crude Oil', tv: 'NYMEX:CL1!', fam: 'CL', com: 3.1 },
  SIL: { pv: 1000, tick: .005, name: 'Micro Silver', tv: 'COMEX:SIL1!', fam: 'SI', com: 0.94 },
  M6E: { pv: 12500, tick: .0001, name: 'Micro EUR/USD', tv: 'CME:M6E1!', fam: '6E', com: 0.5 },
  '6E': { pv: 125000, tick: .00005, name: 'Euro FX', tv: 'CME:6E1!', fam: '6E', com: 3 },
  NAS100: { pv: 10, tick: .1, name: 'Nasdaq 100 CFD', tv: 'OANDA:NAS100USD', fam: 'NQ', com: 0, cfd: true, idx: true },
  US30: { pv: 1, tick: .1, name: 'Dow 30 CFD', tv: 'OANDA:US30USD', fam: 'YM', com: 0, cfd: true, idx: true },
  US500: { pv: 1, tick: .1, name: 'S&P 500 CFD', tv: 'OANDA:SPX500USD', fam: 'ES', com: 0, cfd: true, idx: true },
  GER40: { pv: 1, tick: .1, name: 'DAX 40 CFD', tv: 'OANDA:DE30EUR', fam: 'DAX', com: 0, cfd: true, idx: true },
  XAUUSD: { pv: 100, tick: .01, name: 'Gold spot CFD', tv: 'OANDA:XAUUSD', fam: 'GC', com: 0, cfd: true },
};
const SYM_ALIAS = { USTEC: 'NAS100', NAS100USD: 'NAS100', NDX100: 'NAS100', US100: 'NAS100', USTECH: 'NAS100', NSDQ100: 'NAS100', US30USD: 'US30', DJ30: 'US30', SPX500: 'US500', US500USD: 'US500', SPX500USD: 'US500', DE40: 'GER40', DE30: 'GER40', GOLD: 'XAUUSD' };
const MONTH_CODE = /^[FGHJKMNQUVXZ]\d{1,4}$/;
function normSym(s) {
  s = String(s || '').toUpperCase().trim().split(/[\s.:]/)[0].replace(/!$/, '').replace(/1$/, '');
  if (!s) return '';
  if (INSTR[s]) return s; const al = s.replace(/[._-]?(CASH|SPOT|M|RAW|PRO|C)$/,''); if (SYM_ALIAS[s]) return SYM_ALIAS[s]; if (SYM_ALIAS[al]) return SYM_ALIAS[al]; if (INSTR[al] && INSTR[al].cfd) return al;
  for (let L = Math.min(4, s.length - 1); L >= 1; L--) { const p = s.slice(0, L); if (INSTR[p] && MONTH_CODE.test(s.slice(L))) return p }
  return s;
}
const instr = s => INSTR[normSym(s)] || { pv: 1, tick: .01, name: s, tv: s, fam: s, com: 0 };
const tvURL = s => 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(instr(s).tv || s);

/* ---------- vocab ---------- */
const GRADES = ['A+', 'A', 'B', 'C', 'D'];
const gradeCls = g => g === 'A+' ? 'g-Ap' : 'g-' + (g || 'B');
const gradeScore = g => ({ 'A+': 4, A: 3.4, B: 2.5, C: 1.5, D: 0.5 }[g] ?? null);
/* daily journal helpers: plan levels used to be one text blob, now a list of chips; day rating moved from 1–5 to 1–10 */
function planLevels(p) { if (!p || !p.levels) return []; if (Array.isArray(p.levels)) return p.levels.filter(Boolean); return String(p.levels).split(/\n|·|;/).map(x => x.trim()).filter(Boolean) }
function levelsText(p) { return planLevels(p).join(' / ') }
function dayScore(d) { const r = d && d.review; if (!r) return null; if (r.score != null) return +r.score; if (r.rating != null) return Math.round(+r.rating * 2); return null }
function journaledDay(d) { return !!(d && (d.plan || d.review)) }
const BIAS_L = { bull: 'Bullish', bear: 'Bearish', neutral: 'No bias', wait: 'Wait for it' };
const DEFAULT_SETTINGS = {
  name: 'Vivek',
  checklist: ['Have you done your high timeframe?', 'Do you have that FVG gap?', 'Do we have an inverse to the upside?', 'Did we think about this entry before entering?'],
  setups: ['FVG', 'Inverse FVG', 'Order block', 'Breaker', 'Liquidity sweep', 'MSS / CHoCH', 'BOS continuation', 'Silver Bullet', 'Judas swing', 'OTE retrace', 'SMT divergence', 'Opening range'],
  mistakes: ['FOMO entry', 'Moved stop', 'Early exit', 'Oversized', 'Revenge trade', 'No confirmation', 'Chased', 'Against HTF bias', 'Overtraded', 'Ignored plan', 'Held loser', 'News spike'],
  emotions: ['Calm', 'Confident', 'Patient', 'Focused', 'Anxious', 'FOMO', 'Greedy', 'Frustrated', 'Bored', 'Fearful', 'Euphoric', 'Tilted'],
  maxDailyLoss: 1200, maxTrades: 4, maxConsecLosses: 3, dailyGoal: 500,
  defaultSymbol: 'MNQ', defaultQty: 2, commissions: {}, dedupeCopies: true,
  theme: 'dark', accent: 'cobalt', themeV: 3, firmLogos: {}, onboarded: false,
};
const POS_EMO = new Set(['Calm', 'Confident', 'Patient', 'Focused']);
const QUOTES = [
  { q: 'For a man cannot lose either the past or the future: for what a man has not, how can any one take this from him?', a: 'Marcus Aurelius · Meditations II.14 · tr. George Long' },
  { q: 'Men are disturbed not by the things which happen, but by the opinions about the things.', a: 'Epictetus · Enchiridion 5 · tr. George Long' },
  { q: 'We are more often frightened than hurt; and we suffer more from imagination than from reality.', a: 'Seneca · Letters 13 · tr. R. M. Gummere' },
  { q: 'The best way of avenging thyself is not to become like the wrong doer.', a: 'Marcus Aurelius · Meditations VI.6 · tr. George Long' },
  { q: 'Very little is needed to make a happy life.', a: 'Marcus Aurelius · Meditations VII.67 · tr. George Long' },
  { q: 'No man is free who is not master of himself.', a: 'Epictetus · Fragments · tr. George Long' },
];

/* ---------- prop firms (brand-coloured monograms; upload a real logo per firm in Propfirm) ---------- */
const FIRMS = [
  { id: 'lucid', name: 'Lucid Trading', mono: 'L', c: ['#1B1F3B', '#6C63FF'], plans: ['LucidFlex', 'LucidPro', 'LucidDirect', 'LucidBlack'], url: 'https://lucidtrading.com' },
  { id: 'tradeify', name: 'Tradeify', mono: 'T', c: ['#04342F', '#13D6B4'], plans: ['Growth', 'Select Flex', 'Select Daily', 'Lightning', 'Level Up'], url: 'https://tradeify.co' },
  { id: 'tradeifyfx', name: 'Tradeify FX', mono: 'FX', c: ['#032B2A', '#0FB5A0'], plans: ['1-Step', '2-Step', 'Instant'], url: 'https://tradeify.co', market: 'cfd', platform: 'MT5', presets: { 5000: { target: 500, mll: 250, dll: 0, cons: 40 }, 10000: { target: 1000, mll: 500, dll: 0, cons: 40 }, 25000: { target: 2500, mll: 1250, dll: 0, cons: 40 }, 50000: { target: 5000, mll: 2500, dll: 0, cons: 40 }, 100000: { target: 10000, mll: 5000, dll: 0, cons: 40 } } },
  { id: 'topstep', name: 'Topstep', mono: 'TS', c: ['#0F1E3A', '#2E7BFF'], plans: ['Trading Combine', 'Express Funded', 'Live Funded'], url: 'https://www.topstep.com' },
  { id: 'apex', name: 'Apex Trader Funding', mono: 'AX', c: ['#2A1600', '#FF8A00'], plans: ['EOD Eval', 'Intraday Eval', 'Performance Account'], url: 'https://apextraderfunding.com' },
  { id: 'mff', name: 'MyFundedFutures', mono: 'MF', c: ['#081A33', '#3BA0FF'], plans: ['Core', 'Rapid', 'Pro'], url: 'https://myfundedfutures.com' },
  { id: 'tpt', name: 'Take Profit Trader', mono: 'TP', c: ['#06281C', '#22C55E'], plans: ['Test', 'PRO', 'PRO+'], url: 'https://takeprofittrader.com' },
  { id: 'alpha', name: 'Alpha Futures', mono: 'α', c: ['#180B2E', '#A855F7'], plans: ['Standard', 'Advanced', 'Zero'], url: 'https://alpha-futures.com' },
  { id: 'fundednext', name: 'FundedNext Futures', mono: 'FN', c: ['#1C1035', '#7C3AED'], plans: ['Rapid', 'Legacy', 'Bolt'], url: 'https://fundednext.com' },
  { id: 'blueguardian', name: 'Blue Guardian', mono: 'BG', c: ['#05182F', '#1E90FF'], plans: ['Reserve', 'Instant', 'Futures Eval'], url: 'https://blueguardian.com' },
  { id: 'blueguardianfx', name: 'Blue Guardian CFD', mono: 'BG', c: ['#05182F', '#3FA9FF'], plans: ['Standard', 'Elite', 'Rapid', 'Instant'], url: 'https://blueguardian.com', market: 'cfd', platform: 'MT5' },
  { id: 'bulenox', name: 'Bulenox', mono: 'BX', c: ['#2B0A0A', '#F43F5E'], plans: ['Option 1 · Trailing', 'Option 2 · EOD', 'Master'], url: 'https://bulenox.com' },
  { id: 'etf', name: 'Elite Trader Funding', mono: 'E', c: ['#231A02', '#EAB308'], plans: ['1-Step', 'EOD Drawdown', 'Static', 'Fast Track'], url: 'https://elitetraderfunding.com' },
  { id: 'tradeday', name: 'TradeDay', mono: 'TD', c: ['#03252A', '#06B6D4'], plans: ['Intraday', 'EOD', 'Static'], url: 'https://tradeday.com' },
  { id: 'e2t', name: 'Earn2Trade', mono: 'E2', c: ['#0A2410', '#4ADE80'], plans: ['Gauntlet Mini', 'Trader Career Path'], url: 'https://earn2trade.com' },
  { id: 'phidias', name: 'Phidias', mono: 'Φ', c: ['#221005', '#FB923C'], plans: ['Static', 'Fundamental', 'Swing'], url: 'https://phidiaspropfirm.com' },
  { id: 'topone', name: 'Top One Futures', mono: '1', c: ['#111111', '#E5E7EB'], plans: ['Eval', 'Elite', 'Prime'], url: 'https://toponefutures.com' },
  { id: 'ffn', name: 'Funded Futures Network', mono: 'FF', c: ['#0B1F2E', '#38BDF8'], plans: ['Standard', 'Pro'], url: 'https://fundedfuturesnetwork.com' },
  { id: 'personal', name: 'Personal / Broker', mono: '$', c: ['#151619', '#8B8F99'], plans: ['Live cash', 'Paper', 'Sim'], url: '' },
];
/* spending: fees paid per account (eval + resets + activation), times how many identical accounts a history entry stands for */
const blownCost = b => ((+b.fee || 0) + (+b.resets || 0) + (+b.activation || 0)) * Math.max(1, +b.count || 1);
const acctCost = a => (+a.cost || 0) + (+a.activation || 0) + (+a.resets || 0);
const payoutFirm = (S, p) => p.firm || S.accounts[p.account]?.firm || '';
function firmSpend(S) {
  const m = {}; const row = f => (m[f] ||= { firm: f, blownN: 0, blownFees: 0, liveN: 0, liveFees: 0, paid: 0, payN: 0 });
  for (const b of Object.values(S.blown || {})) { const r = row(b.firm || 'personal'); r.blownN += Math.max(1, +b.count || 1); r.blownFees += blownCost(b) }
  for (const a of Object.values(S.accounts)) { const r = row(a.firm || 'personal'); if (a.status === 'blown') { r.blownN++; r.blownFees += acctCost(a) } else { r.liveN++; r.liveFees += acctCost(a) } }
  for (const p of Object.values(S.payouts)) if (p.status === 'paid') { const r = row(payoutFirm(S, p) || 'personal'); r.paid += +p.amount || 0; r.payN++ }
  return Object.values(m).map(r => ({ ...r, spent: r.blownFees + r.liveFees, net: r.paid - r.blownFees - r.liveFees })).filter(r => r.spent || r.paid || r.blownN || r.liveN);
}
const firmById = id => FIRMS.find(f => f.id === id) || FIRMS[FIRMS.length - 1];
const SIZE_PRESETS = {
  10000: { target: 1000, mll: 500, dll: 0 }, 25000: { target: 1500, mll: 1500, dll: 500 }, 50000: { target: 3000, mll: 2000, dll: 1000 },
  75000: { target: 4500, mll: 2500, dll: 1500 }, 100000: { target: 6000, mll: 3000, dll: 2000 }, 150000: { target: 9000, mll: 4500, dll: 3000 }, 200000: { target: 12000, mll: 6000, dll: 4000 }, 300000: { target: 20000, mll: 7500, dll: 5000 },
};

/* ---------- trade math ---------- */
function tradeCalc(t, settings) {
  const ins = instr(t.symbol);
  const pv = num(t.pv) ?? ins.pv;
  const q = +t.qty || 1, dir = t.side === 'short' ? -1 : 1;
  const e = num(t.entry), x = num(t.exit), s = num(t.stop), tg = num(t.target);
  const comm = (num(t.comPer) ?? settings?.commissions?.[normSym(t.symbol)] ?? ins.com ?? 0) * q;
  const fees = num(t.fees) ?? comm;
  let pnl = null;
  if (t.pnlManual && isNum(t.pnl)) pnl = +t.pnl;
  else if (e != null && x != null) pnl = (x - e) * dir * pv * q - fees;
  else if (isNum(t.pnl)) pnl = +t.pnl;
  const pts = e != null && x != null ? (x - e) * dir : null;
  const risk = e != null && s != null && s !== e ? Math.abs(e - s) * pv * q : (num(t.riskUsd) ?? null);
  const rr = e != null && s != null && tg != null && s !== e ? Math.abs(tg - e) / Math.abs(e - s) : null;
  return { pnl: pnl == null ? null : Math.round(pnl * 100) / 100, pts, risk, rr, fees, pv };
}
const tR = t => (t.risk && t.risk > 0 && t.pnl != null) ? t.pnl / t.risk : null;
const tTime = t => new Date(t.t || t.created || 0).getTime();
const tExit = t => t.tx ? new Date(t.tx).getTime() : tTime(t);
const holdMin = t => t.tx && t.t ? (new Date(t.tx) - new Date(t.t)) / 60000 : null;
const NYF = (() => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }) } catch (e) { return null } })();
function nyHM(d) { d = new Date(d); if (!NYF) return d.getHours() + d.getMinutes() / 60; const p = NYF.formatToParts(d); const h = +p.find(x => x.type === 'hour').value % 24; const m = +p.find(x => x.type === 'minute').value; return h + m / 60 }
function sessionOf(t) { const h = nyHM(t.t); if (h >= 18 || h < 2) return 'Asia'; if (h < 8) return 'London'; if (h < 9.5) return 'NY Pre'; if (h < 11) return 'NY Open'; if (h < 12) return 'NY Late AM'; if (h < 13.5) return 'NY Lunch'; if (h < 16) return 'NY PM'; return 'After hours' }
const SESSIONS = ['Asia', 'London', 'NY Pre', 'NY Open', 'NY Late AM', 'NY Lunch', 'NY PM', 'After hours'];

/* ---------- stats ---------- */
function stats(ts) {
  const a = [...ts].filter(t => t.pnl != null).sort((x, y) => tExit(x) - tExit(y));
  let w = 0, l = 0, be = 0, gw = 0, gl = 0, cw = 0, cl = 0, mcw = 0, mcl = 0, eq = 0, peak = 0, mdd = 0, best = null, worst = null;
  let rS = 0, rN = 0, rW = 0, rWN = 0, rL = 0, rLN = 0, holdW = 0, holdWN = 0, holdL = 0, holdLN = 0;
  for (const t of a) {
    const p = t.pnl;
    if (p > 0) { w++; gw += p; cw++; cl = 0 } else if (p < 0) { l++; gl -= p; cl++; cw = 0 } else { be++ }
    mcw = Math.max(mcw, cw); mcl = Math.max(mcl, cl);
    eq += p; peak = Math.max(peak, eq); mdd = Math.max(mdd, peak - eq);
    if (!best || p > best.pnl) best = t; if (!worst || p < worst.pnl) worst = t;
    const r = tR(t); if (r != null) { rS += r; rN++; if (p > 0) { rW += r; rWN++ } else if (p < 0) { rL += r; rLN++ } }
    const h = holdMin(t); if (h != null) { if (p > 0) { holdW += h; holdWN++ } else if (p < 0) { holdL += h; holdLN++ } }
  }
  const n = a.length;
  return {
    n, w, l, be, wr: (w + l) ? w / (w + l) : 0, net: gw - gl, gw, gl, pf: gl ? gw / gl : (gw ? Infinity : 0),
    avgW: w ? gw / w : 0, avgL: l ? gl / l : 0, exp: n ? (gw - gl) / n : 0, payoff: (l && w) ? (gw / w) / (gl / l) : null,
    expR: rN ? rS / rN : null, avgWR: rWN ? rW / rWN : null, avgLR: rLN ? rL / rLN : null, rN, totR: rS,
    best, worst, mcw, mcl, mdd, holdW: holdWN ? holdW / holdWN : null, holdL: holdLN ? holdL / holdLN : null, cur: cw ? cw : -cl,
  };
}
function groupBy(ts, f) { const m = new Map(); for (const t of ts) { const ks = f(t); for (const k of (Array.isArray(ks) ? ks : [ks])) { if (k == null || k === '') continue; if (!m.has(k)) m.set(k, []); m.get(k).push(t) } } return m }
function byDay(ts) { const m = {}; for (const t of ts) { if (t.pnl == null) continue; const k = dayKey(t.t); (m[k] ||= { pnl: 0, n: 0, w: 0, l: 0, trades: [] }); m[k].pnl += t.pnl; m[k].n++; if (t.pnl > 0) m[k].w++; else if (t.pnl < 0) m[k].l++; m[k].trades.push(t) } return m }
function equitySeries(ts) { const a = [...ts].filter(t => t.pnl != null).sort((x, y) => tExit(x) - tExit(y)); let eq = 0; return a.map(t => { eq += t.pnl; return { t: tExit(t), v: eq, tr: t } }) }

/* Compound Score — five spokes, 0-100 */
function scoreOf(ts, days) {
  const s = stats(ts);
  const wr = clamp((s.wr - .25) / (.65 - .25) * 100);
  const pf = s.pf === Infinity ? 100 : clamp((s.pf - .8) / (2.5 - .8) * 100);
  const ex = s.expR != null ? clamp((s.expR + .25) / .85 * 100) : (s.avgL ? clamp((s.exp / s.avgL + .25) / .85 * 100) : 50);
  const jr = ts.length ? sum(ts, t => ((t.notes || '').length > 12 ? .3 : 0) + (t.grade ? .2 : 0) + ((t.shots || []).length || t.tv ? .25 : 0) + (t.strategy ? .25 : 0)) / ts.length * 100 : 0;
  const traded = Object.keys(byDay(ts));
  const reviewed = traded.filter(k => (days[k]?.review?.text || '').trim().length > 5).length;
  const jour = clamp(jr * .7 + (traded.length ? reviewed / traded.length * 100 : 0) * .3);
  const kept = ts.filter(t => t.rules === true).length, broke = ts.filter(t => t.rules === false).length;
  const mist = ts.filter(t => (t.mistakes || []).length).length;
  const disc = ts.length ? clamp(((kept + (ts.length - kept - broke) * .6) / ts.length) * 100 - mist / ts.length * 35) : 0;
  const spokes = [{ k: 'Win rate', v: wr }, { k: 'Profit factor', v: pf }, { k: 'Expectancy', v: ex }, { k: 'Journaling', v: jour }, { k: 'Discipline', v: disc }];
  const total = Math.round(sum(spokes, x => x.v) / 5);
  return { total: ts.length ? total : 0, spokes, s };
}

/* Monte Carlo: pass vs blow probability against an account's limits */
function monteCarlo(pnls, { toGo, room, maxTrades = 200, runs = 3000, dll = 0, perDay = 3 }) {
  if (pnls.length < 5) return null;
  let pass = 0, blow = 0, tradesToPass = [];
  const curves = [];
  for (let r = 0; r < runs; r++) {
    let eq = 0, peak = 0, k = 0, day = 0, dayN = 0; const curve = r < 60 ? [0] : null; let res = 0;
    for (k = 0; k < maxTrades; k++) {
      const p = pnls[(Math.random() * pnls.length) | 0];
      if (dayN >= perDay) { day = 0; dayN = 0 }
      eq += p; day += p; dayN++;
      peak = Math.max(peak, eq);
      if (curve) curve.push(eq);
      if (toGo != null && eq >= toGo) { res = 1; break }
      if (room != null && eq <= -room) { res = -1; break }
      if (dll && day <= -dll) { day = 0; dayN = perDay }
    }
    if (res === 1) { pass++; tradesToPass.push(k + 1) } else if (res === -1) blow++;
    if (curve) curves.push(curve);
  }
  tradesToPass.sort((a, b) => a - b);
  return { pass: pass / runs, blow: blow / runs, open: (runs - pass - blow) / runs, med: tradesToPass.length ? tradesToPass[tradesToPass.length >> 1] : null, curves };
}

/* ---------- prop account math ---------- */
function acctState(a, trades, adj) {
  const start = +a.size || +a.start || 0;
  const mine = trades.filter(t => t.account === a.id && t.pnl != null).sort((x, y) => tExit(x) - tExit(y));
  const adjs = (adj || []).slice().sort((x, y) => new Date(x.d) - new Date(y.d));
  // balance events: trades + manual balance syncs
  const ev = [...mine.map(t => ({ d: tExit(t), v: t.pnl, k: dayKey(t.t) })), ...adjs.map(x => ({ d: new Date(x.d).getTime(), v: x.v, k: dayKey(x.d) }))].sort((x, y) => x.d - y.d);
  let bal = start, peak = start, eodPeak = start; const days = {}; const hist = [{ d: a.created || 0, b: start }];
  let lastK = null;
  for (const e of ev) {
    if (lastK && e.k !== lastK) eodPeak = Math.max(eodPeak, bal);
    bal += e.v; peak = Math.max(peak, bal); lastK = e.k; days[e.k] = (days[e.k] || 0) + e.v; hist.push({ d: e.d, b: bal });
  }
  if (lastK && lastK !== todayKey()) eodPeak = Math.max(eodPeak, bal);
  const mll = +a.mll || 0;
  const lockFloor = start + (a.lock != null && a.lock !== '' ? +a.lock : 100);
  let floor;
  if (a.dd === 'static' || !mll) floor = start - mll;
  else { const p = a.dd === 'intraday' ? peak : eodPeak; floor = Math.min(p - mll, lockFloor) }
  const profit = bal - start;
  const target = +a.target || 0;
  const today = days[todayKey()] || 0;
  const dll = +a.dll || 0;
  const profDays = Object.values(days).filter(v => v > 0);
  const maxDay = profDays.length ? Math.max(...profDays) : 0;
  const totPos = sum(profDays);
  const consUsed = profit > 0 && maxDay ? maxDay / profit : 0;
  const consLimit = +a.cons ? +a.cons / 100 : 0;
  const consNeed = consLimit && maxDay ? Math.max(0, maxDay / consLimit - profit) : 0;
  return {
    start, bal, peak, eodPeak, floor, left: bal - floor, profit, target, toGo: target ? Math.max(0, target - profit) : null,
    prog: target ? clamp(profit / target * 100, 0, 100) : null, today, dllLeft: dll ? dll + Math.min(0, today) : null, dll,
    days, tradingDays: Object.keys(days).length, maxDay, consUsed, consLimit, consOk: !consLimit || consUsed <= consLimit, consNeed, trades: mine, hist,
  };
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(f); f = '' } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = '' } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row) }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const moneyParse = s => { if (s == null) return null; s = String(s).trim(); if (!s) return null; const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g, '')); const v = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(v) ? null : (neg ? -v : v) };
function parseDateLoose(s) { if (s == null || s === '') return null; s = String(s).trim(); if (/^\d{9,10}$/.test(s)) return new Date(+s * 1000); if (/^\d{12,13}$/.test(s)) return new Date(+s); let d = new Date(s); if (!isNaN(d)) return d; const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T]?(\d{1,2})?:?(\d{2})?:?(\d{2})?\s*(AM|PM)?/i); if (m) { let y = +m[3]; if (y < 100) y += 2000; let h = +(m[4] || 0); if (m[7]) { if (/pm/i.test(m[7]) && h < 12) h += 12; if (/am/i.test(m[7]) && h === 12) h = 0 } return new Date(y, +m[1] - 1, +m[2], h, +(m[5] || 0), +(m[6] || 0)) } return null }

/* ---------- STORE: cloud (db capability, private to you) with local fallback ---------- */
const COLLS = ['trades', 'accounts', 'payouts', 'strategies', 'notes', 'days', 'chats', 'charts', 'boards', 'adjust', 'blown'];
const emptyState = () => { const s = { settings: { ...DEFAULT_SETTINGS }, report: null }; COLLS.forEach(c => s[c] = {}); return s };
const store = {
  s: emptyState(), v: 0, subs: new Set(), mode: 'boot', root: null, uid: null, q: new Map(), timers: {}, ready: {}, localPending: null, caps: {},
  on(f) { this.subs.add(f); return () => this.subs.delete(f) },
  emit() { this.v++; for (const f of this.subs) f(this.v); this.persistSoon() },
  load(x) { const s = emptyState(); if (x) { s.settings = { ...DEFAULT_SETTINGS, ...(x.settings || {}) }; s.report = x.report || null; COLLS.forEach(c => s[c] = { ...(x[c] || {}) }) } this.s = s },
  key() { return this.mode === 'cloud' ? 'compound.cache.' + this.uid : 'compound.local' },
  persistSoon() { clearTimeout(this.pt); this.pt = setTimeout(() => { if (this.mode === 'boot' || this.mode === 'connecting') return; if (!LS.set(this.key(), this.s) && this.mode === 'local') toast('Browser storage is full. Export a backup from Settings.') }, 700) },
  async boot() {
    const local = LS.get('compound.local', null);
    this.load(local); this.mode = 'connecting'; this.emit();
    if (typeof NEEDS_SETUP !== 'undefined' && NEEDS_SETUP) { this.mode = 'setup'; this.emit(); return }
    if (typeof STANDALONE !== 'undefined' && STANDALONE) {
      this.backend = 'supabase'; this.caps.sample = makeAnthropicSample(); this.caps.downloads = fileDownloads;
      this.sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'compound.auth' } });
      this.sb.auth.onAuthStateChange((ev, ses) => { if (ev === 'SIGNED_OUT') { this.unsubs.forEach(u => { try { u() } catch (e) { } }); this.unsubs = []; this.mode = 'login'; this.emit() } });
      let ses = null; try { ses = (await this.sb.auth.getSession()).data.session } catch (e) { }
      if (local && COLLS.some(c => Object.keys(local[c] || {}).length)) this.localPending = local;
      if (!ses) { this.mode = 'login'; this.emit(); return }
      return this.startSb(ses.user.id);
    }
    let db = null, user = null, uidv = null;
    try { if (window.claude?.use) { [db, user] = await Promise.all([claude.use('db'), claude.use('user')]); uidv = user ? await user.id() : null } } catch (e) { }
    try { if (window.claude?.use) { claude.use('sample').then(x => { this.caps.sample = x; this.emit() }); claude.use('assets').then(x => { this.caps.assets = x }); claude.use('downloads').then(x => { this.caps.downloads = x; this.emit() }) } } catch (e) { }
    if (!db || !uidv) { this.mode = 'local'; this.emit(); return }
    this.uid = uidv; this.mode = 'cloud';
    const cache = LS.get(this.key(), null); this.load(cache);
    if (local && COLLS.some(c => Object.keys(local[c] || {}).length)) this.localPending = local;
    this.root = db.doc(`data/users/${uidv}/j`);
    this.subscribe(); this.wakeOnce();
  },
  async startSb(uidv) {
    this.uid = uidv; this.mode = 'cloud'; this.email = (await this.sb.auth.getUser()).data.user?.email || '';
    const cache = LS.get(this.key(), null); this.load(cache);
    this.root = makeSbDB(this.sb, uidv).root;
    this.subscribe(); this.wakeOnce(); this.emit();
  },
  async signOut() { try { await this.sb.auth.signOut() } catch (e) { } this.load(null); this.mode = 'login'; this.emit() },
  wakeOnce() {
    if (this.woke) return; this.woke = true;
    // keep every device live: re-open listeners when the app returns to the foreground or the network comes back
    const wake = () => { if (document.visibilityState === 'visible' && this.mode === 'cloud') { if (this.dead) this.subscribe(); else this.refresh() } };
    document.addEventListener('visibilitychange', wake); addEventListener('online', wake); addEventListener('focus', wake); addEventListener('pageshow', wake);
    if (this.backend === 'supabase') setInterval(() => { if (document.visibilityState === 'visible') this.refresh() }, 120000);
  },
  unsubs: [], dead: false, lastSync: 0, syncErr: false,
  subscribe() {
    this.unsubs.forEach(u => { try { u() } catch (e) { } }); this.unsubs = []; this.dead = false;
    const err = e => { if (e?.code === 'revoked') { this.mode = 'local'; this.emit(); return } this.dead = true; this.syncErr = true; this.emit(); clearTimeout(this.rt); this.rt = setTimeout(() => this.mode === 'cloud' && this.subscribe(), 4000) };
    const seen = () => { this.lastSync = Date.now(); this.syncErr = false };
    this.unsubs.push(this.root.onSnapshot(snap => { if (snap.exists) { const d = snap.data(); this.s.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) }; this.s.report = d.report || null } this.ready.root = true; seen(); this.emit() }, err));
    for (const c of COLLS) this.unsubs.push(this.root.collection(c).onSnapshot(snap => { const o = {}; for (const d of snap.docs) if (d.exists) o[d.id] = d.data(); this.s[c] = o; this.ready[c] = true; seen(); this.emit() }, err));
  },
  async refresh() {
    if (this.mode !== 'cloud' || Date.now() - this.lastSync < 5000) return;
    try {
      const [r, ...cs] = await Promise.all([this.root.get(), ...COLLS.map(c => this.root.collection(c).get())]);
      if (r.exists) { const d = r.data(); this.s.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) }; this.s.report = d.report || null }
      COLLS.forEach((c, i) => { const o = {}; for (const d of cs[i].docs) if (d.exists) o[d.id] = d.data(); this.s[c] = o });
      this.lastSync = Date.now(); this.syncErr = false; this.emit();
    } catch (e) { this.subscribe() }
  },
  write(path, fn) { const prev = this.q.get(path) || Promise.resolve(); const p = prev.then(fn).catch(e => this.fail(e)); this.q.set(path, p); return p },
  fail(e) { console.warn('save failed', e); if (e?.code === 'quota_exceeded') toast('Storage is full. Delete old charts or screenshots.'); else if (e?.code === 'invalid_argument') toast('That item was too large to save.'); else if (e?.code === 'unavailable') toast('Connection hiccup. Retrying on next change.') },
  put(c, obj, delay) {
    obj = { ...obj, u: Date.now() }; if (!obj.id) obj.id = uid();
    this.s[c] = { ...this.s[c], [obj.id]: obj }; this.emit();
    if (this.mode === 'cloud') {
      const key = c + '/' + obj.id; const go = () => this.write(key, () => this.root.collection(c).doc(obj.id).set(clean(this.s[c][obj.id] || obj)));
      clearTimeout(this.timers[key]); if (delay) this.timers[key] = setTimeout(go, delay); else go();
    }
    return obj;
  },
  patch(c, id, p, delay) { const o = this.s[c][id]; if (!o) return; return this.put(c, { ...o, ...p }, delay) },
  del(c, id) { const n = { ...this.s[c] }; delete n[id]; this.s[c] = n; this.emit(); if (this.mode === 'cloud') this.write(c + '/' + id, () => this.root.collection(c).doc(id).delete()) },
  setSettings(p) { this.s.settings = { ...this.s.settings, ...p }; this.emit(); this.saveRoot() },
  setReport(r) { this.s.report = r; this.emit(); this.saveRoot() },
  saveRoot() { if (this.mode !== 'cloud') return; clearTimeout(this.timers.root); this.timers.root = setTimeout(() => this.write('root', () => this.root.set(clean({ settings: this.s.settings, report: this.s.report }))), 450) },
  async migrateLocal() { const L = this.localPending; if (!L) return; let n = 0; for (const c of COLLS) for (const o of Object.values(L[c] || {})) { if (!this.s[c][o.id]) { this.put(c, o); n++ } } if (L.settings) this.setSettings({ ...L.settings, ...this.s.settings }); this.localPending = null; LS.del('compound.local'); this.emit(); toast(`Moved ${n} items into your synced journal`) },
  dismissLocal() { this.localPending = null; this.emit() },
  /* bars for the price-action chart, chunked into docs */
  barCache: {},
  async putBars(id, bars) {
    this.barCache[id] = bars;
    const flat = bars.map(b => [b.time, b.open, b.high, b.low, b.close, b.volume || 0]);
    const CH = 3500, chunks = [];
    for (let i = 0; i < flat.length; i += CH) chunks.push(flat.slice(i, i + CH));
    if (this.mode === 'cloud') { const col = this.root.collection('bars'); for (let i = 0; i < chunks.length; i++) await this.write('bars/' + id + '_' + i, () => col.doc(id + '_' + i).set({ chartId: id, i, d: JSON.stringify(chunks[i]) })) }
    else LS.set('compound.bars.' + id, flat);
    return chunks.length;
  },
  async getBars(id) {
    if (this.barCache[id]) return this.barCache[id];
    let flat = [];
    if (this.mode === 'cloud') { const snap = await this.root.collection('bars').where('chartId', '==', id).get(); const docs = snap.docs.map(d => d.data()).sort((a, b) => a.i - b.i); for (const d of docs) flat = flat.concat(JSON.parse(d.d)) }
    else flat = LS.get('compound.bars.' + id, []);
    const bars = flat.map(r => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));
    this.barCache[id] = bars; return bars;
  },
  async delBars(id, chunks) { delete this.barCache[id]; if (this.mode === 'cloud') { for (let i = 0; i < (chunks || 20); i++) this.write('bars/' + id + '_' + i, () => this.root.collection('bars').doc(id + '_' + i).delete()) } else LS.del('compound.bars.' + id) },
};
function useStore() { const [, set] = useState(0); useEffect(() => { set(store.v); return store.on(v => set(v)) }, []); return store.s }

/* ---------- images: asset upload when available, else compressed inline ---------- */
async function shrinkImage(blob, max = 1600, q = .82) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url });
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', q));
  } finally { URL.revokeObjectURL(url) }
}
const blobToData = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) });
async function saveImage(blob) {
  const assets = store.caps.assets;
  if (assets && store.mode === 'cloud') {
    try { const small = await shrinkImage(blob, 2200, .88); const r = await assets.upload(small || blob); return { id: r.id, url: r.url } } catch (e) { console.warn(e) }
  }
  let b = await shrinkImage(blob, 1280, .74); let d = await blobToData(b);
  if (d.length > 170000) { b = await shrinkImage(blob, 900, .62); d = await blobToData(b) }
  return { id: uid(), url: d };
}

/* ---------- derived view of trades (filters, mode, copies) ---------- */
function computeTrades(S, f = {}) {
  const acc = S.accounts;
  let all = Object.values(S.trades).map(t => { const c = tradeCalc(t, S.settings); return { ...t, pnl: c.pnl, risk: c.risk, rr: c.rr, pts: c.pts, fees: c.fees } });
  all.sort((a, b) => tTime(b) - tTime(a));
  const mode = f.mode || 'live';
  let ts = all.filter(t => { const m = t.mode || (acc[t.account]?.mode) || 'live'; return mode === 'all' || m === mode });
  const sel = f.accounts && f.accounts.length ? new Set(f.accounts) : (f.account && f.account !== 'all' ? new Set([f.account]) : null);
  if (sel) ts = ts.filter(t => sel.has(t.account));
  if ((!sel || sel.size > 1) && S.settings.dedupeCopies && f.dedupe !== false) { const leads = new Set(ts.filter(t => t.group && t.lead).map(t => t.group)); const seen = new Set(); ts = ts.filter(t => { if (!t.group) return true; if (leads.has(t.group)) return !!t.lead; if (seen.has(t.group)) return false; seen.add(t.group); return true }) }
  return { all, ts };
}

function scopeLabel(S, F) { const ids = (F.accounts || []).filter(id => S.accounts[id]); if (!ids.length) return 'All accounts'; if (ids.length === 1) return S.accounts[ids[0]].label || firmById(S.accounts[ids[0]].firm).name; return ids.length + ' accounts' }

/* ---------- markets: futures (contracts) vs CFD (lots) ---------- */
function acctMarket(a) { return a ? (a.market || firmById(a.firm).market || 'futures') : 'futures' }
function isCfdAcct(S, id) { return acctMarket(S.accounts[id]) === 'cfd' }
/* per-trade fields an account forces: CFD lots use the account's $/point for index CFDs, its per-lot commission and pip size */
const CFD_PPL = 10; /* Tradeify FX / MT5 NAS100: contract size 10, so $10 per point per 1.00 lot */
/* v2: NAS100 used $1/pt/lot; real MT5 contract is $10. Fixes accounts still on the old default and their saved trades. */
function migrateCfdPV(S) {
  const ids = Object.values(S.accounts).filter(a => acctMarket(a) === 'cfd' && (a.ppl == null || a.ppl === '' || +a.ppl === 1)).map(a => a.id);
  for (const id of ids) store.put('accounts', { ...S.accounts[id], ppl: CFD_PPL });
  let n = 0; for (const t of Object.values(S.trades)) { if (!ids.includes(t.account) || !instr(t.symbol).idx) continue; if (t.pv == null || +t.pv === 1) { store.put('trades', { ...t, pv: CFD_PPL }); n++ } }
  store.setSettings({ cfdV: 2 }); return n;
}
function acctExtras(S, id, sym) {
  const a = S.accounts[id]; if (acctMarket(a) !== 'cfd') return { pv: undefined, comPer: undefined, unit: undefined, pip: undefined };
  const ins = instr(sym); const ppl = num(a.ppl) ?? CFD_PPL;
  return { pv: ins.idx ? ppl : undefined, comPer: num(a.lotCom) ?? 0, unit: 'lot', pip: num(a.pip) ?? 1 };
}
const unitOf = t => t && t.unit === 'lot' ? 'lots' : 'ct';
const qtyFmt = t => { const q = +t.qty || 0; return (t.unit === 'lot' ? (Math.round(q * 100) / 100).toString() : q) + ' ' + unitOf(t) };

/* equivalent symbol when a trade is copied across markets (NAS100 CFD <-> MNQ futures etc.) */
const FAM_FUT = { NQ: 'MNQ', ES: 'MES', YM: 'MYM', RTY: 'M2K', GC: 'MGC', CL: 'MCL' }, FAM_CFD = { NQ: 'NAS100', ES: 'US500', YM: 'US30', GC: 'XAUUSD', DAX: 'GER40' };
function symForAcct(S, id, sym) {
  if (!id || !S.accounts[id]) return sym; const cfd = isCfdAcct(S, id); const ins = instr(sym);
  if (cfd && !ins.cfd) return FAM_CFD[ins.fam] || sym;
  if (!cfd && ins.cfd) { const d = S.settings.defaultSymbol; if (d && instr(d).fam === ins.fam && !instr(d).cfd) return d; return FAM_FUT[ins.fam] || sym }
  return sym;
}

/* ================= Compound · standalone platform (own hosting) =================
   Supabase sync adapter with the same surface the store already uses (doc / collection /
   onSnapshot / set / delete / get / where), plus an Anthropic API bridge that mimics the
   `sample` capability so the AI coach works outside Claude. */
const CFG = (() => {
  let c = { ...(window.COMPOUND_CFG || {}) };
  try { const m = location.hash.match(/setup=([^&]+)/); if (m) { const x = JSON.parse(atob(decodeURIComponent(m[1]))); if (x.supabaseUrl && x.supabaseKey) LS.set('compound.cfg', x); history.replaceState(null, '', location.pathname + location.search) } } catch (e) { }
  if (!c.supabaseUrl || !c.supabaseKey) { const s = LS.get('compound.cfg', null); if (s?.supabaseUrl) c = s }
  return c;
})();
const STANDALONE = !window.claude && !!CFG.supabaseUrl && !!CFG.supabaseKey && !!window.supabase;
const NEEDS_SETUP = !window.claude && !!window.supabase && !STANDALONE;
const setupLink = () => location.origin + location.pathname + '#setup=' + encodeURIComponent(btoa(JSON.stringify({ supabaseUrl: CFG.supabaseUrl, supabaseKey: CFG.supabaseKey })));

function sbSnapDoc(id, data) { return { id, exists: data !== undefined, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } } }
function sbErr(e) { const m = e?.message || String(e); return { code: /JWT|auth|permission|401|403/i.test(m) ? 'revoked' : /too large|payload/i.test(m) ? 'invalid_argument' : 'unavailable', message: m } }

function makeSbDB(sb, uid) {
  const listeners = new Map(); // coll -> Set(fn)
  const maps = new Map();      // coll -> Map(id -> data)
  let channel = null, errSubs = new Set();
  const deliver = c => { const m = maps.get(c); if (!m) return; const docs = [...m.entries()].map(([id, d]) => sbSnapDoc(id, d)); for (const f of (listeners.get(c) || [])) f(c === '_root' ? sbSnapDoc('j', m.get('j')) : { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }) };
  const ensureChannel = () => {
    if (channel) return;
    const onChange = p => {
      const row = p.new && Object.keys(p.new).length ? p.new : p.old; if (!row || row.user_id !== uid) return;
      const m = maps.get(row.coll); if (!m) return;
      if (p.eventType === 'DELETE') m.delete(row.id); else m.set(row.id, row.data);
      deliver(row.coll);
    };
    // Supabase can't filter DELETE events, so deletes are matched on the primary key (user_id, coll, id) here
    channel = sb.channel('docs-' + uid + '-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'docs', filter: 'user_id=eq.' + uid }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'docs', filter: 'user_id=eq.' + uid }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'docs' }, onChange)
      .subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { if (!channel) return; const ch = channel; channel = null; try { sb.removeChannel(ch) } catch (e) { } for (const f of errSubs) f({ code: 'unavailable', message: 'realtime ' + st }) } });
  };
  async function loadColl(c) {
    const out = new Map(); let from = 0; const N = 1000;
    for (; ;) { const { data, error } = await sb.from('docs').select('id,data').eq('user_id', uid).eq('coll', c).range(from, from + N - 1); if (error) throw sbErr(error); for (const r of data) out.set(r.id, r.data); if (data.length < N) break; from += N }
    return out;
  }
  const listen = (c, next, error) => {
    if (!listeners.has(c)) listeners.set(c, new Set()); listeners.get(c).add(next); if (error) errSubs.add(error);
    ensureChannel();
    loadColl(c).then(m => { maps.set(c, m); deliver(c) }).catch(e => error && error(e));
    return () => { listeners.get(c)?.delete(next); if (error) errSubs.delete(error); if (![...listeners.values()].some(s => s.size) && channel) { const ch = channel; channel = null; try { sb.removeChannel(ch) } catch (e) { } } };
  };
  const setDoc = async (c, id, data) => { const { error } = await sb.from('docs').upsert({ user_id: uid, coll: c, id, data, updated_at: new Date().toISOString() }); if (error) throw sbErr(error) };
  const delDoc = async (c, id) => { const { error } = await sb.from('docs').delete().eq('user_id', uid).eq('coll', c).eq('id', id); if (error) throw sbErr(error) };
  const coll = c => ({
    onSnapshot: (n, e) => listen(c, n, e),
    get: async () => { const m = await loadColl(c); const docs = [...m.entries()].map(([id, d]) => sbSnapDoc(id, d)); return { docs, size: docs.length, empty: !docs.length } },
    doc: id => ({ set: d => setDoc(c, id, d), delete: () => delDoc(c, id), get: async () => { const { data, error } = await sb.from('docs').select('data').eq('user_id', uid).eq('coll', c).eq('id', id).maybeSingle(); if (error) throw sbErr(error); return sbSnapDoc(id, data ? data.data : undefined) } }),
    where: (f, op, v) => ({ get: async () => { const { data, error } = await sb.from('docs').select('id,data').eq('user_id', uid).eq('coll', c).eq('data->>' + f, String(v)); if (error) throw sbErr(error); const docs = data.map(r => sbSnapDoc(r.id, r.data)); return { docs, size: docs.length, empty: !docs.length } } }),
  });
  const root = { onSnapshot: (n, e) => listen('_root', n, e), set: d => setDoc('_root', 'j', d), get: async () => { const m = await loadColl('_root'); return sbSnapDoc('j', m.get('j')) }, collection: c => coll(c) };
  return { root };
}

/* ---------- AI: Anthropic Messages API, shaped like claude.use('sample') ---------- */
const AI_MODELS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };
function aiKey() { return LS.get('compound.aikey', '') }
async function blobB64(b) { const d = await blobToData(b); return { media_type: (b.type && b.type.startsWith('image/') ? b.type : 'image/jpeg'), data: d.split(',')[1] } }
function makeAnthropicSample() {
  const fail = (code, message, text) => { throw { code, message, text } };
  async function sample(input, opts = {}) {
    const key = aiKey(); if (!key) fail('not_granted', 'Add your Anthropic API key in Settings → AI.');
    let msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(m => ({ role: m.role, content: m.content }));
    const merged = []; for (const m of msgs) { const last = merged[merged.length - 1]; if (last && last.role === m.role) last.content += '\n\n' + m.content; else merged.push({ ...m }) }
    msgs = merged.map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
    if (opts.images) { const imgs = [...(opts.images instanceof Blob ? [opts.images] : opts.images)].slice(0, 4); const blocks = []; for (const b of imgs) { const x = await blobB64(b); blocks.push({ type: 'image', source: { type: 'base64', ...x } }) } msgs[msgs.length - 1].content = [...blocks, ...msgs[msgs.length - 1].content] }
    const model = opts.model || (opts.modelTier === 'complex' ? AI_MODELS.complex : (LS.get('compound.aimodel', '') || AI_MODELS[opts.modelTier || 'default'] || AI_MODELS.default));
    const tools = (opts.tools || []).map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
    let full = '', stop = null;
    for (let round = 0; round < 8; round++) {
      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: opts.signal, headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: opts.modelTier === 'complex' ? 8000 : 4096, stream: true, messages: msgs, ...(tools.length ? { tools } : {}) }) });
      } catch (e) { if (e?.name === 'AbortError') fail('cancelled', 'Stopped', full); fail('upstream_error', 'Network error', full) }
      if (!res.ok) { let m = ''; try { m = (await res.json())?.error?.message || '' } catch (e) { } fail(res.status === 401 || res.status === 403 ? 'not_granted' : res.status === 429 ? 'rate_limited' : res.status === 400 && /too long|too large/i.test(m) ? 'prompt_too_large' : res.status === 400 ? 'invalid_request' : 'upstream_error', m || ('HTTP ' + res.status), full) }
      const blocks = []; const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      const sep = full ? '\n\n' : ''; let roundText = '';
      try {
        for (; ;) {
          const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue;
            let ev; try { ev = JSON.parse(line.slice(5)) } catch (e) { continue }
            if (ev.type === 'content_block_start') blocks[ev.index] = { ...ev.content_block, _json: '' };
            else if (ev.type === 'content_block_delta') { const b = blocks[ev.index]; if (ev.delta.type === 'text_delta') { b.text = (b.text || '') + ev.delta.text; roundText += ev.delta.text; opts.onText && opts.onText({ text: full + sep + roundText, delta: ev.delta.text }) } else if (ev.delta.type === 'input_json_delta') b._json += ev.delta.partial_json }
            else if (ev.type === 'message_delta') stop = ev.delta?.stop_reason || stop;
            else if (ev.type === 'error') fail('upstream_error', ev.error?.message || 'Stream error', full + sep + roundText);
          }
        }
      } catch (e) { if (e?.code) throw e; if (e?.name === 'AbortError') fail('cancelled', 'Stopped', full + sep + roundText); fail('upstream_error', 'Stream interrupted', full + sep + roundText) }
      if (roundText) full += sep + roundText;
      const uses = blocks.filter(b => b && b.type === 'tool_use');
      if (stop !== 'tool_use' || !uses.length) break;
      const content = blocks.filter(Boolean).map(b => b.type === 'text' ? { type: 'text', text: b.text || '' } : { type: 'tool_use', id: b.id, name: b.name, input: b._json ? JSON.parse(b._json) : {} });
      msgs.push({ role: 'assistant', content });
      const results = [];
      for (const u of content.filter(b => b.type === 'tool_use')) {
        const t = (opts.tools || []).find(x => x.name === u.name);
        try { const out = await t.execute(u.input, { signal: opts.signal }); results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out ?? { ok: true }).slice(0, 20000) }) }
        catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + (e?.message || e), is_error: true }) }
      }
      msgs.push({ role: 'user', content: results });
    }
    if (!full) fail('empty_completion', 'No answer');
    return { text: full, truncated: stop === 'max_tokens', modelTierApplied: opts.modelTier || 'default', modelApplied: model };
  }
  sample.json = async (input, opts) => { const r = await sample(typeof input === 'string' ? input + '\n\nReply with the JSON only, no prose, no code fences.' : input, opts); const t = r.text; const a = t.indexOf('{'), b = t.lastIndexOf('}'); try { return JSON.parse(t.slice(a, b + 1)) } catch (e) { throw { code: 'invalid_json', message: 'Could not parse', text: t } } };
  sample.limits = async () => ({ maxPromptBytes: 600000, images: { maxCount: 4, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });
  return sample;
}
const fileDownloads = { save: async ({ filename, data }) => { const b = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.json') ? 'application/json' : 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000) } };

/* login screen for the standalone app */
function Login() {
  const [email, setEmail] = useState(LS.get('compound.email', '')); const [pw, setPw] = useState(''); const [mode, setMode] = useState('in'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const f = mode === 'in' ? store.sb.auth.signInWithPassword({ email, password: pw }) : store.sb.auth.signUp({ email, password: pw });
      const { data, error } = await f; if (error) throw error;
      if (!data.session) { setErr('Account created, but email confirmation is on. Turn off "Confirm email" in Supabase → Authentication, then sign in.'); setMode('in') }
      else { LS.set('compound.email', email); await store.startSb(data.session.user.id) }
    } catch (x) { setErr(x.message === 'Invalid login credentials' ? 'Wrong email or password.' : x.message) }
    setBusy(false);
  };
  return html`<div style=${{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: '24px max(16px,env(safe-area-inset-left,0px))', background: 'radial-gradient(60% 40% at 50% 30%,var(--accs),transparent),var(--bg)' }}>
    <form onSubmit=${go} class="col" style=${{ width: 'min(420px,100%)', gap: '14px' }}>
      <div class="col" style=${{ alignItems: 'center', gap: '10px', marginBottom: '10px' }}><${Mark} s=${54}/><div class="wm" style=${{ fontSize: '26.5px' }}>Compound</div><div class="mut" style=${{ textAlign: 'center' }}>${mode === 'in' ? 'Sign in to your journal. It syncs to every device you sign in on.' : 'Create your private journal account. Use it on every device.'}</div></div>
      <${Field} label="Email"><input id="lg-email" class="in" type="email" autocomplete="email" required value=${email} onInput=${e => setEmail(e.target.value)}/><//>
      <${Field} label="Password"><input id="lg-pw" class="in" type="password" autocomplete=${mode === 'in' ? 'current-password' : 'new-password'} minlength="6" required value=${pw} onInput=${e => setPw(e.target.value)}/><//>
      ${err && html`<div class="neg" style=${{ fontSize: '11.5px' }}>${err}</div>`}
      <button class="btn btn-w" style=${{ height: '46px' }} disabled=${busy}>${busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      <button type="button" class="btn btn-t" onClick=${() => { setMode(mode === 'in' ? 'up' : 'in'); setErr('') }}>${mode === 'in' ? 'First time? Create your account' : 'Have an account? Sign in'}</button>
    </form></div>`;
}

function Setup() {
  const [u, setU] = useState(''); const [k, setK] = useState(''); const [err, setErr] = useState('');
  const save = e => { e.preventDefault(); let url = u.trim().replace(/\/+$/, ''); if (/^[a-z0-9]{20}$/.test(url)) url = 'https://' + url + '.supabase.co'; if (!/^https:\/\/.+\.supabase\.co$/.test(url)) return setErr('Paste the Project URL, like https://abcd1234.supabase.co'); const key = k.trim(); if (/^sb_secret_/.test(key)) return setErr('That is the secret key. Use the publishable key (sb_publishable_…) instead.'); if (!/^(sb_publishable_|eyJ)/.test(key)) return setErr('Paste the publishable key (starts with sb_publishable_).'); LS.set('compound.cfg', { supabaseUrl: url, supabaseKey: key }); location.reload() };
  return html`<div style=${{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: '24px max(16px,env(safe-area-inset-left,0px))' }}>
    <form onSubmit=${save} class="col" style=${{ width: 'min(440px,100%)', gap: '14px' }}>
      <div class="col" style=${{ alignItems: 'center', gap: '10px', marginBottom: '6px' }}><${Mark} s=${50}/><div class="wm" style=${{ fontSize: '24.5px' }}>Connect Compound</div><div class="mut" style=${{ textAlign: 'center' }}>One-time setup on this device. Supabase → Project Settings → API (or Data API).</div></div>
      <${Field} label="Project URL"><input class="in mono" placeholder="https://xxxx.supabase.co" value=${u} onInput=${e => setU(e.target.value)} autocomplete="off" autocapitalize="off"/><//>
      <${Field} label="Publishable key"><input class="in mono" placeholder="sb_publishable_…" value=${k} onInput=${e => setK(e.target.value)} autocomplete="off" autocapitalize="off"/><//>
      ${err && html`<div class="neg" style=${{ fontSize: '11.5px' }}>${err}</div>`}
      <button class="btn btn-w" style=${{ height: '46px' }}>Connect</button>
      <div class="dim" style=${{ fontSize: '11px', textAlign: 'center' }}>Already set up on another device? Open Settings → Data there and send yourself the setup link.</div>
    </form></div>`;
}

/* ================= Compound · shared UI ================= */
const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5v13"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  column: '<path d="M5 20.5h14M6.5 17.5h11M7.5 17.5V8.5M10.5 17.5V8.5M13.5 17.5V8.5M16.5 17.5V8.5M5.5 8.5h13L12 4z"/>',
  bars: '<path d="M4 20.5h16"/><rect x="5.5" y="11" width="3" height="7" rx=".8"/><rect x="10.5" y="6" width="3" height="12" rx=".8"/><rect x="15.5" y="13.5" width="3" height="4.5" rx=".8"/>',
  building: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M8.5 7.5h2M13.5 7.5h2M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2M10.5 20.5v-3h3v3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  trophy: '<path d="M8 4.5h8v5a4 4 0 01-8 0z"/><path d="M8 6.5H5a3 3 0 003 4M16 6.5h3a3 3 0 01-3 4M12 13.5v3M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5"/>',
  candle: '<path d="M7 3.5v3M7 15.5v5M17 6.5v4M17 18.5v2"/><rect x="5" y="6.5" width="4" height="9" rx="1"/><rect x="15" y="10.5" width="4" height="8" rx="1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M4 4l16 16M10 6c.6-.1 1.3-.2 2-.2 6 0 9.5 6.4 9.5 6.4a17 17 0 01-2.6 3.4M6.6 7.4A16 16 0 002.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 10a3 3 0 004.1 4.1"/>',
  dollar: '<path d="M12 3v18M16.5 7.5c-.6-1.6-2.3-2.5-4.5-2.5-2.6 0-4.5 1.3-4.5 3.3 0 4.9 9.5 2.4 9.5 7.4 0 2-1.9 3.3-4.8 3.3-2.4 0-4.3-1-4.9-2.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', bolt: '<path d="M13 2.5L5 13.5h6.5l-1 8 8-11H12z"/>',
  filter: '<path d="M4 5h16l-6.2 7.5V19l-3.6-1.8v-4.7z"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', down: '<path d="M6 9l6 6 6-6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
  dleft: '<path d="M12 6l-6 6 6 6M19 6l-6 6 6 6"/>', dright: '<path d="M12 6l6 6-6 6M5 6l6 6-6 6"/>',
  upload: '<path d="M12 15.5V4M7 8.5l5-5 5 5M4.5 15v3.5a2 2 0 002 2h11a2 2 0 002-2V15"/>', download: '<path d="M12 4v11.5M7 10.5l5 5 5-5M4.5 15v3.5a2 2 0 002 2h11a2 2 0 002-2V15"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10.5v5.5M14 10.5v5.5"/>', edit: '<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M12.5 7.5l4 4"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6l2.6 1.5M17.2 16.5l2.6 1.5M4.2 18l2.6-1.5M17.2 7.5L19.8 6"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L11.6 6.7"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.4-1.4"/>',
  ext: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17.5 14v4.5a2 2 0 01-2 2h-10a2 2 0 01-2-2v-10a2 2 0 012-2H10"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>', send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  wand: '<path d="M4 20L15 9M14 4.5v2M19.5 10h-2M17.8 6.2l-1.4 1.4M10.5 6.8l1.4 1.4M17.2 12.5l-1.4-1.4"/>', flame: '<path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-4.3-3.6-6.3-4.3-10.3-2.4 1.6-4 4.2-4 6.4-1.2-.6-2-1.8-2.2-3.3-1.5 1.6-2.5 3.6-2.5 6.6C5.5 18.4 8 21 12 21z"/>',
  wallet: '<path d="M4 7.5a2 2 0 012-2h11v3"/><rect x="4" y="7.5" width="16.5" height="12" rx="2"/><circle cx="16.5" cy="13.5" r="1.2"/>', shield: '<path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6.5z"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2h3"/>', pin: '<path d="M9 3.5h6l-1 5.5 3.5 3.5h-11L10 9z"/><path d="M12 12.5v8"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="17.5" r=".9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>', moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 100 17c1.1 0 1.6-.8 1.3-1.7-.4-1.2.4-2.3 1.7-2.3h2a3.5 3.5 0 003.5-3.5c0-5-3.8-9.5-8.5-9.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', up: '<path d="M7 17L17 7M9 7h8v8"/>', dn: '<path d="M7 7l10 10M17 9v8H9"/>', refresh: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4h-4"/>',
  note: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M14.5 3.5v4.5H19M9 12h7M9 15.5h7"/>', board: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9.5 4v16M3.5 10h6"/>',
  home: '<path d="M4 11l8-6.5 8 6.5v8.5a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"/>', yt: '<rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="M10 9.5v5l4.5-2.5z"/>',
  chartl: '<path d="M4 4v16h16"/><path d="M7.5 15l4-5 3 3 4.5-6"/>', sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="8" r="2"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5"/>', cert: '<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><circle cx="16" cy="16.5" r="3"/><path d="M14.5 19l-.5 2.5 2-1 2 1-.5-2.5M7 8.5h8M7 11.5h5"/>',
  brain: '<path d="M9 4.5a3 3 0 00-3 3 3 3 0 00-1.5 5.5A3 3 0 009 19.5V4.5zM15 4.5a3 3 0 013 3 3 3 0 011.5 5.5A3 3 0 0115 19.5V4.5z"/><path d="M9 4.5a3 3 0 016 0M9 19.5a3 3 0 006 0"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>', rotate: '<path d="M4.5 12a7.5 7.5 0 0113-5l2 2M19.5 12a7.5 7.5 0 01-13 5l-2-2M19.5 4.5v4.5H15M4.5 19.5V15H9"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', layers: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5M3.5 16.5l8.5 4.5 8.5-4.5"/>',
};
const I = ({ n, s = 16, w = 1.8, c = '' }) => html`<svg class=${c} width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${w} stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML=${{ __html: ICONS[n] || '' }}></svg>`;

/* Compound mark: three nested arcs, each larger — growth on growth */
const Mark = ({ s = 28 }) => html`<svg width=${s} height=${s} viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="cmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--fg)"/><stop offset="1" stop-color="var(--acc)"/></linearGradient></defs>
  <path class="a1" d="M16 16 m-3.5 0 a3.5 3.5 0 1 1 3.5 3.5" fill="none" stroke="url(#cmg)" stroke-width="3" stroke-linecap="round"/>
  <path class="a2" d="M16 16 m-8 0 a8 8 0 1 1 8 8" fill="none" stroke="url(#cmg)" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  <path class="a3" d="M16 16 m-13 0 a13 13 0 1 1 13 13" fill="none" stroke="url(#cmg)" stroke-width="3" stroke-linecap="round" opacity=".55"/></svg>`;

function FirmLogo({ id, s = 34 }) {
  const f = firmById(id); const up = store.s.settings.firmLogos?.[id];
  return html`<span class="logo" style=${{ width: s + 'px', height: s + 'px', borderRadius: Math.round(s * .28) + 'px', background: `linear-gradient(140deg,${f.c[0]},${f.c[1]})`, fontSize: (f.mono.length > 1 ? s * .36 : s * .5) + 'px', boxShadow: `inset 0 0 0 1px rgba(255,255,255,.12)` }}>${up ? html`<img src=${up} alt=""/>` : f.mono}</span>`;
}

/* ---------- toasts ---------- */
let _toastSet = null; let _toasts = [];
function toast(msg, action) { const t = { id: uid(), msg, action }; _toasts = [..._toasts, t]; _toastSet && _toastSet(_toasts); setTimeout(() => { _toasts = _toasts.filter(x => x !== t); _toastSet && _toastSet(_toasts) }, action ? 6000 : 3200) }
function Toasts() { const [a, set] = useState([]); _toastSet = set; return html`<div class="toasts" role="status">${a.map(t => html`<div class="toast" key=${t.id}>${t.msg}${t.action && html`<button onClick=${() => { t.action.fn(); _toasts = _toasts.filter(x => x !== t); set(_toasts) }}>${t.action.label}</button>`}</div>`)}</div>` }

/* ---------- modal plumbing ---------- */
const UI = { open: () => { }, close: () => { }, go: () => { }, confirm: () => { } };
function Modal({ title, onClose, children, foot, size = '', icon }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  return html`<div class="ov" onMouseDown=${e => { if (e.target === e.currentTarget) onClose() }}>
    <div class=${'modal ' + size} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="mh">${icon}<h2>${title}</h2><span class="sp"></span><button class="ib" onClick=${onClose} aria-label="Close"><${I} n="x"/></button></div>
      <div class="mb">${children}</div>${foot && html`<div class="mf">${foot}</div>`}
    </div></div>`;
}
function Drawer({ onClose, children, head }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  return html`<div><div class="ov" style=${{ zIndex: 69 }} onMouseDown=${onClose}></div><aside class="drw" role="dialog" aria-modal="true">
    <div class="mh">${head}<span class="sp"></span><button class="ib" onClick=${onClose} aria-label="Close"><${I} n="x"/></button></div>${children}</aside></div>`;
}
function Confirm({ title, body, yes = 'Delete', danger = true, onYes, onClose }) {
  return html`<${Modal} title=${title} onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class=${'btn ' + (danger ? 'btn-d' : 'btn-w')} onClick=${() => { onYes(); onClose() }}>${yes}</button>`}><p class="mut" style=${{ margin: 0 }}>${body}</p><//>`;
}
function Lightbox({ src, onClose }) { return html`<div class="lightbox" onClick=${onClose}><img src=${src} alt="Screenshot"/></div>` }

function Menu({ open, onClose, children, style }) {
  const ref = useRef();
  useEffect(() => { if (!open) return; const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }; setTimeout(() => addEventListener('mousedown', h)); return () => removeEventListener('mousedown', h) }, [open]);
  return open ? html`<div class="menu" ref=${ref} style=${style}>${children}</div>` : null;
}
function Seg({ v, set, opts, sm }) { return html`<div class=${'seg' + (sm ? ' sm' : '')}>${opts.map(o => { const [k, l, ic] = Array.isArray(o) ? o : [o, o]; return html`<button key=${k} class=${v === k ? 'on' : ''} onClick=${() => set(k)}>${ic && html`<${I} n=${ic}/>`}${l}</button>` })}</div>` }
function Field({ label, hint, children, style }) { return html`<label class="fld" style=${style}><span>${label}</span>${children}${hint && html`<span class="hint">${hint}</span>`}</label>` }
function Chips({ all, v = [], set, single }) {
  return html`<div class="row" style=${{ gap: '6px' }}>${all.map(x => { const on = single ? v === x : v.includes(x); return html`<button type="button" key=${x} class=${'chip' + (on ? ' on' : '')} onClick=${() => set(single ? (on ? '' : x) : (on ? v.filter(y => y !== x) : [...v, x]))}>${x}</button>` })}</div>`;
}
const Grade = ({ g }) => g ? html`<span class=${'grade ' + gradeCls(g)}>${g}</span>` : null;
const Side = ({ s }) => html`<span class=${'side ' + (s === 'short' ? 'short' : 'long')}>${s === 'short' ? 'SHORT' : 'LONG'}</span>`;
const Money = ({ v, sign = true, c = true, dec }) => html`<span class=${'tn ' + (c ? cls(v) : '')}>${money(v, { sign, dec })}</span>`;

/* tooltip */
let _tipSet = null;
function Tip() { const [t, set] = useState(null); _tipSet = set; return t ? html`<div class="tip" style=${{ left: t.x + 'px', top: t.y + 'px' }}>${t.text}</div>` : null }
const tipOn = (e, text) => _tipSet && _tipSet({ x: e.clientX, y: e.clientY, text });
const tipOff = () => _tipSet && _tipSet(null);

/* count-up number */
function CountUp({ v, fmt }) {
  const [x, setX] = useState(v); const prev = useRef(v);
  useEffect(() => { const a = prev.current, b = v; prev.current = v; if (a === b || matchMedia('(prefers-reduced-motion: reduce)').matches) { setX(b); return } let raf, t0; const step = t => { t0 ??= t; const p = Math.min(1, (t - t0) / 700); const e = 1 - Math.pow(1 - p, 3); setX(a + (b - a) * e); if (p < 1) raf = requestAnimationFrame(step) }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf) }, [v]);
  return fmt(x);
}

/* ---------- SVG charts ---------- */
/* tablets (iPad): touch screens wider than a phone get the bottom tab bar and slide-over side panels */
const TABLET_Q = '(pointer:coarse) and (min-width:761px)';
const isTablet = () => { try { return matchMedia(TABLET_Q).matches } catch (e) { return false } };
const deskNarrow = () => innerWidth <= 1020 || (isTablet() && innerWidth <= 1100);
const railNarrow = () => innerWidth <= 1280 || (isTablet() && innerWidth <= 1366);
function useViewport() { const [, set] = useState(0); useEffect(() => { let t; const f = () => { clearTimeout(t); t = setTimeout(() => set(n => n + 1), 80) }; addEventListener('resize', f); addEventListener('orientationchange', f); return () => { removeEventListener('resize', f); removeEventListener('orientationchange', f) } }, []) }
function useWidth(def = 600) {
  const ref = useRef(); const [w, setW] = useState(def);
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const f = () => { const x = Math.round(el.getBoundingClientRect().width); if (x > 40) setW(x) }; f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect() }, []);
  return [ref, w];
}
function niceTicks(min, max, n = 4) { if (min === max) { max = min + 1 } const span = max - min; const step0 = span / n; const mag = Math.pow(10, Math.floor(Math.log10(step0))); const st = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0; const a = Math.floor(min / st) * st, b = Math.ceil(max / st) * st; const out = []; for (let v = a; v <= b + st / 2; v += st) out.push(+v.toFixed(10)); return out }

function Bars({ data, h = 200, fmt = v => moneyK(v), signed = true, color, labelEvery = 1, onPick, valueFmt }) {
  const [ref, W] = useWidth(); const H = h, B = 24, T = 10, R = 6;
  if (!data.length) return html`<div ref=${ref} class="dim" style=${{ height: h + 'px', display: 'grid', placeItems: 'center' }}>No data yet</div>`;
  const L = UIS.hide && !valueFmt ? 14 : 56;
  if (W / data.length < 26 && labelEvery === 1) labelEvery = Math.ceil(26 / (W / data.length));
  const vals = data.map(d => d.v); let mn = Math.min(0, ...vals), mx = Math.max(0, ...vals); if (mn === mx) mx = mn + 1;
  const ticks = niceTicks(mn, mx, 4); mn = Math.min(mn, ticks[0]); mx = Math.max(mx, ticks[ticks.length - 1]);
  const y = v => T + (mx - v) / (mx - mn) * (H - T - B); const bw = (W - L - R) / data.length;
  return html`<div ref=${ref}><svg class="svgc" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} style=${{ display: 'block', maxWidth: '100%' }}>
    ${ticks.map(t => html`<g key=${t}><line x1=${L} x2=${W - R} y1=${y(t)} y2=${y(t)} stroke="var(--line)" stroke-dasharray=${t === 0 ? '' : '2 4'}/>${L > 20 && html`<text x=${L - 8} y=${y(t) + 3} text-anchor="end">${fmt(t)}</text>`}</g>`)}
    ${data.map((d, i) => { const x = L + i * bw + bw * .18, w = Math.max(2, bw * .64), y0 = y(0), y1 = y(d.v); const c = color || (d.v >= 0 ? 'var(--pos)' : 'var(--neg)'); return html`<g key=${i} onMouseMove=${e => tipOn(e, `${d.l}: ${(valueFmt || fmt)(d.v)}${d.sub ? ' · ' + d.sub : ''}`)} onMouseLeave=${tipOff} onClick=${() => onPick && onPick(d)} style=${{ cursor: onPick ? 'pointer' : 'default' }}>
      <rect x=${L + i * bw} y=${T} width=${bw} height=${H - T - B} fill="transparent"/>
      <rect class="bar" x=${x} y=${Math.min(y0, y1)} width=${w} height=${Math.max(1.5, Math.abs(y1 - y0))} rx="3" fill=${c} style=${{ color: c }} opacity=${d.dim ? .35 : .9}/>
      ${i % labelEvery === 0 && html`<text x=${x + w / 2} y=${H - 7} text-anchor="middle">${d.l}</text>`}</g>` })}
  </svg></div>`;
}

function HBars({ data, fmt = v => money(v, { sign: true }), max }) {
  const m = max || Math.max(1, ...data.map(d => Math.abs(d.v)));
  return html`<div class="col" style=${{ gap: '9px' }}>${data.map(d => html`<div key=${d.l} style=${{ display: 'grid', gridTemplateColumns: 'minmax(80px,140px) 1fr auto', gap: '10px', alignItems: 'center', fontSize: '11.5px' }}>
    <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title=${d.l}>${d.l}</span>
    <div style=${{ height: '8px', borderRadius: '5px', background: 'var(--card2)', position: 'relative', overflow: 'hidden' }}><i style=${{ position: 'absolute', left: 0, top: 0, bottom: 0, width: clamp(Math.abs(d.v) / m * 100) + '%', borderRadius: '5px', background: d.c || (d.v >= 0 ? 'var(--pos)' : 'var(--neg)') }}></i></div>
    <span class=${'tn ' + (d.c ? '' : cls(d.v))} style=${{ minWidth: '70px', textAlign: 'right', fontWeight: 600 }}>${fmt(d.v)}${d.sub && html`<span class="dim" style=${{ fontWeight: 400 }}> · ${d.sub}</span>`}</span></div>`)}</div>`;
}

function Radar({ spokes, size = 230 }) {
  const c = size / 2, r = size / 2 - 34, n = spokes.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * r * v / 100, c + Math.sin(a) * r * v / 100] };
  const poly = spokes.map((s, i) => pt(i, s.v).join(',')).join(' ');
  return html`<svg viewBox=${`0 0 ${size} ${size}`} width=${size} height=${size} style=${{ maxWidth: '100%', height: 'auto', overflow: 'visible' }} class="svgc radarw">
    ${[25, 50, 75, 100].map(l => html`<polygon key=${l} points=${spokes.map((s, i) => pt(i, l).join(',')).join(' ')} fill="none" stroke="var(--line2)" stroke-width="1"/>`)}
    ${spokes.map((s, i) => { const [x, y] = pt(i, 100); return html`<line key=${i} x1=${c} y1=${c} x2=${x} y2=${y} stroke="var(--line)"/>` })}
    <polygon class="rad" points=${poly} fill="var(--accs)" stroke="var(--acc)" stroke-width="2" stroke-linejoin="round"/>
    ${spokes.map((s, i) => { const [x, y] = pt(i, s.v); return html`<circle key=${i} cx=${x} cy=${y} r="3.5" fill="var(--acc)"/>` })}
    ${spokes.map((s, i) => { const [x, y] = pt(i, 122); return html`<text key=${'t' + i} x=${x} y=${y} text-anchor="middle" style=${{ fill: 'var(--mut)', fontSize: '9px' }}>${s.k}<tspan x=${x} dy="12" style=${{ fill: 'var(--fg)', fontWeight: 700 }}>${Math.round(s.v)}</tspan></text>` })}
  </svg>`;
}

function Ring({ v, size = 64, w = 6, color = 'var(--acc)', children }) {
  const r = (size - w) / 2, C = 2 * Math.PI * r;
  return html`<div style=${{ position: 'relative', width: size + 'px', height: size + 'px', flex: '0 0 auto' }}><svg width=${size} height=${size} style=${{ transform: 'rotate(-90deg)' }}><circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--line2)" stroke-width=${w}/><circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${color} stroke-width=${w} stroke-linecap="round" stroke-dasharray=${C} stroke-dashoffset=${C * (1 - clamp(v) / 100)} style=${{ transition: 'stroke-dashoffset .8s' }}/></svg><div style=${{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * .24 + 'px' }}>${children}</div></div>`;
}

function Spark({ vals, w = 120, h = 34, color }) {
  if (!vals || vals.length < 2) return html`<svg width=${w} height=${h}></svg>`;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * w, h - 3 - (v - mn) / sp * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const c = color || (vals[vals.length - 1] >= vals[0] ? 'var(--pos)' : 'var(--neg)');
  return html`<svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} style=${{ display: 'block', maxWidth: '100%' }}><path d=${d + ` L${w} ${h} L0 ${h}Z`} fill=${c} opacity=".1"/><path d=${d} fill="none" stroke=${c} stroke-width="1.6"/><circle cx=${pts[pts.length - 1][0]} cy=${pts[pts.length - 1][1]} r="2.5" fill=${c}/></svg>`;
}

function Scatter({ pts, h = 240, xFmt = v => v, yFmt = v => moneyK(v), xLabel = '', onPick }) {
  const [ref, W] = useWidth(); const H = h, L = 48, B = 28, T = 10, R = 10;
  if (!pts.length) return html`<div ref=${ref} class="dim" style=${{ height: h + 'px', display: 'grid', placeItems: 'center' }}>No data yet</div>`;
  let x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x)); if (x0 === x1) x1 = x0 + 1;
  const yt = niceTicks(Math.min(0, ...pts.map(p => p.y)), Math.max(0, ...pts.map(p => p.y)), 4); const y0 = yt[0], y1 = yt[yt.length - 1];
  const xt = niceTicks(x0, x1, 5); x0 = Math.min(x0, xt[0]); x1 = Math.max(x1, xt[xt.length - 1]);
  const X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Y = v => T + (y1 - v) / (y1 - y0 || 1) * (H - T - B);
  return html`<div ref=${ref}><svg class="svgc" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} style=${{ display: 'block', maxWidth: '100%' }}>
    ${yt.map(t => html`<g key=${'y' + t}><line x1=${L} x2=${W - R} y1=${Y(t)} y2=${Y(t)} stroke="var(--line)" stroke-dasharray=${t === 0 ? '' : '2 4'}/><text x=${L - 8} y=${Y(t) + 3} text-anchor="end">${yFmt(t)}</text></g>`)}
    ${xt.map(t => html`<text key=${'x' + t} x=${X(t)} y=${H - 9} text-anchor="middle">${xFmt(t)}</text>`)}
    <text x=${W - R} y=${H - 9} text-anchor="end" style=${{ fill: 'var(--mut)' }}>${xLabel}</text>
    ${pts.map((p, i) => html`<circle class="dotp" key=${i} cx=${X(p.x)} cy=${Y(p.y)} r="4.5" fill=${p.y >= 0 ? 'var(--pos)' : 'var(--neg)'} opacity=".75" style=${{ cursor: onPick ? 'pointer' : 'default' }} onMouseMove=${e => tipOn(e, p.tip || yFmt(p.y))} onMouseLeave=${tipOff} onClick=${() => onPick && onPick(p)}/>`)}
  </svg></div>`;
}

/* ---------- TradingView Lightweight Charts wrapper ---------- */
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function lwTheme() { return { layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssv('--mut'), fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11 }, grid: { vertLines: { color: cssv('--line') }, horzLines: { color: cssv('--line') } }, rightPriceScale: { borderColor: cssv('--line2') }, timeScale: { borderColor: cssv('--line2'), timeVisible: true, secondsVisible: false }, crosshair: { mode: 1 } } }
function EquityChart({ series, h = 260, area = true }) {
  const el = useRef();
  useEffect(() => {
    if (!window.LightweightCharts || !el.current) return;
    const th = lwTheme(); const chart = LightweightCharts.createChart(el.current, { ...th, layout: { ...th.layout, attributionLogo: false }, height: h, autoSize: true, handleScroll: false, handleScale: false, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: false } });
    const acc = cssv('--acc'), neg = cssv('--neg');
    const last = series.length ? series[series.length - 1].v : 0;
    const col = last >= 0 ? acc : neg;
    const s = chart.addAreaSeries({ lineColor: col, topColor: col + '55', bottomColor: col + '00', lineWidth: 2, priceFormat: { type: 'custom', formatter: v => moneyK(v) }, lastValueVisible: !UIS.hide, priceLineVisible: false });
    let tPrev = 0; const data = [{ time: Math.floor((series[0]?.t || Date.now()) / 1000) - 3600, value: 0 }, ...series.map(p => { let t = Math.floor(p.t / 1000); if (t <= tPrev) t = tPrev + 1; tPrev = t; return { time: t, value: p.v } })];
    let tp = 0; data.forEach(d => { if (d.time <= tp) d.time = tp + 1; tp = d.time });
    s.setData(data); chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, UIS.hide, store.s.settings.theme, store.s.settings.accent]);
  if (!window.LightweightCharts) return html`<div style=${{ height: h + 'px' }}><${Spark} vals=${[0, ...series.map(p => p.v)]} w=${600} h=${h}/></div>`;
  return html`<div ref=${el} style=${{ width: '100%', height: h + 'px' }}></div>`;
}

/* pointer-driven effects: spotlight position, 3D tilt, hero glow */
(function () {
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let last = null, raf = 0, ev = null;
  const SEL = '.card,.tc,.acct,.firm,.glowcard,.cert,.copytog,.hero';
  const run = () => {
    raf = 0; const e = ev; const el = e.target.closest ? e.target.closest(SEL) : null;
    if (last && last !== el) { last.style.removeProperty('--rx'); last.style.removeProperty('--ry') }
    last = el; if (!el) return;
    const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px');
    if (el.classList.contains('tc') || el.classList.contains('cert')) { const k = el.classList.contains('cert') ? 10 : 7; el.style.setProperty('--ry', ((x / r.width - .5) * k).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-(y / r.height - .5) * k).toFixed(2) + 'deg'); el.style.setProperty('--hx', (x / r.width * 100).toFixed(1) + '%') }
    if (el.classList.contains('hero')) { el.style.setProperty('--gx', (x / r.width * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (y / r.height * 100).toFixed(1) + '%') }
  };
  document.addEventListener('pointermove', e => { ev = e; if (!raf) raf = requestAnimationFrame(run) }, { passive: true });
  document.addEventListener('pointerleave', () => { if (last) { last.style.removeProperty('--rx'); last.style.removeProperty('--ry'); last = null } });
})();

/* ================= Compound · forms ================= */
function ListEdit({ v, set, placeholder = 'Add item' }) {
  const [x, setX] = useState('');
  return html`<div class="col" style=${{ gap: '6px' }}>
    ${v.map((it, i) => html`<div class="row" key=${i} style=${{ gap: '6px', flexWrap: 'nowrap' }}><input class="in" value=${it} onInput=${e => { const n = [...v]; n[i] = e.target.value; set(n) }}/><button class="ib" onClick=${() => { if (i > 0) { const n = [...v];[n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n) } }} aria-label="Move up"><${I} n="up" s=${14}/></button><button class="ib" onClick=${() => set(v.filter((_, j) => j !== i))} aria-label="Remove"><${I} n="x" s=${14}/></button></div>`)}
    <div class="row" style=${{ gap: '6px', flexWrap: 'nowrap' }}><input class="in" placeholder=${placeholder} value=${x} onInput=${e => setX(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && x.trim()) { e.preventDefault(); set([...v, x.trim()]); setX('') } }}/><button class="btn btn-g sm" onClick=${() => { if (x.trim()) { set([...v, x.trim()]); setX('') } }}>Add</button></div></div>`;
}

function ShotsEdit({ shots, set, label = 'Screenshots' }) {
  const [busy, setBusy] = useState(false); const [over, setOver] = useState(false); const [lb, setLb] = useState(null); const inp = useRef();
  const add = async files => { const imgs = [...files].filter(f => f.type?.startsWith('image/')); if (!imgs.length) return; setBusy(true); const out = []; for (const f of imgs) { try { out.push(await saveImage(f)) } catch (e) { toast('Could not read that image') } } setBusy(false); set([...(shots || []), ...out]) };
  useEffect(() => { const h = e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); add(fs) } }; addEventListener('paste', h); return () => removeEventListener('paste', h) }, [shots]);
  return html`<div class="col" style=${{ gap: '8px' }}>
    <div class=${'drop' + (over ? ' over' : '')} onClick=${() => inp.current.click()} onDragOver=${e => { e.preventDefault(); setOver(true) }} onDragLeave=${() => setOver(false)} onDrop=${e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}>
      <div class="row" style=${{ justifyContent: 'center', gap: '8px' }}><${I} n="image"/><b>${busy ? 'Saving…' : label}</b></div>
      <div style=${{ fontSize: '11px', marginTop: '4px' }}>Drop, click, or paste. In TradingView: camera icon → <b>Copy image</b>, then paste here.</div>
      <input ref=${inp} type="file" accept="image/*" multiple hidden onChange=${e => add(e.target.files)}/></div>
    ${shots?.length > 0 && html`<div class="shots">${shots.map((s, i) => html`<div class="s" key=${s.id || i}><img src=${s.url} alt="" onClick=${() => setLb(s.url)}/><button class="x" onClick=${() => set(shots.filter((_, j) => j !== i))} aria-label="Remove image"><${I} n="x" s=${13}/></button></div>`)}</div>`}
    ${lb && html`<${Lightbox} src=${lb} onClose=${() => setLb(null)}/>`}</div>`;
}

function AccountPicker({ v, set, multi, S, allowNone = true }) {
  const accs = Object.values(S.accounts).filter(a => a.status !== 'blown' && a.status !== 'closed').sort((a, b) => (a.created || 0) - (b.created || 0));
  if (!accs.length) return html`<div class="mut" style=${{ fontSize: '11.5px' }}>No accounts yet. <button class="lnk" onClick=${() => UI.open('account')}>Add one</button> to track it against prop rules.</div>`;
  const vv = multi ? (v || []) : v;
  return html`<div class="row" style=${{ gap: '6px' }}>${allowNone && !multi && html`<button type="button" class=${'chip' + (!v ? ' on' : '')} onClick=${() => set('')}>None</button>`}
    ${accs.map(a => { const on = multi ? vv.includes(a.id) : vv === a.id; return html`<button type="button" key=${a.id} class=${'chip' + (on ? ' on' : '')} style=${{ height: '30px', paddingLeft: '4px' }} onClick=${() => set(multi ? (on ? vv.filter(x => x !== a.id) : [...vv, a.id]) : (on && allowNone ? '' : a.id))}><${FirmLogo} id=${a.firm} s=${22}/>${a.label || firmById(a.firm).name}</button>` })}</div>`;
}


/* ---------- copy trading: one idea, a main account and its copies ---------- */
function groupOf(S, t) { return t?.group ? Object.values(S.trades).filter(x => x.group === t.group) : (t ? [t] : []) }
function leadOf(S, t) { const g = groupOf(S, t); return g.find(x => x.lead) || g.sort((a, b) => (a.created || 0) - (b.created || 0))[0] || t }
/* deleting: a main trade takes its copies with it; a copy goes on its own. Always undoable for a few seconds. */
function delSet(S, ids) { const out = new Set(); for (const id of ids) { const t = S.trades[id]; if (!t) continue; if (t.group && t.role === 'copy' && !ids.includes(leadOf(S, t).id)) out.add(id); else groupOf(S, t).forEach(x => out.add(x.id)) } return [...out] }
function removeTrades(ids) {
  const S = store.s; const all = delSet(S, ids); const saved = all.map(id => S.trades[id]).filter(Boolean);
  saved.forEach(t => store.del('trades', t.id));
  toast(saved.length === 1 ? 'Trade deleted' : saved.length + ' trades deleted', { label: 'Undo', fn: () => { saved.forEach(t => store.put('trades', t)); toast('Restored') } });
  return saved.length;
}
function askDelete(ids, after) {
  const S = store.s; ids = ids.filter(id => S.trades[id]); if (!ids.length) return;
  const all = delSet(S, ids); const copies = all.length - ids.length; const one = ids.length === 1 ? S.trades[ids[0]] : null;
  const isCopy = one && one.group && one.role === 'copy';
  UI.confirm({
    title: ids.length === 1 ? 'Delete this trade?' : `Delete ${ids.length} trades?`,
    body: isCopy ? `Only the copy on ${S.accounts[one.account]?.label || 'this account'} is removed. The main trade and other copies stay.` : (copies > 0 ? `${copies} copied trade${copies > 1 ? 's' : ''} on your other accounts go too. ` : '') + 'They leave your journal and every stat. You can undo for a few seconds.',
    yes: all.length > 1 ? `Delete ${all.length}` : 'Delete',
    onYes: () => { removeTrades(ids); after && after() }
  });
}
function initialCopy(S, ex) {
  if (ex) { const lead = leadOf(S, ex); const sib = groupOf(S, ex).filter(x => x.id !== lead.id); return { main: lead.account || '', copies: sib.map(x => x.account).filter(Boolean), sizes: Object.fromEntries(sib.map(x => [x.account, x.qty])), lead } }
  const last = S.settings.copySet || {}; const live = id => S.accounts[id] && S.accounts[id].status === 'active';
  const def = Object.values(S.accounts).find(a => a.status === 'active' && a.def)?.id || '';
  const main = live(last.main) ? last.main : def;
  return { main, copies: (last.on ? (last.copies || []) : []).filter(c => live(c) && c !== main), sizes: {}, lead: null };
}
/* Saves a trade idea to its main account and every copy; on edit, keeps the whole group in step */
function saveCopyGroup(S, base, cp, ex) {
  const mainQty = +base.qty || 1;
  const forCopy = (acc) => { const q = +(cp.sizes[acc] || mainQty) || mainQty; const o = { ...base, qty: q }; if (base.pnlManual && isNum(base.pnl)) o.pnl = Math.round(+base.pnl * q / mainQty * 100) / 100; delete o.fees; if (isNum(base.fees)) o.fees = Math.round(+base.fees * q / mainQty * 100) / 100; return o };
  const accs = cp.copies.filter(c => c && c !== cp.main);
  const group = accs.length ? (ex?.group || cp.lead?.group || uid()) : undefined;
  if (ex) {
    const lead = cp.lead || ex; const sibs = groupOf(S, ex).filter(x => x.id !== lead.id);
    store.put('trades', { ...lead, ...base, ...acctExtras(S, cp.main, base.symbol), id: lead.id, account: cp.main, group, lead: true, role: accs.length ? 'main' : undefined, copyOf: undefined });
    for (const sb of sibs) { if (!accs.includes(sb.account)) store.del('trades', sb.id) }
    for (const a of accs) { const sb = sibs.find(x => x.account === a); store.put('trades', { ...(sb || {}), ...forCopy(a), symbol: symForAcct(S, a, base.symbol), ...acctExtras(S, a, symForAcct(S, a, base.symbol)), id: sb?.id || uid(), account: a, group, lead: false, role: 'copy', copyOf: lead.id, created: sb?.created || Date.now() }) }
    return accs.length + 1;
  }
  const leadId = uid();
  store.put('trades', { ...base, ...acctExtras(S, cp.main, base.symbol), id: leadId, account: cp.main, group, lead: true, role: accs.length ? 'main' : undefined, created: Date.now() });
  for (const a of accs) store.put('trades', { ...forCopy(a), symbol: symForAcct(S, a, base.symbol), ...acctExtras(S, a, symForAcct(S, a, base.symbol)), id: uid(), account: a, group, lead: false, role: 'copy', copyOf: leadId, created: Date.now() });
  store.setSettings({ copySet: { main: cp.main, copies: accs, on: accs.length > 0 } });
  return accs.length + 1;
}
function CopyPicker({ S, cp, setCp, qty, symbol, base }) {
  const accs = Object.values(S.accounts).filter(a => a.status === 'active').sort((a, b) => (a.created || 0) - (b.created || 0));
  const on = cp.copyOn ?? cp.copies.length > 0;
  const chip = (a, active, onClick, extra) => html`<button type="button" key=${a.id} class=${'chip' + (active ? ' on' : '')} style=${{ height: '32px', paddingLeft: '4px' }} onClick=${onClick}><${FirmLogo} id=${a.firm} s=${22}/>${a.label || firmById(a.firm).name}${extra}</button>`;
  const others = accs.filter(a => a.id !== cp.main);
  const pnlFor = (q, acc) => { if (!base) return null; const sy = symForAcct(S, acc, base.symbol); const c = tradeCalc({ ...base, symbol: sy, ...acctExtras(S, acc, sy), qty: q, fees: undefined, pnl: base.pnlManual && isNum(base.pnl) ? +base.pnl * q / (+base.qty || 1) : base.pnl }, S.settings); return c.pnl };
  const total = base ? sum([cp.main, ...(on ? cp.copies : [])].filter(Boolean), a => pnlFor(a === cp.main ? (+qty || 1) : (+(cp.sizes[a] || qty) || 1), a) || 0) : null;
  return html`<div class="col" style=${{ gap: '10px' }}>
    <div><div class="lbl" style=${{ marginBottom: '7px' }}>Main account</div><div class="row" style=${{ gap: '6px' }}><button type="button" class=${'chip' + (!cp.main ? ' on' : '')} style=${{ height: '32px' }} onClick=${() => setCp({ ...cp, main: '' })}>None</button>${accs.map(a => chip(a, cp.main === a.id, () => setCp({ ...cp, main: a.id, copies: cp.copies.filter(c => c !== a.id) })))}<button type="button" class="chip" style=${{ height: '32px', borderStyle: 'dashed' }} onClick=${() => UI.open('account')}><${I} n="plus" s=${13}/>Add account</button></div></div>
    <button type="button" class=${'copytog' + (on ? ' on' : '')} onClick=${() => setCp({ ...cp, copyOn: !on, copies: !on ? cp.copies : [] })} aria-pressed=${on}><span class="sw"><i></i></span><${I} n="copy" s=${16}/><span style=${{ flex: 1, textAlign: 'left' }}><b>Copy traded into other accounts</b><span class="mut" style=${{ display: 'block', fontSize: '10.5px' }}>Log this idea on your main account and every account you copied it into</span></span></button>
    ${on && !others.length && html`<div class="card tight row" style=${{ background: 'var(--bg)' }}><span class="mut" style=${{ flex: 1, fontSize: '11.5px' }}>${accs.length ? 'You have only one account. Add the accounts you copy into and they will appear here.' : 'Add your accounts first: the main one and the ones you copy into.'}</span><button type="button" class="btn btn-w sm" onClick=${() => UI.open('account')}><${I} n="plus"/>Add account</button></div>`}
    ${on && others.length > 0 && html`<div class="card tight" style=${{ background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div class="lbl">Copied into</div>
      <div class="row" style=${{ gap: '6px' }}>${others.map(a => { const sel = cp.copies.includes(a.id); return chip(a, sel, () => setCp({ ...cp, copies: sel ? cp.copies.filter(x => x !== a.id) : [...cp.copies, a.id] })) })}</div>
      ${cp.copies.length > 0 && html`<div class="col" style=${{ gap: '6px' }}>${cp.copies.map(c => { const a = S.accounts[c]; if (!a) return null; const q = cp.sizes[c] ?? qty; const p = pnlFor(+q || 1, c); return html`<div key=${c} class="row" style=${{ flexWrap: 'nowrap', gap: '10px', fontSize: '11.5px' }}><${FirmLogo} id=${a.firm} s=${20}/><span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.label}</span><span class="dim">${isCfdAcct(S, c) ? 'lots' : 'contracts'}</span><input class="in tn" style=${{ width: '64px', padding: '6px 8px' }} inputmode="decimal" value=${q} onInput=${e => setCp({ ...cp, sizes: { ...cp.sizes, [c]: e.target.value } })} aria-label=${'Contracts on ' + a.label}/><span class=${'tn ' + cls(p)} style=${{ minWidth: '74px', textAlign: 'right', fontWeight: 700 }}>${p == null ? '—' : money(p, { sign: true, show: true })}</span></div>` })}</div>`}
    </div>`}
    ${on && cp.copies.length > 0 && total != null && html`<div class="row" style=${{ fontSize: '11.5px' }}><span class="mut">1 idea · ${cp.copies.length + (cp.main ? 1 : 0)} accounts</span><span class="sp"></span><span class="mut">Total across accounts</span><b class=${'tn ' + cls(total)}>${money(total, { sign: true, show: true })}</b></div>`}
  </div>`;
}

function TradeForm({ id, onClose, preset = {}, mode }) {
  const S = store.s; const st = S.settings; const ex = id ? S.trades[id] : null;
  const [cp, setCp] = useState(() => initialCopy(S, ex));
  const [t, setT] = useState(() => ex ? { ...(leadOf(S, ex)) } : {
    symbol: st.defaultSymbol || 'MNQ', side: 'long', qty: st.defaultQty || 1, t: localISO(), tx: '', entry: '', exit: '', stop: '', target: '', pnl: '', pnlManual: false,
    mode: mode || 'live', grade: '', setups: [], emoBefore: [], emoAfter: [], mistakes: [], rules: null, notes: '', lessons: '', shots: [], tv: '', strategy: '', conf: 3, mae: '', mfe: '', ...preset,
  });
  const up = p => setT(o => ({ ...o, ...p }));
  const cfd = isCfdAcct(S, cp.main); const mainA = S.accounts[cp.main];
  const calc = tradeCalc({ ...t, ...acctExtras(S, cp.main, t.symbol) }, st);
  const firstMain = useRef(true);
  useEffect(() => { if (firstMain.current) { firstMain.current = false; if (ex) return } const isC = !!instr(t.symbol).cfd; if (cfd && !isC) up({ symbol: mainA?.defSym || 'NAS100', qty: mainA?.defLots || 1 }); else if (!cfd && isC) up({ symbol: st.defaultSymbol || 'MNQ', qty: st.defaultQty || 1 }) }, [cp.main]);
  const strategies = Object.values(S.strategies);
  const save = () => {
    if (!t.symbol) return toast('Add a symbol');
    if (calc.pnl == null) return toast('Add entry and exit, or a P&L');
    const base = { ...t }; delete base.accounts; base.symbol = normSym(t.symbol) || t.symbol.toUpperCase();
    base.tx = base.tx || base.t;
    for (const k of ['id', 'account', 'group', 'lead', 'role', 'copyOf', 'created', 'u']) delete base[k];
    const n = saveCopyGroup(S, base, { ...cp, copies: (cp.copyOn ?? cp.copies.length > 0) ? cp.copies : [] }, ex);
    toast(ex ? (n > 1 ? `Updated on ${n} accounts` : 'Trade updated') : (n > 1 ? `Logged to main + ${n - 1} cop${n - 1 === 1 ? "y" : "ies"}` : 'Trade logged'));
    onClose();
  };
  return html`<${Modal} title=${ex ? 'Edit trade' : 'Log trade'} onClose=${onClose} size="wide" foot=${html`${ex && html`<button class="btn btn-d" style=${{ marginRight: 'auto' }} onClick=${() => askDelete([leadOf(S, ex).id], onClose)}><${I} n="trash"/>Delete${groupOf(S, ex).length > 1 ? ' all ' + groupOf(S, ex).length : ''}</button>`}<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${save}><${I} n="check"/>${ex ? 'Save' : 'Log trade'}</button>`}>
    <div class="grid tfg">
      <div class="col" style=${{ gap: '14px' }}>
        <div class="grid g3 keep2">
          <${Field} label="Symbol"><input class="in" list="syms" value=${t.symbol} onInput=${e => up({ symbol: e.target.value.toUpperCase() })}/><datalist id="syms">${Object.keys(INSTR).map(k => html`<option value=${k}>${INSTR[k].name}</option>`)}</datalist><//>
          <${Field} label="Side"><${Seg} v=${t.side} set=${v => up({ side: v })} opts=${[['long', 'Long'], ['short', 'Short']]}/><//>
          <${Field} label=${cfd ? 'Lots' : 'Contracts'}><input class="in tn" type="number" min=${cfd ? '0.01' : '1'} step=${cfd ? '0.01' : '1'} inputmode="decimal" value=${t.qty} onInput=${e => up({ qty: e.target.value })}/><//>
        </div>
        <div class="grid g2">
          <${Field} label="Entry time"><input class="in" type="datetime-local" value=${t.t} onInput=${e => up({ t: e.target.value })}/><//>
          <${Field} label="Exit time"><input class="in" type="datetime-local" value=${t.tx} onInput=${e => up({ tx: e.target.value })}/><//>
        </div>
        <div class="grid g4 keep2">
          <${Field} label="Entry"><input class="in tn" inputmode="decimal" value=${t.entry} onInput=${e => up({ entry: e.target.value })}/><//>
          <${Field} label="Exit"><input class="in tn" inputmode="decimal" value=${t.exit} onInput=${e => up({ exit: e.target.value })}/><//>
          <${Field} label="Stop"><input class="in tn" inputmode="decimal" value=${t.stop} onInput=${e => up({ stop: e.target.value })}/><//>
          <${Field} label="Target"><input class="in tn" inputmode="decimal" value=${t.target} onInput=${e => up({ target: e.target.value })}/><//>
        </div>
        <div class="card tight" style=${{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '10px', background: 'var(--bg)' }}>
          <div><div class="lbl">Net P&L</div><div style=${{ fontSize: '19.5px', fontWeight: 800 }} class=${cls(calc.pnl)}>${calc.pnl == null ? '—' : money(calc.pnl, { sign: true, show: true })}</div></div>
          <div><div class="lbl">R multiple</div><div style=${{ fontSize: '19.5px', fontWeight: 800 }} class=${cls(calc.pnl)}>${calc.risk ? rfmt(calc.pnl / calc.risk) : '—'}</div></div>
          <div><div class="lbl">Risk</div><div style=${{ fontSize: '19.5px', fontWeight: 800 }}>${calc.risk ? money(calc.risk, { show: true }) : '—'}</div></div>
          <div><div class="lbl">Planned R:R</div><div style=${{ fontSize: '19.5px', fontWeight: 800 }}>${calc.rr ? '1:' + calc.rr.toFixed(2) : '—'}</div></div>
        </div>
        <div class="row" style=${{ gap: '14px' }}>
          <label class="row" style=${{ gap: '8px', cursor: 'pointer', fontSize: '11.5px' }}><input type="checkbox" checked=${t.pnlManual} onChange=${e => up({ pnlManual: e.target.checked })}/>Enter P&L by hand</label>
          ${t.pnlManual && html`<div class="inwrap" style=${{ width: '150px' }}><span class="pre">$</span><input class="in tn" inputmode="decimal" placeholder="-125.50" value=${t.pnl} onInput=${e => up({ pnl: e.target.value })}/></div>`}
          <span class="sp"></span><span class="dim" style=${{ fontSize: '10.5px' }}>${instr(t.symbol).name} · $${calc.pv}/pt per ${cfd ? 'lot' : 'contract'}${cfd && calc.pts != null ? ' · ' + (calc.pts / (num(mainA?.pip) ?? 1)).toFixed(1) + ' pips' : ''} · fees ${money(calc.fees, { show: true, dec: 2 })}</span>
          <div class="inwrap" style=${{ width: '110px' }}><span class="pre">$</span><input class="in tn" placeholder="fees" value=${t.fees ?? ''} onInput=${e => up({ fees: e.target.value })} aria-label="Fees override"/></div>
        </div>
        <${Field} label="Account" hint=${ex && groupOf(S, ex).length > 1 ? 'Edits apply to the main trade and every copy. Copy contracts and P&L scale from the main.' : 'Copy trading? Pick your main account, then tick the accounts you copied into.'}><${CopyPicker} S=${S} cp=${cp} setCp=${setCp} qty=${t.qty} symbol=${t.symbol} base=${calc.pnl == null ? null : { ...t }}/><//>
        <${Field} label="Screenshots & chart"><${ShotsEdit} shots=${t.shots} set=${v => up({ shots: v })}/><input class="in" style=${{ marginTop: '6px' }} placeholder="TradingView snapshot link (tradingview.com/x/…)" value=${t.tv} onInput=${e => up({ tv: e.target.value })}/><//>
      </div>
      <div class="col" style=${{ gap: '14px' }}>
        <${Field} label="Grade · plan adherence"><div class="row" style=${{ gap: '6px' }}>${GRADES.map(g => html`<button type="button" key=${g} class=${'grade ' + gradeCls(g)} style=${{ height: '32px', minWidth: '44px', fontSize: '12.5px', opacity: t.grade && t.grade !== g ? .3 : 1, outline: t.grade === g ? '2px solid var(--fg)' : 'none' }} onClick=${() => up({ grade: t.grade === g ? '' : g })}>${g}</button>`)}</div><//>
        <${Field} label="Strategy"><select class="sel" value=${t.strategy} onChange=${e => up({ strategy: e.target.value })}><option value="">No strategy</option>${strategies.map(s => html`<option value=${s.id}>${s.name}</option>`)}</select><//>
        <${Field} label="Setup"><${Chips} all=${st.setups} v=${t.setups} set=${v => up({ setups: v })}/><//>
        <${Field} label="Rules followed?"><${Seg} v=${t.rules === true ? 'y' : t.rules === false ? 'n' : '-'} set=${v => up({ rules: v === 'y' ? true : v === 'n' ? false : null })} opts=${[['y', 'Yes, all'], ['n', 'Broke one'], ['-', 'Not sure']]}/><//>
        <${Field} label="Mistakes"><${Chips} all=${st.mistakes} v=${t.mistakes} set=${v => up({ mistakes: v })}/><//>
        <${Field} label="Feeling before entry"><${Chips} all=${st.emotions} v=${t.emoBefore} set=${v => up({ emoBefore: v })}/><//>
        <${Field} label="Feeling after exit"><${Chips} all=${st.emotions} v=${t.emoAfter} set=${v => up({ emoAfter: v })}/><//>
        <div class="grid g3 keep2">
          <${Field} label=${'Confidence · ' + t.conf}><input type="range" min="1" max="5" value=${t.conf} onInput=${e => up({ conf: +e.target.value })}/><//>
          <${Field} label="MAE (pts)"><input class="in tn" value=${t.mae} onInput=${e => up({ mae: e.target.value })}/><//>
          <${Field} label="MFE (pts)"><input class="in tn" value=${t.mfe} onInput=${e => up({ mfe: e.target.value })}/><//>
        </div>
        <${Field} label="Notes · why you took it, how you managed it"><textarea class="ta" rows="4" value=${t.notes} onInput=${e => up({ notes: e.target.value })}></textarea><//>
        <${Field} label="Lesson"><input class="in" value=${t.lessons} onInput=${e => up({ lessons: e.target.value })} placeholder="One line you want to remember"/><//>
        <div class="row"><label class="row" style=${{ gap: '8px', cursor: 'pointer', fontSize: '11.5px' }}><input type="checkbox" checked=${!!t.pin} onChange=${e => up({ pin: e.target.checked })}/>Pin to Showcase</label><span class="sp"></span><${Seg} sm v=${t.mode} set=${v => up({ mode: v })} opts=${[['live', 'Live money'], ['paper', 'Paper']]}/></div>
      </div>
    </div>
  <//>`;
}

function QuickLog({ onClose, mode }) {
  const S = store.s, st = S.settings;
  const [t, setT] = useState({ symbol: st.defaultSymbol || 'MNQ', side: 'long', qty: st.defaultQty || 1, pnl: '', grade: '', setups: [] }); const [cp, setCp] = useState(() => initialCopy(S, null));
  const up = p => setT(o => ({ ...o, ...p })); const ref = useRef();
  useEffect(() => ref.current?.focus(), []);
  const save = () => { if (!isNum(t.pnl)) return toast('Enter the P&L'); const n = saveCopyGroup(S, { ...t, symbol: normSym(t.symbol), pnlManual: true, t: localISO(), tx: localISO(), mode: mode || 'live', quick: true }, { ...cp, copies: (cp.copyOn ?? cp.copies.length > 0) ? cp.copies : [] }, null); toast(n > 1 ? `Logged to main + ${n - 1} cop${n - 1 === 1 ? "y" : "ies"}` : 'Logged. Add notes later from the journal.'); onClose() };
  return html`<${Modal} title="Quick log" icon=${html`<${I} n="bolt"/>`} onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${save}>Log it</button>`}>
    <div class="grid g3 keep2"><${Field} label="Symbol"><input class="in" list="syms" value=${t.symbol} onInput=${e => up({ symbol: e.target.value.toUpperCase() })}/><datalist id="syms">${Object.keys(INSTR).map(k => html`<option value=${k}/>`)}</datalist><//><${Field} label="Side"><${Seg} v=${t.side} set=${v => up({ side: v })} opts=${[['long', 'Long'], ['short', 'Short']]}/><//><${Field} label=${isCfdAcct(S, cp.main) ? 'Lots' : 'Contracts'}><input class="in tn" type="number" step="any" inputmode="decimal" value=${t.qty} onInput=${e => up({ qty: e.target.value })}/><//></div>
    <${Field} label="Net P&L"><div class="inwrap"><span class="pre">$</span><input ref=${ref} class="in tn" style=${{ fontSize: '19.5px', fontWeight: 700, height: '52px' }} inputmode="decimal" placeholder="240" value=${t.pnl} onInput=${e => up({ pnl: e.target.value })} onKeyDown=${e => e.key === 'Enter' && save()}/></div><//>
    <${Field} label="Account"><${CopyPicker} S=${S} cp=${cp} setCp=${setCp} qty=${t.qty} symbol=${t.symbol} base=${isNum(t.pnl) ? { ...t, pnlManual: true } : null}/><//>
    <${Field} label="Grade"><${Chips} single all=${GRADES} v=${t.grade} set=${v => up({ grade: v })}/><//>
    <${Field} label="Setup"><${Chips} all=${st.setups} v=${t.setups} set=${v => up({ setups: v })}/><//>
  <//>`;
}

function AccountForm({ id, firm, onClose }) {
  const S = store.s; const ex = id ? S.accounts[id] : null;
  const [a, setA] = useState(() => ex ? { ...ex } : { firm: firm || 'lucid', plan: firmById(firm || 'lucid').plans[0], size: 50000, type: 'eval', label: '', target: 3000, mll: 2000, dd: 'eod', lock: 100, dll: 1000, cons: 50, minDays: '', cost: '', activation: '', status: 'active', mode: 'live', def: true, start: todayKey() });
  const [step, setStep] = useState(ex || firm ? 2 : 1);
  const up = p => setA(o => ({ ...o, ...p }));
  const f = firmById(a.firm); const presets = f.presets || SIZE_PRESETS; const mkt = acctMarket(a);
  const applySize = sz => { const p = presets[sz]; up({ size: sz, ...(p ? { target: a.type === 'eval' ? p.target : '', mll: p.mll, dll: p.dll, ...(p.cons != null ? { cons: p.cons } : {}) } : {}) }) };
  const pickFirm = x => { const p = x.presets ? (x.presets[10000] || Object.values(x.presets)[0]) : null; const sz = x.presets ? (x.presets[10000] ? 10000 : +Object.keys(x.presets)[0]) : a.size; up({ firm: x.id, plan: x.plans[0], market: x.market || 'futures', mode: x.id === 'personal' ? 'live' : a.mode, ...(x.market === 'cfd' ? { ppl: a.ppl ?? CFD_PPL, pip: a.pip ?? 1, lotCom: a.lotCom ?? 0, defSym: a.defSym || 'NAS100', defLots: a.defLots ?? 1, dd: 'static', lock: '' } : {}), ...(p ? { size: sz, target: p.target, mll: p.mll, dll: p.dll, cons: p.cons } : {}) }) };
  const save = () => { if (!+a.size) return toast('Add the starting balance'); const o = store.put('accounts', { ...a, size: +a.size, created: ex?.created || Date.now(), label: a.label || (f.name.split(' ')[0] + ' ' + (+a.size / 1000) + 'K') }); toast(ex ? 'Account saved' : 'Account added'); onClose() };
  return html`<${Modal} title=${ex ? 'Edit account' : step === 1 ? 'Pick your prop firm' : 'Account details'} onClose=${onClose} size="wide" foot=${step === 1 ? html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${() => setStep(2)}>Continue<${I} n="right"/></button>` : html`${ex && html`<button class="btn btn-d" style=${{ marginRight: 'auto' }} onClick=${() => UI.open('delacct', { id: ex.id, after: onClose })}><${I} n="trash"/>Delete</button>`}${!ex && html`<button class="btn btn-g" onClick=${() => setStep(1)}><${I} n="left"/>Firm</button>`}<button class="btn btn-w" onClick=${save}><${I} n="check"/>${ex ? 'Save' : 'Add account'}</button>`}>
    ${step === 1 ? html`<div class="firms">${FIRMS.map(x => html`<button key=${x.id} class=${'firm' + (a.firm === x.id ? ' on' : '')} onClick=${() => pickFirm(x)} onDblClick=${() => { pickFirm(x); setStep(2) }}><${FirmLogo} id=${x.id}/><span class="nm">${x.name}<small>${x.market === 'cfd' ? 'CFD · ' + (x.platform || 'MT5') : x.plans.slice(0, 2).join(' · ')}</small></span></button>`)}</div>
      <p class="dim" style=${{ margin: 0, fontSize: '11px' }}>Rules change often. Presets fill typical numbers; check them against your firm's dashboard and edit anything. You can upload each firm's real logo from the Propfirm page.</p>`
    : html`<div class="row" style=${{ gap: '12px' }}><${FirmLogo} id=${a.firm} s=${44}/><div><div style=${{ fontWeight: 800, fontSize: '15px' }}>${f.name}</div><div class="mut" style=${{ fontSize: '11.5px' }}>${f.url ? html`<a href=${f.url} target="_blank" rel="noopener">${f.url.replace('https://', '')}</a>` : 'Your own capital'}</div></div></div>
      <div class="grid g3">
        <${Field} label="Plan"><input class="in" list="plans" value=${a.plan} onInput=${e => up({ plan: e.target.value })}/><datalist id="plans">${f.plans.map(p => html`<option value=${p}/>`)}</datalist><//>
        <${Field} label="Account size"><select class="sel" value=${presets[a.size] ? a.size : 'c'} onChange=${e => e.target.value !== 'c' && applySize(+e.target.value)}>${Object.keys(presets).map(k => html`<option value=${k}>$${(+k).toLocaleString()}</option>`)}<option value="c">Custom</option></select><//>
        <${Field} label="Starting balance"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.size} onInput=${e => up({ size: e.target.value })}/></div><//>
        <${Field} label="Stage"><${Seg} v=${a.type} set=${v => up({ type: v, target: v === 'eval' ? (SIZE_PRESETS[a.size]?.target || a.target) : '' })} opts=${[['eval', 'Eval'], ['funded', 'Funded'], ['live', 'Live']]}/><//>
        <${Field} label="Account ID / nickname" hint="e.g. LDE05"><input class="in" value=${a.label} onInput=${e => up({ label: e.target.value })}/><//>
        <${Field} label="Status"><select class="sel" value=${a.status} onChange=${e => up({ status: e.target.value })}><option value="active">Active</option><option value="passed">Passed</option><option value="blown">Blown</option><option value="closed">Closed / withdrawn</option></select><//>
      </div>
      <div class="lbl">Market</div>
      <${Seg} v=${mkt} set=${v => up({ market: v, ...(v === 'cfd' ? { ppl: a.ppl ?? 1, pip: a.pip ?? 1, lotCom: a.lotCom ?? 0, defSym: a.defSym || 'NAS100', defLots: a.defLots ?? 1 } : {}) })} opts=${[['futures', 'Futures · contracts'], ['cfd', 'CFD · lots (MT5)']]}/>
      ${mkt === 'cfd' && html`<div class="card tight col" style=${{ gap: '12px', background: 'var(--bg)' }}>
        <div class="grid g3">
          <${Field} label="NAS100: $ per point, per 1.00 lot" hint="MT5 → Symbol specification: contract size × $1. Tradeify FX NAS100 = 10."><div class="inwrap"><span class="pre">$</span><input class="in tn" inputmode="decimal" value=${a.ppl} onInput=${e => up({ ppl: e.target.value })}/></div><//>
          <${Field} label="1 pip = how many points" hint="Most brokers: 1 pip = 1.0 point on indices"><select class="sel" value=${String(a.pip ?? 1)} onChange=${e => up({ pip: +e.target.value })}><option value="1">1.0 point</option><option value="0.1">0.1 point</option><option value="0.01">0.01 point</option></select><//>
          <${Field} label="Commission per lot (round trip)"><div class="inwrap"><span class="pre">$</span><input class="in tn" inputmode="decimal" value=${a.lotCom} onInput=${e => up({ lotCom: e.target.value })}/></div><//>
          <${Field} label="Default symbol"><input class="in" list="syms" value=${a.defSym} onInput=${e => up({ defSym: e.target.value.toUpperCase() })}/><datalist id="syms">${Object.keys(INSTR).filter(k => INSTR[k].cfd).map(k => html`<option value=${k}>${INSTR[k].name}</option>`)}</datalist><//>
          <${Field} label="Default lots"><input class="in tn" inputmode="decimal" value=${a.defLots} onInput=${e => up({ defLots: e.target.value })}/><//>
        </div>
        <div class="row mut" style=${{ fontSize: '11.5px', gap: '14px' }}><${I} n="bolt" s=${14}/><span>1.00 lot × 10 points = <b class="pos">${money((num(a.ppl) ?? CFD_PPL) * 10, { show: true, dec: 2 })}</b></span><span>0.10 lot × 50 points = <b class="pos">${money((num(a.ppl) ?? CFD_PPL) * 5, { show: true, dec: 2 })}</b></span><span>1 pip on 1.00 lot = <b>${money((num(a.ppl) ?? CFD_PPL) * (num(a.pip) ?? 1), { show: true, dec: 2 })}</b></span></div>
      </div>`}
      <div class="lbl">Rules</div>
      <div class="grid g3">
        <${Field} label="Profit target" hint="Leave empty for funded"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.target} onInput=${e => up({ target: e.target.value })}/></div><//>
        <${Field} label="Max loss / drawdown"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.mll} onInput=${e => up({ mll: e.target.value })}/></div><//>
        <${Field} label="Drawdown type"><select class="sel" value=${a.dd} onChange=${e => up({ dd: e.target.value })}><option value="eod">End-of-day trailing</option><option value="intraday">Intraday trailing</option><option value="static">Static</option></select><//>
        <${Field} label="Trailing locks at start +" hint="Usually $100 or $0"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.lock} onInput=${e => up({ lock: e.target.value })}/></div><//>
        <${Field} label="Daily loss limit" hint="0 = none"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.dll} onInput=${e => up({ dll: e.target.value })}/></div><//>
        <${Field} label="Consistency rule %" hint="Best day ÷ total profit. 0 = none"><input class="in tn" value=${a.cons} onInput=${e => up({ cons: e.target.value })}/><//>
        <${Field} label="Min trading days"><input class="in tn" value=${a.minDays} onInput=${e => up({ minDays: e.target.value })}/><//>
        <${Field} label="Fee paid"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.cost} onInput=${e => up({ cost: e.target.value })}/></div><//>
        <${Field} label="Activation fee"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${a.activation} onInput=${e => up({ activation: e.target.value })}/></div><//>
      </div>
      <div class="row" style=${{ gap: '16px' }}>
        <${Field} label="Started"><input class="in" type="date" value=${a.start} onInput=${e => up({ start: e.target.value })}/><//>
        <label class="row" style=${{ gap: '8px', cursor: 'pointer', fontSize: '11.5px' }}><input type="checkbox" checked=${!!a.def} onChange=${e => up({ def: e.target.checked })}/>Pre-select when logging trades</label>
        <${Seg} sm v=${a.mode} set=${v => up({ mode: v })} opts=${[['live', 'Live money'], ['paper', 'Paper']]}/>
      </div>`}
  <//>`;
}

function BalanceSync({ id, onClose }) {
  const S = store.s; const a = S.accounts[id]; const { ts } = computeTrades(S, { mode: 'all', account: id });
  const st = acctState(a, ts, Object.values(S.adjust).filter(x => x.account === id));
  const [v, setV] = useState(Math.round(st.bal * 100) / 100);
  return html`<${Modal} title="Update balance" onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${() => { const d = +v - st.bal; if (Math.abs(d) > .004) { store.put('adjust', { id: uid(), account: id, v: Math.round(d * 100) / 100, d: new Date().toISOString(), note: 'Balance sync' }); toast(`Balance synced (${money(d, { sign: true, show: true })})`) } onClose() }}>Update</button>`}>
    <p class="mut" style=${{ margin: 0 }}>Enter the balance your firm shows. Compound records the difference from logged trades as a sync adjustment (fees, unlogged trades).</p>
    <${Field} label=${'Current computed: ' + money(st.bal, { show: true })}><div class="inwrap"><span class="pre">$</span><input class="in tn" style=${{ fontSize: '17.5px', fontWeight: 700 }} value=${v} onInput=${e => setV(e.target.value)}/></div><//>
  <//>`;
}

function FirmPick({ v, set, only }) {
  const list = FIRMS.filter(f => f.id !== 'personal' && (!only || only(f)));
  return html`<div class="firmpick">${list.map(f => html`<button type="button" key=${f.id} class=${'fp' + (v === f.id ? ' on' : '')} onClick=${() => set(f.id)}><${FirmLogo} id=${f.id} s=${20}/><span>${f.name}</span></button>`)}</div>`;
}

function PayoutForm({ id, account, onClose }) {
  const S = store.s; const ex = id ? S.payouts[id] : null;
  const hasAccs = Object.values(S.accounts).some(a => a.status !== 'blown' && a.status !== 'closed');
  const [p, setP] = useState(ex ? { ...ex, past: !!ex.past } : { account: account || '', amount: '', d: todayKey(), status: 'paid', note: '', deduct: true, past: !account && !hasAccs, firm: '', acctLabel: '' });
  const up = x => setP(o => ({ ...o, ...x }));
  const save = () => {
    if (!isNum(p.amount)) return toast('Enter an amount');
    if (p.past && !p.firm) return toast('Pick the prop firm');
    const o = store.put('payouts', p.past ? { ...p, account: '', amount: +p.amount, deduct: false } : { ...p, firm: undefined, acctLabel: undefined, amount: +p.amount });
    if (!ex && !p.past && p.deduct && p.account) store.put('adjust', { id: uid(), account: p.account, v: -Math.abs(+p.amount), d: p.d + 'T23:59', payout: o.id, note: 'Payout withdrawn' });
    toast('Payout recorded'); onClose();
  };
  return html`<${Modal} title=${ex ? 'Edit payout' : 'Record payout'} icon=${html`<${I} n="wallet"/>`} onClose=${onClose} foot=${html`${ex && html`<button class="btn btn-d" style=${{ marginRight: 'auto' }} onClick=${() => { store.del('payouts', ex.id); const adj = Object.values(S.adjust).find(x => x.payout === ex.id); adj && store.del('adjust', adj.id); onClose() }}>Delete</button>`}<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${save}>Save</button>`}>
    <${Seg} v=${p.past ? 'past' : 'acct'} set=${v => up({ past: v === 'past' })} opts=${[['acct', 'Account in Compound'], ['past', 'Previous payout']]}/>
    ${p.past ? html`
      <${Field} label="Prop firm"><${FirmPick} v=${p.firm} set=${v => up({ firm: v })}/><//>
      <${Field} label="Account (optional)" hint="Size or account ID, so you remember which one paid"><input class="in" placeholder="50K · BG-12345" value=${p.acctLabel || ''} onInput=${e => up({ acctLabel: e.target.value })}/><//>`
    : html`<${Field} label="Account"><${AccountPicker} S=${S} v=${p.account} set=${v => up({ account: v })}/><//>`}
    <div class="grid g2"><${Field} label="Amount received"><div class="inwrap"><span class="pre">$</span><input class="in tn" style=${{ fontSize: '17.5px', fontWeight: 700 }} value=${p.amount} onInput=${e => up({ amount: e.target.value })}/></div><//><${Field} label="Date"><input class="in" type="date" value=${p.d} onInput=${e => up({ d: e.target.value })}/><//></div>
    <div class="row"><${Seg} v=${p.status} set=${v => up({ status: v })} opts=${[['requested', 'Requested'], ['paid', 'Paid']]}/>${!ex && !p.past && html`<label class="row" style=${{ gap: '8px', fontSize: '11.5px', cursor: 'pointer' }}><input type="checkbox" checked=${p.deduct} onChange=${e => up({ deduct: e.target.checked })}/>Deduct from account balance</label>`}</div>
    <${Field} label="Note"><input class="in" value=${p.note} onInput=${e => up({ note: e.target.value })}/><//>
  <//>`;
}

const BLOWN_SIZES = [5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 300000];
function BlownForm({ id, onClose }) {
  const S = store.s; const ex = id ? S.blown[id] : null;
  const [b, setB] = useState(ex ? { ...ex } : { firm: '', plan: '', size: 50000, fee: '', resets: '', activation: '', count: 1, stage: 'eval', bought: '', d: todayKey(), note: '' });
  const up = x => setB(o => ({ ...o, ...x }));
  const f = b.firm ? firmById(b.firm) : null; const total = blownCost(b);
  const save = (again) => {
    if (!b.firm) return toast('Pick the prop firm'); if (!isNum(b.fee) && !isNum(b.resets) && !isNum(b.activation)) return toast('Add what you paid');
    store.put('blown', { ...b, market: f?.market || 'futures', fee: +b.fee || 0, resets: +b.resets || 0, activation: +b.activation || 0, count: Math.max(1, Math.round(+b.count || 1)), size: +b.size || 0 });
    toast(`${b.count > 1 ? b.count + ' blown accounts' : 'Blown account'} added · ${money(total, { dec: 0 })}`);
    if (again) setB(o => ({ ...o, id: undefined, fee: '', resets: '', activation: '', count: 1, note: '' })); else onClose();
  };
  return html`<${Modal} title=${ex ? 'Edit blown account' : 'Add blown account'} size="wide" icon=${html`<${I} n="flame"/>`} onClose=${onClose} foot=${html`${ex && html`<button class="btn btn-d" style=${{ marginRight: 'auto' }} onClick=${() => UI.confirm({ title: 'Remove this entry?', body: 'Its fees come off your spending totals.', onYes: () => { store.del('blown', ex.id); onClose() } })}>Delete</button>`}<button class="btn btn-g" onClick=${onClose}>Cancel</button>${!ex && html`<button class="btn btn-g" onClick=${() => save(true)}>Save & add another</button>`}<button class="btn btn-w" onClick=${() => save(false)}>Save</button>`}>
    <${Field} label="Prop firm"><${FirmPick} v=${b.firm} set=${v => up({ firm: v, plan: firmById(v).plans?.[0] || '' })}/><//>
    <div class="grid g4 keep2">
      <${Field} label="Plan"><select class="sel" value=${b.plan} onChange=${e => up({ plan: e.target.value })}><option value="">—</option>${(f?.plans || []).map(x => html`<option key=${x} value=${x} selected=${b.plan === x}>${x}</option>`)}</select><//>
      <${Field} label="Account size"><select class="sel" value=${b.size} onChange=${e => up({ size: +e.target.value })}>${BLOWN_SIZES.map(x => html`<option key=${x} value=${x}>$${(x / 1000)}K</option>`)}</select><//>
      <${Field} label="Blown at"><${Seg} v=${b.stage} set=${v => up({ stage: v })} opts=${[['eval', 'Eval'], ['funded', 'Funded']]}/><//>
      <${Field} label="How many like this" hint="Blew the same one 4 times? Put 4"><input class="in tn" inputmode="numeric" value=${b.count} onInput=${e => up({ count: e.target.value })}/><//>
    </div>
    <div class="grid g3 keep2">
      <${Field} label="Eval fee, per account"><div class="inwrap"><span class="pre">$</span><input class="in tn" inputmode="decimal" placeholder="0" value=${b.fee} onInput=${e => up({ fee: e.target.value })}/></div><//>
      <${Field} label="Resets / extra"><div class="inwrap"><span class="pre">$</span><input class="in tn" inputmode="decimal" placeholder="0" value=${b.resets} onInput=${e => up({ resets: e.target.value })}/></div><//>
      <${Field} label="Activation fee"><div class="inwrap"><span class="pre">$</span><input class="in tn" inputmode="decimal" placeholder="0" value=${b.activation} onInput=${e => up({ activation: e.target.value })}/></div><//>
    </div>
    <div class="grid g3 keep2">
      <${Field} label="Bought (optional)"><input class="in" type="date" value=${b.bought} onInput=${e => up({ bought: e.target.value })}/><//>
      <${Field} label="Blown on"><input class="in" type="date" value=${b.d} onInput=${e => up({ d: e.target.value })}/><//>
      <${Field} label="Note"><input class="in" placeholder="What blew it?" value=${b.note} onInput=${e => up({ note: e.target.value })}/><//>
    </div>
    <div class="card tight row" style=${{ background: 'var(--negs)', borderColor: 'transparent' }}><span class="lbl">Total paid</span><span class="sp"></span><b class="tn neg" style=${{ fontSize: '19px' }}>${money(total, { dec: 0, show: true })}</b>${(+b.count || 1) > 1 && html`<span class="dim tn" style=${{ fontSize: '11px' }}>${b.count} × ${money(total / (+b.count || 1), { dec: 0, show: true })}</span>`}</div>
  <//>`;
}

const STRAT_COLORS = ['#5B8CFF', '#35D49A', '#F3B43F', '#FF8A4C', '#9D7BFF', '#FF5A6E', '#6FD3FF', '#E9EAEE'];
function StrategyForm({ id, onClose }) {
  const S = store.s; const ex = id ? S.strategies[id] : null;
  const [s, setS] = useState(ex ? { ...ex } : { name: '', color: STRAT_COLORS[Object.keys(S.strategies).length % 8], desc: '', tf: 'HTF 1H/15m · entry 1m', markets: 'MNQ', entry: [], invalid: '', minRR: 2, manage: '', checklist: [], setups: [], shots: [] });
  const up = x => setS(o => ({ ...o, ...x }));
  return html`<${Modal} title=${ex ? 'Edit strategy' : 'New strategy'} size="wide" onClose=${onClose} foot=${html`${ex && html`<button class="btn btn-d" style=${{ marginRight: 'auto' }} onClick=${() => UI.confirm({ title: 'Delete strategy?', body: 'Trades tagged to it keep their data but lose the tag.', onYes: () => { store.del('strategies', ex.id); onClose() } })}>Delete</button>`}<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${() => { if (!s.name.trim()) return toast('Name your strategy'); store.put('strategies', { ...s, created: ex?.created || Date.now() }); onClose() }}>Save strategy</button>`}>
    <div class="grid g2" style=${{ gap: '18px' }}>
      <div class="col" style=${{ gap: '14px' }}>
        <${Field} label="Name"><input class="in" style=${{ fontSize: '15px', fontWeight: 700 }} placeholder="NY Open FVG continuation" value=${s.name} onInput=${e => up({ name: e.target.value })}/><//>
        <div class="row" style=${{ gap: '6px' }}>${STRAT_COLORS.map(c => html`<button key=${c} onClick=${() => up({ color: c })} style=${{ width: '24px', height: '24px', borderRadius: '7px', background: c, outline: s.color === c ? '2px solid var(--fg)' : 'none', outlineOffset: '2px' }} aria-label=${'Colour ' + c}></button>`)}</div>
        <${Field} label="Thesis · what edge are you exploiting?"><textarea class="ta" rows="3" value=${s.desc} onInput=${e => up({ desc: e.target.value })}></textarea><//>
        <div class="grid g3 keep2"><${Field} label="Timeframes"><input class="in" value=${s.tf} onInput=${e => up({ tf: e.target.value })}/><//><${Field} label="Markets"><input class="in" value=${s.markets} onInput=${e => up({ markets: e.target.value })}/><//><${Field} label="Minimum R:R"><input class="in tn" value=${s.minRR} onInput=${e => up({ minRR: e.target.value })}/><//></div>
        <${Field} label="Setups it uses"><${Chips} all=${S.settings.setups} v=${s.setups} set=${v => up({ setups: v })}/><//>
        <${Field} label="Example charts"><${ShotsEdit} shots=${s.shots} set=${v => up({ shots: v })} label="Add example"/><//>
      </div>
      <div class="col" style=${{ gap: '14px' }}>
        <${Field} label="Entry conditions · all must be true"><${ListEdit} v=${s.entry} set=${v => up({ entry: v })} placeholder="e.g. 15m FVG in direction of 1H bias"/><//>
        <${Field} label="Invalidation · when the idea is wrong"><textarea class="ta" rows="2" value=${s.invalid} onInput=${e => up({ invalid: e.target.value })}></textarea><//>
        <${Field} label="Management · stops, partials, exits"><textarea class="ta" rows="3" value=${s.manage} onInput=${e => up({ manage: e.target.value })}></textarea><//>
        <${Field} label="Pre-trade checklist"><${ListEdit} v=${s.checklist} set=${v => up({ checklist: v })}/><//>
      </div>
    </div>
  <//>`;
}

function PlanForm({ day, onClose }) {
  const S = store.s; const d = S.days[day] || { id: day };
  const [p, setP] = useState(() => { const o = { bias: '', feeling: '', rule: '', news: '', a: '', b: '', focus: '', maxTrades: S.settings.maxTrades, maxLoss: S.settings.maxDailyLoss, mood: 3, ...(d.plan || {}) }; o.levels = planLevels(d.plan).join('\n'); return o });
  const up = x => setP(o => ({ ...o, ...x }));
  const save = () => { const levels = String(p.levels || '').split(/\n/).map(x => x.trim()).filter(Boolean); store.put('days', { ...d, id: day, plan: { ...p, levels, at: Date.now() } }); toast('Plan saved. Trade the plan.'); onClose() };
  return html`<${Modal} title=${'Pre-market plan · ' + fmtDate(parseDay(day), { wd: true })} size="wide" onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${save}>Save plan</button>`}>
    <div class="grid g2" style=${{ gap: '18px' }}>
      <div class="col" style=${{ gap: '14px' }}>
        <${Field} label="Bias"><${Seg} v=${p.bias} set=${v => up({ bias: v })} opts=${[['bull', 'Bullish'], ['bear', 'Bearish'], ['neutral', 'No bias'], ['wait', 'Wait for it']]}/><//>
        <${Field} label="Feeling"><${Chips} single all=${['Calm', 'Focused', 'Tired', 'Rushed']} v=${p.feeling} set=${v => up({ feeling: v })}/><//>
        <${Field} label="Key levels · one per line"><textarea class="ta" rows="4" placeholder=${'PDH 21,450\nNY midnight open 21,330\n1H FVG 21,380'} value=${p.levels} onInput=${e => up({ levels: e.target.value })}></textarea><//>
        <${Field} label="News & events"><input class="in" placeholder="8:30 CPI, 10:00 ISM" value=${p.news} onInput=${e => up({ news: e.target.value })}/><//>
      </div>
      <div class="col" style=${{ gap: '14px' }}>
        <${Field} label="One rule for today"><input class="in" value=${p.rule} placeholder="Wait for the 15m FVG retest" onInput=${e => up({ rule: e.target.value })}/><//>
        <${Field} label="Scenario A · if this happens, I do this"><textarea class="ta" rows="2" value=${p.a} onInput=${e => up({ a: e.target.value })}></textarea><//>
        <${Field} label="Scenario B"><textarea class="ta" rows="2" value=${p.b} onInput=${e => up({ b: e.target.value })}></textarea><//>
        <${Field} label="One thing to focus on"><input class="in" value=${p.focus} onInput=${e => up({ focus: e.target.value })}/><//>
        <div class="grid g3 keep2"><${Field} label="Max trades"><input class="in tn" value=${p.maxTrades} onInput=${e => up({ maxTrades: e.target.value })}/><//><${Field} label="Max loss"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${p.maxLoss} onInput=${e => up({ maxLoss: e.target.value })}/></div><//><${Field} label=${'Readiness · ' + p.mood + '/5'}><input type="range" min="1" max="5" value=${p.mood} onInput=${e => up({ mood: +e.target.value })}/><//></div>
      </div>
    </div><//>`;
}

function ReviewForm({ day, onClose }) {
  const S = store.s; const d = S.days[day] || { id: day };
  const [r, setR] = useState(() => ({ text: '', lessons: '', mood: 3, plan: null, ...(d.review || {}), score: dayScore(d) ?? 7 }));
  const up = x => setR(o => ({ ...o, ...x }));
  return html`<${Modal} title=${'Day review · ' + fmtDate(parseDay(day), { wd: true })} onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" onClick=${() => { store.put('days', { ...d, id: day, review: { ...r, at: Date.now() } }); toast('Review saved'); onClose() }}>Save review</button>`}>
    <${Field} label="Did you follow your plan?"><${Seg} v=${r.plan === true ? 'y' : r.plan === false ? 'n' : r.plan === 'part' ? 'p' : ''} set=${v => up({ plan: v === 'y' ? true : v === 'n' ? false : 'part' })} opts=${[['y', 'Yes'], ['p', 'Partly'], ['n', 'No']]}/><//>
    <${Field} label=${'Rate your day · ' + r.score + '/10'}><${ScorePick} v=${r.score} set=${v => up({ score: v })}/><//>
    <${Field} label="What happened today?"><textarea class="ta" rows="4" value=${r.text} onInput=${e => up({ text: e.target.value })}></textarea><//>
    <${Field} label="One lesson"><textarea class="ta" rows="2" value=${r.lessons} onInput=${e => up({ lessons: e.target.value })}></textarea><//>
  <//>`;
}

function ScorePick({ v, set }) { return html`<div class="scorep">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => html`<button type="button" key=${n} class=${'tn' + (+v === n ? ' on' : '') + (n <= 4 ? ' lo' : n >= 8 ? ' hi' : '')} onClick=${() => set(n)}>${n}</button>`)}</div>` }

/* pairs individual fills (Tradesea / Rithmic order exports) into round-trip trades, FIFO per account + symbol */
function pairFills(fills) {
  const out = []; const by = new Map();
  for (const f of fills.sort((a, b) => a.time - b.time)) { const k = f.acc + '|' + f.sym; if (!by.has(k)) by.set(k, []); by.get(k).push(f) }
  for (const list of by.values()) {
    let cur = null;
    const open = (f, q) => { cur = { acc: f.acc, sym: f.sym, side: q > 0 ? 'long' : 'short', pos: q, eQ: Math.abs(q), eV: Math.abs(q) * f.price, xQ: 0, xV: 0, t: f.time, fee: f.fee * Math.abs(q) / Math.abs(f.q) } };
    for (const f of list) {
      let q = f.q;
      if (!cur) { open(f, q); continue }
      if (Math.sign(q) === Math.sign(cur.pos)) { cur.pos += q; cur.eQ += Math.abs(q); cur.eV += Math.abs(q) * f.price; cur.fee += f.fee; continue }
      const close = Math.min(Math.abs(q), Math.abs(cur.pos));
      cur.xQ += close; cur.xV += close * f.price; cur.fee += f.fee * close / Math.abs(q); cur.pos += Math.sign(q) * close;
      if (cur.pos === 0) {
        out.push({ acc: cur.acc, symbol: cur.sym, side: cur.side, qty: cur.eQ, entry: +(cur.eV / cur.eQ).toFixed(4), exit: +(cur.xV / cur.xQ).toFixed(4), t: cur.t, tx: f.time, fees: +cur.fee.toFixed(2) });
        cur = null; const left = Math.abs(q) - close;
        if (left > 0) open({ ...f, fee: f.fee * left / Math.abs(q) * Math.abs(q) / left }, Math.sign(q) * left), cur.fee = f.fee * left / Math.abs(q);
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function ImportTrades({ onClose, mode }) {
  const S = store.s;
  const [rows, setRows] = useState(null); const [map, setMap] = useState({}); const [acct, setAcct] = useState(''); const [fmt, setFmt] = useState(''); const [fills, setFills] = useState(false);
  const [amap, setAmap] = useState(() => S.settings.importMap || {}); const [main, setMain] = useState(S.settings.copySet?.main || ''); const [grp, setGrp] = useState(true);
  const FIELDS = fills ? [['symbol', 'Symbol'], ['side', 'Side (Buy/Sell)'], ['qty', 'Qty'], ['price', 'Fill / avg price'], ['t', 'Time'], ['fee', 'Commission'], ['status', 'Status'], ['account', 'Account']]
    : [['symbol', 'Symbol'], ['side', 'Side'], ['qty', 'Qty'], ['entry', 'Entry price'], ['exit', 'Exit price'], ['t', 'Entry time'], ['tx', 'Exit time'], ['pnl', 'P&L'], ['account', 'Account']];
  const guess = hdr => {
    const h = hdr.map(x => x.toLowerCase().trim()); const f = re => { const i = h.findIndex(x => re.test(x)); return i < 0 ? '' : i };
    if (h.includes('boughttimestamp') || h.includes('buyprice')) { setFmt('Tradovate performance'); setFills(false); return { symbol: f(/^symbol$/), qty: f(/^qty$/), entry: f(/^buyprice$/), exit: f(/^sellprice$/), t: f(/^boughttimestamp$/), tx: f(/^soldtimestamp$/), pnl: f(/^pnl$/), side: '', account: f(/account/) } }
    const hasExit = h.some(x => /exit ?price|close ?price|exit ?time|profit|p&l|pnl/.test(x));
    const hasFill = h.some(x => /avg ?(fill )?price|fill ?price|^price$|avgprice|filled ?price/.test(x)) && h.some(x => /side|b\/s|buy\/sell|action/.test(x));
    if (!hasExit && hasFill) { setFmt(h.some(x => /status/.test(x)) ? 'Tradesea / Rithmic order history' : 'Fills (order history)'); setFills(true); return { symbol: f(/symbol|contract|instrument/), side: f(/^side$|b\/s|buy\/sell|action|side/), qty: f(/fill(ed)? ?qty|^qty$|quantity|filled|^size$/), price: f(/avg ?(fill )?price|avgprice|fill ?price|filled ?price|^price$/), t: f(/fill ?time|^time$|timestamp|date|time/), fee: f(/comm|fee/), status: f(/status/), account: f(/account/) } }
    setFills(false); if (h.includes('market pos.')) setFmt('NinjaTrader trades'); else setFmt('Generic CSV');
    return { symbol: f(/instrument|symbol|contract/), side: f(/market pos|side|direction|action|b\/s/), qty: f(/^qty|quantity|contracts|size/), entry: f(/entry ?price|avg ?entry|open ?price|^entry$/), exit: f(/exit ?price|avg ?exit|close ?price|^exit$/), t: f(/entry ?time|open ?time|entered|^date|opened/), tx: f(/exit ?time|close ?time|exited|closed/), pnl: f(/profit|p&l|pnl|net/), account: f(/account/) };
  };
  const load = async file => { const txt = await file.text(); const r = parseCSV(txt); if (r.length < 2) return toast('That file has no rows'); setRows(r); setMap(guess(r[0])) };
  const cell = (r, k) => map[k] === '' || map[k] == null ? null : r[map[k]];
  const extAccs = useMemo(() => rows && map.account !== '' && map.account != null ? [...new Set(rows.slice(1).map(r => String(r[map.account] || '').trim()).filter(Boolean))] : [], [rows, map.account]);
  const accFor = name => extAccs.length ? (amap[name] || '') : acct;
  const build = () => {
    const body = rows.slice(1); let list = [];
    if (fills) {
      const fl = [];
      for (const r of body) {
        const st = String(cell(r, 'status') || 'filled').toLowerCase(); if (map.status !== '' && map.status != null && !/fill|complete|executed|done/.test(st)) continue;
        const sym = normSym(cell(r, 'symbol')); const qn = Math.abs(num(String(cell(r, 'qty') || '').replace(/,/g, '')) || 0); const pr = num(String(cell(r, 'price') || '').replace(/[,$]/g, '')); const tm = parseDateLoose(cell(r, 't'));
        if (!sym || !qn || pr == null || !tm) continue;
        const sd = String(cell(r, 'side') || '').toLowerCase(); const sign = /sell|^s$|short/.test(sd) ? -1 : 1;
        fl.push({ acc: String(cell(r, 'account') || '').trim(), sym, q: sign * qn, price: pr, time: tm.getTime(), fee: Math.abs(moneyParse(cell(r, 'fee')) || 0) });
      }
      list = pairFills(fl).map(x => ({ symbol: x.symbol, side: x.side, qty: x.qty, entry: x.entry, exit: x.exit, t: localISO(new Date(x.t)), tx: localISO(new Date(x.tx)), fees: map.fee !== '' && map.fee != null ? x.fees : undefined, ext: x.acc }));
    } else {
      for (const r of body) {
        const sym = normSym(cell(r, 'symbol')); if (!sym) continue;
        const t = parseDateLoose(cell(r, 't')), tx = parseDateLoose(cell(r, 'tx'));
        let side = String(cell(r, 'side') || '').toLowerCase();
        side = /short|sell|^s$/.test(side) ? 'short' : /long|buy|^b$/.test(side) ? 'long' : (fmt === 'Tradovate performance' && t && tx && t > tx ? 'short' : 'long');
        let entry = num(String(cell(r, 'entry') || '').replace(/,/g, '')), exit = num(String(cell(r, 'exit') || '').replace(/,/g, ''));
        let t1 = t, t2 = tx;
        if (fmt === 'Tradovate performance' && side === 'short') { [entry, exit] = [exit, entry];[t1, t2] = [tx, t] }
        const pnl = moneyParse(cell(r, 'pnl'));
        list.push({ symbol: sym, side, qty: Math.abs(num(cell(r, 'qty')) || 1), entry: entry ?? '', exit: exit ?? '', t: t1 ? localISO(t1) : localISO(), tx: t2 ? localISO(t2) : '', pnl: pnl ?? '', pnlManual: pnl != null, ext: String(cell(r, 'account') || '').trim() });
      }
    }
    return list.map(tr => { const account = accFor(tr.ext); const o = { ...tr, account, mode: mode || 'live', imported: true }; delete o.ext; o.hash = [o.symbol, o.t, o.tx, o.qty, o.entry, o.exit, o.pnl, account].join('|'); return o });
  };
  const preview = rows ? build() : [];
  const exist = new Set(Object.values(S.trades).map(t => t.hash).filter(Boolean));
  const fresh = preview.filter(t => !exist.has(t.hash));
  const multi = new Set(fresh.map(t => t.account).filter(Boolean)).size > 1;
  const doImport = () => {
    const items = fresh.map(t => ({ ...t, id: uid(), created: Date.now() }));
    let groups = 0;
    if (multi && grp) {
      const used = new Set();
      for (const a of items) {
        if (used.has(a.id)) continue;
        const cl = items.filter(b => !used.has(b.id) && b.symbol === a.symbol && b.side === a.side && Math.abs(new Date(b.t) - new Date(a.t)) <= 15000 && b.account);
        const accs = new Set(cl.map(x => x.account)); if (cl.length < 2 || accs.size < 2) continue;
        const seen = new Set(); const members = cl.filter(x => !seen.has(x.account) && seen.add(x.account));
        const lead = members.find(x => x.account === main) || members[0]; const g = uid();
        members.forEach(x => { used.add(x.id); x.group = g; x.lead = x === lead; x.role = x === lead ? 'main' : 'copy'; if (x !== lead) x.copyOf = lead.id }); groups++;
      }
    }
    items.forEach(t => store.put('trades', t));
    if (extAccs.length) store.setSettings({ importMap: amap });
    toast(`Imported ${items.length} trades${groups ? ` · ${groups} copy-trade groups` : ''}`); onClose();
  };
  const activeAccs = Object.values(S.accounts).filter(a => a.status === 'active');
  return html`<${Modal} title="Import trades" icon=${html`<${I} n="upload"/>`} size="wide" onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" disabled=${!fresh.length} onClick=${doImport}>Import ${fresh.length || ''} trades</button>`}>
    ${!rows ? html`<label class="drop"><${I} n="upload" s=${22}/><div style=${{ marginTop: '6px' }}><b>Choose a CSV export</b></div><div style=${{ fontSize: '11px' }}>Tradesea (Orders / Trade history → export CSV), Rithmic R|Trader, Tradovate, NinjaTrader, or any CSV. Order-by-order fills are paired into full trades automatically.</div><input type="file" accept=".csv,text/csv,text/plain" hidden onChange=${e => e.target.files[0] && load(e.target.files[0])}/></label>`
    : html`<div class="row"><span class="chip on">${fmt}</span><span class="mut">${rows.length - 1} rows → ${preview.length} trades · ${fresh.length} new · ${preview.length - fresh.length} already in journal</span><span class="sp"></span><button class="btn btn-t xs" onClick=${() => setFills(!fills)}>${fills ? 'File has one row per trade' : 'File has one row per fill'}</button></div>
      <details><summary class="mut" style=${{ cursor: 'pointer', fontSize: '11.5px' }}>Column matching (auto-detected)</summary><div class="grid g4 keep2" style=${{ marginTop: '10px' }}>${FIELDS.map(([k, l]) => html`<${Field} label=${l} key=${k}><select class="sel" value=${map[k] ?? ''} onChange=${e => setMap({ ...map, [k]: e.target.value === '' ? '' : +e.target.value })}><option value="">—</option>${rows[0].map((h, i) => html`<option value=${i}>${h}</option>`)}</select><//>`)}</div></details>
      ${extAccs.length ? html`<div class="card tight col" style=${{ gap: '8px', background: 'var(--bg)' }}><div class="lbl">Match each account in the file to Compound</div>
          ${extAccs.map(n => html`<div class="row" key=${n} style=${{ flexWrap: 'nowrap' }}><span class="mono" style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>${n}</span><select class="sel" style=${{ maxWidth: '260px' }} value=${amap[n] || ''} onChange=${e => setAmap({ ...amap, [n]: e.target.value })}><option value="">No account</option>${activeAccs.map(a => html`<option value=${a.id}>${a.label} · ${firmById(a.firm).name}</option>`)}</select></div>`)}
          <button class="btn btn-t xs" style=${{ alignSelf: 'flex-start' }} onClick=${() => UI.open('account')}><${I} n="plus" s=${12}/>Add an account</button></div>`
        : html`<${Field} label="Assign to account"><${AccountPicker} S=${S} v=${acct} set=${setAcct}/><//>`}
      ${multi && html`<div class="card tight col" style=${{ gap: '8px', background: 'var(--bg)' }}><label class="row" style=${{ gap: '8px', fontSize: '12px', cursor: 'pointer' }}><input type="checkbox" checked=${grp} onChange=${e => setGrp(e.target.checked)}/><${I} n="copy" s=${15}/><b>Group copy trades</b><span class="mut">Same symbol and side within 15 seconds across accounts</span></label>
        ${grp && html`<${Field} label="Main account"><select class="sel" value=${main} onChange=${e => setMain(e.target.value)}><option value="">First account in each group</option>${activeAccs.map(a => html`<option value=${a.id}>${a.label}</option>`)}</select><//>`}</div>`}
      <div class="scroll-x"><table class="tbl"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th class="r">Qty</th><th class="r">Entry</th><th class="r">Exit</th><th>Account</th><th class="r">P&L</th></tr></thead><tbody>${preview.slice(0, 10).map((t, i) => { const c = tradeCalc(t, S.settings); return html`<tr key=${i}><td>${t.t.replace('T', ' ')}</td><td>${t.symbol}</td><td><${Side} s=${t.side}/></td><td class="r">${t.qty}</td><td class="r">${t.entry}</td><td class="r">${t.exit}</td><td class="mut">${S.accounts[t.account]?.label || '—'}</td><td class="r"><${Money} v=${c.pnl}/></td></tr>` })}</tbody></table></div>`}
  <//>`;
}

function Settings({ onClose, tab: tab0 }) {
  const S = useStore(); const st = S.settings; const [tab, setTab] = useState(tab0 || 'general');
  const set = p => store.setSettings(p);
  const exportJSON = async () => { const data = JSON.stringify({ app: 'compound', v: 1, at: new Date().toISOString(), ...S }, null, 1); const dl = store.caps.downloads; if (dl) { try { await dl.save({ filename: `compound-backup-${todayKey()}.json`, data }); toast('Backup saved') } catch (e) { toast('Backup was not saved') } } else { try { await navigator.clipboard.writeText(data); toast('Backup copied to clipboard') } catch (e) { toast('Open Compound inside Claude to save backups') } } };
  const exportCSV = async () => { const { all } = computeTrades(S, { mode: 'all' }); const cols = ['t', 'tx', 'symbol', 'side', 'qty', 'entry', 'exit', 'stop', 'target', 'pnl', 'risk', 'grade', 'account', 'strategy', 'setups', 'mistakes', 'notes']; const csv = [cols.join(','), ...all.map(t => cols.map(c => { let v = c === 'account' ? (S.accounts[t.account]?.label || '') : c === 'strategy' ? (S.strategies[t.strategy]?.name || '') : t[c]; if (Array.isArray(v)) v = v.join('|'); return '"' + String(v ?? '').replace(/"/g, '""') + '"' }).join(','))].join('\n'); const dl = store.caps.downloads; if (dl) { try { await dl.save({ filename: `compound-trades-${todayKey()}.csv`, data: csv }); toast('CSV saved') } catch (e) { } } else toast('Open Compound inside Claude to save files') };
  const importJSON = async f => { try { const d = JSON.parse(await f.text()); if (d.app !== 'compound') return toast('That is not a Compound backup'); let n = 0; for (const c of COLLS) for (const o of Object.values(d[c] || {})) { store.put(c, o); n++ } if (d.settings) set(d.settings); toast(`Restored ${n} items`) } catch (e) { toast('Could not read that backup') } };
  const sampleN = COLLS.reduce((n, c) => n + Object.values(S[c]).filter(o => o.sample).length, 0);
  return html`<${Modal} title="Settings" icon=${html`<${I} n="gear"/>`} size="wide" onClose=${onClose}>
    <${Seg} v=${tab} set=${setTab} opts=${[['general', 'General'], ['journal', 'Journal'], ['guard', 'Guardrails'], ['instr', 'Instruments'], ...(store.backend === 'supabase' ? [['ai', 'AI']] : []), ['data', 'Data']]}/>
    ${tab === 'general' && html`<div class="grid g2" style=${{ gap: '18px' }}>
      <${Field} label="Your name"><input class="in" value=${st.name} onInput=${e => set({ name: e.target.value })}/><//>
      <${Field} label="Appearance"><${Seg} v=${st.theme} set=${v => set({ theme: v })} opts=${[['dark', 'Dark', 'moon'], ['light', 'Light', 'sun']]}/><//>
      <${Field} label="Accent"><div class="row" style=${{ gap: '8px' }}>${[['cobalt', '#5B8CFF'], ['violet', '#9D7BFF'], ['ember', '#FF8A4C'], ['ice', '#6FD3FF'], ['gold', '#F3B43F'], ['mono', '#E9EAEE']].map(([k, c]) => html`<button key=${k} onClick=${() => set({ accent: k })} title=${k} style=${{ width: '30px', height: '30px', borderRadius: '9px', background: c, outline: st.accent === k ? '2px solid var(--fg)' : 'none', outlineOffset: '2px' }}></button>`)}</div><//>
      <${Field} label="Default symbol & size"><div class="row" style=${{ flexWrap: 'nowrap' }}><input class="in" list="syms" value=${st.defaultSymbol} onInput=${e => set({ defaultSymbol: e.target.value.toUpperCase() })}/><input class="in tn" style=${{ width: '90px' }} value=${st.defaultQty} onInput=${e => set({ defaultQty: +e.target.value || 1 })}/></div><//>
      <label class="row" style=${{ gap: '8px', fontSize: '12px', cursor: 'pointer' }}><input type="checkbox" checked=${st.dedupeCopies} onChange=${e => set({ dedupeCopies: e.target.checked })}/>Count copy-traded ideas once in analytics (when viewing all accounts)</label></div>`}
    ${tab === 'journal' && html`<div class="grid g2" style=${{ gap: '18px' }}>
      <${Field} label="Daily checklist"><${ListEdit} v=${st.checklist} set=${v => set({ checklist: v })}/><//>
      <${Field} label="Setup tags"><${ListEdit} v=${st.setups} set=${v => set({ setups: v })}/><//>
      <${Field} label="Mistake tags"><${ListEdit} v=${st.mistakes} set=${v => set({ mistakes: v })}/><//>
      <${Field} label="Emotion tags"><${ListEdit} v=${st.emotions} set=${v => set({ emotions: v })}/><//></div>`}
    ${tab === 'guard' && html`<div class="grid g2" style=${{ gap: '18px' }}>
      <${Field} label="Max daily loss" hint="The desk bar turns red as you approach it"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${st.maxDailyLoss} onInput=${e => set({ maxDailyLoss: +e.target.value || 0 })}/></div><//>
      <${Field} label="Daily profit goal"><div class="inwrap"><span class="pre">$</span><input class="in tn" value=${st.dailyGoal} onInput=${e => set({ dailyGoal: +e.target.value || 0 })}/></div><//>
      <${Field} label="Max trades per day"><input class="in tn" value=${st.maxTrades} onInput=${e => set({ maxTrades: +e.target.value || 0 })}/><//>
      <${Field} label="Stop after consecutive losses"><input class="in tn" value=${st.maxConsecLosses} onInput=${e => set({ maxConsecLosses: +e.target.value || 0 })}/><//></div>`}
    ${tab === 'instr' && html`<div class="scroll-x"><table class="tbl"><thead><tr><th>Symbol</th><th>Name</th><th class="r">$ / point</th><th class="r">Fees / contract (round trip)</th></tr></thead><tbody>${Object.entries(INSTR).map(([k, v]) => html`<tr key=${k}><td><b>${k}</b></td><td class="mut">${v.name}</td><td class="r">${v.pv}</td><td class="r"><input class="in tn" style=${{ width: '90px', textAlign: 'right' }} value=${st.commissions?.[k] ?? v.com} onInput=${e => set({ commissions: { ...st.commissions, [k]: isNum(e.target.value) ? +e.target.value : v.com } })}/></td></tr>`)}</tbody></table></div>`}
    ${tab === 'ai' && html`<${AISettings}/>`}
    ${tab === 'data' && html`<div class="col" style=${{ gap: '14px' }}>
      ${store.backend === 'supabase' && html`<div class="card tight row"><${I} n="user"/><div style=${{ flex: 1 }}><b>${store.email || 'Signed in'}</b><div class="mut" style=${{ fontSize: '11px' }}>Sign in with this account on any device to see the same journal.</div></div><button class="btn btn-g sm" onClick=${() => store.signOut()}>Sign out</button></div>`}
      ${store.backend === 'supabase' && html`<div class="card tight row"><${I} n="link"/><div style=${{ flex: 1 }}><b>Set up another device</b><div class="mut" style=${{ fontSize: '11px' }}>Copy this link and open it on your phone or laptop. It connects that device to your database, then you sign in.</div></div><button class="btn btn-g sm" onClick=${async () => { const l = setupLink(); try { await navigator.clipboard.writeText(l); toast('Setup link copied') } catch (e) { prompt && toast('Copy failed') } }}>Copy link</button></div>`}
      <div class="card tight row"><span class=${'dot ' + (store.mode === 'cloud' ? 'ok' : 'loc')}></span><div><b>${store.mode === 'cloud' ? 'Synced across your devices' : 'Saved in this browser only'}</b><div class="mut" style=${{ fontSize: '11px' }}>${store.mode === 'cloud' ? 'Private to you. Every change shows up on your other devices within seconds.' : 'Use your Compound app to sync across devices.'}</div></div></div>
      <div class="row"><button class="btn btn-g" onClick=${exportJSON}><${I} n="download"/>Back up everything</button><label class="btn btn-g"><${I} n="upload"/>Restore backup<input type="file" accept=".json" hidden onChange=${e => e.target.files[0] && importJSON(e.target.files[0])}/></label><button class="btn btn-g" onClick=${exportCSV}><${I} n="download"/>Export trades CSV</button></div>
      <div class="divider"></div>
      <div class="row"><button class="btn btn-g" onClick=${() => { loadSample(); toast('Sample data added. Everything is marked as sample.') }}>Load sample data</button>${sampleN > 0 && html`<button class="btn btn-d" onClick=${() => { clearSample(); toast('Sample data removed') }}>Remove ${sampleN} sample items</button>`}</div>
      <p class="dim" style=${{ margin: 0, fontSize: '11px' }}>Sample data lets you see every chart filled in. It is tagged so one click removes it without touching your own trades.</p></div>`}
  <//>`;
}

/* ---------- sample data (clearly marked, removable) ---------- */
function loadSample() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const acc = store.put('accounts', { id: 'sample-acc', sample: true, firm: 'lucid', plan: 'LucidFlex', size: 50000, type: 'eval', label: 'SAMPLE-50K', target: 3000, mll: 2000, dd: 'eod', lock: 100, dll: 1200, cons: 50, cost: 120, status: 'active', mode: 'live', created: Date.now() - 50 * 864e5 });
  const s1 = store.put('strategies', { id: 'sample-s1', sample: true, name: 'NY Open FVG continuation', color: '#5B8CFF', desc: 'Sample strategy. Trade with the 1H bias after a 15m FVG forms in the first hour.', tf: '1H / 15m / 1m', markets: 'MNQ', entry: ['1H bias clear', '15m FVG in bias direction', '1m MSS into the FVG'], invalid: 'Close through the FVG', minRR: 2, manage: 'Partial at 1R, runner to liquidity', checklist: [], setups: ['FVG', 'MSS / CHoCH'] });
  const s2 = store.put('strategies', { id: 'sample-s2', sample: true, name: 'London sweep reversal', color: '#F3B43F', desc: 'Sample strategy. Fade the London high or low sweep at NY open.', tf: '15m / 1m', markets: 'MNQ', entry: ['London high/low swept', 'SMT with ES', 'iFVG confirms'], invalid: 'New extreme after entry', minRR: 2.5, manage: 'Stop to BE at 1R', checklist: [], setups: ['Liquidity sweep', 'Inverse FVG', 'SMT divergence'] });
  const today = new Date(); let d = addDays(today, -42); let price = 24100;
  const mist = DEFAULT_SETTINGS.mistakes, emo = DEFAULT_SETTINGS.emotions;
  while (d < today) {
    if (d.getDay() > 0 && d.getDay() < 6) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const st = rnd() < .55 ? s1 : s2; const side = rnd() < .58 ? 'long' : 'short'; const qty = rnd() < .7 ? 2 : 3;
        const h = 9 + Math.floor(rnd() * 3), m = Math.floor(rnd() * 60);
        const t0 = new Date(d); t0.setHours(h, m, 0, 0); t0.setTime(t0.getTime() + Math.round(h - Math.floor(nyHM(t0))) * 36e5);
        const stopPts = 10 + Math.round(rnd() * 14); const entry = Math.round((price + (rnd() - .5) * 120) * 4) / 4;
        const good = rnd() < (st === s1 ? .56 : .47); const broke = rnd() < .22;
        const outR = good ? 1 + rnd() * 2.4 : -(broke ? 1 + rnd() * .8 : .3 + rnd() * .7);
        const dir = side === 'long' ? 1 : -1; const exit = Math.round((entry + dir * outR * stopPts) * 4) / 4;
        const hold = 4 + Math.floor(rnd() * (good ? 55 : 25));
        const g = broke ? (rnd() < .5 ? 'C' : 'D') : good ? (rnd() < .3 ? 'A+' : 'A') : (rnd() < .6 ? 'B' : 'A');
        store.put('trades', { id: 'sample-t' + uid(), sample: true, symbol: 'MNQ', side, qty, entry, exit, stop: entry - dir * stopPts, target: entry + dir * stopPts * (st.minRR || 2), t: localISO(t0), tx: localISO(new Date(t0.getTime() + hold * 60000)), account: acc.id, strategy: st.id, setups: st.setups.slice(0, 1 + Math.floor(rnd() * 2)), grade: g, rules: !broke, mistakes: broke ? [mist[Math.floor(rnd() * mist.length)]] : [], emoBefore: [emo[Math.floor(rnd() * (broke ? 12 : 4))]], emoAfter: [emo[Math.floor(rnd() * 6)]], conf: 2 + Math.floor(rnd() * 4), notes: good ? 'Sample: waited for the displacement, entered on the retrace into the gap.' : 'Sample: entry was early; no confirmation on the 1m.', mode: 'live', created: t0.getTime() });
        price += (rnd() - .48) * 60;
      }
      const k = dayKey(d); if (rnd() < .7) store.put('days', { id: k, sample: true, plan: { bias: rnd() < .6 ? 'bull' : 'bear', levels: 'Sample levels: PDH, PDL, NY midnight open', focus: 'Wait for displacement' }, review: rnd() < .8 ? { text: 'Sample review: patient on the first trade, rushed the second.', mood: 3 + Math.floor(rnd() * 2), rating: 2 + Math.floor(rnd() * 3), plan: rnd() < .7 } : null, study: Math.floor(rnd() * 50) });
    }
    d = addDays(d, 1);
  }
  store.put('payouts', { id: 'sample-p1', sample: true, account: acc.id, amount: 1250, d: dayKey(addDays(today, -12)), status: 'paid', note: 'Sample payout' });
}
function clearSample() { for (const c of COLLS) for (const o of Object.values(store.s[c])) if (o.sample) store.del(c, o.id) }

function AISettings() {
  const [k, setK] = useState(aiKey()); const [m, setM] = useState(LS.get('compound.aimodel', '')); const [show, setShow] = useState(false); const [st, setSt] = useState('');
  const test = async () => { LS.set('compound.aikey', k.trim()); setSt('Testing…'); try { const r = await store.caps.sample('Reply with exactly: ready', { modelTier: 'quick' }); setSt('Working. The coach is ready.'); } catch (e) { setSt(e.message || 'That key did not work.') } };
  return html`<div class="col" style=${{ gap: '14px' }}>
    <p class="mut" style=${{ margin: 0, fontSize: '12px' }}>Outside Claude, the coach calls Claude through your own Anthropic API key. Create one at console.anthropic.com → API keys. It is stored only on this device and sent only to Anthropic. Usage is billed to your API account.</p>
    <${Field} label="Anthropic API key"><div class="row" style=${{ flexWrap: 'nowrap' }}><input id="ai-key" class="in mono" type=${show ? 'text' : 'password'} placeholder="sk-ant-…" value=${k} onInput=${e => setK(e.target.value)} autocomplete="off"/><button class="btn btn-g sm" onClick=${() => setShow(!show)}>${show ? 'Hide' : 'Show'}</button></div><//>
    <${Field} label="Model" hint="Deep think in the coach always uses Opus."><select class="sel" value=${m} onChange=${e => { setM(e.target.value); LS.set('compound.aimodel', e.target.value) }}><option value="">Automatic (Sonnet, Opus for deep work)</option><option value="claude-sonnet-5-5">Claude Sonnet 5.5</option><option value="claude-opus-5-5">Claude Opus 5.5</option><option value="claude-haiku-5-5">Claude Haiku 5.5 (fastest, cheapest)</option></select><//>
    <div class="row"><button class="btn btn-w" onClick=${test}>Save & test</button>${k && html`<button class="btn btn-t" onClick=${() => { LS.del('compound.aikey'); setK(''); setSt('Key removed from this device.') }}>Remove key</button>`}<span class="mut" style=${{ fontSize: '11.5px' }}>${st}</span></div></div>`;
}

/* delete a prop account: optionally with its trades; keeps copy-trade groups consistent */
function deleteAccount(S, id, withTrades) {
  const mine = Object.values(S.trades).filter(t => t.account === id);
  if (withTrades) {
    for (const t of mine) {
      if (t.group && t.lead) { const next = Object.values(S.trades).find(x => x.group === t.group && x.id !== t.id && x.account !== id); if (next) store.put('trades', { ...next, lead: true, role: 'main', copyOf: undefined }) }
      store.del('trades', t.id);
    }
    for (const g of new Set(mine.map(t => t.group).filter(Boolean))) { const left = Object.values(store.s.trades).filter(x => x.group === g); if (left.length === 1) store.put('trades', { ...left[0], group: undefined, lead: true, role: undefined, copyOf: undefined }) }
    Object.values(S.payouts).filter(p => p.account === id).forEach(p => store.del('payouts', p.id));
  } else mine.forEach(t => store.put('trades', { ...t, account: '' }));
  Object.values(S.adjust).filter(x => x.account === id).forEach(x => store.del('adjust', x.id));
  if (S.settings.copySet?.main === id || (S.settings.copySet?.copies || []).includes(id)) store.setSettings({ copySet: { ...S.settings.copySet, main: S.settings.copySet.main === id ? '' : S.settings.copySet.main, copies: (S.settings.copySet.copies || []).filter(c => c !== id) } });
  store.del('accounts', id);
  try { const v = LS.get('compound.accts', []); if (Array.isArray(v) && v.includes(id)) { LS.set('compound.accts', v.filter(x => x !== id)); store.emit() } } catch (e) { }
}
function DeleteAccount({ id, after, onClose }) {
  const S = store.s; const a = S.accounts[id]; const [mode, setMode] = useState('keep'); const [txt, setTxt] = useState('');
  if (!a) return null;
  const n = Object.values(S.trades).filter(t => t.account === id).length; const np = Object.values(S.payouts).filter(p => p.account === id).length;
  const ok = mode === 'keep' || txt.trim().toUpperCase() === 'DELETE';
  return html`<${Modal} title="Delete account" icon=${html`<${I} n="trash"/>`} onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-d" disabled=${!ok} onClick=${() => { deleteAccount(store.s, id, mode === 'all'); toast(mode === 'all' ? `Deleted ${a.label} and ${n} trades` : `Deleted ${a.label}. Its trades are kept.`); onClose(); after && after() }}><${I} n="trash"/>Delete account</button>`}>
    <div class="row" style=${{ gap: '12px', flexWrap: 'nowrap' }}><${FirmLogo} id=${a.firm} s=${42}/><div><b style=${{ fontSize: '14px' }}>${a.label}</b><div class="mut" style=${{ fontSize: '11.5px' }}>${firmById(a.firm).name} · $${(+a.size || 0).toLocaleString()} · ${n} trades${np ? ' · ' + np + ' payouts' : ''}</div></div></div>
    <div class="col" style=${{ gap: '8px' }}>
      <button class=${'copytog' + (mode === 'keep' ? ' on' : '')} onClick=${() => setMode('keep')}><span class="sw"><i></i></span><span style=${{ flex: 1, textAlign: 'left' }}><b>Delete the account, keep its trades</b><span class="mut" style=${{ display: 'block', fontSize: '10.5px' }}>Trades stay in your journal and stats with no account. Payouts are kept.</span></span></button>
      <button class=${'copytog' + (mode === 'all' ? ' on' : '')} style=${mode === 'all' ? { borderColor: 'var(--neg)', background: 'var(--negs)', boxShadow: '0 0 0 3px var(--negs)' } : null} onClick=${() => setMode('all')}><span class="sw" style=${mode === 'all' ? { background: 'var(--neg)' } : null}><i></i></span><span style=${{ flex: 1, textAlign: 'left' }}><b>Delete the account and everything in it</b><span class="mut" style=${{ display: 'block', fontSize: '10.5px' }}>Removes its ${n} trades${np ? ' and ' + np + ' payouts' : ''} from every stat. Copy trades on other accounts are kept.</span></span></button>
    </div>
    ${mode === 'all' && html`<${Field} label="Type DELETE to confirm"><input id="del-confirm" class="in mono" value=${txt} onInput=${e => setTxt(e.target.value)} placeholder="DELETE" autocomplete="off"/><//>`}
    <p class="dim" style=${{ margin: 0, fontSize: '11px' }}>Not finished with it? Use Mark blown or Closed instead to move it to the archive and keep its history.</p>
  <//>`;
}

/* ================= Compound · Dashboard, Journal, Showcase, Strategy ================= */
const RANGES = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time']];
function inRange(t, r) { const d = new Date(t.t); const now = new Date(); if (r === 'today') return dayKey(d) === todayKey(); if (r === 'week') return d >= weekStart(now); if (r === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); if (r === 'year') return d.getFullYear() === now.getFullYear(); return true }

function PageHead({ title, sub, children }) { return html`<div class="ph"><div><h1>${title}</h1>${sub && html`<div class="sub">${sub}</div>`}</div><div class="act">${children}</div></div>` }
function Kpi({ k, v, s, c, info, small }) { return html`<div class=${'card kpi' + (small ? ' sm' : '')}><div class="k">${k}${info && html`<span class="info" title=${info}>i</span>`}</div><div class=${'v ' + (c || '')}>${v}</div>${s != null && html`<div class="s">${s}</div>`}</div>` }
function Empty({ icon = 'book', title, body, children }) { return html`<div class="empty"><div class="ico"><${I} n=${icon}/></div><h4>${title}</h4>${body && html`<p>${body}</p>`}${children && html`<div class="row">${children}</div>`}</div>` }

/* ---------------- Dashboard ---------------- */
function Dashboard({ C }) {
  const { S, D } = C; const [range, setRange] = useState(LS.get('compound.range', 'all')); const [rm, setRm] = useState(false);
  const ts = useMemo(() => D.ts.filter(t => inRange(t, range)), [D, range]);
  const s = useMemo(() => stats(ts), [ts]); const all = useMemo(() => stats(D.ts), [D]);
  const series = useMemo(() => equitySeries(D.ts), [D]);
  const sc = useMemo(() => scoreOf(D.ts, S.days), [D, S.days]);
  const today = S.days[todayKey()];
  const wk = useMemo(() => { const ws = weekStart(new Date()); return [0, 1, 2, 3, 4].map(i => { const k = dayKey(addDays(ws, i)); const dt = D.ts.filter(t => dayKey(t.t) === k); return { l: DOW[i][0], k, v: sum(dt, t => t.pnl), n: dt.length, sub: dt.length + ' trades' } }) }, [D]);
  const wkS = stats(D.ts.filter(t => new Date(t.t) >= weekStart(new Date())));
  const setR = r => { setRange(r); LS.set('compound.range', r); setRm(false) };
  const noTrades = !Object.keys(S.trades).length;
  return html`<div class="page">
    <${PageHead} title="Dashboard" sub=${fmtLong(new Date()) + ' · ' + scopeLabel(S, C.F)}><button class="btn btn-t sm" onClick=${() => UI.open('settings')}><${I} n="gear"/>Settings</button><//>
    ${noTrades && html`<div class="card" style=${{ padding: '22px 24px', background: 'radial-gradient(120% 160% at 0% 0%,var(--accs),transparent 55%),var(--card)' }}>
      <h3 style=${{ fontSize: '16.5px' }}>Log your first trade</h3><div class="mut" style=${{ marginTop: '4px' }}>Your numbers, calendar, score and coach fill in from your trades. Start with one.</div>
      <div class="row" style=${{ marginTop: '16px' }}><button class="btn btn-w" onClick=${() => UI.open('trade')}>Log a trade</button><button class="btn btn-g" onClick=${() => UI.open('import')}>Import trades</button><button class="btn btn-g" onClick=${() => UI.open('account')}>Add prop account</button><button class="btn btn-t" onClick=${() => { loadSample(); toast('Sample data loaded. Remove it any time in Settings → Data.') }}>Preview with sample data</button></div></div>`}
    <div class="hero"><div class="glow"></div>
      <div class="dd lbl" style=${{ justifyContent: 'center', display: 'flex' }} onClick=${() => setRm(!rm)}>Total P&L · ${RANGES.find(r => r[0] === range)[1]}<${I} n="down" s=${12}/>
        <${Menu} open=${rm} onClose=${() => setRm(false)} style=${{ top: '22px', left: '50%', transform: 'translateX(-50%)' }}>${RANGES.map(([k, l]) => html`<button key=${k} class=${range === k ? 'on' : ''} onClick=${e => { e.stopPropagation(); setR(k) }}>${l}</button>`)}<//></div>
      <div class=${'big ' + (s.net < 0 ? 'neg' : '')} style=${{ marginTop: '14px' }}><${CountUp} v=${s.net} fmt=${v => money(v, { dec: 0 })}/></div>
      <div class="meta"><span class="mut tn" style=${{ fontWeight: 600 }}>${s.w}W / ${s.l}L${s.be ? ' / ' + s.be + 'BE' : ''}</span>
        ${today?.plan ? html`<button class="chip on" onClick=${() => UI.open('plan', { day: todayKey() })}><${I} n="check" s=${12}/>Plan set${today.plan.bias ? ' · ' + ({ bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral', wait: 'Waiting' })[today.plan.bias] : ''}</button>` : html`<button class="lnk" style=${{ fontSize: '12.5px' }} onClick=${() => UI.open('plan', { day: todayKey() })}>Start pre-market plan →</button>`}</div></div>

    <div class="row"><span class="lbl">Performance</span><span class="sp"></span><button class="lnk" onClick=${() => C.go('analytics')}>Full analytics →</button><button class="btn btn-t xs" onClick=${C.toggleHide}><${I} n=${UIS.hide ? 'eye' : 'eyeoff'} s=${14}/>${UIS.hide ? 'Show' : 'Hide'} P&L</button></div>
    <div class="grid g4 keep2">
      <${Kpi} k="Win rate" v=${pct(s.wr)} s=${s.n + ' trades'} info="Wins ÷ (wins + losses)"/>
      <${Kpi} k="Avg win R" v=${s.avgWR != null ? s.avgWR.toFixed(2) + 'R' : '—'} s=${'Profit factor ' + (s.pf === Infinity ? '∞' : s.pf.toFixed(2))} info="Average R multiple on winning trades. Needs a stop on the trade."/>
      <${Kpi} k="Avg win / loss" v=${money(s.avgW, { dec: 0 })} s=${'Avg loss: ' + money(-s.avgL, { dec: 0 })}/>
      <${Kpi} k="Expectancy" v=${s.expR != null ? rfmt(s.expR) : money(s.exp, { sign: true, dec: 0 })} c=${cls(s.exp)} s=${money(s.exp, { sign: true, dec: 0 }) + ' per trade'} info="What one average trade is worth"/>
    </div>

    <div class="grid dashrow">
      <div class="card"><div class="ch"><span class="lbl">Cumulative P&L</span><span class="dim" style=${{ fontSize: '10.5px' }}>All time</span><span class="sp"></span><b class=${'tn ' + cls(all.net)}>${money(all.net, { sign: true, dec: 0 })}</b></div>
        ${series.length ? html`<${EquityChart} series=${series} h=${230}/>` : html`<div class="dim" style=${{ height: '230px', display: 'grid', placeItems: 'center' }}>Your equity curve draws itself here.</div>`}</div>
      <div class="card"><div class="ch"><span class="lbl">This week</span><span class="sp"></span><span class="dim" style=${{ fontSize: '10.5px' }}>${fmtDate(weekStart(new Date()))} to today</span></div>
        <div style=${{ fontSize: '24.5px', fontWeight: 800, letterSpacing: '-.03em' }} class=${'tn ' + cls(wkS.net)}>${wkS.n ? money(wkS.net, { sign: true, dec: 0 }) : '—'}</div>
        <div class="kv" style=${{ marginTop: '10px' }}><span>Trades</span><b>${wkS.n || '—'}</b></div><div class="kv" style=${{ marginTop: '6px' }}><span>Win rate</span><b>${wkS.n ? pct(wkS.wr, 0) : '—'}</b></div>
        <div style=${{ marginTop: '14px' }}><${Bars} data=${wk} h=${140} onPick=${d => C.go('journal', { day: d.k })}/></div></div>
      <div class="card" style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><div class="ch" style=${{ width: '100%' }}><span class="lbl">Compound score</span><span class="sp"></span><span style=${{ fontSize: '23px', fontWeight: 900, letterSpacing: '-.04em' }}>${sc.total}<span class="dim" style=${{ fontSize: '11.5px', fontWeight: 500 }}>/100</span></span></div>
        <div style=${{ display: 'grid', placeItems: 'center' }}><${Radar} spokes=${sc.spokes} size=${232}/></div><div class="dim" style=${{ fontSize: '10.5px', textAlign: 'center', marginTop: '4px' }}>${D.ts.length < 10 ? 'Gets reliable after ~20 trades' : 'Win rate · profit factor · expectancy · journaling · discipline'}</div></div>
    </div>

    <div class="grid g2">
      <div class="card"><${MonthCal} C=${C}/></div>
      <${PsychCard} C=${C}/>
    </div>

    <div class="card" style=${{ padding: '6px 0 0' }}><div class="ch" style=${{ padding: '12px 20px 0' }}><span class="lbl">Recent trades</span><span class="sp"></span><button class="lnk" onClick=${() => C.go('journal')}>Journal →</button></div>
      ${D.ts.length ? html`<${TradeTable} ts=${D.ts.slice(0, 8)} S=${S}/>` : html`<div class="dim" style=${{ padding: '20px' }}>Nothing logged yet.</div>`}</div>
  </div>`;
}

function MonthCal({ C, compact }) {
  const { S, D } = C; const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) });
  const days = useMemo(() => byDay(D.ts), [D]);
  const first = (m.getDay() + 6) % 7; const n = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = []; for (let i = 0; i < first; i++) cells.push(null); for (let i = 1; i <= n; i++) cells.push(new Date(m.getFullYear(), m.getMonth(), i));
  while (cells.length % 7) cells.push(null);
  const mo = Object.entries(days).filter(([k]) => k.startsWith(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`)); const mNet = sum(mo, x => x[1].pnl);
  const mx = Math.max(1, ...mo.map(x => Math.abs(x[1].pnl)));
  const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return html`<div class="ch"><span class="lbl">P&L calendar</span><span class="sp"></span><button class="ib" onClick=${() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month"><${I} n="left"/></button><b style=${{ minWidth: '92px', textAlign: 'center' }}>${MON[m.getMonth()]} ${m.getFullYear()}</b><button class="ib" onClick=${() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month"><${I} n="right"/></button><b class=${'tn ' + cls(mNet)} style=${{ marginLeft: '8px' }}>${money(mNet, { sign: true, dec: 0 })}</b></div>
    <div class="cal">${DOW.map(d => html`<div class="dh" key=${d}>${d.toUpperCase()}</div>`)}
      ${cells.map((d, i) => { if (!d) return html`<div key=${i}></div>`; const k = dayKey(d); const x = days[k]; const a = x ? .14 + .5 * Math.abs(x.pnl) / mx : 0; const bg = x ? (x.pnl >= 0 ? `color-mix(in srgb,var(--pos) ${a * 100}%,var(--card2))` : `color-mix(in srgb,var(--neg) ${a * 100}%,var(--card2))`) : ''; return html`<button key=${k} class=${'cell' + (k === todayKey() ? ' today' : '')} style=${{ background: bg || undefined, borderColor: x ? 'transparent' : undefined }} onClick=${() => C.go('journal', { day: k })} title=${x ? `${x.n} trades · ${money(x.pnl, { sign: true })}` : ''}><span class="d">${d.getDate()}</span>${x && html`<span class="p">${moneyK(x.pnl, { sign: true })}</span><span class="n">${x.n}t · ${x.n ? Math.round(x.w / x.n * 100) : 0}%</span>`}</button>` })}
    </div>`;
}

function TradeTable({ ts, S, showAcct = true, sel, setSel }) {
  const tog = id => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);
  return html`<div class="scroll-x"><table class="tbl"><thead><tr>${sel && html`<th style=${{ width: '34px' }}><input type="checkbox" class="cbx" aria-label="Select all" checked=${ts.length > 0 && ts.every(t => sel.includes(t.id))} onChange=${e => setSel(e.target.checked ? ts.map(t => t.id) : [])}/></th>`}<th>Date</th><th>Symbol</th><th>Side</th><th class="r">Qty</th><th class="r">Entry</th><th class="r">Exit</th><th>Setup</th><th>Grade</th>${showAcct && html`<th>Account</th>`}<th class="r">R</th><th class="r">P&L</th><th class="tdel"></th></tr></thead>
    <tbody>${ts.map(t => html`<tr key=${t.id} class=${'click' + (sel?.includes(t.id) ? ' selr' : '')} onClick=${() => sel ? tog(t.id) : UI.open('detail', { id: t.id, list: ts.map(x => x.id) })}>${sel && html`<td><input type="checkbox" class="cbx" aria-label="Select trade" checked=${sel.includes(t.id)} onClick=${e => e.stopPropagation()} onChange=${() => tog(t.id)}/></td>`}
      <td><span class="tn">${fmtDate(t.t)}</span> <span class="dim tn">${fmtTime(t.t)}</span></td><td><b>${t.symbol}</b></td><td><${Side} s=${t.side}/></td><td class="r">${t.qty}</td><td class="r">${t.entry || '—'}</td><td class="r">${t.exit || '—'}</td>
      <td class="mut">${(t.setups || []).slice(0, 2).join(', ') || (S.strategies[t.strategy]?.name || '—')}</td><td><${Grade} g=${t.grade}/></td>${showAcct && html`<td class="mut">${S.accounts[t.account]?.label || '—'}</td>`}
      <td class=${'r ' + cls(tR(t))}>${tR(t) != null ? rfmt(tR(t)) : '—'}</td><td class="r" style=${{ fontWeight: 700 }}><${Money} v=${t.pnl}/></td><td class="r tdel"><button class="ib xs" aria-label="Delete trade" title="Delete trade" onClick=${e => { e.stopPropagation(); askDelete([t.id]) }}><${I} n="trash" s=${14}/></button></td></tr>`)}</tbody></table></div>`;
}

function PsychCard({ C }) {
  const r = store.s.report; const can = !!store.caps.sample;
  return html`<div class="glowcard" style=${{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div class="row"><${I} n="brain" c="ai"/><h3 style=${{ margin: 0, fontSize: '13px' }}>Score & psychology</h3><span class="chip ai">AI</span><span class="sp"></span>${r && html`<span class="dim" style=${{ fontSize: '10.5px' }}>${fmtDate(r.at)}</span>`}</div>
    ${r ? html`<div style=${{ fontSize: '15px', fontWeight: 700, lineHeight: 1.35 }}>${r.headline}</div>
      <div class="col" style=${{ gap: '8px' }}>${(r.psych || []).slice(0, 5).map(p => html`<div key=${p.k} style=${{ display: 'grid', gridTemplateColumns: '110px 1fr 34px', gap: '10px', alignItems: 'center', fontSize: '11.5px' }}><span class="mut">${p.k}</span><div class="prog"><i style=${{ width: clamp(p.v) + '%', background: 'var(--ai)' }}></i></div><b class="tn" style=${{ textAlign: 'right' }}>${p.v}</b></div>`)}</div>
      <div class="col" style=${{ gap: '6px' }}>${(r.takeaways || []).slice(0, 3).map((x, i) => html`<div key=${i} class="row" style=${{ gap: '8px', flexWrap: 'nowrap', alignItems: 'flex-start', fontSize: '12px' }}><span class="ai" style=${{ fontWeight: 800 }}>→</span><span>${x}</span></div>`)}</div>
      <div class="row"><button class="btn btn-g sm" onClick=${() => C.go('ai', { tab: 'report' })}>Open full report</button></div>`
    : html`<div class="mut" style=${{ fontSize: '12px' }}>The AI reads your whole journal and turns it into a score, a picture of your head as charts, and the three things to fix next.</div>
      <div class="row"><button class="btn btn-ai sm" disabled=${!can} onClick=${() => C.go('ai', { tab: 'report', run: true })}><${I} n="spark"/>Run my report</button>${!can && html`<span class="dim" style=${{ fontSize: '10.5px' }}>Available when opened in Claude</span>`}</div>`}
  </div>`;
}

/* ---------------- Journal ---------------- */
function useTradeFilter(ts) {
  const [f, setF] = useState({ q: '', side: '', grade: '', strategy: '', setup: '', out: '', from: '', to: '' });
  const out = useMemo(() => ts.filter(t => (!f.q || [t.symbol, t.notes, ...(t.setups || []), ...(t.mistakes || []), t.lessons].join(' ').toLowerCase().includes(f.q.toLowerCase())) && (!f.side || t.side === f.side) && (!f.grade || t.grade === f.grade) && (!f.strategy || t.strategy === f.strategy) && (!f.setup || (t.setups || []).includes(f.setup)) && (!f.out || (f.out === 'w' ? t.pnl > 0 : f.out === 'l' ? t.pnl < 0 : t.pnl === 0)) && (!f.from || dayKey(t.t) >= f.from) && (!f.to || dayKey(t.t) <= f.to)), [ts, f]);
  return [out, f, setF];
}
function FilterBar({ f, setF, S, count, total, view, setView }) {
  const [open, setOpen] = useState(false); const n = ['side', 'grade', 'strategy', 'setup', 'out', 'from', 'to'].filter(k => f[k]).length;
  return html`<div class="bar" style=${{ position: 'relative' }}>
    <button class="btn btn-g sm" onClick=${() => setOpen(!open)}><${I} n="filter"/>Filters${n ? ' · ' + n : ''}<${I} n="down" s=${12}/></button>
    ${n > 0 && html`<button class="btn btn-t xs" onClick=${() => setF({ ...f, side: '', grade: '', strategy: '', setup: '', out: '', from: '', to: '' })}>Clear</button>`}
    ${open && html`<div class="menu" style=${{ top: '50px', left: '10px', width: 'min(520px,calc(100vw - 40px))', padding: '14px' }}>
      <div class="grid g2" style=${{ gap: '12px' }}>
        <${Field} label="Outcome"><${Seg} sm v=${f.out} set=${v => setF({ ...f, out: v })} opts=${[['', 'All'], ['w', 'Wins'], ['l', 'Losses'], ['b', 'BE']]}/><//>
        <${Field} label="Side"><${Seg} sm v=${f.side} set=${v => setF({ ...f, side: v })} opts=${[['', 'All'], ['long', 'Long'], ['short', 'Short']]}/><//>
        <${Field} label="Grade"><select class="sel" value=${f.grade} onChange=${e => setF({ ...f, grade: e.target.value })}><option value="">Any</option>${GRADES.map(g => html`<option>${g}</option>`)}</select><//>
        <${Field} label="Strategy"><select class="sel" value=${f.strategy} onChange=${e => setF({ ...f, strategy: e.target.value })}><option value="">Any</option>${Object.values(S.strategies).map(s => html`<option value=${s.id}>${s.name}</option>`)}</select><//>
        <${Field} label="Setup"><select class="sel" value=${f.setup} onChange=${e => setF({ ...f, setup: e.target.value })}><option value="">Any</option>${S.settings.setups.map(s => html`<option>${s}</option>`)}</select><//>
        <div class="grid g2" style=${{ gap: '6px' }}><${Field} label="From"><input class="in" type="date" value=${f.from} onInput=${e => setF({ ...f, from: e.target.value })}/><//><${Field} label="To"><input class="in" type="date" value=${f.to} onInput=${e => setF({ ...f, to: e.target.value })}/><//></div>
      </div><div class="row" style=${{ marginTop: '12px', justifyContent: 'flex-end' }}><button class="btn btn-w sm" onClick=${() => setOpen(false)}>Done</button></div></div>`}
    <span class="sp"></span>
    <div class="search" style=${{ width: 'min(280px,100%)' }}><${I} n="search"/><input id="tsearch" placeholder="Search symbol, setup, notes…" value=${f.q} onInput=${e => setF({ ...f, q: e.target.value })}/></div>
    <span class="dim tn" style=${{ fontSize: '11px' }}>${count} / ${total}</span>
    ${setView && html`<${Seg} sm v=${view} set=${setView} opts=${[['grid', '', 'grid'], ['list', '', 'list']]}/>`}
  </div>`;
}
function TradeCard({ t, S, onClick, selected, selecting }) {
  const shot = (t.shots || [])[0]; const st = S.strategies[t.strategy];
  return html`<button class=${'tc' + (selected ? ' sel' : '')} onClick=${onClick}>
    ${selecting ? html`<span class=${'tcsel' + (selected ? ' on' : '')}>${selected && html`<${I} n="check" s=${13}/>`}</span>` : html`<span class="tcdel" role="button" tabindex="0" aria-label="Delete trade" title="Delete trade" onClick=${e => { e.stopPropagation(); askDelete([t.id]) }}><${I} n="trash" s=${14}/></span>`}
    <div class="shot">${shot ? html`<img src=${shot.url} alt="" loading="lazy"/>` : html`<div class="ph2"><${MiniLadder} t=${t}/></div>`}
      ${t.pin && html`<span class="pin chip gold"><${I} n="pin" s=${11}/>Pinned</span>`}</div>
    <div class="bd"><div class="row" style=${{ gap: '8px' }}><b>${t.symbol}</b><${Side} s=${t.side}/><${Grade} g=${t.grade}/><span class="sp"></span><span class="dim tn" style=${{ fontSize: '10.5px' }}>${fmtDate(t.t)} · ${fmtTime(t.t)}</span></div>
      <div class="row" style=${{ alignItems: 'baseline' }}><span class=${'pnl tn ' + cls(t.pnl)}>${money(t.pnl, { sign: true })}</span><span class=${'tn ' + cls(tR(t))} style=${{ fontWeight: 600 }}>${tR(t) != null ? rfmt(tR(t)) : ''}</span><span class="sp"></span>${t.group && html`<span class="chip on" title="Copy traded"><${I} n="copy" s=${11}/>×${groupOf(S, t).length}</span>`}${st && html`<span class="chip"><i style=${{ width: '7px', height: '7px', borderRadius: '50%', background: st.color }}></i>${st.name}</span>`}</div>
      ${(t.setups?.length || t.mistakes?.length) ? html`<div class="row" style=${{ gap: '5px' }}>${(t.setups || []).slice(0, 3).map(x => html`<span class="chip" key=${x}>${x}</span>`)}${(t.mistakes || []).slice(0, 2).map(x => html`<span class="chip neg" key=${x}>${x}</span>`)}</div>` : null}
    </div></button>`;
}
/* schematic of a trade's levels when there's no screenshot */
function MiniLadder({ t, h = 120 }) {
  const [ref, W] = useWidth(300);
  const e = num(t.entry), x = num(t.exit), s = num(t.stop), g = num(t.target);
  const lv = [['Target', g, 'var(--pos)'], ['Exit', x, t.pnl >= 0 ? 'var(--pos)' : 'var(--neg)'], ['Entry', e, 'var(--fg)'], ['Stop', s, 'var(--neg)']].filter(l => l[1] != null);
  if (lv.length < 2) return html`<div ref=${ref} class="dim" style=${{ fontFamily: 'var(--mono)', fontSize: '9.5px', letterSpacing: '.12em' }}>${t.symbol} · ${money(t.pnl, { sign: true })}</div>`;
  const vs = lv.map(l => l[1]); const mn = Math.min(...vs), mx = Math.max(...vs), sp = mx - mn || 1;
  const Y = v => 16 + (mx - v) / sp * (h - 32); const x1 = 14, x2 = Math.max(60, W - 118);
  const labs = lv.map(l => ({ n: l[0], v: l[1], c: l[2], y: Y(l[1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
  const shift = Math.max(0, labs[labs.length - 1].y - (h - 6)); labs.forEach(l => l.y -= shift);
  return html`<div ref=${ref} style=${{ width: '100%', height: h + 'px' }}><svg width=${W} height=${h} viewBox=${`0 0 ${W} ${h}`} class="svgc" style=${{ display: 'block', maxWidth: '100%' }}>
    ${e != null && x != null && html`<rect x=${x1 + 24} y=${Math.min(Y(e), Y(x))} width=${x2 - x1 - 48} height=${Math.max(2, Math.abs(Y(e) - Y(x)))} rx="2" fill=${t.pnl >= 0 ? 'var(--poss)' : 'var(--negs)'}/>`}
    ${lv.map(([n, v, c]) => html`<line key=${n} x1=${x1} x2=${x2} y1=${Y(v)} y2=${Y(v)} stroke=${c} stroke-width="1.5" stroke-dasharray=${n === 'Stop' || n === 'Target' ? '4 4' : ''}/>`)}
    ${labs.map(l => html`<text key=${'l' + l.n} x=${x2 + 8} y=${l.y + 3.5} style=${{ fill: l.c }}>${l.n} ${l.v}</text>`)}</svg></div>`;
}

function Journal({ C, params }) {
  const { S, D } = C; const [tab, setTab] = useState(params?.day ? 'daily' : (LS.get('compound.jtab', 'trades')));
  const [view, setView] = useState(LS.get('compound.jview', 'grid'));
  const [ts, f, setF] = useTradeFilter(D.ts); const s = stats(ts);
  const [planReq, setPlanReq] = useState(0);
  const [sel, setSel] = useState(null); const selTog = id => setSel(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);
  useEffect(() => { if (params?.day) setTab('daily') }, [params]);
  return html`<div class="page">
    <${PageHead} title="Trade journal" sub=${D.ts.length + ' trades logged · ' + scopeLabel(S, C.F)}>
      <${Seg} v=${tab} set=${v => { setTab(v); LS.set('compound.jtab', v) }} opts=${[['trades', 'Trades', 'book'], ['daily', 'Daily', 'cal'], ['weekly', 'Weekly', 'cal']]}/>
      ${tab === 'daily' ? html`<button class="btn btn-g" onClick=${() => UI.open('trade')}><${I} n="plus"/>Log trade</button><button class="btn btn-w" onClick=${() => setPlanReq(n => n + 1)}><${I} n="check"/>${S.days[todayKey()]?.plan ? 'Edit today' : 'Plan today'}</button>`
        : html`<button class="btn btn-g" onClick=${() => UI.open('quick')}><${I} n="bolt"/>Quick log</button><button class="btn btn-w" onClick=${() => UI.open('trade')}><${I} n="plus"/>Log trade</button>`}
    <//>
    ${tab === 'trades' && html`
      <div class="row"><span class="lbl">Performance</span><span class="sp"></span><button class="btn btn-t xs" onClick=${() => UI.open('import')}><${I} n="upload" s=${14}/>Import</button><button class="btn btn-t xs" onClick=${C.toggleHide}><${I} n=${UIS.hide ? 'eye' : 'eyeoff'} s=${14}/>${UIS.hide ? 'Show' : 'Hide'} P&L</button></div>
      <div class="grid gk">
        <${Kpi} k="Total P&L" v=${html`<span class=${s.net < 0 ? 'neg' : 'acc'}>${money(s.net, { dec: 2 })}</span>`} s=${`${s.w}W / ${s.l}L`}/>
        <${Kpi} k="Win rate" v=${pct(s.wr)} s=${s.n + ' total trades'}/>
        <${Kpi} k="Avg win R" v=${s.avgWR != null ? s.avgWR.toFixed(2) + 'R' : '0.00R'} s=${'Profit factor ' + (s.pf === Infinity ? '∞' : s.pf.toFixed(2))}/>
        <${Kpi} k="Avg win / loss" v=${money(s.avgW, { dec: 2 })} s=${'Avg loss: ' + money(-s.avgL, { dec: 2 })}/>
      </div>
      <${FilterBar} f=${f} setF=${setF} S=${S} count=${ts.length} total=${D.ts.length} view=${view} setView=${v => { setView(v); LS.set('compound.jview', v) }}/>
      ${ts.length > 0 && html`<div class=${'row selbar' + (sel ? ' on' : '')}>${sel ? html`<b class="tn">${sel.length} selected</b><button class="btn btn-t xs" onClick=${() => setSel(ts.map(t => t.id))}>Select all ${ts.length}</button><span class="sp"></span><button class="btn btn-g sm" onClick=${() => setSel(null)}>Cancel</button><button class="btn btn-d sm" disabled=${!sel.length} onClick=${() => askDelete(sel, () => setSel(null))}><${I} n="trash"/>Delete${sel.length ? ' ' + sel.length : ''}</button>`
        : html`<span class="sp"></span><button class="btn btn-t xs" onClick=${() => setSel([])}><${I} n="check" s=${13}/>Select trades</button>`}</div>`}
      ${!ts.length ? html`<${Empty} title=${D.ts.length ? 'No trades match' : 'No trades yet'} body=${D.ts.length ? 'Loosen the filters to see more.' : 'Log one by hand, or bring your history in from your broker.'}>${!D.ts.length && html`<button class="btn btn-w" onClick=${() => UI.open('trade')}>Log a trade</button><button class="btn btn-t" onClick=${() => UI.open('import')}>Import trades</button>`}<//>`
        : view === 'grid' ? html`<div class="tgrid">${ts.map(t => html`<${TradeCard} key=${t.id} t=${t} S=${S} selecting=${!!sel} selected=${sel?.includes(t.id)} onClick=${() => sel ? selTog(t.id) : UI.open('detail', { id: t.id, list: ts.map(x => x.id) })}/>`)}</div>`
        : html`<div class="card" style=${{ padding: 0 }}><${TradeTable} ts=${ts} S=${S} sel=${sel} setSel=${setSel}/></div>`}`}
    ${tab === 'daily' && html`<${DailyView} C=${C} focus=${params?.day} planReq=${planReq}/>`}
    ${tab === 'weekly' && html`<${WeeklyView} C=${C}/>`}
  </div>`;
}

function WeeklyView({ C }) {
  const { S, D } = C;
  const wks = useMemo(() => { const m = {}; for (const t of D.ts) { const k = dayKey(weekStart(t.t)); (m[k] ||= []).push(t) } m[dayKey(weekStart(new Date()))] ||= []; return Object.entries(m).sort((a, b) => b[0] < a[0] ? -1 : 1) }, [D]);
  return html`<div class="col" style=${{ gap: '12px' }}>${wks.slice(0, 40).map(([k, ts]) => { const s = stats(ts); const ws = parseDay(k); const bars = [0, 1, 2, 3, 4].map(i => { const dk = dayKey(addDays(ws, i)); const dt = ts.filter(t => dayKey(t.t) === dk); return { l: DOW[i], v: sum(dt, t => t.pnl), k: dk } }); const rv = S.days['w-' + k];
    return html`<div class="card" key=${k}><div class="ch"><h3>Week of ${fmtDate(ws)}</h3><span class="sub">${fmtDate(ws)} – ${fmtDate(addDays(ws, 4))}</span><span class="sp"></span><span class=${'tn ' + cls(s.net)} style=${{ fontSize: '19.5px', fontWeight: 800 }}>${s.n ? money(s.net, { sign: true, dec: 0 }) : '—'}</span></div>
      <div class="grid wk">
        <${Bars} data=${bars} h=${150} onPick=${d => C.go('journal', { day: d.k })}/>
        <div class="col" style=${{ gap: '8px' }}>
          <div class="grid g4 keep2" style=${{ gap: '8px' }}><div><div class="lbl">Trades</div><b>${s.n}</b></div><div><div class="lbl">Win</div><b>${pct(s.wr, 0)}</b></div><div><div class="lbl">PF</div><b>${s.pf === Infinity ? '∞' : s.pf.toFixed(2)}</b></div><div><div class="lbl">Exp</div><b>${s.expR != null ? rfmt(s.expR) : money(s.exp, { dec: 0 })}</b></div></div>
          <textarea class="ta" rows="3" placeholder="Weekly review: what worked, what to cut, focus for next week" value=${rv?.text || ''} onInput=${e => store.put('days', { id: 'w-' + k, week: true, text: e.target.value }, 900)}></textarea>
          <div class="row"><${AskBtn} label="AI weekly recap" q=${`Give me a weekly recap for the week starting ${k}. Use my trades from that week. Grade the week, name the biggest leak with numbers, and set one measurable goal for next week.`} C=${C}/></div>
        </div></div></div>` })}</div>`;
}

/* ---------------- Trade detail ---------------- */
function TradeDetail({ id, list, onClose }) {
  const S = useStore(); const [cur, setCur] = useState(id); const [lb, setLb] = useState(null); const [ai, setAi] = useState(false); const [pa, setPa] = useState(LS.get('compound.pa', 'replay')); const [tsym, setTsym] = useState(() => tvSymFor(S.trades[id]?.symbol || 'MNQ'));
  list = list || [cur];
  const raw = S.trades[cur];
  const i = list.indexOf(cur); const nav = d => { const n = list[i + d]; n && setCur(n) };
  useEffect(() => { const k = e => { if (e.target.closest && e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight' || e.key === 'j') nav(1); if (e.key === 'ArrowLeft' || e.key === 'k') nav(-1) }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) });
  const bars = useChartFor(raw, S);
  if (!raw) return html`<${Drawer} onClose=${onClose}><div class="mb"><${Empty} title="Trade deleted"/></div><//>`;
  const c = tradeCalc(raw, S.settings); const t = { ...raw, ...c }; const r = tR(t); const st = S.strategies[t.strategy]; const acc = S.accounts[t.account];
  const review = async () => {
    const smp = store.caps.sample; if (!smp) return toast('AI works when Compound is opened inside Claude'); setAi(true);
    try {
      const imgs = []; for (const s of (t.shots || []).slice(0, 2)) { try { const b = await (await fetch(s.url)).blob(); imgs.push(b) } catch (e) { } }
      const prompt = `You are a strict but supportive futures trading coach (ICT/SMC literate). Review this one trade. Be specific, short, and practical. Format: **Verdict** (one line), **What was right**, **What to fix** (bullets), **Rule to add** (one line).\n\nTrade:\n${tradeLine(t, S)}\nNotes: ${t.notes || '—'}\nLesson written: ${t.lessons || '—'}\n${st ? `Strategy "${st.name}": entry rules: ${(st.entry || []).join('; ')}; invalidation: ${st.invalid}; min R:R ${st.minRR}` : 'No strategy tagged.'}\n${imgs.length ? 'Chart screenshots attached.' : 'No screenshots.'}`;
      let res; try { res = await smp(prompt, { images: imgs.length ? imgs : undefined, modelTier: 'default' }) } catch (e) { if (imgs.length) res = await smp(prompt, { modelTier: 'default' }); else throw e }
      store.patch('trades', t.id, { ai: { text: res.text, at: Date.now() } });
    } catch (e) { toast(e?.code === 'rate_limited' ? 'AI is busy. Try again in a minute.' : 'AI review did not run') }
    setAi(false);
  };
  return html`<${Drawer} onClose=${onClose} head=${html`<div class="row" style=${{ gap: '10px' }}><button class="ib" disabled=${i <= 0} onClick=${() => nav(-1)} aria-label="Previous trade"><${I} n="left"/></button><button class="ib" disabled=${i < 0 || i >= list.length - 1} onClick=${() => nav(1)} aria-label="Next trade"><${I} n="right"/></button>
      <b style=${{ fontSize: '16px' }}>${t.symbol}</b><${Side} s=${t.side}/><${Grade} g=${t.grade}/><span class="mut hide-m" style=${{ fontSize: '11.5px' }}>${fmtLong(t.t)} · ${fmtTime(t.t)}</span></div>`}>
    <div class="mb" style=${{ gap: '18px' }}>
      <div class="row" style=${{ alignItems: 'flex-end', gap: '18px' }}>
        <div><div class="lbl">Net P&L</div><div class=${'tn ' + cls(t.pnl)} style=${{ fontSize: '35px', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.05 }}>${money(t.pnl, { sign: true })}</div></div>
        <div><div class="lbl">R</div><div class=${'tn ' + cls(r)} style=${{ fontSize: '23px', fontWeight: 800 }}>${r != null ? rfmt(r) : '—'}</div></div>
        <span class="sp"></span>
        <button class=${'btn sm ' + (t.pin ? 'btn-a' : 'btn-g')} onClick=${() => store.patch('trades', t.id, { pin: !t.pin })}><${I} n="pin"/>${t.pin ? 'Pinned' : 'Pin'}</button>
        <button class="btn btn-g sm" onClick=${() => UI.open('trade', { id: t.id })}><${I} n="edit"/>Edit</button><button class="btn btn-g sm dangerh" onClick=${() => askDelete([t.id], onClose)} aria-label="Delete trade"><${I} n="trash"/><span class="hide-m">Delete</span></button>
        <button class="btn btn-ai sm" onClick=${review} disabled=${ai}><${I} n="spark"/>${ai ? 'Reviewing…' : 'AI review'}</button>
      </div>
      <div class="card" style=${{ padding: '14px' }}><div class="ch"><span class="lbl">Price action</span>${LIVE_OK && html`<${Seg} sm v=${pa} set=${v => { setPa(v); LS.set('compound.pa', v) }} opts=${[['replay', 'Replay'], ['live', 'Live']]}/>`}<span class="sp"></span><a class="btn btn-t xs" href=${tvURL(t.symbol)} target="_blank" rel="noopener"><${I} n="ext" s=${13}/>Open ${t.symbol} in TradingView</a>${t.tv && html`<a class="btn btn-t xs" href=${t.tv} target="_blank" rel="noopener"><${I} n="link" s=${13}/>Snapshot</a>`}</div>
        ${pa === 'live' && LIVE_OK ? html`<div class="row" style=${{ marginBottom: '8px' }}><${TVSymPicker} sym=${tsym} setSym=${setTsym} fam=${instr(t.symbol).fam}/></div><${TVLive} symbol=${tsym} interval="1" h=${460}/><div class="dim" style=${{ fontSize: '10.5px', marginTop: '6px' }}>Live chart. Scroll back to ${fmtDate(t.t)} ${fmtTime(t.t)} to see this entry. The Replay tab marks it on the candles automatically.</div>`
        : bars ? html`<${PriceChart} bars=${bars.bars} trades=${[t]} focus=${t} h=${340}/>` : html`<div style=${{ height: '170px' }}><${MiniLadder} t=${t} h=${170}/></div><div class="dim" style=${{ fontSize: '11px', marginTop: '8px' }}>Import ${instr(t.symbol).fam} bars on the Chart page (TradingView → Export chart data) and this trade plots on real candles.</div>`}
      </div>
      ${(t.shots || []).length > 0 && html`<div class="shots" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>${t.shots.map(s => html`<div class="s" key=${s.id}><img src=${s.url} alt="Trade screenshot" onClick=${() => setLb(s.url)}/></div>`)}</div>`}
      <div class="grid g6 keep2" style=${{ gap: '8px' }}>${[['Entry', t.entry || '—'], ['Exit', t.exit || '—'], ['Stop', t.stop || '—'], ['Target', t.target || '—'], [t.unit === 'lot' ? 'Lots' : 'Contracts', t.qty], [t.unit === 'lot' ? 'Points · pips' : 'Points', t.pts != null ? (t.pts > 0 ? '+' : '') + t.pts.toFixed(2) + (t.unit === 'lot' ? ' · ' + (t.pts / (num(t.pip) || 1)).toFixed(1) : '') : '—'], ['Risk', t.risk ? money(t.risk) : '—'], ['Planned R:R', t.rr ? '1:' + t.rr.toFixed(2) : '—'], ['Hold', fmtDur(holdMin(t))], ['Session', sessionOf(t)], ['Fees', money(t.fees, { dec: 2 })], ['MAE / MFE', (t.mae || '—') + ' / ' + (t.mfe || '—')]].map(([k, v]) => html`<div class="card tight" key=${k}><div class="lbl">${k}</div><div class="tn" style=${{ fontWeight: 700, marginTop: '4px' }}>${v}</div></div>`)}</div>
      <div class="grid g2">
        <div class="col" style=${{ gap: '12px' }}>
          ${t.notes && html`<div><div class="lbl" style=${{ marginBottom: '6px' }}>Notes</div><div class="mdtx">${t.notes}</div></div>`}
          ${t.lessons && html`<div class="card tight" style=${{ borderColor: 'var(--accg)' }}><div class="lbl">Lesson</div><div style=${{ marginTop: '4px', fontWeight: 600 }}>${t.lessons}</div></div>`}
          <div class="row" style=${{ gap: '6px' }}>${(t.setups || []).map(x => html`<span class="chip" key=${x}>${x}</span>`)}${(t.mistakes || []).map(x => html`<span class="chip neg" key=${x}>${x}</span>`)}${t.rules === true && html`<span class="chip pos">Rules kept</span>`}${t.rules === false && html`<span class="chip neg">Rule broken</span>`}</div>
          <div class="row" style=${{ gap: '6px' }}>${(t.emoBefore || []).map(x => html`<span class="chip" key=${'b' + x}>Before: ${x}</span>`)}${(t.emoAfter || []).map(x => html`<span class="chip" key=${'a' + x}>After: ${x}</span>`)}</div>
          ${t.group ? html`<${CopyGroupCard} S=${S} t=${t}/>` : html`<div class="mut" style=${{ fontSize: '11.5px' }}>${acc ? html`<span class="row" style=${{ gap: '8px' }}><${FirmLogo} id=${acc.firm} s=${22}/>${acc.label}</span>` : 'No account'}</div>`}
        </div>
        <div class="col" style=${{ gap: '12px' }}>
          ${st && html`<div class="card tight"><div class="row"><i style=${{ width: '9px', height: '9px', borderRadius: '50%', background: st.color }}></i><b>${st.name}</b><span class="sp"></span><span class="dim" style=${{ fontSize: '10.5px' }}>min ${st.minRR}R</span></div>
            ${(st.entry || []).length > 0 && html`<div class="col" style=${{ gap: '2px', marginTop: '8px' }}>${st.entry.map((e, j) => { const ok = (t.ruleChecks || {})[j]; return html`<button key=${j} class=${'chk' + (ok ? ' on' : '')} onClick=${() => store.patch('trades', t.id, { ruleChecks: { ...(t.ruleChecks || {}), [j]: !ok } })}><span class="bx">${ok && html`<${I} n="check" w=${3}/>`}</span><span>${e}</span></button>` })}</div>`}
            ${t.rr && st.minRR && t.rr < +st.minRR && html`<div class="chip neg" style=${{ marginTop: '8px' }}>Planned R:R ${t.rr.toFixed(2)} is under this strategy's ${st.minRR}</div>`}</div>`}
          ${t.ai && html`<div class="glowcard" style=${{ padding: '14px 16px' }}><div class="row"><${I} n="spark" c="ai"/><b>Coach review</b><span class="sp"></span><span class="dim" style=${{ fontSize: '10.5px' }}>${fmtDate(t.ai.at)}</span></div><div class="msg a" style=${{ marginTop: '8px' }}><div class="tx" dangerouslySetInnerHTML=${{ __html: mdLite(t.ai.text) }}></div></div></div>`}
        </div>
      </div>
    </div>${lb && html`<${Lightbox} src=${lb} onClose=${() => setLb(null)}/>`}<//>`;
}
function tradeLine(t, S) { const c = tradeCalc(t, S.settings); const r = c.risk ? (c.pnl / c.risk).toFixed(2) + 'R' : 'n/a'; return `${t.t?.replace('T', ' ')} | ${t.symbol} ${t.side} x${t.qty} | entry ${t.entry || '?'} exit ${t.exit || '?'} stop ${t.stop || '?'} target ${t.target || '?'} | P&L ${c.pnl} | ${r} | hold ${fmtDur(holdMin(t))} | session ${sessionOf(t)} | grade ${t.grade || '-'} | strategy ${S.strategies[t.strategy]?.name || '-'} | setups ${(t.setups || []).join('/') || '-'} | mistakes ${(t.mistakes || []).join('/') || '-'} | rules ${t.rules === true ? 'kept' : t.rules === false ? 'broken' : '?'} | feel before ${(t.emoBefore || []).join('/') || '-'} after ${(t.emoAfter || []).join('/') || '-'} | acct ${S.accounts[t.account]?.label || '-'}` }

/* ---------------- Showcase ---------------- */
function Showcase({ C }) {
  const { S, D } = C; const [ts, f, setF] = useTradeFilter(D.ts.filter(t => t.pin || t.grade === 'A+' || t.show)); const [pick, setPick] = useState(false);
  const pinned = D.ts.filter(t => t.pin).slice(0, 3);
  return html`<div class="page">
    <${PageHead} title="Showcase" sub="Your best setups, kept here to study."><span class="pill"><b>${ts.length}</b> added</span><button class="btn btn-w" onClick=${() => setPick(true)}><${I} n="plus"/>Add trade</button><//>
    ${pinned.length > 0 && html`<div><div class="lbl" style=${{ marginBottom: '10px' }}>Pinned · ${pinned.length}/3</div><div class="grid g3">${pinned.map(t => html`<${TradeCard} key=${t.id} t=${t} S=${S} onClick=${() => UI.open('detail', { id: t.id, list: pinned.map(x => x.id) })}/>`)}</div></div>`}
    <${FilterBar} f=${f} setF=${setF} S=${S} count=${ts.length} total=${ts.length}/>
    ${ts.length ? html`<div class="tgrid">${ts.map(t => html`<${TradeCard} key=${t.id} t=${t} S=${S} onClick=${() => UI.open('detail', { id: t.id, list: ts.map(x => x.id) })}/>`)}</div>`
      : html`<${Empty} icon="star" title="No trades in your playbook yet" body="Every trade you grade A+ lands here automatically. Pin up to 3 favourites from any trade's detail, or add trades by hand."><button class="btn btn-w" onClick=${() => setPick(true)}><${I} n="plus"/>Add a trade</button><//>`}
    ${pick && html`<${Modal} title="Add to showcase" onClose=${() => setPick(false)} size="wide"><div class="col" style=${{ gap: '6px', maxHeight: '60vh', overflow: 'auto' }}>${D.ts.slice(0, 200).map(t => html`<button key=${t.id} class="row" style=${{ padding: '9px 10px', borderRadius: '10px', background: 'var(--card)', flexWrap: 'nowrap', width: '100%', gap: '10px' }} onClick=${() => store.patch('trades', t.id, { show: !t.show })}><span class=${'chk' + (t.show || t.grade === 'A+' ? ' on' : '')} style=${{ width: 'auto' }}><span class="bx">${(t.show || t.grade === 'A+') && html`<${I} n="check" w=${3}/>`}</span></span><span class="dim tn">${fmtDate(t.t)}</span><b>${t.symbol}</b><${Side} s=${t.side}/><${Grade} g=${t.grade}/><span class="sp"></span><${Money} v=${t.pnl}/></button>`)}${!D.ts.length && html`<div class="dim">Log trades first.</div>`}</div><//>`}
  </div>`;
}

/* ---------------- Strategy ---------------- */
function Strategy({ C }) {
  const { S, D } = C; const list = Object.values(S.strategies).sort((a, b) => (a.created || 0) - (b.created || 0)); const [open, setOpen] = useState(null);
  const untagged = D.ts.filter(t => !t.strategy);
  return html`<div class="page">
    <${PageHead} title="Strategy" sub=${list.length + ' strategies defined'}><button class="btn btn-w" onClick=${() => UI.open('strategy')}><${I} n="plus"/>New strategy</button><//>
    <div class="card" style=${{ background: 'linear-gradient(90deg,var(--ais),transparent 60%),var(--card)', borderColor: 'rgba(157,123,255,.25)', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <span class="logo" style=${{ width: '36px', height: '36px', background: 'linear-gradient(135deg,#5B35E8,#9D7BFF)' }}><${I} n="spark" s=${18}/></span>
      <div><b>Your AI coach reads these</b><div class="mut" style=${{ fontSize: '12px', marginTop: '3px' }}>Every strategy here goes to the coach alongside your journal. Tag a trade to one and the coach holds that trade to these rules (your entry conditions, your invalidation, your minimum R:R) rather than to a generic idea of a good trade. The more you write down, the more it can hold you to.</div></div></div>
    ${!list.length ? html`<${Empty} icon="target" title="No strategies yet" body="Create your first strategy to start tracking which setups actually pay you."><button class="btn btn-w" onClick=${() => UI.open('strategy')}><${I} n="plus"/>New strategy</button><//>`
    : html`<div class="grid g2">${list.map(s => { const ts = D.ts.filter(t => t.strategy === s.id); const st = stats(ts); const eq = equitySeries(ts).map(p => p.v); const grade = !st.n ? '—' : st.pf >= 2 && st.n >= 10 ? 'A' : st.pf >= 1.4 ? 'B' : st.pf >= 1 ? 'C' : 'D';
      return html`<div class="card" key=${s.id} style=${{ borderTop: `2px solid ${s.color}` }}>
        <div class="ch"><h3 style=${{ fontSize: '15px' }}>${s.name}</h3><${Grade} g=${grade === '—' ? '' : grade}/><span class="sp"></span><button class="ib" onClick=${() => UI.open('strategy', { id: s.id })} aria-label="Edit strategy"><${I} n="edit"/></button></div>
        ${s.desc && html`<div class="mut" style=${{ fontSize: '12px', marginBottom: '12px' }}>${s.desc}</div>`}
        <div class="row" style=${{ gap: '18px', alignItems: 'flex-end' }}>
          <div><div class="lbl">Net</div><div class=${'tn ' + cls(st.net)} style=${{ fontSize: '21px', fontWeight: 800 }}>${money(st.net, { sign: true, dec: 0 })}</div></div>
          <div><div class="lbl">Trades</div><b class="tn">${st.n}</b></div><div><div class="lbl">Win</div><b class="tn">${pct(st.wr, 0)}</b></div><div><div class="lbl">PF</div><b class="tn">${st.pf === Infinity ? '∞' : st.pf.toFixed(2)}</b></div><div><div class="lbl">Exp</div><b class="tn">${st.expR != null ? rfmt(st.expR) : '—'}</b></div>
          <span class="sp"></span><${Spark} vals=${[0, ...eq]} w=${130} h=${40} color=${s.color}/></div>
        <div class="divider" style=${{ margin: '14px 0' }}></div>
        <div class="grid g2" style=${{ gap: '14px', fontSize: '11.5px' }}>
          <div><div class="lbl" style=${{ marginBottom: '6px' }}>Entry conditions</div>${(s.entry || []).length ? s.entry.map((e, i) => html`<div key=${i} class="row" style=${{ gap: '8px', flexWrap: 'nowrap', alignItems: 'flex-start', margin: '3px 0' }}><span class="dim tn">${i + 1}</span><span>${e}</span></div>`) : html`<span class="dim">Not written yet</span>`}</div>
          <div class="col" style=${{ gap: '8px' }}><div><div class="lbl">Invalidation</div><div>${s.invalid || html`<span class="dim">—</span>`}</div></div><div><div class="lbl">Timeframes · markets</div><div>${s.tf} · ${s.markets}</div></div><div><div class="lbl">Minimum R:R</div><div>${s.minRR}</div></div></div>
        </div>
        ${(s.shots || []).length > 0 && html`<div class="shots" style=${{ marginTop: '12px' }}>${s.shots.slice(0, 3).map(x => html`<div class="s" key=${x.id}><img src=${x.url} alt="Example"/></div>`)}</div>`}
        ${st.n > 0 && html`<button class="btn btn-t xs" style=${{ marginTop: '12px' }} onClick=${() => setOpen(open === s.id ? null : s.id)}>${open === s.id ? 'Hide' : 'Show'} ${st.n} trades</button>`}
        ${open === s.id && html`<div style=${{ marginTop: '8px' }}><${TradeTable} ts=${ts} S=${S} showAcct=${false}/></div>`}
      </div>` })}</div>`}
    ${untagged.length > 0 && list.length > 0 && html`<div class="card tight row"><${I} n="target"/><span>${untagged.length} trades have no strategy. Tag them so each playbook's numbers are honest.</span><span class="sp"></span><button class="btn btn-g sm" onClick=${() => UI.open('detail', { id: untagged[0].id, list: untagged.map(t => t.id) })}>Review untagged</button></div>`}
  </div>`;
}

/* tiny markdown for AI replies */
function mdLite(s) {
  s = esc(s || '');
  s = s.replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^# (.*)$/gm, '<h4>$1</h4>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  const lines = s.split('\n'); let out = '', inL = null;
  for (const ln of lines) {
    const ul = ln.match(/^\s*[-•*] (.*)/), ol = ln.match(/^\s*\d+[.)] (.*)/);
    if (ul || ol) { const tg = ul ? 'ul' : 'ol'; if (inL !== tg) { if (inL) out += `</${inL}>`; out += `<${tg}>`; inL = tg } out += `<li>${(ul || ol)[1]}</li>`; continue }
    if (inL) { out += `</${inL}>`; inL = null }
    if (/^<h4>/.test(ln)) out += ln; else if (ln.trim()) out += `<p>${ln}</p>`;
  }
  if (inL) out += `</${inL}>`;
  return out;
}
function AskBtn({ label, q, C }) { return html`<button class="btn btn-t xs ai" onClick=${() => C.go('ai', { ask: q })}><${I} n="spark" s=${13}/>${label}</button>` }

function CopyGroupCard({ S, t }) {
  const g = groupOf(S, t).map(x => ({ ...x, ...tradeCalc(x, S.settings) })).sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0));
  const tot = sum(g, x => x.pnl);
  return html`<div class="card tight" style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <div class="row"><${I} n="copy" s=${15}/><b>Copy trade</b><span class="mut" style=${{ fontSize: '11px' }}>${g.length} accounts</span><span class="sp"></span><span class="mut" style=${{ fontSize: '11px' }}>Total</span><b class=${'tn ' + cls(tot)}>${money(tot, { sign: true })}</b></div>
    ${g.map(x => { const a = S.accounts[x.account]; return html`<button key=${x.id} class="row" style=${{ flexWrap: 'nowrap', gap: '9px', fontSize: '11.5px', padding: '6px 8px', borderRadius: '9px', background: x.id === t.id ? 'var(--card2)' : 'transparent', width: '100%' }} onClick=${() => UI.open('detail', { id: x.id, list: g.map(y => y.id) })}>${a ? html`<${FirmLogo} id=${a.firm} s=${20}/>` : null}<span style=${{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a?.label || 'No account'}</span><span class=${'chip ' + (x.lead ? 'on' : '')} style=${{ height: '20px', fontSize: '9.5px' }}>${x.lead ? 'Main' : 'Copy'}</span><span class="sp"></span><span class="dim tn">${qtyFmt(x)}</span><span class=${'tn ' + cls(x.pnl)} style=${{ minWidth: '70px', textAlign: 'right', fontWeight: 700 }}>${money(x.pnl, { sign: true })}</span></button>` })}
  </div>`;
}

/* ---------------- Daily journal: today strip + month page + day sheet ---------------- */
const FEELINGS = ['Calm', 'Focused', 'Tired', 'Rushed'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isWkday = d => { const w = d.getDay(); return w > 0 && w < 6 };
const prevWkday = d => { let x = addDays(d, -1); while (!isWkday(x)) x = addDays(x, -1); return x };

function nyClock() {
  let wd, h, m;
  try { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()); wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.find(x => x.type === 'weekday').value); h = +p.find(x => x.type === 'hour').value % 24; m = +p.find(x => x.type === 'minute').value }
  catch (e) { const d = new Date(); wd = d.getDay(); h = d.getHours(); m = d.getMinutes() }
  const now = h * 60 + m; const dur = x => { const hh = Math.floor(x / 60), mm = x % 60; return hh ? `${hh}h ${mm}m` : `${mm}m` };
  if (wd === 6 || (wd === 5 && now >= 17 * 60) || (wd === 0 && now < 18 * 60)) return { tag: 'Weekend', text: wd === 0 ? `futures reopen in ${dur(18 * 60 - now)}` : 'futures reopen Sunday 6pm ET', live: false };
  if (now < 9 * 60 + 30) return { tag: 'NY AM', text: `market opens in ${dur(9 * 60 + 30 - now)}`, live: false };
  if (now < 16 * 60) return { tag: now < 12 * 60 ? 'NY AM' : 'NY PM', text: `session live · ${dur(16 * 60 - now)} left`, live: true };
  return { tag: 'After hours', text: 'cash session closed', live: false };
}

/* streak = consecutive weekdays with a plan or a review; today does not break it until it is over */
function dayStreak(S) {
  const j = k => journaledDay(S.days[k]);
  let d = new Date(); d.setHours(12); if (!isWkday(d) || !j(dayKey(d))) d = prevWkday(d);
  let cur = 0; while (j(dayKey(d))) { cur++; d = prevWkday(d) }
  const keys = Object.keys(S.days).filter(k => /^\d{4}-\d\d-\d\d$/.test(k) && j(k)).sort();
  let best = 0, run = 0, last = null;
  for (const k of keys) { const dd = parseDay(k); if (!isWkday(dd)) continue; run = last && dayKey(prevWkday(dd)) === last ? run + 1 : 1; best = Math.max(best, run); last = k }
  return { cur, best: Math.max(best, cur) };
}

function daysSay(S, days) {
  const ks = Object.keys(days).sort(); if (ks.length < 3) return [];
  const avg = a => a.length ? sum(a, x => x) / a.length : null; const out = [];
  const wp = ks.filter(k => S.days[k]?.plan).map(k => days[k].pnl), np = ks.filter(k => !S.days[k]?.plan).map(k => days[k].pnl);
  if (wp.length && np.length) out.push({ k: 'plan', head: 'Days with a plan', a: avg(wp), b: avg(np), bl: 'without', n: wp.length });
  const byF = {}; for (const k of ks) { const f = S.days[k]?.plan?.feeling; if (f) (byF[f] ||= []).push(days[k].pnl) }
  const fs = Object.entries(byF).filter(x => x[1].length >= 1).sort((x, y) => avg(y[1]) - avg(x[1]));
  if (fs.length) out.push({ k: 'feel', head: `Feeling ${fs[0][0]}`, a: avg(fs[0][1]), sub: 'a day', n: fs[0][1].length, worst: fs.length > 1 ? { f: fs[fs.length - 1][0], v: avg(fs[fs.length - 1][1]) } : null });
  const after = []; for (let i = 0; i < ks.length - 1; i++) if (days[ks[i]].trades.some(t => t.rules === false)) after.push(days[ks[i + 1]].pnl);
  if (after.length) out.push({ k: 'rule', head: 'After a rule broken', a: avg(after), sub: 'next day', n: after.length });
  const sc = ks.filter(k => dayScore(S.days[k]) != null); if (sc.length >= 3) { const hi = sc.filter(k => dayScore(S.days[k]) >= 7).map(k => days[k].pnl), lo = sc.filter(k => dayScore(S.days[k]) < 7).map(k => days[k].pnl); if (hi.length && lo.length) out.push({ k: 'score', head: 'Days you rate 7+', a: avg(hi), b: avg(lo), bl: 'below 7', n: hi.length }) }
  return out;
}

function planSummary(p) { if (!p) return ''; const l = planLevels(p).length; return [BIAS_L[p.bias], p.feeling, l ? `${l} level${l > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') }

function DailyView({ C, focus, planReq }) {
  const { S, D } = C; const days = useMemo(() => byDay(D.ts), [D]);
  const tk = todayKey(); const today = S.days[tk] || {}; const tx = days[tk];
  const [m, setM] = useState(() => { const d = focus ? parseDay(focus) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) });
  const [planOpen, setPlanOpen] = useState(false);
  const [clock, setClock] = useState(nyClock);
  const [pv, setPv] = useState(LS.get('compound.dview', 'cards'));
  useEffect(() => { const t = setInterval(() => setClock(nyClock()), 30000); return () => clearInterval(t) }, []);
  useEffect(() => { if (focus) { UI.open('day', { day: focus, tab: S.days[focus]?.review || !days[focus] ? 'plan' : 'review' }); const d = parseDay(focus); setM(new Date(d.getFullYear(), d.getMonth(), 1)) } }, [focus]);
  useEffect(() => { if (planReq) { setPlanOpen(true); setTimeout(() => document.getElementById('dj-today')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 40) } }, [planReq]);
  const stk = useMemo(() => dayStreak(S), [S.days]);
  const say = useMemo(() => daysSay(S, days), [S.days, days]);
  const past = useMemo(() => [...new Set([...Object.keys(days), ...Object.keys(S.days).filter(k => /^\d{4}-\d\d-\d\d$/.test(k) && journaledDay(S.days[k]))])].filter(k => k < tk).sort().reverse().slice(0, 12), [S.days, days]);
  const open = (day, tab) => UI.open('day', { day, tab: tab || (days[day] ? (S.days[day]?.review ? 'trades' : 'review') : 'plan') });
  const steps = [
    { k: 'plan', t: 'Plan', d: today.plan ? planSummary(today.plan) || 'Plan set' : 'Bias, levels, one rule', done: !!today.plan, go: () => setPlanOpen(o => !o) },
    { k: 'trade', t: 'Trade', d: tx ? `${tx.n} trade${tx.n > 1 ? 's' : ''} · ${money(tx.pnl, { sign: true, dec: 0 })}` : 'Trades land here by themselves', done: !!tx, go: () => tx ? open(tk, 'trades') : UI.open('trade') },
    { k: 'review', t: 'Review', d: today.review ? `Rated ${dayScore(today)}/10` : '4 questions, 2 minutes', done: !!today.review, go: () => open(tk, 'review') }];
  const next = steps.findIndex(s => !s.done);
  const now = new Date();
  return html`<div class="dj">
    <section class="card djtoday" id="dj-today">
      <div class="djt-top">
        <div class="col" style=${{ gap: '4px' }}>
          <span class="lbl">Today · ${WDL[now.getDay()]} ${now.getDate()} ${MONL[now.getMonth()]}</span>
          <span class="mut" style=${{ fontSize: '11.5px' }}><span class=${'djdot' + (clock.live ? ' live' : '')}></span>${clock.tag} · ${clock.text}</span>
        </div>
        <span class="sp"></span>
        <div class="djsofar"><span class="lbl">Today so far</span><b class=${'tn ' + cls(tx?.pnl)}>${tx ? money(tx.pnl, { sign: true, dec: 0 }) : '$0'}</b><span class="dim" style=${{ fontSize: '10.5px' }}>${tx ? `${tx.n} trade${tx.n > 1 ? 's' : ''} · ${tx.w}W ${tx.l}L` : 'no trades yet'}</span></div>
        <div class="djstreak" title=${'Best run ' + stk.best + ' days'}><${I} n="flame" s=${15}/><b class="tn">${stk.cur}</b><span class="dim">day streak</span></div>
      </div>
      <div class="djsteps">${steps.map((s, i) => html`<button key=${s.k} class=${'djstep' + (s.done ? ' done' : '') + (i === next ? ' next' : '') + (s.k === 'plan' && planOpen ? ' open' : '')} onClick=${s.go}>
        <span class="n tn">${s.done ? html`<${I} n="check" s=${12}/>` : i + 1}</span><span class="col" style=${{ gap: '2px', minWidth: 0 }}><b>${s.t}</b><span class="d">${s.d}</span></span></button>`)}</div>
      ${planOpen && html`<div class="djplanwrap"><${PlanInline} day=${tk} S=${S} onSaved=${() => setPlanOpen(false)}/></div>`}
    </section>

    <div class="djmain">
      <section class="card djmonth">
        <${MonthPage} S=${S} days=${days} m=${m} setM=${setM} stk=${stk} onPick=${k => open(k)} onPlan=${() => setPlanOpen(true)}/>
      </section>
      <div class="col djside">
        <section class="card">
          <div class="ch"><span class="lbl">Streak</span><span class="sp"></span><span class="dim tn" style=${{ fontSize: '10.5px' }}>best ${stk.best}</span></div>
          <div class="row" style=${{ alignItems: 'baseline', gap: '8px' }}><b class="tn" style=${{ fontSize: '30px', fontWeight: 800, letterSpacing: '-.03em' }}>${stk.cur}</b><span class="mut" style=${{ fontSize: '11.5px' }}>day${stk.cur === 1 ? '' : 's'} journaled in a row</span></div>
          <${StreakStrip} S=${S}/>
        </section>
        <section class="card">
          <div class="ch"><span class="lbl">What your days say</span></div>
          ${say.length ? html`<div class="col" style=${{ gap: '8px' }}>${say.map(x => html`<div class="djsay" key=${x.k}>
            <div class="row" style=${{ gap: '6px' }}><b style=${{ fontSize: '12px' }}>${x.head}</b><span class="sp"></span><b class=${'tn ' + cls(x.a)}>${money(x.a, { sign: true, dec: 0 })}</b></div>
            <div class="dim" style=${{ fontSize: '10.5px' }}>${x.b != null ? html`vs <span class=${'tn ' + cls(x.b)}>${money(x.b, { sign: true, dec: 0 })}</span> ${x.bl} · avg per day` : html`${x.sub} on average · ${x.n} day${x.n > 1 ? 's' : ''}`}${x.worst ? html` · ${x.worst.f} <span class=${'tn ' + cls(x.worst.v)}>${money(x.worst.v, { sign: true, dec: 0 })}</span>` : ''}</div></div>`)}</div>`
            : html`<div class="dim" style=${{ fontSize: '11.5px' }}>Plan and review a few days. Compound will show what your best days have in common.</div>`}
        </section>
      </div>
    </div>

    <section>
      <div class="ch"><span class="lbl">Past days</span><span class="sp"></span><${Seg} sm v=${pv} set=${v => { setPv(v); LS.set('compound.dview', v) }} opts=${[['cards', 'Cards'], ['list', 'List']]}/></div>
      ${!past.length ? html`<div class="card dim" style=${{ textAlign: 'center', fontSize: '11.5px' }}>Your past days will stack up here.</div>`
        : pv === 'cards' ? html`<div class="djpast">${past.map(k => html`<${PastDay} key=${k} k=${k} x=${days[k]} d=${S.days[k]} onClick=${() => open(k)}/>`)}</div>`
        : html`<div class="card" style=${{ padding: 0 }}>${past.map(k => { const x = days[k], d = S.days[k] || {}, sc = dayScore(d); return html`<button key=${k} class="djrow" onClick=${() => open(k)}><span class="tn" style=${{ minWidth: '96px' }}>${fmtDate(parseDay(k), { wd: true })}</span><b class=${'tn ' + cls(x?.pnl)} style=${{ minWidth: '80px' }}>${x ? money(x.pnl, { sign: true, dec: 0 }) : '—'}</b><span class="mut hide-m" style=${{ fontSize: '11px' }}>${dayLine(x)}</span><span class="sp"></span>${d.plan && html`<span class="chip">${planSummary(d.plan) || 'Plan'}</span>`}<span class="tn dim" style=${{ minWidth: '36px', textAlign: 'right' }}>${sc != null ? sc + '/10' : '—'}</span></button>` })}</div>`}
    </section>
  </div>`;
}

function dayLine(x) { if (!x) return 'No trades'; const br = x.trades.some(t => t.rules === false), kp = x.trades.some(t => t.rules === true); return `${x.n} trade${x.n > 1 ? 's' : ''}${br ? ' · rule broken' : kp ? ' · rules kept' : ''}` }

function scoreColor(sc) { return sc == null ? 'var(--line2)' : sc >= 7 ? 'var(--pos)' : sc >= 5 ? 'var(--acc)' : 'var(--neg)' }

function PastDay({ k, x, d, onClick }) {
  const sc = dayScore(d); const dd = parseDay(k);
  return html`<button class=${'card djcard ' + (x ? (x.pnl >= 0 ? 'up' : 'dn') : '')} onClick=${onClick}>
    <div class="row" style=${{ gap: '8px', flexWrap: 'nowrap' }}><div class="col" style=${{ gap: '1px', minWidth: 0 }}><span class="lbl">${WDL[dd.getDay()].slice(0, 3)}</span><b>${dd.getDate()} ${MONL[dd.getMonth()].slice(0, 3)}</b></div><span class="sp"></span>
      <${Ring} v=${(sc || 0) * 10} size=${34} w=${3} color=${scoreColor(sc)}><span class="tn" style=${{ fontSize: '10.5px' }}>${sc ?? '–'}</span><//></div>
    <b class=${'tn ' + cls(x?.pnl)} style=${{ fontSize: '19px', fontWeight: 800, letterSpacing: '-.02em' }}>${x ? money(x.pnl, { sign: true, dec: 0 }) : '—'}</b>
    <span class="dim" style=${{ fontSize: '10.5px' }}>${dayLine(x)}</span>
    ${(d?.plan || d?.review?.lessons) && html`<span class="mut djclip">${d.review?.lessons || planSummary(d.plan)}</span>`}
  </button>`;
}

function StreakStrip({ S }) {
  const cells = []; let d = new Date(); d.setHours(12); if (!isWkday(d)) d = prevWkday(d);
  for (let i = 0; i < 20; i++) { cells.unshift(dayKey(d)); d = prevWkday(d) }
  const tk = todayKey();
  return html`<div class="djstrip">${cells.map(k => { const dd = S.days[k]; const on = journaledDay(dd); return html`<span key=${k} title=${fmtDate(parseDay(k), { wd: true })} class=${(on ? (dd.plan && dd.review ? 'on full' : 'on') : '') + (k === tk ? ' tdy' : '')}></span>` })}</div>`;
}

function MonthPage({ S, days, m, setM, stk, onPick, onPlan }) {
  const first = (m.getDay() + 6) % 7; const n = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = []; for (let i = 0; i < first; i++) cells.push(null); for (let i = 1; i <= n; i++) cells.push(new Date(m.getFullYear(), m.getMonth(), i)); while (cells.length % 7) cells.push(null);
  const pre = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
  const mo = Object.entries(days).filter(([k]) => k.startsWith(pre)); const net = sum(mo, x => x[1].pnl); const mx = Math.max(1, ...mo.map(x => Math.abs(x[1].pnl)));
  const jn = Object.keys(S.days).filter(k => k.startsWith(pre) && journaledDay(S.days[k])).length;
  const tk = todayKey();
  return html`
    <div class="djmh">
      <div class="row" style=${{ gap: '6px' }}><button class="ib" onClick=${() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month"><${I} n="left"/></button><h3 style=${{ minWidth: '128px', textAlign: 'center' }}>${MONL[m.getMonth()]} ${m.getFullYear()}</h3><button class="ib" onClick=${() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month"><${I} n="right"/></button></div>
      <span class="sp"></span>
      <div class="djstats"><div><b class=${'tn ' + cls(net)}>${mo.length ? money(net, { sign: true, dec: 0 }) : '$0'}</b><span>month</span></div><div><b class="tn">${jn}</b><span>days journaled</span></div><div><b class="tn">${stk.cur}</b><span>day streak</span></div></div>
    </div>
    <div class="djcal">${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(x => html`<div class="dh" key=${x}>${x}</div>`)}
      ${cells.map((d, i) => { if (!d) return html`<div key=${'e' + i} class="djc empty"></div>`; const k = dayKey(d); const x = days[k]; const dj = S.days[k]; const sc = dayScore(dj); const isT = k === tk; const fut = k > tk; const wk = !isWkday(d);
        const a = x ? .16 + .42 * Math.abs(x.pnl) / mx : 0;
        const bg = x ? `color-mix(in srgb,${x.pnl >= 0 ? 'var(--pos)' : 'var(--neg)'} ${Math.round(a * 100)}%,var(--card2))` : undefined;
        return html`<button key=${k} class=${'djc' + (isT ? ' today' : '') + (fut ? ' fut' : '') + (wk ? ' wk' : '') + (x ? ' has' : '')} style=${{ background: bg }} onClick=${() => isT && !dj?.plan ? onPlan() : onPick(k)} disabled=${fut && !dj}>
          <div class="row" style=${{ gap: '4px', flexWrap: 'nowrap' }}><span class="dn tn">${d.getDate()}</span><span class="sp"></span>${sc != null && html`<span class="rg"><${Ring} v=${sc * 10} size=${20} w=${2.2} color=${scoreColor(sc)}><span class="tn" style=${{ fontSize: '8px' }}>${sc}</span><//></span>`}</div>
          ${x ? html`<b class="pl tn">${money(x.pnl, { sign: true, dec: 0, compact: Math.abs(x.pnl) >= 10000 })}</b>` : isT ? html`<span class="tl">${dj?.plan ? 'Today · plan set' : '+ Plan today'}</span>` : html`<span></span>`}
          <div class="dots">${x ? x.trades.slice(0, 6).map((t, j) => html`<i key=${j} class=${t.pnl >= 0 ? 'w' : 'l'}></i>`) : ''}${dj?.plan && html`<i class="p" title="Plan"></i>`}${dj?.review && html`<i class="r" title="Reviewed"></i>`}</div>
        </button>` })}
    </div>`;
}

function PlanInline({ day, S, onSaved, compact }) {
  const d = S.days[day] || { id: day };
  const prevK = useMemo(() => Object.keys(S.days).filter(k => /^\d{4}-\d\d-\d\d$/.test(k) && k < day && S.days[k]?.plan).sort().pop(), [S.days, day]);
  const init = () => ({ bias: '', feeling: '', rule: '', ...(d.plan || {}), levels: planLevels(d.plan) });
  const [p, setP] = useState(init); const [lv, setLv] = useState(''); const [rules, setRules] = useState(false);
  useEffect(() => setP(init()), [day]);
  const up = x => setP(o => ({ ...o, ...x }));
  const addLv = () => { const v = lv.trim(); if (!v) return; up({ levels: [...p.levels, v] }); setLv('') };
  const fromPrev = () => { const q = S.days[prevK].plan; setP(o => ({ ...o, bias: q.bias || '', feeling: q.feeling || '', rule: q.rule || '', levels: planLevels(q) })); toast(`Copied ${WDL[parseDay(prevK).getDay()]}'s plan`) };
  const save = () => { const levels = lv.trim() ? [...p.levels, lv.trim()] : p.levels; store.put('days', { ...d, id: day, plan: { ...(d.plan || {}), ...p, levels, at: Date.now() } }); setLv(''); toast(day === todayKey() ? 'Plan saved. It shows on every trade you log today.' : 'Plan saved'); onSaved && onSaved() };
  const ruleList = [...(S.settings.checklist || []), ...Object.values(S.strategies || {}).flatMap(s => s.entry || [])].filter(Boolean).slice(0, 12);
  return html`<div class=${'djplan' + (compact ? ' compact' : '')}>
    <div class="row"><b style=${{ fontSize: '13px' }}>Your plan</b><span class="sp"></span>${prevK && !d.plan && html`<button class="lnk" onClick=${fromPrev}>Start from ${WDL[parseDay(prevK).getDay()]}'s plan</button>`}<button class="lnk" onClick=${() => UI.open('plan', { day })}>Full plan</button></div>
    <div class="djpg">
      <div class="djf"><span class="lbl">Bias</span><div class="row" style=${{ gap: '6px' }}>${[['bull', 'Bullish', 'pos'], ['bear', 'Bearish', 'neg'], ['neutral', 'No bias', '']].map(([k, l, c]) => html`<button type="button" key=${k} class=${'chip ' + (p.bias === k ? 'on ' + c : '')} onClick=${() => up({ bias: p.bias === k ? '' : k })}>${l}</button>`)}</div></div>
      <div class="djf"><span class="lbl">Feeling</span><${Chips} single all=${FEELINGS} v=${p.feeling} set=${v => up({ feeling: v })}/></div>
    </div>
    <div class="djf"><span class="lbl">Levels</span><div class="row" style=${{ gap: '6px' }}>${p.levels.map((x, i) => html`<span class="chip on tn" key=${i}>${x}<button type="button" class="chx" aria-label="Remove level" onClick=${() => up({ levels: p.levels.filter((_, j) => j !== i) })}>×</button></span>`)}
      <input class="in sm lvin tn" placeholder="+ level  (15m FVG 25,914)" value=${lv} onInput=${e => setLv(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); addLv() } }} onBlur=${addLv}/></div></div>
    <div class="djf"><div class="row"><span class="lbl">One rule</span><span class="sp"></span>${ruleList.length > 0 && html`<button class="lnk" style=${{ fontSize: '10.5px' }} onClick=${() => setRules(r => !r)}>from your rules</button>`}</div>
      <input class="in" placeholder="No trade before the 9:50 FVG forms" value=${p.rule} onInput=${e => up({ rule: e.target.value })}/>
      ${rules && html`<div class="row" style=${{ gap: '6px', marginTop: '6px' }}>${ruleList.map((r, i) => html`<button type="button" key=${i} class="chip" onClick=${() => { up({ rule: r }); setRules(false) }}>${r}</button>`)}</div>`}</div>
    <div class="row djpfoot"><span class="dim" style=${{ fontSize: '10.5px' }}>${day === todayKey() ? 'Your plan shows on every trade you log today.' : 'Saved to ' + fmtDate(parseDay(day), { wd: true }) + '.'}</span><span class="sp"></span><button class="btn btn-w sm" onClick=${save}><${I} n="check"/>Save plan</button></div>
  </div>`;
}

function DaySheet({ C, day, tab: tab0, days, onClose }) {
  const S = useStore(); const d = S.days[day] || { id: day }; const x = days[day]; const dd = parseDay(day);
  const [tab, setTab] = useState(tab0 || 'plan');
  const [r, setR] = useState(() => ({ text: '', lessons: '', plan: null, ...(d.review || {}), score: dayScore(d) }));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTab(tab0 || 'plan') }, [day, tab0]);
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose]);
  const up = o => setR(v => ({ ...v, ...o }));
  const sc = dayScore(d);
  const saveReview = () => { store.put('days', { ...d, id: day, review: { ...r, score: r.score ?? 7, at: Date.now() } }); toast('Day reviewed') };
  const draft = async () => {
    const smp = store.caps.sample; if (!smp) return toast('Add your AI key in Settings to draft lessons');
    setBusy(true);
    try {
      const lines = (x?.trades || []).map(t => tradeLine(t, S)).join('\n') || 'No trades taken.';
      const res = await smp(`You are a concise futures trading coach. From this trader's day, write ONE lesson they should carry into tomorrow. One or two sentences, first person ("I..."), concrete and measurable, no preamble.\n\nDate: ${day}\nPlan: ${d.plan ? planSummary(d.plan) + (d.plan.rule ? '; rule: ' + d.plan.rule : '') + (planLevels(d.plan).length ? '; levels: ' + levelsText(d.plan) : '') : 'none'}\nFollowed plan: ${r.plan === true ? 'yes' : r.plan === false ? 'no' : r.plan === 'part' ? 'partly' : 'not answered'}\nDay rating: ${r.score ?? '-'}/10\nNotes: ${r.text || '-'}\nTrades:\n${lines}`, { modelTier: 'default' });
      up({ lessons: String(res.text || '').trim() });
    } catch (e) { toast('AI draft did not run') }
    setBusy(false);
  };
  const share = async () => {
    const txt = `${WDL[dd.getDay()]} ${dd.getDate()} ${MONL[dd.getMonth()]}: ${x ? money(x.pnl, { sign: true, dec: 0 }) + ' · ' + x.n + ' trades' : 'no trades'}${sc != null ? ' · ' + sc + '/10' : ''}${d.plan ? '\nPlan: ' + planSummary(d.plan) : ''}${d.review?.lessons ? '\nLesson: ' + d.review.lessons : ''}\n— Compound`;
    try { if (navigator.share) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); toast('Day copied') } } catch (e) { }
  };
  const tabs = [['plan', 'Plan'], ['trades', 'Trades' + (x ? ' · ' + x.n : '')], ['review', 'Review'], ['notes', 'Notes']];
  return html`<div class="ov sheetov" onMouseDown=${e => { if (e.target === e.currentTarget) onClose() }}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${'Day ' + day}>
      <div class="grab"></div>
      <div class="sh-h">
        <div class="col" style=${{ gap: '3px' }}><span class="lbl">${WDL[dd.getDay()]} ${dd.getDate()} ${MONL[dd.getMonth()]}</span>
          <div class="row" style=${{ gap: '8px', alignItems: 'baseline' }}><b class=${'tn ' + cls(x?.pnl)} style=${{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.03em' }}>${x ? money(x.pnl, { sign: true, dec: 0 }) : '$0'}</b><span class="mut tn" style=${{ fontSize: '11.5px' }}>${x ? x.n + ' trade' + (x.n > 1 ? 's' : '') : 'no trades'}${sc != null ? ' · ' + sc + '/10' : ''}</span></div></div>
        <span class="sp"></span>
        <button class="btn btn-g sm" onClick=${share}><${I} n="upload" s=${13}/>Share day</button>
        <button class="ib" onClick=${onClose} aria-label="Close"><${I} n="x"/></button>
      </div>
      <div class="sh-tabs">${tabs.map(([k, l]) => html`<button key=${k} class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
      <div class="sh-b">
        ${tab === 'plan' && html`<${PlanInline} day=${day} S=${S} compact/>${d.plan && (d.plan.a || d.plan.b || d.plan.news || d.plan.focus) && html`<div class="mdtx mut" style=${{ fontSize: '11.5px', marginTop: '12px' }}>${[d.plan.focus && 'Focus: ' + d.plan.focus, d.plan.news && 'News: ' + d.plan.news, d.plan.a && 'A: ' + d.plan.a, d.plan.b && 'B: ' + d.plan.b].filter(Boolean).join('\n')}</div>`}`}
        ${tab === 'trades' && html`<div class="col" style=${{ gap: '8px' }}>
          ${x && html`<div class="grid g3 keep2" style=${{ gap: '8px' }}>${(() => { const s = stats(x.trades); return [['Win rate', pct(s.wr, 0), ''], ['Best', money(s.best?.pnl, { sign: true, dec: 0 }), 'pos'], ['Worst', money(s.worst?.pnl, { sign: true, dec: 0 }), 'neg']].map(([k, v, c]) => html`<div class="card tight" key=${k}><div class="lbl">${k}</div><b class=${'tn ' + c}>${v}</b></div>`) })()}</div>`}
          ${x ? [...x.trades].sort((a, b) => tTime(a) - tTime(b)).map(t => html`<button key=${t.id} class="djtrade" onClick=${() => UI.open('detail', { id: t.id, list: x.trades.map(y => y.id) })}><span class="dim tn">${fmtTime(t.t)}</span><b>${t.symbol}</b><${Side} s=${t.side}/><${Grade} g=${t.grade}/>${t.rules === false && html`<span class="chip neg">rule broken</span>`}<span class="sp"></span><${Money} v=${t.pnl}/></button>`)
            : html`<div class="dim" style=${{ fontSize: '11.5px' }}>No trades on this day.</div>`}
          <button class="btn btn-g sm" style=${{ alignSelf: 'flex-start' }} onClick=${() => UI.open('trade', { preset: { t: day + 'T09:30' } })}><${I} n="plus"/>Log a trade on this day</button></div>`}
        ${tab === 'review' && html`<div class="col" style=${{ gap: '16px' }}>
          <div class="djf"><span class="lbl">Did you follow your plan?</span><div class="seg">${[[true, 'Yes'], ['part', 'Partly'], [false, 'No']].map(([v, l]) => html`<button key=${l} class=${r.plan === v ? 'on' : ''} onClick=${() => up({ plan: v })}>${l}</button>`)}</div></div>
          <div class="djf"><span class="lbl">Rate your day${r.score != null ? ' · ' + r.score + '/10' : ''}</span><${ScorePick} v=${r.score} set=${v => up({ score: v })}/></div>
          <div class="djf"><span class="lbl">What happened?</span><textarea class="ta" rows="3" placeholder="Two lines while it's fresh" value=${r.text} onInput=${e => up({ text: e.target.value })}></textarea></div>
          <div class="djf"><div class="row"><span class="lbl">One lesson</span><span class="sp"></span><button class="lnk" style=${{ fontSize: '10.5px' }} disabled=${busy} onClick=${draft}><${I} n="spark" s=${12}/>${busy ? 'Drafting…' : 'AI draft from your trades'}</button></div>
            <textarea class="ta" rows="2" placeholder="I wait for the retest before I size up." value=${r.lessons} onInput=${e => up({ lessons: e.target.value })}></textarea>${r.lessons && html`<span class="dim" style=${{ fontSize: '10.5px' }}>Edit it so it sounds like you.</span>`}</div>
          <div class="row"><${AskBtn} label="Full AI recap" q=${`Recap my trading day ${day}. What did I do well, what went wrong, and one concrete rule for tomorrow?`} C=${C}/><span class="sp"></span><button class="btn btn-w sm" onClick=${saveReview}><${I} n="check"/>Save review</button></div></div>`}
        ${tab === 'notes' && html`<div class="col" style=${{ gap: '8px' }}><textarea class="ta" rows="9" placeholder="Anything about the day: market, mindset, life." value=${d.notes || ''} onInput=${e => store.put('days', { ...(store.s.days[day] || { id: day }), id: day, notes: e.target.value }, 700)}></textarea><span class="dim" style=${{ fontSize: '10.5px' }}>Saves as you type.</span></div>`}
      </div>
    </div></div>`;
}

/* ================= Compound · Chart, Study, Propfirm, Progress ================= */
const TZS = -new Date().getTimezoneOffset() * 60; // show candles in local time
function resample(bars, tfMin, baseMin) {
  if (!tfMin || tfMin <= baseMin) return bars; const step = tfMin * 60; const out = []; let cur = null;
  for (const b of bars) { const k = Math.floor(b.time / step) * step; if (!cur || cur.time !== k) { cur && out.push(cur); cur = { time: k, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 } } else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume || 0 } }
  cur && out.push(cur); return out;
}
function snapTime(bars, sec) { let lo = 0, hi = bars.length - 1; if (hi < 0) return null; if (sec <= bars[0].time) return bars[0].time; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].time <= sec) lo = m; else hi = m - 1 } return bars[lo].time }
function useChartFor(t, S) {
  const [b, setB] = useState(null);
  const ch = t ? Object.values(S.charts).find(c => { const s = tTime(t) / 1000; return c.fam === instr(t.symbol).fam && s >= c.from - 60 && s <= c.to + 3600 }) : null;
  useEffect(() => { let live = true; setB(null); if (ch) store.getBars(ch.id).then(bars => live && setB({ bars, ch })).catch(() => { }); return () => { live = false } }, [ch?.id, t?.id]);
  return b;
}
function PriceChart({ bars, trades = [], focus, h = 440, onPick }) {
  const el = useRef();
  useEffect(() => {
    if (!window.LightweightCharts || !el.current || !bars?.length) return;
    const chart = LightweightCharts.createChart(el.current, { ...lwTheme(), height: h, autoSize: true });
    const pos = cssv('--pos'), neg = cssv('--neg');
    const cs = chart.addCandlestickSeries({ upColor: pos, downColor: neg, borderUpColor: pos, borderDownColor: neg, wickUpColor: pos, wickDownColor: neg, priceLineVisible: false });
    const shifted = bars.map(b => ({ ...b, time: b.time + TZS }));
    cs.setData(shifted);
    const mk = [];
    for (const t of trades) {
      const ten = snapTime(shifted, Math.floor(tTime(t) / 1000) + TZS), tex = t.tx ? snapTime(shifted, Math.floor(tExit(t) / 1000) + TZS) : null; const L = t.side !== 'short';
      if (ten != null) mk.push({ time: ten, position: L ? 'belowBar' : 'aboveBar', color: L ? pos : neg, shape: L ? 'arrowUp' : 'arrowDown', text: (L ? 'L ' : 'S ') + t.qty, id: t.id });
      if (tex != null) mk.push({ time: tex, position: L ? 'aboveBar' : 'belowBar', color: t.pnl >= 0 ? pos : neg, shape: 'circle', text: UIS.hide ? 'exit' : moneyK(t.pnl, { sign: true }), id: t.id });
    }
    mk.sort((a, b) => a.time - b.time); cs.setMarkers(mk);
    if (focus) {
      const lv = [focus.entry, focus.stop, focus.target, focus.exit].filter(isNum).map(Number);
      if (lv.length) cs.applyOptions({ autoscaleInfoProvider: orig => { const r = orig(); if (!r || !r.priceRange) return r; const mid = (r.priceRange.minValue + r.priceRange.maxValue) / 2; const near = lv.filter(v => Math.abs(v - mid) / mid < .03); return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...near), maxValue: Math.max(r.priceRange.maxValue, ...near) } } } });
      const line = (p, c, title, st = 0) => isNum(p) && cs.createPriceLine({ price: +p, color: c, lineWidth: 1, lineStyle: st, axisLabelVisible: true, title });
      line(focus.entry, cssv('--fg2'), 'Entry'); line(focus.stop, neg, 'Stop', 2); line(focus.target, pos, 'Target', 2); line(focus.exit, focus.pnl >= 0 ? pos : neg, 'Exit', 1);
      const ten = snapTime(shifted, Math.floor(tTime(focus) / 1000) + TZS); const i = shifted.findIndex(b => b.time === ten);
      if (i >= 0) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, i - 70), to: Math.min(shifted.length - 1, i + 50) });
    } else chart.timeScale().fitContent();
    if (onPick) chart.subscribeClick(p => { if (p.hoveredObjectId) onPick(p.hoveredObjectId); else if (p.time) { const hit = trades.find(t => Math.abs(snapTime(shifted, Math.floor(tTime(t) / 1000) + TZS) - p.time) < 1); hit && onPick(hit.id) } });
    return () => chart.remove();
  }, [bars, trades, focus, store.s.settings.theme, store.s.settings.accent, UIS.hide]);
  if (!window.LightweightCharts) return html`<div class="dim" style=${{ height: h + 'px', display: 'grid', placeItems: 'center' }}>Chart engine did not load. Check your connection.</div>`;
  return html`<div ref=${el} class="tvchart" style=${{ height: h + 'px' }}></div>`;
}

function ChartImport({ onClose }) {
  const [rows, setRows] = useState(null); const [meta, setMeta] = useState({ symbol: 'MNQ', tf: 1, name: '' }); const [busy, setBusy] = useState(false);
  const load = async f => {
    const txt = await f.text(); const r = parseCSV(txt); if (r.length < 3) return toast('No bars found in that file');
    const h = r[0].map(x => x.toLowerCase().trim()); const ix = k => h.findIndex(x => x === k || x.startsWith(k));
    const iT = ix('time') >= 0 ? ix('time') : ix('date'), iO = ix('open'), iH = ix('high'), iL = ix('low'), iC = ix('close'), iV = h.findIndex(x => x.startsWith('vol'));
    if ([iT, iO, iH, iL, iC].some(i => i < 0)) return toast('Need time, open, high, low and close columns');
    const bars = []; for (const row of r.slice(1)) { const d = parseDateLoose(row[iT]); const o = +row[iO], hi = +row[iH], lo = +row[iL], c = +row[iC]; if (!d || [o, hi, lo, c].some(isNaN)) continue; bars.push({ time: Math.floor(d.getTime() / 1000), open: o, high: hi, low: lo, close: c, volume: iV >= 0 ? +row[iV] || 0 : 0 }) }
    bars.sort((a, b) => a.time - b.time); const ded = bars.filter((b, i) => !i || b.time !== bars[i - 1].time);
    const diffs = ded.slice(1, 400).map((b, i) => b.time - ded[i].time).sort((a, b) => a - b); const tf = Math.max(1, Math.round((diffs[diffs.length >> 1] || 60) / 60));
    const m = f.name.match(/^([A-Z0-9_]+)[_:]?([A-Z0-9]+!?)?/i); let sym = 'MNQ'; if (m) { const cand = normSym((f.name.split(',')[0].split('_').pop() || '')); if (INSTR[cand]) sym = cand }
    setRows(ded); setMeta({ symbol: sym, tf, name: f.name.replace(/\.csv$/i, '') });
  };
  const save = async () => { setBusy(true); const id = uid(); const chunks = await store.putBars(id, rows); store.put('charts', { id, symbol: meta.symbol, fam: instr(meta.symbol).fam, tf: +meta.tf, from: rows[0].time, to: rows[rows.length - 1].time, n: rows.length, chunks, name: meta.name, created: Date.now() }); setBusy(false); toast(`${rows.length.toLocaleString()} bars saved`); onClose(id) };
  return html`<${Modal} title="Import price data" icon=${html`<${I} n="candle"/>`} onClose=${() => onClose()} foot=${rows && html`<button class="btn btn-g" onClick=${() => onClose()}>Cancel</button><button class="btn btn-w" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save chart'}</button>`}>
    ${!rows ? html`<div class="col" style=${{ gap: '12px' }}>
      <ol class="mut" style=${{ margin: 0, paddingLeft: '18px', lineHeight: 1.8, fontSize: '12px' }}><li>Open your chart in TradingView (e.g. <b>MNQ1!</b>, 1 minute) and scroll back to cover the days you want.</li><li>Top-left menu (arrow next to the chart layout) → <b>Export chart data…</b> → time format ISO or UNIX → <b>Export</b>.</li><li>Drop that CSV here. Your trades on those days plot on the candles automatically.</li></ol>
      <label class="drop"><${I} n="upload" s=${22}/><div style=${{ marginTop: '6px' }}><b>Choose TradingView CSV</b></div><input type="file" accept=".csv,text/csv" hidden onChange=${e => e.target.files[0] && load(e.target.files[0])}/></label></div>`
    : html`<div class="row"><span class="chip on">${rows.length.toLocaleString()} bars</span><span class="mut">${fmtDate(rows[0].time * 1000, { year: true })} → ${fmtDate(rows[rows.length - 1].time * 1000, { year: true })}</span></div>
      <div class="grid g3"><${Field} label="Symbol"><input class="in" list="syms" value=${meta.symbol} onInput=${e => setMeta({ ...meta, symbol: e.target.value.toUpperCase() })}/><datalist id="syms">${Object.keys(INSTR).map(k => html`<option value=${k}/>`)}</datalist><//><${Field} label="Bar size (minutes)"><input class="in tn" value=${meta.tf} onInput=${e => setMeta({ ...meta, tf: e.target.value })}/><//><${Field} label="Name"><input class="in" value=${meta.name} onInput=${e => setMeta({ ...meta, name: e.target.value })}/><//></div>
      <div class="dim" style=${{ fontSize: '11px' }}>MNQ and NQ share prices, so either symbol's bars show trades on both.</div>`}
  <//>`;
}


/* ---------- live TradingView chart (standalone app only; Claude pages block outside embeds) ---------- */
const LIVE_OK = typeof STANDALONE !== 'undefined' && STANDALONE;
/* CME/COMEX futures are blocked in embedded widgets ("only available on TradingView"), so live charts use free CFD equivalents of the same index */
const TV_PICKS = [['OANDA:NAS100USD', 'NAS100'], ['OANDA:SPX500USD', 'S&P 500'], ['OANDA:US30USD', 'Dow 30'], ['OANDA:XAUUSD', 'Gold'], ['OANDA:DE30EUR', 'DAX'], ['BITSTAMP:BTCUSD', 'BTC']];
const TV_FREE = { NQ: 'OANDA:NAS100USD', ES: 'OANDA:SPX500USD', YM: 'OANDA:US30USD', GC: 'OANDA:XAUUSD', DAX: 'OANDA:DE30EUR', RTY: 'OANDA:SPX500USD', CL: 'OANDA:WTICOUSD' };
function tvSymFor(sym) { const f = instr(sym).fam; const saved = LS.get('compound.tvsym.' + f, ''); if (saved && !/^(CME|COMEX|NYMEX|CBOT)/.test(saved)) return saved; return TV_FREE[f] || 'OANDA:NAS100USD' }
/* fills the rest of the window below it; "full" covers the whole window */
function TVLive({ symbol, interval = '5', h, studies = [], fill = false }) {
  const wrap = useRef(); const el = useRef(); const [hh, setHh] = useState(h || 560); const [full, setFull] = useState(false);
  useLayoutEffect(() => {
    if (!fill) return; const fit = () => { const r = wrap.current?.getBoundingClientRect(); if (!r) return; setHh(Math.max(420, Math.round(innerHeight - r.top - (innerWidth < 760 || isTablet() ? 92 : 64)))) };
    fit(); addEventListener('resize', fit); const t = setTimeout(fit, 120); return () => { removeEventListener('resize', fit); clearTimeout(t) };
  }, [fill]);
  useEffect(() => { if (!full) return; const k = e => e.key === 'Escape' && setFull(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [full]);
  useEffect(() => {
    const box = el.current; if (!box) return; box.innerHTML = '';
    const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; w.style.height = '100%'; w.style.width = '100%'; box.appendChild(w);
    const sc = document.createElement('script'); sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; sc.async = true;
    const light = store.s.settings.theme === 'light';
    let tz = 'Etc/UTC'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz } catch (e) { }
    sc.innerHTML = JSON.stringify({ autosize: true, symbol, interval, timezone: tz, theme: light ? 'light' : 'dark', style: '1', locale: 'en', backgroundColor: light ? '#FFFFFF' : '#000000', gridColor: light ? 'rgba(10,14,30,0.06)' : 'rgba(255,255,255,0.05)', allow_symbol_change: true, withdateranges: true, hide_side_toolbar: false, details: false, calendar: false, save_image: true, studies, support_host: 'https://www.tradingview.com' });
    sc.onerror = () => { box.innerHTML = '<div class="dim" style="height:100%;display:grid;place-items:center;text-align:center;padding:20px">TradingView could not load. Check your connection, then reopen this page.</div>' };
    box.appendChild(sc);
    return () => { box.innerHTML = '' };
  }, [symbol, interval, store.s.settings.theme]);
  const height = full ? '100%' : (fill ? hh : (h || 560)) + 'px';
  return html`<div ref=${wrap} class=${'tvwrap' + (full ? ' full' : '')} style=${{ height }}>
    <button class="tvfull btn btn-g xs" onClick=${() => setFull(!full)} title=${full ? 'Exit full screen (Esc)' : 'Full screen'}><${I} n=${full ? 'x' : 'ext'} s=${13}/>${full ? 'Close' : 'Full screen'}</button>
    <div class="tradingview-widget-container" ref=${el} style=${{ position: 'absolute', inset: 0 }}></div></div>`;
}
function TVSymPicker({ sym, setSym, fam }) {
  return html`<div class="row" style=${{ gap: '6px' }}>${TV_PICKS.map(([k, l]) => html`<button key=${k} class=${'chip' + (sym === k ? ' on' : '')} onClick=${() => { setSym(k); fam && LS.set('compound.tvsym.' + fam, k) }}>${l}</button>`)}</div>`;
}

function ChartPage({ C }) {
  const { S, D } = C; const charts = Object.values(S.charts).sort((a, b) => b.to - a.to);
  const [sel, setSel] = useState(null); const [tf, setTf] = useState(0); const [bars, setBars] = useState(null); const [imp, setImp] = useState(false); const [showT, setShowT] = useState(true);
  const ch = S.charts[sel] || charts[0];
  const [mode, setMode] = useState(LIVE_OK ? LS.get('compound.chartmode', 'live') : 'replay');
  const [lsym, setLsym] = useState(() => tvSymFor(S.settings.defaultSymbol || 'MNQ')); const [liv, setLiv] = useState(LS.get('compound.tvint', '5'));
  useEffect(() => { let live = true; setBars(null); if (ch) store.getBars(ch.id).then(b => live && setBars(b)).catch(() => toast('Could not load bars')); return () => { live = false } }, [ch?.id]);
  const tfs = ch ? [1, 3, 5, 15, 30, 60, 240, 1440].filter(x => x >= ch.tf) : [];
  const view = useMemo(() => bars ? resample(bars, tf || ch?.tf, ch?.tf) : null, [bars, tf, ch?.id]);
  const inRangeTs = useMemo(() => ch ? D.ts.filter(t => instr(t.symbol).fam === ch.fam && tTime(t) / 1000 >= ch.from && tTime(t) / 1000 <= ch.to + 3600) : [], [D, ch?.id]);
  return html`<div class="page">
    <${PageHead} title="Price action" sub=${mode === 'live' ? 'Live charts from TradingView' : "TradingView's chart engine with your trades on the candles"}>
      ${ch && html`<a class="btn btn-g" href=${tvURL(ch.symbol)} target="_blank" rel="noopener"><${I} n="ext"/>Live ${ch.symbol} on TradingView</a>`}
      ${LIVE_OK && html`<${Seg} v=${mode} set=${v => { setMode(v); LS.set('compound.chartmode', v); store.emit() }} opts=${[['live', 'Live TradingView', 'chartl'], ['replay', 'My trades on candles', 'candle']]}/>`}
      ${mode === 'replay' && html`<button class="btn btn-w" onClick=${() => setImp(true)}><${I} n="upload"/>Import bars</button>`}<//>
    ${mode === 'live' ? html`<div class="bar"><${TVSymPicker} sym=${lsym} setSym=${setLsym} fam=${instr(S.settings.defaultSymbol || 'MNQ').fam}/><span class="sp"></span><${Seg} sm v=${liv} set=${v => { setLiv(v); LS.set('compound.tvint', v) }} opts=${[['1', '1m'], ['5', '5m'], ['15', '15m'], ['60', '1h'], ['240', '4h'], ['D', '1D']]}/></div>
      <${TVLive} symbol=${lsym} interval=${liv} fill/>
      <div class="dim" style=${{ fontSize: '11px' }}>CME futures can only be charted live on TradingView's own site, so this uses the same indexes as CFDs (NAS100 moves with NQ/MNQ). Search any other symbol in the chart's toolbar. To see your own entries on the candles, switch to "My trades on candles".</div>`
    : !charts.length ? html`<div class="grid g2">
      <div class="card" style=${{ padding: '26px' }}><h3 style=${{ fontSize: '16px' }}>See every entry on real candles</h3><p class="mut" style=${{ fontSize: '12.5px', lineHeight: 1.6 }}>Compound draws with TradingView's own charting library. Live TradingView widgets can't run inside this page, so bring the bars in once: export chart data from TradingView and drop the CSV here. Each trade then shows its entry arrow, exit, stop and target on the exact candles, and every trade's detail page gets its own zoomed chart.</p>
        <div class="row"><button class="btn btn-w" onClick=${() => setImp(true)}><${I} n="upload"/>Import TradingView CSV</button><a class="btn btn-g" href=${tvURL(S.settings.defaultSymbol || 'MNQ')} target="_blank" rel="noopener"><${I} n="ext"/>Open ${S.settings.defaultSymbol || 'MNQ'} chart</a></div></div>
      <div class="card" style=${{ padding: '26px' }}><div class="lbl" style=${{ marginBottom: '12px' }}>Also works</div><div class="col" style=${{ gap: '12px', fontSize: '12.5px' }}>
        <div class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: '10px' }}><${I} n="image"/><span><b>Paste chart screenshots</b> straight into any trade. In TradingView, the camera icon → Copy image, then paste.</span></div>
        <div class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: '10px' }}><${I} n="link"/><span><b>Snapshot links</b> (tradingview.com/x/…) saved on the trade open in one tap.</span></div>
        <div class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: '10px' }}><${I} n="spark"/><span><b>AI review</b> reads your screenshots and grades the entry against your strategy.</span></div></div></div></div>`
    : html`<div class="bar"><select class="sel" style=${{ width: 'auto', minWidth: '220px' }} value=${ch?.id} onChange=${e => { setSel(e.target.value); setTf(0) }}>${charts.map(c => html`<option value=${c.id}>${c.symbol} · ${c.tf}m · ${fmtDate(c.from * 1000)}–${fmtDate(c.to * 1000)}</option>`)}</select>
        <${Seg} sm v=${tf || ch.tf} set=${setTf} opts=${tfs.map(x => [x, x >= 1440 ? '1D' : x >= 60 ? x / 60 + 'h' : x + 'm'])}/>
        <label class="row" style=${{ gap: '6px', fontSize: '11.5px', cursor: 'pointer' }}><input type="checkbox" checked=${showT} onChange=${e => setShowT(e.target.checked)}/>My trades (${inRangeTs.length})</label>
        <span class="sp"></span><button class="btn btn-t xs" onClick=${() => UI.confirm({ title: 'Delete this chart data?', body: `${ch.n.toLocaleString()} bars of ${ch.symbol}. Your trades are not affected.`, onYes: () => { store.delBars(ch.id, ch.chunks); store.del('charts', ch.id); setSel(null) } })}><${I} n="trash" s=${14}/>Delete</button></div>
      <div class="card" style=${{ padding: '10px' }}>${view ? html`<${PriceChart} bars=${view} trades=${showT ? inRangeTs : []} h=${520} onPick=${id => UI.open('detail', { id, list: inRangeTs.map(t => t.id) })}/>` : html`<div class="dim" style=${{ height: '520px', display: 'grid', placeItems: 'center' }}>Loading bars…</div>`}</div>
      ${inRangeTs.length > 0 && html`<div class="card" style=${{ padding: 0 }}><div class="ch" style=${{ padding: '14px 20px 0' }}><span class="lbl">Trades on this chart</span></div><${TradeTable} ts=${inRangeTs} S=${S}/></div>`}`}
    ${imp && html`<${ChartImport} onClose=${id => { setImp(false); if (id) setSel(id) }}/>`}
  </div>`;
}

/* ---------------- Study ---------------- */
function ColumnArt() {
  const lines = []; for (let i = 0; i < 26; i++) { const x = 46 + i * 3.4; lines.push(html`<line key=${i} x1=${x} x2=${x} y1="70" y2="300" stroke="var(--fg2)" stroke-width=${i % 3 === 0 ? 1.4 : .7} opacity=${.35 + .5 * Math.sin(i / 26 * Math.PI)}/>`) }
  return html`<svg viewBox="0 0 220 330" width="190" style=${{ maxWidth: '100%', height: 'auto', opacity: .85 }} aria-hidden="true">
    <path d="M20 54 Q30 22 60 30 Q80 10 110 22 Q140 10 160 30 Q190 22 200 54 Z" fill="none" stroke="var(--fg2)" stroke-width="1.2" opacity=".7"/>
    <circle cx="40" cy="48" r="13" fill="none" stroke="var(--fg2)" opacity=".6"/><circle cx="180" cy="48" r="13" fill="none" stroke="var(--fg2)" opacity=".6"/>
    <rect x="30" y="58" width="160" height="10" fill="none" stroke="var(--fg2)" opacity=".6"/>${lines}
    <rect x="34" y="300" width="152" height="10" fill="none" stroke="var(--fg2)" opacity=".6"/><rect x="24" y="310" width="172" height="12" fill="none" stroke="var(--fg2)" opacity=".5"/></svg>`;
}
function Study({ C }) {
  const { S, D } = C; const [tab, setTab] = useState('home'); const [open, setOpen] = useState(null); const [q, setQ] = useState(''); const [focus, setFocus] = useState(false); const [src, setSrc] = useState('yt'); const [link, setLink] = useState(''); const [tr, setTr] = useState('');
  const notes = Object.values(S.notes).sort((a, b) => (b.u || 0) - (a.u || 0));
  const qi = useMemo(() => (new Date().getDate() + new Date().getMonth()) % QUOTES.length, []); const Q = QUOTES[qi];
  const wk = [0, 1, 2, 3, 4, 5, 6].map(i => { const k = dayKey(addDays(weekStart(new Date()), i)); return { l: DOW[i][0], v: S.days[k]?.study || 0, k } });
  const wkMin = sum(wk, x => x.v); const todayMin = S.days[todayKey()]?.study || 0;
  const newNote = (p = {}) => { const n = store.put('notes', { title: '', body: '', created: Date.now(), folder: 'General', ...p }); setOpen(n.id); setTab('notes') };
  const shown = notes.filter(n => !q || (n.title + ' ' + n.body).toLowerCase().includes(q.toLowerCase()));
  return html`<div class="page">
    <${PageHead} title="Study room" sub=${`${notes.length} notes · ${Object.keys(S.boards).length} boards · ${wkMin} min this week`}>
      <${Seg} v=${tab} set=${setTab} opts=${[['home', 'Home', 'home'], ['notes', 'Notes', 'note'], ['boards', 'Boards', 'board']]}/>
      <button class="btn btn-g" onClick=${() => newNote()}><${I} n="plus"/>New note</button><span class="pill"><${I} n="clock" s=${14}/><b>${todayMin}</b> min</span><button class="btn btn-w" onClick=${() => setFocus(true)}>Close the door</button><//>
    ${tab === 'home' && html`
      <div class="card" style=${{ padding: 'clamp(22px,4vw,48px)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '24px', alignItems: 'center', background: 'radial-gradient(90% 120% at 100% 0%,var(--accs),transparent 60%),var(--card)' }}>
        <div><div style=${{ fontWeight: 700, marginBottom: '18px' }}>Time.</div><div class="quote">${Q.q}</div><div class="lbl" style=${{ marginTop: '26px', letterSpacing: '.12em' }}>${Q.a}</div></div><div class="hide-m"><${ColumnArt}/></div></div>
      <div class="row"><${Seg} v=${src} set=${setSrc} opts=${[['yt', 'YouTube video', 'yt'], ['tr', 'My trade', 'chartl']]}/><span class="mut" style=${{ fontSize: '12px' }}>Study from a video, your own trade, or both.</span></div>
      ${src === 'yt' ? html`<div class="search" style=${{ height: '48px' }}><${I} n="link"/><input placeholder="What video are these notes from? Paste a YouTube link" value=${link} onInput=${e => setLink(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && link.trim()) { newNote({ yt: link.trim(), title: 'Video notes' }); setLink('') } }}/><button class="btn btn-w xs" disabled=${!link.trim()} onClick=${() => { newNote({ yt: link.trim(), title: 'Video notes' }); setLink('') }}>Start notes</button></div>`
        : html`<div class="row" style=${{ flexWrap: 'nowrap' }}><select class="sel" value=${tr} onChange=${e => setTr(e.target.value)}><option value="">Pick a trade to study</option>${D.ts.slice(0, 150).map(t => html`<option value=${t.id}>${fmtDate(t.t)} · ${t.symbol} ${t.side} · ${money(t.pnl, { sign: true })}</option>`)}</select><button class="btn btn-w sm" disabled=${!tr} onClick=${() => { const t = S.trades[tr]; newNote({ trade: tr, title: `Study: ${t.symbol} ${fmtDate(t.t)}` }) }}>Start notes</button></div>`}
      <div class="grid g2">
        <div class="card row" style=${{ gap: '18px', flexWrap: 'nowrap' }}><${Ring} v=${Math.min(100, wkMin / 300 * 100)} size=${72}>${Math.round(wkMin / 300 * 100)}%</${Ring}><div style=${{ flex: 1 }}><div class="lbl">This week</div><div style=${{ fontSize: '23px', fontWeight: 800 }}>${wkMin} min</div><div class="mut" style=${{ fontSize: '11.5px' }}>Today ${todayMin} min · goal 300 min/week</div></div><div style=${{ width: '180px' }}><${Bars} data=${wk} h=${90} fmt=${v => v + 'm'} color="var(--acc)"/></div></div>
        <div class="card"><div class="ch"><span class="lbl">Recent</span><span class="sp"></span><button class="lnk" onClick=${() => setTab('notes')}>All notes →</button></div>${notes.length ? notes.slice(0, 5).map(n => html`<button key=${n.id} class="row" style=${{ width: '100%', padding: '8px 0', borderBottom: '1px solid var(--line)', flexWrap: 'nowrap' }} onClick=${() => { setOpen(n.id); setTab('notes') }}><${I} n=${n.yt ? 'yt' : n.trade ? 'chartl' : 'note'}/><b style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${n.title || 'Untitled'}</b><span class="sp"></span><span class="dim" style=${{ fontSize: '10.5px' }}>${fmtDate(n.u)}</span></button>`) : html`<div class="empty" style=${{ padding: '20px' }}><b>No notes yet.</b><button class="lnk" onClick=${() => newNote()}>Start a blank note</button></div>`}</div>
      </div>`}
    ${tab === 'notes' && html`<div class="grid notesg">
      <div class="col" style=${{ gap: '8px' }}><div class="search"><${I} n="search"/><input placeholder="Search notes" value=${q} onInput=${e => setQ(e.target.value)}/></div>
        ${shown.map(n => html`<button key=${n.id} class=${'acct' + (open === n.id ? ' on' : '')} onClick=${() => setOpen(n.id)}><div class="row" style=${{ flexWrap: 'nowrap' }}><${I} n=${n.yt ? 'yt' : n.trade ? 'chartl' : 'note'} s=${14}/><b style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${n.title || 'Untitled'}</b></div><div class="dim" style=${{ fontSize: '10.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${(n.body || '').slice(0, 80) || 'Empty'}</div></button>`)}
        ${!shown.length && html`<div class="dim" style=${{ padding: '10px' }}>No notes.</div>`}</div>
      ${S.notes[open] ? html`<${NoteEditor} key=${open} n=${S.notes[open]} S=${S} onDel=${() => setOpen(null)}/>` : html`<${Empty} icon="note" title="Pick a note" body="Or start one from a video or a trade."><button class="btn btn-w" onClick=${() => newNote()}>New note</button><//>`}</div>`}
    ${tab === 'boards' && html`<${Boards} S=${S}/>`}
    ${focus && html`<${Focus} onClose=${() => setFocus(false)} quote=${Q}/>`}
  </div>`;
}
function NoteEditor({ n, S, onDel }) {
  const up = p => store.put('notes', { ...S.notes[n.id], ...p }, 700); const t = n.trade && S.trades[n.trade];
  const ytId = (n.yt || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/)?.[1];
  return html`<div class="card col" style=${{ gap: '12px' }}>
    <div class="row" style=${{ flexWrap: 'nowrap' }}><input class="in" style=${{ fontSize: '17.5px', fontWeight: 700, border: 0, background: 'transparent', padding: '4px 0' }} placeholder="Untitled" value=${n.title} onInput=${e => up({ title: e.target.value })}/><button class="ib" onClick=${() => UI.confirm({ title: 'Delete note?', body: 'This cannot be undone.', onYes: () => { store.del('notes', n.id); onDel() } })} aria-label="Delete note"><${I} n="trash"/></button></div>
    <div class="row" style=${{ gap: '8px' }}>
      <input class="in" style=${{ maxWidth: '160px' }} placeholder="Folder" value=${n.folder || ''} onInput=${e => up({ folder: e.target.value })}/>
      <div class="search" style=${{ flex: 1, minWidth: '220px' }}><${I} n="yt"/><input placeholder="YouTube link" value=${n.yt || ''} onInput=${e => up({ yt: e.target.value })}/>${ytId && html`<a class="btn btn-t xs" href=${'https://www.youtube.com/watch?v=' + ytId} target="_blank" rel="noopener">Watch<${I} n="ext" s=${12}/></a>`}</div>
    </div>
    ${t && html`<button class="row card tight" style=${{ flexWrap: 'nowrap', gap: '10px' }} onClick=${() => UI.open('detail', { id: t.id })}><${I} n="chartl"/><b>${t.symbol}</b><${Side} s=${t.side}/><span class="dim">${fmtDate(t.t)}</span><span class="sp"></span><${Money} v=${tradeCalc(t, S.settings).pnl}/></button>`}
    <textarea class="ta" style=${{ minHeight: '46vh', fontSize: '13px', lineHeight: 1.7, background: 'transparent', border: 0, padding: 0, boxShadow: 'none' }} placeholder=${'Write as you watch.\n\n• Key idea\n• How it applies to my MNQ trading\n• Rule I will test this week'} value=${n.body} onInput=${e => up({ body: e.target.value })}></textarea>
    <div class="row dim" style=${{ fontSize: '10.5px' }}><span>Saved automatically</span><span class="sp"></span><${AskBtn} label="Turn into rules" q=${`Here are my study notes titled "${n.title}":\n\n${n.body}\n\nTurn these into 3-5 testable trading rules for my strategy and journal checklist.`} C=${{ go: UI.go }}/></div>
  </div>`;
}
function Boards({ S }) {
  const boards = Object.values(S.boards).sort((a, b) => (a.created || 0) - (b.created || 0)); const [sel, setSel] = useState(boards[0]?.id); const b = S.boards[sel] || boards[0]; const [lb, setLb] = useState(null);
  const add = () => { const n = store.put('boards', { name: 'New board', items: [], created: Date.now() }); setSel(n.id) };
  return html`<div class="col" style=${{ gap: '14px' }}>
    <div class="row">${boards.map(x => html`<button key=${x.id} class=${'chip' + (b?.id === x.id ? ' on' : '')} style=${{ height: '30px' }} onClick=${() => setSel(x.id)}>${x.name} · ${(x.items || []).length}</button>`)}<button class="btn btn-g sm" onClick=${add}><${I} n="plus"/>New board</button></div>
    ${!b ? html`<${Empty} icon="board" title="No boards yet" body="Boards are visual swipe files: A+ examples, your worst mistakes, model setups. Paste screenshots straight in."><button class="btn btn-w" onClick=${add}>Create a board</button><//>`
    : html`<div class="card col" style=${{ gap: '12px' }}>
      <div class="row"><input class="in" style=${{ fontSize: '16px', fontWeight: 700, border: 0, background: 'transparent', maxWidth: '420px', padding: 0 }} value=${b.name} onInput=${e => store.put('boards', { ...b, name: e.target.value }, 700)}/><span class="sp"></span><button class="btn btn-t xs" onClick=${() => UI.confirm({ title: 'Delete board?', body: 'Its images are removed.', onYes: () => store.del('boards', b.id) })}><${I} n="trash" s=${13}/>Delete board</button></div>
      <${ShotsEdit} shots=${[]} set=${v => store.put('boards', { ...b, items: [...(b.items || []), ...v.map(x => ({ ...x, cap: '' }))] })} label="Add images to this board"/>
      <div style=${{ columns: '3 260px', columnGap: '12px' }}>${(b.items || []).map((it, i) => html`<div key=${it.id || i} style=${{ breakInside: 'avoid', marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--card2)' }}>
        <img src=${it.url} alt="" style=${{ display: 'block', width: '100%', cursor: 'zoom-in' }} onClick=${() => setLb(it.url)}/>
        <div class="row" style=${{ padding: '8px', flexWrap: 'nowrap' }}><input class="in" style=${{ border: 0, background: 'transparent', padding: '2px 0' }} placeholder="Caption" value=${it.cap || ''} onInput=${e => { const items = [...b.items]; items[i] = { ...it, cap: e.target.value }; store.put('boards', { ...b, items }, 700) }}/><button class="ib" onClick=${() => store.put('boards', { ...b, items: b.items.filter((_, j) => j !== i) })} aria-label="Remove"><${I} n="x" s=${14}/></button></div></div>`)}</div>
    </div>`}${lb && html`<${Lightbox} src=${lb} onClose=${() => setLb(null)}/>`}</div>`;
}
function Focus({ onClose, quote }) {
  const [t0] = useState(Date.now()); const [now, setNow] = useState(Date.now()); const [goal, setGoal] = useState(25);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); let wl; navigator.wakeLock?.request('screen').then(w => wl = w).catch(() => { }); return () => { clearInterval(i); wl?.release?.() } }, []);
  const sec = Math.floor((now - t0) / 1000); const m = Math.floor(sec / 60), s = sec % 60;
  const end = () => { const mins = Math.max(0, Math.round(sec / 60)); if (mins) { const k = todayKey(); const d = store.s.days[k] || { id: k }; store.put('days', { ...d, id: k, study: (d.study || 0) + mins }); toast(`${mins} min of study logged`) } onClose() };
  return html`<div class="focus"><div class="lbl">Door closed · goal ${goal} min</div><div class="t">${pad(m)}:${pad(s)}</div>
    <div class="prog big" style=${{ width: 'min(420px,80vw)' }}><i style=${{ width: clamp(sec / 60 / goal * 100) + '%' }}></i></div>
    <${Seg} sm v=${goal} set=${setGoal} opts=${[[25, '25m'], [50, '50m'], [90, '90m']]}/>
    <div class="quote" style=${{ fontSize: 'clamp(18px,2.4vw,26px)', maxWidth: '34ch', color: 'var(--mut)' }}>${quote.q}</div>
    <button class="btn btn-w" onClick=${end}><${I} n="stop"/>Open the door · log time</button></div>`;
}

/* ---------------- Propfirm ---------------- */
function Spending({ S }) {
  const rows = useMemo(() => firmSpend(S).sort((a, b) => b.spent - a.spent), [store.v]);
  const [pick, setPick] = useState(() => LS.get('compound.spendf', []));
  const setP = v => { setPick(v); LS.set('compound.spendf', v) };
  const valid = pick.filter(f => rows.some(r => r.firm === f)); const on = valid.length ? valid : null;
  const shown = on ? rows.filter(r => on.includes(r.firm)) : rows;
  const tot = { spent: sum(shown, r => r.spent), blownFees: sum(shown, r => r.blownFees), blownN: sum(shown, r => r.blownN), liveN: sum(shown, r => r.liveN), paid: sum(shown, r => r.paid) }; tot.net = tot.paid - tot.spent;
  const hist = Object.values(S.blown || {}).filter(b => !on || on.includes(b.firm)).sort((a, b) => (b.d || '') < (a.d || '') ? -1 : 1);
  const dead = Object.values(S.accounts).filter(a => a.status === 'blown' && (!on || on.includes(a.firm)));
  const tog = f => setP(valid.includes(f) ? valid.filter(x => x !== f) : [...valid, f]);
  return html`
    <div class="card"><div class="ch"><h3>What prop firms have cost you</h3><span class="sp"></span><button class="btn btn-g sm" onClick=${() => UI.open('payout', {})}><${I} n="wallet"/>Previous payout</button><button class="btn btn-w sm" onClick=${() => UI.open('blown')}><${I} n="plus"/>Add blown account</button></div>
      ${rows.length > 0 && html`<div class="row" style=${{ gap: '6px', marginBottom: '14px' }}><button class=${'chip' + (!on ? ' on' : '')} onClick=${() => setP([])}>All firms</button>${rows.map(r => html`<button key=${r.firm} class=${'chip firmchip' + (valid.includes(r.firm) ? ' on' : '')} onClick=${() => tog(r.firm)}><${FirmLogo} id=${r.firm} s=${16}/>${firmById(r.firm).name}</button>`)}${on && html`<span class="dim" style=${{ fontSize: '10.5px' }}>${on.length} selected · tap more to add</span>`}</div>`}
      <div class="grid g5 keep2">
        <${Kpi} small k="Total spent" v=${html`<span class="neg">${money(tot.spent, { dec: 0 })}</span>`} s=${on ? on.map(f => firmById(f).name).join(', ') : 'all firms'}/>
        <${Kpi} small k="Lost to blown accounts" v=${money(tot.blownFees, { dec: 0 })} s=${tot.blownN + ' account' + (tot.blownN === 1 ? '' : 's') + ' blown'}/>
        <${Kpi} small k="Avg cost per blow-up" v=${tot.blownN ? money(tot.blownFees / tot.blownN, { dec: 0 }) : '—'}/>
        <${Kpi} small k="Payouts" v=${html`<span class="pos">${money(tot.paid, { dec: 0 })}</span>`}/>
        <${Kpi} small k="Net" v=${html`<span class=${cls(tot.net)}>${money(tot.net, { sign: true, dec: 0 })}</span>`} s=${tot.spent ? 'ROI ' + pct(tot.net / tot.spent, 0) : ''}/>
      </div></div>
    ${!rows.length ? html`<${Empty} icon="flame" title="No spending logged yet" body="Add the accounts you blew before Compound, with what you paid for each. You will see exactly what every firm has cost you, and what it paid back."><button class="btn btn-w" onClick=${() => UI.open('blown')}>Add blown account</button><//>`
    : html`<div class="grid g2">
      <div class="card"><div class="ch"><span class="lbl">Spent vs paid out, per firm</span></div>
        <div class="col" style=${{ gap: '12px' }}>${shown.map(r => { const mx = Math.max(1, ...shown.map(x => Math.max(x.spent, x.paid))); return html`<div key=${r.firm} class="col" style=${{ gap: '5px' }}>
          <div class="row" style=${{ gap: '8px' }}><${FirmLogo} id=${r.firm} s=${20}/><b style=${{ fontSize: '12px' }}>${firmById(r.firm).name}</b><span class="sp"></span><span class=${'tn ' + cls(r.net)} style=${{ fontWeight: 700, fontSize: '12px' }}>${money(r.net, { sign: true, dec: 0 })}</span></div>
          <div class="spbar"><i class="neg" style=${{ width: (r.spent / mx * 100) + '%' }}></i></div><div class="spbar"><i class="pos" style=${{ width: (r.paid / mx * 100) + '%' }}></i></div>
          <div class="dim tn" style=${{ fontSize: '10.5px' }}>${money(r.spent, { dec: 0 })} spent · ${money(r.paid, { dec: 0 })} paid out · ${r.blownN} blown${r.liveN ? ' · ' + r.liveN + ' tracked' : ''}</div></div>` })}</div></div>
      <div class="card" style=${{ padding: 0 }}><div class="ch" style=${{ padding: '16px 20px 0' }}><span class="lbl">Per firm</span></div><div class="scroll-x"><table class="tbl"><thead><tr><th>Firm</th><th class="r">Blown</th><th class="r">Fees lost</th><th class="r">Total spent</th><th class="r">Payouts</th><th class="r">Net</th></tr></thead><tbody>
        ${shown.map(r => html`<tr key=${r.firm} class="click" onClick=${() => tog(r.firm)}><td><span class="row" style=${{ gap: '8px', flexWrap: 'nowrap' }}><${FirmLogo} id=${r.firm} s=${18}/>${firmById(r.firm).name}</span></td><td class="r tn">${r.blownN}</td><td class="r tn neg">${money(r.blownFees, { dec: 0 })}</td><td class="r tn">${money(r.spent, { dec: 0 })}</td><td class="r tn pos">${money(r.paid, { dec: 0 })}</td><td class=${'r tn ' + cls(r.net)} style=${{ fontWeight: 700 }}>${money(r.net, { sign: true, dec: 0 })}</td></tr>`)}
        ${shown.length > 1 && html`<tr><td><b>Total</b></td><td class="r tn"><b>${tot.blownN}</b></td><td class="r tn neg"><b>${money(tot.blownFees, { dec: 0 })}</b></td><td class="r tn"><b>${money(tot.spent, { dec: 0 })}</b></td><td class="r tn pos"><b>${money(tot.paid, { dec: 0 })}</b></td><td class=${'r tn ' + cls(tot.net)}><b>${money(tot.net, { sign: true, dec: 0 })}</b></td></tr>`}
      </tbody></table></div></div></div>
      <div class="card" style=${{ padding: 0 }}><div class="ch" style=${{ padding: '16px 20px 0' }}><span class="lbl">Blown accounts · ${hist.length + dead.length}</span><span class="sp"></span><button class="btn btn-t xs" onClick=${() => UI.open('blown')}><${I} n="plus" s=${13}/>Add</button></div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Blown on</th><th>Firm</th><th>Account</th><th>Stage</th><th class="r">Count</th><th class="r">Fees</th><th>Note</th></tr></thead><tbody>
          ${hist.map(b => html`<tr key=${b.id} class="click" onClick=${() => UI.open('blown', { id: b.id })}><td class="tn">${b.d ? fmtDate(parseDay(b.d), { year: true }) : '—'}</td><td><span class="row" style=${{ gap: '8px', flexWrap: 'nowrap' }}><${FirmLogo} id=${b.firm} s=${18}/>${firmById(b.firm).name}</span></td><td class="mut">${b.size ? '$' + (b.size / 1000) + 'K' : ''}${b.plan ? ' · ' + b.plan : ''}</td><td><span class="chip">${b.stage === 'funded' ? 'Funded' : 'Eval'}</span></td><td class="r tn">${Math.max(1, +b.count || 1)}</td><td class="r tn neg" style=${{ fontWeight: 700 }}>${money(blownCost(b), { dec: 0 })}</td><td class="mut">${b.note || ''}</td></tr>`)}
          ${dead.map(a => html`<tr key=${a.id} class="click" onClick=${() => UI.open('account', { id: a.id })}><td class="tn">${a.blownAt ? fmtDate(parseDay(String(a.blownAt).slice(0, 10)), { year: true }) : '—'}</td><td><span class="row" style=${{ gap: '8px', flexWrap: 'nowrap' }}><${FirmLogo} id=${a.firm} s=${18}/>${firmById(a.firm).name}</span></td><td class="mut">${a.label}</td><td><span class="chip">${a.type === 'funded' ? 'Funded' : 'Eval'}</span></td><td class="r tn">1</td><td class="r tn neg" style=${{ fontWeight: 700 }}>${money(acctCost(a), { dec: 0 })}</td><td class="mut">tracked in Compound</td></tr>`)}
        </tbody></table></div></div>`}`;
}

function Propfirm({ C }) {
  const { S } = C; const [tab, setTab] = useState(() => LS.get('compound.ptab', 'accounts')); const setTabS = v => { setTab(v); LS.set('compound.ptab', v) }; const [arch, setArch] = useState(false);
  const { all } = useMemo(() => computeTrades(S, { mode: 'all', dedupe: false }), [store.v]);
  const accs = Object.values(S.accounts).sort((a, b) => (a.created || 0) - (b.created || 0));
  const st = a => acctState(a, all, Object.values(S.adjust).filter(x => x.account === a.id));
  const groups = [['eval', 'Evals'], ['funded', 'Funded'], ['live', 'Live & personal']].map(([k, l]) => [l, accs.filter(a => a.type === k && a.status === 'active')]);
  const archived = accs.filter(a => a.status !== 'active');
  const payouts = Object.values(S.payouts).filter(p => p.status === 'paid'); const paid = sum(payouts, p => p.amount);
  const hist = Object.values(S.blown || {});
  const spent = sum(accs, acctCost) + sum(hist, blownCost);
  const passed = accs.filter(a => a.status === 'passed' || a.type === 'funded').length, blown = accs.filter(a => a.status === 'blown').length + sum(hist, b => Math.max(1, +b.count || 1));
  return html`<div class="page">
    <${PageHead} title="Prop firms" sub="Every eval, funded account and payout in one place"><${Seg} v=${tab} set=${setTabS} opts=${[['accounts', 'Accounts'], ['spend', 'Spending'], ['payouts', 'Payouts'], ['certs', 'Certificates'], ['firms', 'Firms']]}/><//>
    <div class="grid g6 keep2">
      <${Kpi} small k="Active evals" v=${accs.filter(a => a.type === 'eval' && a.status === 'active').length}/><${Kpi} small k="Funded" v=${accs.filter(a => a.type === 'funded' && a.status === 'active').length}/>
      <${Kpi} small k="Fees spent" v=${money(spent, { dec: 0 })}/><${Kpi} small k="Payouts" v=${html`<span class="pos">${money(paid, { dec: 0 })}</span>`}/>
      <${Kpi} small k="Net prop P&L" v=${html`<span class=${cls(paid - spent)}>${money(paid - spent, { sign: true, dec: 0 })}</span>`} s=${spent ? 'ROI ' + pct((paid - spent) / spent, 0) : ''}/><${Kpi} small k="Pass rate" v=${passed + blown ? pct(passed / (passed + blown), 0) : '—'} s=${`${passed} passed · ${blown} blown`}/>
    </div>
    ${tab === 'accounts' && html`
      <button class="card" style=${{ borderStyle: 'dashed', textAlign: 'center', padding: '14px', color: 'var(--fg2)', fontWeight: 600 }} onClick=${() => UI.open('account')}><span class="row" style=${{ justifyContent: 'center' }}><${I} n="plus"/>Add another account</span></button>
      ${!accs.length && html`<${Empty} icon="building" title="No prop accounts yet" body="Add your Lucid, Tradeify or any other account. Compound tracks drawdown, daily limit, consistency and your distance to target from the trades you log."><button class="btn btn-w" onClick=${() => UI.open('account')}>Add account</button><//>`}
      ${groups.filter(g => g[1].length).map(([l, list]) => html`<div key=${l}><div class="lbl" style=${{ marginBottom: '10px' }}>${l} · ${list.length}</div><div class="grid" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))' }}>${list.map(a => html`<${PropCard} key=${a.id} a=${a} st=${st(a)} S=${S}/>`)}</div></div>`)}
      <div class="card tight row"><${I} n="wallet"/><span class="mut">Already funded? Add the account and track it here.</span><span class="sp"></span><button class="btn btn-w sm" onClick=${() => UI.open('account')}>Add funded account</button></div>
      ${archived.length > 0 && html`<div><button class="sech" onClick=${() => setArch(!arch)} style=${{ width: '100%' }}><span class="lbl">Archive · ${archived.length}</span><${I} n="down" c="chev"/></button>${arch && html`<div class="grid" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))' }}>${archived.map(a => html`<${PropCard} key=${a.id} a=${a} st=${st(a)} S=${S}/>`)}</div>`}</div>`}`}
    ${tab === 'spend' && html`<${Spending} S=${S}/>`}
    ${tab === 'payouts' && html`<div class="card"><div class="ch"><h3>Payouts</h3><span class="sp"></span><button class="btn btn-w sm" onClick=${() => UI.open('payout')}><${I} n="plus"/>Record payout</button></div>
      ${Object.values(S.payouts).length ? html`<div style=${{ marginBottom: '14px' }}><${Bars} h=${170} color="var(--pos)" data=${Object.values(S.payouts).sort((a, b) => a.d < b.d ? -1 : 1).map(p => ({ l: fmtDate(parseDay(p.d)), v: p.amount, sub: S.accounts[p.account]?.label || (p.firm ? firmById(p.firm).name : '') }))}/></div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Date</th><th>Account</th><th>Status</th><th>Note</th><th class="r">Amount</th></tr></thead><tbody>${Object.values(S.payouts).sort((a, b) => a.d < b.d ? 1 : -1).map(p => html`<tr class="click" key=${p.id} onClick=${() => UI.open('payout', { id: p.id })}><td>${fmtDate(parseDay(p.d), { year: true })}</td><td><span class="row" style=${{ gap: '8px' }}>${payoutFirm(S, p) && html`<${FirmLogo} id=${payoutFirm(S, p)} s=${20}/>`}${S.accounts[p.account]?.label || (p.past ? firmById(p.firm).name + (p.acctLabel ? ' · ' + p.acctLabel : '') : '—')}${p.past && html`<span class="chip" style=${{ height: '20px' }}>previous</span>`}</span></td><td><span class=${'status ' + (p.status === 'paid' ? 'st-passed' : 'st-active')}>${p.status}</span></td><td class="mut">${p.note}</td><td class="r pos" style=${{ fontWeight: 700 }}>${money(p.amount)}</td></tr>`)}</tbody></table></div>`
        : html`<${Empty} icon="wallet" title="No payouts yet" body="Record each withdrawal. Compound shows your real prop ROI: payouts against every fee you paid."/>`}</div>`}
    ${tab === 'certs' && html`<div class="grid g3">${[...accs.filter(a => a.status === 'passed' || (a.type === 'funded')).map(a => ({ k: 'pass', a, d: a.passedAt || a.start })), ...payouts.map(p => ({ k: 'pay', p, a: S.accounts[p.account] || (p.firm ? { firm: p.firm, label: p.acctLabel || '' } : null), d: p.d }))].sort((x, y) => x.d < y.d ? 1 : -1).map((c, i) => html`<div class="cert" key=${i}>
        <div class="row"><${Mark} s=${22}/><span class="lbl">${c.k === 'pay' ? 'Payout certificate' : 'Evaluation passed'}</span></div>
        <div><div class="amt tn">${c.k === 'pay' ? money(c.p.amount, { dec: 0 }) : money(+c.a.size, { dec: 0 })}</div><div class="mut">${c.a ? firmById(c.a.firm).name + ' · ' + (c.a.label || '') : ''}</div></div>
        <div class="row"><span class="mono dim" style=${{ fontSize: '9.5px' }}>${S.settings.name.toUpperCase()} · ${c.d ? fmtDate(parseDay(String(c.d).slice(0, 10)), { year: true }).toUpperCase() : ''}</span></div>
        <div class="seal">${c.a && html`<${FirmLogo} id=${c.a.firm} s=${40}/>`}</div></div>`)}
      ${!accs.some(a => a.status === 'passed' || a.type === 'funded') && !payouts.length && html`<div style=${{ gridColumn: '1/-1' }}><${Empty} icon="cert" title="Your wall is empty, for now" body="Passed evals and paid payouts turn into certificates here automatically."/></div>`}</div>`}
    ${tab === 'firms' && html`<div class="grid" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>${FIRMS.map(f => { const fa = accs.filter(a => a.firm === f.id); const fs = sum(fa, a => (+a.cost || 0) + (+a.activation || 0)); const fp = sum(payouts.filter(p => S.accounts[p.account]?.firm === f.id), p => p.amount);
      return html`<div class="card" key=${f.id}><div class="row" style=${{ flexWrap: 'nowrap' }}><${FirmLogo} id=${f.id} s=${42}/><div style=${{ minWidth: 0 }}><b>${f.name}</b><div class="dim" style=${{ fontSize: '10.5px' }}>${f.plans.join(' · ')}</div></div></div>
        <div class="grid g3" style=${{ marginTop: '14px', gap: '6px' }}><div><div class="lbl">Accts</div><b>${fa.length}</b></div><div><div class="lbl">Spent</div><b>${moneyK(fs)}</b></div><div><div class="lbl">Paid</div><b class="pos">${moneyK(fp)}</b></div></div>
        <div class="row" style=${{ marginTop: '12px', gap: '6px' }}><label class="btn btn-g xs"><${I} n="upload" s=${12}/>Logo<input type="file" accept="image/*" hidden onChange=${async e => { const f0 = e.target.files[0]; if (!f0) return; const b = await shrinkImage(f0, 160, .9); const d = await blobToData(b); store.setSettings({ firmLogos: { ...S.settings.firmLogos, [f.id]: d } }) }}/></label>${S.settings.firmLogos?.[f.id] && html`<button class="btn btn-t xs" onClick=${() => { const fl = { ...S.settings.firmLogos }; delete fl[f.id]; store.setSettings({ firmLogos: fl }) }}>Reset</button>`}${f.url && html`<a class="btn btn-t xs" href=${f.url} target="_blank" rel="noopener">Site<${I} n="ext" s=${12}/></a>`}<span class="sp"></span><button class="btn btn-g xs" onClick=${() => UI.open('account', { firm: f.id })}><${I} n="plus" s=${12}/>Add</button></div></div>` })}</div>`}
  </div>`;
}
function PropCard({ a, st, S }) {
  const [bal, setBal] = useState(''); const [mc, setMc] = useState(false); const [menu, setMenu] = useState(false);
  const f = firmById(a.firm); const tradingNow = st.days[todayKey()] != null; const sparkVals = st.hist.map(h => h.b);
  const range = (st.target ? st.start + st.target : st.peak + (+a.mll || 1000)) - st.floor; const pos = clamp((st.bal - st.floor) / (range || 1) * 100);
  const z = clamp((st.start - st.floor) / (range || 1) * 100);
  const danger = st.left < (+a.mll || 1) * .3;
  return html`<div class="card pac" style=${{ borderColor: danger && a.status === 'active' ? 'rgba(255,90,110,.35)' : undefined }}>
    <div class="row" style=${{ flexWrap: 'nowrap', gap: '10px' }}><${FirmLogo} id=${a.firm} s=${38}/><div style=${{ minWidth: 0, flex: 1 }}><div class="row" style=${{ gap: '8px', flexWrap: 'nowrap' }}><b style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${f.name} ${(+a.size / 1000)}K ${a.plan ? '· ' + a.plan : ''}</b></div>
      <div class="row" style=${{ gap: '6px', marginTop: '3px' }}><span class=${'status st-' + (a.status === 'active' ? (a.type === 'funded' ? 'funded' : 'active') : a.status)}>${a.status === 'active' ? (a.type === 'eval' ? 'Eval' : a.type === 'funded' ? 'Funded' : 'Live') : a.status}</span><span class="chip">${a.label}</span>${acctMarket(a) === 'cfd' && html`<span class="chip">CFD · ${firmById(a.firm).platform || 'MT5'}</span>`}${tradingNow && html`<span class="chip pos">● Trading today</span>`}${a.mode === 'paper' && html`<span class="chip">Paper</span>`}</div></div>
      <div style=${{ position: 'relative' }}><button class="ib" onClick=${() => setMenu(!menu)} aria-label="Account menu"><${I} n="menu"/></button>
        <${Menu} open=${menu} onClose=${() => setMenu(false)} style=${{ right: 0, top: '36px' }}>
          <button onClick=${() => { setMenu(false); UI.open('account', { id: a.id }) }}><${I} n="edit"/>Edit rules</button>
          <button onClick=${() => { setMenu(false); UI.open('payout', { account: a.id }) }}><${I} n="wallet"/>Record payout</button>
          <button onClick=${() => { setMenu(false); setMc(true) }}><${I} n="layers"/>Pass probability</button>
          <hr/>${a.type === 'eval' && a.status === 'active' && html`<button onClick=${() => { setMenu(false); store.put('accounts', { ...a, status: 'passed', passedAt: todayKey() }); toast('Congrats. Eval marked passed.') }}><${I} n="check"/>Mark passed</button>`}
          ${a.status === 'active' && html`<button onClick=${() => { setMenu(false); store.put('accounts', { ...a, status: 'blown', blownAt: todayKey() }) }}><${I} n="x"/>Mark blown</button>`}
          ${a.status !== 'active' && html`<button onClick=${() => { setMenu(false); store.put('accounts', { ...a, status: 'active' }) }}><${I} n="rotate"/>Reactivate</button>`}
          <hr/><button style=${{ color: 'var(--neg)' }} onClick=${() => { setMenu(false); UI.open('delacct', { id: a.id }) }}><${I} n="trash"/>Delete account</button>
        <//></div></div>
    <div class="row" style=${{ alignItems: 'flex-end' }}><div><div class="lbl">Balance</div><div class="bal">${money(st.bal, { dec: 0 })}</div></div><span class="sp"></span><div style=${{ textAlign: 'right' }}><div class=${'tn ' + cls(st.profit)} style=${{ fontSize: '16.5px', fontWeight: 800 }}>${money(st.profit, { sign: true, dec: 0 })}</div><${Spark} vals=${sparkVals} w=${110} h=${30}/></div></div>
    <div><div class="row" style=${{ justifyContent: 'space-between', marginBottom: '8px' }}><span class="lbl" style=${{ color: danger ? 'var(--neg)' : undefined }}>${money(st.left, { dec: 0 })} left</span>${st.toGo != null && html`<span class="lbl" style=${{ color: 'var(--fg)' }}>${st.toGo > 0 ? money(st.toGo, { dec: 0 }) + ' to go' : 'Target hit'}</span>`}</div>
      <div class="gauge"><span class="z" style=${{ left: z + '%' }}></span><span class="mk" style=${{ left: `calc(${pos}% - 1.5px)` }}></span></div>
      <div class="row dim mono" style=${{ justifyContent: 'space-between', fontSize: '9px', marginTop: '6px' }}><span>Floor ${money(st.floor, { dec: 0 })}</span><span>${st.target ? 'Target ' + money(st.start + st.target, { dec: 0 }) : 'Peak ' + money(st.peak, { dec: 0 })}</span></div></div>
    <div class="col" style=${{ gap: '6px' }}>
      ${st.dll ? html`<div class="kv"><span>Daily left</span><b class=${st.dllLeft < st.dll * .3 ? 'neg' : ''}>${money(st.dllLeft, { dec: 0 })}</b></div>` : null}
      <div class="kv"><span>Peak ${a.dd === 'eod' ? '(EOD)' : ''}</span><b>${money(a.dd === 'eod' ? st.eodPeak : st.peak, { dec: 0 })}</b></div>
      ${st.consLimit ? html`<div class="kv"><span>Consistency · best day ${pct(st.consUsed, 0)} of ${pct(st.consLimit, 0)}</span><b class=${st.consOk ? 'pos' : 'neg'}>${st.consOk ? 'OK' : 'Need +' + money(st.consNeed, { dec: 0 })}</b></div>` : null}
      <div class="kv"><span>Trading days</span><b>${st.tradingDays}${a.minDays ? ' / ' + a.minDays : ''}</b></div>
    </div>
    ${a.status === 'active' && html`<div style=${{ background: 'var(--bg)', borderRadius: '12px', padding: '10px 12px', border: '1px solid var(--line)' }}><div class="lbl" style=${{ marginBottom: '8px' }}>Update balance</div>
      <div class="row" style=${{ flexWrap: 'nowrap' }}><div class="inwrap" style=${{ flex: 1 }}><span class="pre">$</span><input class="in tn" style=${{ fontWeight: 700 }} placeholder=${Math.round(st.bal)} value=${bal} onInput=${e => setBal(e.target.value)}/></div><button class="btn btn-w sm" onClick=${() => { if (!isNum(bal)) return; const d = +bal - st.bal; if (Math.abs(d) > .004) store.put('adjust', { id: uid(), account: a.id, v: Math.round(d * 100) / 100, d: new Date().toISOString(), note: 'Balance sync' }); setBal(''); toast('Balance updated') }}>Update</button></div></div>`}
    <div class="row"><span class="dim" style=${{ fontSize: '11px' }}>Trades (${st.trades.length})</span><span class="sp"></span><button class="btn btn-t xs" onClick=${() => UI.open('assign', { account: a.id })}><${I} n="plus" s=${12}/>Assign</button>${st.trades.length > 0 && html`<button class="btn btn-t xs" onClick=${() => UI.open('detail', { id: st.trades[st.trades.length - 1].id, list: st.trades.map(t => t.id).reverse() })}>View</button>`}</div>
    ${mc && html`<${MonteModal} a=${a} st=${st} S=${S} onClose=${() => setMc(false)}/>`}
  </div>`;
}
function AssignTrades({ account, onClose }) {
  const S = store.s; const { all } = computeTrades(S, { mode: 'all', dedupe: false }); const un = all.filter(t => !t.account); const [sel, setSel] = useState([]);
  return html`<${Modal} title=${'Assign trades to ' + (S.accounts[account]?.label || '')} size="wide" onClose=${onClose} foot=${html`<button class="btn btn-g" onClick=${onClose}>Cancel</button><button class="btn btn-w" disabled=${!sel.length} onClick=${() => { sel.forEach(id => store.patch('trades', id, { account })); toast(`${sel.length} trades assigned`); onClose() }}>Assign ${sel.length || ''}</button>`}>
    ${un.length ? html`<div class="col" style=${{ gap: '6px', maxHeight: '60vh', overflow: 'auto' }}>${un.map(t => { const on = sel.includes(t.id); return html`<button key=${t.id} class="row" style=${{ padding: '9px 10px', borderRadius: '10px', background: 'var(--card)', flexWrap: 'nowrap', width: '100%', gap: '10px' }} onClick=${() => setSel(on ? sel.filter(x => x !== t.id) : [...sel, t.id])}><span class=${'chk' + (on ? ' on' : '')} style=${{ width: 'auto' }}><span class="bx">${on && html`<${I} n="check" w=${3}/>`}</span></span><span class="dim tn">${fmtDate(t.t)} ${fmtTime(t.t)}</span><b>${t.symbol}</b><${Side} s=${t.side}/><span class="sp"></span><${Money} v=${t.pnl}/></button>` })}</div>` : html`<div class="mut">Every trade already has an account.</div>`}<//>`;
}
function MonteModal({ a, st, S, onClose }) {
  const { ts } = computeTrades(S, { mode: 'all' }); const pnls = ts.map(t => t.pnl).filter(v => v != null);
  const [per, setPer] = useState(S.settings.maxTrades || 3); const [scale, setScale] = useState(1);
  const res = useMemo(() => monteCarlo(pnls.map(p => p * scale), { toGo: st.toGo || null, room: st.left, dll: st.dll, perDay: per, maxTrades: 300 }), [per, scale, pnls.length]);
  return html`<${Modal} title="Pass probability" icon=${html`<${I} n="layers"/>`} size="wide" onClose=${onClose}>
    ${!res ? html`<div class="mut">Log at least 5 trades so Compound can resample your real results.</div>` : html`
    <p class="mut" style=${{ margin: 0 }}>3,000 simulated paths that resample your own ${pnls.length} trade results, against this account's ${money(st.left, { dec: 0, show: true })} of room${st.toGo ? ` and ${money(st.toGo, { dec: 0, show: true })} to target` : ''}.</p>
    <div class="grid g4 keep2"><${Kpi} small k=${st.toGo ? 'Reach target' : 'Survive 300 trades'} v=${html`<span class="pos">${pct(st.toGo ? res.pass : res.open + res.pass, 0)}</span>`}/><${Kpi} small k="Hit max loss" v=${html`<span class="neg">${pct(res.blow, 0)}</span>`}/><${Kpi} small k="Median trades to pass" v=${res.med || '—'}/><${Kpi} small k="Undecided" v=${pct(res.open, 0)}/></div>
    <${MCChart} res=${res} top=${st.toGo} bot=${-st.left}/>
    <div class="grid g2"><${Field} label=${'Size multiplier · ' + scale + '×'} hint="What if you traded bigger or smaller?"><input type="range" min="0.25" max="3" step="0.25" value=${scale} onInput=${e => setScale(+e.target.value)}/><//><${Field} label=${'Trades per day · ' + per}><input type="range" min="1" max="10" value=${per} onInput=${e => setPer(+e.target.value)}/><//></div>`}<//>`;
}
function MCChart({ res, top, bot, h = 260 }) {
  const [ref, W] = useWidth(700); const H = h, L = 56, R = 10, T = 10, B = 20; const curves = res.curves; const maxN = Math.max(...curves.map(c => c.length));
  const all = curves.flat(); let mn = Math.min(bot ?? 0, ...all), mx = Math.max(top ?? 0, ...all);
  const X = i => L + i / (maxN - 1 || 1) * (W - L - R), Y = v => T + (mx - v) / (mx - mn || 1) * (H - T - B);
  return html`<div ref=${ref}><svg class="svgc" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} style=${{ display: 'block', maxWidth: '100%' }}>
    ${niceTicks(mn, mx, 4).filter(t => t >= mn && t <= mx).map(t => html`<g key=${t}><line x1=${L} x2=${W - R} y1=${Y(t)} y2=${Y(t)} stroke="var(--line)" stroke-dasharray="2 4"/><text x=${L - 8} y=${Y(t) + 3} text-anchor="end">${moneyK(t, { show: true })}</text></g>`)}
    ${curves.map((c, i) => html`<polyline key=${i} points=${c.map((v, j) => X(j) + ',' + Y(v)).join(' ')} fill="none" stroke=${c[c.length - 1] >= (top ?? Infinity) ? 'var(--pos)' : c[c.length - 1] <= bot ? 'var(--neg)' : 'var(--acc)'} stroke-width="1" opacity=".35"/>`)}
    ${top != null && html`<line x1=${L} x2=${W - R} y1=${Y(top)} y2=${Y(top)} stroke="var(--pos)" stroke-width="1.5"/>`}<line x1=${L} x2=${W - R} y1=${Y(bot)} y2=${Y(bot)} stroke="var(--neg)" stroke-width="1.5"/>
    <line x1=${L} x2=${W - R} y1=${Y(0)} y2=${Y(0)} stroke="var(--line3)"/></svg></div>`;
}

/* ---------------- Progress (replaces referral points) ---------------- */
function Progress({ C }) {
  const { S, D } = C; const all = Object.values(S.trades);
  const days = S.days; const dk = new Set([...all.map(t => dayKey(t.t)), ...Object.keys(days).filter(k => days[k].review || days[k].plan || days[k].study)]);
  let xp = 0; for (const t of all) xp += 5 + ((t.notes || '').length > 12 ? 4 : 0) + (t.grade ? 2 : 0) + ((t.shots || []).length ? 4 : 0); for (const k in days) { const d = days[k]; xp += (d.plan ? 10 : 0) + (d.review ? 15 : 0) + (d.study || 0) } xp += Object.values(S.payouts).length * 150 + Object.values(S.notes).length * 5;
  const lvl = Math.floor(Math.sqrt(xp / 60)) + 1; const cur = 60 * (lvl - 1) ** 2, nxt = 60 * lvl ** 2;
  let streak = 0; { let d = new Date(); if (!dk.has(dayKey(d))) d = addDays(d, -1); while (true) { const wd = d.getDay(); if (wd === 0 || wd === 6) { d = addDays(d, -1); continue } if (dk.has(dayKey(d))) { streak++; d = addDays(d, -1) } else break; if (streak > 999) break } }
  const s = stats(D.ts); const greenWeeks = [...groupBy(D.ts, t => dayKey(weekStart(t.t))).values()].filter(w => sum(w, t => t.pnl) > 0).length;
  const ruleTrades = all.filter(t => t.rules === true).length; const studyMin = sum(Object.values(days), d => d.study || 0);
  const badges = [['First trade', all.length >= 1, 'book'], ['10 trades', all.length >= 10, 'list'], ['50 trades', all.length >= 50, 'layers'], ['100 trades', all.length >= 100, 'trophy'], ['First green week', greenWeeks >= 1, 'chartl'], ['5 green weeks', greenWeeks >= 5, 'flame'], ['5-day streak', streak >= 5, 'flame'], ['20 rule-perfect trades', ruleTrades >= 20, 'shield'], ['First payout', Object.values(S.payouts).length >= 1, 'wallet'], ['Funded', Object.values(S.accounts).some(a => a.type === 'funded' || a.status === 'passed'), 'cert'], ['10 hours of study', studyMin >= 600, 'column'], ['Strategy written', Object.keys(S.strategies).length >= 1, 'target']];
  const weeks = 26; const start = addDays(weekStart(new Date()), -7 * (weeks - 1)); const cells = [];
  for (let i = 0; i < weeks * 7; i++) { const d = addDays(start, i); const k = dayKey(d); const n = all.filter(t => dayKey(t.t) === k).length + (days[k]?.review ? 2 : 0) + (days[k]?.plan ? 1 : 0) + (days[k]?.study ? 1 : 0); cells.push({ k, n, fut: d > new Date() }) }
  return html`<div class="page">
    <${PageHead} title="Progress" sub="Process over outcome. These only go up when you do the work."/>
    <div class="grid g3">
      <div class="card row" style=${{ gap: '18px', flexWrap: 'nowrap' }}><${Ring} v=${(xp - cur) / (nxt - cur) * 100} size=${86} w=${8}>L${lvl}</${Ring}><div><div class="lbl">Level</div><div style=${{ fontSize: '24.5px', fontWeight: 900 }}>${xp.toLocaleString()} XP</div><div class="mut" style=${{ fontSize: '11.5px' }}>${(nxt - xp).toLocaleString()} XP to level ${lvl + 1}</div></div></div>
      <div class="card row" style=${{ gap: '16px', flexWrap: 'nowrap' }}><span class="logo" style=${{ width: '56px', height: '56px', background: 'linear-gradient(140deg,#FF8A4C,#F3B43F)' }}><${I} n="flame" s=${26}/></span><div><div class="lbl">Journal streak</div><div style=${{ fontSize: '24.5px', fontWeight: 900 }}>${streak} day${streak === 1 ? '' : 's'}</div><div class="mut" style=${{ fontSize: '11.5px' }}>Weekdays with a trade, plan or review</div></div></div>
      <div class="card"><div class="lbl">How XP is earned</div><div class="mut" style=${{ fontSize: '11.5px', lineHeight: 1.7, marginTop: '6px' }}>Trade logged 5 · with notes +4 · screenshot +4 · graded +2<br/>Plan 10 · review 15 · study 1/min · payout 150</div></div>
    </div>
    <div class="card"><div class="ch"><span class="lbl">Last 26 weeks</span><span class="sp"></span><span class="legend"><span><i style=${{ background: 'var(--card2)' }}></i>none</span><span><i style=${{ background: 'var(--acc)', opacity: .4 }}></i>some</span><span><i style=${{ background: 'var(--acc)' }}></i>full day</span></span></div>
      <div class="scroll-x"><div class="hm">${cells.map(c => html`<i key=${c.k} title=${c.k + ' · ' + c.n} style=${{ background: c.fut ? 'transparent' : c.n ? 'var(--acc)' : undefined, opacity: c.n ? Math.min(1, .25 + c.n / 6) : 1 }}></i>`)}</div></div></div>
    <div><div class="lbl" style=${{ marginBottom: '12px' }}>Milestones · ${badges.filter(b => b[1]).length}/${badges.length}</div>
      <div class="grid" style=${{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>${badges.map(([n, got, ic]) => html`<div key=${n} class="card tight" style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', textAlign: 'center', opacity: got ? 1 : .5 }}><div class=${'badge' + (got ? ' got' : '')}><${I} n=${ic} c=${got ? 'gold' : 'dim'}/></div><b style=${{ fontSize: '11.5px' }}>${n}</b></div>`)}</div></div>
  </div>`;
}

/* ================= Compound · Analytics & AI ================= */
function dims(S) {
  return {
    strategy: ['Strategy', t => S.strategies[t.strategy]?.name || 'No strategy'],
    setup: ['Setup', t => t.setups?.length ? t.setups : ['No setup']],
    side: ['Side', t => t.side === 'short' ? 'Short' : 'Long'],
    grade: ['Grade', t => t.grade || 'Ungraded'],
    session: ['Session (NY)', t => sessionOf(t)],
    weekday: ['Weekday', t => DOW[(new Date(t.t).getDay() + 6) % 7]],
    hour: ['Hour (NY)', t => pad(Math.floor(nyHM(t.t))) + ':00'],
    account: ['Account', t => S.accounts[t.account]?.label || 'No account'],
    symbol: ['Symbol', t => t.symbol],
    emotion: ['Feeling before', t => t.emoBefore?.length ? t.emoBefore : ['Not logged']],
    mistake: ['Mistake', t => t.mistakes?.length ? t.mistakes : ['Clean']],
    rules: ['Rules', t => t.rules === true ? 'Kept' : t.rules === false ? 'Broken' : 'Not marked'],
    size: ['Size', t => qtyFmt(t)],
    market: ['Market', t => t.unit === 'lot' ? 'CFD' : 'Futures'],
    conf: ['Confidence', t => 'Conf ' + (t.conf || '—')],
  };
}
function GroupTable({ groups, onPick, minN = 1 }) {
  const rows = [...groups].map(([k, ts]) => ({ k, s: stats(ts) })).filter(r => r.s.n >= minN).sort((a, b) => b.s.net - a.s.net);
  if (!rows.length) return html`<div class="dim" style=${{ padding: '14px 0' }}>Not enough trades yet.</div>`;
  const mx = Math.max(1, ...rows.map(r => Math.abs(r.s.net)));
  const g = s => s.n < 3 ? '' : s.pf >= 2 && s.expR > .3 ? 'A+' : s.pf >= 1.5 ? 'A' : s.pf >= 1.1 ? 'B' : s.pf >= .9 ? 'C' : 'D';
  return html`<div class="scroll-x"><table class="tbl"><thead><tr><th></th><th class="r">Trades</th><th class="r">Win</th><th class="r">PF</th><th class="r">Avg R</th><th class="r">Expectancy</th><th style=${{ width: '28%' }}>Net</th><th>Grade</th></tr></thead><tbody>
    ${rows.map(({ k, s }) => html`<tr key=${k} class=${onPick ? 'click' : ''} onClick=${() => onPick && onPick(k)}><td><b>${k}</b></td><td class="r">${s.n}</td><td class="r">${pct(s.wr, 0)}</td><td class="r">${s.pf === Infinity ? '∞' : s.pf.toFixed(2)}</td><td class=${'r ' + cls(s.expR)}>${s.expR != null ? rfmt(s.expR) : '—'}</td><td class=${'r ' + cls(s.exp)}>${money(s.exp, { sign: true, dec: 0 })}</td>
      <td><div class="row" style=${{ flexWrap: 'nowrap', gap: '8px' }}><div style=${{ flex: 1, height: '8px', background: 'var(--card2)', borderRadius: '5px', overflow: 'hidden', position: 'relative', minWidth: '60px' }}><i style=${{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.abs(s.net) / mx * 100 + '%', background: s.net >= 0 ? 'var(--pos)' : 'var(--neg)', borderRadius: '5px' }}></i></div><b class=${'tn ' + cls(s.net)} style=${{ minWidth: '72px', textAlign: 'right' }}>${money(s.net, { sign: true, dec: 0 })}</b></div></td><td><${Grade} g=${g(s)}/></td></tr>`)}</tbody></table></div>`;
}

function insightsOf(ts, S) {
  const out = []; if (ts.length < 8) return out; const base = stats(ts); const D = dims(S);
  const extreme = (key, minN, label) => { const rows = [...groupBy(ts, D[key][1])].map(([k, a]) => ({ k, s: stats(a) })).filter(r => r.s.n >= minN); if (rows.length < 2) return; rows.sort((a, b) => b.s.exp - a.s.exp); const b = rows[0], w = rows[rows.length - 1]; if (b.s.exp > 0) out.push({ tone: 'pos', ic: 'up', title: `Best ${label}: ${b.k}`, body: `${b.s.n} trades, ${pct(b.s.wr, 0)} win rate, ${money(b.s.exp, { sign: true, dec: 0 })} per trade (net ${money(b.s.net, { sign: true, dec: 0 })}).` }); if (w.s.exp < 0) out.push({ tone: 'neg', ic: 'dn', title: `Weakest ${label}: ${w.k}`, body: `${w.s.n} trades lost ${money(w.s.net, { dec: 0 })} total (${money(w.s.exp, { sign: true, dec: 0 })} per trade). Consider cutting it or sizing down.` }) };
  extreme('hour', 4, 'hour'); extreme('weekday', 4, 'day'); extreme('session', 4, 'session'); extreme('setup', 4, 'setup'); extreme('strategy', 4, 'strategy');
  const mist = ts.filter(t => (t.mistakes || []).length); if (mist.length >= 3) { const byM = [...groupBy(mist, t => t.mistakes)].map(([k, a]) => ({ k, v: sum(a, t => t.pnl), n: a.length })).sort((a, b) => a.v - b.v)[0]; out.push({ tone: 'neg', ic: 'x', title: `Mistakes cost you ${money(sum(mist, t => Math.min(0, t.pnl)), { dec: 0 })}`, body: `${mist.length} of ${ts.length} trades had a tagged mistake. The most expensive: "${byM.k}" (${byM.n}×, ${money(byM.v, { sign: true, dec: 0 })}).` }) }
  const kept = ts.filter(t => t.rules === true), broke = ts.filter(t => t.rules === false); if (kept.length >= 3 && broke.length >= 3) { const a = stats(kept), b = stats(broke); out.push({ tone: a.exp > b.exp ? 'pos' : 'neg', ic: 'shield', title: `Rules kept: ${money(a.exp, { sign: true, dec: 0 })}/trade · broken: ${money(b.exp, { sign: true, dec: 0 })}/trade`, body: `Following your rules is worth ${money(a.exp - b.exp, { sign: true, dec: 0 })} per trade. Over your ${broke.length} rule-breaking trades that is ${money((a.exp - b.exp) * broke.length, { dec: 0 })} left on the table.` }) }
  const sorted = [...ts].sort((a, b) => tTime(a) - tTime(b)); const after = []; for (let i = 1; i < sorted.length; i++) { const p = sorted[i - 1]; if (p.pnl < 0 && dayKey(p.t) === dayKey(sorted[i].t) && tTime(sorted[i]) - tExit(p) < 30 * 60000) after.push(sorted[i]) }
  if (after.length >= 3) { const s = stats(after); out.push({ tone: s.exp < base.exp ? 'neg' : 'pos', ic: 'flame', title: `Within 30 min after a loss: ${pct(s.wr, 0)} win rate`, body: `${after.length} quick re-entries made ${money(s.net, { sign: true, dec: 0 })} (${money(s.exp, { sign: true, dec: 0 })}/trade vs your ${money(base.exp, { sign: true, dec: 0 })} average). ${s.exp < base.exp ? 'A cool-off timer after a loss would protect you.' : 'You handle losses well. Keep it.'}` }) }
  const nth = {}; const perDay = groupBy(sorted, t => dayKey(t.t)); for (const a of perDay.values()) a.forEach((t, i) => { const k = i >= 2 ? '3rd+' : ['1st', '2nd'][i]; (nth[k] ||= []).push(t) });
  if ((nth['3rd+'] || []).length >= 4) { const f = stats(nth['1st'] || []), l = stats(nth['3rd+']); out.push({ tone: l.exp < f.exp ? 'neg' : 'pos', ic: 'list', title: `First trade of the day: ${money(f.exp, { sign: true, dec: 0 })} · third and later: ${money(l.exp, { sign: true, dec: 0 })}`, body: l.exp < f.exp ? `Your edge fades as the day goes on. A hard cap of 2 trades would have changed net P&L by ${money(-l.net, { sign: true, dec: 0 })}.` : 'Your later trades hold up. Your daily cap is not hurting you.' }) }
  if (base.holdW && base.holdL) out.push({ tone: base.holdL > base.holdW ? 'neg' : 'pos', ic: 'clock', title: `Winners held ${fmtDur(base.holdW)} · losers held ${fmtDur(base.holdL)}`, body: base.holdL > base.holdW ? 'You give losing trades more time than winning ones. Classic hope-holding: let the stop do its job, and let winners breathe.' : 'You cut losers faster than winners. That is the right shape.' });
  const top = ts.filter(t => t.grade === 'A+' || t.grade === 'A'), low = ts.filter(t => ['B', 'C', 'D'].includes(t.grade)); if (top.length >= 3 && low.length >= 3) { const a = stats(top), b = stats(low); out.push({ tone: 'pos', ic: 'star', title: `A-grade trades: ${pct(a.wr, 0)} win, ${money(a.exp, { sign: true, dec: 0 })}/trade`, body: `B and below: ${pct(b.wr, 0)} win, ${money(b.exp, { sign: true, dec: 0 })}/trade. Only taking A setups would have changed net by ${money(-b.net, { sign: true, dec: 0 })}.` }) }
  const planned = [...perDay].filter(([k]) => S.days[k]?.plan), unplanned = [...perDay].filter(([k]) => !S.days[k]?.plan); if (planned.length >= 3 && unplanned.length >= 3) { const a = sum(planned, x => sum(x[1], t => t.pnl)) / planned.length, b = sum(unplanned, x => sum(x[1], t => t.pnl)) / unplanned.length; out.push({ tone: a > b ? 'pos' : 'neg', ic: 'cal', title: `Days with a plan: ${money(a, { sign: true, dec: 0 })} avg · without: ${money(b, { sign: true, dec: 0 })}`, body: a > b ? 'Writing the pre-market plan pays. Make it non-negotiable.' : 'Your plan days are not outperforming yet. Make plans more specific: levels, scenarios, invalidation.' }) }
  if (base.avgWR != null && base.avgLR != null) out.push({ tone: Math.abs(base.avgLR) > 1.15 ? 'neg' : 'pos', ic: 'target', title: `Average loss ${base.avgLR.toFixed(2)}R`, body: Math.abs(base.avgLR) > 1.15 ? 'Losses are bigger than your planned 1R. Stops are being widened or slipping. Tighten execution.' : 'Losses stay within your planned risk. Good stop discipline.' });
  return out;
}

function Analytics({ C }) {
  const { S, D } = C; const [tab, setTab] = useState(LS.get('compound.atab', 'overview')); const T = D.ts; const s = useMemo(() => stats(T), [T]);
  const set = v => { setTab(v); LS.set('compound.atab', v) }; const DM = dims(S);
  const tabs = [['overview', 'Overview'], ['performance', 'Performance'], ['compare', 'Compare'], ['time', 'Time'], ['psychology', 'Psychology'], ['insights', 'Insights'], ['risk', 'Risk']];
  return html`<div class="page">
    <${PageHead} title="Analytics" sub=${T.length + ' trades analyzed · ' + scopeLabel(S, C.F)}><button class="btn btn-t xs" onClick=${C.toggleHide}><${I} n=${UIS.hide ? 'eye' : 'eyeoff'} s=${14}/>${UIS.hide ? 'Show' : 'Hide'} P&L</button><//>
    <div class="scroll-x" style=${{ borderBottom: '1px solid var(--line)' }}><div class="row" style=${{ flexWrap: 'nowrap', gap: '4px' }}>${tabs.map(([k, l]) => html`<button key=${k} onClick=${() => set(k)} style=${{ padding: '10px 14px', fontWeight: 600, fontSize: '13px', color: tab === k ? 'var(--fg)' : 'var(--mut)', borderBottom: tab === k ? '2px solid var(--fg)' : '2px solid transparent', marginBottom: '-1px', whiteSpace: 'nowrap' }}>${l}</button>`)}</div></div>
    ${!T.length ? html`<${Empty} icon="bars" title="Nothing to analyze yet" body="Every chart here fills from your journal. Log a few trades, or preview everything with sample data."><button class="btn btn-w" onClick=${() => UI.open('trade')}>Log a trade</button><button class="btn btn-g" onClick=${() => { loadSample(); toast('Sample data loaded') }}>Load sample data</button><//>`
    : html`${tab === 'overview' && html`<${AOverview} C=${C} s=${s}/>`}${tab === 'performance' && html`<${APerformance} C=${C} s=${s}/>`}${tab === 'compare' && html`<${ACompare} C=${C} DM=${DM}/>`}${tab === 'time' && html`<${ATime} C=${C}/>`}${tab === 'psychology' && html`<${APsych} C=${C}/>`}${tab === 'insights' && html`<${AInsights} C=${C}/>`}${tab === 'risk' && html`<${ARisk} C=${C} s=${s}/>`}`}
  </div>`;
}
function AOverview({ C, s }) {
  const { S, D } = C; const series = useMemo(() => equitySeries(D.ts), [D]); const DM = dims(S);
  const strat = [...groupBy(D.ts, DM.strategy[1])].map(([k, a]) => { const x = stats(a); return { l: k, v: x.wr * 100, sub: x.n + ' trades · ' + money(x.net, { sign: true, dec: 0 }), c: x.net >= 0 ? 'var(--pos)' : 'var(--neg)' } }).sort((a, b) => b.v - a.v);
  return html`<div class="grid g6 keep2"><${Kpi} small k="Total P&L" v=${html`<span class=${s.net < 0 ? 'neg' : 'acc'}>${money(s.net, { dec: 0 })}</span>`}/><${Kpi} small k="Win rate" v=${pct(s.wr)}/><${Kpi} small k="Avg win R" v=${s.avgWR != null ? s.avgWR.toFixed(2) + 'R' : '—'}/><${Kpi} small k="Profit factor" v=${s.pf === Infinity ? '∞' : s.pf.toFixed(2)}/><${Kpi} small k="Best trade" v=${html`<span class="pos">${money(s.best?.pnl, { dec: 0 })}</span>`}/><${Kpi} small k="Worst trade" v=${html`<span class="neg">${money(s.worst?.pnl, { dec: 0 })}</span>`}/></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>Cumulative P&L</h3></div><${EquityChart} series=${series} h=${300}/></div><div class="card"><${MonthCal} C=${C}/></div></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>Win rate by strategy</h3><span class="sub">Bar = win rate, colour = money</span></div><${HBars} data=${strat} fmt=${v => v.toFixed(0) + '%'} max=${100}/></div>
      <div class="card"><div class="ch"><h3>Playbook report card</h3><span class="sub">Each setup graded on its numbers</span></div><${GroupTable} groups=${groupBy(D.ts, DM.setup[1])}/></div></div>`;
}
function APerformance({ C, s }) {
  const { S, D } = C; const DM = dims(S); const days = byDay(D.ts); const dk = Object.keys(days).sort();
  const green = dk.filter(k => days[k].pnl > 0).length;
  const last = dk.slice(-30).map(k => ({ l: k.slice(8), v: days[k].pnl, sub: days[k].n + ' trades' }));
  const rs = D.ts.map(tR).filter(v => v != null); const bins = []; for (let b = -3; b <= 4; b += .5) bins.push({ l: (b >= 0 ? '+' : '') + b, lo: b, v: 0 }); rs.forEach(r => { const b = bins.find(x => r >= x.lo && r < x.lo + .5) || (r < -3 ? bins[0] : bins[bins.length - 1]); b.v++ });
  const eq = equitySeries(D.ts); let pk = 0; const uw = eq.map((p, i) => { pk = Math.max(pk, p.v); return { l: String(i + 1), v: p.v - pk } });
  return html`<div class="grid g6 keep2"><${Kpi} small k="Expectancy" v=${money(s.exp, { sign: true, dec: 0 })} s=${s.expR != null ? rfmt(s.expR) + ' per trade' : ''}/><${Kpi} small k="Payoff ratio" v=${s.payoff ? s.payoff.toFixed(2) : '—'} s="Avg win ÷ avg loss"/><${Kpi} small k="Max drawdown" v=${html`<span class="neg">${money(-s.mdd, { dec: 0 })}</span>`}/><${Kpi} small k="Streaks" v=${s.mcw + 'W · ' + s.mcl + 'L'} s="Longest runs"/><${Kpi} small k="Green days" v=${pct(dk.length ? green / dk.length : 0, 0)} s=${green + ' of ' + dk.length}/><${Kpi} small k="Avg day" v=${money(dk.length ? s.net / dk.length : 0, { sign: true, dec: 0 })}/></div>
    <div class="card"><div class="ch"><h3>Daily P&L</h3><span class="sub">Last 30 trading days</span></div><${Bars} data=${last} h=${220} onPick=${d => C.go('journal', { day: dk.find(k => k.endsWith(d.l)) })}/></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>R distribution</h3><span class="sub">${rs.length} trades with a stop</span></div><${Bars} data=${bins} h=${200} fmt=${v => String(Math.round(v))} valueFmt=${v => v + ' trades'} color="var(--acc)"/></div>
      <div class="card"><div class="ch"><h3>Drawdown</h3><span class="sub">Distance below your equity peak, by trade</span></div><${Bars} data=${uw} h=${200} labelEvery=${Math.ceil(uw.length / 12)}/></div></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>By symbol</h3></div><${GroupTable} groups=${groupBy(D.ts, DM.symbol[1])}/></div><div class="card"><div class="ch"><h3>Long vs short</h3></div><${GroupTable} groups=${groupBy(D.ts, DM.side[1])}/></div></div>
    <div class="grid g3"><${Kpi} small k="Avg hold · winners" v=${fmtDur(s.holdW)}/><${Kpi} small k="Avg hold · losers" v=${fmtDur(s.holdL)}/><${Kpi} small k="Total R" v=${html`<span class=${cls(s.totR)}>${rfmt(s.totR, 1)}</span>`} s=${s.rN + ' trades with stops'}/></div>`;
}
function ACompare({ C, DM }) {
  const { S, D } = C; const [dim, setDim] = useState('strategy'); const gm = useMemo(() => groupBy(D.ts, DM[dim][1]), [D, dim]); const keys = [...gm.keys()];
  const [a, setA] = useState(''); const [b, setB] = useState(''); const A = a || keys[0], B = b || keys[1];
  const sa = stats(gm.get(A) || []), sb = stats(gm.get(B) || []);
  const rows = [['Trades', x => x.n, v => v], ['Net P&L', x => x.net, v => money(v, { sign: true, dec: 0 })], ['Win rate', x => x.wr, v => pct(v, 0)], ['Profit factor', x => x.pf, v => v === Infinity ? '∞' : v.toFixed(2)], ['Expectancy', x => x.exp, v => money(v, { sign: true, dec: 0 })], ['Avg R', x => x.expR, v => rfmt(v)], ['Avg win', x => x.avgW, v => money(v, { dec: 0 })], ['Avg loss', x => -x.avgL, v => money(v, { dec: 0 })], ['Max drawdown', x => -x.mdd, v => money(v, { dec: 0 })], ['Avg hold (W)', x => x.holdW, v => fmtDur(v)]];
  const ea = equitySeries(gm.get(A) || []).map(p => p.v), eb = equitySeries(gm.get(B) || []).map(p => p.v);
  return html`<div class="bar"><span class="mut">Compare by</span><select class="sel" style=${{ width: 'auto' }} value=${dim} onChange=${e => { setDim(e.target.value); setA(''); setB('') }}>${Object.entries(DM).map(([k, [l]]) => html`<option value=${k}>${l}</option>`)}</select>
      <select class="sel" style=${{ width: 'auto', borderColor: 'var(--acc)' }} value=${A} onChange=${e => setA(e.target.value)}>${keys.map(k => html`<option>${k}</option>`)}</select><span class="dim">vs</span><select class="sel" style=${{ width: 'auto', borderColor: 'var(--gold)' }} value=${B} onChange=${e => setB(e.target.value)}>${keys.map(k => html`<option>${k}</option>`)}</select></div>
    ${keys.length < 2 ? html`<div class="card mut">Need at least two groups to compare.</div>` : html`<div class="grid g2">
      <div class="card"><div class="scroll-x"><table class="tbl"><thead><tr><th></th><th class="r" style=${{ color: 'var(--acc)' }}>${A}</th><th class="r" style=${{ color: 'var(--gold)' }}>${B}</th></tr></thead><tbody>${rows.map(([l, f, fm]) => { const va = f(sa), vb = f(sb); const better = l === 'Trades' ? 0 : (va ?? -Infinity) > (vb ?? -Infinity) ? 1 : (va ?? -Infinity) < (vb ?? -Infinity) ? 2 : 0; return html`<tr key=${l}><td class="mut">${l}</td><td class="r" style=${{ fontWeight: better === 1 ? 800 : 500 }}>${va == null ? '—' : fm(va)}</td><td class="r" style=${{ fontWeight: better === 2 ? 800 : 500 }}>${vb == null ? '—' : fm(vb)}</td></tr>` })}</tbody></table></div></div>
      <div class="card"><div class="ch"><h3>Equity, trade by trade</h3></div><${DualLine} a=${ea} b=${eb}/><div class="legend" style=${{ marginTop: '8px' }}><span><i style=${{ background: 'var(--acc)' }}></i>${A}</span><span><i style=${{ background: 'var(--gold)' }}></i>${B}</span></div></div></div>`}
    <div class="card"><div class="ch"><h3>Every ${DM[dim][0].toLowerCase()}</h3></div><${GroupTable} groups=${gm}/></div>`;
}
function DualLine({ a, b, h = 230 }) {
  const [ref, W] = useWidth(); const H = h, L = 50, R = 10, T = 10, B = 18; const n = Math.max(a.length, b.length, 2); const all = [0, ...a, ...b]; const t = niceTicks(Math.min(...all), Math.max(...all), 4); const mn = t[0], mx = t[t.length - 1];
  const X = i => L + i / (n - 1) * (W - L - R), Y = v => T + (mx - v) / (mx - mn || 1) * (H - T - B); const path = arr => [0, ...arr].map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  return html`<div ref=${ref}><svg class="svgc" viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} style=${{ display: 'block', maxWidth: '100%' }}>${t.map(v => html`<g key=${v}><line x1=${L} x2=${W - R} y1=${Y(v)} y2=${Y(v)} stroke="var(--line)" stroke-dasharray=${v === 0 ? '' : '2 4'}/><text x=${L - 8} y=${Y(v) + 3} text-anchor="end">${moneyK(v)}</text></g>`)}<path d=${path(a)} fill="none" stroke="var(--acc)" stroke-width="2"/><path d=${path(b)} fill="none" stroke="var(--gold)" stroke-width="2"/></svg></div>`;
}
function ATime({ C }) {
  const { S, D } = C; const DM = dims(S);
  const hours = []; for (let h = 0; h < 24; h++) { const a = D.ts.filter(t => Math.floor(nyHM(t.t)) === h); if (a.length) hours.push({ l: pad(h), v: sum(a, t => t.pnl), sub: a.length + ' trades · ' + pct(stats(a).wr, 0) }) }
  const half = []; for (let h = 7; h < 16.5; h += .5) { const a = D.ts.filter(t => { const x = nyHM(t.t); return x >= h && x < h + .5 }); half.push({ l: `${Math.floor(h)}:${h % 1 ? '30' : '00'}`, v: sum(a, t => t.pnl), sub: a.length + ' trades', dim: !a.length }) }
  const wd = DOW.slice(0, 5).map((d, i) => { const a = D.ts.filter(t => (new Date(t.t).getDay() + 6) % 7 === i); return { l: d, v: sum(a, t => t.pnl), sub: a.length + ' trades · ' + pct(stats(a).wr, 0) } });
  const mo = [...groupBy(D.ts, t => t.t.slice(0, 7))].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, a]) => ({ l: MON[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4), v: sum(a, t => t.pnl), sub: a.length + ' trades' }));
  const sc = D.ts.filter(t => holdMin(t) != null && holdMin(t) >= 0).map(t => ({ x: holdMin(t), y: t.pnl, id: t.id, tip: `${t.symbol} ${fmtDate(t.t)} · ${fmtDur(holdMin(t))} · ${money(t.pnl, { sign: true })}` }));
  return html`<div class="card"><div class="ch"><h3>New York session, by half hour</h3><span class="sub">Times converted to New York so it matches the open</span></div><${Bars} data=${half} h=${220} labelEvery=${2}/></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>By weekday</h3></div><${Bars} data=${wd} h=${200}/></div><div class="card"><div class="ch"><h3>By session</h3></div><${GroupTable} groups=${groupBy(D.ts, DM.session[1])}/></div></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>Hold time vs P&L</h3><span class="sub">Each dot is a trade</span></div><${Scatter} pts=${sc} xFmt=${v => fmtDur(v)} xLabel="hold time" onPick=${p => UI.open('detail', { id: p.id })}/></div><div class="card"><div class="ch"><h3>By month</h3></div><${Bars} data=${mo} h=${240}/></div></div>
    <div class="card"><div class="ch"><h3>Every hour (NY)</h3></div><${Bars} data=${hours} h=${180}/></div>`;
}
function APsych({ C }) {
  const { S, D } = C; const DM = dims(S);
  const emo = [...groupBy(D.ts, DM.emotion[1])].filter(([k]) => k !== 'Not logged').map(([k, a]) => ({ l: k, v: stats(a).exp, sub: a.length + 'x', c: POS_EMO.has(k) ? undefined : undefined })).sort((a, b) => b.v - a.v);
  const mist = [...groupBy(D.ts.filter(t => t.mistakes?.length), t => t.mistakes)].map(([k, a]) => ({ l: k, v: sum(a, t => t.pnl), sub: a.length + 'x' })).sort((a, b) => a.v - b.v);
  const grades = GRADES.map(g => { const a = D.ts.filter(t => t.grade === g); return { l: g, v: sum(a, t => t.pnl), sub: a.length + ' trades · ' + pct(stats(a).wr, 0) } });
  const conf = [1, 2, 3, 4, 5].map(c => { const a = D.ts.filter(t => (t.conf || 0) === c); return { l: 'Conf ' + c, v: a.length ? stats(a).exp : 0, sub: a.length + ' trades', dim: !a.length } });
  const days = byDay(D.ts); const moodRows = [1, 2, 3, 4, 5].map(m => { const ks = Object.keys(days).filter(k => S.days[k]?.review?.mood === m); return { l: 'Mood ' + m, v: ks.length ? sum(ks, k => days[k].pnl) / ks.length : 0, sub: ks.length + ' days', dim: !ks.length } });
  const r = store.s.report;
  return html`${r?.psych && html`<div class="glowcard" style=${{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '24px', alignItems: 'center' }}><${Radar} spokes=${r.psych.map(p => ({ k: p.k, v: p.v }))} size=${220}/><div><div class="row"><span class="chip ai">AI read</span><span class="dim" style=${{ fontSize: '10.5px' }}>${fmtDate(r.at)}</span></div><div style=${{ fontSize: '15px', fontWeight: 700, marginTop: '8px' }}>${r.headline}</div><div class="mut" style=${{ marginTop: '6px', fontSize: '12px' }}>${r.summary}</div><button class="btn btn-g sm" style=${{ marginTop: '12px' }} onClick=${() => C.go('ai', { tab: 'report' })}>Full report</button></div></div>`}
    <div class="grid g2"><div class="card"><div class="ch"><h3>Feeling before entry</h3><span class="sub">Expectancy per trade</span></div>${emo.length ? html`<${HBars} data=${emo}/>` : html`<div class="dim">Tag how you feel before entries to see this.</div>`}</div>
      <div class="card"><div class="ch"><h3>What your mistakes cost</h3><span class="sub">Total P&L of trades with each mistake</span></div>${mist.length ? html`<${HBars} data=${mist}/>` : html`<div class="dim">No mistakes tagged. Honest tagging is where the money is.</div>`}</div></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>Rules kept vs broken</h3></div><${GroupTable} groups=${groupBy(D.ts, DM.rules[1])}/></div><div class="card"><div class="ch"><h3>P&L by grade</h3><span class="sub">Does your grading predict results?</span></div><${Bars} data=${grades} h=${200}/></div></div>
    <div class="grid g2"><div class="card"><div class="ch"><h3>Confidence vs expectancy</h3></div><${Bars} data=${conf} h=${190}/></div><div class="card"><div class="ch"><h3>Day mood vs day P&L</h3><span class="sub">From your daily reviews</span></div><${Bars} data=${moodRows} h=${190}/></div></div>`;
}
function AInsights({ C }) {
  const { S, D } = C; const ins = useMemo(() => insightsOf(D.ts, S), [D]);
  return html`${D.ts.length < 8 ? html`<div class="card mut">Insights unlock at 8 trades. You have ${D.ts.length}.</div>` : html`<div class="grid g2">${ins.map((x, i) => html`<div class="card" key=${i} style=${{ borderLeft: `3px solid ${x.tone === 'pos' ? 'var(--pos)' : x.tone === 'neg' ? 'var(--neg)' : 'var(--acc)'}`, display: 'flex', gap: '12px' }}><span class=${x.tone} style=${{ marginTop: '2px' }}><${I} n=${x.ic}/></span><div><b>${x.title}</b><div class="mut" style=${{ fontSize: '12px', marginTop: '4px' }}>${x.body}</div></div></div>`)}</div>`}
    <div class="glowcard row" style=${{ padding: '16px 18px' }}><${I} n="spark" c="ai"/><div style=${{ flex: 1, minWidth: '200px' }}><b>Go deeper with the coach</b><div class="mut" style=${{ fontSize: '11.5px' }}>It reads every trade, note and strategy, and answers with your own numbers.</div></div><button class="btn btn-ai sm" onClick=${() => C.go('ai', { ask: 'Look across my whole journal. What are the three changes that would add the most money over the next 50 trades? Quantify each with my own numbers.' })}>Find my 3 biggest levers</button></div>`;
}
function ARisk({ C, s }) {
  const { S, D } = C; const withRisk = D.ts.filter(t => t.risk).slice(0, 80).reverse();
  const accs = Object.values(S.accounts).filter(a => a.status === 'active');
  const [acc, setAcc] = useState(accs[0]?.id || ''); const a = S.accounts[acc];
  const st = a ? acctState(a, computeTrades(S, { mode: 'all', dedupe: false }).all, Object.values(S.adjust).filter(x => x.account === a.id)) : null;
  const room = st ? st.left : (S.settings.maxDailyLoss || 1000) * 3; const toGo = st?.toGo || null;
  const res = useMemo(() => monteCarlo(D.ts.map(t => t.pnl), { toGo, room, dll: st?.dll || 0, perDay: S.settings.maxTrades || 3, maxTrades: 250 }), [D, acc]);
  const W = s.wr, P = s.payoff || 0; const kelly = P ? W - (1 - W) / P : null;
  const avgRisk = withRisk.length ? sum(withRisk, t => t.risk) / withRisk.length : null; const cv = withRisk.length > 2 ? Math.sqrt(sum(withRisk, t => (t.risk - avgRisk) ** 2) / withRisk.length) / avgRisk : null;
  return html`<div class="grid g4 keep2"><${Kpi} small k="Avg risk per trade" v=${avgRisk ? money(avgRisk, { dec: 0 }) : '—'} s=${cv != null ? 'Varies ±' + pct(cv, 0) + (cv > .35 ? ' · inconsistent' : ' · steady') : 'Add stops to trades'}/><${Kpi} small k="Kelly fraction" v=${kelly != null ? pct(Math.max(0, kelly), 0) : '—'} s="Of risk capital per trade. Use a quarter of it."/><${Kpi} small k="Max drawdown" v=${html`<span class="neg">${money(-s.mdd, { dec: 0 })}</span>`}/><${Kpi} small k="Longest losing run" v=${s.mcl} s="Plan your size to survive double this"/></div>
    <div class="card"><div class="ch"><h3>Risk per trade</h3><span class="sub">Dollar risk from entry to stop, last ${withRisk.length}</span></div><${Bars} data=${withRisk.map((t, i) => ({ l: String(i + 1), v: t.risk, sub: t.symbol + ' ' + fmtDate(t.t) }))} h=${180} color="var(--acc)" labelEvery=${Math.ceil(withRisk.length / 12) || 1}/></div>
    <div class="card"><div class="ch"><h3>Monte Carlo · your future, resampled</h3><span class="sub">3,000 paths built from your real trades</span><span class="sp"></span>${accs.length > 0 && html`<select class="sel" style=${{ width: 'auto' }} value=${acc} onChange=${e => setAcc(e.target.value)}>${accs.map(x => html`<option value=${x.id}>${x.label}</option>`)}</select>`}</div>
      ${res ? html`<div class="grid g4 keep2" style=${{ marginBottom: '12px' }}><div><div class="lbl">${toGo ? 'Reach target' : 'Survive'}</div><b class="pos" style=${{ fontSize: '19.5px' }}>${pct(toGo ? res.pass : res.pass + res.open, 0)}</b></div><div><div class="lbl">Hit max loss</div><b class="neg" style=${{ fontSize: '19.5px' }}>${pct(res.blow, 0)}</b></div><div><div class="lbl">Median trades to target</div><b style=${{ fontSize: '19.5px' }}>${res.med || '—'}</b></div><div><div class="lbl">Room used</div><b style=${{ fontSize: '19.5px' }}>${money(room, { dec: 0 })}</b></div></div><${MCChart} res=${res} top=${toGo} bot=${-room}/>` : html`<div class="dim">Needs 5+ trades.</div>`}</div>`;
}

/* ---------------- AI ---------------- */
function buildContext(S, D) {
  const s = stats(D.ts); const DM = dims(S);
  const grp = k => [...groupBy(D.ts, DM[k][1])].map(([n, a]) => { const x = stats(a); return `${n}: ${x.n} trades, WR ${pct(x.wr, 0)}, PF ${x.pf === Infinity ? 'inf' : x.pf.toFixed(2)}, net ${Math.round(x.net)}, exp/trade ${Math.round(x.exp)}${x.expR != null ? ', avgR ' + x.expR.toFixed(2) : ''}` }).join('\n');
  const { all } = computeTrades(S, { mode: 'all', dedupe: false });
  const accs = Object.values(S.accounts).map(a => { const st = acctState(a, all, Object.values(S.adjust).filter(x => x.account === a.id)); return `${a.label} | ${firmById(a.firm).name} ${a.plan || ''} ${a.size} ${a.type} ${a.status} | balance ${Math.round(st.bal)}, profit ${Math.round(st.profit)}, drawdown left ${Math.round(st.left)} (floor ${Math.round(st.floor)}, ${a.dd} trailing max loss ${a.mll})${st.toGo != null ? ', to target ' + Math.round(st.toGo) : ''}${st.dll ? ', daily loss limit ' + st.dll + ' (left today ' + Math.round(st.dllLeft) + ')' : ''}${st.consLimit ? `, consistency rule ${a.cons}% (best day is ${pct(st.consUsed, 0)} of profit${st.consOk ? '' : ', needs +' + Math.round(st.consNeed)})` : ''}, trading days ${st.tradingDays}` }).join('\n');
  const strats = Object.values(S.strategies).map(x => `"${x.name}": ${x.desc || ''} | TF ${x.tf} | entry: ${(x.entry || []).join('; ')} | invalidation: ${x.invalid || '-'} | min RR ${x.minRR} | management: ${x.manage || '-'}`).join('\n');
  const recentDays = Object.keys(S.days).filter(k => /^\d{4}-/.test(k)).sort().slice(-10).map(k => { const d = S.days[k]; return `${k}: ${d.plan ? 'PLAN bias ' + (d.plan.bias || '-') + '; focus ' + (d.plan.focus || '-') + '; feeling ' + (d.plan.feeling || '-') + '; levels ' + (levelsText(d.plan) || '-') + '; rule ' + (d.plan.rule || '-') : 'no plan'}${d.review ? ' | REVIEW mood ' + d.review.mood + ', day rating ' + (dayScore(d) ?? '-') + '/10, followed plan ' + (d.review.plan === true ? 'yes' : d.review.plan === false ? 'no' : d.review.plan === 'part' ? 'partly' : '-') + ': ' + (d.review.text || '').slice(0, 300) + (d.review.lessons ? ' Lesson: ' + d.review.lessons : '') : ''}${d.study ? ' | studied ' + d.study + 'min' : ''}` }).join('\n');
  const trades = D.ts.slice(0, 90).map(t => tradeLine(t, S) + (t.notes ? ' | notes: ' + t.notes.slice(0, 160).replace(/\n/g, ' ') : '')).join('\n');
  const st = S.settings; const ins = insightsOf(D.ts, S).map(x => '- ' + x.title + ': ' + x.body).join('\n');
  return `TRADER: ${st.name}. Trades futures (mainly MNQ) on prop firm accounts, ICT/SMC style. Today is ${fmtLong(new Date())}, local time ${fmtTime(new Date())} (New York ${Math.floor(nyHM(new Date()))}:${pad(Math.round(nyHM(new Date()) % 1 * 60))}).
GUARDRAILS: max daily loss ${st.maxDailyLoss}, max trades/day ${st.maxTrades}, stop after ${st.maxConsecLosses} losses in a row, daily goal ${st.dailyGoal}. Checklist: ${st.checklist.join(' | ')}

OVERALL (${D.ts.length} trades): net ${Math.round(s.net)}, win rate ${pct(s.wr)}, PF ${s.pf === Infinity ? 'inf' : s.pf.toFixed(2)}, expectancy ${Math.round(s.exp)}/trade${s.expR != null ? ' (' + s.expR.toFixed(2) + 'R)' : ''}, avg win ${Math.round(s.avgW)}, avg loss ${Math.round(s.avgL)}, max drawdown ${Math.round(s.mdd)}, longest losing streak ${s.mcl}, avg hold winners ${fmtDur(s.holdW)} losers ${fmtDur(s.holdL)}.

BY STRATEGY:\n${grp('strategy')}\n\nBY SETUP:\n${grp('setup')}\n\nBY SESSION (NY):\n${grp('session')}\n\nBY WEEKDAY:\n${grp('weekday')}\n\nBY GRADE:\n${grp('grade')}\n\nBY MISTAKE:\n${grp('mistake')}\n\nBY FEELING BEFORE ENTRY:\n${grp('emotion')}\n\nRULES KEPT/BROKEN:\n${grp('rules')}

COMPUTED INSIGHTS:\n${ins || '(not enough trades)'}

ACCOUNTS:\n${accs || '(none)'}

STRATEGIES:\n${strats || '(none written)'}

RECENT DAYS:\n${recentDays || '(none)'}

RECENT TRADES (newest first; time | symbol side size | prices | P&L $ | R | hold | session | grade | strategy | setups | mistakes | rules | feelings | account):\n${trades || '(none)'}`;
}
const COACH_RULES = `You are Compound Coach, a personal trading performance coach inside the trader's own journal app. You are direct, specific and numerate, like a great prop desk head who wants this trader funded and consistent. Ground every claim in the journal data below and quote the trader's own numbers. When data is thin, say so and say what to log. Prefer concrete rules ("no entries 12:00-13:30 NY", "max 2 trades after a loss") over vague advice. You understand futures, prop firm rules (trailing drawdown, daily loss, consistency rules), and ICT/SMC concepts. Never promise profits. Keep answers tight: short paragraphs, bullets where useful, bold the key numbers. If asked something outside trading, answer briefly.`;
const COWORK_RULES = `You are Compound CoWork, an assistant that operates the trader's journal with tools. When the trader asks you to log trades, add accounts, record payouts, update balances, write the pre-market plan or save a note, call the matching tool, once per item, with the fields they gave you. Do not invent prices or P&L: if a required number is missing, ask for it instead of guessing. Use find_trades to look things up. After acting, confirm in one or two lines what you did.`;

function makeTools(S, acts) {
  const findAcc = name => { if (!name) return null; const n = String(name).toLowerCase(); const list = Object.values(store.s.accounts); return list.find(a => (a.label || '').toLowerCase() === n) || list.find(a => (a.label || '').toLowerCase().includes(n) || n.includes((a.label || '').toLowerCase())) || list.find(a => firmById(a.firm).name.toLowerCase().includes(n.split(' ')[0])) || null };
  const findStrat = name => { if (!name) return ''; const n = String(name).toLowerCase(); return Object.values(store.s.strategies).find(s => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase()))?.id || '' };
  const str = { type: 'string' }, numb = { type: 'number' };
  return [
    { name: 'log_trade', description: 'Log one trade in the journal: futures (contracts) or CFD like NAS100 on MT5 (lots; contracts field holds lots, e.g. 0.5). Give prices when known; otherwise give pnl in dollars.', inputSchema: { type: 'object', properties: { symbol: str, side: { type: 'string', enum: ['long', 'short'] }, contracts: numb, entry: numb, exit: numb, stop: numb, target: numb, pnl: { type: 'number', description: 'Net P&L in USD if prices are not given' }, entry_time: { type: 'string', description: 'Local time YYYY-MM-DDTHH:mm; default now' }, exit_time: str, account: { type: 'string', description: 'Main account label or firm name' }, copy_to: { type: 'array', items: { type: 'string' }, description: 'Other account labels this trade was copy traded into (same prices)' }, strategy: str, grade: { type: 'string', enum: GRADES }, setups: { type: 'array', items: str }, mistakes: { type: 'array', items: str }, notes: str }, required: ['symbol', 'side'] },
      execute(i) { const a = findAcc(i.account); const t = { id: uid(), symbol: normSym(i.symbol), side: i.side, qty: i.contracts || 1, entry: i.entry ?? '', exit: i.exit ?? '', stop: i.stop ?? '', target: i.target ?? '', pnl: i.pnl ?? '', pnlManual: i.entry == null || i.exit == null, t: i.entry_time || localISO(), tx: i.exit_time || i.entry_time || localISO(), account: a?.id || '', strategy: findStrat(i.strategy), grade: i.grade || '', setups: i.setups || [], mistakes: i.mistakes || [], notes: i.notes || '', mode: 'live', created: Date.now(), byAI: true }; const c = tradeCalc(t, store.s.settings); if (c.pnl == null) throw new Error('Need entry and exit prices or a pnl'); const copies = (i.copy_to || []).map(findAcc).filter(x => x && x.id !== a?.id).map(x => x.id); const before = new Set(Object.keys(store.s.trades)); const base = { ...t }; delete base.id; delete base.account; saveCopyGroup(store.s, base, { main: a?.id || '', copies, sizes: {} }, null); Object.keys(store.s.trades).filter(k => !before.has(k)).forEach(k => acts.push({ c: 'trades', id: k, label: '' })); acts.push({ c: null, label: `Logged ${t.symbol} ${t.side} ${money(c.pnl, { sign: true, show: true })}${a ? ' on ' + a.label : ''}${copies.length ? ' + ' + copies.length + ' copies' : ''}` }); return { ok: true, pnl: c.pnl, account: a?.label || null, copies: copies.length } } },
    { name: 'create_account', description: 'Add a prop firm or personal trading account.', inputSchema: { type: 'object', properties: { firm: { type: 'string', description: 'Firm name, e.g. Lucid Trading, Tradeify, Topstep, Apex' }, plan: str, size: numb, stage: { type: 'string', enum: ['eval', 'funded', 'live'] }, label: str, profit_target: numb, max_loss: numb, drawdown_type: { type: 'string', enum: ['eod', 'intraday', 'static'] }, daily_loss_limit: numb, consistency_pct: numb, fee_paid: numb }, required: ['firm', 'size'] },
      execute(i) { const n = String(i.firm).toLowerCase(); const f = FIRMS.find(f => f.name.toLowerCase().includes(n) || n.includes(f.name.toLowerCase().split(' ')[0])) || FIRMS[FIRMS.length - 1]; const p = SIZE_PRESETS[i.size] || {}; const a = store.put('accounts', { id: uid(), firm: f.id, plan: i.plan || f.plans[0], size: i.size, type: i.stage || 'eval', label: i.label || `${f.name.split(' ')[0]} ${i.size / 1000}K`, target: i.profit_target ?? ((i.stage || 'eval') === 'eval' ? p.target : ''), mll: i.max_loss ?? p.mll, dd: i.drawdown_type || 'eod', lock: 100, dll: i.daily_loss_limit ?? p.dll, cons: i.consistency_pct ?? '', cost: i.fee_paid ?? '', status: 'active', mode: 'live', def: true, created: Date.now(), start: todayKey() }); acts.push({ c: 'accounts', id: a.id, label: `Added ${f.name} ${i.size / 1000}K ${a.type}` }); return { ok: true, id: a.id, label: a.label } } },
    { name: 'record_payout', description: 'Record a payout received from a prop account.', inputSchema: { type: 'object', properties: { account: str, amount: numb, date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['amount'] },
      execute(i) { const a = findAcc(i.account); const p = store.put('payouts', { id: uid(), account: a?.id || '', amount: i.amount, d: i.date || todayKey(), status: 'paid', note: 'Logged by CoWork' }); if (a) store.put('adjust', { id: uid(), account: a.id, v: -Math.abs(i.amount), d: (i.date || todayKey()) + 'T23:59', payout: p.id }); acts.push({ c: 'payouts', id: p.id, label: `Payout ${money(i.amount, { show: true })}${a ? ' from ' + a.label : ''}` }); return { ok: true } } },
    { name: 'update_balance', description: "Set an account's current balance as shown by the firm.", inputSchema: { type: 'object', properties: { account: str, balance: numb }, required: ['account', 'balance'] },
      execute(i) { const a = findAcc(i.account); if (!a) throw new Error('No matching account'); const { all } = computeTrades(store.s, { mode: 'all', dedupe: false }); const st = acctState(a, all, Object.values(store.s.adjust).filter(x => x.account === a.id)); const x = store.put('adjust', { id: uid(), account: a.id, v: Math.round((i.balance - st.bal) * 100) / 100, d: new Date().toISOString(), note: 'Balance sync (CoWork)' }); acts.push({ c: 'adjust', id: x.id, label: `${a.label} balance set to ${money(i.balance, { show: true })}` }); return { ok: true } } },
    { name: 'set_plan', description: "Write or update the pre-market plan for a day.", inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, default today' }, bias: { type: 'string', enum: ['bull', 'bear', 'neutral', 'wait'] }, levels: str, news: str, scenario_a: str, scenario_b: str, focus: str }, required: [] },
      execute(i) { const k = i.date || todayKey(); const d = store.s.days[k] || { id: k }; store.put('days', { ...d, id: k, plan: { ...(d.plan || {}), bias: i.bias ?? d.plan?.bias, levels: i.levels ?? d.plan?.levels, news: i.news ?? d.plan?.news, a: i.scenario_a ?? d.plan?.a, b: i.scenario_b ?? d.plan?.b, focus: i.focus ?? d.plan?.focus, at: Date.now() } }); acts.push({ c: null, label: `Plan written for ${k}` }); return { ok: true } } },
    { name: 'add_note', description: 'Save a study note.', inputSchema: { type: 'object', properties: { title: str, body: str }, required: ['title', 'body'] },
      execute(i) { const n = store.put('notes', { id: uid(), title: i.title, body: i.body, folder: 'CoWork', created: Date.now() }); acts.push({ c: 'notes', id: n.id, label: `Note saved: ${i.title}` }); return { ok: true } } },
    { name: 'find_trades', description: 'Look up journal trades. Returns compact lines.', inputSchema: { type: 'object', properties: { from: str, to: str, symbol: str, outcome: { type: 'string', enum: ['win', 'loss', 'any'] }, limit: numb } },
      execute(i) { const { ts } = computeTrades(store.s, { mode: 'all' }); const r = ts.filter(t => (!i.from || dayKey(t.t) >= i.from) && (!i.to || dayKey(t.t) <= i.to) && (!i.symbol || normSym(t.symbol) === normSym(i.symbol)) && (!i.outcome || i.outcome === 'any' || (i.outcome === 'win' ? t.pnl > 0 : t.pnl < 0))).slice(0, Math.min(60, i.limit || 25)); return { count: r.length, trades: r.map(t => tradeLine(t, store.s)) } } },
  ];
}

function AIPage({ C, params }) {
  const S = useStore(); const { D } = C; const smp = store.caps.sample;
  const [tab, setTab] = useState(params?.tab || 'coach'); const [chatId, setChatId] = useState(null); const [txt, setTxt] = useState(''); const [live, setLive] = useState(null); const [busy, setBusy] = useState(false); const [deep, setDeep] = useState(false); const [err, setErr] = useState(''); const ctl = useRef(); const box = useRef(); const sentAsk = useRef(null);
  const mode = tab === 'cowork' ? 'cowork' : 'coach';
  const chats = Object.values(S.chats).filter(c => (c.mode || 'coach') === mode).sort((a, b) => (b.u || 0) - (a.u || 0));
  const chat = S.chats[chatId] && (S.chats[chatId].mode || 'coach') === mode ? S.chats[chatId] : null;
  const msgs = chat?.msgs || [];
  useEffect(() => { box.current && (box.current.scrollTop = box.current.scrollHeight) }, [msgs.length, live]);
  useEffect(() => { if (params?.tab) setTab(params.tab) }, [params]);
  useEffect(() => { if (params?.ask && sentAsk.current !== params.ask && smp) { sentAsk.current = params.ask; setTab('coach'); setChatId(null); setTimeout(() => send(params.ask, null, 'coach'), 30) } }, [params?.ask, smp]);
  const send = async (q, forceChat, forceMode) => {
    q = (q ?? txt).trim(); if (!q || busy) return; if (!smp) return setErr('AI runs when Compound is opened inside Claude.');
    const md = forceMode || mode; setErr(''); setTxt('');
    let c = forceChat === null ? null : chat; if (!c) c = store.put('chats', { id: uid(), mode: md, title: q.slice(0, 60), msgs: [], created: Date.now() });
    const m1 = [...(c.msgs || []), { r: 'u', t: q }]; store.put('chats', { ...c, msgs: m1 }); setChatId(c.id);
    setBusy(true); setLive(''); ctl.current = new AbortController(); const acts = [];
    const turns = [{ role: 'user', content: (md === 'cowork' ? COWORK_RULES : COACH_RULES) + '\n\n=== JOURNAL DATA ===\n' + buildContext(store.s, computeTrades(store.s, { mode: C.F.mode, accounts: C.F.accounts })) + '\n=== END DATA ===' }, { role: 'assistant', content: 'Understood. I have the journal loaded.' }, ...m1.slice(-24).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t }))];
    const opts = { signal: ctl.current.signal, onText: ({ text }) => setLive(text), modelTier: deep ? 'complex' : 'default' };
    if (md === 'cowork') opts.tools = makeTools(store.s, acts); else opts.cache = false;
    try { const r = await smp(turns, opts); store.put('chats', { ...store.s.chats[c.id], msgs: [...m1, { r: 'a', t: r.text + (r.truncated ? '\n\n_(cut short)_' : ''), acts: acts.length ? acts : undefined }].slice(-60) }) }
    catch (e) { const partial = e?.text; if (partial || acts.length) store.put('chats', { ...store.s.chats[c.id], msgs: [...m1, { r: 'a', t: (partial || '') + (e.code === 'cancelled' ? '' : '\n\n_(interrupted)_'), acts: acts.length ? acts : undefined }] }); if (e?.code && e.code !== 'cancelled') setErr(({ not_granted: store.backend === 'supabase' ? (e.message || 'Add your Anthropic API key in Settings → AI.') : 'Claude access was declined for this page. Allow it from the page\'s permissions to use AI.', rate_limited: 'You are sending a lot at once. Wait a minute and try again.', prompt_too_large: 'Your journal is too large to send in one go. Try a narrower question.', sampling_disabled: 'Claude is not available for this account.', refused: 'Claude declined that. Rephrase the question.' })[e.code] || 'Something interrupted the answer. Try again.') }
    setBusy(false); setLive(null);
  };
  const undo = acts => { acts.forEach(a => a.c && a.id && store.del(a.c, a.id)); toast('Undone') };
  const sugg = mode === 'coach' ? ["What's my biggest leak right now?", 'Which setup should I stop trading?', 'How close am I to passing my eval, and what is the safest way to finish it?', 'Review my last 10 trades like a prop desk head', 'Build me a pre-market routine from my own data', 'When do I trade best, by time of day?'] : ['Log MNQ long 2 contracts on Lucid, copied to my Tradeify accounts, entry 21450 exit 21478 stop 21438, A grade, FVG', 'Add a Tradeify 50K Select eval, fee $159', 'Record a $1,250 payout from my Lucid account', 'Write today\'s plan: bearish below 21,500, focus on patience', 'Save a note: rules from today\'s session'];
  return html`<div style=${{ height: '100%', minHeight: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
    <div class="row" style=${{ padding: '14px 22px', borderBottom: '1px solid var(--line)', gap: '10px' }}>
      <span class="logo" style=${{ width: '30px', height: '30px', background: 'linear-gradient(135deg,#5B35E8,#9D7BFF)' }}><${I} n="spark" s=${16}/></span><b style=${{ fontSize: '15px' }}>${tab === 'report' ? 'Score & psychology' : mode === 'coach' ? 'Coach' : 'CoWork'}</b>
      ${tab !== 'report' && html`<select class="sel" style=${{ width: 'auto', maxWidth: '260px', height: '32px', padding: '4px 28px 4px 10px' }} value=${chatId || ''} onChange=${e => setChatId(e.target.value || null)}><option value="">New conversation</option>${chats.map(c => html`<option value=${c.id}>${c.title}</option>`)}</select>${chat && html`<button class="ib" onClick=${() => UI.confirm({ title: 'Delete conversation?', body: 'This chat is removed.', onYes: () => { store.del('chats', chat.id); setChatId(null) } })} aria-label="Delete conversation"><${I} n="trash"/></button>`}`}
      <span class="sp"></span>${tab !== 'report' && html`<label class="row hide-m" style=${{ gap: '6px', fontSize: '11px', cursor: 'pointer' }} title="Slower, more thorough reasoning"><input type="checkbox" checked=${deep} onChange=${e => setDeep(e.target.checked)}/>Deep think</label>`}
      <${Seg} v=${tab} set=${v => { setTab(v); setChatId(null) }} opts=${[['coach', 'Coach'], ['cowork', 'CoWork'], ['report', 'Report']]}/></div>
    ${!smp && html`<div class="card tight row" style=${{ margin: '14px 22px 0' }}><${I} n="lock"/><span class="mut" style=${{ fontSize: '11.5px' }}>AI runs on your Claude account when Compound is opened inside Claude. Everything else works without it.</span></div>`}
    ${store.backend === 'supabase' && !aiKey() && html`<div class="card tight row" style=${{ margin: '14px 22px 0', borderColor: 'rgba(157,123,255,.4)' }}><${I} n="spark" c="ai"/><span style=${{ flex: 1, fontSize: '12px' }}>Add your Anthropic API key once on this device to turn on the coach, CoWork and reports.</span><button class="btn btn-ai sm" onClick=${() => UI.open('settings', { tab: 'ai' })}>Add key</button></div>`}
    ${tab === 'report' ? html`<div style=${{ flex: 1, overflow: 'auto' }}><${Report} C=${C} auto=${params?.run}/></div>` : html`<div class="chat" style=${{ flex: 1, minHeight: 0 }}>
      <div class="msgs" ref=${box}>
        ${!msgs.length && live == null ? html`<div class="msg" style=${{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '10px', marginTop: '6vh' }}>
            <${Mark} s=${46}/><h2 style=${{ margin: 0, fontSize: '21px', letterSpacing: '-.02em' }}>${mode === 'coach' ? `Ask about your trading, ${S.settings.name}.` : 'Tell me what to log.'}</h2>
            <div class="mut" style=${{ maxWidth: '52ch' }}>${mode === 'coach' ? `The coach reads your ${D.ts.length} trades, your strategies, plans, reviews and prop accounts, and answers with your own numbers.` : 'CoWork logs trades, adds accounts, records payouts, updates balances and writes your plan. Every action can be undone.'}</div>
            <div class="row" style=${{ justifyContent: 'center', gap: '8px', marginTop: '8px', maxWidth: '680px' }}>${sugg.map(s => html`<button key=${s} class="chip" style=${{ height: 'auto', padding: '8px 12px', whiteSpace: 'normal', textAlign: 'left' }} onClick=${() => mode === 'cowork' ? setTxt(s) : send(s)}>${s}</button>`)}</div></div>`
          : msgs.map((m, i) => html`<div key=${i} class=${'msg ' + (m.r === 'u' ? 'u' : 'a')}><div class="av">${m.r === 'u' ? (S.settings.name || 'V')[0] : html`<${I} n="spark" s=${15}/>`}</div><div class="tx">${m.r === 'u' ? html`<div class="mdtx" style=${{ color: 'var(--fg)' }}>${m.t}</div>` : html`<div dangerouslySetInnerHTML=${{ __html: mdLite(m.t) }}></div>`}
              ${m.acts && html`<div class="col" style=${{ gap: '6px', marginTop: '8px' }}>${m.acts.filter(a => a.label).map((a, j) => html`<span key=${j} class="act-log"><${I} n="check" s=${13}/>${a.label}</span>`)}${m.acts.some(a => a.c) && html`<button class="btn btn-t xs" style=${{ alignSelf: 'flex-start' }} onClick=${() => undo(m.acts)}><${I} n="rotate" s=${12}/>Undo these</button>`}</div>`}</div></div>`)}
        ${live != null && html`<div class="msg a"><div class="av"><${I} n="spark" s=${15}/></div><div class="tx">${live ? html`<div dangerouslySetInnerHTML=${{ __html: mdLite(live) }}></div>` : html`<${Thinking}/>`}</div></div>`}
        ${err && html`<div class="msg"><div class="av"></div><div class="tx neg" style=${{ fontSize: '12px' }}>${err}</div></div>`}
      </div>
      <div class="compose"><div class="box"><textarea rows="1" placeholder=${mode === 'coach' ? 'Ask your coach…' : 'e.g. log my 2 MNQ trades from this morning…'} value=${txt} onInput=${e => { setTxt(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(180, e.target.scrollHeight) + 'px' }} onKeyDown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled=${!smp}></textarea>
        ${busy ? html`<button class="btn btn-g sm" onClick=${() => ctl.current?.abort()}><${I} n="stop" s=${14}/>Stop</button>` : html`<button class="btn btn-ai sm" disabled=${!txt.trim() || !smp} onClick=${() => send()} aria-label="Send"><${I} n="send" s=${15}/></button>`}</div></div>
    </div>`}
  </div>`;
}

function Report({ C, auto }) {
  const S = useStore(); const r = S.report; const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const ran = useRef(false);
  const run = async () => {
    const smp = store.caps.sample; if (!smp) return setErr('AI runs when Compound is opened inside Claude.'); if (C.D.ts.length < 3) return setErr('Log at least 3 trades first.');
    setBusy(true); setErr('');
    const prompt = `${COACH_RULES}\n\nAnalyze this trader's whole journal and return ONLY a JSON object with this exact shape:\n{"score": integer 0-100 overall trader score (edge, risk control, discipline, consistency, journaling), "headline": "one sentence verdict, max 18 words", "summary": "2-3 sentences", "psych": [{"k":"Discipline","v":0-100},{"k":"Patience","v":0-100},{"k":"Risk control","v":0-100},{"k":"Emotional control","v":0-100},{"k":"Consistency","v":0-100},{"k":"Confidence","v":0-100}], "strengths": ["3 short strengths with numbers"], "leaks": [{"title":"short","detail":"1-2 sentences with the trader's numbers","cost": estimated dollars lost (number)}], "patterns": ["2-4 behavioural patterns you see, e.g. revenge after losses"], "takeaways": ["3 concrete actions for the next 2 weeks"], "rule": "one new rule to add to the checklist"}\nBase psych scores on evidence: mistakes, rule breaks, emotions, post-loss behaviour, hold times, size changes, plan adherence.\n\n=== JOURNAL DATA ===\n${buildContext(store.s, C.D)}`;
    try { const j = await smp.json(prompt, { modelTier: 'complex' }); store.setReport({ ...j, at: Date.now(), n: C.D.ts.length }) }
    catch (e) { setErr(e?.code === 'rate_limited' ? 'Busy right now. Try again in a minute.' : e?.code === 'not_granted' ? (store.backend === 'supabase' ? (e.message || 'Add your API key in Settings → AI.') : 'Claude access was declined for this page.') : 'The report did not finish. Try again.') }
    setBusy(false);
  };
  useEffect(() => { if (auto && !ran.current && !r) { ran.current = true; run() } }, [auto]);
  return html`<div class="page" style=${{ maxWidth: '1100px' }}>
    <div class="row"><div><h2 style=${{ margin: 0, fontSize: '19.5px' }}>Score & psychology</h2><div class="mut" style=${{ fontSize: '12px' }}>The AI reads your whole journal and renders your score and your head as charts, with the takeaways to apply.</div></div><span class="sp"></span><button class="btn btn-ai" disabled=${busy} onClick=${run}><${I} n=${busy ? 'refresh' : 'spark'}/>${busy ? 'Reading every trade…' : r ? 'Refresh report' : 'Run my report'}</button></div>
    ${err && html`<div class="card tight neg">${err}</div>`}
    ${busy && !r && html`<div class="card" style=${{ textAlign: 'center', padding: '40px' }}><span class="typing"><i></i><i></i><i></i></span><div class="mut" style=${{ marginTop: '10px' }}>Deep analysis takes up to a minute.</div></div>`}
    ${r ? html`
      <div class="grid" style=${{ gridTemplateColumns: 'auto minmax(0,1fr)', gap: '18px' }}>
        <div class="glowcard" style=${{ padding: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}><${Ring} v=${r.score} size=${150} w=${12} color="var(--ai)"><span style=${{ fontSize: '38.5px', letterSpacing: '-.04em' }}>${r.score}</span></${Ring}><span class="lbl">Trader score</span><span class="dim" style=${{ fontSize: '10.5px' }}>${fmtDate(r.at)} · ${r.n} trades</span></div>
        <div class="card"><div style=${{ fontSize: '19.5px', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25 }}>${r.headline}</div><p class="mut" style=${{ lineHeight: 1.6 }}>${r.summary}</p>${r.rule && html`<div class="card tight row" style=${{ borderColor: 'var(--accg)', flexWrap: 'nowrap' }}><${I} n="shield" c="acc"/><div style=${{ flex: 1 }}><div class="lbl">New rule</div><b>${r.rule}</b></div><button class="btn btn-g xs" onClick=${() => { if (!S.settings.checklist.includes(r.rule)) store.setSettings({ checklist: [...S.settings.checklist, r.rule] }); toast('Added to your checklist') }}>Add to checklist</button></div>`}</div></div>
      <div class="grid g2"><div class="card" style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><div class="ch" style=${{ width: '100%' }}><h3>Your head, charted</h3></div><${Radar} spokes=${(r.psych || []).map(p => ({ k: p.k, v: p.v }))} size=${280}/></div>
        <div class="card"><div class="ch"><h3>Leaks</h3><span class="sub">Where the money goes</span></div><div class="col" style=${{ gap: '10px' }}>${(r.leaks || []).map((l, i) => html`<div key=${i} class="card tight" style=${{ background: 'var(--bg)' }}><div class="row"><b>${l.title}</b><span class="sp"></span>${isNum(l.cost) && html`<span class="chip neg">${money(-Math.abs(l.cost), { dec: 0 })}</span>`}</div><div class="mut" style=${{ fontSize: '11.5px', marginTop: '4px' }}>${l.detail}</div></div>`)}</div></div></div>
      <div class="grid g3"><div class="card"><div class="ch"><h3>Strengths</h3></div>${(r.strengths || []).map((x, i) => html`<div key=${i} class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: '8px', margin: '6px 0', fontSize: '12px' }}><span class="pos"><${I} n="check" s=${15}/></span><span>${x}</span></div>`)}</div>
        <div class="card"><div class="ch"><h3>Patterns</h3></div>${(r.patterns || []).map((x, i) => html`<div key=${i} class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: '8px', margin: '6px 0', fontSize: '12px' }}><span class="ai"><${I} n="brain" s=${15}/></span><span>${x}</span></div>`)}</div>
        <div class="card" style=${{ borderColor: 'var(--accg)' }}><div class="ch"><h3>Next two weeks</h3></div>${(r.takeaways || []).map((x, i) => html`<div key=${i} class="row" style=${{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: '10px', margin: '8px 0', fontSize: '12px' }}><span class="grade g-B">${i + 1}</span><span>${x}</span></div>`)}</div></div>`
    : !busy && html`<${Empty} icon="brain" title="No report yet" body="Run it once you have a week or two of trades. Re-run it every Sunday to see the trend."/>`}
  </div>`;
}

function Thinking() { return html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><span class="typing"><i></i><i></i><i></i></span><span class="dim">Reading your journal…</span></span>` }

/* ================= Compound · Flex (shareable P&L card) ================= */
function flexData(C, range, rangeOpt) {
  const now = new Date();
  const inR = t => { const d = new Date(t.t); if (range === 'month') return d.getMonth() === rangeOpt.m && d.getFullYear() === rangeOpt.y; if (range === 'year') return d.getFullYear() === rangeOpt.y; return true };
  const ts = C.D.ts.filter(inR); const s = stats(ts);
  const bySym = [...groupBy(ts, t => t.symbol)].map(([k, a]) => ({ k, n: a.length })).sort((a, b) => b.n - a.n);
  const accs = [...new Set(ts.map(t => t.account).filter(Boolean))].map(id => C.S.accounts[id]).filter(Boolean);
  const firms = [...new Set(accs.map(a => a.firm))];
  const days = byDay(ts); const dk = Object.keys(days); const green = dk.filter(k => days[k].pnl > 0).length;
  const eq = equitySeries(ts).map(p => p.v);
  const label = range === 'month' ? `${MON[rangeOpt.m].toUpperCase()} ${rangeOpt.y}` : range === 'year' ? String(rangeOpt.y) : 'ALL TIME';
  return { ts, s, top: bySym[0], firms, accs, green, days: dk.length, eq, label, name: C.S.settings.name || 'Trader', payouts: sum(Object.values(C.S.payouts).filter(p => p.status === 'paid' && (range === 'all' || (range === 'year' ? +p.d.slice(0, 4) === rangeOpt.y : p.d.slice(0, 7) === `${rangeOpt.y}-${pad(rangeOpt.m + 1)}`))), p => p.amount) };
}

const FLEX_THEMES = {
  midnight: { bg: '#000000', card: '#0B0B0D', glow: null, fg: '#F4F4F4', mut: '#8E8E8E', dim: '#4A4A4A', line: 'rgba(255,255,255,.08)' },
  aurora: { bg: '#03040A', card: '#070912', glow: ['#5B35E8', '#13D6B4'], fg: '#F4F4F4', mut: '#9AA0B4', dim: '#4A5068', line: 'rgba(255,255,255,.09)' },
  gold: { bg: '#050403', card: '#0C0A06', glow: ['#F3B43F', '#E2622A'], fg: '#FFF8EA', mut: '#B5A37F', dim: '#5A4E36', line: 'rgba(255,220,150,.12)' },
  ice: { bg: '#00060A', card: '#03101A', glow: ['#6FD3FF', '#5B8CFF'], fg: '#EEF8FF', mut: '#8FB0C4', dim: '#3C5566', line: 'rgba(160,220,255,.1)' },
};

function drawFlex(cv, d, o) {
  const story = o.format === 'story'; const W = story ? 1080 : 1600, H = story ? 1920 : 900;
  cv.width = W; cv.height = H; const x = cv.getContext('2d');
  const th = FLEX_THEMES[o.theme] || FLEX_THEMES.midnight; const acc = cssv('--acc') || '#5B8CFF';
  const pos = '#35D49A', neg = '#FF5A6E'; const net = d.s.net; const up = net >= 0;
  const SANS = 'Satoshi, "Satoshi Variable", -apple-system, Segoe UI, sans-serif', MONO = '"Geist Mono", ui-monospace, Menlo, monospace';
  const font = (w, sz, f = SANS) => x.font = `${w} ${sz}px ${f}`;
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath() };
  const spaced = (txt, X, Y, sp, align = 'left') => { let w = 0; for (const ch of txt) w += x.measureText(ch).width + sp; w -= sp; let cx = align === 'right' ? X - w : align === 'center' ? X - w / 2 : X; for (const ch of txt) { x.fillText(ch, cx, Y); cx += x.measureText(ch).width + sp } };
  // background
  x.fillStyle = th.bg; x.fillRect(0, 0, W, H);
  const P = story ? 56 : 48; rr(P, P, W - 2 * P, H - 2 * P, 44); x.save(); x.clip();
  x.fillStyle = th.card; x.fillRect(0, 0, W, H);
  const g1 = th.glow ? th.glow[0] : (up ? acc : neg), g2 = th.glow ? th.glow[1] : (up ? acc : neg);
  let rg = x.createRadialGradient(W * .18, H * .3, 0, W * .18, H * .3, W * .7); rg.addColorStop(0, g1 + '55'); rg.addColorStop(1, g1 + '00'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  rg = x.createRadialGradient(W * .95, H * .95, 0, W * .95, H * .95, W * .6); rg.addColorStop(0, g2 + '33'); rg.addColorStop(1, g2 + '00'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  // fine grid
  x.strokeStyle = th.line; x.lineWidth = 1; x.globalAlpha = .35; for (let gx = P; gx < W; gx += 64) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke() } for (let gy = P; gy < H; gy += 64) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke() } x.globalAlpha = 1;
  // equity curve, behind the number
  const eq = [0, ...d.eq];
  const cx0 = P, cw = story ? W - 2 * P - 34 : W * .62, cy0 = story ? H * .30 : H * .42, ch = story ? H * .28 : H * .5;
  if (eq.length > 2) {
    const mn = Math.min(...eq), mx = Math.max(...eq), sp = mx - mn || 1; const pt = i => [cx0 + i / (eq.length - 1) * cw, cy0 + ch - (eq[i] - mn) / sp * ch];
    const c = up ? (th.glow ? th.glow[0] : acc) : neg;
    x.beginPath(); eq.forEach((_, i) => { const [a, b] = pt(i); i ? x.lineTo(a, b) : x.moveTo(a, b) }); 
    const off = document.createElement('canvas'); off.width = W; off.height = H; const o2 = off.getContext('2d');
    o2.beginPath(); eq.forEach((_, i) => { const [a, b] = pt(i); i ? o2.lineTo(a, b) : o2.moveTo(a, b) }); o2.lineTo(cx0 + cw, H); o2.lineTo(cx0, H); o2.closePath();
    const lg = o2.createLinearGradient(0, cy0, 0, H); lg.addColorStop(0, c + '66'); lg.addColorStop(1, c + '00'); o2.fillStyle = lg; o2.fill();
    if (!story) { o2.globalCompositeOperation = 'destination-in'; const hm = o2.createLinearGradient(cx0, 0, cx0 + cw, 0); hm.addColorStop(0, 'rgba(0,0,0,1)'); hm.addColorStop(.75, 'rgba(0,0,0,.9)'); hm.addColorStop(1, 'rgba(0,0,0,0)'); o2.fillStyle = hm; o2.fillRect(0, 0, W, H) }
    x.drawImage(off, 0, 0);

    x.beginPath(); eq.forEach((_, i) => { const [a, b] = pt(i); i ? x.lineTo(a, b) : x.moveTo(a, b) }); x.strokeStyle = c; x.lineWidth = 4; x.shadowColor = c; x.shadowBlur = 24; x.stroke(); x.shadowBlur = 0;
    const [ea, eb] = pt(eq.length - 1); x.fillStyle = '#fff'; x.beginPath(); x.arc(ea, eb, 7, 0, 7); x.fill(); x.strokeStyle = c; x.lineWidth = 4; x.stroke();
  }
  x.restore();
  // border
  rr(P, P, W - 2 * P, H - 2 * P, 44); x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
  const L = P + (story ? 64 : 64);
  // header: avatar + name, brand mark
  const hy = P + (story ? 100 : 80);
  x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.arc(L + 30, hy, 30, 0, 7); x.fill(); x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
  x.fillStyle = th.fg; font(800, 28); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText((d.name[0] || 'V').toUpperCase(), L + 30, hy + 1);
  x.textAlign = 'left'; font(700, 30); x.fillText(o.anon ? 'Trader' : d.name, L + 76, hy + 1);
  const mR = W - P - (story ? 96 : 90), mY = hy; x.save(); x.translate(mR, mY); x.scale(1.9, 1.9); x.lineCap = 'round'; x.lineWidth = 3;
  const mg = x.createLinearGradient(-16, -16, 16, 16); mg.addColorStop(0, '#FFFFFF'); mg.addColorStop(1, th.glow ? th.glow[0] : acc); x.strokeStyle = mg;
  [[3.5, 1], [8, .8], [13, .55]].forEach(([r, a]) => { x.globalAlpha = a; x.beginPath(); x.arc(0, 0, r, Math.PI, Math.PI * 2.5); x.stroke() }); x.restore(); x.globalAlpha = 1;
  // period label
  x.textBaseline = 'alphabetic'; x.fillStyle = th.mut; font(500, 24, MONO); spaced(d.label, L, hy + (story ? 150 : 120), 6);
  // big number
  let big, bigC = th.fg;
  if (o.money) big = (net > 0 ? '+' : net < 0 ? '-' : '') + '$' + Math.abs(net).toLocaleString('en-US', { minimumFractionDigits: o.cents ? 2 : 0, maximumFractionDigits: o.cents ? 2 : 0 });
  else big = d.s.rN ? (d.s.totR > 0 ? '+' : '') + d.s.totR.toFixed(1) + 'R' : pct(d.s.wr, 0);
  if (o.color) bigC = up ? pos : neg;
  const maxW = story ? W - 2 * L : W * .58; let sz = story ? 230 : 210; font(900, sz); while (x.measureText(big).width > maxW && sz > 60) { sz -= 6; font(900, sz) }
  const by = hy + (story ? 150 : 120) + sz * .95;
  x.save(); x.shadowColor = (o.color ? bigC : (th.glow ? th.glow[0] : acc)) + '88'; x.shadowBlur = 60; x.fillStyle = bigC; x.fillText(big, L - sz * .03, by); x.restore();
  x.fillStyle = th.mut; font(600, 30); x.fillText(`${d.s.n} trades · ${d.s.w}W / ${d.s.l}L`, L, by + 64);
  // tiles + stats
  const T = story ? { x: L, y: H * .62, w: (W - 2 * L - 24) / 2 } : { x: W * .66, y: hy + 90, w: (W - P - 64 - W * .66 - 24) / 2 };
  const tile = (X, Y, w, h, title, sub, draw) => { rr(X, Y, w, h, 28); x.fillStyle = 'rgba(255,255,255,.045)'; x.fill(); x.strokeStyle = th.line; x.lineWidth = 2; x.stroke(); draw && draw(X + 26, Y + 26); x.fillStyle = th.fg; font(800, 38); x.fillText(title, X + 26, Y + h - 62); x.fillStyle = th.mut; font(600, 22); x.fillText(sub, X + 26, Y + h - 28) };
  const th1 = story ? 250 : 220;
  tile(T.x, T.y, T.w, th1, d.top ? d.top.k : '—', d.top ? `${Math.round(d.top.n / Math.max(1, d.s.n) * 100)}% of trades` : 'No trades', (X, Y) => { const f = x.createLinearGradient(X, Y, X + 64, Y + 64); f.addColorStop(0, '#16C2E8'); f.addColorStop(1, '#2B6BFF'); x.fillStyle = f; x.beginPath(); x.arc(X + 32, Y + 32, 32, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(X + 18, Y + 42); x.lineTo(X + 28, Y + 24); x.lineTo(X + 36, Y + 38); x.lineTo(X + 46, Y + 20); x.stroke() });
  tile(T.x + T.w + 24, T.y, T.w, th1, `${d.firms.length || 0} firm${d.firms.length === 1 ? '' : 's'}`, `${d.accs.length} prop account${d.accs.length === 1 ? '' : 's'}`, (X, Y) => { const ids = d.firms.slice(0, 3); if (!ids.length) { x.fillStyle = '#222'; x.beginPath(); x.arc(X + 32, Y + 32, 32, 0, 7); x.fill(); return } ids.forEach((id, i) => { const f = firmById(id); const gx = X + i * 40; const gr = x.createLinearGradient(gx, Y, gx + 64, Y + 64); gr.addColorStop(0, f.c[0]); gr.addColorStop(1, f.c[1]); x.fillStyle = gr; rr(gx, Y, 64, 64, 18); x.fill(); x.strokeStyle = th.card; x.lineWidth = 4; x.stroke(); x.fillStyle = '#fff'; font(900, f.mono.length > 1 ? 24 : 32); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(f.mono, gx + 32, Y + 34); x.textAlign = 'left'; x.textBaseline = 'alphabetic' }) });
  const sy = T.y + th1 + (story ? 60 : 48); x.strokeStyle = th.line; x.lineWidth = 2; x.beginPath(); x.moveTo(T.x, sy - 24); x.lineTo(T.x + 2 * T.w + 24, sy - 24); x.stroke();
  const pf = d.s.pf === Infinity ? '∞' : d.s.pf.toFixed(2);
  const cells = [['Win rate', pct(d.s.wr, 0), th.fg], [o.money ? 'Avg win' : 'Avg win R', o.money ? '$' + Math.round(d.s.avgW).toLocaleString() : (d.s.avgWR != null ? d.s.avgWR.toFixed(2) + 'R' : '—'), th.fg], ['Profit factor', pf, th.fg], [o.money ? 'Avg loss' : 'Green days', o.money ? '$' + Math.round(d.s.avgL).toLocaleString() : `${d.green}/${d.days}`, o.money ? th.mut : th.fg]];
  if (o.money && o.payouts && d.payouts) cells[3] = ['Payouts', '$' + Math.round(d.payouts).toLocaleString(), pos];
  cells.forEach(([k, v, c], i) => { const X = T.x + (i % 2) * (T.w + 24), Y = sy + Math.floor(i / 2) * (story ? 150 : 128); x.fillStyle = th.mut; font(600, 24); x.fillText(k, X, Y + 10); x.fillStyle = c; font(800, story ? 54 : 48); x.fillText(v, X, Y + (story ? 76 : 68)) });
  // footer
  x.fillStyle = th.dim; font(600, 22, MONO); spaced('COMPOUND', story ? W / 2 : T.x + T.w + 12, H - P - (story ? 70 : 54), 10, 'center');
}

function Flex({ C }) {
  const now = new Date();
  const [range, setRange] = useState(LS.get('compound.flex.range', 'all')); const [ro, setRo] = useState({ m: now.getMonth(), y: now.getFullYear() });
  const [o, setO] = useState(() => ({ format: innerWidth < 760 ? 'story' : 'landscape', theme: 'midnight', money: true, cents: true, color: false, anon: false, payouts: true, ...LS.get('compound.flex.opts', {}) }));
  const cv = useRef(); const [busy, setBusy] = useState(false);
  const d = useMemo(() => flexData(C, range, ro), [C.D, range, ro.m, ro.y]);
  const setOpt = p => { const n = { ...o, ...p }; setO(n); LS.set('compound.flex.opts', n) };
  useEffect(() => { let live = true; const go = () => live && cv.current && drawFlex(cv.current, d, o); Promise.all([document.fonts?.load?.('900 100px Satoshi'), document.fonts?.load?.('500 20px "Geist Mono"')].filter(Boolean)).then(go, go); go(); return () => { live = false } }, [d, o, store.s.settings.accent]);
  const blob = () => new Promise(r => cv.current.toBlob(r, 'image/png'));
  const fname = () => `compound-${d.label.toLowerCase().replace(/\s+/g, '-')}.png`;
  const share = async () => { setBusy(true); try { const b = await blob(); const f = new File([b], fname(), { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'My trading · Compound' }); else await download(b) } catch (e) { if (e?.name !== 'AbortError') toast('Sharing was not available. Try Save image.') } setBusy(false) };
  const download = async b => { b = b || await blob(); const dl = store.caps.downloads || fileDownloads; try { await dl.save({ filename: fname(), data: b }); toast('Image saved') } catch (e) { toast('Could not save the image here') } };
  const copy = async () => { try { const b = await blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Image copied. Paste it anywhere.') } catch (e) { toast('Copy is not supported here. Use Save image.') } };
  const years = [...new Set(C.D.ts.map(t => new Date(t.t).getFullYear()).concat(now.getFullYear()))].sort((a, b) => b - a);
  const shift = n => { if (range === 'month') { const dt = new Date(ro.y, ro.m + n, 1); setRo({ m: dt.getMonth(), y: dt.getFullYear() }) } else if (range === 'year') setRo({ ...ro, y: ro.y + n }) };
  return html`<div class="page">
    <div class="row"><${Seg} v=${range} set=${v => { setRange(v); LS.set('compound.flex.range', v) }} opts=${[['month', 'Month'], ['year', 'Year'], ['all', 'All']]}/>
      ${range !== 'all' && html`<div class="row" style=${{ gap: '4px' }}><button class="ib" onClick=${() => shift(-1)} aria-label="Previous"><${I} n="left"/></button><b style=${{ minWidth: '110px', textAlign: 'center' }}>${range === 'month' ? MON[ro.m] + ' ' + ro.y : ro.y}</b><button class="ib" onClick=${() => shift(1)} aria-label="Next"><${I} n="right"/></button></div>`}
      <span class="sp"></span><span class="mut hide-m" style=${{ fontSize: '11.5px' }}>${scopeLabel(C.S, C.F)}</span>
      <button class="btn btn-g sm" onClick=${copy}><${I} n="copy"/>Copy</button><button class="btn btn-g sm" onClick=${() => download()}><${I} n="download"/>Save image</button><button class="btn btn-w" disabled=${busy} onClick=${share}><${I} n="send"/>Share</button></div>
    <div class="flexwrap"><canvas ref=${cv} class=${'flexcv ' + o.format} aria-label=${`${d.label} P&L card`}></canvas></div>
    <div class="card"><div class="grid g4 keep2" style=${{ gap: '16px', alignItems: 'start' }}>
      <${Field} label="Format"><${Seg} sm v=${o.format} set=${v => setOpt({ format: v })} opts=${[['landscape', 'Post'], ['story', 'Story']]}/><//>
      <${Field} label="Style"><div class="row" style=${{ gap: '8px' }}>${Object.entries({ midnight: '#1a1a1a', aurora: 'linear-gradient(135deg,#5B35E8,#13D6B4)', gold: 'linear-gradient(135deg,#F3B43F,#E2622A)', ice: 'linear-gradient(135deg,#6FD3FF,#5B8CFF)' }).map(([k, bg]) => html`<button key=${k} title=${k} onClick=${() => setOpt({ theme: k })} style=${{ width: '30px', height: '30px', borderRadius: '9px', background: bg, outline: o.theme === k ? '2px solid var(--fg)' : 'none', outlineOffset: '2px', border: '1px solid var(--line2)' }}></button>`)}</div><//>
      <${Field} label="Show"><div class="col" style=${{ gap: '6px', fontSize: '11.5px' }}>
        <label class="row" style=${{ gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked=${o.money} onChange=${e => setOpt({ money: e.target.checked })}/>Dollar amounts</label>
        ${o.money && html`<label class="row" style=${{ gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked=${o.cents} onChange=${e => setOpt({ cents: e.target.checked })}/>Cents</label>`}
        ${o.money && html`<label class="row" style=${{ gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked=${o.payouts} onChange=${e => setOpt({ payouts: e.target.checked })}/>Payouts</label>`}</div><//>
      <${Field} label="Look"><div class="col" style=${{ gap: '6px', fontSize: '11.5px' }}>
        <label class="row" style=${{ gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked=${o.color} onChange=${e => setOpt({ color: e.target.checked })}/>Green/red number</label>
        <label class="row" style=${{ gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked=${o.anon} onChange=${e => setOpt({ anon: e.target.checked })}/>Hide my name</label></div><//>
    </div><div class="dim" style=${{ fontSize: '11px', marginTop: '12px' }}>The card uses the accounts selected at the top left. With dollar amounts off it shows total R instead, so you can flex the edge without the size.</div></div>
  </div>`;
}

/* ================= Compound · shell ================= */
const VIEWS = [
  ['dashboard', 'Dashboard', 'grid'], ['journal', 'Journal', 'book'], ['showcase', 'Showcase', 'star'], ['strategy', 'Strategy', 'target'], ['study', 'Study', 'column'],
  '|',
  ['chart', 'Chart', 'candle'], ['analytics', 'Analytics', 'bars'], ['propfirm', 'Propfirm', 'building'], ['ai', 'AI', 'spark'], ['progress', 'Progress', 'trophy'],
];

function Desk({ C, onPick }) {
  const { S, D } = C; const { all } = useMemo(() => computeTrades(S, { mode: 'all', dedupe: false }), [store.v]);
  const accs = Object.values(S.accounts).filter(a => a.status === 'active').sort((a, b) => (a.created || 0) - (b.created || 0));
  const st = S.settings; const today = D.ts.filter(t => dayKey(t.t) === todayKey()); const tp = sum(today, t => t.pnl);
  const used = Math.max(0, -tp); const lim = st.maxDailyLoss || 0; const usedPct = lim ? clamp(used / lim * 100) : 0;
  let cl = 0; for (const t of [...today].sort((a, b) => tTime(b) - tTime(a))) { if (t.pnl < 0) cl++; else break }
  const warn = (lim && used >= lim * .75) || (st.maxTrades && today.length >= st.maxTrades) || (st.maxConsecLosses && cl >= st.maxConsecLosses);
  return html`<aside class="desk" aria-label="Accounts">
    <div class="rhead"><span class="lbl" style=${{ color: 'var(--fg2)', letterSpacing: '.2em' }}>Desk</span><button class="ib" onClick=${C.toggleDesk} aria-label="Collapse"><${I} n="dleft" s=${14}/></button></div>
    <div class="row" style=${{ padding: '4px 2px 10px' }}><span class="lbl">Accounts</span><span class="sp"></span><span class="dim" style=${{ fontSize: '10.5px' }}>${accs.length} · Open</span></div>
    <div class="col" style=${{ gap: '8px', overflow: 'auto', flex: 1, minHeight: 0, paddingBottom: '10px' }}>
      ${accs.map(a => { const s = acctState(a, all, Object.values(S.adjust).filter(x => x.account === a.id)); const on = (C.F.accounts || []).includes(a.id); const lp = a.mll ? clamp(s.left / (+a.mll) * 100) : 100;
        return html`<button key=${a.id} class=${'acct' + (on ? ' on' : '')} onClick=${() => onPick(a.id)} title=${on ? 'Click to remove from the view' : 'Click to view this account (add more to combine)'}>
          <div class="row" style=${{ flexWrap: 'nowrap', gap: '8px' }}><${FirmLogo} id=${a.firm} s=${20}/><b style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.label}</b><span class=${'tn ' + cls(s.today)} style=${{ fontSize: '10.5px', fontWeight: 700 }}>${s.today ? moneyK(s.today, { sign: true }) : '—'}</span></div>
          <div class="prog"><i style=${{ width: lp + '%', background: lp < 30 ? 'var(--neg)' : lp < 60 ? 'var(--warn)' : 'var(--acc)' }}></i></div>
          <div class="kv"><span>${a.type === 'eval' ? 'EVAL' : a.type === 'funded' ? 'FUNDED' : 'LIVE'}</span><b>${money(s.left, { dec: 0 })} left</b></div>
          ${s.consLimit ? html`<div class="kv"><span>CONSISTENCY</span><b class=${s.consOk ? '' : 'neg'}>${s.consOk ? pct(s.consLimit, 0) + ' limit' : pct(s.consUsed, 0) + ' · over'}</b></div>` : s.toGo != null ? html`<div class="kv"><span>TARGET</span><b>${money(s.toGo, { dec: 0 })} to go</b></div>` : null}
        </button>` })}
      <button class="acct" style=${{ borderStyle: 'dashed', alignItems: 'center', color: 'var(--mut)', flexDirection: 'row', justifyContent: 'center' }} onClick=${() => UI.open('account')}><${I} n="plus" s=${14}/>Add account</button>
    </div>
    <div style=${{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
      <div class="row"><span class="lbl" style=${{ color: warn ? 'var(--neg)' : undefined }}>Guardrails</span><span class="sp"></span><span class="tn" style=${{ fontSize: '11px', fontWeight: 700 }}>${money(tp, { dec: 0 })} / -${money(lim, { dec: 0 }).replace('$', '$')}</span></div>
      <div class="prog" style=${{ margin: '10px 0' }}><i style=${{ width: usedPct + '%', background: usedPct > 75 ? 'var(--neg)' : usedPct > 40 ? 'var(--warn)' : 'var(--pos)' }}></i></div>
      <div class="row" style=${{ fontSize: '11px' }}><span class=${warn ? 'neg' : 'mut'}>${warn ? (cl >= st.maxConsecLosses ? `${cl} losses in a row. Walk away.` : today.length >= st.maxTrades ? `Trade cap hit (${today.length}/${st.maxTrades}). Done for today.` : 'Close to your daily max loss.') : today.length ? `${today.length}/${st.maxTrades} trades today` : 'No loss today.'}</span><span class="sp"></span><button class="ib" onClick=${() => UI.open('settings', { tab: 'guard' })} aria-label="Edit guardrails"><${I} n="sliders" s=${14}/></button></div>
      <div style=${{ marginTop: '10px' }}><${Seg} v=${C.F.mode} set=${C.setMode} opts=${[['live', 'Live money'], ['paper', 'Paper money']]}/></div>
    </div></aside>`;
}

function Rail({ C }) {
  const { S, D } = C; const k = todayKey(); const day = S.days[k] || { id: k }; const st = S.settings;
  const [cl, setCl] = useState(LS.get('compound.rail', {})); const tog = x => { const n = { ...cl, [x]: !cl[x] }; setCl(n); LS.set('compound.rail', n) };
  const checks = day.checks || {}; const done = st.checklist.filter((_, i) => checks[i]).length;
  const today = D.ts.filter(t => dayKey(t.t) === k); const kept = today.filter(t => t.rules === true).length;
  const [, tick] = useState(0); useEffect(() => { if (!day.session?.start || day.session.end) return; const i = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(i) }, [day.session?.start, day.session?.end]);
  const sess = day.session; const elapsed = sess?.start ? ((sess.end || Date.now()) - sess.start) / 60000 : 0;
  const Sec = ({ id, title, right, children }) => html`<div class="sec"><div class=${'sech' + (cl[id] ? ' closed' : '')} onClick=${() => tog(id)}><${I} n="down" c="chev"/><span class="lbl">${title}</span><span onClick=${e => e.stopPropagation()}>${right}</span></div>${!cl[id] && children}</div>`;
  return html`<aside class="rail" aria-label="Today">
    <div class="rhead"><button class="ib" onClick=${C.toggleRail} aria-label="Collapse"><${I} n="dright" s=${14}/></button><b class="tn" style=${{ fontSize: '13px', letterSpacing: '.04em' }}>${pad(new Date().getMonth() + 1)}/${pad(new Date().getDate())}</b></div>
    <${Sec} id="plan" title="The plan" right=${html`<button class="lnk" onClick=${() => UI.open('plan', { day: k })}>${day.plan ? 'Edit' : 'Write'}</button>`}>
      ${day.plan ? html`<button class="card tight" style=${{ textAlign: 'left', width: '100%', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '6px' }} onClick=${() => UI.open('plan', { day: k })}>
        ${day.plan.bias && html`<span class=${'chip ' + (day.plan.bias === 'bull' ? 'pos' : day.plan.bias === 'bear' ? 'neg' : '')} style=${{ alignSelf: 'flex-start' }}>${({ bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral', wait: 'Wait for it' })[day.plan.bias]}</span>`}
        ${day.plan.focus && html`<b>${day.plan.focus}</b>`}${planLevels(day.plan).length > 0 && html`<span class="mut mdtx" style=${{ fontSize: '11px', fontFamily: 'var(--mono)' }}>${levelsText(day.plan)}</span>`}${day.plan.rule && html`<span class="dim">Rule: ${day.plan.rule}</span>`}${day.plan.news && html`<span class="dim">News: ${day.plan.news}</span>`}</button>`
        : html`<button class="card tight dim" style=${{ width: '100%', fontSize: '11.5px', textAlign: 'center', borderStyle: 'dashed' }} onClick=${() => UI.open('plan', { day: k })}>No pre-market plan yet</button>`}<//>
    <${Sec} id="check" title="Checklist" right=${html`<span class="row" style=${{ gap: '4px' }}><span class="dim tn" style=${{ fontSize: '10.5px' }}>${done}/${st.checklist.length}</span><button class="ib" style=${{ width: '24px', height: '24px' }} onClick=${() => UI.open('settings', { tab: 'journal' })} aria-label="Edit checklist"><${I} n="edit" s=${12}/></button></span>`}>
      ${st.checklist.map((c, i) => html`<button key=${i} class=${'chk' + (checks[i] ? ' on' : '')} onClick=${() => store.put('days', { ...day, id: k, checks: { ...checks, [i]: !checks[i] } })}><span class="bx">${checks[i] && html`<${I} n="check" w=${3}/>`}</span><span>${c}</span></button>`)}
      ${done === st.checklist.length && st.checklist.length > 0 && html`<div class="chip pos" style=${{ marginTop: '6px' }}>Cleared to trade</div>`}<//>
    <${Sec} id="sess" title="Session" right=${sess?.start && !sess.end ? html`<span class="chip pos tn">● ${fmtDur(elapsed)}</span>` : null}>
      <div class="row" style=${{ alignItems: 'baseline' }}><span class="tn" style=${{ fontSize: '23px', fontWeight: 800, letterSpacing: '-.03em' }}>${sess?.start ? fmtDur(elapsed) : '—'}</span><span class="sp"></span>
        ${!sess?.start || sess.end ? html`<button class="btn btn-g xs" onClick=${() => store.put('days', { ...day, id: k, session: { start: Date.now() } })}><${I} n="play" s=${12}/>${sess?.end ? 'Restart' : 'Start'}</button>` : html`<button class="btn btn-g xs" onClick=${() => store.put('days', { ...day, id: k, session: { ...sess, end: Date.now() } })}><${I} n="stop" s=${12}/>End</button>`}</div>
      <div class="kv" style=${{ marginTop: '8px' }}><span>Rules kept</span><b>${today.length ? `${kept}/${today.length}` : '—'}</b></div>
      <div class="kv" style=${{ marginTop: '4px' }}><span>Today</span><b class=${cls(sum(today, t => t.pnl))}>${today.length ? money(sum(today, t => t.pnl), { sign: true, dec: 0 }) : '—'}</b></div><//>
    <${Sec} id="recent" title="Recent trades" right=${html`<button class="lnk" onClick=${() => C.go('journal')}>All</button>`}>
      ${D.ts.length ? D.ts.slice(0, 6).map(t => html`<button key=${t.id} class="row" style=${{ width: '100%', padding: '7px 0', flexWrap: 'nowrap', gap: '8px', fontSize: '11.5px' }} onClick=${() => UI.open('detail', { id: t.id, list: D.ts.slice(0, 30).map(x => x.id) })}><span class=${'dot ' + (t.pnl >= 0 ? 'ok' : '')} style=${{ background: t.pnl >= 0 ? 'var(--pos)' : 'var(--neg)', boxShadow: 'none' }}></span><b>${t.symbol}</b><span class="dim tn">${fmtDate(t.t)}</span><span class="sp"></span><${Money} v=${t.pnl}/></button>`) : html`<div class="dim" style=${{ fontSize: '11.5px' }}>Nothing logged yet.</div>`}<//>
  </aside>`;
}

function App() {
  const S = useStore(); useViewport();
  const hv = () => { const h = location.hash.slice(1); return VIEWS.find(v => v[0] === h) || h === 'flex' ? h : null };
  const [view, setView] = useState(() => hv() || LS.get('compound.view', 'dashboard'));
  const [params, setParams] = useState(null);
  const [modals, setModals] = useState([]);
  const [mode, setModeS] = useState(LS.get('compound.mode', 'live'));
  const [accts, setAcctsS] = useState(() => { const v = LS.get('compound.accts', null); if (Array.isArray(v)) return v; const o = LS.get('compound.acct', 'all'); return o && o !== 'all' ? [o] : [] });
  const [am, setAm] = useState(false);
  const [, setHideV] = useState(UIS.hide);
  const [lc, setLc] = useState(LS.get('compound.ldc', false)); const [rc, setRc] = useState(LS.get('compound.rdc', false));
  const [lo, setLo] = useState(false); const [ro, setRo] = useState(false);
  const mainRef = useRef();
  useLayoutEffect(() => { const r = document.documentElement; r.classList.toggle('lt', S.settings.theme === 'light'); r.dataset.acc = S.settings.accent || 'cobalt' }, [S.settings.theme, S.settings.accent]);
  useEffect(() => { if (store.mode !== 'cloud' && store.mode !== 'local') return; if ((S.settings.themeV || 0) < 3) store.setSettings({ themeV: 3, accent: 'cobalt' }) }, [store.mode, S.settings.themeV]);
  useEffect(() => { if (store.mode !== 'cloud' && store.mode !== 'local') return; if (store.mode === 'cloud' && !(store.ready.root && store.ready.accounts && store.ready.trades)) return; if ((S.settings.cfdV || 0) < 2 && Object.keys(S.accounts).length) { const n = migrateCfdPV(S); if (n) toast(`Fixed NAS100 P&L on ${n} CFD trade${n > 1 ? 's' : ''} ($10 per point per lot)`) } }, [store.mode, S.settings.cfdV, Object.keys(S.accounts).length, store.ready.trades]);
  const go = (v, p) => { setView(v); setParams(p ? { ...p, _: Date.now() } : null); LS.set('compound.view', v); setModals([]); setLo(false); setRo(false); if (mainRef.current) mainRef.current.scrollTop = 0 };
  UI.go = go;
  UI.open = (kind, props = {}) => setModals(m => [...m.filter(x => !(kind === 'detail' && x.kind === 'detail')), { kind, props, id: uid() }]);
  UI.close = () => setModals(m => m.slice(0, -1));
  UI.confirm = p => UI.open('confirm', p);
  const setMode = v => { setModeS(v); LS.set('compound.mode', v) }; const setAccts = v => { setAcctsS(v); LS.set('compound.accts', v) };
  const togAcct = id => { const cur = accts.filter(x => S.accounts[x]); setAccts(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]) };
  const toggleHide = () => { UIS.hide = !UIS.hide; LS.set('compound.hide', UIS.hide); setHideV(UIS.hide); store.emit() };
  const validA = accts.filter(id => S.accounts[id]);
  const F = { mode, accounts: validA, account: validA.length === 1 ? validA[0] : 'all' };
  const D = useMemo(() => computeTrades(S, F), [store.v, F.mode, validA.join(',')]);
  const C = { S, D, F, go, setMode, toggleHide, toggleDesk: () => { if (deskNarrow()) setLo(false); else { setLc(!lc); LS.set('compound.ldc', !lc) } }, toggleRail: () => { if (railNarrow()) setRo(false); else { setRc(!rc); LS.set('compound.rdc', !rc) } } };
  useEffect(() => {
    const k = e => { if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return; if (e.metaKey || e.ctrlKey || e.altKey) return; if (modals.length) return;
      if (e.key === 'n') { e.preventDefault(); UI.open('trade', { mode }) } else if (e.key === 'q') { e.preventDefault(); UI.open('quick', { mode }) } else if (e.key === '/') { e.preventDefault(); go('journal'); setTimeout(() => document.getElementById('tsearch')?.focus(), 80) } else if (e.key === 'h') toggleHide(); else if (/^[1-9]$/.test(e.key)) { const v = VIEWS.filter(x => x !== '|')[+e.key - 1]; v && go(v[0]) } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [modals.length, mode]);
  const scope = scopeLabel(S, F);
  const V = { flex: Flex, dashboard: Dashboard, journal: Journal, showcase: Showcase, strategy: Strategy, study: Study, chart: ChartPage, analytics: Analytics, propfirm: Propfirm, ai: AIPage, progress: Progress, flex: Flex }[view] || Dashboard;
  const tabs = VIEWS.filter(v => v !== '|');
  const sync = store.mode === 'cloud' ? (store.syncErr ? ['wait', 'Reconnecting…'] : ['ok', 'Synced across devices' + (store.lastSync ? ' · ' + fmtTime(store.lastSync) : '')]) : store.mode === 'local' ? ['loc', 'This browser only · not syncing'] : ['wait', 'Connecting…'];
  const full = view === 'ai'; const wide = view === 'chart' && LIVE_OK && LS.get('compound.chartmode', 'live') === 'live';
  if (store.mode === 'login') return html`<${Login}/><${Toasts}/>`;
  if (store.mode === 'setup') return html`<${Setup}/><${Toasts}/>`;
  return html`<div class=${'shell' + (lc ? ' ldc' : '') + (rc || full || wide ? ' rdc' : '') + (lo ? ' ldo' : '') + (ro ? ' rdo' : '') + (full || wide ? ' ldc' : '')}>
    <header class="top">
      <div class="l"><button class="ib" style=${{ display: lc || deskNarrow() || full ? 'grid' : 'none' }} onClick=${() => { if (deskNarrow()) setLo(!lo); else { setLc(false); LS.set('compound.ldc', false) } }} aria-label="Accounts"><${I} n="dright" s=${14}/></button>
        <button class="mark" onClick=${() => go('dashboard')} aria-label="Compound home"><${Mark} s=${26}/><span class="wm mob-only" style=${{ fontSize: '15px' }}>Compound</span></button>
        <div style=${{ position: 'relative' }}><button class=${'pill' + (validA.length ? ' hot' : '')} onClick=${() => setAm(!am)} title="Choose which accounts everything shows"><${I} n="layers" s=${13}/><b>${scope}</b><${I} n="down" s=${12}/></button>
          <${AcctMenu} open=${am} onClose=${() => setAm(false)} S=${S} sel=${validA} setSel=${setAccts} tog=${togAcct}/></div>${F.mode === 'paper' && html`<span class="pill" style=${{ color: 'var(--gold)' }}>Paper</span>`}</div>
      <nav class="nav" aria-label="Sections">${VIEWS.map((v, i) => v === '|' ? html`<button key="wm" class="wmc mark" onClick=${() => go('dashboard')}><span class="wm" style=${{ textAlign: 'center' }}>Compound<small>${F.mode === 'paper' ? 'Paper money' : 'Live money'}</small></span></button>` : html`<button key=${v[0]} class=${'tab' + (view === v[0] ? ' on' : '')} onClick=${() => go(v[0])} title=${v[1] + ' (' + (tabs.indexOf(v) + 1) + ')'}><${I} n=${v[2]}/><span class="t">${v[1]}</span></button>`)}</nav>
      <div class="r"><button class="ib mob-only" onClick=${() => toast(sync[1])} aria-label=${sync[1]} title=${sync[1]}><span class=${'dot ' + sync[0]}></span></button><button class=${'ib flexbtn' + (view === 'flex' ? ' on' : '')} onClick=${() => go('flex')} title="Flex your results" aria-label="Flex"><span class="flexd">$</span></button><button class="ib hide-m" onClick=${toggleHide} title="Hide P&L (h)"><${I} n=${UIS.hide ? 'eyeoff' : 'eye'}/></button>
        <button class="ib" onClick=${() => UI.open('quick', { mode })} title="Quick log (q)"><${I} n="bolt"/></button>
        <button class="ib" onClick=${() => UI.open('settings')} title="Settings"><${I} n="palette"/></button>
        <button class="ib" style=${{ display: rc || railNarrow() || full ? 'grid' : 'none' }} onClick=${() => { if (railNarrow()) setRo(!ro); else { setRc(false); LS.set('compound.rdc', false) } }} aria-label="Today panel"><${I} n="cal"/></button>
        <span class="ava hide-m">${(S.settings.name || 'V')[0]}</span></div>
    </header>
    ${!full && !wide && html`<${Desk} C=${C} onPick=${id => togAcct(id)}/>`}
    <main class="main" ref=${mainRef} style=${full ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : null}>
      ${store.mode === 'local' && html`<div class="card tight row" style=${{ margin: '14px 30px 0', borderColor: 'var(--warn)' }}><span class="dot wait"></span><span style=${{ flex: 1, fontSize: '12px' }}>Not syncing. This copy saves to this browser only. Use your Compound app (home-screen / taskbar icon) so trades show up on every device.</span></div>`}
      ${store.localPending && html`<div class="card tight row" style=${{ margin: '14px 30px 0', borderColor: 'var(--accg)' }}><${I} n="refresh"/><span style=${{ flex: 1 }}>You have journal data saved in this browser from before sync was on.</span><button class="btn btn-w sm" onClick=${() => store.migrateLocal()}>Move it into my synced journal</button><button class="btn btn-t sm" onClick=${() => store.dismissLocal()}>Not now</button></div>`}
      <${V} C=${C} params=${params}/></main>
    ${!full && !wide && html`<${Rail} C=${C}/>`}
    <footer class="foot"><span class="sync"><span class=${'dot ' + sync[0]}></span>${sync[1]}</span><span class="dim hide-m">n new trade · q quick log · / search · h hide P&L · 1–9 pages</span>
      <span class="mid"><a class="dim hide-m" href="https://www.tradingview.com/" target="_blank" rel="noopener" style=${{ fontSize: '10px', textDecoration: 'none' }}>Charts by TradingView</a></span><button class="btn btn-t xs" onClick=${() => UI.open('import', { mode })}><${I} n="upload" s=${13}/>Import</button><button class="btn btn-t xs" onClick=${() => UI.open('settings', { tab: 'data' })}><${I} n="download" s=${13}/>Backup</button></footer>
    <nav class="nav-m" aria-label="Sections">${tabs.map(v => html`<button key=${v[0]} class=${view === v[0] ? 'on' : ''} onClick=${() => go(v[0])}><${I} n=${v[2]}/>${v[1]}</button>`)}</nav>
  </div>
  ${view !== 'ai' && view !== 'chart' && html`<button class="fab" onClick=${() => go('ai')} aria-label="Ask your coach" title="Ask your coach"><${Mark} s=${26}/></button>`}
  ${modals.map((m, i) => { const close = () => setModals(x => x.filter(y => y.id !== m.id)); const p = { ...m.props, onClose: close, key: m.id };
    switch (m.kind) {
      case 'trade': return html`<${TradeForm} ...${p} mode=${p.mode || mode}/>`; case 'quick': return html`<${QuickLog} ...${p} mode=${p.mode || mode}/>`;
      case 'detail': return html`<${TradeDetail} ...${p}/>`; case 'account': return html`<${AccountForm} ...${p}/>`; case 'payout': return html`<${PayoutForm} ...${p}/>`;
      case 'strategy': return html`<${StrategyForm} ...${p}/>`; case 'plan': return html`<${PlanForm} ...${p}/>`; case 'review': return html`<${ReviewForm} ...${p}/>`;
      case 'import': return html`<${ImportTrades} ...${p} mode=${p.mode || mode}/>`; case 'settings': return html`<${SettingsWrap} ...${p}/>`; case 'confirm': return html`<${Confirm} ...${p}/>`;
      case 'assign': return html`<${AssignTrades} ...${p}/>`; case 'delacct': return html`<${DeleteAccount} ...${p}/>`; case 'balance': return html`<${BalanceSync} ...${p}/>`; case 'blown': return html`<${BlownForm} ...${p}/>`; case 'day': return html`<${DaySheet} ...${p} C=${C} days=${byDay(D.ts)}/>`; default: return null;
    } })}
  <${Toasts}/><${Tip}/>`;
}
function SettingsWrap(p) { return html`<${Settings} ...${p}/>` }

store.boot();
render(html`<${App}/>`, document.getElementById('app'));
window.__compoundUp = true;

function AcctMenu({ open, onClose, S, sel, setSel, tog }) {
  const accs = Object.values(S.accounts).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (a.created || 0) - (b.created || 0));
  const quick = (l, f) => { const ids = accs.filter(f).map(a => a.id); return ids.length ? html`<button class="chip" onClick=${() => setSel(ids)}>${l} · ${ids.length}</button>` : null };
  return html`<${Menu} open=${open} onClose=${onClose} style=${{ top: '36px', left: 0, width: 'min(320px,calc(100vw - 24px))', padding: '8px' }}>
    <button class=${!sel.length ? 'on' : ''} onClick=${() => setSel([])}><${I} n="layers"/><span style=${{ flex: 1 }}><b>All accounts</b><span class="dim" style=${{ display: 'block', fontSize: '10px' }}>Cumulative view of everything</span></span>${!sel.length && html`<${I} n="check"/>`}</button>
    <hr/>
    ${accs.length ? accs.map(a => { const on = sel.includes(a.id); return html`<button key=${a.id} class=${on ? 'on' : ''} onClick=${() => tog(a.id)}><span class=${'chk' + (on ? ' on' : '')} style=${{ width: 'auto', padding: 0 }}><span class="bx">${on && html`<${I} n="check" w=${3}/>`}</span></span><${FirmLogo} id=${a.firm} s=${20}/><span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.label}</span><span class="dim" style=${{ fontSize: '9.5px' }}>${a.status === 'active' ? (a.type === 'eval' ? 'Eval' : a.type === 'funded' ? 'Funded' : 'Live') : a.status}</span></button>` }) : html`<div class="dim" style=${{ padding: '8px 10px', fontSize: '11.5px' }}>No accounts yet.</div>`}
    <hr/>
    <div class="row" style=${{ gap: '6px', padding: '4px 6px' }}>${quick('Evals', a => a.type === 'eval' && a.status === 'active')}${quick('Funded', a => a.type === 'funded' && a.status === 'active')}${quick('Active', a => a.status === 'active')}</div>
    <div class="row" style=${{ padding: '6px', justifyContent: 'space-between' }}><span class="dim" style=${{ fontSize: '10.5px' }}>${sel.length ? sel.length + ' selected' : 'Showing all'}</span><button class="btn btn-w xs" onClick=${onClose}>Done</button></div>
  <//>`;
}

/* standalone app: notice a newer build on GitHub Pages and switch to it.
   Reopening the app from the home screen does not reload it on iOS, so check whenever it comes back to the front. */
(function () {
  if (!window.COMPOUND_V || location.protocol === 'file:') return;
  let busy = false, pending = false, last = 0;
  const idle = () => !document.querySelector('.ov,.drw') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  const go = v => { try { sessionStorage.setItem('compound.upd', v) } catch (e) { } try { navigator.serviceWorker?.getRegistration().then(r => r?.update()) } catch (e) { } location.reload() };
  const check = async (fromWake) => {
    if (busy || Date.now() - last < 15000) return; busy = true; last = Date.now();
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json();
      if (j.v && j.v !== window.COMPOUND_V) { let tried = null; try { tried = sessionStorage.getItem('compound.upd') } catch (e) { } if (fromWake && idle() && tried !== j.v) return go(j.v); if (!pending) { pending = true; toast('A new version of Compound is ready', { label: 'Update', fn: () => go(j.v) }) } }
    } catch (e) { } busy = false;
  };
  setTimeout(() => check(true), 3000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(true) });
  addEventListener('focus', () => check(true));
  setInterval(() => { if (document.visibilityState === 'visible') { pending = false; check(false) } }, 10 * 60000);
})();
