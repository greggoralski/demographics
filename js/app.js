/* Wiring: one shared state (year, birth year, view), three views that read it. */
(function () {
  var ALL = window.DEMO_DATA, G = window.GENERATIONS;
  var state = { year: 2026, birth: 2006, view: 'line', country: ALL.order[0] };
  var D = ALL.countries[state.country];
  var timer = null, sculptureOK = false, lit = null;

  function $(id) { return document.getElementById(id); }
  var slider = $('year'), yearOut = $('year-out'), yearNote = $('year-note'), playBtn = $('play');
  var title = $('panel-title'), readout = $('panel-readout');
  var viewLine = $('view-line'), viewSculpture = $('view-sculpture');
  var els = { who: $('who'), titleA: $('col-a-title'), titleB: $('col-b-title'),
              a: $('stats-a'), b: $('stats-b'), keys: $('keypoints') };

  function update(fromSculpture) {
    var age = state.year - state.birth;
    slider.value = state.year;
    yearOut.textContent = state.year;
    yearNote.textContent = state.year > D.lastEstimate ? 'Projected' : '';
    $('prev').disabled = state.year <= D.y0;
    $('next').disabled = state.year >= D.y1;
    title.textContent = state.view === 'line'
      ? 'Population by age · ' + state.year
      : 'Every year, ' + D.y0 + ' to ' + D.y1;
    readout.innerHTML = age >= 0 && age <= D.maxAge
      ? 'Born <b>' + state.birth + '</b> · age <b>' + age + '</b>'
      : 'Born <b>' + state.birth + '</b>';
    if (state.view === 'line') window.LineView.render(state);
    window.SculptureView.render(state, fromSculpture === true);
    window.PersonView.render(els, state, D);
    legend();
  }

  // Colour key: the generations alive in the chosen year, plus the two age bands.
  function legend() {
    var html = '';
    G.list.forEach(function (g) {
      if (state.year - g.to <= D.maxAge && state.year - g.from >= 0) {
        html += '<span class="gen' + (g.token === lit ? ' on' : '') + '" tabindex="0" data-gen="' + g.token +
          '"><i style="background:var(' + g.token + ')"></i>' + g.short + '</span>';
      }
    });
    html += '<span class="gap"></span>' +
      '<span><i style="background:var(--second);opacity:.35"></i>Under 20</span>' +
      '<span><i style="background:var(--accent);opacity:.35"></i>65 and over</span>';
    $('legend').innerHTML = html;
  }

  function setView(view) {
    state.view = view;
    viewLine.hidden = view !== 'line';
    viewSculpture.hidden = view !== 'sculpture';
    Array.prototype.forEach.call(document.querySelectorAll('[data-view].pill'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.view === view));
    });
    $('sculpture-fallback').hidden = sculptureOK;
    window.SculptureView.setActive(view === 'sculpture' && sculptureOK);
    $('export').hidden = view !== 'sculpture';
    update();
  }

  function setYear(y) {
    state.year = Math.max(D.y0, Math.min(D.y1, y));
    update();
  }

  // -------------------------------------------------------------- playing
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    playBtn.textContent = 'Play';
    playBtn.setAttribute('aria-pressed', 'false');
  }
  function play() {
    if (state.year >= D.y1) state.year = D.y0;
    playBtn.textContent = 'Pause';
    playBtn.setAttribute('aria-pressed', 'true');
    timer = setInterval(function () {
      if (state.year >= D.y1) { stop(); return; }
      setYear(state.year + 1);
    }, 260);
  }

  // ------------------------------------------------------------- controls
  playBtn.addEventListener('click', function () { if (timer) stop(); else play(); });
  slider.addEventListener('input', function () { stop(); setYear(+slider.value); });
  $('prev').addEventListener('click', function () { stop(); setYear(state.year - 1); });
  $('next').addEventListener('click', function () { stop(); setYear(state.year + 1); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-view].pill'), function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });

  // Pointing at a generation's name lights it up on the line and the model.
  function light(tokenName) {
    if (lit === tokenName) return;
    lit = tokenName;
    window.LineView.highlight(lit);
    window.SculptureView.highlight(lit);
    Array.prototype.forEach.call($('legend').querySelectorAll('.gen'), function (el) {
      el.classList.toggle('on', el.dataset.gen === lit);
    });
  }
  function genOf(e) { var el = e.target.closest ? e.target.closest('.gen') : null; return el ? el.dataset.gen : null; }
  var legendEl = $('legend');
  legendEl.addEventListener('mouseover', function (e) { light(genOf(e)); });
  legendEl.addEventListener('mouseleave', function () { light(null); });
  legendEl.addEventListener('focusin', function (e) { light(genOf(e)); });
  legendEl.addEventListener('focusout', function () { light(null); });
  legendEl.addEventListener('click', function (e) {            // tap, on a phone
    if (e.pointerType === 'mouse') return;                     // the mouse already hovers
    var g = genOf(e); light(g && g !== lit ? g : null);
  });

  $('export').addEventListener('click', function () {
    var btn = $('export');
    btn.textContent = 'Building…';
    var out = window.SculptureView.exportSTL(), a = document.createElement('a');
    btn.textContent = 'Download STL';
    a.href = URL.createObjectURL(out.blob);
    a.download = 'demographics-' + state.country.toLowerCase() + '-' + D.y0 + '-' + D.y1 + '-' + out.height + 'mm.stl';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  // ------------------------------------------------------------ countries
  function notes() {
    $('data-notes').textContent = state.country === 'CA'
      ? 'Counts run to ' + D.lastEstimate + '; later years are Statistics Canada\'s medium-growth projection. Before ' +
        (D.splitTailUntil + 1) + ' the source groups everyone 90 and over; single ages there are estimated ' +
        'without changing the published total. The top row, 100+, holds everyone aged 100 or more. ' +
        'A dash means the source has no figure for that year. Dollar amounts are adjusted for inflation.'
      : 'For ' + D.name + ', counts run to ' + D.lastEstimate + '; later years are the United Nations\' medium ' +
        'projection. The top row, 100+, holds everyone aged 100 or more. Fewer yearly figures are available ' +
        'here than for Canada, so the read-out is shorter.';
  }
  function setCountry(code) {
    state.country = code;
    D = ALL.countries[code];
    G.use(D.generations);
    light(null);
    Array.prototype.forEach.call($('countries').children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.country === code));
    });
    window.LineView.setData(D);
    window.SculptureView.setData(D);
    notes();
    update();
  }
  ALL.order.forEach(function (code) {
    var b = document.createElement('button');
    b.type = 'button'; b.dataset.country = code; b.textContent = ALL.countries[code].label;
    b.setAttribute('aria-pressed', String(code === state.country));
    b.addEventListener('click', function () { stop(); setCountry(code); });
    $('countries').appendChild(b);
  });

  // ----------------------------------------------------------------- start
  G.use(D.generations);
  slider.min = D.y0; slider.max = D.y1;
  window.LineView.init($('line-chart'), D, function (age) {
    state.birth = state.year - age;
    update();
  });
  sculptureOK = window.SculptureView.init($('sculpture-canvas'), $('sculpture-labels'), D,
    function (year, age) {
      stop();
      state.year = year;
      state.birth = year - age;
      update(true);
    });
  notes();
  setView('line');
})();
