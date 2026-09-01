'use strict';

/* ================= 工具函数 ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ================= 日期工具 ================= */
function todayStr() { return toDateStr(new Date()); }

function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseDate(s) {
  if (!s) return null;
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function diffDays(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }

function fmtDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  const t = diffDays(s, todayStr());
  if (t === 0) return '今天交';
  if (t === 1) return '明天交';
  if (t === 2) return '后天交';
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + w[d.getDay()];
}

function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // 周一为一周开始
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

/* ================= 数据 ================= */
const STORAGE_KEY = 'hw_app_data_v1';

const DEFAULT_SUBJECTS = ['语文', '数学', '英语', '科学', '道法', '美术', '音乐', '体育'];

const SUBJECT_META = {
  语文: { emoji: '📖', color: '#4CAF93' },
  数学: { emoji: '➕', color: '#5B8DEF' },
  英语: { emoji: '🔤', color: '#9C6ADE' },
  科学: { emoji: '🔬', color: '#26A69A' },
  道法: { emoji: '⭐', color: '#F4A636' },
  道德与法治: { emoji: '⭐', color: '#F4A636' },
  美术: { emoji: '🎨', color: '#EF6E6E' },
  音乐: { emoji: '🎵', color: '#EC6FB0' },
  体育: { emoji: '⚽', color: '#66BB6A' },
  信息: { emoji: '💻', color: '#5C6BC0' },
  劳动: { emoji: '🧹', color: '#8D6E63' },
  阅读: { emoji: '📚', color: '#C78B3F' },
  综合: { emoji: '🧩', color: '#78909C' }
};

function defaultData() {
  return {
    subjects: DEFAULT_SUBJECTS.slice(),
    homework: [],
    checkins: {},
    kidName: '宝贝',
    timer: { work: 25, rest: 5 }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw);
    return Object.assign(defaultData(), d);
  } catch (e) {
    return defaultData();
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 存储满等异常忽略 */ }
}

let data = load();

/* ================= 全局状态 ================= */
const state = {
  tab: 'home',
  filter: 'pending',   // pending | today | overdue | done
  editingId: null
};

/* ================= 轻提示 ================= */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    o.start(); o.stop(ctx.currentTime + 1);
  } catch (e) { /* 不支持音频时忽略 */ }
}

function vibrate() {
  if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (e) {} }
}

function confetti() {
  const colors = ['#FF8A65', '#FFD54F', '#4CAF93', '#5B8DEF', '#EC6FB0', '#9C6ADE'];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = (Math.random() * 100) + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDelay = (Math.random() * 0.6) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
}

/* ================= 作业操作 ================= */
function subjectMeta(name) {
  const m = SUBJECT_META[name];
  return m || { emoji: '📘', color: '#B78B68' };
}

function getHw(id) { return data.homework.find(h => h.id === id); }

function addHw({ subject, title, note, due }) {
  data.homework.push({
    id: uid(),
    subject, title: title.trim(), note: (note || '').trim(),
    due: due || '',
    createdAt: new Date().toISOString(),
    completed: false,
    completedAt: null
  });
  save();
}

function updateHw(id, patch) {
  const h = getHw(id);
  if (!h) return;
  Object.assign(h, patch);
  save();
}

function deleteHw(id) {
  data.homework = data.homework.filter(h => h.id !== id);
  save();
}

function toggleHw(id) {
  const h = getHw(id);
  if (!h) return;
  h.completed = !h.completed;
  h.completedAt = h.completed ? new Date().toISOString() : null;
  save();
  const chip = document.querySelector('.check[data-id="' + id + '"]');
  if (chip) { chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }
  if (h.completed) {
    confetti();
    toast('完成啦，真棒 🎉');
  }
  renderHome();
}

function clearCompleted() {
  const n = data.homework.filter(h => h.completed).length;
  data.homework = data.homework.filter(h => !h.completed);
  save();
  toast('已清理 ' + n + ' 条完成的作业');
  renderHome();
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  data = defaultData();
  save();
  render();
  toast('已恢复初始状态');
}

