/* ===== Weather Matrix — renders whatever the backend sends. No numbers live in this page. =====

   renderWeatherData(data)  — updates every text/gauge/list in weather.html. Every field is optional:
   a missing value simply shows "--" and its gauge stays empty.

   SCHEMA  (types only — all values come from the backend)
   {
     temp:     { now: number°C, surface: number°C, scaleHeight: number°C },
     location: { name: string, lat: number, lon: number, altitudeM: number },
     meta:     { season: string, sol: string, jd: string, utc: string, mtc: "HH:MM" },
     asset:    { name: string, text: string, lat: number, lon: number },            // optional
     wind:     { speedKmh: number, dirDeg: number 0-360 (0 = N), note: string },
     pressure: { mbar: number, minMbar: number, maxMbar: number },                 // min/max = gauge ends
     dust:     { visibilityKm: number, visibilityLabel: string, dust: number 0-1, ice: number 0-1, waterVaporPrUm: number, tau: number },
     sun:      { rise: "HH:MM", set: "HH:MM", ltst: "HH:MM", mtc: "HH:MM", note: string },
     uv:       { index: number, max: number, label: string, note: string },
     hourly:   [ { time: string, tempC: number } ],
     sols:     [ { label: string, pressureMbar: number, windKmh: number, tau: number, maxC: number, minC: number } ]
   }

   WHERE THE DATA COMES FROM
   1) data.json / mars_data.js  → key "weather"   (python export_data.py embeds weather_data.json if it exists)
   2) a running backend         → pollWeather("https://your-backend/weather.json", 30000)
   3) anything else             → call renderWeatherData(obj) yourself
*/
(function () {
  const $ = (id) => document.getElementById(id);
  const num = (v) => typeof v === "number" && isFinite(v);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const fmtT = (v) => (num(v) ? (Math.round(v * 10) / 10).toString() : "--");
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v == null || v === "" || (typeof v === "number" && !isFinite(v)) ? "--" : v; };
  const hours = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ""); return m ? +m[1] + +m[2] / 60 : null; };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const svgDust = () => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS("http://www.w3.org/2000/svg", "use"); u.setAttribute("href", "#dust"); s.appendChild(u); return s;
  };
  const fmtCoord = (v, pos, neg) => `${Math.abs(v)}°${v >= 0 ? pos : neg}`;

  function renderWeatherData(data) {
    const d = data || {};
    const T = d.temp || {}, L = d.location || {}, M = d.meta || {}, W = d.wind || {}, P = d.pressure || {};
    const DU = d.dust || {}, S = d.sun || {}, U = d.uv || {};
    $("feed-banner").hidden = !!data;
    setUplink(!!data);

    // hero
    setTemp(T.now, "NOW");
    set("w-temp-note", num(T.surface) && num(T.scaleHeight) ? `Surface at ${fmtT(T.surface)}°C and ${fmtT(T.scaleHeight)}°C at a scaleheight above` : "--");
    set("w-season", M.season); set("w-sol", M.sol); set("w-jd", M.jd); set("w-utc", M.utc);
    set("w-loc-name", L.name);
    set("w-loc-detail", num(L.lat) && num(L.lon) ? `${fmtCoord(L.lat, "N", "S")} ${fmtCoord(L.lon, "E", "W")}${num(L.altitudeM) ? " · Altitude: " + L.altitudeM + " m" : ""}` : "--");
    const A = d.asset; $("w-asset-row").hidden = !A;
    if (A) { set("w-asset-name", A.name); set("w-asset-text", A.text); set("w-asset-loc", num(A.lat) && num(A.lon) ? `Location ${A.lat}°N ${A.lon}°E` : ""); }
    set("w-mtc-top", M.mtc || S.mtc);

    // wind & pressure
    set("w-wind", num(W.speedKmh) ? W.speedKmh : null);
    $("w-compass").style.setProperty("--deg", (num(W.dirDeg) ? W.dirDeg : 0) + "deg");
    set("w-wind-note", W.note || "");
    set("w-press", num(P.mbar) ? P.mbar : null);
    $("w-press-lo").textContent = num(P.minMbar) ? "Low " + P.minMbar : "Low";
    $("w-press-hi").textContent = num(P.maxMbar) ? "High " + P.maxMbar : "High";
    $("w-arc").style.setProperty("--p", num(P.mbar) && num(P.minMbar) && num(P.maxMbar) && P.maxMbar > P.minMbar ? clamp01((P.mbar - P.minMbar) / (P.maxMbar - P.minMbar)) : 0);

    // dust / ice / visibility
    set("w-vis", num(DU.visibilityKm) ? DU.visibilityKm : null); $("w-vis-label").textContent = DU.visibilityLabel || "";
    set("w-dust", num(DU.dust) ? DU.dust : null); set("w-ice", num(DU.ice) ? DU.ice : null);
    $("w-dust-knob").style.setProperty("--p", num(DU.dust) ? clamp01(DU.dust) : 0);
    $("w-ice-knob").style.setProperty("--p", num(DU.ice) ? clamp01(DU.ice) : 0);
    set("w-vapor", num(DU.waterVaporPrUm) ? `${DU.waterVaporPrUm} pr-μm of water vapor above${num(DU.tau) ? " · τ " + DU.tau : ""}` : "--");

    // sun
    set("w-ltst-big", S.ltst); set("w-rise", S.rise); set("w-set", S.set); $("w-sun-note").textContent = S.note || "";
    drawSun(hours(S.rise), hours(S.set), hours(S.ltst));

    // uv
    set("w-uv", num(U.index) ? U.index : null); $("w-uv-label").textContent = U.label || ""; $("w-uv-note").textContent = U.note || "";
    $("w-uv-knob").style.setProperty("--p", num(U.index) && num(U.max) && U.max > 0 ? clamp01(U.index / U.max) : 0);

    // lists (scales come from the data itself)
    const temps = [].concat((d.hourly || []).map((h) => h.tempC), (d.sols || []).flatMap((s) => [s.maxC, s.minC])).filter(num);
    const range = temps.length ? { lo: Math.min(...temps), hi: Math.max(...temps) } : null;
    drawHourly(d.hourly || [], range);
    drawSols(d.sols || [], range);
  }

  function setTemp(t, label) {
    set("w-temp", num(t) ? fmtT(t) : null);
    const box = $("temp"); box.classList.remove("cold", "warm");
    if (num(t)) box.classList.add(t > -45 ? "warm" : "cold");
    set("hero-label", label);
  }

  // Sun arc between sunrise and sunset on a 24 h axis; marker at the current local solar time
  function drawSun(rise, set_, now) {
    const X = (h) => 10 + (h / 24) * 280;
    const arc = $("w-day-arc"), rs = $("w-rise-set"), dot = $("w-sun-dot");
    if (rise == null || set_ == null) { arc.setAttribute("d", ""); rs.setAttribute("d", ""); dot.setAttribute("cx", -20); return; }
    const xr = X(rise), xs = X(set_), k = (xs - xr) * 0.25;
    arc.setAttribute("d", `M${xr} 100 C ${xr + k} 5, ${xs - k} 5, ${xs} 100 Z`);
    rs.setAttribute("d", `M${xr} 100 l0 -12 M${xs} 100 l0 -12`);
    if (now == null) { dot.setAttribute("cx", -20); return; }
    const up = now >= rise && now <= set_;
    dot.setAttribute("cx", X(now));
    dot.setAttribute("cy", up ? 100 - 95 * Math.sin(Math.PI * (now - rise) / (set_ - rise)) : 100);
  }

  function drawHourly(list, range) {
    const box = $("w-hours"); box.textContent = "";
    if (!list.length) { box.appendChild(el("p", "empty", "--")); return; }
    list.forEach((h, i) => {
      const b = el("button", "hr" + (i === 0 ? " is-active" : "")); b.type = "button";
      const frac = range && range.hi > range.lo && num(h.tempC) ? clamp01((h.tempC - range.lo) / (range.hi - range.lo)) : 0;
      const sw = el("span", "spark-wrap"), sp = el("i", "spark"); sp.style.setProperty("--h", frac.toFixed(2)); sw.appendChild(sp);
      b.append(el("span", "t", h.time), sw, svgDust(), el("span", "v", num(h.tempC) ? fmtT(h.tempC) + "°C" : "--"));
      b.addEventListener("click", () => {
        box.querySelectorAll(".hr").forEach((x) => x.classList.toggle("is-active", x === b));
        setTemp(h.tempC, i === 0 ? "NOW" : h.time + " FORECAST");
      });
      box.appendChild(b);
    });
  }

  function drawSols(list, range) {
    const box = $("w-sols"); box.textContent = "";
    if (!list.length) { box.appendChild(el("p", "empty", "--")); return; }
    const pos = (v) => (range && range.hi > range.lo && num(v) ? clamp01((v - range.lo) / (range.hi - range.lo)) : 0);
    list.forEach((s) => {
      const row = el("div", "sol"), stats = el("span", "sol__v");
      [["P", num(s.pressureMbar) ? `< ${s.pressureMbar} mbar` : "--"], ["W", num(s.windKmh) ? `< ${s.windKmh} km/h` : "--"], ["τ", num(s.tau) ? `< ${s.tau} tau` : "--"]].forEach(([k, v]) => {
        const line = el("span"); line.append(el("i", null, k), document.createTextNode(v)); stats.appendChild(line);
      });
      const hi = el("span"), lo = el("span");
      hi.append("MAX ", el("b", null, num(s.maxC) ? fmtT(s.maxC) + "°C" : "--"));
      lo.append("MIN ", el("b", null, num(s.minC) ? fmtT(s.minC) + "°C" : "--"));
      const bar = el("div", "range");
      [s.maxC, s.minC].forEach((v) => { const k = el("i", "knob"); k.style.setProperty("--p", pos(v).toFixed(3)); bar.appendChild(k); });
      const head = el("div", "range-box__t"); head.append(hi, lo);
      const rb = el("div", "range-box"); rb.append(head, bar);
      row.append(el("span", "sol__d", s.label), svgDust(), stats, rb);
      box.appendChild(row);
    });
  }

  // Typewriter status line — says whether the backend actually sent weather
  let msgs = [], typing = false;
  function setUplink(connected) {
    msgs = connected ? ["[ BACKEND WEATHER FEED CONNECTED ]", "[ RENDERING DATA PACKET ]"] : ["[ AWAITING BACKEND FEED ]", "[ NO WEATHER DATA RECEIVED ]"];
    if (typing) return; typing = true;
    const out = $("uplink");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { out.textContent = msgs[0]; return; }
    (function loop(m = 0, c = 0, del = false) {
      const text = msgs[m % msgs.length];
      out.textContent = text.slice(0, c);
      if (!del && c < text.length) return setTimeout(() => loop(m, c + 1), 55);
      if (!del) return setTimeout(() => loop(m, c, true), 1800);
      if (c > 0) return setTimeout(() => loop(m, c - 1, true), 22);
      setTimeout(() => loop(m + 1), 300);
    })();
  }

  // Pull fresh weather from a backend endpoint on an interval (needs http/https, not file://)
  function pollWeather(url, ms) {
    const tick = () => fetch(url, { cache: "no-store" }).then((r) => r.json()).then(renderWeatherData).catch(() => {});
    tick(); return setInterval(tick, ms || 30000);
  }

  window.renderWeatherData = renderWeatherData;
  window.pollWeather = pollWeather;

  // Boot: the weather block of the backend dataset (null => empty "awaiting feed" state)
  renderWeatherData(null);
  if (window.MarsData) MarsData.ready.then((D) => renderWeatherData(D.weather || null)).catch(() => {});
})();
