/**
 * Local Pivot Native SVG Chart Renderer (Zero External CDN Dependency)
 * - 기관 PC/오프라인 환경에서도 100% 즉시 렌더링되며 A4 보고서에 그대로 삽입 가능
 */
window.LocalPivotCharts = (() => {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');

  function renderLineChart(container, { labels, values, title, unit = '', color = '#556b2f', decimals = 0 }) {
    if (!container) return '';
    const W = 560, H = 270;
    const pad = { top: 34, right: 20, bottom: 42, left: 66 };
    const iw = W - pad.left - pad.right;
    const ih = H - pad.top - pad.bottom;

    const nums = values.map(v => Number(v) || 0);
    let minV = Math.min(...nums);
    let maxV = Math.max(...nums);
    if (maxV === minV) { maxV += 1; minV = Math.max(0, minV - 1); }
    const range = maxV - minV;
    minV = Math.max(0, minV - range * 0.12);
    maxV = maxV + range * 0.12;

    const xAt = i => pad.left + (labels.length > 1 ? (i / (labels.length - 1)) * iw : iw / 2);
    const yAt = v => pad.top + ih - ((v - minV) / (maxV - minV)) * ih;

    const pts = nums.map((v, i) => [xAt(i), yAt(v)]);
    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const areaD = `${lineD} L${pts[pts.length - 1][0].toFixed(1)},${(pad.top + ih).toFixed(1)} L${pts[0][0].toFixed(1)},${(pad.top + ih).toFixed(1)} Z`;

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => {
      const y = pad.top + ih * (1 - t);
      const val = minV + (maxV - minV) * t;
      const lbl = decimals > 0 ? val.toFixed(decimals) : fmt(val);
      return `
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${W - pad.right}" y2="${y.toFixed(1)}" stroke="#e6e2d5" stroke-width="1" />
        <text x="${pad.left - 8}" y="${(y + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="#5c634d">${lbl}</text>
      `;
    }).join('');

    const xTicks = labels.map((lb, i) => {
      if (labels.length > 8 && i % 2 === 1 && i !== labels.length - 1) return '';
      const shortLb = lb.length === 7 ? lb.slice(2) : lb;
      return `<text x="${xAt(i).toFixed(1)}" y="${H - 14}" font-size="10.5" text-anchor="middle" fill="#5c634d">${esc(shortLb)}</text>`;
    }).join('');

    const dots = pts.map((p, i) => {
      const valStr = decimals > 0 ? Number(nums[i]).toFixed(decimals) : fmt(nums[i]);
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#fff" stroke="${color}" stroke-width="2.2"><title>${esc(labels[i])}: ${valStr}${esc(unit)}</title></circle>`;
    }).join('');

    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="${esc(title)}">
      <text x="${pad.left}" y="19" font-size="12.5" font-weight="700" fill="#252c1b">${esc(title)}</text>
      ${gridLines}
      <path d="${areaD}" fill="${color}" fill-opacity="0.11" />
      <path d="${lineD}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      ${xTicks}
    </svg>`;
    container.innerHTML = svg;
    return svg;
  }

  function renderHorizontalBarChart(container, { labels, values, title, unit = '만 원', colors }) {
    if (!container) return '';
    const W = 560, H = 270;
    const pad = { top: 34, right: 86, bottom: 20, left: 82 };
    const iw = W - pad.left - pad.right;
    const ih = H - pad.top - pad.bottom;
    const maxV = Math.max(1, ...values.map(v => Number(v) || 0));
    const rowH = ih / Math.max(1, labels.length);
    const barH = Math.min(24, rowH * 0.62);
    const palette = colors || ['#556b2f', '#6b7f3e', '#8b7355', '#9aa678', '#b59c7b', '#c6cbb4'];

    const bars = labels.map((lb, i) => {
      const v = Number(values[i]) || 0;
      const w = (v / maxV) * iw;
      const y = pad.top + i * rowH + (rowH - barH) / 2;
      return `
        <text x="${pad.left - 8}" y="${(y + barH / 2 + 4).toFixed(1)}" font-size="11.5" font-weight="700" text-anchor="end" fill="#252c1b">${esc(lb)}</text>
        <rect x="${pad.left}" y="${y.toFixed(1)}" width="${Math.max(2, w).toFixed(1)}" height="${barH.toFixed(1)}" rx="5" fill="${palette[i % palette.length]}" />
        <text x="${(pad.left + w + 7).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" font-size="11" font-weight="700" fill="#5c634d">${fmt(v)}${esc(unit)}</text>
      `;
    }).join('');

    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="${esc(title)}">
      <text x="${pad.left}" y="19" font-size="12.5" font-weight="700" fill="#252c1b">${esc(title)}</text>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" stroke="#d5d0be" stroke-width="1.2" />
      ${bars}
    </svg>`;
    container.innerHTML = svg;
    return svg;
  }

  function renderSensitivityBarChart(container, rows) {
    if (!container) return '';
    const W = 540, H = 250;
    const pad = { top: 42, right: 24, bottom: 38, left: 24 };
    const ih = H - pad.top - pad.bottom;
    const maxV = Math.max(1, ...rows.map(r => r.visits));
    const maxS = Math.max(1, ...rows.map(r => r.spendMan));

    const colW = (W - pad.left - pad.right) / rows.length;
    const barW = 42;

    const groups = rows.map((r, i) => {
      const cx = pad.left + colW * i + colW / 2;
      const hV = Math.max(4, Math.round((r.visits / maxV) * (ih - 26)));
      const hS = Math.max(4, Math.round((r.spendMan / maxS) * (ih - 26)));
      const base = pad.top + ih;
      const isMid = i === 1;
      return `
        ${isMid ? `<rect x="${(cx - colW * 0.44).toFixed(1)}" y="${pad.top - 6}" width="${(colW * 0.88).toFixed(1)}" height="${ih + 36}" rx="10" fill="#eef2e5" />` : ''}
        <rect x="${(cx - barW - 4).toFixed(1)}" y="${base - hV}" width="${barW}" height="${hV}" rx="5" fill="#556b2f" />
        <text x="${(cx - barW / 2 - 4).toFixed(1)}" y="${base - hV - 6}" font-size="10.5" font-weight="800" text-anchor="middle" fill="#252c1b">${fmt(r.visits)}회</text>
        <rect x="${(cx + 4).toFixed(1)}" y="${base - hS}" width="${barW}" height="${hS}" rx="5" fill="#8b7355" />
        <text x="${(cx + barW / 2 + 4).toFixed(1)}" y="${base - hS - 6}" font-size="10.5" font-weight="800" text-anchor="middle" fill="#5c462c">${fmt(r.spendMan)}만</text>
        <text x="${cx.toFixed(1)}" y="${base + 20}" font-size="11.5" font-weight="${isMid ? '800' : '600'}" text-anchor="middle" fill="#252c1b">${esc(r.label)} (${r.occ}%)</text>
      `;
    }).join('');

    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="가동률별 방문 및 소비 추정 비교">
      <rect x="24" y="8" width="12" height="12" rx="3" fill="#556b2f" />
      <text x="41" y="18" font-size="11.5" font-weight="700" fill="#252c1b">연간 예상 방문(회, 가정)</text>
      <rect x="200" y="8" width="12" height="12" rx="3" fill="#8b7355" />
      <text x="217" y="18" font-size="11.5" font-weight="700" fill="#252c1b">방문 관련 소비 추정(만 원, 가정)</text>
      <line x1="${pad.left}" y1="${pad.top + ih}" x2="${W - pad.right}" y2="${pad.top + ih}" stroke="#cfc9b6" stroke-width="1.2" />
      ${groups}
    </svg>`;
    container.innerHTML = svg;
    return svg;
  }

  return { renderLineChart, renderHorizontalBarChart, renderSensitivityBarChart };
})();
