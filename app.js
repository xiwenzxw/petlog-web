import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDiu-6FY1u6tegbsMYJlm1v_Yn2QVvUubM',
  authDomain: 'petlog-backup.firebaseapp.com',
  projectId: 'petlog-backup',
  storageBucket: 'petlog-backup.firebasestorage.app',
  messagingSenderId: '1003436567426',
  appId: '1:1003436567426:web:3e98fea18dcdfdcaf3fd9b'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const kinds = {
  vomit: ['🤮', '呕吐'], diarrhea: ['💩', '拉稀'], vet: ['🩺', '看医生'],
  deworming: ['💊', '内驱'], flea: ['🛡️', '外驱'], vaccine: ['💉', '疫苗'],
  weight: ['⚖️', '体重'], bath: ['🛁', '洗澡'], grooming: ['✂️', '美容'], other: ['📝', '其他']
};
const legacyKindNames = { appetite: ['🍽️', '食欲'], mood: ['🐾', '精神状态'] };
const hiddenLegacyKinds = new Set(Object.keys(legacyKindNames));
const careKinds = ['deworming', 'flea', 'vaccine', 'bath', 'grooming'];
const quickKinds = ['vomit', 'diarrhea', 'vet', 'weight', 'deworming', 'other'];
const defaults = { deworming: 30, flea: 30, vaccine: 365, bath: 21, grooming: 45 };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const defaultReminders = () => Object.fromEntries(careKinds.map(kind => [kind, {
  interval: defaults[kind], last: '', time: '09:00', calendarAddedFor: ''
}]));
const newPet = (name = '', breed = '') => ({
  id: crypto.randomUUID(), name, breed, sex: '', sterilized: '', birthday: '', chip: '', avatar: '', avatarPath: '', pendingAvatar: '', reminders: defaultReminders()
});
const blankState = () => {
  const pets = [newPet('Vinvin', '马尔济斯'), newPet('果冻', '马尔济斯')];
  return { version: 2, modifiedAt: new Date().toISOString(), selectedPetId: pets[0].id, pets, records: [], notificationEnabled: false };
};

const icons = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-7H9v7H3.5a.5.5 0 0 1-.5-.5v-9.7Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 3h6l1 4H8l1-4Zm-3 4 1 14h10l1-14M10 11v6m4-6v6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm-2 5h18M8 2v4m8-4v4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18h11a4 4 0 0 0 .4-8A6.5 6.5 0 0 0 6 8.5 4.8 4.8 0 0 0 7 18Z"/></svg>'
};

let state = blankState();
let page = 'home';
let detailKind = null;
let editingPetId = null;
let editingReminder = null;
let cloudUser = null;
let cloudReady = false;
let cloudSyncTimer = null;
let cloudStatus = { tone: 'neutral', text: '未登录' };
let storageKey = 'guest';
let toastTimer = null;

const $ = selector => document.querySelector(selector);
const pet = () => state.pets.find(item => item.id === state.selectedPetId);
const allPetRecords = () => state.records.filter(item => item.petId === pet()?.id).sort((a, b) => new Date(b.date) - new Date(a.date));
const records = () => allPetRecords().filter(item => !hiddenLegacyKinds.has(item.kind));
const weights = () => records().filter(item => item.kind === 'weight' && Number.isFinite(Number(item.weight)));
const kindInfo = kind => kinds[kind] || legacyKindNames[kind] || ['📝', '记录'];
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dayStart = value => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d; };
const shortDate = value => new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
const localDate = value => new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
const dateTime = value => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const isToday = value => dayStart(value).getTime() === dayStart(new Date()).getTime();
const addDays = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + Number(days)); return d; };
const nextDate = reminder => reminder?.last ? addDays(reminder.last, reminder.interval) : null;
const daysUntil = date => date ? Math.ceil((dayStart(date) - dayStart(new Date())) / 86400000) : null;