/* ================= 打卡 / 统计 ================= */
function streakDays() {
  let n = 0;
  const d = new Date();
  if (!data.checkins[todayStr()]) d.setDate(d.getDate() - 1);
  while (data.checkins[toDateStr(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function toggleCheckin() {
  const t = todayStr();
  if (data.checkins[t]) {
    if (confirm('要取消今天的打卡吗？')) {
      delete data.checkins[t];
      save();
      toast('已取消今天的打卡');
      renderStats();
    }
    return;
  }
  data.checkins[t] = true;
  save();
  confetti();
  toast('打卡成功，连续 ' + streakDays() + ' 天 🔥');
  renderStats();
}

function dueOn(dateStr) {
  return data.homework.filter(h => h.due === dateStr);
}

function weekStat() {
  const s = startOfWeek(new Date());
  const sStr = toDateStr(s);
  const eStr = toDateStr(new Date(s.getTime() + 6 * 86400000));
  const items = data.homework.filter(h => h.due && h.due >= sStr && h.due <= eStr);
  return { total: items.length, done: items.filter(h => h.completed).length };
}

function last7Days() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = toDateStr(d);
    const items = dueOn(s);
    out.push({
      label: i === 0 ? '今天' : (i === 1 ? '昨天' : (d.getMonth() + 1) + '/' + d.getDate()),
      total: items.length,
      done: items.filter(h => h.completed).length
    });
  }
  return out;
}

/* ================= 番茄钟 ================= */
const timer = { mode: 'work', dur: data.timer.work * 60, left: data.timer.work * 60, running: false, iv: null, endAt: 0 };

function timerSec() { return (timer.mode === 'work' ? data.timer.work : data.timer.rest) * 60; }

function setMode(m) {
  timer.mode = m;
  timer.dur = timerSec();
  timer.left = timer.dur;
  stopTick();
  renderTimer();
}

function setDuration(sec) {
  data.timer[timer.mode] = sec / 60;
  timer.dur = sec;
  timer.left = sec;
  stopTick();
  save();
  renderTimer();
}

function stopTick() {
  timer.running = false;
  if (timer.iv) { clearInterval(timer.iv); timer.iv = null; }
  document.title = '作业小管家';
}

function toggleTimer() {
  if (timer.running) {
    stopTick();
  } else {
    timer.endAt = Date.now() + timer.left * 1000;
    timer.running = true;
    timer.iv = setInterval(tick, 250);
  }
  renderTimer();
}

function resetTimer() {
  stopTick();
  timer.left = timer.dur;
  renderTimer();
}

function skipPhase() {
  finishPhase(true);
}

function tick() {
  timer.left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
  if (timer.left <= 0) { finishPhase(false); return; }
  renderTimerRing();
  const mm = String(Math.floor(timer.left / 60)).padStart(2, '0');
  const ss = String(timer.left % 60).padStart(2, '0');
  document.title = mm + ':' + ss + ' 专注中';
}

function finishPhase(skipped) {
  stopTick();
  if (!skipped) { beep(); vibrate(); }
  if (timer.mode === 'work') {
    timer.mode = 'rest';
    toast(skipped ? '已进入休息时间 ☕' : '专注时间到，休息一下吧 🌈');
  } else {
    timer.mode = 'work';
    toast(skipped ? '已进入专注时间 💪' : '休息结束，继续加油 💪');
  }
  timer.dur = timerSec();
  timer.left = timer.dur;
  renderTimer();
}

/* ================= 导出 / 导入 ================= */
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '作业小管家备份-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('备份已下载 📦');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!Array.isArray(d.homework) || !Array.isArray(d.subjects)) throw new Error('bad');
      data = Object.assign(defaultData(), d);
      save();
      render();
      toast('备份导入成功 ✅');
    } catch (e) {
      toast('导入失败，文件格式不对 😥');
    }
  };
  reader.readAsText(file);
}

/* ================= 渲染：顶栏 ================= */
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function renderHeader() {
  const titles = {
    home: ['📝 作业小管家', '今天也要加油哦'],
    stats: ['🌟 打卡小星星', '完成作业，点亮星星'],
    timer: ['⏰ 番茄钟', '专注 25 分钟，休息 5 分钟'],
    settings: ['⚙️ 设置', '科目、数据都在这儿']
  };
  const [t1, t2] = titles[state.tab];
  const header = $('#header');
  if (state.tab === 'home') {
    const d = new Date();
    const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const dueToday = data.homework.filter(h => h.due === todayStr() && !h.completed).length;
    header.innerHTML =
      '<div class="greet">' + greeting() + '，' + esc(data.kidName) + ' 👋</div>' +
      '<div class="sub">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + w +
      (dueToday > 0 ? ' · 今天有 <b>' + dueToday + '</b> 项作业要交' : ' · 今天没有要交的作业') + '</div>';
  } else {
    header.innerHTML = '<div class="greet">' + t1 + '</div><div class="sub">' + t2 + '</div>';
  }
}

