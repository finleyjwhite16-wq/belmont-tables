(function () {
  'use strict';
  var S = { me: null, teams: [], sessions: [], signups: [], students: [], weeks: 8, loaded: false, authMode: 'in',
    tab: 'days', filter: 'all', busy: {}, confirm: null, now: new Date(), editTeam: null, tempPw: {}, installEvt: null };
  var view = document.getElementById('view'), tabsEl = document.getElementById('tabs'), whoEl = document.getElementById('who'), toastEl = document.getElementById('toast');
  var TC = ['var(--t0)', 'var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ---------- tiny helpers ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i]; if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(x); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function toast(msg) { toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 3400); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function parse(o, t) { var d = o.date.split('-').map(Number), tm = (t || o.start).split(':').map(Number); return new Date(d[0], d[1] - 1, d[2], tm[0], tm[1]); }
  function fmtT(t) { var a = t.split(':').map(Number), ap = a[0] >= 12 ? 'PM' : 'AM', hh = a[0] % 12 || 12; return hh + ':' + p2(a[1]) + ' ' + ap; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function dayDiff(d) { return Math.round((startOfDay(d) - startOfDay(S.now)) / 864e5); }
  function hours(o) { return (parse(o, o.end) - parse(o)) / 36e5; }
  function fmtH(x) { return String(Math.round(x * 10) / 10); }
  function byNo(a, b) { return (a.teamNo || 99) - (b.teamNo || 99); }
  function teamById(id) { return S.teams.filter(function (t) { return t.id === id; })[0]; }
  function famName(t) { return 'The ' + t.family + ' family'; }
  function q(id) { return document.getElementById(id); }
  function isCoord() { return S.me && S.me.role === 'coordinator'; }

  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : (method === 'GET' ? {} : { 'Content-Type': 'application/json' }), body: method === 'GET' ? undefined : JSON.stringify(body || {}), credentials: 'same-origin' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401 && url !== '/api/login') { S.me = null; S.loaded = true; render(); }
          if (!r.ok) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; throw e; }
          return j;
        });
      }, function () { throw new Error('You appear to be offline. Try again when you have a connection.'); });
  }
  function load() {
    return api('GET', '/api/state').then(function (s) {
      S.me = s.me; S.teams = s.teams; S.sessions = s.sessions; S.signups = s.signups; S.students = s.students || []; S.weeks = s.weeks; S.loaded = true;
      render(); checkNotify();
    }).catch(function (e) { S.loaded = true; if (e.status !== 401) toast(e.message); render(); });
  }
  function act(key, fn, okMsg) {
    if (S.busy[key]) return; S.busy[key] = 1; render();
    return Promise.resolve().then(fn).then(function () { if (okMsg) toast(okMsg); return load(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { delete S.busy[key]; render(); });
  }

  /* ---------- schedule logic ---------- */
  function occurrences() {
    var out = [], base = startOfDay(S.now);
    S.sessions.forEach(function (se) {
      var skip = se.skip || [];
      for (var i = 0; i < S.weeks * 7; i++) {
        var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        if (d.getDay() !== se.dow || skip.indexOf(ymd(d)) > -1) continue;
        var o = { key: se.id + '_' + ymd(d), sid: se.id, title: se.title, date: ymd(d), start: se.start, end: se.end, dow: se.dow };
        if (parse(o, o.end) > S.now) out.push(o);
      }
    });
    return out.sort(function (a, b) { return parse(a) - parse(b); });
  }
  function sigsFor(o, team) { return S.signups.filter(function (s) { return s.sessionId === o.sid && s.date === o.date && (!team || s.teamId === team); }); }
  function joined(o) { return S.signups.some(function (s) { return s.sessionId === o.sid && s.date === o.date && s.userId === S.me.id; }); }
  function myShifts(occ) { return occ.filter(joined); }
  function pastServed() {
    var sess = {}; S.sessions.forEach(function (s) { sess[s.id] = s; });
    return S.signups.filter(function (s) { var se = sess[s.sessionId]; return s.userId === S.me.id && se && parse({ date: s.date, start: se.start }, se.end) <= S.now; })
      .reduce(function (a, s) { var se = sess[s.sessionId]; return a + hours({ date: s.date, start: se.start, end: se.end }); }, 0);
  }
  function when(o) {
    var s = parse(o), d = dayDiff(s);
    if (d === 0) { var m = Math.round((s - S.now) / 6e4); if (m > 0) return m < 60 ? 'in ' + m + ' min' : 'today, in ' + Math.round(m / 60) + ' h'; return 'happening now'; }
    return d === 1 ? 'tomorrow' : 'in ' + d + ' days';
  }
  function dropoff(t, o) { if (!t) return ''; return (t.dropoffs && t.dropoffs[parse(o).getDay()]) || t.dropoff || ''; }

  /* ---------- calendar + reminders ---------- */
  function icsText(o, t) {
    function loc(d) { return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + 'T' + p2(d.getHours()) + p2(d.getMinutes()) + '00'; }
    function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    var n = new Date(), stamp = n.getUTCFullYear() + p2(n.getUTCMonth() + 1) + p2(n.getUTCDate()) + 'T' + p2(n.getUTCHours()) + p2(n.getUTCMinutes()) + p2(n.getUTCSeconds()) + 'Z';
    var d = dropoff(t, o);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Belmont Tables//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + o.key + '-' + S.me.id + '@belmonttables', 'DTSTAMP:' + stamp,
      'DTSTART:' + loc(parse(o)), 'DTEND:' + loc(parse(o, o.end)),
      'SUMMARY:' + esc('Belmont Tables: ' + o.title), 'LOCATION:' + esc(d), 'DESCRIPTION:' + esc(d ? 'Drop-off: ' + d : 'Belmont Tables volunteering'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Volunteering tomorrow', 'TRIGGER:-P1D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Volunteering in 1 hour', 'TRIGGER:-PT1H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function downloadICS(o, t) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([icsText(o, t)], { type: 'text/calendar' }));
    a.download = 'belmont-tables-' + o.date + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function googleLink(o, t) {
    function g(d) { return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + 'T' + p2(d.getHours()) + p2(d.getMinutes()) + '00'; }
    var d = dropoff(t, o);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Belmont Tables: ' + o.title) + '&dates=' + g(parse(o)) + '/' + g(parse(o, o.end)) +
      '&details=' + encodeURIComponent(d ? 'Drop-off: ' + d : 'Belmont Tables volunteering') + '&location=' + encodeURIComponent(d);
  }
  function calLinks(o, t) {
    return h('div', { class: 'cal' },
      h('a', { href: '#', onclick: function (e) { e.preventDefault(); downloadICS(o, t); }, text: 'Add to calendar (.ics, with reminders)' }),
      h('a', { href: googleLink(o, t), target: '_blank', rel: 'noopener', text: 'Google Calendar' }));
  }
  function notifyOK() { return 'Notification' in window && 'serviceWorker' in navigator; }
  function enableNotify() {
    if (!notifyOK()) return toast('This browser does not support notifications.');
    Notification.requestPermission().then(function (p) { toast(p === 'granted' ? 'Reminders are on for this device.' : 'Notifications are blocked. Turn them on in your browser settings.'); if (p === 'granted') checkNotify(); render(); });
  }
  function checkNotify() {
    if (!S.me || !notifyOK() || Notification.permission !== 'granted') return;
    var t = teamById(S.me.teamId), now = new Date();
    myShifts(occurrences()).forEach(function (o) {
      var ms = parse(o) - now; if (ms < 0 || ms > 24 * 36e5) return;
      var k = 'notified:' + S.me.id + ':' + o.key; try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { return; }
      var d = dropoff(t, o);
      navigator.serviceWorker.ready.then(function (r) {
        r.showNotification((dayDiff(parse(o)) === 0 ? 'Today: ' : 'Tomorrow: ') + o.title, { body: fmtT(o.start) + ' \u2013 ' + fmtT(o.end) + (d ? '. Drop-off: ' + d : ''), icon: '/icons/icon-192.png', tag: o.key });
      });
    });
  }

  /* ---------- auth ---------- */
  function viewAuth() {
    var reg = S.authMode === 'up', err = h('div', { class: 'err', role: 'alert', style: 'grid-column:auto;min-height:1.2em' });
    var form = h('form', { class: 'form', novalidate: true, onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var body = { email: q('a-email').value, password: q('a-pw').value };
      if (reg) body.name = q('a-name').value;
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      api('POST', reg ? '/api/register' : '/api/login', body).then(load).catch(function (ex) { err.textContent = ex.message; }).then(function () { btn.disabled = false; });
    } },
      reg && h('div', { class: 'f' }, h('label', { for: 'a-name', text: 'Your name' }), h('input', { id: 'a-name', type: 'text', autocomplete: 'name', maxlength: '60' })),
      h('div', { class: 'f' }, h('label', { for: 'a-email', text: 'School email' }), h('input', { id: 'a-email', type: 'email', autocomplete: 'email', inputmode: 'email' })),
      h('div', { class: 'f' }, h('label', { for: 'a-pw', text: reg ? 'Choose a password (8+ characters)' : 'Password' }), h('input', { id: 'a-pw', type: 'password', autocomplete: reg ? 'new-password' : 'current-password' })),
      err, h('button', { class: 'btn', type: 'submit', text: reg ? 'Create account' : 'Sign in' }));
    return [h('div', { class: 'auth' },
      h('h1', { text: 'Volunteer with Belmont Tables' }),
      h('p', { class: 'sub', text: 'Sign in to see your family and choose your volunteer days.' }),
      h('div', { class: 'card' },
        h('div', { class: 'seg', role: 'group' },
          h('button', { 'aria-pressed': String(!reg), onclick: function () { S.authMode = 'in'; render(); }, text: 'Sign in' }),
          h('button', { 'aria-pressed': String(reg), onclick: function () { S.authMode = 'up'; render(); }, text: 'Create account' })),
        form))];
  }

  /* ---------- student views ---------- */
  function familyCard(t) {
    var dl = h('dl', { class: 'facts' });
    function add(k, v) { if (v) dl.appendChild(h('div', {}, h('dt', { text: k }), h('dd', { text: v }))); }
    add('Family size', t.size ? t.size + ' people' : '');
    add('Dietary & allergies', t.dietary);
    Object.keys(t.dropoffs || {}).sort().forEach(function (d) { add(DOWL[d] + ' drop-off', t.dropoffs[d]); });
    add('Drop-off', t.dropoff);
    add('Notes', t.notes);
    return h('section', { class: 'family', 'aria-label': 'Your family' },
      h('div', { class: 'head' }, h('i', { style: '--c:' + TC[(t.color || 0) % 6] }), h('h2', { text: famName(t) }), t.teamNo ? h('span', { class: 'pill', text: 'Table Team ' + t.teamNo }) : null), dl);
  }
  function occRow(o, t) {
    var me = joined(o), mates = sigsFor(o, t && t.id).filter(function (s) { return s.userId !== S.me.id; }), d = parse(o), days = dayDiff(d), dp = dropoff(t, o);
    var btn = me ? h('button', { class: 'btn ghost sm', disabled: !!S.busy['s' + o.key], onclick: function () { act('s' + o.key, function () { return api('POST', '/api/signups/remove', { sessionId: o.sid, date: o.date }); }, 'Signup cancelled'); }, text: 'Cancel' })
      : h('button', { class: 'btn', disabled: !!S.busy['s' + o.key], onclick: function () { act('s' + o.key, function () { return api('POST', '/api/signups', { sessionId: o.sid, date: o.date }); }, 'You\u2019re signed up for ' + DOWL[o.dow] + ', ' + MON[d.getMonth()] + ' ' + d.getDate()); }, text: 'Sign up' });
    var who = []; if (me) who.push('You'); mates.forEach(function (s) { who.push(s.name); });
    return h('article', { class: 'opp' + (me ? ' mine' : '') },
      h('div', { class: 'date' }, h('span', { class: 'dow', text: DOW[d.getDay()] }), h('span', { class: 'day', text: String(d.getDate()) }), h('span', { class: 'mon', text: MON[d.getMonth()] })),
      h('div', { class: 'main' },
        h('h3', { text: o.title }),
        h('div', { class: 'meta' }, h('span', { class: 't', text: fmtT(o.start) + ' \u2013 ' + fmtT(o.end) })),
        dp ? h('p', { class: 'drop' }, h('b', { text: 'Drop-off' }), dp) : null,
        who.length ? h('div', { class: 'roster' }, who.map(function (w) { return h('span', { class: 'who-chip', text: w }); })) : null,
        me ? h('div', { class: 'meta', style: 'margin-top:6px' }, h('span', { style: 'color:var(--pine);font-weight:700', text: 'You\u2019re in \u00b7 ' + when(o) })) : null,
        me ? calLinks(o, t) : null),
      h('div', { class: 'act' }, (!me && !mates.length && days <= 7) ? h('span', { class: 'need', text: 'No one yet' }) : null, btn));
  }
  function weekLabel(d) {
    var s = startOfDay(d); s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
    var t = startOfDay(S.now); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    var w = Math.round((s - t) / 6048e5);
    if (w <= 0) return 'This week'; if (w === 1) return 'Next week';
    return 'Week of ' + MON[s.getMonth()] + ' ' + s.getDate();
  }
  function reminder(occ) {
    var up = myShifts(occ); if (!up.length) return null;
    var o = up[0], d = dayDiff(parse(o)), soon = d <= 1;
    return h('div', { class: 'remind', role: 'note' },
      h('div', { class: 'big', text: soon ? (d === 0 ? 'Today' : 'Tomorrow') : when(o).replace('in ', '') }),
      h('div', { class: 'txt' }, h('b', { text: (soon ? 'Reminder: ' : 'Next shift: ') + o.title }), DOWL[o.dow] + ', ' + MON[parse(o).getMonth()] + ' ' + parse(o).getDate() + ' \u00b7 ' + fmtT(o.start) + ' \u2013 ' + fmtT(o.end)),
      S.tab !== 'mine' ? h('a', { href: '#', onclick: function (e) { e.preventDefault(); S.tab = 'mine'; render(); window.scrollTo(0, 0); }, text: 'See all my shifts' }) : null);
  }
  function notifyBanner() {
    if (!notifyOK() || Notification.permission !== 'default') return null;
    return h('div', { class: 'banner' }, h('span', { text: 'Get a phone notification the day before and the day of each shift.' }), h('button', { class: 'btn sm', onclick: enableNotify, text: 'Turn on reminders' }));
  }
  function waiting() {
    return [h('h1', { text: 'You\u2019re almost set' }),
      h('p', { class: 'sub', text: 'A coordinator will assign you to a Table Team soon. When they do, your family and volunteer days will show up here.' }),
      h('div', { class: 'empty' }, h('p', { text: 'Signed in as ' + S.me.name + '. Check back later.' }), h('button', { class: 'btn ghost', onclick: load, text: 'Check again' }))];
  }
  function viewDays() {
    var t = teamById(S.me.teamId);
    if (!t) return isCoord() ? [h('h1', { text: 'Sign up for days' }), h('p', { class: 'sub', text: 'You aren\u2019t on a family yourself. To try signing up, assign yourself to one in the Coordinator tab.' })] : waiting();
    var occ = occurrences(), f = [];
    f.push(h('h1', { text: 'Sign up for your days' }));
    f.push(h('p', { class: 'sub', text: 'Choose the days you can volunteer for ' + famName(t) + '. Signed-up days show up under My shifts with reminders.' }));
    f.push(familyCard(t));
    var r = reminder(occ); if (r) f.push(r);
    var nb = notifyBanner(); if (nb) f.push(nb);
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter days' });
    chips.appendChild(h('button', { class: 'chip', 'aria-pressed': String(S.filter === 'all'), onclick: function () { S.filter = 'all'; render(); }, text: 'All days' }));
    S.sessions.forEach(function (se) { chips.appendChild(h('button', { class: 'chip', 'aria-pressed': String(S.filter === se.id), onclick: function () { S.filter = se.id; render(); }, text: DOWL[se.dow] + 's \u00b7 ' + se.title.replace(/ volunteering$/i, '') })); });
    f.push(chips);
    if (S.sessions.length) {
      var quick = h('div', { class: 'quick' }, 'Quick sign-up:');
      S.sessions.forEach(function (se) {
        var todo = occ.filter(function (o) { return o.sid === se.id && !joined(o); });
        quick.appendChild(h('button', { class: 'btn ghost sm', disabled: !todo.length || !!S.busy['all' + se.id], onclick: function () {
          act('all' + se.id, function () { return api('POST', '/api/signups', { sessionId: se.id, dates: todo.map(function (o) { return o.date; }) }); }, 'Signed up for ' + todo.length + ' days'); },
          text: todo.length ? 'Every ' + DOWL[se.dow] + ' (' + todo.length + ')' : 'All ' + DOWL[se.dow] + 's taken' }));
      });
      f.push(quick);
    }
    var list = occ.filter(function (o) { return S.filter === 'all' || o.sid === S.filter; });
    if (!list.length) f.push(h('div', { class: 'empty', text: 'No volunteer days are scheduled yet.' }));
    var last = null, box = null;
    list.forEach(function (o) {
      var lb = weekLabel(parse(o));
      if (lb !== last) { last = lb; box = h('div', { class: 'list' }); f.push(h('section', { class: 'week' }, h('span', { class: 'eyebrow', text: lb }), box)); }
      box.appendChild(occRow(o, t));
    });
    return f;
  }
  function viewMine() {
    var t = teamById(S.me.teamId), occ = occurrences(), up = myShifts(occ);
    var f = [h('h1', { text: 'My shifts' }), h('p', { class: 'sub', text: 'Your signed-up days with a countdown. Add one to your calendar to get a reminder from your phone too.' })];
    f.push(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', { text: String(up.length) }), h('span', { text: 'upcoming days' })),
      h('div', { class: 'stat' }, h('b', { text: fmtH(up.reduce(function (a, o) { return a + hours(o); }, 0)) }), h('span', { text: 'hours coming up' })),
      h('div', { class: 'stat' }, h('b', { text: fmtH(pastServed()) }), h('span', { text: 'hours served' }))));
    var r = reminder(occ); if (r) f.push(r);
    var nb = notifyBanner(); if (nb) f.push(nb);
    if (!up.length) f.push(h('div', { class: 'empty' }, h('p', { text: 'You haven\u2019t signed up for a day yet.' }), h('button', { class: 'btn', onclick: function () { S.tab = 'days'; render(); }, text: 'Pick your days' })));
    else f.push(h('div', { class: 'list' }, up.map(function (o) { return occRow(o, t); })));
    return f;
  }

  /* ---------- account ---------- */
  function viewAccount() {
    var msg = h('div', { class: 'err', role: 'alert', style: 'grid-column:auto' });
    var pw = h('form', { class: 'form', novalidate: true, style: 'grid-template-columns:1fr;max-width:360px', onsubmit: function (e) {
      e.preventDefault(); msg.textContent = '';
      api('POST', '/api/password', { current: q('pw-cur').value, next: q('pw-new').value }).then(function () { q('pw-cur').value = ''; q('pw-new').value = ''; toast('Password changed'); }).catch(function (ex) { msg.textContent = ex.message; });
    } },
      h('div', { class: 'f', style: 'grid-column:auto' }, h('label', { for: 'pw-cur', text: 'Current password' }), h('input', { id: 'pw-cur', type: 'password', autocomplete: 'current-password' })),
      h('div', { class: 'f', style: 'grid-column:auto' }, h('label', { for: 'pw-new', text: 'New password (8+ characters)' }), h('input', { id: 'pw-new', type: 'password', autocomplete: 'new-password' })),
      msg, h('div', {}, h('button', { class: 'btn', type: 'submit', text: 'Change password' })));
    var f = [h('h1', { text: 'Account' }), h('p', { class: 'sub', text: S.me.name + ' \u00b7 ' + S.me.email })];
    var perm = notifyOK() ? Notification.permission : 'unsupported';
    f.push(h('div', { class: 'panel' }, h('h2', { text: 'Reminders on this device' }),
      h('p', { class: 'hint', text: perm === 'granted' ? 'On. You\u2019ll get a notification the day before and the day of a shift when you open the app. Adding shifts to your calendar gives you reminders even when the app is closed.' : perm === 'denied' ? 'Blocked in your browser settings.' : perm === 'unsupported' ? 'This browser doesn\u2019t support notifications. Use the calendar links on each shift.' : 'Off.' }),
      perm === 'default' ? h('button', { class: 'btn', onclick: enableNotify, text: 'Turn on reminders' }) : null));
    if (S.installEvt) f.push(h('div', { class: 'panel' }, h('h2', { text: 'Install the app' }), h('p', { class: 'hint', text: 'Add Belmont Tables to your home screen or desktop.' }),
      h('button', { class: 'btn', onclick: function () { S.installEvt.prompt(); S.installEvt = null; render(); }, text: 'Install' })));
    else if (/iphone|ipad/i.test(navigator.userAgent) && !window.navigator.standalone) f.push(h('div', { class: 'panel' }, h('h2', { text: 'Install on iPhone' }), h('p', { class: 'hint', text: 'In Safari, tap the Share button, then \u201cAdd to Home Screen\u201d.' })));
    f.push(h('div', { class: 'panel' }, h('h2', { text: 'Password' }), h('div', { style: 'margin-top:12px' }, pw)));
    f.push(h('div', { class: 'panel' }, h('button', { class: 'btn ghost', onclick: function () { api('POST', '/api/logout', {}).then(function () { S.me = null; S.tab = 'days'; render(); }); }, text: 'Sign out' })));
    return f;
  }

  /* ---------- coordinator ---------- */
  var famForm = null, sessForm = null, famBtn = null, famErr = null;
  function fld(cls, id, label, el) { return h('div', { class: 'f ' + cls }, h('label', { for: id, text: label }), el); }
  function buildForms() {
    famErr = h('div', { class: 'err', role: 'alert' });
    famBtn = h('button', { class: 'btn', type: 'submit', text: 'Add family' });
    famForm = h('form', { class: 'form', novalidate: true, onsubmit: function (e) { e.preventDefault(); saveFamily(); } },
      fld('w3', 'fm-name', 'Family last name', h('input', { id: 'fm-name', type: 'text', maxlength: '40', placeholder: 'Humphrey' })),
      fld('', 'fm-no', 'Table Team number', h('input', { id: 'fm-no', type: 'number', min: '1', max: '99' })),
      fld('', 'fm-size', 'Family size', h('input', { id: 'fm-size', type: 'number', min: '1', max: '40' })),
      fld('w6', 'fm-diet', 'Dietary needs & allergies', h('input', { id: 'fm-diet', type: 'text', maxlength: '200', placeholder: 'None reported' })),
      fld('w6', 'fm-mon', 'Monday drop-off (Sodexo)', h('input', { id: 'fm-mon', type: 'text', maxlength: '200', placeholder: 'Time and place' })),
      fld('w6', 'fm-thu', 'Thursday drop-off (Cul2vate)', h('input', { id: 'fm-thu', type: 'text', maxlength: '200', placeholder: 'Time and place' })),
      fld('w6', 'fm-drop', 'Drop-off, any day (used when a day has none above)', h('input', { id: 'fm-drop', type: 'text', maxlength: '200' })),
      fld('w6', 'fm-notes', 'Notes', h('textarea', { id: 'fm-notes', maxlength: '400' })),
      famErr,
      h('div', { class: 'f w6 row', style: 'flex-direction:row' }, famBtn, h('button', { class: 'btn ghost', type: 'button', onclick: clearFam, text: 'Clear form' })));
    var sErr = h('div', { class: 'err', role: 'alert' });
    sessForm = h('form', { class: 'form', novalidate: true, onsubmit: function (e) {
      e.preventDefault(); sErr.textContent = '';
      api('POST', '/api/sessions', { title: q('ss-title').value, dow: q('ss-dow').value, start: q('ss-start').value, end: q('ss-end').value })
        .then(function () { q('ss-title').value = ''; toast('Weekly day added'); return load(); }).catch(function (ex) { sErr.textContent = ex.message; });
    } },
      fld('w3', 'ss-title', 'Name', h('input', { id: 'ss-title', type: 'text', maxlength: '60', placeholder: 'Sodexo volunteering' })),
      fld('w3', 'ss-dow', 'Repeats every', h('select', { id: 'ss-dow' }, [1, 2, 3, 4, 5, 6, 0].map(function (d) { return h('option', { value: String(d), text: DOWL[d] }); }))),
      fld('w3', 'ss-start', 'Starts', h('input', { id: 'ss-start', type: 'time', value: '15:00' })),
      fld('w3', 'ss-end', 'Ends', h('input', { id: 'ss-end', type: 'time', value: '16:30' })),
      sErr, h('div', { class: 'f w6' }, h('button', { class: 'btn', type: 'submit', text: 'Add weekly day' })));
  }
  function clearFam() { S.editTeam = null; ['fm-name', 'fm-no', 'fm-size', 'fm-diet', 'fm-mon', 'fm-thu', 'fm-drop', 'fm-notes'].forEach(function (i) { q(i).value = ''; }); famBtn.textContent = 'Add family'; famErr.textContent = ''; render(); }
  function editFam(t) {
    S.editTeam = t.id; render();
    q('fm-name').value = t.family || ''; q('fm-no').value = t.teamNo || ''; q('fm-size').value = t.size || ''; q('fm-diet').value = t.dietary || '';
    q('fm-mon').value = (t.dropoffs && t.dropoffs[1]) || ''; q('fm-thu').value = (t.dropoffs && t.dropoffs[4]) || ''; q('fm-drop').value = t.dropoff || ''; q('fm-notes').value = t.notes || '';
    famBtn.textContent = 'Save changes'; q('fm-name').scrollIntoView({ block: 'center' });
  }
  function saveFamily() {
    var v = function (i) { return q(i).value.trim(); }; famErr.textContent = '';
    if (!v('fm-name')) { famErr.textContent = 'Enter the family\u2019s last name.'; return; }
    var body = { family: v('fm-name'), teamNo: v('fm-no'), size: v('fm-size'), dietary: v('fm-diet'), dropoff: v('fm-drop'), notes: v('fm-notes'), dropoffs: { 1: v('fm-mon'), 4: v('fm-thu') } };
    var editing = S.editTeam;
    api(editing ? 'PUT' : 'POST', editing ? '/api/teams/' + editing : '/api/teams', body)
      .then(function () { toast(editing ? 'Family updated' : 'Family added'); S.editTeam = null; ['fm-name', 'fm-no', 'fm-size', 'fm-diet', 'fm-mon', 'fm-thu', 'fm-drop', 'fm-notes'].forEach(function (i) { q(i).value = ''; }); famBtn.textContent = 'Add family'; return load(); })
      .catch(function (ex) { famErr.textContent = ex.message; });
  }
  function del(key, fn) { if (S.confirm !== key) { S.confirm = key; render(); return; } S.confirm = null; fn(); }
  function teamTag(t) { return h('span', { class: 'tag' }, h('i', { style: '--c:' + TC[(t.color || 0) % 6] }), 'Team ' + t.teamNo + ' \u00b7 ' + t.family); }

  function viewAdmin() {
    if (!famForm) buildForms();
    var f = [h('h1', { text: 'Coordinator tools' }), h('p', { class: 'sub', text: 'Assign students to families, keep family details current, and see who is coming.' })];

    var ordered = S.students.slice().sort(function (a, b) { return (a.teamId ? 1 : 0) - (b.teamId ? 1 : 0) || a.name.localeCompare(b.name); });
    var ppl = h('div', {}, ordered.length ? null : h('div', { class: 'empty', text: 'Students appear here after they create an account.' }));
    ordered.forEach(function (u) {
      var sel = h('select', { class: 'sel', id: 'as-' + u.id, 'aria-label': 'Family for ' + u.name, onchange: function () {
        act('as' + u.id, function () { return api('PUT', '/api/students/' + u.id, { teamId: sel.value || null }); }, sel.value ? 'Assigned' : 'Unassigned'); } },
        h('option', { value: '', text: 'Not assigned' }),
        S.teams.slice().sort(byNo).map(function (t) { return h('option', { value: String(t.id), selected: t.id === u.teamId, text: 'Team ' + t.teamNo + ' \u00b7 ' + t.family }); }));
      var key = 'pw' + u.id;
      ppl.appendChild(h('div', { class: 'admrow' }, h('div', { class: 'spread' },
        h('span', {}, h('b', { text: u.name }), h('span', { class: 'meta', text: ' ' + u.email + (u.role === 'coordinator' ? ' \u00b7 coordinator' : '') })),
        h('span', { class: 'row' }, sel, h('button', { class: 'btn ghost sm', onclick: function () {
          del(key, function () { api('POST', '/api/students/' + u.id + '/reset-password', {}).then(function (r) { S.tempPw[u.id] = r.password; render(); }).catch(function (e) { toast(e.message); }); }); },
          text: S.confirm === key ? 'Confirm reset' : 'Reset password' }))),
        S.tempPw[u.id] ? h('div', { class: 'meta', style: 'margin-top:6px' }, 'Temporary password for ' + u.name + ': ', h('b', { class: 't', text: S.tempPw[u.id] }), ' (share it privately; they can change it under Account)') : null));
    });
    f.push(h('div', { class: 'panel' }, h('h2', { text: 'Assign students' }), h('p', { class: 'hint', text: 'Unassigned students are listed first. Each student sees only their assigned family.' }), ppl));

    var occ = occurrences().filter(function (o) { return dayDiff(parse(o)) <= 14; });
    var ros = h('div', {}, occ.length ? null : h('div', { class: 'empty', text: 'No days in the next two weeks.' }));
    occ.forEach(function (o) {
      var d = parse(o), rows = [];
      S.teams.slice().sort(byNo).forEach(function (t) {
        var g = sigsFor(o, t.id); if (!g.length) return;
        rows.push(h('div', { style: 'margin-top:8px' }, h('div', { class: 'row', style: 'gap:8px' }, teamTag(t), h('span', { class: 'meta', text: g.length + (g.length === 1 ? ' student' : ' students') })), h('div', { class: 'roster' }, g.map(function (s) { return h('span', { class: 'who-chip', text: s.name }); }))));
      });
      ros.appendChild(h('div', { class: 'admrow' }, h('div', { class: 'spread' }, h('b', { text: DOW[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate() + ' \u00b7 ' + o.title }), h('span', { class: 'pill', text: sigsFor(o).length + ' signed up' })),
        rows.length ? rows : h('div', { class: 'meta', style: 'margin-top:4px', text: 'No one yet.' })));
    });
    f.push(h('div', { class: 'panel' }, h('div', { class: 'spread' }, h('h2', { text: 'Who\u2019s coming (next 2 weeks)' }), h('a', { class: 'btn ghost sm', href: '/api/export.csv', text: 'Download all signups (CSV)' })), ros));

    var fam = h('div', { style: 'margin-bottom:16px' }, S.teams.length ? null : h('div', { class: 'empty', text: 'No families yet.' }));
    S.teams.slice().sort(byNo).forEach(function (t) {
      var n = S.students.filter(function (u) { return u.teamId === t.id; }).length, key = 'team:' + t.id;
      fam.appendChild(h('div', { class: 'admrow spread' }, h('span', {}, teamTag(t), h('span', { class: 'meta', text: ' \u00b7 ' + n + (n === 1 ? ' student' : ' students') })),
        h('span', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: function () { editFam(t); }, text: 'Edit' }),
          h('button', { class: 'btn danger sm', onclick: function () { del(key, function () { act(key, function () { return api('DELETE', '/api/teams/' + t.id); }, 'Family removed'); }); }, text: S.confirm === key ? 'Confirm remove' : 'Remove' }))));
    });
    f.push(h('div', { class: 'panel' }, h('h2', { text: 'Families' }), h('p', { class: 'hint', text: S.editTeam ? 'Editing a family. Save when done.' : 'Add a family, or choose Edit to update one.' }), fam, famForm));

    var sl = h('div', { style: 'margin-bottom:16px' }, S.sessions.length ? null : h('div', { class: 'empty', text: 'No weekly days yet.' }));
    S.sessions.forEach(function (se) {
      var key = 'sess:' + se.id, skip = (se.skip || []).slice().sort(), inp = h('input', { type: 'date', id: 'sk-' + se.id, class: 'sel', 'aria-label': 'Skip a date for ' + se.title });
      sl.appendChild(h('div', { class: 'admrow' },
        h('div', { class: 'spread' }, h('span', {}, h('b', { text: se.title }), ' \u00b7 every ' + DOWL[se.dow] + ', ' + fmtT(se.start) + ' \u2013 ' + fmtT(se.end)),
          h('button', { class: 'btn danger sm', onclick: function () { del(key, function () { act(key, function () { return api('DELETE', '/api/sessions/' + se.id); }, 'Day deleted'); }); }, text: S.confirm === key ? 'Confirm delete' : 'Delete' })),
        h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'meta', text: 'No session on:' }), inp,
          h('button', { class: 'btn ghost sm', onclick: function () { if (inp.value) act('sk' + se.id, function () { return api('POST', '/api/sessions/' + se.id + '/skip', { date: inp.value, skip: true }); }, 'Date skipped'); }, text: 'Skip date' })),
        skip.length ? h('div', { class: 'roster' }, skip.map(function (d) { return h('button', { class: 'who-chip', style: 'border:0;cursor:pointer;color:inherit', title: 'Restore this date', onclick: function () { act('sk' + se.id, function () { return api('POST', '/api/sessions/' + se.id + '/skip', { date: d, skip: false }); }, 'Date restored'); }, text: d + ' \u2715' }); })) : null));
    });
    f.push(h('div', { class: 'panel' }, h('h2', { text: 'Weekly volunteer days' }), h('p', { class: 'hint', text: 'These repeat weekly for the next ' + S.weeks + ' weeks. Skip a date for holidays; anyone signed up that day is removed.' }), sl, sessForm));
    return f;
  }

  /* ---------- shell ---------- */
  function render() {
    S.now = new Date();
    [famForm, sessForm].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    var keepFocus = null;
    tabsEl.textContent = ''; whoEl.textContent = '';
    if (!S.loaded) { view.textContent = ''; view.appendChild(h('h1', { text: 'Loading\u2026' })); return; }
    if (!S.me) { view.textContent = ''; viewAuth().forEach(function (x) { view.appendChild(x); }); return; }
    var t = teamById(S.me.teamId);
    whoEl.textContent = S.me.name + (t ? ' \u00b7 Team ' + t.teamNo + ' ' + t.family : '');
    var tabs = [['days', 'Sign up']];
    if (t) tabs.push(['mine', 'My shifts']);
    if (isCoord()) tabs.push(['admin', 'Coordinator']);
    tabs.push(['account', 'Account']);
    if (tabs.every(function (x) { return x[0] !== S.tab; })) S.tab = 'days';
    tabs.forEach(function (x) {
      var b = h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.tab === x[0]), onclick: function () { S.tab = x[0]; S.confirm = null; render(); window.scrollTo(0, 0); } }, x[1]);
      if (x[0] === 'mine') { var n = myShifts(occurrences()).length; if (n) b.appendChild(h('span', { class: 'n', text: String(n) })); }
      tabsEl.appendChild(b);
    });
    view.textContent = '';
    var c = S.tab === 'admin' ? viewAdmin() : S.tab === 'mine' ? viewMine() : S.tab === 'account' ? viewAccount() : viewDays();
    c.forEach(function (x) { if (x) view.appendChild(x); });
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; if (S.me && S.tab === 'account') render(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.me) load(); });
  setInterval(function () { if (S.me && document.visibilityState === 'visible') load(); }, 5 * 60000);
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  load();
})();
