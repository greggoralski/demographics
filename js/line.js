/* The line view: one year of population, age up the side, people across. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var M = { l: 46, r: 26, t: 32, b: 36 };
  var svg, D, onPick, W = 0, H = 0, xmax = 1, tick = 1, state = null, hoverAge = null, highlight = null;

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    svg.appendChild(n);
    return n;
  }
  function fmt(n) { return Math.round(n).toLocaleString('en-CA'); }
  function x(v) { return M.l + (v / xmax) * (W - M.l - M.r); }
  function y(a) { return H - M.b - (a / D.maxAge) * (H - M.t - M.b); }
  function ageAt(py) {
    var a = Math.round(((H - M.b - py) / (H - M.t - M.b)) * D.maxAge);
    return Math.max(0, Math.min(D.maxAge, a));
  }

  function init(svgEl, data, pick) {
    svg = svgEl; onPick = pick;
    setData(data);

    new ResizeObserver(function () { draw(); }).observe(svg);

    var dragging = false;
    function localY(e) { return e.clientY - svg.getBoundingClientRect().top; }
    svg.addEventListener('pointerdown', function (e) {
      dragging = true;
      e.preventDefault();             // a mouse click should not leave a focus ring
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      onPick(ageAt(localY(e)));
    });
    svg.addEventListener('pointermove', function (e) {
      if (dragging) { onPick(ageAt(localY(e))); return; }
      if (e.pointerType === 'touch') return;
      var a = ageAt(localY(e));
      if (a !== hoverAge) { hoverAge = a; draw(); }
    });
    function end() { dragging = false; }
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', function () {
      if (hoverAge !== null) { hoverAge = null; draw(); }
    });
    svg.addEventListener('keydown', function (e) {
      if (!state) return;
      var age = state.year - state.birth, step = 0;
      if (e.key === 'ArrowUp') step = 1;
      else if (e.key === 'ArrowDown') step = -1;
      else if (e.key === 'PageUp') step = 10;
      else if (e.key === 'PageDown') step = -10;
      if (!step) return;
      e.preventDefault();
      onPick(Math.max(0, Math.min(D.maxAge, age + step)));
    });
  }

  // Pick a round top for the people axis, and a tick spacing to suit it.
  function setData(data) {
    D = data;
    var mx = 0;
    D.pop.forEach(function (col) { col.forEach(function (v) { if (v > mx) mx = v; }); });
    var mag = Math.pow(10, Math.floor(Math.log10(mx)));
    tick = [0.1, 0.2, 0.25, 0.5, 1].map(function (m) { return m * mag; })
      .filter(function (t) { return mx * 1.04 / t <= 9; })[0];
    xmax = Math.ceil(mx * 1.04 / tick) * tick;
  }
  function short(v) {
    if (v === 0) return '0';
    return v >= 1e6 ? (v / 1e6).toFixed(tick < 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M' : Math.round(v / 1000) + 'k';
  }

  function draw() {
    if (!state) return;
    var box = svg.getBoundingClientRect();
    W = box.width; H = box.height;
    if (W < 50 || H < 50) return;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var col = D.pop[state.year - D.y0];
    var projected = state.year > D.lastEstimate;
    var a, v;

    // age bands: under 20 and 65 and over, as faint full-width strips
    el('rect', { 'class': 'c-band-young', x: M.l, y: y(20), width: W - M.l - M.r, height: y(0) - y(20) });
    el('rect', { 'class': 'c-band-old', x: M.l, y: y(D.maxAge), width: W - M.l - M.r, height: y(65) - y(D.maxAge) });
    el('text', { 'class': 'c-band-t', x: W - M.r - 6, y: y(20) + 13, 'text-anchor': 'end' }, 'UNDER 20');
    el('text', { 'class': 'c-band-t', x: W - M.r - 6, y: y(65) - 6, 'text-anchor': 'end' }, '65 AND OVER');

    // the year, set large behind everything
    el('text', { 'class': 'c-year', x: W - M.r, y: M.t + 40, 'text-anchor': 'end' }, state.year);
    if (projected) {
      el('text', { 'class': 'c-proj', x: W - M.r, y: M.t + 60, 'text-anchor': 'end' }, 'Projected');
    }

    // age grid and labels
    for (a = 0; a <= D.maxAge; a += 10) {
      el('line', { 'class': 'c-grid', x1: M.l, x2: W - M.r, y1: y(a), y2: y(a) });
      el('text', { 'class': 'c-tick', x: M.l - 8, y: y(a) + 3.5, 'text-anchor': 'end' },
        a === D.maxAge ? a + '+' : a);
    }
    el('text', { 'class': 'c-tick', x: M.l - 8, y: M.t - 15, 'text-anchor': 'end' }, 'AGE');

    // people ticks along the bottom
    var stepX = (W - M.l - M.r) < 360 ? tick * 2 : tick;
    for (v = 0; v <= xmax; v += stepX) {
      el('line', { 'class': 'c-axis', x1: x(v), x2: x(v), y1: H - M.b, y2: H - M.b + 4 });
      el('text', { 'class': 'c-tick', x: x(v), y: H - M.b + 17, 'text-anchor': 'middle' },
        short(v));
    }
    el('text', { 'class': 'c-tick', x: W - M.r, y: H - 5, 'text-anchor': 'end' }, 'PEOPLE AT EACH AGE');

    // the shape
    var pts = [];
    for (a = 0; a <= D.maxAge; a++) pts.push(x(col[a]).toFixed(1) + ',' + y(a).toFixed(1));
    el('path', { 'class': 'c-area',
      d: 'M' + M.l + ',' + y(0) + 'L' + pts.join('L') + 'L' + M.l + ',' + y(D.maxAge) + 'Z' });

    // generations: the area under the line, tinted by birth year. In any one
    // year a generation is a band of ages, and the band climbs as years pass.
    function val(age) {                       // people at a fractional age
      var lo = Math.floor(age), hi = Math.min(D.maxAge, lo + 1);
      return col[lo] + (col[hi] - col[lo]) * (age - lo);
    }
    var genLabels = [];
    window.GENERATIONS.list.forEach(function (g) {
      var lo = Math.max(0, state.year - g.to - 0.5), hi = Math.min(D.maxAge, state.year - g.from + 0.5);
      if (hi <= lo) return;
      var edge = [x(val(lo)).toFixed(1) + ',' + y(lo).toFixed(1)];
      for (a = Math.ceil(lo); a <= Math.floor(hi); a++) edge.push(x(col[a]).toFixed(1) + ',' + y(a).toFixed(1));
      edge.push(x(val(hi)).toFixed(1) + ',' + y(hi).toFixed(1));
      var p = el('path', { 'class': 'c-gen',
        d: 'M' + M.l + ',' + y(lo).toFixed(1) + 'L' + edge.join('L') + 'L' + M.l + ',' + y(hi).toFixed(1) + 'Z' });
      p.style.fill = 'var(' + g.token + ')';
      if (highlight && g.token !== highlight) p.style.opacity = 0.18;
      if (y(lo) - y(hi) > 18) genLabels.push([g.short, (y(lo) + y(hi)) / 2]);
    });
    genLabels.forEach(function (l) {
      el('text', { 'class': 'c-gen-t', x: M.l + 9, y: l[1] + 3.5 }, l[0]);
    });
    el('path', { 'class': 'c-line' + (projected ? ' projected' : ''), d: 'M' + pts.join('L') });
    el('line', { 'class': 'c-axis', x1: M.l, x2: M.l, y1: y(0), y2: y(D.maxAge) });

    var age = state.year - state.birth;
    var hasPerson = age >= 0 && age <= D.maxAge;

    // hover read-out
    if (hoverAge !== null && !(hasPerson && hoverAge === age)) {
      el('line', { 'class': 'c-hover', x1: M.l, x2: x(col[hoverAge]), y1: y(hoverAge), y2: y(hoverAge) });
      label('c-hover-t', 'age ' + hoverAge + ' · ' + fmt(col[hoverAge]), x(col[hoverAge]), y(hoverAge), 7);
    }

    // the selected person
    if (hasPerson) {
      var px = x(col[age]), py = y(age);
      el('line', { 'class': 'c-person-rule', x1: M.l, x2: px, y1: py, y2: py });
      el('circle', { 'class': 'c-person-dot', cx: px, cy: py, r: 6.5 });
      label('c-person-t', 'Age ' + age + ' · ' + fmt(col[age]) + ' people', px, py, 7.6);
    }
  }

  // A text label beside a point, flipped to the left when it would run off.
  function label(cls, text, px, py, charW) {
    var w = text.length * charW, tx = px + 13, anchor = 'start';
    if (tx + w > W - 4) { tx = px - 13; anchor = 'end'; }
    if (anchor === 'end' && tx - w < M.l + 6) { tx = M.l + 9; anchor = 'start'; }
    var ty = py - 10;
    if (ty < 14) ty = py + 20;
    var bx = anchor === 'start' ? tx - 3 : tx - w - 3;
    el('rect', { 'class': 'c-person-bg', x: bx, y: ty - 12, width: w + 6, height: 16, rx: 3 });
    el('text', { 'class': cls, x: tx, y: ty, 'text-anchor': anchor }, text);
  }

  window.LineView = {
    init: init,
    render: function (s) { state = s; draw(); },
    setData: function (data) { setData(data); draw(); },
    highlight: function (tokenName) { highlight = tokenName; draw(); }
  };
})();
