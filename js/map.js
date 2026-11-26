/**
 * index.html [1. 문제인식] 전용 스크립트
 * - korea_sgg_master.geojson은 이 페이지에서만 로드(지연 분리)
 */
(async () => {
  const LP = window.LocalPivot;
  let map, geoLayer, legendControl;
  let regions = {};
  let currentMetric = 'unoccupied_rate';
  let state = LP.getState();

  const METRIC_META = {
    unoccupied_rate: {
      label: '미거주주택 비율 (%)',
      breaks: [22, 18, 15, 12],
      colors: ['#164e3b', '#216049', '#4c8c71', '#88b9a3', '#d4e8dd'],
      labels: ['22% 초과', '18~22%', '15~18%', '12~15%', '12% 이하'],
      fmtVal: v => `${LP.fmtDec(v, 2)}%`
    },
    extinction_index: {
      label: '소멸위험지수 (낮을수록 고위험)',
      breaks: [0.2, 0.3, 0.4, 0.5],
      colors: ['#9f1239', '#e11d48', '#fb7185', '#fda4af', '#ffe4e6'],
      labels: ['0.2 미만 (소멸고위험)', '0.2~0.3', '0.3~0.4', '0.4~0.5', '0.5 이상'],
      fmtVal: v => LP.fmtDec(v, 4)
    },
    stay_ratio: {
      label: '체류인구 배수 (등록인구 대비)',
      breaks: [10, 7, 5, 3.5],
      colors: ['#1e3a8a', '#2563eb', '#60a5fa', '#93c5fd', '#dbeafe'],
      labels: ['10배 초과', '7~10배', '5~7배', '3.5~5배', '3.5배 이하'],
      fmtVal: v => `${LP.fmtDec(v, 2)}배`
    },
    spend_per_person: {
      label: '1인당 월간 카드소비액 (원)',
      breaks: [150000, 130000, 115000, 100000],
      colors: ['#5c4028', '#8b6f4e', '#b29470', '#d4bea1', '#f1e7d8'],
      labels: ['15만 원 초과', '13~15만 원', '11.5~13만 원', '10~11.5만 원', '10만 원 이하'],
      fmtVal: v => `${LP.fmt(v)}원`
    }
  };

  function getColor(val, metric) {
    if (val === null || val === undefined) return '#dce3dd';
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

    LP.animateNumber(document.getElementById('kpiTotalUnocc'), totalUnocc, v => `${LP.fmt(v)}호`);
    LP.animateNumber(document.getElementById('kpiAvgRate'), weightedRate, v => `${LP.fmtDec(v, 2)}%`);
    document.getElementById('kpiAvgRateSub').textContent = `전체 주택 가중평균 (시군구 단순평균 ${LP.fmtDec(simpleAvgRate, 2)}%)`;
    LP.animateNumber(document.getElementById('kpiAvgExt'), avgExt, v => LP.fmtDec(v, 3));
    LP.animateNumber(document.getElementById('kpiHighRisk'), highRiskCount, v => `${LP.fmt(v)}곳 / ${list.length}곳`);
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
    document.getElementById('selStayRatio').textContent = `등록인구 ${LP.fmt(lp.resident_pop)}명 대비 ${LP.fmtDec(lp.stay_ratio, 2)}배 (${LP.periodLabel(state.monthKey)})`;
    document.getElementById('selSpend').textContent = `${LP.fmt(lp.spend_per_person)}원`;
    document.getElementById('selStayHours').textContent = `월간 1인당 카드소비 · 평균 체류 ${LP.fmtDec(lp.avg_stay_hours, 1)}시간`;

    const isPilot = ['43800', '46770', '47730'].includes(code);
    document.getElementById('pilotBadgeNote').innerHTML =
      `<strong>지역 유형 진단: [${LP.escapeHtml(diag.typeLabel)}]</strong> → 1차 우선 검토: <strong>${LP.escapeHtml(diag.recommendedText)}</strong><br>` +
      (isPilot
        ? '시범 거점 3개 지역에 포함되어 다음 챕터에서 12개월 관광 추이·전환비 조사를 확인할 수 있습니다.'
        : '비시범 인구감소지역입니다. 3챕터 대안 비교 시뮬레이터에서 바로 검토할 수 있습니다.');

    if (geoLayer) updateMapStyle();
  }

  function updateLegend() {
    if (!legendControl) return;
    const m = METRIC_META[currentMetric];
    const div = legendControl.getContainer();
    div.innerHTML = `<div style="font-weight:800;margin-bottom:4px;color:#182f27;">${m.label}</div>` +
      m.colors.map((c, i) => `<div class="legend-row"><span class="legend-swatch" style="background:${c}"></span><span>${m.labels[i]}</span></div>`).join('') +
      `<div class="legend-row" style="margin-top:3px;color:#64748b;"><span class="legend-swatch" style="background:#dce3dd"></span><span>비인구감소지역</span></div>`;
  }

  function updateMapStyle() {
    if (!geoLayer) return;
    geoLayer.eachLayer(layer => {
      const p = layer.feature.properties;
      const isSelected = p.adm_cd === state.regionCode;
      const val = getMetricValue(p, state.monthKey, currentMetric);
      layer.setStyle({
        fillColor: getColor(val, currentMetric),
        weight: isSelected ? 3 : (p.is_target_89 ? 0.9 : 0.4),
        color: isSelected ? '#182f27' : (p.is_target_89 ? '#ffffff' : '#cbd5cf'),
        fillOpacity: p.is_target_89 ? (isSelected ? 0.95 : 0.82) : 0.35
      });
      if (isSelected && layer.bringToFront) layer.bringToFront();
    });
    updateLegend();
  }

  function initMap(geojsonData) {
    map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([36.35, 127.85], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    geoLayer = L.geoJSON(geojsonData, {
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        if (!p.is_target_89) return;
        layer.on({
          click: () => renderRegionDetail(p.adm_cd),
          mouseover: (e) => {
            const val = getMetricValue(p, state.monthKey, currentMetric);
            const txt = METRIC_META[currentMetric].fmtVal(val);
            e.target.bindTooltip(`<strong>${LP.escapeHtml(p.full_name)}</strong><br>${METRIC_META[currentMetric].label}: ${txt}`, { sticky: true }).openTooltip();
          }
        });
      }
    }).addTo(map);

    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => L.DomUtil.create('div', 'legend-box');
    legendControl.addTo(map);
    updateMapStyle();
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
      updateMapStyle();
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
    initMap(geoData);
    renderRegionDetail(regions[state.regionCode] ? state.regionCode : '43800');
  } catch (err) {
    document.getElementById('mapStatus').textContent = `데이터 로딩 오류: ${err.message}`;
    console.error(err);
  }
})();