/* ================= 渲染：作业列表 ================= */
function hwItemHTML(h) {
  const meta = subjectMeta(h.subject);
  const done = h.completed;
  let dueBadge = '';
  if (h.due) {
    const t = diffDays(h.due, todayStr());
    if (!done && t < 0) {
      dueBadge = '<span class="due overdue">已逾期 ' + (-t) + ' 天</span>';
    } else if (t === 0) {
      dueBadge = '<span class="due today">今天交</span>';
    } else if (t <= 7) {
      dueBadge = '<span class="due">' + fmtDate(h.due) + '</span>';
    } else {
      dueBadge = '<span class="due">' + fmtDate(h.due) + '</span>';
    }
  }
  return (
    '<article class="hw-item' + (done ? ' done' : '') + '">' +
      '<button type="button" class="check' + (done ? ' checked' : '') + '" data-action="toggle" data-id="' + h.id + '" aria-label="完成">' + (done ? '✓' : '') + '</button>' +
      '<div class="hw-main">' +
        '<div class="hw-top">' +
          '<span class="chip" style="--c:' + meta.color + '">' + meta.emoji + ' ' + esc(h.subject) + '</span>' +
          dueBadge +
        '</div>' +
        '<div class="hw-title">' + esc(h.title) + '</div>' +
        (h.note ? '<div class="hw-note">' + esc(h.note) + '</div>' : '') +
      '</div>' +
      '<div class="hw-actions">' +
        '<button type="button" class="mini" data-action="edit" data-id="' + h.id + '" aria-label="编辑">✏️</button>' +
        '<button type="button" class="mini" data-action="del" data-id="' + h.id + '" aria-label="删除">🗑️</button>' +
      '</div>' +
    '</article>'
  );
}

function groupHTML(title, items) {
  if (!items.length) return '';
  return '<div class="group-title">' + title + '</div>' + items.map(hwItemHTML).join('');
}

function renderHome() {
  const today = todayStr();
  const all = data.homework.slice().sort((a, b) => {
    const da = a.due || '9999-99-99', db = b.due || '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    return (b.createdAt < a.createdAt ? -1 : 1);
  });

  const pending = all.filter(h => !h.completed);
  const overdue = pending.filter(h => h.due && h.due < today);
  const dueToday = pending.filter(h => h.due === today);
  const rest = pending.filter(h => !(h.due && h.due <= today));
  const done = all.filter(h => h.completed).slice(0, 100);

  const filters = [
    ['pending', '待完成'], ['today', '今天'], ['overdue', '已逾期'], ['done', '已完成']
  ];
  const filterBar = '<div class="filters">' + filters.map(f =>
    '<button type="button" class="filter' + (state.filter === f[0] ? ' active' : '') + '" data-action="filter" data-filter="' + f[0] + '">' + f[1] + '</button>'
  ).join('') + '</div>';

  const chips = '<div class="chips-row">' + data.subjects.map(s =>
    '<button type="button" class="chip-btn" data-action="subject-quick" data-subject="' + esc(s) + '">' + subjectMeta(s).emoji + ' ' + esc(s) + '</button>'
  ).join('') + '</div>';

  let body = '';
  if (state.filter === 'done') {
    body = groupHTML('✅ 已完成（最近 ' + done.length + ' 条）', done);
  } else if (state.filter === 'today') {
    body = groupHTML('📌 今天要交', dueToday);
  } else if (state.filter === 'overdue') {
    body = groupHTML('🚨 已逾期', overdue);
  } else {
    body = groupHTML('🚨 已逾期', overdue) +
           groupHTML('📌 今天要交', dueToday) +
           groupHTML('📚 待完成', rest);
  }

  const pendingCount = pending.length;
  let empty = '';
  if (!body) {
    if (state.filter === 'done') {
      empty = '<div class="empty"><div class="big">🌱</div>还没有完成的作业，加油哦！</div>';
    } else if (state.filter === 'overdue') {
      empty = '<div class="empty"><div class="big">🌈</div>没有逾期作业，太棒了！</div>';
    } else if (state.filter === 'today') {
      empty = '<div class="empty"><div class="big">🎉</div>今天没有要交的作业</div>';
    } else {
      empty = '<div class="empty"><div class="big">' + (pendingCount ? '✍️' : '🎉') + '</div>' +
        (pendingCount ? '点下面的 + 或科目按钮，添加作业吧' : '作业都写完啦，可以出去玩咯！') + '</div>';
    }
  }

  $('#main').innerHTML = chips + filterBar + body + empty;
  const fab = $('#fab');
  if (!fab) {
    const b = document.createElement('button');
    b.id = 'fab';
    b.type = 'button';
    b.setAttribute('data-action', 'add');
    b.textContent = '+';
    $('#main').appendChild(b); // 挂在 #main 里，点击才能被事件委托捕获
  } else {
    fab.classList.remove('hidden');
  }
}