const idb = new Promise((resolve, reject) => {
  const request = indexedDB.open('pawsnote-web', 2);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('store')) request.result.createObjectStore('store'); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function dbGet(key) {
  const database = await idb;
  return new Promise((resolve, reject) => { const r = database.transaction('store', 'readonly').objectStore('store').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function dbPut(key, value) {
  const database = await idb;
  return new Promise((resolve, reject) => { const r = database.transaction('store', 'readwrite').objectStore('store').put(value, key); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
}
function migrate(input) {
  const value = input && Array.isArray(input.pets) && Array.isArray(input.records) ? input : blankState();
  value.version = 2;
  value.modifiedAt ||= new Date().toISOString();
  value.notificationEnabled ??= false;
  value.pets.forEach(item => {
    item.avatarPath ||= '';
    item.pendingAvatar ||= '';
    item.reminders ||= defaultReminders();
    careKinds.forEach(kind => { item.reminders[kind] = { interval: defaults[kind], last: '', time: '09:00', calendarAddedFor: '', ...(item.reminders[kind] || {}) }; });
  });
  value.records.forEach(record => {
    record.photoPath ||= '';
    record.pendingPhoto ||= '';
  });
  value.selectedPetId = value.pets.some(item => item.id === value.selectedPetId) ? value.selectedPetId : (value.pets[0]?.id || '');
  return value;
}
async function loadLocal(key = storageKey, allowLegacy = false) {
  let value = await dbGet(`state:${key}`);
  if (!value && allowLegacy) value = await dbGet('state');
  state = migrate(value || blankState());
  render();
}
async function saveLocal() { state.modifiedAt = new Date().toISOString(); await dbPut(`state:${storageKey}`, state); }
async function save({ sync = true } = {}) { await saveLocal(); if (sync) queueCloudSync(); }

function avatar(item, size = '') {
  return `<span class="avatar ${size}">${item?.avatar ? `<img src="${escapeHtml(item.avatar)}" alt="${escapeHtml(item.name)}">` : '<span class="paw-placeholder">●</span>'}</span>`;
}
function nav() {
  const items = [['home', 'home', '日记'], ['reminders', 'clock', '提醒'], ['stats', 'chart', '统计'], ['settings', 'settings', '设置']];
  return `<nav class="tabs" aria-label="主导航">${items.map(([id, icon, label]) => `<button class="tab ${(page === id || (page === 'detail' && id === 'stats')) ? 'active' : ''}" data-page="${id}">${icons[icon]}<span>${label}</span></button>`).join('')}</nav>`;
}
function topbar(title = '', action = '') {
  if (title) return `<header class="topbar"><h1>${title}</h1>${action}</header>`;
  const current = pet();
  return `<header class="topbar"><div class="pet-switcher">${avatar(current, 'small')}<select id="pet-select" aria-label="选择宠物">${state.pets.map(item => `<option value="${item.id}" ${item.id === state.selectedPetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><button id="add-record" class="round-button" aria-label="新增记录">＋</button></header>`;
}
function recordRows(list, emptyText = '还没有记录，点击右上角 ＋ 开始记录。') {
  if (!list.length) return `<div class="empty">${emptyText}</div>`;
  return list.map(record => { const info = kindInfo(record.kind); return `<article class="record">
    <span class="record-icon">${info[0]}</span><div class="record-main"><strong>${info[1]}${record.kind === 'weight' ? ` · ${Number(record.weight).toFixed(2)} kg` : ''}</strong>${record.note ? `<p>${escapeHtml(record.note)}</p>` : ''}</div>
    ${record.photo ? `<img class="record-photo" src="${escapeHtml(record.photo)}" alt="记录照片">` : ''}<time>${dateTime(record.date)}</time>
    <button class="delete-record" data-delete-record="${record.id}" aria-label="删除这条记录">${icons.trash}</button></article>`; }).join('');
}
function reminderSummary(currentPet = pet()) {
  if (!currentPet) return { overdue: 0, upcoming: 0, next: null };
  const items = careKinds.map(kind => ({ kind, date: nextDate(currentPet.reminders[kind]) })).filter(item => item.date).sort((a, b) => a.date - b.date);
  return { overdue: items.filter(item => daysUntil(item.date) < 0).length, upcoming: items.filter(item => { const d = daysUntil(item.date); return d >= 0 && d <= 7; }).length, next: items[0] || null };
}
function home() {
  const current = pet(); if (!current) return noPets();
  const ws = weights(); const latest = ws[0]; const previous = ws[1]; const change = latest && previous ? Number(latest.weight) - Number(previous.weight) : null;
  const todayRecords = records().filter(record => isToday(record.date));
  const summary = reminderSummary(current);
  return `${topbar()}
    <section class="hero"><p class="eyebrow">今天</p><h2>${latest && isToday(latest.date) ? `体重 ${Number(latest.weight).toFixed(2)} kg` : todayRecords.length ? `已记录 ${todayRecords.length} 个健康细节` : '今天感觉怎么样？'}</h2><p>为 ${escapeHtml(current.name)} 留住每一个健康细节</p></section>
    <section class="today-card"><div><span class="section-kicker">今日提醒</span><strong>${summary.overdue ? `${summary.overdue} 项已逾期` : summary.upcoming ? `未来 7 天有 ${summary.upcoming} 项` : '暂时没有紧急事项'}</strong></div><button data-page="reminders">查看${icons.chevron}</button></section>
    <div class="section-head"><h2>快速记录</h2><button class="link-button" id="add-record-secondary">全部</button></div>
    <section class="quick-grid">${quickKinds.map(kind => `<button class="quick-action" data-quick-kind="${kind}"><span>${kinds[kind][0]}</span><small>${kinds[kind][1]}</small></button>`).join('')}</section>
    ${latest ? `<button class="weight-card" data-weight-detail><span class="weight-icon">⚖️</span><div><small>最新体重 · ${localDate(latest.date)}</small><b>${Number(latest.weight).toFixed(2)} kg</b></div><div class="weight-change">${change === null ? '<small>首次记录</small>' : `<small>较上次</small><strong class="${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change > 0 ? '+' : ''}${change.toFixed(2)} kg</strong>`}</div></button>` : ''}
    <div class="section-head"><h2>最近记录</h2><button class="link-button" data-weight-detail>体重趋势</button></div><section class="card timeline">${recordRows(records().slice(0, 8))}</section>`;
}
function reminderPage() {
  const current = pet(); if (!current) return noPets(); const summary = reminderSummary(current);
  return `${topbar('提醒', '<button id="calendar-all" class="header-action">导出全部日历</button>')}
    <section class="smart-card"><div class="smart-icon">✦</div><div><span>智能提醒</span><strong>${summary.overdue ? `${summary.overdue} 项护理已经逾期` : summary.upcoming ? `未来 7 天有 ${summary.upcoming} 项护理` : '所有护理都安排得很好'}</strong><p>到期时间根据上次完成日期和护理周期自动计算。</p></div></section>
    <section class="reminder-list">${careKinds.map(kind => {
      const r = current.reminders[kind]; const next = nextDate(r); const days = daysUntil(next);
      const label = !next ? '完成一次后自动计算' : days < 0 ? `已逾期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `还有 ${days} 天`;
      const added = next && r.calendarAddedFor === next.toISOString().slice(0, 10);
      return `<article class="reminder-card ${days !== null && days <= 0 ? 'due-now' : ''}"><button class="reminder-edit" data-reminder="${kind}"><span class="reminder-icon">${kinds[kind][0]}</span><div><strong>${kinds[kind][1]}</strong><p>${label} · 每 ${r.interval} 天</p>${next ? `<time>${localDate(next)} ${escapeHtml(r.time || '09:00')}</time>` : ''}</div>${icons.chevron}</button><div class="reminder-actions"><button data-complete="${kind}" class="complete-button">${icons.check}完成</button><button data-calendar="${kind}" class="calendar-button ${added ? 'added' : ''}">${icons.calendar}${added ? '已加入日历' : '加入日历'}</button></div></article>`;
    }).join('')}</section><p class="page-note">加入 iPhone 日历后，系统会在提前 1 天、提前 2 小时和到期时提醒你，不需要付费订阅。</p>`;
}
function weightChart(items, large = false) {
  if (!items.length) return '';
  const sorted = items.slice().sort((a, b) => new Date(a.date) - new Date(b.date)); const values = sorted.map(item => Number(item.weight));
  let min = Math.min(...values); let max = Math.max(...values); const pad = Math.max((max - min) * .25, .2); min = Math.floor((min - pad) * 10) / 10; max = Math.ceil((max + pad) * 10) / 10; if (max === min) max = min + 1;
  const width = Math.max(420, sorted.length * 72); const height = large ? 280 : 220; const left = 50, right = 22, top = 22, bottom = 44; const pw = width - left - right, ph = height - top - bottom;
  const x = i => left + (sorted.length === 1 ? pw / 2 : i * pw / (sorted.length - 1)); const y = v => top + (max - v) * ph / (max - min); const ticks = Array.from({ length: 5 }, (_, i) => max - i * (max - min) / 4);
  return `<div class="chart-scroll ${large ? 'large' : ''}"><svg class="line-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-label="体重趋势折线图">${ticks.map(v => `<line class="grid-line" x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}"/><text class="axis-label" x="${left-8}" y="${y(v)+4}" text-anchor="end">${v.toFixed(1)}</text>`).join('')}<text class="axis-label" x="8" y="14">kg</text>${sorted.length > 1 ? `<polyline class="weight-line" points="${sorted.map((item,i)=>`${x(i)},${y(item.weight)}`).join(' ')}"/>` : ''}${sorted.map((item,i)=>`<g class="chart-point" data-chart-record="${item.id}" tabindex="0"><circle cx="${x(i)}" cy="${y(item.weight)}" r="6"/><text class="point-value" x="${x(i)}" y="${y(item.weight)-12}" text-anchor="middle">${Number(item.weight).toFixed(2)}</text><text class="axis-label" x="${x(i)}" y="${height-15}" text-anchor="middle">${shortDate(item.date)}</text></g>`).join('')}</svg></div>`;
}
function stats() {
  if (!pet()) return noPets();
  const ws = weights(); const current = records();
  return `${topbar('健康统计')}<section class="summary-strip"><div><b>${current.length}</b><span>全部记录</span></div><div><b>${ws.length ? Number(ws[0].weight).toFixed(2) : '—'}</b><span>最新体重 kg</span></div><div><b>${careKinds.filter(kind => daysUntil(nextDate(pet().reminders[kind])) < 0).length}</b><span>逾期提醒</span></div></section>
    <div class="section-head"><h2>记录类型</h2><span>点击查看明细</span></div><section class="stats-grid">${Object.keys(kinds).map(kind => `<button class="stat-card" data-kind-detail="${kind}"><span>${kinds[kind][0]}</span><b>${current.filter(r => r.kind === kind).length}</b><small>${kinds[kind][1]}</small></button>`).join('')}</section>
    <div class="section-head"><h2>体重趋势</h2><span>${ws.length ? `${ws.length} 次记录` : ''}</span></div>${ws.length ? `<button class="chart-card" data-weight-detail>${weightChart(ws)}<span>点击查看完整记录</span></button>` : '<section class="card empty">添加第一条体重记录后，这里会显示变化趋势。</section>'}`;
}
function detailPage() {
  const kind = detailKind || 'weight'; const info = kindInfo(kind); const list = records().filter(item => item.kind === kind);
  return `<header class="topbar detail-topbar"><button class="back-button" data-back-stats>${icons.back}</button><h1>${info[0]} ${info[1]}记录</h1><span></span></header>${kind === 'weight' && list.length ? `<section class="card detail-chart">${weightChart(list, true)}</section>` : ''}<div class="history-count"><strong>${list.length}</strong><span>次记录</span></div><section class="card timeline">${recordRows(list, `还没有${info[1]}记录。`)}</section>`;
}
function cloudPanel() {
  const email = cloudUser?.email || '';
  return `<section class="settings-group"><h2>账号与同步</h2><div class="settings-card"><div class="cloud-row"><span class="settings-symbol">${icons.cloud}</span><div><strong>${cloudUser ? escapeHtml(email) : 'Google 云端备份'}</strong><p><span class="status-dot ${cloudStatus.tone}"></span>${escapeHtml(cloudStatus.text)}</p></div><button id="${cloudUser ? 'logout' : 'login'}" class="pill-button">${cloudUser ? '退出' : '登录'}</button></div>${cloudUser ? '<button id="sync-now" class="settings-line">立即同步<span>›</span></button>' : ''}</div><p class="settings-hint">每个 Google 账号拥有独立资料。文字记录会免费同步；照片保留在本机，并包含在 JSON 备份中。</p></section>`;
}
function settingsPage() {
  return `${topbar('设置', '<button id="add-pet" class="round-button mini" aria-label="添加宠物">＋</button>')}
    <section class="settings-group"><h2>宠物</h2><div class="settings-card">${state.pets.map(item => `<button class="pet-row" data-edit-pet="${item.id}">${avatar(item, 'small')}<div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml([item.breed || '我的毛孩子', item.sex, item.sterilized].filter(Boolean).join(' · '))}</p></div>${item.id === state.selectedPetId ? '<span class="selected-badge">当前</span>' : ''}${icons.chevron}</button>`).join('')}</div></section>
    ${cloudPanel()}
    <section class="settings-group"><h2>提醒与日历</h2><div class="settings-card"><button id="notifications" class="settings-line">到期通知<span>${state.notificationEnabled ? '已开启' : '开启'} ›</span></button><button id="calendar-all-settings" class="settings-line">导出全部提醒到日历<span>›</span></button></div><p class="settings-hint">浏览器通知会在打开 PetLog 时检查；日历提醒可以在 App 未打开时正常出现。</p></section>
    <section class="settings-group"><h2>资料与备份</h2><div class="settings-card"><button id="export" class="settings-line">导出 JSON 备份<span>›</span></button><button id="import" class="settings-line">导入 JSON 备份<span>›</span></button>${pet() ? '<button id="delete-pet" class="settings-line danger">删除当前宠物<span>›</span></button>' : ''}</div></section>
    <footer class="app-footer"><strong>PetLog</strong><span>宠物健康记录 · 版本 2.0</span></footer>`;
}
function noPets() { return `${topbar('PetLog')}<section class="empty-state"><div>🐾</div><h2>添加你的第一只宠物</h2><p>开始记录健康、体重和护理提醒。</p><button id="add-pet" class="primary-button">添加宠物</button></section>`; }
function toast(message, tone = 'success') {
  clearTimeout(toastTimer); let element = $('#toast'); if (!element) { element = document.createElement('div'); element.id = 'toast'; document.body.append(element); }
  element.className = `toast show ${tone}`; element.innerHTML = `<span>${escapeHtml(message)}</span><button aria-label="关闭">×</button>`; element.querySelector('button').onclick = () => element.classList.remove('show');
  toastTimer = setTimeout(() => element.classList.remove('show'), 4500);
}
function render() {
  const body = page === 'home' ? home() : page === 'reminders' ? reminderPage() : page === 'stats' ? stats() : page === 'detail' ? detailPage() : settingsPage();
  $('#app').innerHTML = `<div class="app">${body}${nav()}</div>`; bindPage();
}
function bindPage() {
  document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { page = button.dataset.page; detailKind = null; render(); });
  $('#pet-select')?.addEventListener('change', async e => { state.selectedPetId = e.target.value; await save(); render(); });
  $('#add-record')?.addEventListener('click', () => openRecord()); $('#add-record-secondary')?.addEventListener('click', () => openRecord());
  document.querySelectorAll('[data-quick-kind]').forEach(button => button.onclick = () => openRecord(button.dataset.quickKind));
  $('#add-pet')?.addEventListener('click', () => openPet()); document.querySelectorAll('[data-edit-pet]').forEach(button => button.onclick = () => openPet(button.dataset.editPet));
  document.querySelectorAll('[data-reminder]').forEach(button => button.onclick = () => openReminder(button.dataset.reminder));
  document.querySelectorAll('[data-complete]').forEach(button => button.onclick = () => completeReminder(button.dataset.complete));
  document.querySelectorAll('[data-calendar]').forEach(button => button.onclick = () => exportCalendar([button.dataset.calendar]));
  $('#calendar-all')?.addEventListener('click', () => exportCalendar(careKinds)); $('#calendar-all-settings')?.addEventListener('click', () => exportCalendar(careKinds));
  document.querySelectorAll('[data-kind-detail]').forEach(button => button.onclick = () => { detailKind = button.dataset.kindDetail; page = 'detail'; render(); });
  document.querySelectorAll('[data-weight-detail]').forEach(button => button.onclick = () => { detailKind = 'weight'; page = 'detail'; render(); });
  $('[data-back-stats]')?.addEventListener('click', () => { page = 'stats'; detailKind = null; render(); });
  document.querySelectorAll('[data-delete-record]').forEach(button => button.onclick = async () => deleteRecord(button.dataset.deleteRecord));
  document.querySelectorAll('[data-chart-record]').forEach(point => { const show = () => { const r = state.records.find(item => item.id === point.dataset.chartRecord); if (r) alert(`${dateTime(r.date)}\n体重：${Number(r.weight).toFixed(2)} kg${r.note ? `\n备注：${r.note}` : ''}`); }; point.onclick = show; point.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') show(); }; });
  $('#export')?.addEventListener('click', exportData); $('#import')?.addEventListener('click', () => $('#import-file').click()); $('#delete-pet')?.addEventListener('click', deletePet);
  $('#login')?.addEventListener('click', loginWithGoogle); $('#logout')?.addEventListener('click', logout); $('#sync-now')?.addEventListener('click', () => syncCloud(true)); $('#notifications')?.addEventListener('click', enableNotifications);
}

function setupDialogs() {
  document.querySelectorAll('.close').forEach(button => button.onclick = () => button.closest('dialog').close());
  $('#record-kind').innerHTML = Object.entries(kinds).map(([id, value]) => `<option value="${id}">${value[0]} ${value[1]}</option>`).join('');
  $('#record-kind').onchange = () => { $('#weight-field').hidden = $('#record-kind').value !== 'weight'; };
  $('#record-form').onsubmit = saveRecord; $('#pet-form').onsubmit = savePet; $('#reminder-form').onsubmit = saveReminder;
  $('#pet-form [name=avatar]').onchange = async event => { const data = await fileData(event.target.files[0], 700); if (data) { $('#avatar-preview').innerHTML = `<img src="${data}" alt="头像">`; $('#avatar-preview').dataset.value = data; } };
  $('#import-file').onchange = importData;
}
function openRecord(kind = 'vomit') { if (!pet()) return; const form = $('#record-form'); form.reset(); $('#record-kind').value = kind; $('#record-date').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16); $('#weight-field').hidden = kind !== 'weight'; $('#record-dialog').showModal(); }
async function saveRecord(event) {
  event.preventDefault(); const form = new FormData(event.target); const kind = form.get('kind'); const weight = Number(String(form.get('weight')).replace(',', '.'));
  if (kind === 'weight' && (!Number.isFinite(weight) || weight <= 0)) return alert('请填写正确的体重，例如 5.30');
  const file = form.get('photo'); const id = crypto.randomUUID(); let photo = '', photoPath = '', pendingPhoto = '';
  if (file?.size) photo = await fileData(file, 1600);
  state.records.push({ id, petId: pet().id, kind, date: form.get('date'), weight: kind === 'weight' ? weight : null, note: String(form.get('note') || '').trim(), photo, photoPath, pendingPhoto });
  await save(); $('#record-dialog').close(); render();
}
function openPet(id = null) { editingPetId = id; const current = id ? state.pets.find(item => item.id === id) : null; const form = $('#pet-form'); form.reset(); $('#pet-dialog-title').textContent = current ? '编辑宠物' : '添加宠物'; ['name','breed','sex','sterilized','birthday','chip'].forEach(key => form.elements[key].value = current?.[key] || ''); $('#avatar-preview').dataset.value = current?.avatar || ''; $('#avatar-preview').innerHTML = current?.avatar ? `<img src="${escapeHtml(current.avatar)}" alt="头像">` : ''; $('#pet-dialog').showModal(); }
async function savePet(event) { event.preventDefault(); const form = new FormData(event.target); const current = editingPetId ? state.pets.find(item => item.id === editingPetId) : newPet(); const avatar = $('#avatar-preview').dataset.value || ''; Object.assign(current, { name: String(form.get('name')).trim(), breed: String(form.get('breed')).trim(), sex: String(form.get('sex') || ''), sterilized: String(form.get('sterilized') || ''), birthday: form.get('birthday'), chip: String(form.get('chip') || ''), avatar, avatarPath: '', pendingAvatar: '' }); if (!editingPetId) { state.pets.push(current); state.selectedPetId = current.id; } await save(); $('#pet-dialog').close(); render(); }
function openReminder(kind) { editingReminder = kind; const r = pet().reminders[kind]; const form = $('#reminder-form'); $('#reminder-title').textContent = `${kinds[kind][1]}提醒`; form.elements.interval.value = r.interval; form.elements.last.value = r.last || ''; form.elements.time.value = r.time || '09:00'; $('#reminder-dialog').showModal(); }
async function saveReminder(event) { event.preventDefault(); const form = new FormData(event.target); const r = pet().reminders[editingReminder]; r.interval = Math.max(1, Number(form.get('interval')) || defaults[editingReminder]); r.last = form.get('last'); r.time = form.get('time') || '09:00'; r.calendarAddedFor = ''; await save(); $('#reminder-dialog').close(); render(); }
async function completeReminder(kind) { const current = pet(); const r = current.reminders[kind]; if (!confirm(`确认 ${current.name} 今天已完成${kinds[kind][1]}吗？`)) return; r.last = todayISO(); r.calendarAddedFor = ''; state.records.push({ id: crypto.randomUUID(), petId: current.id, kind, date: `${todayISO()}T${new Date().toTimeString().slice(0,5)}`, weight: null, note: '从提醒中一键完成', photo: '', photoPath: '', pendingPhoto: '' }); await save(); render(); toast(`已完成${kinds[kind][1]}，下次日期已自动计算`); }
async function deleteRecord(id) { const record = state.records.find(item => item.id === id); if (!record || !confirm(`确定删除这条${kindInfo(record.kind)[1]}记录吗？`)) return; state.records = state.records.filter(item => item.id !== id); await save(); render(); }
async function deletePet() { const current = pet(); if (!current || !confirm(`确定删除 ${current.name} 和它的所有记录吗？此操作无法撤销。`)) return; state.records = state.records.filter(r => r.petId !== current.id); state.pets = state.pets.filter(item => item.id !== current.id); state.selectedPetId = state.pets[0]?.id || ''; await save(); render(); }

function fileData(file, max = 1600) { return new Promise(resolve => { if (!file?.size) return resolve(''); const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => { const scale = Math.min(1, max / Math.max(img.width, img.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', .82)); }; img.onerror = () => resolve(reader.result); img.src = reader.result; }; reader.readAsDataURL(file); }); }
function cloudPayload() { const copy = structuredClone(state); copy.records.forEach(record => { delete record.pendingPhoto; if (record.photo?.startsWith('data:')) record.photo = ''; }); copy.pets.forEach(item => { delete item.pendingAvatar; if (item.avatar?.startsWith('data:')) item.avatar = ''; }); return copy; }
function mergeLocalMedia(cloudState, localState) { const localRecords = new Map((localState?.records || []).map(item => [item.id, item])); const localPets = new Map((localState?.pets || []).map(item => [item.id, item])); cloudState.records.forEach(item => { const local = localRecords.get(item.id); if (local?.photo) item.photo = local.photo; }); cloudState.pets.forEach(item => { const local = localPets.get(item.id); if (local?.avatar) item.avatar = local.avatar; }); return cloudState; }
function cloudRef() { return doc(firestore, 'users', cloudUser.uid, 'app', 'pawsnote'); }
function queueCloudSync() { if (!cloudUser || !cloudReady) return; cloudStatus = { tone: 'syncing', text: '正在同步…' }; if (page === 'settings') render(); clearTimeout(cloudSyncTimer); cloudSyncTimer = setTimeout(() => syncCloud(), 650); }
async function syncCloud(manual = false) { if (!cloudUser || !cloudReady) return; cloudStatus = { tone: 'syncing', text: '正在同步…' }; if (page === 'settings') render(); try { await saveLocal(); await setDoc(cloudRef(), { payload: cloudPayload(), clientModifiedAt: state.modifiedAt, updatedAt: serverTimestamp() }); cloudStatus = { tone: 'success', text: '已同步' }; render(); toast(manual ? '云端同步完成' : '资料已自动同步'); } catch (error) { cloudStatus = { tone: 'error', text: '同步失败，请检查网络' }; render(); toast('同步失败，请稍后再试', 'error'); console.warn(error); } }
async function connectCloud(user) {
  cloudUser = user; cloudReady = false; cloudStatus = { tone: 'syncing', text: '正在读取云端资料…' }; storageKey = `user:${user.uid}`;
  let local = await dbGet(`state:${storageKey}`); const hasUserLocal = Boolean(local); const guest = await dbGet('state:guest'); if (!local && guest) local = guest; state = migrate(local || blankState()); render();
  try { const snapshot = await getDoc(cloudRef()); const cloud = snapshot.exists() ? snapshot.data().payload : null; let useLocal = false; if (cloud?.pets) { const migratedCloud = mergeLocalMedia(migrate(cloud), state); useLocal = hasUserLocal && String(state.modifiedAt || '') > String(migratedCloud.modifiedAt || ''); if (!useLocal) state = migratedCloud; } await dbPut(`state:${storageKey}`, state); cloudReady = true; cloudStatus = { tone: 'success', text: cloud ? (useLocal ? '本机资料较新' : '已从云端恢复') : '已创建云端备份' }; render(); if (!cloud || useLocal) await syncCloud(); else toast('云端资料已恢复'); setTimeout(checkDueNotifications, 600); } catch (error) { cloudReady = false; cloudStatus = { tone: 'error', text: '云端暂时不可用' }; render(); toast('云端读取失败，本机资料仍然安全', 'error'); console.warn(error); }
}
async function loginWithGoogle() { try { cloudStatus = { tone: 'syncing', text: '正在打开 Google 登录…' }; render(); await signInWithPopup(auth, googleProvider); } catch (error) { cloudStatus = { tone: 'error', text: '登录失败' }; render(); if (error.code === 'auth/popup-closed-by-user') return; alert(error.code === 'auth/popup-blocked' ? 'Safari 拦截了登录窗口，请允许弹出窗口后重试。' : `Google 登录没有完成：${error.code || '未知原因'}`); } }
async function logout() { await signOut(auth); cloudUser = null; cloudReady = false; cloudStatus = { tone: 'neutral', text: '未登录' }; storageKey = 'guest'; await loadLocal('guest'); page = 'settings'; render(); }
function setupCloud() { onAuthStateChanged(auth, async user => { if (user) await connectCloud(user); else { cloudUser = null; cloudReady = false; cloudStatus = { tone: 'neutral', text: '未登录' }; storageKey = 'guest'; await loadLocal('guest', true); } }); }

function exportData() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); downloadBlob(blob, `PetLog-backup-${todayISO()}.json`); }
async function importData(event) { const file = event.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!Array.isArray(imported.pets) || !Array.isArray(imported.records)) throw new Error('invalid'); if (!confirm('导入会替换当前账号在这台手机上的资料，确定继续吗？')) return; state = migrate(imported); await save(); render(); toast('备份导入完成'); } catch { alert('这不是有效的 PetLog 备份文件。'); } finally { event.target.value = ''; } }
function pad(n) { return String(n).padStart(2, '0'); }
function icsDate(date, time = null) { const d = new Date(date); if (time) { const [h,m] = time.split(':').map(Number); d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0); } return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; }
async function exportCalendar(kindList) {
  const current = pet(); if (!current) return; const events = [];
  kindList.forEach(kind => { const r = current.reminders[kind]; const next = nextDate(r); if (!next) return; const eventStart = new Date(next); const [hour, minute] = (r.time || '09:00').split(':').map(Number); eventStart.setHours(hour, minute, 0, 0); const eventEnd = new Date(eventStart.getTime() + 30 * 60000); events.push(['BEGIN:VEVENT', `UID:${current.id}-${kind}-${next.toISOString().slice(0,10)}@petlog`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(eventStart)}`, `DTEND:${icsDate(eventEnd)}`, `SUMMARY:${current.name} · ${kinds[kind][1]}`, `DESCRIPTION:PetLog 提醒：${current.name} 的${kinds[kind][1]}到期。`, 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:明天需要为 ${current.name} 完成${kinds[kind][1]}`, 'END:VALARM', 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:2 小时后需要为 ${current.name} 完成${kinds[kind][1]}`, 'END:VALARM', 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:现在需要为 ${current.name} 完成${kinds[kind][1]}`, 'END:VALARM', 'END:VEVENT'].join('\r\n')); r.calendarAddedFor = next.toISOString().slice(0,10); });
  if (!events.length) return alert('请先为至少一个提醒填写“上次完成”日期。');
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//PetLog//Pet Care//ZH-CN','CALSCALE:GREGORIAN','METHOD:PUBLISH',...events,'END:VCALENDAR'].join('\r\n'); downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `PetLog-${current.name}-提醒.ics`); await save(); render(); toast('日历文件已生成，请用系统日历打开');
}
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function enableNotifications() { if (!('Notification' in window)) return alert('当前浏览器不支持通知，请使用“导出到日历”。'); const permission = await Notification.requestPermission(); state.notificationEnabled = permission === 'granted'; await save(); render(); if (permission === 'granted') { toast('到期检查已开启'); checkDueNotifications(true); } else alert('通知权限没有开启。你仍可使用日历提醒。'); }
async function checkDueNotifications(force = false) { if (!state.notificationEnabled || Notification.permission !== 'granted' || !pet()) return; const key = `petlog-notified-${pet().id}-${todayISO()}`; if (!force && localStorage.getItem(key)) return; const due = careKinds.filter(kind => { const days = daysUntil(nextDate(pet().reminders[kind])); return days !== null && days <= 0; }); if (!due.length) return; const registration = await navigator.serviceWorker?.ready; const body = due.map(kind => `${kinds[kind][1]}${daysUntil(nextDate(pet().reminders[kind])) < 0 ? '已逾期' : '今天到期'}`).join('、'); if (registration) registration.showNotification(`${pet().name} 有 ${due.length} 项护理提醒`, { body, icon: './icon-192.png', badge: './icon-192.png', tag: `petlog-${pet().id}-${todayISO()}` }); else new Notification('PetLog 提醒', { body }); localStorage.setItem(key, '1'); }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
setupDialogs();
loadLocal('guest', true).then(() => { setupCloud(); setTimeout(checkDueNotifications, 1500); });
