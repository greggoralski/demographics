/* The read-out: what the data says about one person, in one year. */
(function () {
  var D, G = window.GENERATIONS;

  // ------------------------------------------------------------- helpers
  function get(series, year) {
    if (!series) return null;
    var i = year - series.start;
    if (i < 0 || i >= series.values.length) return null;
    var v = series.values[i];
    return v == null ? null : v;
  }
  function end(series) { return series.start + series.values.length - 1; }
  function span(series) { return series.start + ' to ' + end(series); }
  // The value for a year, or the newest one up to three years older when that
  // year has none (surveys that skip years, series a year behind). A stand-in
  // is always labelled with its own year.
  // The last year the yearly indicators can cover (population runs further).
  function horizon() { return D.indicatorsTo || D.lastEstimate; }
  function recent(series, year) {
    if (!series || year > horizon()) return null;
    for (var back = 0; back <= 3; back++) {
      var v = get(series, year - back);
      if (v != null) return { v: v, note: back ? 'from ' + (year - back) : '' };
    }
    return null;
  }
  function notes() {
    return Array.prototype.filter.call(arguments, Boolean).join(' · ');
  }
  function int(n) { return Math.round(n).toLocaleString('en-CA'); }
  function dollars(n) { return '$' + int(n); }
  function millions(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + ' billion' : (n / 1e6).toFixed(1) + ' million'; }
  function pct(n) { return n.toFixed(1) + '%'; }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%'; }
  function pop(year, age) { return D.pop[year - D.y0][age]; }
  function inRange(year) { return year >= D.y0 && year <= D.y1; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function unGroup(age) {
    if (age < 15) return null;
    if (age >= 65) return '65 years and over';
    var lo = Math.floor(age / 5) * 5;
    return lo + ' to ' + (lo + 4) + ' years';
  }
  function incGroup(age) {
    if (age < 15) return null;
    if (age >= 65) return '65 years and over';
    if (age < 25) return '15 to 24 years';
    var lo = Math.floor((age - 5) / 10) * 10 + 5;
    return lo + ' to ' + (lo + 9) + ' years';
  }
  function plainGroup(g) { return g.replace(' years', ''); }
  // Age groups used by the census tables and the education and fertility series.
  function tenGroup(age) {                 // 15-24 ... 75-84, 85 and over
    if (age < 15) return null;
    if (age >= 85) return '85 years and over';
    var lo = Math.floor((age - 5) / 10) * 10 + 5;
    return lo + ' to ' + (lo + 9) + ' years';
  }
  function foreignGroup(age) {
    if (age < 15) return '0 to 14 years';
    if (age < 20) return '15 to 19 years';
    if (age < 25) return '20 to 24 years';
    if (age >= 75) return '75 years and over';
    var lo = Math.floor((age - 5) / 10) * 10 + 5;
    return lo + ' to ' + (lo + 9) + ' years';
  }
  function degreeGroup(age) {
    if (age < 15) return null;
    return age < 25 ? '15 to 24 years' : age < 55 ? '25 to 54 years' : age < 65 ? '55 to 64 years' : '65 years and over';
  }
  function fiveGroup(age) { var lo = Math.floor(age / 5) * 5; return lo + ' to ' + (lo + 4) + ' years'; }

  // A census figure: joined by straight lines between censuses, and held for
  // the few years after the latest one (labelled). Null outside that.
  function census(points, year) {
    if (!points) return null;
    var ys = Object.keys(points).map(Number).sort(), last = ys[ys.length - 1];
    if (year < ys[0] || year > horizon()) return null;
    if (year >= last) return { v: points[last], note: year > last ? last + ' census' : '' };
    for (var i = 0; i < ys.length - 1; i++) {
      if (year >= ys[i] && year <= ys[i + 1]) {
        var t = (year - ys[i]) / (ys[i + 1] - ys[i]);
        return { v: points[ys[i]] * (1 - t) + points[ys[i + 1]] * t, note: '' };
      }
    }
    return null;
  }
  // A value from a year-by-age table ({start, values[year][index]}), or the
  // newest one up to three years older, labelled.
  function fromTable(table, year, index) {
    if (year > horizon()) return null;
    for (var back = 0; back <= 3; back++) {
      var rowAt = table.values[year - back - table.start];
      if (rowAt && rowAt[index] != null) return { v: rowAt[index], note: back ? 'from ' + (year - back) : '' };
    }
    return null;
  }
  function tableSpan(table) { return table.start + ' to ' + (table.start + table.values.length - 1); }
  function optional(label, r, format, note, covers, year) {
    if (r) return row(label, format(r.v), notes(note, r.note));
    return row(label, null, notes(note, year > horizon() ? 'not projected' : covers));
  }

  function withParents(year) {
    var ys = Object.keys(D.withParents).map(Number).sort();
    if (year < ys[0] || year > ys[ys.length - 1]) return null;
    for (var i = 0; i < ys.length - 1; i++) {
      if (year >= ys[i] && year <= ys[i + 1]) {
        var t = (year - ys[i]) / (ys[i + 1] - ys[i]);
        return D.withParents[ys[i]] * (1 - t) + D.withParents[ys[i + 1]] * t;
      }
    }
    return null;
  }

  function recessionIn(year) {
    for (var i = 0; D.recessions && i < D.recessions.length; i++) {
      var r = D.recessions[i];
      // counts when at least two months of the recession fall in this year
      if (Math.min(r.e, year + 1) - Math.max(r.s, year) >= 0.16) return r;
    }
    return null;
  }
  function rname(r) { return r.name.replace(/(\d)-(\d)/, '$1–$2'); }
  function workers(year) { return get(D.workers, year); }

  // Recessions that fall inside a life, as ages. Only ones that have happened.
  function recessionAges(birth) {
    var out = [];
    (D.recessions || []).forEach(function (r) {
      var a = Math.floor(r.s) - birth;
      if (a >= 0 && a <= D.maxAge) out.push({ age: a, r: r });
    });
    return out;
  }

  // ---------------------------------------------------------------- rows
  function row(label, value, note) {
    return '<div class="fact"><dt>' + label + (note ? '<small>' + note + '</small>' : '') +
      '</dt><dd' + (value == null ? ' class="none">–' : '>' + value) + '</dd></div>';
  }
  // A row from a yearly series: the value, or a dash with what the data covers.
  function seriesRow(label, series, year, format, note) {
    if (!series) return '';                       // this place has no such series
    var r = recent(series, year);
    if (r) return row(label, format(r.v, r.note), notes(note, r.note));
    return row(label, null, notes(note, year > horizon() ? 'not projected' : 'data covers ' + span(series)));
  }

  function canada(year, age) {
    var projected = year > D.lastEstimate, rec = year <= horizon() ? recessionIn(year) : null;
    var bands = [
      ['Under 20', get(D.under20, year), age >= 0 && age < 20],
      ['Working age', get(D.working, year), age >= 20 && age < 65, '', 'Ages 20 to 64'],
      ['Prime age', get(D.prime, year), age >= 25 && age < 55, ' sub', 'Ages 25 to 54, a part of working age'],
      ['65 and over', get(D.over65, year), age >= 65 && age <= D.maxAge]
    ];
    var html = '<div class="ages">' + bands.map(function (b) {
      return '<div class="age-row' + (b[2] ? ' you' : '') + (b[3] || '') + '"' + (b[4] ? ' title="' + b[4] + '"' : '') + '><span>' + b[0] + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (b[1] / 70 * 100).toFixed(1) + '%"></span></span>' +
        '<span class="num">' + pct(b[1]) + '</span></div>';
    }).join('') + '</div><dl class="facts">';

    var growth = get(D.growth, year);
    html += row('Population', millions(get(D.total, year)), projected ? 'projected' : '');
    html += row('Population growth', growth == null ? null : signed(growth),
      growth == null ? 'first year shown' : 'from the year before');
    html += row('Workers per non-worker', workers(year).toFixed(2),
      year > D.workRatesTo ? 'if each age works as much as in ' + D.workRatesTo : 'people in work for each person who is not');
    html += seriesRow('GDP growth', D.gdp, year, function (v, standIn) {
      return signed(v) + (rec && !standIn ? '<span class="flag">recession</span>' : '');
    }, 'real, that year');
    html += seriesRow('Birth rate', D.tfr, year, function (v) { return v.toFixed(2); }, 'children per woman');
    html += seriesRow("Mother's age at birth", D.motherAge, year, function (v) { return v.toFixed(1); }, 'average, all births');
    html += seriesRow('Immigration rate', D.immigration, year, function (v) { return v.toFixed(1); }, 'arrivals per 1,000 residents');
    html += seriesRow('Life expectancy', D.lifeBirth, year, function (v) { return v.toFixed(1); }, 'at birth, years');
    html += seriesRow('Youth unemployment', D.youthUnemp, year, pct, 'ages 15 to 24');
    html += seriesRow('In college or university', D.tertiary, year, function (v) { return Math.round(v) + '%'; },
      'enrolment against the college-age population');
    html += seriesRow('Living in cities', D.urban, year, pct, 'urban share of the population');
    html += seriesRow('Tuition', D.tuition, year, dollars, 'a year of university, ' + D.cpiYear + ' dollars');
    html += seriesRow('House prices', D.house, year, function (v) { return Math.round(v) + '%'; },
      'of the ' + D.houseYear + ' level, after inflation');
    html += seriesRow('Spent on housing', D.shelter, year, pct, 'share of household spending');
    html += seriesRow('Spent on food', D.food, year, pct, 'share of household spending');
    html += seriesRow('Marriage age', D.marriage, year, function (v) { return v.toFixed(1); }, 'average first marriage');
    if (D.withParents) {
      var wp = year <= D.lastEstimate ? withParents(year) : null;
      html += row('Youth living at home', wp == null ? null : pct(wp),
        notes('ages 20 to 34', wp == null ? (year > D.lastEstimate ? 'not projected' : 'data covers 2001 to 2021') : ''));
    }
    html += seriesRow('University educated', D.university, year, pct, 'ages 25 to 54 with a degree');
    return html + '</dl>';
  }

  function person(year, birth, age) {
    var html = '<dl class="facts">', gen = G.of(birth);
    html += row('Generation', '<span class="sw" style="background:var(' + gen.token + ')"></span>' + gen.short, gen.range);

    var star = D.famous && D.famous[birth];
    if (star) html += row('Born the same year', star[0], star[1]);

    var n = pop(year, age), total = get(D.total, year);
    html += row('People this age', int(n), '1 in ' + Math.round(total / n) + ' residents');

    var ug = unGroup(age), ig = incGroup(age);
    if (!D.unemployment) { /* not available here */ }
    else if (ug) html += seriesRow('Unemployment', D.unemployment[ug], year, pct, 'ages ' + plainGroup(ug));
    else html += row('Unemployment', null, 'counted from age 15');
    if (!D.income) { /* not available here */ }
    else if (ig) html += seriesRow('Median income', D.income[ig], year, dollars, 'ages ' + plainGroup(ig) + ', ' + D.incomeDollars);
    else html += row('Median income', null, 'counted from age 15');

    // age-specific extras (Canada only, for now)
    if (D.lifeExp) {
    html += optional('Years of life left', fromTable(D.lifeExp, year, age), function (v) { return v.toFixed(1); },
      'average at this age', 'data covers ' + tableSpan(D.lifeExp), year);
    if (age >= D.school.ages[0] && age <= D.school.ages[1]) {
      html += optional('In school', fromTable(D.school, year, age - D.school.ages[0]), function (v) { return Math.round(v) + '%'; },
        'school, college or university, at this age', 'data covers ' + tableSpan(D.school), year);
    } else html += row('In school', null, 'measured for ages 15 to 29');
    var dg = degreeGroup(age);
    if (dg) html += seriesRow('With a degree', D.degree[dg], year, pct, 'university, ages ' + plainGroup(dg));
    else html += row('With a degree', null, 'counted from age 15');
    var tg = tenGroup(age);
    if (tg) {
      html += optional('Living alone', census(D.alone[tg], year), pct, 'ages ' + plainGroup(tg), 'census data covers 2011 to 2021', year);
      html += optional('Living with their children', census(D.withKids[tg], year), pct,
        'ages ' + plainGroup(tg), 'census data covers 2011 to 2021', year);
    } else {
      html += row('Living alone', null, 'counted from age 15');
      html += row('Living with their children', null, 'counted from age 15');
    }
    var fg = foreignGroup(age);
    html += optional('Born outside Canada', census({ 2021: D.foreign[fg] }, year), pct,
      'ages ' + plainGroup(fg), '2021 census only', year);
    if (age >= 15 && age <= 49) {
      html += seriesRow('Fertility rate', D.fertility[fiveGroup(age)], year, function (v) { return v.toFixed(1); },
        'births per 1,000 women aged ' + plainGroup(fiveGroup(age)));
    } else html += row('Fertility rate', null, 'measured for ages 15 to 49');
    }

    // average growth over the life so far
    var sum = 0, cnt = 0, from = Math.max(birth, D.gdp.start), to = Math.min(year, end(D.gdp));
    for (var y = from; y <= to; y++) { var g = get(D.gdp, y); if (g != null) { sum += g; cnt++; } }
    html += row('Avg GDP growth', cnt ? signed(sum / cnt) : null,
      cnt ? 'a year, ' + from + ' to ' + to + (from > birth ? ' (data starts ' + from + ')' : '')
          : 'no growth data yet for this life');

    var recs = recessionAges(birth);
    if (D.recessions) html += row('Recession at', recs.length ? 'age ' + recs.map(function (x) {
      return x.r.deep ? '<strong>' + x.age + '</strong>' : x.age;
    }).join(', ') : null, recs.length ? 'deep ones in bold' : 'none on record yet');

    var t = get(D.tuition, birth + 19), h = get(D.house, birth + 30);
    if (D.tuition) html += row('Tuition at 19', t == null ? null : dollars(t),
      notes('in ' + (birth + 19), t == null ? 'data covers ' + span(D.tuition) : D.cpiYear + ' dollars'));
    if (D.house) html += row('House prices at 30', h == null ? null : Math.round(h) + '%',
      notes('in ' + (birth + 30), h == null ? 'data covers ' + span(D.house) : 'of the ' + D.houseYear + ' level'));

    var y65 = birth + 65;
    html += row('Seniors at their 65th', inRange(y65) ? pct(get(D.over65, y65)) : null,
      notes('in ' + y65, inRange(y65) ? (y65 > D.lastEstimate ? 'projected share of population' : 'share of population')
        : 'outside ' + D.y0 + ' to ' + D.y1));
    return html + '</dl>';
  }

  // ----------------------------------------------------------- key points
  function keyPoints(year, birth, age) {
    var out = [], i;

    if (age >= 5 && age <= 65) {
      var me = pop(year, age), older = pop(year, age + 5), younger = pop(year, age - 5);
      var diff = 100 * (me / ((older + younger) / 2) - 1);
      var verb = year > D.lastEstimate ? 'are projected to be ' : 'were ';
      if (diff > 6 && me > older && me > younger) {
        out.push('<strong>A crowded year.</strong> In ' + year + ' there ' + verb +
          Math.round(diff) + '% more ' + age + '-year-olds than people five years either side of them.');
      } else if (diff < -6 && me < older && me < younger) {
        out.push('<strong>A thin year.</strong> In ' + year + ' there ' + verb +
          Math.round(-diff) + '% fewer ' + age + '-year-olds than people five years either side of them.');
      }
    }

    var hit = null;
    for (i = 0; D.recessions && i < D.recessions.length; i++) {
      var r = D.recessions[i];
      var a0 = Math.floor(r.s) - birth, a1 = Math.floor(r.e) - birth;
      if (a1 >= 18 && a0 <= 24 && (!hit || (r.deep && !hit.r.deep))) hit = { r: r, age: Math.max(18, a0) };
    }
    if (hit && hit.r.deep) {
      out.push('<strong>A deep recession at ' + hit.age + ' hurts income.</strong> Aged ' + hit.age + ' during ' +
        rname(hit.r) + '. A Canadian study found graduates who start work in a typical recession earn about 9% ' +
        'less at first, with the gap taking around ten years to close. ' +
        '<cite>Oreopoulos, von Wachter and Heisz, 2012</cite>');
    } else if (hit) {
      out.push('<strong>A recession at ' + hit.age + '.</strong> Aged ' + hit.age + ' during ' +
        rname(hit.r) + ', one of the milder ones.');
    }

    var now = workers(year), y65 = birth + 65;
    var s = '<strong>' + now.toFixed(2) + ' workers per non-worker.</strong> In ' + year + ', ' + D.name + ' ' +
      (year > D.lastEstimate ? 'is projected to have ' : 'had ') + 'about ' + Math.round(now * 100) +
      ' people in work for every 100 who are not: children, students, people out of work and the retired.';
    if (inRange(y65) && y65 !== year) {
      s += ' In ' + y65 + ', when this person turns 65, ' +
        (y65 > D.lastEstimate ? 'it is projected to be ' : 'it was ') + Math.round(workers(y65) * 100) + '.';
    }
    if (Math.max(year, inRange(y65) ? y65 : year) > D.workRatesTo) {
      s += ' Years after ' + D.workRatesTo + ' assume people at each age work as much as they did in ' + D.workRatesTo + '.';
    }
    out.push(s);

    var h = get(D.house, birth + 30);
    if (h != null && birth + 30 !== D.houseYear) {
      out.push('<strong>Housing at 30.</strong> In ' + (birth + 30) + ', house prices were ' +
        Math.round(h) + '% of their ' + D.houseYear + ' level, after inflation.');
    }
    var t = get(D.tuition, birth + 19), tNow = D.tuition ? get(D.tuition, end(D.tuition)) : null;
    if (t != null && birth + 19 !== end(D.tuition)) {
      out.push('<strong>Tuition at 19.</strong> In ' + (birth + 19) + ', a year of university cost ' +
        dollars(t) + ' on average, against ' + dollars(tNow) + ' in ' + end(D.tuition) +
        ' (both in ' + D.cpiYear + ' dollars).');
    }
    var gen = G.of(birth);
    out.push('<strong>' + cap(gen.name) + '.</strong> ' + G.note.replace('{range}', gen.range));
    return out;
  }

  // --------------------------------------------------------------- render
  function render(els, state, data) {
    D = data;
    var year = state.year, birth = state.birth, age = year - birth;
    var born = birth > D.lastEstimate ? 'Born ' + birth + ' <span class="mute">(projected)</span>' : 'Born ' + birth;
    var here = age >= 0 && age <= D.maxAge;

    els.who.innerHTML = here
      ? born + '. <span class="mute">Age</span> ' + age + ' <span class="mute">in</span> ' + year + '.'
      : born + '. <span class="mute">' + (age < 0 ? 'Not yet born in ' + year : 'Past 100 by ' + year) + '.</span>';
    els.titleA.textContent = D.name.replace(/^the /, '') + ' in ' + year;
    els.titleB.textContent = here ? (age === 0 ? 'A newborn' : 'A ' + age + '-year-old') + ' in ' + year : 'This person';
    els.a.innerHTML = canada(year, age);
    els.b.innerHTML = here ? person(year, birth, age)
      : '<p class="fine">Move the year ' + (age < 0 ? 'forward' : 'back') +
        ' to meet this person again, or click the line to choose someone else.</p>';
    els.keys.innerHTML = here ? '<li>' + keyPoints(year, birth, age).join('</li><li>') + '</li>'
      : '<li>Choose a point on the line to see key points for that person.</li>';
  }

  window.PersonView = { render: render };
})();