/* ================= 渲染：统计 ================= */
function renderStats() {
  const today = todayStr();
  const tItems = dueOn(today);
  const tDone = tItems.filter(h => h.completed).length;
  const tTotal = tItems.length;
  const w = weekStat();
  const sk = streakDays();
  const days = last7Days();
  const checked = !!data.checkins[today];

  const bars = days.map(d => {
    const ratio = d.total ? d.done / d.total : 0;
    const face = d.total === 0 ? '·' : (ratio >= 1 ? '😊' : ratio > 0 ? '🙂' : '😢');
    const pct = d.total ? Math.round(ratio * 100) : 0;
    return (
      '<div class="bar-col">' +
        '<div class="bar-track"><div class="bar-fill" style="height:' + pct + '%"></div></div>' +
        '<div class="bar-face">' + face + '</div>' +
        '<div class="bar-day">' + d.label + '</div>' +
      '</div>'
    );
  }).join('');

  $('#main').innerHTML =
    '<div class="stat-card">' +
      '<h4>📅 今日作业</h4>' +
      '<div class="stat-nums">' +
        '<div class="stat-num"><div class="v">' + tDone + '/' + tTotal + '</div><div class="l">已完成</div></div>' +
        '<div class="stat-num"><div class="v">' + w.done + '/' + w.total + '</div><div class="l">本周完成</div></div>' +
        '<div class="stat-num"><div class="v">🔥' + sk + '</div><div class="l">连续打卡(天)</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<h4>📊 最近 7 天完成情况</h4>' +
      '<div class="bars">' + bars + '</div>' +
    '</div>' +
    '<button type="button" id="checkin-btn" class="' + (checked ? 'done' : '') + '" data-action="checkin">' +
      (checked ? '✅ 今天已打卡 · 点击取消' : '⭐ 今天作业完成啦，打卡！') +
    '</button>' +
    '<div class="streak-line">连续打卡 <b>' + sk + '</b> 天' + (sk >= 3 ? '，好厉害！🌟' : '，坚持就是胜利 💪') + '</div>';
}

/* ================= 渲染：番茄钟 ================= */
function renderTimerRing() {
  const R = 100, C = 2 * Math.PI * R;
  const ratio = timer.dur ? timer.left / timer.dur : 0;
  const fg = $('#ring-fg');
  if (fg) {
    fg.style.strokeDasharray = C;
    fg.style.strokeDashoffset = C * (1 - ratio);
  }
  const mm = String(Math.floor(timer.left / 60)).padStart(2, '0');
  const ss = String(timer.left % 60).padStart(2, '0');
  const t = $('#timer-mm');
  if (t) t.textContent = mm + ':' + ss;
  const tag = $('#timer-mode-tag');
  if (tag) tag.textContent = timer.mode === 'work' ? '专注时间' : '休息时间 ☕';
  const btn = $('#timer-start');
  if (btn) btn.textContent = timer.running ? '暂停 ⏸' : '开始 ▶';
}

