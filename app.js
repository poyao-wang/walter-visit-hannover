/* walter-visit-hannover v1.0.0 */
'use strict';

const CAL_ID = '8e5fd00d1c88e5073cbf3d08a8824935a87b058d7a7f819609b8d61ae250c6c7@group.calendar.google.com';
let PLACES = [];
let MAP, MARKERS = [];

/* ================= Calendar / timeline ================= */
async function loadEvents() {
  // live fetch from public Google Calendar (no key needed: public calendar JSON feed)
  const fmt = d => d.toISOString().replace(/\.\d{3}/, '');
  const now = new Date();
  const min = new Date(2026, 10, 27);           // 11/27 00:00 local
  const max = new Date(2026, 11, 2);            // 12/02 00:00 local
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}` +
              `/events?singleEvents=true&orderBy=startTime` +
              `&timeMin=${encodeURIComponent(fmt(min))}&timeMax=${encodeURIComponent(fmt(max))}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    renderTimeline(data.items || [], data.updated);
    return;
  } catch (e) {
    console.warn('live fetch failed, fallback to baked events.json:', e);
  }
  // fallback: baked copy
  const r2 = await fetch('events.json');
  const data2 = await r2.json();
  renderTimeline(data2.events, data2.updated);
}

function _d(v) { return new Date(typeof v === 'string' ? v : (v && (v.dateTime || v.date))); }
function evDate(e) { return _d(e.start); }
function evEnd(e)  { return _d(e.end); }

const PX_PER_HOUR = 64;          // true-scale: 1 hour = 64px
const DAY_END_H = 24;
let DAY_START_H = 7;             // dynamic: extends up if events start earlier (e.g. 01:00 sleep-in)

