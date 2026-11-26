/**
 * solution.html [2. 해결방안] 전용 스크립트
 * - 시범 3거점 12개월 다중 지표 차트 + 데이터 기반 지역 진단 매칭 + 전환비·공공사례 표
 */
(async () => {
  const LP = window.LocalPivot;
  let pilotData = {};
  let publicCases = {};
  let regions = {};
  let activeCode = '43800';
  let activeChartMode = 'visits';
  let trendChart = null;
  let industryChart = null;

  const PILOT_CODES = ['43800', '46770', '47730'];

  function renderDiagnosisCard(code) {
    const reg = regions[code];
    const rows = pilotData[code] || [];
    if (!reg || !rows.length) return;

    const diag = LP.diagnoseRegion(reg, regions);
    const totSpend = rows.reduce((s, r) => s + (r.nonlocal_spend_thousand_krw || 0), 0);
    const sumPct = k => totSpend > 0
      ? (rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) / totSpend * 100).toFixed(1)
      : '0.0';

    const fbPct = sumPct('nonlocal_food_beverage_spend_thousand_krw');
    const shopPct = sumPct('nonlocal_shopping_spend_thousand_krw');
    const transPct = sumPct('nonlocal_transport_spend_thousand_krw');
    const lodgPct = sumPct('nonlocal_lodging_spend_thousand_krw');

    document.getElementById('diagTypeBadge').textContent = diag.typeLabel;
    document.getElementById('diagRecommendedTitle').textContent = `${reg.full_name} → 1차 우선 검토: ${diag.recommendedText}`;
    document.getElementById('diagReasonText').textContent = diag.reason;
    document.getElementById('diagSectorText').textContent =
      `12개월 외지인 소비 구조: 식음료 ${fbPct}%, 쇼핑 ${shopPct}%, 운송 ${transPct}%, 숙박 ${lodgPct}% (89개 지자체 내 체류배수 ${diag.ranks.stayRatioRank}위 · 체류시간 ${diag.ranks.stayHoursRank}위 · 미거주율 ${diag.ranks.unoccRateRank}위)`;

    const jumpLink = document.getElementById('diagSimLink');
    jumpLink.href = `alternatives.html?region=${code}&scenario=${diag.recommendedKey}`;
    jumpLink.textContent = `[${diag.recommendedText.split(' (')[0]}] 조건으로 시뮬레이터 열기 →`;
  }

  function renderPilotSummary(code) {
    const rows = pilotData[code] || [];
    if (!rows.length) return;
    const totalVisits = rows.reduce((s, r) => s + (r.visitor_person_visits || 0), 0);
    const simpleOvernight = rows.reduce((s, r) => s + (r.overnight_visitors_pct || 0), 0) / rows.length;
    const weightedOvernight = totalVisits > 0
      ? rows.reduce((s, r) => s + (r.overnight_visitors_pct || 0) * (r.visitor_person_visits || 0), 0) / totalVisits
      : 0;
    const simpleLodging = rows.reduce((s, r) => s + (r.avg_lodging_days || 0), 0) / rows.length;
    const totalSpend = rows.reduce((s, r) => s + (r.nonlocal_spend_krw || 0), 0);

    LP.animateNumber(document.getElementById('pKpiVisits'), totalVisits, v => `${LP.fmt(v)}인회`);
    LP.animateNumber(document.getElementById('pKpiOvernight'), simpleOvernight, v => `${LP.fmtDec(v, 2)}%`);
    document.getElementById('pKpiOvernightSub').textContent = `12개월 단순평균 (방문량 가중평균 ${LP.fmtDec(weightedOvernight, 2)}%)`;
    LP.animateNumber(document.getElementById('pKpiLodging'), simpleLodging, v => `${LP.fmtDec(v, 2)}박`);
    LP.animateNumber(document.getElementById('pKpiSpend'), totalSpend / 1e8, v => `${LP.fmtDec(v, 1)}억 원`);

    const reg = regions[code];
    document.getElementById('pilotRegionHeading').textContent = `${reg ? reg.full_name : rows[0].region} · 12개월 관광·소비 추이 (2025.11~2026.10)`;
  }

  function renderCharts(code) {
    const rows = pilotData[code] || [];
    const labels = rows.map(r => r.year_month);

    const configs = {
      visits: {
        label: '방문 연인원 (인회)',
        data: rows.map(r => r.visitor_person_visits),
        color: '#216049',
        fill: 'rgba(33, 96, 73, 0.12)'
      },
      overnight: {
        label: '숙박방문자 비율 (%)',
        data: rows.map(r => r.overnight_visitors_pct),
        color: '#8b6f4e',
        fill: 'rgba(139, 111, 78, 0.14)'
      },
      lodging: {
        label: '평균 숙박일수 (박)',
        data: rows.map(r => r.avg_lodging_days),
        color: '#3f5e4d',
        fill: 'rgba(63, 94, 77, 0.14)'
      },
      spend: {
        label: '외지인 소비액 (억 원)',
        data: rows.map(r => Number((r.nonlocal_spend_krw / 1e8).toFixed(2))),
        color: '#182f27',
        fill: 'rgba(24, 47, 39, 0.10)'
      }
    };

    const cfg = configs[activeChartMode];
    const ctx = document.getElementById('pilotTrendChart').getContext('2d');
    if (!trendChart) {
      trendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: cfg.label,
            data: cfg.data,
            borderColor: cfg.color,
            backgroundColor: cfg.fill,
            borderWidth: 2.5,
            pointRadius: 3.5,
            tension: 0.25,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: true, position: 'top' } },
          scales: { y: { beginAtZero: false } }
        }
      });
    } else {
      trendChart.data.labels = labels;
      trendChart.data.datasets[0].label = cfg.label;
      trendChart.data.datasets[0].data = cfg.data;
      trendChart.data.datasets[0].borderColor = cfg.color;
      trendChart.data.datasets[0].backgroundColor = cfg.fill;
      trendChart.update('none');
    }

    const sumKey = k => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) / 1e5;
    const indLabels = ['식음료', '운송', '쇼핑', '여가', '숙박', '웰니스/기타'];
    const indVals = [
      sumKey('nonlocal_food_beverage_spend_thousand_krw'),
      sumKey('nonlocal_transport_spend_thousand_krw'),
      sumKey('nonlocal_shopping_spend_thousand_krw'),
      sumKey('nonlocal_leisure_spend_thousand_krw'),
      sumKey('nonlocal_lodging_spend_thousand_krw'),
      sumKey('nonlocal_wellness_spend_thousand_krw') + sumKey('nonlocal_travel_spend_thousand_krw')
    ].map(v => Number(v.toFixed(1)));

    const ictx = document.getElementById('pilotIndustryChart').getContext('2d');
    if (!industryChart) {
      industryChart = new Chart(ictx, {
        type: 'bar',
        data: {
          labels: indLabels,
          datasets: [{
            label: '12개월 외지인 업종별 소비 합계 (억 원)',
            data: indVals,
            backgroundColor: ['#216049', '#3f5e4d', '#8b6f4e', '#6f8f7b', '#b59469', '#a9b8af'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } }
        }
      });
    } else {
      industryChart.data.datasets[0].data = indVals;
      industryChart.update('none');
    }
  }

  function renderTables() {
    const costBody = document.getElementById('conversionCostBody');
    costBody.innerHTML = publicCases.pilot_conversion_costs.map(item => `
      <tr class="${item.region_code === activeCode ? 'row-highlight' : ''}">
        <td><strong>${LP.escapeHtml(item.facility)}</strong><br><span class="badge">${LP.escapeHtml(item.region)}</span></td>
        <td>${LP.escapeHtml(item.contract_budget)}</td>
        <td>${LP.escapeHtml(item.scope_area)}</td>
        <td>${LP.escapeHtml(item.settlement_status)}</td>
      </tr>
    `).join('');

    const candBody = document.getElementById('candidateHousingBody');
    candBody.innerHTML = publicCases.pilot_candidate_housing.map(item => `
      <tr class="${item.region_code === activeCode ? 'row-highlight' : ''}">
        <td><strong>${LP.escapeHtml(item.region)}</strong></td>
        <td>${LP.escapeHtml(item.base_and_grade)}</td>
        <td>${LP.escapeHtml(item.repair_and_consent)}</td>
        <td>${LP.escapeHtml(item.agreement_and_selection)}</td>
      </tr>
    `).join('');

    const benchBody = document.getElementById('benchmarkBody');
    benchBody.innerHTML = publicCases.public_benchmarks.map(b => `
      <tr>
        <td><span class="badge badge-accent">${LP.escapeHtml(b.scenario)}</span><br><span class="badge badge-wood" style="margin-top:4px;">${LP.escapeHtml(b.type)}</span></td>
        <td><strong>${LP.escapeHtml(b.name)}</strong><br><small style="color:#4b6359;">출처: ${LP.escapeHtml(b.source)}</small></td>
        <td>${LP.escapeHtml(b.budget_text)}</td>
        <td>${LP.escapeHtml(b.scale_text)}</td>
        <td>${LP.escapeHtml(b.constraint_note)}</td>
      </tr>
    `).join('');

    const dy = publicCases.danyang_lodging_ref;
    document.getElementById('danyangLodgingNote').innerHTML =
      `<strong>단양군 기존 숙박 공급 참고 (${LP.escapeHtml(dy.source)}):</strong> 총 ${dy.total_facilities}개 시설 · ${LP.fmt(dy.total_rooms)}실 (` +
      dy.breakdown.map(x => `${LP.escapeHtml(x.category)} ${x.facilities}개소·${LP.fmt(x.rooms)}실`).join(', ') +
      `). <em>${LP.escapeHtml(dy.limitation)}</em>`;
  }

  function selectPilot(code) {
    activeCode = PILOT_CODES.includes(code) ? code : '43800';
    LP.setState({ regionCode: activeCode });
    LP.renderNavStatus(regions);
    document.querySelectorAll('.pilot-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.code === activeCode);
    });
    renderDiagnosisCard(activeCode);
    renderPilotSummary(activeCode);
    renderCharts(activeCode);
    renderTables();
  }

  try {
    const [pData, cData, rData] = await Promise.all([
      LP.fetchCachedJSON('data/pilot_3regions_monthly.json'),
      LP.fetchCachedJSON('data/public_cases.json'),
      LP.fetchCachedJSON('data/regions_89_master.json')
    ]);
    pilotData = pData;
    publicCases = cData;
    regions = rData;

    document.querySelectorAll('.pilot-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => selectPilot(btn.dataset.code));
    });
    document.querySelectorAll('.chart-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeChartMode = btn.dataset.mode;
        renderCharts(activeCode);
      });
    });

    const st = LP.getState();
    selectPilot(PILOT_CODES.includes(st.regionCode) ? st.regionCode : '43800');
  } catch (err) {
    console.error(err);
  }
})();