function renderTimer() {
  const workDurs = [15, 25, 45];
  const restDurs = [5, 10, 15];
  const durs = timer.mode === 'work' ? workDurs : restDurs;
  const cur = data.timer[timer.mode];
  $('#main').innerHTML =
    '<div class="timer-card stat-card">' +
      '<div class="mode-tabs">' +
        '<button type="button" class="mode' + (timer.mode === 'work' ? ' active' : '') + '" data-action="timer-mode" data-mode="work">📚 专注</button>' +
        '<button type="button" class="mode' + (timer.mode === 'rest' ? ' active' : '') + '" data-action="timer-mode" data-mode="rest">☕ 休息</button>' +
      '</div>' +
      '<div class="timer-ring-wrap">' +
        '<svg width="240" height="240" viewBox="0 0 240 240">' +
          '<circle class="timer-ring-bg" cx="120" cy="120" r="100"></circle>' +
          '<circle id="ring-fg" class="timer-ring-fg" cx="120" cy="120" r="100"></circle>' +
        '</svg>' +
        '<div class="timer-time">' +
          '<div class="mm" id="timer-mm">25:00</div>' +
          '<div class="mode-tag" id="timer-mode-tag">专注时间</div>' +
        '</div>' +
      '</div>' +
      '<div class="dur-chips">' + durs.map(d =>
        '<button type="button" class="dur' + (d === cur ? ' active' : '') + '" data-action="timer-dur" data-sec="' + (d * 60) + '">' + d + ' 分钟</button>'
      ).join('') + '</div>' +
      '<div class="timer-ctrl">' +
        '<button type="button" id="timer-start" class="tbtn start" data-action="timer-start">开始 ▶</button>' +
        '<button type="button" class="tbtn ghost" data-action="timer-reset">重置</button>' +
        '<button type="button" class="tbtn ghost" data-action="timer-skip">跳过</button>' +
      '</div>' +
      '<div class="timer-tip">💡 写作业时用番茄钟：专注一段时间，再休息一小会儿，效率更高哦</div>' +
    '</div>';
  renderTimerRing();
}

/* ================= 渲染：设置 ================= */
function renderSettings() {
  const subjRows = data.subjects.map(s => {
    const m = subjectMeta(s);
    return (
      '<div class="subj-item">' +
        '<span class="dot" style="background:' + m.color + '">' + m.emoji + '</span>' +
        '<span class="sname">' + esc(s) + '</span>' +
        '<button type="button" class="btn danger small" data-action="subject-del" data-subject="' + esc(s) + '">删除</button>' +
      '</div>'
    );
  }).join('');

  $('#main').innerHTML =
    '<div class="set-card">' +
      '<h4>👧 称呼（顶栏问候语）</h4>' +
      '<div class="set-row">' +
        '<input type="text" id="kid-name" value="' + esc(data.kidName) + '" maxlength="8" placeholder="比如：宝贝 / 朵朵">' +
      '</div>' +
    '</div>' +
    '<div class="set-card">' +
      '<h4>📚 科目管理</h4>' +
      subjRows +
      '<button type="button" class="btn ghost full" data-action="subject-add">＋ 添加科目</button>' +
    '</div>' +
    '<div class="set-card">' +
      '<h4>🗄️ 数据备份</h4>' +
      '<div class="set-actions">' +
        '<button type="button" class="btn ghost" data-action="export">📦 导出备份</button>' +
        '<button type="button" class="btn ghost" data-action="import">📥 导入备份</button>' +
        '<button type="button" class="btn danger" data-action="clear-done">🧹 清空已完成作业</button>' +
        '<button type="button" class="btn danger" data-action="reset-all">♻️ 全部重置</button>' +
      '</div>' +
    '</div>' +
    '<div class="about">作业小管家 v1.0 · 数据保存在手机本地<br>有问题随时告诉爸爸妈妈 👨‍👩‍👧</div>';
}

/* ================= 渲染入口 ================= */
function render() {
  renderHeader();
  if (state.tab === 'home') renderHome();
  else if (state.tab === 'stats') renderStats();
  else if (state.tab === 'timer') renderTimer();
  else renderSettings();
  const fab = $('#fab');
  if (fab && state.tab !== 'home') fab.classList.add('hidden');
}

/* ================= 弹窗（添加/编辑作业） ================= */
function openModal(id) {
  state.editingId = id || null;
  const h = id ? getHw(id) : null;
  const select = $('#f-subject');
  select.innerHTML = data.subjects.map(s =>
    '<option value="' + esc(s) + '">' + subjectMeta(s).emoji + ' ' + esc(s) + '</option>'
  ).join('');
  select.value = h ? h.subject : (data.subjects[0] || '语文');
  $('#f-title').value = h ? h.title : '';
  $('#f-note').value = h ? h.note : '';
  $('#f-due').value = h ? h.due : '';
  $('#modal-title').textContent = id ? '编辑作业' : '添加作业';
  $('#f-delete').classList.toggle('hidden', !id);
  resetVoiceUI();
  initVoiceUI();
  $('#modal').classList.remove('hidden');
  setTimeout(() => $('#f-title').focus(), 120);
}

