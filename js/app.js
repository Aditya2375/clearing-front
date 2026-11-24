'use strict';
(async () => {
  const $ = (id) => document.getElementById(id);
  const meta = await (await fetch('data/meta.json')).json();
  const buf = async (f) => new Uint8Array(await (await fetch('data/' + f)).arrayBuffer());
  const status = await buf('status.bin');
  const u16 = async (f) => { const b = await buf(f); return new Uint16Array(b.buffer, b.byteOffset, b.length / 2); };
  const risk = await u16('risk.bin'), base = await u16('base.bin');
  const W = meta.w, H = meta.h, edge = meta.cut + meta.gap, N = W * H;
  const pct = (x, d = 0) => (x * 100).toFixed(d) + '%';
  // held-out cells: forest (status 1 or 3) right of the gap
  const held = [];
  for (let i = 0; i < N; i++) if ((status[i] === 1 || status[i] === 3) && i % W >= edge) held.push(i);
  const outcomeOf = (i) => status[i] === 3;
  const rank = (arr) => Uint32Array.from(held).sort((a, b) => arr[b] - arr[a]);
  const orderModel = rank(risk), orderBase = rank(base);
  let cleared = 0; for (const i of held) if (outcomeOf(i)) cleared++;
  const at = (order, f) => { const k = Math.round(order.length * f); let hit = 0; for (let j = 0; j < k; j++) if (outcomeOf(order[j])) hit++; return { p: hit / k, r: hit / cleared }; };

  const m = meta, M = m.model;
  document.querySelector('[data-k=cells]').textContent = held.length.toLocaleString('en-US');
  document.querySelector('[data-k=rate]').textContent = pct(cleared / held.length);
  const a5 = at(orderModel, 0.05);
  document.querySelector('[data-k=p5]').textContent = pct(a5.p);
  document.querySelector('[data-k=lift]').textContent = (a5.p / (cleared / held.length)).toFixed(1) + 'x';

  const cv = $('cv'), ctx = cv.getContext('2d'), img = ctx.createImageData(W, H);
  const COL = { bg: [7, 10, 8], forest: [31, 74, 42], past: [140, 118, 78], gone: [255, 106, 61], none: [20, 28, 21] };
  const ramp = (t) => { // dark green to yellow to red
    t = Math.min(1, Math.max(0, t)); if (t < .5) { const u = t / .5; return [31 + u * 190, 74 + u * 130, 42 - u * 10]; } const u = (t - .5) / .5; return [221 + u * 34, 204 - u * 140, 32 + u * 20];
  };
  let layer = 'outcome', flagPct = 10, flagSet = null;
  const maxRisk = (() => { let s = 0; for (const i of held) s = Math.max(s, risk[i]); return s || 1; })();
  function paint() {
    for (let i = 0; i < N; i++) {
      const s = status[i], x = i % W; let c;
      if (s === 0) c = COL.none; else if (s === 2) c = COL.past;
      else if (layer === 'outcome') c = s === 3 ? COL.gone : COL.forest;
      else if (layer === 'risk') c = ramp(risk[i] / maxRisk);
      else { // flagged vs outcome, held-out side only
        if (x < edge) c = s === 3 ? [70, 52, 40] : [24, 50, 31];
        else { const f = flagSet.has(i), g = s === 3; c = f && g ? [198, 240, 106] : f && !g ? [255, 106, 61] : !f && g ? [110, 80, 200] : [24, 50, 31]; }
      }
      const o = i * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#c6f06a'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.cut + 4, 0); ctx.lineTo(m.cut + 4, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '12px monospace'; ctx.fillStyle = '#000a'; ctx.fillRect(m.cut - 58, 4, 52, 18); ctx.fillRect(m.cut + 14, 4, 74, 18); ctx.fillStyle = '#c6f06a'; ctx.fillText('train', m.cut - 50, 17); ctx.fillText('held out', m.cut + 20, 17);
  }
  const sw = (c, t) => `<span><i style="background:rgb(${c.join(',')})"></i>${t}</span>`;
  function legend() {
    $('legend').innerHTML = layer === 'outcome' ? sw(COL.forest, 'standing forest, still there in 2023') + sw(COL.gone, 'cleared 2016 to 2023') + sw(COL.past, 'already cleared by 2015') + sw(COL.none, 'other land')
      : layer === 'risk' ? sw(ramp(0), 'low risk') + sw(ramp(.5), 'medium') + sw(ramp(1), 'high risk') + sw(COL.past, 'already cleared by 2015')
        : sw([198, 240, 106], 'flagged and cleared (hit)') + sw([255, 106, 61], 'flagged, not cleared (false alarm)') + sw([110, 80, 200], 'cleared but not flagged (miss)') + sw([24, 50, 31], 'not flagged, not cleared');
  }
  function live() {
    const f = flagPct / 100, a = at(orderModel, f), b = at(orderBase, f);
    $('pct').textContent = flagPct; $('mp').textContent = pct(a.p); $('mr').textContent = pct(a.r); $('bp').textContent = pct(b.p); $('br').textContent = pct(b.r);
    flagSet = new Set(Array.from(orderModel.subarray(0, Math.round(orderModel.length * f))));
    if (layer === 'flag') paint();
  }
  function setLayer(l) {
    layer = l; document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.layer === l));
    $('flagctl').hidden = l !== 'flag'; live(); paint(); legend();
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setLayer(b.dataset.layer)));
  $('slider').addEventListener('input', (e) => { flagPct = Number(e.target.value); live(); });
  // hover read-out
  const tip = $('tip'), NAMES = ['other land', 'standing forest, not cleared by 2023', 'already cleared by 2015', 'standing in 2015, cleared 2016 to 2023'];
  const lonPer = m.deg_w / W, latPer = m.deg_h / H;
  const cellKm = lonPer * 111.32 * Math.cos(((m.lat_top - m.deg_h / 2) * Math.PI) / 180);
  const shown = () => cv.getBoundingClientRect().width;
  const setScale = () => document.querySelector('.scale i').style.setProperty('--sw', ((10 / cellKm) * (shown() / W)).toFixed(1) + 'px');
  setScale(); new ResizeObserver(setScale).observe(cv);
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) { tip.hidden = true; return; }
    const i = y * W + x, s = status[i], lat = m.lat_top - (y + .5) * latPer, lon = m.lon_left + (x + .5) * lonPer;
    let t = `${Math.abs(lat).toFixed(3)}\u00b0S ${Math.abs(lon).toFixed(3)}\u00b0W<br>${NAMES[s]}`;
    if (s === 1 || s === 3) t += `<br>model risk ${(risk[i] / 655.35).toFixed(0)}%` + (x >= edge ? '' : ' (training area)');
    tip.innerHTML = t; tip.hidden = false;
    tip.style.left = Math.min(r.width - 250, (e.clientX - r.left) + 14) + 'px'; tip.style.top = Math.max(4, (e.clientY - r.top) - 52) + 'px';
  });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  live(); setLayer('outcome');

  // scorecard
  const rows = [['Gradient-boosted model', M, true], ['Distance to cleared land only', m.distance_only, false], ['Clearing density within 3 km', m.clearing_density_3km, false]];
  $('tbl').innerHTML = '<thead><tr><th>Ranking by</th><th>AUC</th><th>Avg precision</th><th>Top 5%: cleared</th><th>Top 10%: cleared</th><th>Top 10%: caught</th></tr></thead><tbody>' +
    rows.map(([n, r, me]) => `<tr${me ? ' class="me"' : ''}><td>${n}</td><td>${r.auc.toFixed(3)}</td><td>${r.ap.toFixed(3)}</td><td>${pct(r.prec5)}</td><td>${pct(r.prec10)}</td><td>${pct(r.rec10)}</td></tr>`).join('') +
    `<tr><td>Picking at random</td><td>0.500</td><td>${m.base_rate.toFixed(3)}</td><td>${pct(m.base_rate)}</td><td>${pct(m.base_rate)}</td><td>10%</td></tr></tbody>`;
  $('nTest').textContent = `${m.test_cells.toLocaleString('en-US')} forest cells, ${pct(m.base_rate)} of them cleared later.`;
  $('callout').innerHTML = `<b>Read this before trusting the map.</b> The model separates cells only moderately (AUC ${M.auc.toFixed(2)}). It is most useful at the top of the ranking: flag the riskiest 5% and ${pct(M.prec5)} of those cells were cleared, against ${pct(m.base_rate)} overall. It does clearly beat the simple baselines, but it is not a forecast of any single farm. The east of the window was cleared about twice as often as the west (${pct(m.base_rate)} against ${pct(m.train_base_rate)}), and when the roles are swapped, training east and testing west, the AUC drops to ${m.swapped_auc.toFixed(2)}. Across three horizontal bands of the held-out strip the AUC ranges from ${Math.min(...m.band_auc).toFixed(2)} to ${Math.max(...m.band_auc).toFixed(2)}, so treat the headline as one draw, not a tight estimate. No setting was tuned on the held-out cells; the model was fit once.`;
  const imp = Object.entries(m.importance).sort((a, b) => b[1] - a[1]), mx = Math.max(...imp.map((x) => x[1]), 1e-9);
  $('imp').innerHTML = imp.slice(0, 8).map(([k, v]) => `<div><span>${k.replace(/_/g, ' ')}</span><span class="b" style="width:${Math.max(2, (Math.max(0, v) / mx) * 100)}%"></span><span>${v.toFixed(3)}</span></div>`).join('') + '<p class="note">Drop in average precision when that feature is shuffled on the held-out cells. Larger means the model leans on it more.</p>';
})();
