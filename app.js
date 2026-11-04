const KEY = 'dtl.v1';
const DAY_IDS = D_IDS.concat(W_IDS);

let db = load();
let mem = { runId: null, act: null, i: 0, dayQid: null, answerFromHistory: false };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, settings: { askOnEntry: true, lastAsk: '', lastExportAt: null }, runs: [] };
    const d = JSON.parse(raw);
    d.settings = Object.assign({ askOnEntry: true, lastAsk: '', lastExportAt: null }, d.settings || {});
    d.runs = d.runs || [];
    return d;
  } catch (e) {
    return { version: 1, settings: { askOnEntry: true, lastAsk: '', lastExportAt: null }, runs: [] };
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('存储失败', e); }
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateLabel(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

function timeLabel(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function runName(run) { return dateLabel(run.startedAt); }

function qText(run, qid) {
  let q = Q[qid].q;
  if (q.indexOf('{{V2}}') > -1) {
    const v = answerText(run, 'V2').trim();
    q = v ? q.replace('{{V2}}', v) : q.replace('「{{V2}}」', '那个身份');
  }
  return q;
}

const CARD_FIELDS = [
  ['antiVision', '赌注 · 反愿景'],
  ['vision', '获胜 · 愿景'],
  ['oneYear', '主线 · 一年'],
  ['oneMonth', '首领 · 一月'],
  ['levers', '任务 · 明天'],
  ['constraints', '规则 · 不牺牲的']
];

function collectRun(run) {
  const b = run.board || {};
  const acts = [
    { title: '第一幕 · 早晨', rows: MORNING.filter(id => hasAnswer(run, id))
        .map(id => ({ q: qText(run, id), a: answerText(run, id).trim() })) },
    { title: '第二幕 · 白天', rows: ((run.day && run.day.entries) || []).slice()
        .sort((x, y) => x.createdAt - y.createdAt)
        .map(e => ({ q: e.qid ? qText(run, e.qid) : '自由记录', a: e.text, time: timeLabel(e.createdAt) })) },
    { title: '第三幕 · 晚上', rows: EVENING.filter(id => hasAnswer(run, id))
        .map(id => ({ q: qText(run, id), a: answerText(run, id).trim() })) }
  ];
  const cards = CARD_FIELDS.map(([k, lab]) => ({ lab: lab, v: (b[k] || '').trim() }));
  return {
    date: dateLabel(run.startedAt),
    started: timeLabel(run.startedAt),
    finished: run.finishedAt ? timeLabel(run.finishedAt) : '',
    status: run.status === 'done' ? '已完成' : '进行中',
    count: answeredCount(run),
    acts: acts, cards: cards
  };
}

function summaryHTML(data, withCards) {
  let h = '<div class="sum">';
  if (withCards) {
    h += '<div class="sumcards">' + data.cards.map(c =>
      '<div class="sumcard"><div class="lab">' + esc(c.lab) + '</div>' +
      '<div class="val' + (c.v ? '' : ' none') + '">' +
      (c.v ? esc(c.v).replace(/\n/g, '<br>') : '没写') + '</div></div>').join('') + '</div>';
  }
  data.acts.forEach(a => {
    h += '<h2 class="sech">' + esc(a.title) + '<span>' + a.rows.length + ' 条</span></h2>';
    if (!a.rows.length) { h += '<p class="tip">这一部分当时没有写。</p>'; return; }
    h += a.rows.map((r, i) => '<div class="sumitem">' +
      '<div class="qline"><span class="tm">' + (r.time || (i + 1)) + '</span>' + esc(r.q) + '</div>' +
      '<div class="aline">' + esc(r.a).replace(/\n/g, '<br>') + '</div></div>').join('');
  });
  return h + '</div>';
}

function runMarkdown(run) {
  const d = collectRun(run);
  const L = ['# 一天 · ' + d.date, '',
    '> 开始 ' + d.started + (d.finished ? ' · 结束 ' + d.finished : '') +
    ' · ' + d.status + ' · 已答 ' + d.count + ' / 31', '',
    '## 带走的六张卡', ''];
  d.cards.forEach(c => { L.push('**' + c.lab + '**', '', c.v || '（没写）', ''); });
  L.push('---', '');
  d.acts.forEach(a => {
    L.push('## ' + a.title + '（' + a.rows.length + ' 条）', '');
    if (!a.rows.length) { L.push('这一部分当时没有写。', ''); return; }
    a.rows.forEach((r, i) => { L.push('### ' + (r.time || (i + 1)) + '　' + r.q, '', r.a, ''); });
  });
  return L.join('\n');
}

function runPlainText(run) {
  const d = collectRun(run);
  const L = ['一天 · ' + d.date,
    '开始 ' + d.started + (d.finished ? ' · 结束 ' + d.finished : '') +
    ' · ' + d.status + ' · 已答 ' + d.count + ' / 31', '', '【带走的六张卡】', ''];
  d.cards.forEach(c => { L.push(c.lab + '：' + (c.v || '（没写）')); });
  L.push('', '────────────────────', '');
  d.acts.forEach(a => {
    L.push('【' + a.title + '】' + a.rows.length + ' 条', '');
    if (!a.rows.length) { L.push('这一部分当时没有写。', ''); return; }
    a.rows.forEach((r, i) => { L.push((r.time || (i + 1)) + '  ' + r.q, r.a, ''); });
  });
  return '\ufeff' + L.join('\r\n');
}

const ARCHIVE_CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:0 20px 80px;background:#faf9f6;color:#23211e;
  font:15px/1.85 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.run{max-width:720px;margin:0 auto;padding:40px 0}
h1{font:400 30px/1.4 Georgia,"Songti SC",serif;margin:0}
.meta{color:#8a857c;font-size:13px;margin:6px 0 34px}
h2{font-size:13px;letter-spacing:.14em;color:#8a857c;font-weight:500;margin:38px 0 14px;
  border-bottom:1px solid #e5e1d8;padding-bottom:8px}
h2 .n{float:right;letter-spacing:0}
.cards,.sumcards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card,.sumcard{background:#fff;border:1px solid #e5e1d8;border-radius:10px;padding:14px 16px}
.lab{font-size:12px;color:#8a857c;margin-bottom:6px}
.val,.a{font:16px/1.9 Georgia,"Songti SC",serif;white-space:pre-wrap}
.item,.sumitem{padding:16px 0;border-bottom:1px solid #ece8df}
.q,.qline{font-size:13px;color:#6d6860;line-height:1.7}
.tm{display:inline-block;font:12px ui-monospace,monospace;color:#a49e92;margin-right:10px;min-width:44px}
.a{margin-top:8px}
.none{color:#a49e92;font-size:13px}
.toolbar{max-width:720px;margin:0 auto;padding:18px 0 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.toolbar button{background:#23211e;color:#faf9f6;border:0;border-radius:8px;padding:9px 16px;font-size:13px;cursor:pointer}
.toolbar span{color:#a49e92;font-size:12px}
@media(max-width:520px){.cards,.sumcards{grid-template-columns:1fr}}
@media print{
  body{background:#fff;padding:0}
  .toolbar{display:none}
  .run{padding:0}
  .run + .run{page-break-before:always}
  .item,.sumitem,.card,.sumcard{page-break-inside:avoid}
  @page{margin:18mm 16mm}
}`;

function archiveHTML(runs) {
  const all = runs.map(collectRun);
  const title = runs.length > 1 ? '一天 · 全部记录（' + runs.length + ' 次）' : '一天 · ' + all[0].date;
  let body = '';
  all.forEach(d => {
    body += '<section class="run"><h1>' + esc(d.date) + '</h1>' +
      '<p class="meta">开始 ' + d.started + (d.finished ? ' · 结束 ' + d.finished : '') +
      ' · ' + d.status + ' · 已答 ' + d.count + ' / 31</p>' +
      '<h2>带走的六张卡</h2><div class="cards">' +
      d.cards.map(c => '<div class="card"><div class="lab">' + esc(c.lab) + '</div>' +
        '<div class="val' + (c.v ? '' : ' none') + '">' + (c.v ? esc(c.v) : '—') + '</div></div>').join('') +
      '</div>';
    d.acts.forEach(a => {
      body += '<h2>' + esc(a.title) + '<span class="n">' + a.rows.length + ' 条</span></h2>';
      if (!a.rows.length) { body += '<p class="none">这一部分当时没有写。</p>'; return; }
      body += a.rows.map((r, i) => '<div class="item"><div class="q"><span class="tm">' +
        (r.time || (i + 1)) + '</span>' + esc(r.q) + '</div><div class="a">' + esc(r.a) + '</div></div>').join('');
    });
    body += '</section>';
  });
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<style>' + ARCHIVE_CSS + '</style>\n</head>\n<body>\n' +
    '<div class="toolbar"><button onclick="window.print()">打印 / 存为 PDF</button>' +
    '<span>独立文件，不联网、不上传。可用浏览器打印成 PDF。</span></div>\n' +
    body + '\n</body>\n</html>';
}

function activeRun() {
  return db.runs.filter(r => r.status === 'active').sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

function newRun() {
  const run = {
    id: 'r' + Date.now(),
    startedAt: Date.now(),
    finishedAt: null,
    status: 'active',
    answers: {},
    day: { entries: [], copiedAt: null },
    board: { antiVision: '', vision: '', oneYear: '', oneMonth: '', levers: '', constraints: '' },
    review: { d1: null, d7: null, d30: null }
  };
  db.runs.push(run);
  save();
  return run;
}

function getRun(id) {
  return db.runs.find(r => r.id === id) || null;
}

function answerText(run, qid) {
  const a = run.answers[qid];
  return a && a.text ? a.text : '';
}

function hasAnswer(run, qid) {
  return answerText(run, qid).trim().length > 0;
}

function setAnswer(run, qid, text) {
  const prev = run.answers[qid] || {};
  run.answers[qid] = {
    text: text,
    updatedAt: Date.now(),
    edited: prev.text && prev.text !== text ? true : !!prev.edited,
    state: text.trim() ? 'answered' : 'empty'
  };
  saveSoon();
}

function computeProgress(run) {
  if (!run) return 0;
  let p = 0;
  const per = (ids, block) => {
    const w = BLOCK_META[block].weight;
    const n = ids.filter(id => hasAnswer(run, id)).length;
    return w * (n / ids.length);
  };
  p += per(['M1', 'M2', 'M3', 'M4'], 'M');
  p += per(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'], 'A');
  p += per(['V1', 'V2', 'V3'], 'V');

  const entries = (run.day && run.day.entries) || [];
  const dCnt = Math.min(3, entries.filter(e => !e.qid || D_IDS.indexOf(e.qid) > -1).length);
  p += BLOCK_META.D.weight * (dCnt / 3);
  const wByQ = W_IDS.filter(id => entries.some(e => e.qid === id)).length;
  const extra = Math.max(0, entries.filter(e => !e.qid).length - 3);
  const wCnt = Math.min(3, wByQ + extra);
  p += BLOCK_META.W.weight * (wCnt / 3);

  p += per(['S1', 'S2', 'S3', 'S4'], 'S');
  p += per(['L1', 'L2', 'L3'], 'L');

  const b = run.board || {};
  const filled = ['antiVision', 'vision', 'oneYear', 'oneMonth', 'levers', 'constraints']
    .filter(k => (b[k] || '').trim().length > 0).length;
  p += BLOCK_META.G.weight * (filled / 6);

  return Math.max(0, Math.min(100, Math.round(p)));
}

function answeredCount(run) {
  if (!run) return 0;
  const a = Object.keys(run.answers || {}).filter(k => (run.answers[k].text || '').trim()).length;
  const e = ((run.day && run.day.entries) || []).length;
  return Math.min(31, a + e);
}

function spansDays(run) {
  const end = run.finishedAt || Date.now();
  return Math.max(1, Math.ceil((end - run.startedAt) / 86400000));
}

function applyPhase() {
  const h = new Date().getHours();
  const ph = h < 9 ? 'dawn' : h < 17 ? 'day' : h < 20 ? 'dusk' : 'night';
  document.documentElement.dataset.phase = ph;
}

function setTab(on) {
  document.body.classList.toggle('has-tab', !!on);
}

function tabbar(active) {
  if (!document.body.classList.contains('has-tab')) return '';
  return '<nav class="tab">' +
    '<button data-act="go" data-to="/" class="' + (active === 'home' ? 'on' : '') + '">今天</button>' +
    '<button data-act="go" data-to="/history" class="' + (active === 'history' ? 'on' : '') + '">历史</button>' +
    '</nav>';
}

function layout(body, opt) {
  opt = opt || {};
  setTab(!!opt.tab);
  document.getElementById('app').innerHTML = body + tabbar(opt.active);
}

function render() {
  applyPhase();
  closeLayer();
  const parts = (location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const app = document.getElementById('app');
  window.scrollTo(0, 0);

  if (parts.length === 0) return viewHome();
  if (parts[0] === 'start') return viewStart();
  if (parts[0] === 'today') return viewToday();
  if (parts[0] === 'run' && parts[2]) return viewAct(parts[1], parts[2]);
  if (parts[0] === 'history' && parts[1]) return viewDetail(parts[1]);
  if (parts[0] === 'history') return viewHistory();
  if (parts[0] === 'compare') return viewCompare();
  if (parts[0] === 'settings') return viewSettings();
  location.hash = '#/';
}

function go(to) { location.hash = '#' + to; }

function viewHome() {
  const run = activeRun();
  const p = run ? computeProgress(run) : 0;
  const acts = run ? actDots(run) : '';

  let body = '<div class="home">' +
    '<div class="kicker">一天</div>' +
    '<h1>重新开始，<br>只需要一天。</h1>' +
    '<p class="sub">早上挖出你真正在追求什么。白天从自动挡里出来几次。晚上把它收成一张能带走的卡片。</p>';

  if (run) {
    body += '<div class="card">' +
      '<div class="row between"><span class="mono">' + runName(run) + ' · 进行中</span>' +
      '<span class="mono">已答 ' + answeredCount(run) + ' / 31</span></div>' +
      '<div class="bar" style="margin:14px 0 0"><i style="width:' + p + '%"></i></div>' +
      acts +
      '<div class="row" style="margin-top:18px;gap:10px">' +
      '<button class="btn primary block" data-act="resume">继续</button>' +
      '</div>' +
      '<p class="tip">已跨 ' + spansDays(run) + ' 天。慢慢来也行，最多留七天。</p>' +
      '</div>';
  } else {
    body += '<div style="margin-top:26px"><button class="btn primary block" data-act="begin">开始这一天</button></div>' +
      '<p class="tip">大约 40 分钟写完早晨，剩下的散在一天里。</p>';
  }

  const last = db.settings.lastExportAt;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  body += '<div class="row between" style="margin-top:36px">' +
    '<button class="mono" style="color:var(--fg3)" data-act="go" data-to="/history">历史</button>' +
    '<button class="mono" style="color:var(--fg3)" data-act="go" data-to="/settings">设置</button>' +
    '</div>';
  if (days !== null && days >= 14) {
    body += '<p class="tip" style="color:var(--accent)">上次备份是 ' + days + ' 天前。清理浏览器数据会清空这里的一切。</p>';
  }
  body += '</div>';

  layout(body, { tab: true, active: 'home' });
  maybeAskOnEntry();
}

function actDots(run) {
  const rows = [
    { k: '晨', ids: MORNING, act: 'morning' },
    { k: '昼', ids: DAY_IDS, act: 'day' },
    { k: '夜', ids: EVENING, act: 'evening' }
  ];
  let h = '<div class="list" style="margin-top:16px">';
  rows.forEach(r => {
    let n = 0, t = r.ids.length;
    if (r.act === 'day') {
      n = ((run.day && run.day.entries) || []).length; t = 3;
    } else {
      n = r.ids.filter(id => hasAnswer(run, id)).length;
    }
    h += '<button class="li" data-act="go" data-to="/run/' + run.id + '/' + r.act + '">' +
      '<span class="dot ' + (n >= t ? 'on' : '') + '"></span>' +
      '<span class="txt">' + ({ morning: '早晨 · 心理深挖', day: '白天 · 几次停顿', evening: '晚上 · 整合' })[r.act] + '</span>' +
      '<span class="meta">' + Math.min(n, t) + '/' + t + '</span></button>';
  });
  return h + '</div>';
}

function viewStart() {
  let run = activeRun();
  if (!run) run = newRun();
  const body = '<div class="qwrap" style="justify-content:center">' +
    '<div class="qmeta"><span>开始之前</span><span></span></div>' +
    '<h1 class="q" style="font-size:22px;margin-top:30px">四句话。</h1>' +
    '<div class="hint" style="margin-top:26px;font-size:15px;line-height:2.3">' +
    '一、不要在 AI 那里找答案，包括这个网页。<br>' +
    '二、写具体的名词、时间和身体感觉，不写形容词。<br>' +
    '三、如果过程中感到不适，那是对的。<br>' +
    '四、这个网页不会提醒你。它只在你打开的时候接住你。' +
    '</div>' +
    '<div class="qfoot" style="margin-top:auto">' +
    '<button class="btn primary block" data-act="go" data-to="/run/' + run.id + '/morning">开始</button>' +
    '</div></div>';
  layout(body, {});
}

function viewToday() {
  const run = activeRun();
  if (!run) { go('/start'); return; }
  go('/run/' + run.id + '/day');
}

function seq(act) {
  if (act === 'morning') return MORNING;
  if (act === 'evening') return EVENING;
  return [];
}

function nextStage(run) {
  const left = ids => ids.filter(id => !hasAnswer(run, id)).length;
  if (left(MORNING) > 0) return 'morning';
  if (left(EVENING) === 0) return 'board';
  if (EVENING.some(id => hasAnswer(run, id))) return 'evening';
  return 'day';
}

function viewAct(id, act) {
  const run = getRun(id);
  if (!run) { go('/'); return; }
  if (act === 'day') return viewDay(run);
  if (act === 'board') return viewBoard(run);
  const list = seq(act);
  if (!list.length) { go('/'); return; }

  if (mem.runId !== id || mem.act !== act) {
    mem.runId = id; mem.act = act;
    let idx = list.findIndex(q => !hasAnswer(run, q));
    mem.i = idx === -1 ? list.length - 1 : idx;
  }
  const i = Math.max(0, Math.min(mem.i, list.length - 1));
  const qid = list[i];
  const item = Q[qid];
  const total = computeProgress(run);

  let q = item.q;
  if (q.indexOf('{{V2}}') > -1) {
    const v = answerText(run, 'V2').trim();
    q = v ? q.replace('{{V2}}', v) : q.replace('「{{V2}}」', '那个身份');
  }

  let refHTML = '';
  if (item.ref && hasAnswer(run, item.ref)) {
    refHTML = '<div class="ref">' + esc(answerText(run, item.ref)) + '</div>';
  }

  const actName = act === 'morning' ? '第一幕 · 早晨' : '第三幕 · 晚上';
  const blockName = BLOCK_META[item.block].name;

  const body = '<div class="bar"><i style="width:' + total + '%"></i></div>' +
    '<div class="qwrap">' +
    '<div class="qmeta"><span>' + actName + ' · ' + blockName + '</span><span>' + (i + 1) + ' / ' + list.length + '</span></div>' +
    '<h1 class="q">' + esc(q) + '</h1>' +
    (item.hint ? '<p class="hint">' + esc(item.hint) + '</p>' : '') +
    refHTML +
    '<textarea data-qid="' + qid + '" placeholder="写下来。一句也算。" enterkeyhint="next">' + esc(answerText(run, qid)) + '</textarea>' +
    '<div class="qfoot">' +
    (i > 0 ? '<button class="btn ghost" style="min-width:96px" data-act="prev">上一题</button>' : '') +
    '<button class="btn primary block" data-act="next">' + (i === list.length - 1 ? '完这一幕' : '下一题') + '</button>' +
    '</div></div>';

  layout(body, {});
  const ta = document.querySelector('textarea[data-qid]');
  if (ta && window.innerWidth > 700) ta.focus({ preventScroll: true });
}

function doFinish(run) {
  run.status = 'done';
  run.finishedAt = Date.now();
  save();
  go('/history/' + run.id);
}

function finishRun() {
  const run = activeRun();
  if (!run) return;
  doFinish(run);
}

function viewDay(run) {
  const entries = ((run.day && run.day.entries) || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const p = computeProgress(run);

  let list = '';
  DAY_IDS.forEach(qid => {
    const item = Q[qid];
    const hit = entries.some(e => e.qid === qid);
    let q = item.q;
    if (q.indexOf('{{V2}}') > -1) {
      const v = answerText(run, 'V2').trim();
      q = v ? q.replace('{{V2}}', v) : q.replace('「{{V2}}」', '那个身份');
    }
    list += '<button class="li" data-act="pick" data-qid="' + qid + '">' +
      (hit ? '<span class="dot on"></span>' : '<span class="dot"></span>') +
      '<span class="txt" style="font-size:14px;line-height:1.7">' + (item.time ? '<span class="mono" style="color:var(--fg3);margin-right:8px">' + item.time + '</span>' : '') + esc(q) + '</span>' +
      '</button>';
  });

  let frags = '';
  if (entries.length) {
    frags = entries.map(e => {
      const d = new Date(e.createdAt);
      const t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return '<div class="frag"><time>' + t + '</time><div>' + esc(e.text).replace(/\n/g, '<br>') + '</div></div>';
    }).join('');
  } else {
    frags = '<p class="empty-state">还没有。想到什么就写一句，不用挑问题。</p>';
  }

  const curQ = mem.dayQid ? Q[mem.dayQid] : null;
  let cq = '';
  if (curQ) {
    let q = curQ.q;
    if (q.indexOf('{{V2}}') > -1) {
      const v = answerText(run, 'V2').trim();
      q = v ? q.replace('{{V2}}', v) : q.replace('「{{V2}}」', '那个身份');
    }
    cq = esc(q);
  }

  const body = '<div class="daypad">' +
    '<div class="top"><span class="t">第二幕 · 白天</span><span class="r">留下 ' + entries.length + ' 条</span></div>' +
    '<div class="bar" style="margin:0 calc(var(--pad) * -1)"><i style="width:' + p + '%"></i></div>' +
    '<h1 class="q" style="font-size:19px;margin:18px 0 6px">今天停了几次。</h1>' +
    '<p class="hint" style="margin-top:0;font-size:12.5px">没有准时这回事。想到了就写一句。</p>' +
    frags +
    '<div class="list" style="margin-top:22px">' + list + '</div>' +
    '<div class="row" style="margin-top:20px">' +
    '<button class="btn ghost block" data-act="go" data-to="/run/' + run.id + '/evening">天黑了，去第三幕</button></div>' +
    '<p class="tip">白天没有尽头。想到就回来写一句，累了就等晚上。</p>' +
    '</div>' +
    '<div class="composer"><div class="inner">' +
    '<div class="box">' +
    '<div class="send"><span class="qhint">' + (cq || '自由记录') + '</span>' +
    (curQ ? '<button class="mono" style="color:var(--fg3)" data-act="clearq">换一个</button>' : '') + '</div>' +
    '<textarea id="dayInput" placeholder="一句话就够。" enterkeyhint="send"></textarea>' +
    '</div>' +
    '<div class="row" style="margin-top:10px">' +
    '<button class="btn sm ghost" data-act="copy">复制六问到系统提醒</button>' +
    '<span class="spacer"></span>' +
    '<button class="btn sm primary" data-act="send">记下</button>' +
    '</div></div></div>';

  layout(body, {});
}

function viewBoard(run) {
  const b = run.board;
  const prefill = [
    ['antiVision', 'S3'], ['vision', 'S4'], ['oneYear', 'L1'],
    ['oneMonth', 'L2'], ['levers', 'L3'], ['constraints', 'G1']
  ];
  let changed = false;
  prefill.forEach(([k, qid]) => {
    if (!(b[k] || '').trim() && hasAnswer(run, qid)) { b[k] = answerText(run, qid); changed = true; }
  });
  if (changed) save();

  let slots = '';
  CARD_FIELDS.forEach(([k, lab]) => {
    slots += '<div class="slot"><div class="lab">' + lab + '</div>' +
      '<textarea data-board="' + k + '" placeholder="还没写">' + esc(b[k]) + '</textarea></div>';
  });

  const leftN = EVENING.filter(id => !hasAnswer(run, id)).length;
  const p = computeProgress(run);
  const data = collectRun(run);
  const body = '<div class="top"><span class="t">结算</span><span class="r">' + (leftN ? '晚上还差 ' + leftN + ' 题' : '可以收了') + '</span></div>' +
    '<div class="bar" style="margin:0 calc(var(--pad) * -1)"><i style="width:' + p + '%"></i></div>' +
    '<h1 class="q" style="font-size:22px;margin:20px 0 4px">这一天，你写下的。</h1>' +
    '<p class="hint" style="margin-top:8px;font-size:13px">下面是今天全部的问题和回答。顶上六张卡，是能带走的那一张。</p>' +
    (leftN ? '<div class="row" style="margin-top:16px"><button class="btn ghost block" data-act="go" data-to="/run/' + run.id + '/evening">先去补完晚上（' + leftN + ' 题）</button></div>' : '') +
    '<h2 class="sech">带走的六张卡<span>可改</span></h2>' +
    '<div class="board">' + slots + '</div>' +
    '<div class="row" style="margin-top:16px;gap:10px">' +
    '<button class="btn primary block" data-act="saveimg">保存图片</button></div>' +
    '<p class="tip">长按图片存进相册，也可以设成锁屏。</p>' +
    '<h2 class="sech" style="margin-top:36px">今天写下的全部<span>共 ' + data.count + ' 条</span></h2>' +
    summaryHTML(data, false) +
    '<h2 class="sech" style="margin-top:36px">带走一份<span>手机上也能打开</span></h2>' +
    '<div class="row" style="gap:10px;flex-wrap:wrap">' +
    '<button class="btn sm primary" data-act="exportmd" data-id="' + run.id + '">Markdown</button>' +
    '<button class="btn sm ghost" data-act="exporttxt" data-id="' + run.id + '">纯文本 TXT</button>' +
    '<button class="btn sm ghost" data-act="exporthtml" data-id="' + run.id + '">阅读页 HTML</button>' +
    '<button class="btn sm ghost" data-act="copytext" data-id="' + run.id + '">复制全文</button></div>' +
    '<p class="tip">推荐 Markdown：纯文本，手机和电脑都能读、能编辑。TXT 适合微信里直接预览，HTML 排版最好、还能打印成 PDF。</p>' +
    '<div class="row" style="margin-top:22px;gap:10px">' +
    '<button class="btn ghost block" data-act="finish">结束这一天</button></div>' +
    '<p class="tip">结束之后它进历史，不再改动。</p>';

  layout(body, {});
}

function viewHistory() {
  const runs = db.runs.slice().sort((a, b) => b.startedAt - a.startedAt);
  let body = '<div class="top"><span class="t">历史</span><span class="r">' + runs.length + ' 次</span></div>';
  if (!runs.length) {
    body += '<p class="empty-state">还没有记录。<br>第一次总是空的。</p>';
  } else {
    body += '<div class="list">';
    runs.forEach(r => {
      body += '<button class="li" data-act="go" data-to="/history/' + r.id + '" style="align-items:flex-start">' +
        '<span class="txt"><span style="font-size:15px">' + dateLabel(r.startedAt) + '</span>' +
        '<span style="display:block;font-size:12px;color:var(--fg3);margin-top:4px">' +
        (r.status === 'done' ? '已完成' : '进行中') + ' · 已答 ' + answeredCount(r) + ' / 31</span></span>' +
        '<span class="meta">' + timeLabel(r.startedAt) + '　›</span></button>';
    });
    body += '</div>';
    body += '<div style="margin-top:26px"><button class="btn ghost block" data-act="go" data-to="/compare">把这些放一起看</button></div>';
    body += '<div style="margin-top:10px"><button class="btn ghost block" data-act="exportall">导出全部 · Markdown</button></div>';
  }
  layout(body, { tab: true, active: 'history' });
}

function viewDetail(id) {
  const run = getRun(id);
  if (!run) { go('/history'); return; }
  const data = collectRun(run);
  let body = '<div class="top"><span class="t">' + data.date + '</span>' +
    '<span class="r">' + data.started + ' 开始 · ' + data.status + '</span></div>' +
    '<p class="tip" style="margin-top:12px">这一天写下的全部，共 ' + data.count + ' 条。</p>' +
    summaryHTML(data, true) +
    '<h2 class="sech" style="margin-top:34px">带走一份</h2>' +
    '<div class="row" style="gap:10px;flex-wrap:wrap">' +
    '<button class="btn sm primary" data-act="exportmd" data-id="' + run.id + '">Markdown</button>' +
    '<button class="btn sm ghost" data-act="exporttxt" data-id="' + run.id + '">纯文本 TXT</button>' +
    '<button class="btn sm ghost" data-act="exporthtml" data-id="' + run.id + '">阅读页 HTML</button>' +
    '<button class="btn sm ghost" data-act="copytext" data-id="' + run.id + '">复制全文</button></div>' +
    '<div class="row" style="margin-top:24px">' +
    '<button class="btn ghost block" data-act="go" data-to="/history">返回</button></div>';
  layout(body, {});
}

function viewCompare() {
  const runs = db.runs.filter(r => hasAnswer(r, 'S2') || hasAnswer(r, 'S3'))
    .sort((a, b) => a.startedAt - b.startedAt);

  let body = '<div class="top"><span class="t">放在一起看</span><span></span></div>';

  if (runs.length < 1) {
    body += '<p class="empty-state">还没有可比的。<br>等你有过一次完整的晚上再说。</p>';
  } else {
    const enemies = {};
    runs.forEach(r => {
      const e = answerText(r, 'S2').trim();
      if (e) enemies[e] = (enemies[e] || 0) + 1;
    });
    const repeat = Object.keys(enemies).filter(k => enemies[k] >= 2);

    if (repeat.length) {
      body += '<div class="card flat" style="border-color:var(--accent)">' +
        '<p class="serif" style="font-size:16px;line-height:2">同一个敌人出现了不止一次。</p>' +
        repeat.map(k => '<p style="margin-top:10px;font-size:14px;color:var(--fg2)">「' + esc(k) + '」 · ' + enemies[k] + ' 次</p>').join('') +
        '</div>';
    }

    runs.forEach(r => {
      const d = new Date(r.startedAt);
      body += '<div style="margin-top:26px">' +
        '<div class="mono" style="color:var(--fg3)">' + d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') + '</div>' +
        '<div class="cmp">' +
        '<div><div class="h">敌人</div><div class="b">' + esc(answerText(r, 'S2') || '—') + '</div></div>' +
        '<div><div class="h">拒绝成为</div><div class="b">' + esc(answerText(r, 'S3') || '—') + '</div></div>' +
        '</div></div>';
    });
  }
  layout(body, {});
}

function viewSettings() {
  const ask = db.settings.askOnEntry;
  const body = '<div class="top"><span class="t">设置</span><span></span></div>' +
    '<div style="margin-top:16px">' +
    '<div class="field"><div><div class="k">打开时先问一句</div>' +
    '<div class="d">每天第一次打开，先给一个问题。一天最多一次。</div></div>' +
    '<button class="sw ' + (ask ? 'on' : '') + '" data-act="toggleAsk"><i></i></button></div>' +

    '<div class="field" style="display:block">' +
    '<div class="k">让系统来提醒你</div>' +
    '<div class="d" style="max-width:none">这个网页不会推送。但手机的「快捷指令」可以每天定时打开它——提醒由系统发，网页只负责被打开。</div>' +
    '<div class="example">iPhone：快捷指令 → 自动化 → 新建个人自动化 → 特定时间 → 每天 11:00 → 打开 URL' +
    '\n安卓：MacroDroid 或 Tasker，同样动作' +
    '\n\n把下面这个地址填进去，关闭「运行前询问」。</div>' +
    '<button class="btn sm ghost" style="margin-top:12px" data-act="copylink">复制地址</button>' +
    '</div>' +

    '<div class="field" style="display:block">' +
    '<div class="k">备份</div>' +
    '<div class="d" style="max-width:none">数据只存在这台设备的浏览器里。清理浏览器数据、用无痕模式，都会让它消失。</div>' +
    '<div class="row" style="margin-top:14px;gap:10px">' +
    '<button class="btn sm ghost" data-act="export">导出备份</button>' +
    '<button class="btn sm ghost" data-act="import">导入备份</button>' +
    '</div>' +
    '<input type="file" id="fileInput" accept="application/json" style="display:none">' +
    '</div>' +

    '<p class="tip" style="margin-top:26px">这一页没有任何统计、没有第三方脚本。数据不会离开这台设备。</p>' +
    '</div>';
  layout(body, {});
}

function openLayer(html) {
  const l = document.getElementById('layer');
  l.innerHTML = '<div class="sheet">' + html + '</div>';
  l.classList.add('on');
}

function closeLayer() {
  const l = document.getElementById('layer');
  l.classList.remove('on');
  l.innerHTML = '';
}

function maybeAskOnEntry() {
  if (!db.settings.askOnEntry) return;
  if (db.settings.lastAsk === todayStr()) return;
  const run = activeRun();
  if (!run) return;
  const pool = DAY_IDS.filter(id => Q[id].block === 'D');
  const qid = pool[Math.floor(Math.random() * pool.length)];
  const item = Q[qid];
  const html = '<div class="tag">先别进去</div>' +
    '<h2>' + esc(item.q) + '</h2>' +
    '<textarea id="askText" placeholder="一句话。不想写也可以。" style="min-height:120px;font-size:16px"></textarea>' +
    '<div class="spacer"></div>' +
    '<div class="row" style="gap:10px;margin-top:20px">' +
    '<button class="btn ghost block" data-act="askclose">今天先不答</button>' +
    '<button class="btn primary block" data-act="asksave" data-qid="' + qid + '">记下</button>' +
    '</div>';
  openLayer(html);
}

function addEntry(qid, text) {
  const run = activeRun();
  if (!run || !text.trim()) return;
  run.day = run.day || { entries: [] };
  run.day.entries = run.day.entries || [];
  run.day.entries.push({ qid: qid || null, text: text.trim(), createdAt: Date.now() });
  save();
}

function downloadText(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
}

function runFromEl(el) {
  const parts = location.hash.split('/');
  return getRun(el.dataset.id) || getRun(parts[2]) || getRun(parts[1]) || activeRun();
}

function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(para => {
    let line = '';
    for (const ch of para) {
      const t = line + ch;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = ch; }
      else line = t;
    }
    out.push(line);
  });
  return out;
}

function drawCard(run) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0e1014';
  g.fillRect(0, 0, W, H);

  const P = 96, maxW = W - P * 2;
  const b = run.board;
  const blocks = [
    ['赌注', b.antiVision],
    ['获胜', b.vision],
    ['主线 · 一年', b.oneYear],
    ['首领 · 一月', b.oneMonth],
    ['任务 · 明天', b.levers],
    ['规则', b.constraints]
  ].filter(x => (x[1] || '').trim());

  const d = new Date(run.startedAt);
  const dateStr = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');

  let chosen = null;
  [52, 44, 38, 32, 27].some(size => {
    const lh = size * 1.66;
    let y = 300;
    const plan = [];
    blocks.forEach(([label, text]) => {
      const body = String(text).replace(/\n/g, '／');
      plan.push({ label: label, y: y });
      y += 54;
      g.font = '400 ' + size + 'px "Songti SC","Noto Serif CJK SC",serif';
      const lines = wrapLines(g, body, maxW);
      plan.push({ lines: lines, y: y, lh: lh });
      y += lines.length * lh + 78;
    });
    if (y < H - 190) { chosen = { size: size, plan: plan, end: y }; return true; }
    return false;
  });
  if (!chosen) chosen = { size: 27, plan: [], end: 300 };

  g.fillStyle = '#8e8b84';
  g.font = '400 26px "SF Mono",ui-monospace,monospace';
  g.fillText('一天 · ' + dateStr, P, 150);

  g.fillStyle = '#5f5d58';
  g.textAlign = 'right';
  g.fillText(runName(run), W - P, 150);
  g.textAlign = 'left';

  g.strokeStyle = 'rgba(232,229,222,.14)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(P, 200); g.lineTo(W - P, 200); g.stroke();

  chosen.plan.forEach(p => {
    if (p.label) {
      g.fillStyle = '#6f6c66';
      g.font = '400 24px "SF Mono",ui-monospace,monospace';
      g.fillText(p.label, P, p.y);
    }
    if (p.lines) {
      g.fillStyle = '#e8e5de';
      g.font = '400 ' + chosen.size + 'px "Songti SC","Noto Serif CJK SC",serif';
      p.lines.forEach((ln, i) => g.fillText(ln, P, p.y + i * p.lh));
    }
  });

  g.fillStyle = '#3f3e3a';
  g.font = '400 22px "SF Mono",ui-monospace,monospace';
  g.fillText('如果我没有变得不同，这些就是代价。', P, H - 96);
  return c;
}

function showImage(canvas) {
  const url = canvas.toDataURL('image/png');
  const html = '<div class="tag">你的面板</div>' +
    '<h2 style="font-size:18px">已经画好了。</h2>' +
    '<img class="photo" src="' + url + '" alt="人生游戏面板">' +
    '<p class="tip">手机上长按这张图，存进相册。设成锁屏，每次解锁都会看见。</p>' +
    '<div class="spacer"></div>' +
    '<div class="row" style="gap:10px;margin-top:14px">' +
    '<button class="btn ghost block" data-act="dl" data-url="' + url + '">下载</button>' +
    '<button class="btn primary block" data-act="closelayer">好</button></div>';
  openLayer(html);
}

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('textarea[data-qid]')) {
    const run = getRun(mem.runId);
    if (run) setAnswer(run, t.dataset.qid, t.value);
  }
  if (t.matches('textarea[data-board]')) {
    const run = getRun(location.hash.split('/')[2]);
    if (run) { run.board[t.dataset.board] = t.value; saveSoon(); }
  }
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'go') {
    if (el.dataset.to === '/history' && mem.act) { save(); }
    go(el.dataset.to);
    return;
  }

  if (act === 'begin') { go('/start'); return; }

  if (act === 'resume') {
    const run = activeRun();
    if (!run) { go('/start'); return; }
    go('/run/' + run.id + '/' + nextStage(run));
    return;
  }

  if (act === 'next') {
    const run = getRun(mem.runId);
    if (!run) return;
    const list = seq(mem.act);
    const qid = list[mem.i];
    const ta = document.querySelector('textarea[data-qid]');
    if (ta) setAnswer(run, qid, ta.value);
    save();
    if (mem.i < list.length - 1) {
      mem.i++;
      viewAct(run.id, mem.act);
    } else {
      if (mem.act === 'morning') go('/run/' + run.id + '/day');
      else go('/run/' + run.id + '/board');
    }
    return;
  }

  if (act === 'prev') {
    const run = getRun(mem.runId);
    const ta = document.querySelector('textarea[data-qid]');
    if (run && ta) setAnswer(run, seq(mem.act)[mem.i], ta.value);
    if (mem.i > 0) { mem.i--; viewAct(run.id, mem.act); }
    return;
  }

  if (act === 'closelayer') { closeLayer(); return; }

  if (act === 'pick') {
    mem.dayQid = el.dataset.qid;
    viewDay(activeRun());
    const ta = document.getElementById('dayInput');
    if (ta) { ta.focus(); }
    return;
  }

  if (act === 'clearq') {
    mem.dayQid = null;
    viewDay(activeRun());
    return;
  }

  if (act === 'send') {
    const ta = document.getElementById('dayInput');
    if (!ta || !ta.value.trim()) return;
    addEntry(mem.dayQid, ta.value);
    const run = activeRun();
    ta.value = '';
    mem.dayQid = null;
    save();
    viewDay(run);
    return;
  }

  if (act === 'copy') {
    const run = activeRun();
    const text = D_IDS.map(id => Q[id].time + ' ' + Q[id].q).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (run) { run.day.copiedAt = Date.now(); save(); }
        openLayer('<div class="tag">已复制</div><h2 style="font-size:17px">粘到手机的系统提醒里，自己设时间。</h2>' +
          '<div class="example">' + esc(text) + '</div>' +
          '<p class="tip">不问你有没有准时，只问你有没有想过。</p>' +
          '<div class="spacer"></div><button class="btn primary block" style="margin-top:20px" data-act="closelayer">好</button>');
      }).catch(() => alert('复制失败，可以长按选中下面这段文字。'));
    } else {
      alert(text);
    }
    return;
  }

  if (act === 'saveimg') {
    const run = getRun(location.hash.split('/')[2]) || activeRun();
    if (!run) return;
    if (!['antiVision', 'vision', 'oneYear', 'oneMonth', 'levers', 'constraints'].some(k => (run.board[k] || '').trim())) {
      alert('面板还是空的。先在上面写几句。');
      return;
    }
    showImage(drawCard(run));
    return;
  }

  if (act === 'dl') {
    const a = document.createElement('a');
    a.href = el.dataset.url;
    a.download = '一天.png';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }

  if (act === 'copytext') {
    const run = runFromEl(el);
    if (!run) return;
    const t = runMarkdown(run);
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => alert('已复制全文（Markdown）。'), () => alert(t));
    else alert(t);
    return;
  }

  if (act === 'exportmd' || act === 'exporttxt' || act === 'exporthtml') {
    const run = runFromEl(el);
    if (!run) return;
    const name = '一天-' + dateLabel(run.startedAt);
    if (act === 'exportmd') downloadText(name + '.md', runMarkdown(run), 'text/markdown;charset=utf-8');
    else if (act === 'exporttxt') downloadText(name + '.txt', runPlainText(run), 'text/plain;charset=utf-8');
    else downloadText(name + '.html', archiveHTML([run]), 'text/html;charset=utf-8');
    return;
  }

  if (act === 'exportall') {
    const runs = db.runs.slice().sort((a, b) => a.startedAt - b.startedAt);
    if (!runs.length) return;
    const md = runs.map(runMarkdown).join('\n\n---\n\n');
    downloadText('一天-全部记录.md', md, 'text/markdown;charset=utf-8');
    return;
  }

  if (act === 'finish') {
    finishRun();
    return;
  }

  if (act === 'toggleAsk') {
    db.settings.askOnEntry = !db.settings.askOnEntry;
    save();
    viewSettings();
    return;
  }

  if (act === 'copylink') {
    const url = location.origin + location.pathname + '#/today';
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => alert('已复制：\n' + url), () => alert(url));
    else alert(url);
    return;
  }

  if (act === 'export') {
    db.settings.lastExportAt = Date.now();
    save();
    downloadText('changeLife-backup-' + todayStr() + '.json', JSON.stringify(db, null, 2), 'application/json');
    return;
  }

  if (act === 'import') {
    const f = document.getElementById('fileInput');
    if (f) f.click();
    return;
  }

  if (act === 'asksave') {
    const ta = document.getElementById('askText');
    const qid = el.dataset.qid;
    if (ta && ta.value.trim()) addEntry(qid, ta.value);
    db.settings.lastAsk = todayStr();
    save();
    closeLayer();
    viewHome();
    return;
  }

  if (act === 'askclose') {
    db.settings.lastAsk = todayStr();
    save();
    closeLayer();
    return;
  }
});

document.addEventListener('change', e => {
  if (e.target.id !== 'fileInput') return;
  const file = e.target.files[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!d.runs) throw new Error('格式不对');
      db = d;
      db.settings = Object.assign({ askOnEntry: true, lastAsk: '', lastExportAt: null }, db.settings || {});
      save();
      alert('已导入 ' + db.runs.length + ' 次记录。');
      go('/');
    } catch (err) {
      alert('读不进来，可能不是这个网页导出的文件。');
    }
  };
  fr.readAsText(file);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLayer();
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    const btn = document.querySelector('[data-act="next"]');
    if (btn) btn.click();
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', save);

applyPhase();
if (!location.hash) location.hash = '#/';
render();