function closeModal() {
  resetVoiceUI();
  $('#modal').classList.add('hidden');
  state.editingId = null;
}

function openModalForSubject(subject) {
  openModal();
  $('#f-subject').value = subject;
}

/* ================= 语音输入 ================= */
const SR_API = window.SpeechRecognition || window.webkitSpeechRecognition;
let speechRec = null;
let speechActive = false;

function voiceSupported() { return !!(window.HWSpeech || SR_API); }

function setMicUI(active) {
  const mic = $('#mic-btn');
  if (!mic) return;
  mic.textContent = active ? '⏹' : '🎤';
  mic.classList.toggle('listening', active);
}

function resetVoiceUI() {
  speechActive = false;
  setMicUI(false);
  const st = $('#mic-status');
  if (st) { st.classList.add('hidden'); st.textContent = ''; }
  if (speechRec) { try { speechRec.abort(); } catch (e) { /* 忽略 */ } speechRec = null; }
}

function initVoiceUI() {
  const mic = $('#mic-btn');
  const hint = $('#mic-hint');
  if (!mic) return;
  if (voiceSupported()) {
    mic.classList.remove('hidden');
    if (hint) hint.classList.add('hidden');
  } else {
    mic.classList.add('hidden');
    if (hint) hint.classList.remove('hidden');
  }
}

function micStatus(msg, interim) {
  const st = $('#mic-status');
  if (!st) return;
  st.textContent = msg;
  st.classList.toggle('interim', !!interim);
  st.classList.remove('hidden');
}

function onMicClick() {
  if (speechActive) { resetVoiceUI(); return; }
  if (window.HWSpeech) {
    startNativeVoice();
  } else if (SR_API) {
    startWebSpeech();
  } else {
    toast('当前环境不支持语音，请点手机键盘上的麦克风 🎤');
  }
}

function startWebSpeech() {
  try {
    speechRec = new SR_API();
    speechRec.lang = 'zh-CN';
    speechRec.interimResults = true;
    speechRec.maxAlternatives = 1;
    speechRec.onstart = () => { speechActive = true; setMicUI(true); micStatus('正在听…请说作业内容'); };
    speechRec.onresult = (e) => {
      let final = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      const input = $('#f-title');
      if (final) {
        input.value = (input.value.trim() ? input.value.trim() + ' ' : '') + final;
        micStatus('已识别：' + final);
        resetVoiceUI();
      } else if (interim) {
        micStatus('识别中：' + interim, true);
      }
    };
    speechRec.onerror = (e) => {
      const msg = e.error === 'not-allowed' ? '麦克风权限被拒绝，请在浏览器设置里允许' :
                  (e.error === 'no-speech' ? '没听到声音，再试一次' : '语音识别失败：' + e.error);
      resetVoiceUI();
      toast(msg);
    };
    speechRec.onend = () => { if (speechActive) resetVoiceUI(); };
    speechRec.start();
  } catch (e) {
    toast('无法启动语音输入');
  }
}

function startNativeVoice() {
  window.__hwSpeechCb = function (res) {
    if (res && res.state === 'listening') {
      speechActive = true; setMicUI(true);
      micStatus('正在听…请说作业内容');
      return;
    }
    speechActive = false; setMicUI(false);
    const st = $('#mic-status');
    if (st) st.classList.add('hidden');
    if (res && res.error) {
      const msg = res.error.indexOf('permission') >= 0 ? '麦克风权限被拒绝，请在系统设置里允许' :
                  (res.error.indexOf('no_match') >= 0 ? '没听清，再试一次' : '语音识别失败（' + res.error + '）');
      toast(msg);
    } else if (res && res.text) {
      const input = $('#f-title');
      input.value = (input.value.trim() ? input.value.trim() + ' ' : '') + res.text;
      toast('已识别：' + res.text);
    }
  };
  try { window.HWSpeech.startVoice(); } catch (e) { toast('无法启动语音输入'); }
}

/* ================= 科目管理 ================= */
function addSubjectPrompt() {
  const name = prompt('新科目名称（比如：书法 / 编程）：');
  if (!name || !name.trim()) return;
  const s = name.trim().slice(0, 8);
  if (data.subjects.includes(s)) { toast('这个科目已经有了'); return; }
  data.subjects.push(s);
  save();
  renderSettings();
  toast('已添加科目 ' + s);
}

