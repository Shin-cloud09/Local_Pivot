/**
 * index.html [1. 현황 진단] 전용 스크립트
 * - 지도 API·외부 타일·외부 CDN 완전 제거: data/korea_sgg_master.geojson을 순수 내장 SVG로 직접 렌더링
 * - 확대/축소/드래그 이동/초기화/호버 툴팁/클릭 선택 모두 브라우저 자체 처리
 */
(async () => {
  const LP = window.LocalPivot;
  LP.initOnboardingGuide(true);

  let regions = {};
  let features = [];
  let currentMetric = 'unoccupied_rate';
  let state = LP.getState();

  // SVG viewport & pan/zoom state
  const BASE_W = 540, BASE_H = 640;
  let vb = { x: 0, y: 0, w: BASE_W, h: BASE_H };
  let isDragging = false;
  let dragStart = { x: 0, y: 0, vbx: 0, vby: 0 };

  const METRIC_META = {
    unoccupied_rate: {
      label: '미거주주택 비율 (%) [공식]',
      breaks: [22, 18, 15, 12],
      colors: ['#3b4d1d', '#556b2f', '#7a914b', '#a8ba7f', '#dce4c6'],
      labels: ['22% 초과', '18~22%', '15~18%', '12~15%', '12% 이하'],
      fmtVal: v => `${LP.fmtDec(v, 2)}%`
    },
    extinction_index: {
      label: '소멸위험지수 (낮을수록 고위험) [공식]',
      breaks: [0.2, 0.3, 0.4, 0.5],
      colors: ['#9e3229', '#c94a3d', '#e07a6c', '#f0b1a8', '#fae0dc'],
      labels: ['0.2 미만 (소멸고위험)', '0.2~0.3', '0.3~0.4', '0.4~0.5', '0.5 이상'],
      fmtVal: v => LP.fmtDec(v, 4)
    },
    stay_ratio: {
      label: '공식 체류인구 배수 (배) [공식]',
      breaks: [10, 7, 5, 3.5],
      colors: ['#2b4c6f', '#3f6c99', '#6793bd', '#9cb9d6', '#d6e3f0'],
      labels: ['10배 초과', '7~10배', '5~7배', '3.5~5배', '3.5배 이하'],
      fmtVal: v => `${LP.fmtDec(v, 2)}배`
    },
    spend_per_person: {
      label: '1인당 월간 카드소비액 (만 원) [공식]',
      breaks: [150000, 130000, 115000, 100000],
      colors: ['#5e4931', '#8b7355', '#ad9678', '#cfbfa8', '#ece3d5'],
      labels: ['15만 원 초과', '13~15만 원', '11.5~13만 원', '10~11.5만 원', '10만 원 이하'],
      fmtVal: v => LP.fmtWonAsMan(v, 2)
    }
  };

  function getColor(val, metric) {
    if (val === null || val === undefined || !Number.isFinite(val)) return '#ebe7da';
    const m = METRIC_META[metric];
    if (metric === 'extinction_index') {
      if (val < m.breaks[0]) return m.colors[0];
      if (val < m.breaks[1]) return m.colors[1];
      if (val < m.breaks[2]) return m.colors[2];
      if (val < m.breaks[3]) return m.colors[3];
      return m.colors[4];
    }
    if (val > m.breaks[0]) return m.colors[0];
    if (val > m.breaks[1]) return m.colors[1];
    if (val > m.breaks[2]) return m.colors[2];
    if (val > m.breaks[3]) return m.colors[3];
    return m.colors[4];
  }

  function getMetricValue(props, monthKey, metric) {
    if (!props.is_target_89) return null;
    if (metric === 'unoccupied_rate' || metric === 'extinction_index') return props[metric];
    const lp = props.living_pop && props.living_pop[monthKey];
    return lp ? lp[metric] : null;
  }

  function renderNationalKPIs() {
    const list = Object.values(regions);
    const totalHousing = list.reduce((s, r) => s + (r.total_housing || 0), 0);
    const totalUnocc = list.reduce((s, r) => s + (r.unoccupied_housing || 0), 0);
    const weightedRate = totalHousing > 0 ? (totalUnocc / totalHousing) * 100 : 0;
    const simpleAvgRate = list.reduce((s, r) => s + (r.unoccupied_rate || 0), 0) / list.length;
    const avgExt = list.reduce((s, r) => s + (r.extinction_index || 0), 0) / list.length;
    const highRiskCount = list.filter(r => r.extinction_index < 0.2).length;

    document.getElementById('kpiTotalUnocc').textContent = `${LP.fmt(totalUnocc)}호`;
    document.getElementById('kpiAvgRate').textContent = `${LP.fmtDec(weightedRate, 2)}%`;
    document.getElementById('kpiAvgRateSub').textContent = `전체 주택 가중평균 (시군구 단순평균 ${LP.fmtDec(simpleAvgRate, 2)}%)`;
    document.getElementById('kpiAvgExt').textContent = LP.fmtDec(avgExt, 3);
    document.getElementById('kpiHighRisk').textContent = `${LP.fmt(highRiskCount)}곳 / ${list.length}곳`;
  }

  function renderRegionDetail(code) {
    const r = regions[code];
    if (!r) return;
    state = LP.setState({ regionCode: code });
    LP.renderNavStatus(regions);

    const sel = document.getElementById('regionSelect');
    if (sel && sel.value !== code) sel.value = code;

    document.querySelectorAll('.pilot-jump-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.code === code);
    });

    const lp = r.living_pop[state.monthKey] || r.living_pop.avg;
    const diag = LP.diagnoseRegion(r, regions);

    document.getElementById('selRegionName').textContent = r.full_name;
    document.getElementById('selExtClass').textContent = r.extinction_class;
    document.getElementById('selExtVal').textContent = LP.fmtDec(r.extinction_index, 4);
    document.getElementById('selUnocc').textContent = `${LP.fmt(r.unoccupied_housing)}호 (${LP.fmtDec(r.unoccupied_rate, 2)}%)`;
    document.getElementById('selTotalHousing').textContent = `전체 주택 ${LP.fmt(r.total_housing)}호 중 (89개 중 ${diag.ranks.unoccRateRank}위)`;
    document.getElementById('selStayPop').textContent = `${LP.fmt(lp.stay_pop)}명`;
    document.getElementById('selStayRatio').textContent = `공식 체류배수 ${LP.fmtDec(lp.stay_ratio, 2)}배 · 등록인구 ${LP.fmt(lp.resident_pop)}명 (${LP.periodLabel(state.monthKey)})`;
    document.getElementById('selSpend').textContent = LP.fmtWonAsMan(lp.spend_per_person, 2);
    document.getElementById('selStayHours').textContent = `월간 1인당 카드소비 · 평균 체류 ${LP.fmtDec(lp.avg_stay_hours, 1)}시간`;

    const isPilot = ['43800', '46770', '47730'].includes(code);
    document.getElementById('pilotBadgeNote').innerHTML =
      `<strong>지역 유형 진단 [${LP.escapeHtml(diag.typeLabel)}]:</strong><br>` +
      `우선 검토 후보: <strong>${LP.escapeHtml(diag.recommendedText)}</strong><br>` +
      `<span style="color:#5c634d;font-size:12.2px;">${LP.escapeHtml(diag.reason)} ${isPilot ? '(시범 3거점 포함: 2단계에서 12개월 추이 확인 가능)' : ''}</span>`;

    const quickSimBtn = document.getElementById('quickSimLink');
    if (quickSimBtn) {
      quickSimBtn.href = `alternatives.html?region=${code}&scenario=${diag.recommendedKey}`;
    }

    updateSvgColors();
  }

  function updateLegend() {
    const m = METRIC_META[currentMetric];
    const el = document.getElementById('mapLegend');
    if (!el) return;
    el.innerHTML = `<div style="font-weight:800;margin-bottom:4px;color:#252c1b;">${m.label}</div>` +
      m.colors.map((c, i) => `<div class="legend-row"><span class="legend-swatch" style="background:${c}"></span><span>${m.labels[i]}</span></div>`).join('') +
      `<div class="legend-row" style="margin-top:3px;color:#787f68;"><span class="legend-swatch" style="background:#ebe7da"></span><span>비인구감소지역 (141곳)</span></div>`;
  }

  function updateSvgColors() {
    const svg = document.getElementById('koreaMapSvg');
    if (!svg) return;
    const paths = svg.querySelectorAll('path[data-cd]');
    let selectedEl = null;
    paths.forEach(pEl => {
      const cd = pEl.getAttribute('data-cd');
      const isTarget = pEl.getAttribute('data-target') === '1';
      const isSelected = cd === state.regionCode;
      if (!isTarget) {
        pEl.setAttribute('fill', '#ebe7da');
        pEl.setAttribute('stroke', '#d2cdbd');
        pEl.setAttribute('stroke-width', '0.5');
        return;
      }
      const r = regions[cd];
      const val = r ? getMetricValue({ ...r, is_target_89: true }, state.monthKey, currentMetric) : null;
      pEl.setAttribute('fill', getColor(val, currentMetric));
      pEl.setAttribute('stroke', isSelected ? '#1a2012' : '#faf8f2');
      pEl.setAttribute('stroke-width', isSelected ? '2.2' : '0.7');
      if (isSelected) selectedEl = pEl;
    });
    if (selectedEl && selectedEl.parentNode) {
      selectedEl.parentNode.appendChild(selectedEl); // Bring selected border to front
    }
    updateLegend();
  }

  function applyViewBox() {
    const svg = document.getElementById('koreaMapSvg');
    if (svg) svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`);
  }

  function buildNativeSvgMap(geojsonData) {
    features = geojsonData.features || [];
    // Compute equirectangular projection adjusted by cos(36 deg) for Korea aspect ratio
    const cosLat = Math.cos(36 * Math.PI / 180);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    function scanCoords(coords) {
      if (typeof coords[0] === 'number') {
        const x = coords[0] * cosLat;
        const y = -coords[1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        for (let i = 0; i < coords.length; i++) scanCoords(coords[i]);
      }
    }
    features.forEach(ft => scanCoords(ft.geometry.coordinates));

    const pad = 20;
    const scale = Math.min((BASE_W - pad * 2) / (maxX - minX), (BASE_H - pad * 2) / (maxY - minY));
    const offsetX = (BASE_W - (maxX - minX) * scale) / 2;
    const offsetY = (BASE_H - (maxY - minY) * scale) / 2;

    const proj = (lng, lat) => [
      (lng * cosLat - minX) * scale + offsetX,
      (-lat - minY) * scale + offsetY
    ];

    function ringToPath(ring) {
      let d = '';
      // Decimate dense vertices slightly for super-fast SVG rendering while keeping crisp coastline
      const step = ring.length > 600 ? 4 : (ring.length > 200 ? 2 : 1);
      for (let i = 0; i < ring.length; i += step) {
        const [x, y] = proj(ring[i][0], ring[i][1]);
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }
      return d + 'Z';
    }

    function geomToPath(geom) {
      if (geom.type === 'Polygon') {
        return geom.coordinates.map(ringToPath).join('');
      }
      if (geom.type === 'MultiPolygon') {
        return geom.coordinates.map(poly => poly.map(ringToPath).join('')).join('');
      }
      return '';
    }

    const svg = document.getElementById('koreaMapSvg');
    const frag = document.createDocumentFragment();
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');

    // Render non-targets first, then 89 targets on top
    const ordered = [...features].sort((a, b) => Number(!!a.properties.is_target_89) - Number(!!b.properties.is_target_89));
    ordered.forEach(ft => {
      const p = ft.properties;
      const d = geomToPath(ft.geometry);
      if (!d) return;
      const pathEl = document.createElementNS(NS, 'path');
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('data-cd', p.adm_cd || '');
      pathEl.setAttribute('data-target', p.is_target_89 ? '1' : '0');
      if (p.is_target_89) {
        pathEl.style.cursor = 'pointer';
        pathEl.addEventListener('click', () => renderRegionDetail(p.adm_cd));
        pathEl.addEventListener('mousemove', (e) => {
          const tip = document.getElementById('mapTooltip');
          const stage = document.getElementById('mapStage');
          const rect = stage.getBoundingClientRect();
          const r = regions[p.adm_cd];
          const val = r ? getMetricValue({ ...r, is_target_89: true }, state.monthKey, currentMetric) : null;
          tip.innerHTML = `<strong>${LP.escapeHtml(p.full_name)}</strong><br>${METRIC_META[currentMetric].label}: ${METRIC_META[currentMetric].fmtVal(val)}`;
          tip.style.display = 'block';
          tip.style.left = `${Math.min(rect.width - 210, e.clientX - rect.left + 14)}px`;
          tip.style.top = `${Math.max(8, e.clientY - rect.top - 36)}px`;
        });
        pathEl.addEventListener('mouseleave', () => {
          document.getElementById('mapTooltip').style.display = 'none';
        });
      }
      g.appendChild(pathEl);
    });

    frag.appendChild(g);
    svg.innerHTML = '';
    svg.appendChild(frag);
    applyViewBox();

    // Pan & Zoom Controls (100% pure native)
    const zoom = (factor) => {
      const newW = Math.max(120, Math.min(BASE_W * 1.1, vb.w * factor));
      const newH = newW * (BASE_H / BASE_W);
      vb.x += (vb.w - newW) / 2;
      vb.y += (vb.h - newH) / 2;
      vb.w = newW;
      vb.h = newH;
      applyViewBox();
    };
    document.getElementById('zoomInBtn').addEventListener('click', () => zoom(0.75));
    document.getElementById('zoomOutBtn').addEventListener('click', () => zoom(1.33));
    document.getElementById('resetMapViewBtn').addEventListener('click', () => {
      vb = { x: 0, y: 0, w: BASE_W, h: BASE_H };
      applyViewBox();
    });

    svg.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY, vbx: vb.x, vby: vb.y };
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - dragStart.x) * (vb.w / rect.width);
      const dy = (e.clientY - dragStart.y) * (vb.h / rect.height);
      vb.x = dragStart.vbx - dx;
      vb.y = dragStart.vby - dy;
      applyViewBox();
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.85 : 1.18);
    }, { passive: false });
  }

  try {
    const [geoData, regData] = await Promise.all([
      LP.fetchCachedJSON('data/korea_sgg_master.geojson'),
      LP.fetchCachedJSON('data/regions_89_master.json')
    ]);
    regions = regData;

    const select = document.getElementById('regionSelect');
    const pilotCodes = ['43800', '46770', '47730'];
    const pilots = pilotCodes.map(c => regions[c]).filter(Boolean);
    const others = Object.values(regions).filter(r => !pilotCodes.includes(r.adm_cd))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ko'));

    for (const [label, items] of [['시범 거점 3개 지역', pilots], ['그 외 인구감소지역 (86곳)', others]]) {
      const grp = document.createElement('optgroup');
      grp.label = label;
      items.forEach(r => grp.append(new Option(r.full_name, r.adm_cd)));
      select.append(grp);
    }

    select.addEventListener('change', (e) => renderRegionDetail(e.target.value));
    document.getElementById('metricSelect').addEventListener('change', (e) => {
      currentMetric = e.target.value;
      updateSvgColors();
    });
    document.querySelectorAll('.month-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state = LP.setState({ monthKey: btn.dataset.month });
        renderRegionDetail(state.regionCode);
      });
    });
    document.querySelectorAll('.pilot-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => renderRegionDetail(btn.dataset.code));
    });
    document.querySelectorAll('.month-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.month === state.monthKey);
    });

    renderNationalKPIs();
    buildNativeSvgMap(geoData);
    renderRegionDetail(regions[state.regionCode] ? state.regionCode : '43800');
  } catch (err) {
    document.getElementById('mapStatus').textContent = `데이터 로딩 오류: ${err.message} (저장소에 data/ 폴더가 정상 업로드되었는지 확인하세요)`;
    console.error(err);
  }
})();
