/* The sculpture view: every year's line stood upright and turned 5 degrees
   from the one before. Height = age, distance from the centre = people.

   The model is translucent and drawn without perspective, and choosing a
   year turns that year's line flat to the screen, so it can be read exactly
   like the line chart. Dragging turns the model freely. */
(function () {
  var STEP = 5 * Math.PI / 180;      // 5 degrees per year: 61 years = 300 degrees
  var HEIGHT = 2.0;                  // age 0..100 in scene units
  var THREE = window.THREE, G = window.GENERATIONS;

  var D, canvas, labelsEl, onPick;
  var renderer, scene, camera, group, raycaster;
  var surfaces = [], colourJobs = [];
  var yearTube = null, yearFace = null, dot = null, matYear, matFace, matLife;
  var RS = 1, nYears = 0;
  var state = null, active = false, running = false, dirty = true;
  var yaw = 0, userYaw = 0, pitch = 0, pitchTarget = 0, lastYear = null, highlight = null;
  var labelEls = [], ageLabelEls = [];

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Position of (year index, age) on the surface. lift pushes it outward a hair.
  function at(i, age, lift, out) {
    var r = D.pop[i][age] * RS + (lift || 0), t = i * STEP;
    return (out || new THREE.Vector3()).set(r * Math.cos(t), age / D.maxAge * HEIGHT, r * Math.sin(t));
  }

  function material(opacity, vertexColours) {
    var isTransparent = opacity < 1.0;
    return new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      transparent: isTransparent,
      opacity: opacity,
      depthWrite: !isTransparent,   // true when opaque (1.0), false when transparent
      vertexColors: !!vertexColours
    });
  }
  function overlay(opacity) {          // drawn last, never hidden by the model
    return new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide, transparent: true, opacity: opacity, depthTest: false, depthWrite: false
    });
  }

  // The outer skin for year indices i0..i1, coloured by generation and age
  // band, plus its floor and lid.
  function buildSurface(i0, i1, opacity) {
    var A = D.maxAge + 1, n = i1 - i0 + 1, pos = [], idx = [], v = new THREE.Vector3(), i, a;
    for (i = 0; i < n; i++) for (a = 0; a < A; a++) { at(i0 + i, a, 0, v); pos.push(v.x, v.y, v.z); }
    for (i = 0; i < n - 1; i++) for (a = 0; a < A - 1; a++) {
      var p = i * A + a, q = (i + 1) * A + a;
      idx.push(p, q, q + 1, p, q + 1, p + 1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * A * 3), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    var mesh = new THREE.Mesh(g, material(opacity, true));
    group.add(mesh);
    surfaces.push(mesh);

    colourJobs.push(function () {
      var gens = {};
      var quiet = new THREE.Color(token('--clay-2'));
      G.list.forEach(function (gen) { gens[gen.token] = new THREE.Color(token(gen.token)); });
      var c = new THREE.Color(), arr = g.attributes.color.array, k = 0;
      for (var i = 0; i < n; i++) for (var a = 0; a < A; a++) {
        var tk = G.of(D.y0 + i0 + i - a).token;
        c.copy(gens[tk]);
        if (highlight && tk !== highlight) c.lerp(quiet, 0.85);   // fade the others
        arr[k++] = c.r; arr[k++] = c.g; arr[k++] = c.b;
      }
      g.attributes.color.needsUpdate = true;
    });

    [0, D.maxAge].forEach(function (age) {       // floor and lid: fans to the axis
      var fp = [0, age / D.maxAge * HEIGHT, 0], fi = [];
      for (i = 0; i < n; i++) { at(i0 + i, age, 0, v); fp.push(v.x, v.y, v.z); }
      for (i = 1; i < n; i++) fi.push(0, i, i + 1);
      plain(fp, fi, opacity);
    });
  }

  function plain(positions, indices, opacity) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    var m = material(opacity, false);
    colourJobs.push(function () { m.color.set(token('--clay')); });
    group.add(new THREE.Mesh(g, m));
  }

  // One year's line filled in to the axis, as positions + indices.
  function faceGeometry(i) {
    var pos = [], idx = [], v = new THREE.Vector3(), a;
    for (a = 0; a <= D.maxAge; a++) { at(i, a, 0, v); pos.push(0, v.y, 0, v.x, v.y, v.z); }
    for (a = 0; a < D.maxAge; a++) { var p = a * 2; idx.push(p, p + 1, p + 3, p, p + 3, p + 2); }
    return { pos: pos, idx: idx };
  }

  function lines(pos, tokenName, opacity) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var m = new THREE.LineBasicMaterial({ transparent: true, opacity: opacity, depthWrite: false });
    colourJobs.push(function () { m.color.set(token(tokenName)); });
    group.add(new THREE.LineSegments(g, m));
  }
  function ring(age, pos) {
    var a = new THREE.Vector3(), b = new THREE.Vector3();
    for (var i = 0; i < nYears - 1; i++) {
      at(i, age, 0.004, a); at(i + 1, age, 0.004, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  // Thin lines every 20 years of age and every 10 calendar years
  function buildGrid() {
    var pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), i, age;
    for (age = 20; age < D.maxAge; age += 20) ring(age, pos);
    for (i = 0; i < nYears; i++) {
      if ((D.y0 + i) % 10 !== 0) continue;
      for (age = 0; age < D.maxAge; age++) {
        at(i, age, 0.005, a); at(i, age + 1, 0.005, b);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    lines(pos, '--ink-3', 0.85);
  }

  function tube(points, radius, mat) {
    var curve = new THREE.CatmullRomCurve3(points);
    var m = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, radius, 8, false), mat);
    m.renderOrder = 10;
    return m;
  }
  function swap(old, fresh) {
    if (old) { group.remove(old); old.geometry.dispose(); }
    if (fresh) group.add(fresh);
    return fresh;
  }

  function applyColours() {
    colourJobs.forEach(function (job) { job(); });
    dirty = true; kick();
  }

  // Build (or rebuild, when the country changes) everything made from the data.
  function build() {
    if (group) {
      scene.remove(group);
      group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    }
    group = new THREE.Group();
    scene.add(group);
    surfaces = []; colourJobs = []; yearTube = null; yearFace = null; lastYear = null;

    nYears = D.pop.length;
    var mx = 0, f;
    D.pop.forEach(function (col) { col.forEach(function (v) { if (v > mx) mx = v; }); });
    RS = 1 / mx;

    buildSurface(0, nYears - 1, 1.0);
    f = faceGeometry(0); plain(f.pos, f.idx, 1.0);
    f = faceGeometry(nYears - 1); plain(f.pos, f.idx, 1.0);
    buildGrid();

    colourJobs.push(function () {
      matYear.color.set(token('--ink')); matFace.color.set(token('--ink')); matLife.color.set(token('--accent'));
    });
    dot = new THREE.Mesh(new THREE.SphereGeometry(0.034, 24, 16), matLife);
    dot.renderOrder = 11;
    group.add(dot);

    labelsEl.innerHTML = ''; labelEls = []; ageLabelEls = [];
    for (var y = Math.ceil(D.y0 / 10) * 10; y <= D.y1; y += 10) {
      var s = document.createElement('span');
      s.textContent = y;
      labelsEl.appendChild(s);
      labelEls.push({ year: y, el: s });
    }
    for (var a = 20; a <= D.maxAge; a += 20) {
      var el = document.createElement('span');
      el.className = 'age-axis-label';
      el.textContent = a + ' yrs';
      labelsEl.appendChild(el);
      ageLabelEls.push({ age: a, el: el });
    }
  }

  // ------------------------------------------------------------------ setup
  function init(canvasEl, labels, data, pick) {
    canvas = canvasEl; labelsEl = labels; D = data; onPick = pick;
    if (!THREE) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (err) {
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.92));
    var sun = new THREE.DirectionalLight(0xffffff, 0.25);
    sun.position.set(-2.5, 4, 3.5);
    scene.add(sun);
    raycaster = new THREE.Raycaster();
    matYear = overlay(1); matLife = overlay(1); matFace = material(1.0, false);
    build();

    applyColours();
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyColours);
    new MutationObserver(applyColours).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    new ResizeObserver(resize).observe(canvas.parentNode);
    pointer();
    return true;
  }

  function resize() {
    var w = canvas.parentNode.clientWidth, h = canvas.parentNode.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    // The axis sits on the left edge, so only the half of the model on the
    // chosen year's side is in view.
    var aspect = w / h, half = Math.max(1.17, 0.56 / aspect);   // fit height, or width when narrow
    camera.left = 0; camera.right = 2 * half * aspect;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
    dirty = true;
    kick();
  }

  // ----------------------------------------------------------- interaction
  function pointer() {
    var down = null;
    canvas.addEventListener('pointerdown', function (e) {
      down = { x: e.clientX, y: e.clientY, moved: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
      canvas.classList.add('dragging');
      if (labelsEl) labelsEl.classList.add('dragging-hide');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.moved += Math.abs(dx) + Math.abs(dy);
      down.x = e.clientX; down.y = e.clientY;
      userYaw += dx * 0.008;
      pitch = pitchTarget = Math.max(-0.2, Math.min(1.25, pitch + dy * 0.006));
      yaw = target();                 // follow the hand directly while dragging
      dirty = true; kick();
    });
    function up(e) {
      if (!down) return;
      canvas.classList.remove('dragging');
      if (down.moved < 6 && e.type === 'pointerup') pick(e);
      down = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  function pick(e) {
    var box = canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(surfaces, false);
    if (!hits.length) return;
    var p = group.worldToLocal(hits[0].point.clone());
    var t = Math.atan2(p.z, p.x);
    if (t < -STEP / 2) t += Math.PI * 2;
    var i = Math.max(0, Math.min(nYears - 1, Math.round(t / STEP)));
    var age = Math.max(0, Math.min(D.maxAge, Math.round(p.y / HEIGHT * D.maxAge)));
    onPick(D.y0 + i, age);
  }

  // ----------------------------------------------------------------- render
  // The turn that puts the chosen year's line flat on the screen, pointing right.
  function target() {
    return (state ? (state.year - D.y0) * STEP : 0) + userYaw;
  }

  function sync() {
    if (!state) return;
    var i = state.year - D.y0, a, pts;
    if (state.year !== lastYear) {
      pts = [];
      for (a = 0; a <= D.maxAge; a += 2) pts.push(at(i, a, 0.004));
      yearTube = swap(yearTube, tube(pts, 0.0075, matYear));
      var f = faceGeometry(i), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
      g.setIndex(f.idx);
      var face = new THREE.Mesh(g, matFace);
      face.renderOrder = 9;
      yearFace = swap(yearFace, face);
      lastYear = state.year;
    }
    var age = state.year - state.birth;
    dot.visible = age >= 0 && age <= D.maxAge;
    if (dot.visible) at(i, age, 0.006, dot.position);
  }

  function draw() {
    group.rotation.y = yaw;
    var cy = HEIGHT * 0.455;
    camera.position.set(0, cy + 10 * Math.sin(pitch), 10 * Math.cos(pitch));
    camera.lookAt(-0.75, cy, 0);  // location of axis for model - 0 of edge
    renderer.render(scene, camera);

    // decade labels around the base
    var w = canvas.clientWidth, h = canvas.clientHeight, v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    labelEls.forEach(function (l) {
      var i = l.year - D.y0, t = i * STEP, r = D.pop[i][0] * RS + 0.1;
      v.set(r * Math.cos(t), -0.09, r * Math.sin(t)).applyAxisAngle(up, yaw);
      var facing = v.z;
      v.project(camera);
      l.el.style.left = ((v.x + 1) / 2 * w).toFixed(1) + 'px';
      l.el.style.top = ((1 - v.y) / 2 * h).toFixed(1) + 'px';
      // seen flat-on, the far labels would sit on top of the near ones: hide them
      l.el.style.opacity = facing < -0.3 ? (pitch < 0.2 ? 0 : 0.4) : 1;
      l.el.className = state && l.year === state.year ? 'on' : '';
    });

    // age labels along the right edge
    ageLabelEls.forEach(function (al) {
      v.set(0, (al.age / D.maxAge) * HEIGHT, 0);
      v.project(camera);
      al.el.style.top = ((1 - v.y) / 2 * h).toFixed(1) + 'px';
    });
  }

  function frame() {
    if (!active) { running = false; return; }
    var d = target() - yaw, dp = pitchTarget - pitch, moving = false;
    if (Math.abs(d) > 0.0008) { yaw += d * 0.18; moving = true; } else if (d !== 0) { yaw = target(); dirty = true; }
    if (Math.abs(dp) > 0.0008) { pitch += dp * 0.18; moving = true; } else if (dp !== 0) { pitch = pitchTarget; dirty = true; }
    if (moving || dirty) { dirty = false; draw(); }
    if (moving) next(); else running = false;
  }
  function next() {
    // requestAnimationFrame never fires in a background tab; fall back to a timer.
    if (document.hidden) setTimeout(frame, 40); else requestAnimationFrame(frame);
  }
  function kick() {
    if (active && !running) { running = true; next(); }
  }

  // -------------------------------------------------------------- 3D print
  // A detailed solid for printing, as a binary STL. Z is up.
  //   - 400 mm tall (4 mm per year of age); the widest age reaches 200 mm.
  //   - The data is smoothed slightly, then meshed finely (about 1 mm steps).
  //   - Grooves mark every 10 years of age and every 10th calendar year.
  //   - The two flat cut faces carry engraved age lines, age numbers and the
  //     first and last year.
  // The mesh is closed: every edge is shared by exactly two triangles.
  function exportSTL() {
    var MM = 4, RMAX = 200;            // mm per year of age; mm at the widest age
    var SUBY = 6, SUBA = 4;            // mesh steps per calendar year / per year of age
    var K = 200;                       // mesh steps across each flat face
    var DEPTH = 1.0, HALF = 1.3;       // groove depth and half-width, mm
    var n = D.pop.length, A = D.maxAge + 1, i, a, c, r, k;

    // 1. smooth slightly: a 1-2-1 average across ages, then across years
    function blur(src, alongAge) {
      var out = [];
      for (var i = 0; i < n; i++) {
        out.push(new Float32Array(A));
        for (var a = 0; a < A; a++) {
          var lo = alongAge ? src[i][Math.max(0, a - 1)] : src[Math.max(0, i - 1)][a];
          var hi = alongAge ? src[i][Math.min(A - 1, a + 1)] : src[Math.min(n - 1, i + 1)][a];
          out[i][a] = (lo + 2 * src[i][a] + hi) / 4;
        }
      }
      return out;
    }
    var S = blur(blur(D.pop, true), false), mx = 0;
    for (i = 0; i < n; i++) for (a = 0; a < A; a++) if (S[i][a] > mx) mx = S[i][a];

    // 2. a smooth curve through the points (Catmull-Rom), for in-between values
    function cr(p0, p1, p2, p3, t) {
      return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    }
    function alongAges(col, af) {
      var j = Math.min(A - 2, Math.floor(af)), t = af - j;
      return cr(col[Math.max(0, j - 1)], col[j], col[j + 1], col[Math.min(A - 1, j + 2)], t);
    }
    function val(yf, af) {
      var j = Math.min(n - 2, Math.floor(yf)), t = yf - j;
      return Math.max(0, cr(alongAges(S[Math.max(0, j - 1)], af), alongAges(S[j], af),
        alongAges(S[j + 1], af), alongAges(S[Math.min(n - 1, j + 2)], af), t));
    }
    function groove(d) { return d < HALF ? 0.5 * (1 + Math.cos(Math.PI * d / HALF)) : 0; }
    function toTen(x) { return Math.abs(x - Math.round(x / 10) * 10); }

    // 3. the skin, as a grid of points with the grooves cut in
    var C = (n - 1) * SUBY + 1, R = (A - 1) * SUBA + 1;
    var px = new Float32Array(C * R), py = new Float32Array(C * R), pz = new Float32Array(C * R), rad = new Float32Array(C * R);
    for (c = 0; c < C; c++) {
      var yf = c / SUBY, t = yf * STEP, yearAbs = D.y0 + yf;
      var innerYear = yearAbs > D.y0 + 2 && yearAbs < D.y1 - 2;
      for (r = 0; r < R; r++) {
        var af = r / SUBA, rr = val(yf, af) / mx * RMAX, g = 0;
        if (af > 5 && af < D.maxAge - 5) g = groove(toTen(af) * MM);
        if (innerYear) g = Math.max(g, groove(toTen(yearAbs) * STEP * rr));
        rr = Math.max(0.2, rr - DEPTH * g * Math.min(1, rr / 6));
        var q = c * R + r;
        rad[q] = rr; px[q] = rr * Math.cos(t); py[q] = rr * Math.sin(t); pz[q] = af * MM;
      }
    }

    // 4. writing triangles straight into the file
    var cap = 2 * (C - 1) * (R - 1) + 2 * (C - 1) + 2 * (2 * K * (R - 3) + 2 * (K + 1));
    var buf = new ArrayBuffer(84 + cap * 50), dv = new DataView(buf), o = 84, count = 0;
    function tri(ax, ay, az, bx, by, bz, cx, cy, cz, ox, oy, oz) {
      var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, s;
      if (nx * ox + ny * oy + nz * oz < 0) {            // face it outward
        s = bx; bx = cx; cx = s; s = by; by = cy; cy = s; s = bz; bz = cz; cz = s;
        nx = -nx; ny = -ny; nz = -nz;
      }
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      dv.setFloat32(o, nx / len, true); dv.setFloat32(o + 4, ny / len, true); dv.setFloat32(o + 8, nz / len, true);
      dv.setFloat32(o + 12, ax, true); dv.setFloat32(o + 16, ay, true); dv.setFloat32(o + 20, az, true);
      dv.setFloat32(o + 24, bx, true); dv.setFloat32(o + 28, by, true); dv.setFloat32(o + 32, bz, true);
      dv.setFloat32(o + 36, cx, true); dv.setFloat32(o + 40, cy, true); dv.setFloat32(o + 44, cz, true);
      o += 50; count++;
    }
    function skinTri(q1, q2, q3, ox, oy, oz) {
      tri(px[q1], py[q1], pz[q1], px[q2], py[q2], pz[q2], px[q3], py[q3], pz[q3], ox, oy, oz);
    }
    var top = Math.fround((R - 1) / SUBA * MM);
    for (c = 0; c < C - 1; c++) {
      var tm = (c + 0.5) / SUBY * STEP, ox = Math.cos(tm), oy = Math.sin(tm);
      for (r = 0; r < R - 1; r++) {
        var p = c * R + r, q2 = p + R;
        skinTri(p, q2, q2 + 1, ox, oy, 0);
        skinTri(p, q2 + 1, p + 1, ox, oy, 0);
      }
      var b0 = c * R, b1 = b0 + R, t0 = b0 + R - 1, t1 = b1 + R - 1;
      tri(0, 0, 0, px[b0], py[b0], 0, px[b1], py[b1], 0, 0, 0, -1);               // floor
      tri(0, 0, top, px[t0], py[t0], top, px[t1], py[t1], top, 0, 0, 1);          // lid
    }

    // 5. the two flat faces, with engraved lines and lettering
    var P = 2, MW = (RMAX + 6) * P, MH = D.maxAge * MM * P;                        // mask: 2 px per mm
    function mask(col, label, mirror) {
      var cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, MW, MH); ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
      function radiusAt(age) { return rad[col * R + Math.round(age * SUBA)]; }
      function text(str, rho, z, sizePx) {
        ctx.font = '600 ' + sizePx + 'px Geist, Helvetica, Arial, sans-serif';
        var w = ctx.measureText(str).width;
        ctx.save();
        if (mirror) { ctx.translate(rho * P + w, MH - z * P); ctx.scale(-1, 1); } else ctx.translate(rho * P, MH - z * P);
        ctx.fillText(str, 0, 0);
        ctx.restore();
      }
      for (var age = 10; age < D.maxAge; age += 10) {
        var rr = radiusAt(age);
        ctx.fillRect(6 * P, MH - age * MM * P - 0.7 * P, Math.max(0, rr - 9) * P, 1.4 * P);
        if (rr > 40) text(String(age), 8, age * MM + 2.5, 18);
      }
      // the year goes in whichever ten-year band of the face is widest
      var room = 0, band = 20;
      for (var b = 0; b <= 80; b += 10) {
        var narrowest = Infinity;
        for (age = b + 1; age <= b + 8; age++) narrowest = Math.min(narrowest, radiusAt(age));
        if (narrowest > room) { room = narrowest; band = b; }
      }
      var size = 72;
      ctx.font = '600 ' + size + 'px Geist, Helvetica, Arial, sans-serif';
      var want = ctx.measureText(label).width / P, fit = room - 30 - 8;
      if (want > fit) size = Math.max(16, Math.floor(size * fit / want));
      text(label, 30, band * MM + 7, size);

      var img = ctx.getImageData(0, 0, MW, MH).data, m = new Float32Array(MW * MH), b = new Float32Array(MW * MH), x, y;
      for (x = 0; x < MW * MH; x++) m[x] = img[x * 4] / 255;
      for (y = 1; y < MH - 1; y++) for (x = 1; x < MW - 1; x++) {                 // soften the edges
        var w = y * MW + x;
        b[w] = (m[w - 1] + m[w + 1] + m[w - MW] + m[w + MW] + 4 * m[w]) / 8;
      }
      return function (rho, z) {
        var fx = rho * P, fy = MH - z * P, x0 = Math.floor(fx), y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= MW - 1 || y0 >= MH - 1) return 0;
        var tx = fx - x0, ty = fy - y0, w = y0 * MW + x0;
        return (b[w] * (1 - tx) + b[w + 1] * tx) * (1 - ty) + (b[w + MW] * (1 - tx) + b[w + MW + 1] * tx) * ty;
      };
    }
    function ramp(x, lo, hi) { var t = Math.max(0, Math.min(1, (x - lo) / (hi - lo))); return t * t * (3 - 2 * t); }

    function face(col, T, label, mirror, sign) {
      var cs = Math.cos(T), sn = Math.sin(T), ox = -sn * sign, oy = cs * sign;     // pointing out of the solid
      var h = mask(col, label, mirror), fx = new Float32Array(R * (K + 1)), fy = new Float32Array(R * (K + 1));
      var r, k, w;
      function zOf(row) { return pz[row]; }                                        // same heights as the skin
      for (r = 0; r < R; r++) {
        var rr = rad[col * R + r], z = zOf(r);
        for (k = 0; k <= K; k++) {
          var rho = k / K * rr, d = 0;
          w = r * (K + 1) + k;
          if (k > 0 && k < K) d = -DEPTH * h(rho, z) * ramp(rho, 4, 7) * ramp(rr - rho, 1.5, 4);
          if (k === K) { fx[w] = px[col * R + r]; fy[w] = py[col * R + r]; }        // exactly the skin's edge
          else if (k === 0) { fx[w] = 0; fy[w] = 0; }                               // exactly the axis
          else { fx[w] = rho * cs + ox * d; fy[w] = rho * sn + oy * d; }
        }
      }
      function f(w1, z1, w2, z2, w3, z3) { tri(fx[w1], fy[w1], z1, fx[w2], fy[w2], z2, fx[w3], fy[w3], z3, ox, oy, 0); }
      for (r = 1; r < R - 2; r++) {
        var z0 = zOf(r), z1 = zOf(r + 1);
        for (k = 0; k < K; k++) {
          w = r * (K + 1) + k;
          var u = w + K + 1;
          f(w, z0, w + 1, z0, u + 1, z1);
          f(w, z0, u + 1, z1, u, z1);
        }
      }
      // first and last rows: fans, so the floor and lid edges stay single
      [[0, 1], [R - 1, R - 2]].forEach(function (pair) {
        var e = pair[0], nb = pair[1], ze = zOf(e), zn = zOf(nb), apex = e * (K + 1), rim = apex + K;
        var row = nb * (K + 1);
        f(apex, ze, rim, ze, row + K, zn);
        for (var k = K; k > 0; k--) f(apex, ze, row + k, zn, row + k - 1, zn);
      });
    }
    face(0, 0, String(D.y0), false, -1);
    face(C - 1, (n - 1) * STEP, String(D.y1), true, 1);

    'Demographics made Sculptural'.split('').forEach(function (ch, j) { dv.setUint8(j, ch.charCodeAt(0)); });
    dv.setUint32(80, count, true);
    return { blob: new Blob([buf.slice(0, 84 + count * 50)], { type: 'model/stl' }), triangles: count, height: D.maxAge * MM };
  }

  window.SculptureView = {
    init: init,
    setData: function (data) {
      D = data;
      if (!renderer) return;
      build(); applyColours();
      if (state) { sync(); dirty = true; kick(); }
    },
    exportSTL: exportSTL,
    highlight: function (tokenName) {
      if (highlight === tokenName) return;
      highlight = tokenName;
      if (renderer) applyColours();
    },
    setActive: function (on) {
      active = on;
      if (on) { resize(); yaw = target(); pitch = pitchTarget; dirty = true; kick(); }
    },
    // hold: keep the view exactly where it is (used when the person was chosen
    // by clicking the sculpture, so the point does not spin away from the click).
    // Otherwise a change of year turns that year's line flat to the screen.
    render: function (s, hold) {
      var changed = !state || lastYear !== s.year;
      state = s;
      if (!renderer) return;
      if (hold) userYaw = yaw - (s.year - D.y0) * STEP;
      else if (changed) {
        userYaw = 0; pitchTarget = 0;
        if (labelsEl) labelsEl.classList.remove('dragging-hide');
      }
      sync(); dirty = true; kick();
    }
  };
})();