function renderTimeline(events, updated) {
  const el = document.getElementById('timeline');
  const byDay = {};
  for (const e of events) {
    const d = evDate(e);
    const key = isNaN(d) ? 'other'
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    (byDay[key] = byDay[key] || []).push(e);
  }
  const active = document.querySelector('.day-tab.active').dataset.day;
  const list = (byDay[active] || []).sort((a,b) => evDate(a) - evDate(b));
  const now = new Date();
  const hm = x => `${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;

  // dynamic grid start: earliest event hour (not before 00:00), default 07:00
  DAY_START_H = 7;
  for (const e of list) {
    const d = evDate(e);
    if (!isNaN(d) && d.getHours() < DAY_START_H) DAY_START_H = d.getHours();
  }

  // ---- hour grid (true scale) ----
  let grid = '';
  for (let h = DAY_START_H; h <= DAY_END_H; h++) {
    grid += `<div class="hour-row" style="top:${(h-DAY_START_H)*PX_PER_HOUR}px">
      <span class="hour-label">${String(h).padStart(2,'0')}:00</span><span class="hour-line"></span></div>`;
  }
  const totalH = (DAY_END_H - DAY_START_H) * PX_PER_HOUR;

  // ---- events positioned by real time ----
  let evHtml = '';
  for (const e of list) {
    const s = evDate(e), t = evEnd(e);
    const allDay = typeof e.start === 'string' ? !e.start.includes('T') : !e.start.dateTime;
    const past = t < now, nowNow = s <= now && now <= t;
    const top = ((s.getHours() + s.getMinutes()/60) - DAY_START_H) * PX_PER_HOUR;
    const endH = isNaN(t) ? s.getHours() + 1 : t.getHours() + t.getMinutes()/60;
    const mins = (Math.min(endH, DAY_END_H) - Math.max(s.getHours() + s.getMinutes()/60, DAY_START_H)) * 60;
    const height = Math.max(34, mins * PX_PER_HOUR / 60 - 4);
    // short events (<45min): title+time only; description would clip
    const showDesc = mins >= 75 && e.description;
    evHtml += `<div class="ev${past ? ' past' : ''}${nowNow ? ' now' : ''}"
      style="top:${top}px;height:${height}px">
      <div class="t${mins < 45 ? ' compact' : ''}">${allDay ? '全天 ' : ''}${esc(e.summary || '')}</div>
      ${!allDay && !isNaN(t) && mins >= 45 ? `<div class="time">${hm(s)}–${hm(t)}</div>` : ''}
      ${showDesc ? `<div class="d">${esc(e.description)}</div>` : ''}</div>`;
  }

  // ---- red now-line if today ----
  const nowKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  let nowLine = '';
  if (nowKey === active) {
    const ny = ((now.getHours() + now.getMinutes()/60) - DAY_START_H) * PX_PER_HOUR;
    if (ny >= 0 && ny <= totalH) nowLine = `<div class="now-line" style="top:${ny}px"></div>`;
  }

  el.innerHTML = `<div class="day-grid" style="height:${totalH}px">${grid}${nowLine}${evHtml}</div>`;

  // scroll to first upcoming event (or now-line)
  const first = el.querySelector('.ev:not(.past)') || el.querySelector('.now-line');
  if (first) el.scrollTop = Math.max(0, first.offsetTop - 70);

  const u = updated ? new Date(updated) : new Date();
  document.getElementById('cal-updated').textContent =
    `來源：walter-visit-2026-11-28 公開日曆（即時抓取）· 更新 ${u.toLocaleString('zh-TW')}`;
}

document.querySelectorAll('.day-tab').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadEvents();
  }));

/* ================= Map ================= */
const CAT_LABEL = {lodging:'住宿', transport:'交通', food:'吃', market:'市集', shopping:'採買', sight:'景點', info:'航班'};
let OPEN_IW = null;                       // only one info window open at a time
function closeIW() { if (OPEN_IW) { OPEN_IW.close(); OPEN_IW = null; } }

function initMap() {
  MAP = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 52.3775, lng: 9.7360 },
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    gestureHandling: 'greedy',   // one-finger drag pans on touch; plain wheel zooms on desktop (no modifier)
  });
  loadPlaces();
}

/* ---- my location ---- */
let USER_MARKER = null, USER_ACCURACY = null, FOLLOW = false;
let FOLLOW_LISTENER = null;

function showMyLocation() {
  const btn = document.getElementById('loc-btn');
  if (!navigator.geolocation) { btn.textContent = '❌ 裝置不支援定位'; return; }
  // toggle OFF: stop following immediately — NO new geolocation request
  if (FOLLOW) {
    FOLLOW = false;
    if (FOLLOW_LISTENER) { navigator.geolocation.clearWatch(FOLLOW_LISTENER); FOLLOW_LISTENER = null; }
    btn.textContent = '📍 我在哪裡';
    return;
  }
  // toggle ON: acquire position once, then follow
  btn.textContent = '⏳ 定位中…';
  navigator.geolocation.getCurrentPosition(pos => {
    const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!USER_MARKER) {
      USER_MARKER = new google.maps.Marker({
        position: me, map: MAP, title: '你在這裡',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#e53935', fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 3, scale: 12,
        },
        zIndex: 999,
      });
      USER_ACCURACY = new google.maps.Circle({
        map: MAP, center: me, radius: pos.coords.accuracy,
        fillColor: '#e53935', fillOpacity: .15, strokeColor: '#e53935', strokeOpacity: .25, strokeWeight: 1,
      });
    } else {
      USER_MARKER.setPosition(me);
      USER_ACCURACY.setCenter(me);
      USER_ACCURACY.setRadius(pos.coords.accuracy);
    }
    MAP.panTo(me);
    if (MAP.getZoom() < 15) MAP.setZoom(16);
    FOLLOW = true;
    btn.textContent = '📍 跟隨中（點一下停）';
    FOLLOW_LISTENER = navigator.geolocation.watchPosition(
      p2 => {
        const m2 = { lat: p2.coords.latitude, lng: p2.coords.longitude };
        USER_MARKER.setPosition(m2);
        USER_ACCURACY.setCenter(m2);
        USER_ACCURACY.setRadius(p2.coords.accuracy);
        MAP.panTo(m2);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }, err => {
    btn.textContent = '⚠️ 定位失敗（權限？）';
    console.warn('geolocation error:', err);
  }, { enableHighAccuracy: true, timeout: 10000 });
}

async function loadPlaces() {
  const r = await fetch('places.json');
  const data = await r.json();
  PLACES = data.places;
  addMarkers();
  renderPlaceList();
}

// category colors: bright for map markers, same hue darkened for list row background
const CAT_COLOR = {
  lodging:  { dot: '#42a5f5', bg: '#1c2f40' },   // 住宿 blue
  transport:{ dot: '#26c6a2', bg: '#173831' },   // 交通 teal
  food:     { dot: '#ff7043', bg: '#3d241c' },   // 吃 orange
  sight:    { dot: '#ab7df6', bg: '#2a2140' },   // 景點 purple
  shopping: { dot: '#ffee58', bg: '#3a3a17' },   // 採買 yellow
};
// label letter color: dark text on bright dots
const dotLabelColor = c => (c === '#ffee58' ? '#101418' : '#0d1117');

function addMarkers() {
  const bounds = new google.maps.LatLngBounds();
  for (const p of PLACES) {
    const m = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      map: MAP,
      title: p.name,
      label: { text: p.name[0], color: '#101418', fontSize: '11px', fontWeight: '700' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: (CAT_COLOR[p.category] || {dot:'#ffffff'}).dot,
        fillOpacity: .95,
        strokeColor: '#101418',
        strokeWeight: 1.5,
        scale: 14,
      },
    });
    const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    // p.link = real Google Maps place URL (with feature id) — opens the full POI card, no ambiguity
    const viewUrl = p.link ||
      `https://www.google.com/maps/place/${encodeURIComponent(p.query || p.name.split('（')[0].trim())}/@${p.lat},${p.lng},17z`;
    const iw = new google.maps.InfoWindow({
      content: `<div class="iw"><div class="iw-name">${esc(p.name)}</div>` +
        `<div class="iw-desc">${esc(p.desc)}</div>` +
        `<div class="iw-desc" style="color:#666;margin-top:4px">${esc(p.address || '')}</div>` +
        `<div style="margin-top:6px;display:flex;gap:14px">` +
        `<a href="${dirUrl}" target="_blank" rel="noopener">🧭 導航</a>` +
        `<a href="${viewUrl}" target="_blank" rel="noopener">🗺️ 在 Google Maps 開啟</a></div></div>`,
    });
    m._iw = iw;                                   // full info window (desc+address+nav) shared by map & list
    m.addListener('click', () => { closeIW(); iw.anchor = m; iw.open({ anchor: m, map: MAP }); OPEN_IW = iw; });
    iw.addListener('closeclick', () => { if (OPEN_IW === iw) OPEN_IW = null; });
    MARKERS.push(m);
    if (p.status !== 'info') bounds.extend(m.getPosition());
  }
  if (!bounds.isEmpty()) MAP.fitBounds(bounds, 40);
}