function removeSubjectPrompt(s) {
  const used = data.homework.filter(h => h.subject === s).length;
  if (used > 0 && !confirm('「' + s + '」还有 ' + used + ' 条作业记录，删除科目不影响这些作业，确定删除科目吗？')) return;
  data.subjects = data.subjects.filter(x => x !== s);
  save();
  renderSettings();
  toast('已删除科目 ' + s);
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  // 底部导航
  $('#tabbar').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    state.tab = tab.dataset.tab;
    state.filter = 'pending';
    $$('#tabbar .tab').forEach(t => t.classList.toggle('active', t === tab));
    render();
  });

  // 主区域（事件委托）
  $('#main').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'toggle') toggleHw(id);
    else if (action === 'edit') openModal(id);
    else if (action === 'del') {
      if (confirm('确定删除这条作业吗？')) { deleteHw(id); toast('已删除 🗑️'); renderHome(); }
    } else if (action === 'add') openModal();
    else if (action === 'subject-quick') openModalForSubject(btn.dataset.subject);
    else if (action === 'filter') {
      state.filter = btn.dataset.filter;
      renderHome();
    } else if (action === 'checkin') toggleCheckin();
    else if (action === 'timer-start') toggleTimer();
    else if (action === 'timer-reset') resetTimer();
    else if (action === 'timer-skip') skipPhase();
    else if (action === 'timer-mode') setMode(btn.dataset.mode);
    else if (action === 'timer-dur') setDuration(parseInt(btn.dataset.sec, 10));
    else if (action === 'subject-add') addSubjectPrompt();
    else if (action === 'subject-del') removeSubjectPrompt(btn.dataset.subject);
    else if (action === 'export') exportData();
    else if (action === 'import') $('#import-file').click();
    else if (action === 'clear-done') {
      if (confirm('确定清空所有已完成的作业吗？')) clearCompleted();
    } else if (action === 'reset-all') {
      if (confirm('确定要清空所有数据（作业、打卡、科目）吗？此操作不可恢复！') &&
          confirm('真的要全部重置吗？')) resetAll();
    }
  });

  // 导入文件
  $('#import-file').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // 称呼
  $('#main').addEventListener('change', e => {
    if (e.target && e.target.id === 'kid-name') {
      data.kidName = e.target.value.trim() || '宝贝';
      save();
      renderHeader();
      toast('称呼已更新 👧');
    }
  });

  // 弹窗
  $('#mic-btn').addEventListener('click', onMicClick);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
  $('#f-delete').addEventListener('click', () => {
    if (!state.editingId) return;
    if (confirm('确定删除这条作业吗？')) {
      deleteHw(state.editingId);
      closeModal();
      toast('已删除 🗑️');
      renderHome();
    }
  });
  $('#hw-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#f-title').value.trim();
    if (!title) { toast('写一下作业内容吧 ✍️'); return; }
    const patch = {
      subject: $('#f-subject').value,
      title,
      note: $('#f-note').value.trim(),
      due: $('#f-due').value
    };
    if (state.editingId) {
      updateHw(state.editingId, patch);
      toast('已保存 ✅');
    } else {
      addHw(patch);
      toast('已添加，记得完成哦 🌟');
    }
    closeModal();
    renderHome();
  });

  // 安装横幅
  $('#install-no').addEventListener('click', () => $('#install-banner').classList.add('hidden'));
  $('#install-yes').addEventListener('click', async () => {
    if (window.__deferredPrompt) {
      window.__deferredPrompt.prompt();
      await window.__deferredPrompt.userChoice;
      window.__deferredPrompt = null;
      $('#install-banner').classList.add('hidden');
    } else {
      toast('请用浏览器菜单里的「添加到主屏幕」');
    }
  });
}

/* ================= 启动 ================= */
function init() {
  bindEvents();
  render();

  // PWA 安装提示
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window.__deferredPrompt = e;
    const b = $('#install-banner');
    if (b && !localStorage.getItem('hw_install_dismissed')) {
      b.classList.remove('hidden');
    }
  });
  $('#install-no').addEventListener('click', () => {
    localStorage.setItem('hw_install_dismissed', '1');
  });

  // 在线/离线提示
  window.addEventListener('offline', () => toast('当前离线，但作业都还在本地哦 📴'));
  window.addEventListener('online', () => toast('网络已恢复 🌐'));

  // Service Worker（仅 http/https 下生效；双击打开 html 文件也能用，只是无法离线安装）
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 忽略注册失败 */ });
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
