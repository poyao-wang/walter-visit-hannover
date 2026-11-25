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

function renderTimeline(events, updated) {
  const el = document.getElementById('timeline');
  const byDay = {};
  for (const e of events) {
    const d = evDate(e);
    const key = isNaN(d) ? 'other'
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    (byDay[key] = byDay[key] || []).push(e);
  }
  el.innerHTML = '';
  const active = document.querySelector('.day-tab.active').dataset.day;
  const list = (byDay[active] || []).sort((a,b) => evDate(a) - evDate(b));
  const now = new Date();
  if (!list.length) { el.innerHTML = '<p class="src-note">這天沒有排程。</p>'; return; }
  for (const e of list) {
    const s = evDate(e), t = evEnd(e);
    const hm = x => `${String(x.getHours()).padStart(2,'0')}:${String(x.getMinutes()).padStart(2,'0')}`;
    const allDay = typeof e.start === 'string' ? !e.start.includes('T') : !e.start.dateTime;
    const dur = (!allDay && !isNaN(t)) ? `${Math.round((t-s)/60000)}m` : '';
    const past = t < now, nowNow = s <= now && now <= t;
    const div = document.createElement('div');
    div.className = 'ev' + (past ? ' past' : '') + (nowNow ? ' now' : '');
    div.innerHTML = `
      <div class="time">${allDay ? '全天' : hm(s)}${dur ? `<span class="dur">${dur}</span>` : ''}</div>
      <div class="body"><div class="t">${esc(e.summary || '')}</div>
      ${e.description ? `<div class="d">${esc(e.description)}</div>` : ''}</div>`;
    el.appendChild(div);
  }
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

function initMap() {
  MAP = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 52.3775, lng: 9.7360 },
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
  });
  loadPlaces();
}

async function loadPlaces() {
  const r = await fetch('places.json');
  const data = await r.json();
  PLACES = data.places;
  addMarkers();
  renderPlaceList();
}

const STATUS_COLOR = { anchor: '#4fc3f7', option: '#ffb74d', info: '#81c784' };

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
        fillColor: STATUS_COLOR[p.status] || '#ffffff',
        fillOpacity: .95,
        strokeColor: '#101418',
        strokeWeight: 1.5,
        scale: 14,
      },
    });
    const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
    const iw = new google.maps.InfoWindow({
      content: `<div class="iw"><div class="iw-name">${esc(p.name)}</div>` +
        `<div class="iw-desc">${esc(p.desc)}</div>` +
        `<div class="iw-desc" style="color:#666;margin-top:4px">${esc(p.address || '')}</div>` +
        `<div style="margin-top:6px"><a href="${dirUrl}" target="_blank" rel="noopener">🧭 導航</a></div></div>`,
    });
    m.addListener('click', () => { iw.open({ anchor: m, map: MAP }); });
    MARKERS.push(m);
    if (p.status !== 'info') bounds.extend(m.getPosition());
  }
  if (!bounds.isEmpty()) MAP.fitBounds(bounds, 40);
}

function renderPlaceList() {
  const ul = document.getElementById('place-list');
  ul.innerHTML = '';
  for (const p of PLACES) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div><div class="name"><i class="dot ${p.status}" style="margin-right:6px"></i>${esc(p.name)}</div>
      <div class="cat">${CAT_LABEL[p.category] || p.category}</div></div>
      <div class="go">導航 ↗</div>`;
    li.addEventListener('click', () => {
      // center + open info window
      const m = MARKERS.find(mk => mk.getTitle() === p.name);
      if (m) {
        MAP.panTo(m.getPosition());
        MAP.setZoom(Math.max(MAP.getZoom(), 15));
        new google.maps.InfoWindow({
          content: m._iwContent || `<div class="iw"><div class="iw-name">${esc(p.name)}</div></div>`,
        }).open({ anchor: m, map: MAP });
      }
    });
    ul.appendChild(li);
  }
}

/* ================= util ================= */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

loadEvents();
window.initMap = initMap;