const CAT_ORDER = ['lodging', 'transport', 'food', 'sight', 'shopping'];
const CAT_ICON  = {lodging:'🏠', transport:'✈️', food:'🍽️', sight:'🎡', shopping:'🛒'};

function renderPlaceList() {
  const ul = document.getElementById('place-list');
  ul.innerHTML = '';
  for (const cat of CAT_ORDER) {
    const group = PLACES.filter(p => p.category === cat);
    if (!group.length) continue;
    const h = document.createElement('li');
    h.className = 'group-head';
    h.innerHTML = `
      <input type="checkbox" class="group-check" data-cat="${cat}" checked>
      <span>${CAT_ICON[cat] || ''} ${CAT_LABEL[cat] || cat}（${group.length}）</span>`;
    const gcb = h.querySelector('.group-check');
    gcb.addEventListener('click', ev => {
      ev.stopPropagation();
      document.querySelectorAll(`.place-check[data-id]`).forEach(cb => {
        const pl = PLACES.find(x => x.id === cb.dataset.id);
        if (pl && pl.category === cat && cb.checked !== gcb.checked) {
          cb.checked = gcb.checked;
          setPlaceVisible(pl.id, gcb.checked);
        }
      });
    });
    ul.appendChild(h);
    for (const p of group) {
      const li = document.createElement('li');
      const catBg = (CAT_COLOR[p.category] || {bg:'#1a2028'}).bg;
      li.style.background = catBg;
      li.innerHTML = `
        <input type="checkbox" class="place-check" data-id="${p.id}" checked>
        <div><div class="name"><i class="dot ${p.status}" style="margin-right:6px"></i>${esc(p.name)}</div></div>
        <div class="go">導航 ↗</div>`;
      const cb = li.querySelector('.place-check');
      cb.addEventListener('click', ev => {
        ev.stopPropagation();
        setPlaceVisible(p.id, cb.checked);
      });
      li.addEventListener('click', () => {
        const m = MARKERS.find(mk => mk.getTitle() === p.name);
        if (m && m._iw) {
          document.getElementById('map-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
          MAP.panTo(m.getPosition());
          MAP.setZoom(Math.max(MAP.getZoom(), 15));
          closeIW();
          m._iw.anchor = m;
          m._iw.open({ anchor: m, map: MAP });
          OPEN_IW = m._iw;
        }
      });
      ul.appendChild(li);
    }
  }
}

function setPlaceVisible(id, visible) {
  const p = PLACES.find(x => x.id === id);
  if (!p) return;
  const m = MARKERS.find(mk => mk.getTitle() === p.name);
  if (m) {
    m.setMap(visible ? MAP : null);
    if (!visible && OPEN_IW && OPEN_IW.anchor === m) closeIW();
  }
}

/* ================= util ================= */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

loadEvents();
window.initMap = initMap;

const LOC_BTN = document.getElementById('loc-btn');
if (LOC_BTN) LOC_BTN.addEventListener('click', showMyLocation);

/* show-all / hide-all */
function setAllPlaces(visible) {
  document.querySelectorAll('.place-check').forEach(cb => {
    cb.checked = visible;
    setPlaceVisible(cb.dataset.id, visible);
  });
  document.querySelectorAll('.group-check').forEach(gb => { gb.checked = visible; });
}
const SHOW_BTN = document.getElementById('show-all');
const HIDE_BTN = document.getElementById('hide-all');
if (SHOW_BTN) SHOW_BTN.addEventListener('click', () => setAllPlaces(true));
if (HIDE_BTN) HIDE_BTN.addEventListener('click', () => setAllPlaces(false));

/* global nav: active state follows scroll position */
const NAV_BTNS = [...document.querySelectorAll('.nav-btn')];
function updateNav() {
  const y = window.scrollY + 160;
  let active = 'timeline-section';
  for (const b of NAV_BTNS) {
    const sec = document.getElementById(b.dataset.target);
    if (sec && sec.offsetTop <= y) active = b.dataset.target;
  }
  NAV_BTNS.forEach(b => b.classList.toggle('active', b.dataset.target === active));
}
window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

/* collapse topbar title row on scroll — with hysteresis to prevent flicker at the threshold */
const TOPBAR = document.querySelector('.topbar');
let TOPBAR_MINI = false;
function updateTopbar() {
  const y = window.scrollY;
  // collapse beyond 90px; expand back only below 45px — the 45px dead-zone kills the boundary bounce
  if (!TOPBAR_MINI && y > 90) { TOPBAR_MINI = true; TOPBAR.classList.add('mini'); }
  else if (TOPBAR_MINI && y < 45) { TOPBAR_MINI = false; TOPBAR.classList.remove('mini'); }
}
window.addEventListener('scroll', updateTopbar, { passive: true });
updateTopbar();
