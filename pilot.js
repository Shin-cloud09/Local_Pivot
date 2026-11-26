/**
 * solution.html [2. 거점 · 사례 분석] 전용 스크립트
 * - 모든 금액 만 원 통일, 방문 횟수 회 통일
 * - 실제 전환비·후보 주택을 2단 요약 카드로, 공공 사례 8건을 필터형 벤치마크 카드로 시각화
 */
(async () => {
  const LP = window.LocalPivot;
  let pilotData = {};
  let publicCases = {};
  let regions = {};
  let activeCode = '43800';
  let activeChartMode = 'visits';
  let activeBenchFilter = 'ALL';
  let showAllPilots = false;
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
      `12개월 외지인 소비 비중: 식음료 ${fbPct}% · 쇼핑 ${shopPct}% · 운송 ${transPct}% · 숙박 ${lodgPct}% (89개 중 체류배수 ${diag.ranks.stayRatioRank}위 · 체류시간 ${diag.ranks.stayHoursRank}위 · 미거주율 ${diag.ranks.unoccRateRank}위)`;

    const jumpLink = document.getElementById('diagSimLink');
    jumpLink.href = `alternatives.html?region=${code}&scenario=${diag.recommendedKey}`;
    jumpLink.textContent = `[${diag.recommendedText.split(' (')[0]}] 시뮬레이션 바로가기 →`;
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
    // nonlocal_spend_thousand_krw -> 만 원 (÷ 10)
    const totalSpendMan = rows.reduce((s, r) => s + (r.nonlocal_spend_thousand_krw || 0), 0) / 10;

    LP.animateNumber(document.getElementById('pKpiVisits'), totalVisits, v => `${LP.fmt(v)}회`);
    LP.animateNumber(document.getElementById('pKpiOvernight'), simpleOvernight, v => `${LP.fmtDec(v, 2)}%`);
    document.getElementById('pKpiOvernightSub').textContent = `12개월 단순평균 (방문량 가중 ${LP.fmtDec(weightedOvernight, 2)}%)`;
    LP.animateNumber(document.getElementById('pKpiLodging'), simpleLodging, v => `${LP.fmtDec(v, 2)}박`);
    LP.animateNumber(document.getElementById('pKpiSpend'), totalSpendMan, v => LP.fmtMan(v));

    const reg = regions[code];
    document.getElementById('pilotRegionHeading').textContent = `${reg ? reg.full_name : rows[0].region} · 12개월 관광·소비 추이 (2025.11~2026.10)`;
  }

  function renderCharts(code) {
    const rows = pilotData[code] || [];
    const labels = rows.map(r => r.year_month);

    const configs = {
      visits: {
        label: '월간 방문 횟수 (회, 중복 포함)',
        data: rows.map(r => r.visitor_person_visits),
        color: '#1f5c45',
        fill: 'rgba(31, 92, 69, 0.12)'
      },
      overnight: {
        label: '숙박방문자 비율 (%)',
        data: rows.map(r => r.overnight_visitors_pct),
        color: '#8a6a44',
        fill: 'rgba(138, 106, 68, 0.14)'
      },
      lodging: {
        label: '평균 숙박일수 (박)',
        data: rows.map(r => r.avg_lodging_days),
        color: '#355446',
        fill: 'rgba(53, 84, 70, 0.14)'
      },
      spend: {
        label: '외지인 소비액 (만 원)',
        data: rows.map(r => Math.round((r.nonlocal_spend_thousand_krw || 0) / 10)),
        color: '#162922',
        fill: 'rgba(22, 41, 34, 0.10)'
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

    // Industry breakdown in 만 원 (천원 ÷ 10)
    const sumMan = k => Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) / 10);
    const indLabels = ['식음료', '운송', '쇼핑', '여가', '숙박', '웰니스/기타'];
    const indVals = [
      sumMan('nonlocal_food_beverage_spend_thousand_krw'),
      sumMan('nonlocal_transport_spend_thousand_krw'),
      sumMan('nonlocal_shopping_spend_thousand_krw'),
      sumMan('nonlocal_leisure_spend_thousand_krw'),
      sumMan('nonlocal_lodging_spend_thousand_krw'),
      sumMan('nonlocal_wellness_spend_thousand_krw') + sumMan('nonlocal_travel_spend_thousand_krw')
    ];

    const ictx = document.getElementById('pilotIndustryChart').getContext('2d');
    if (!industryChart) {
      industryChart = new Chart(ictx, {
        type: 'bar',
        data: {
          labels: indLabels,
          datasets: [{
            label: '12개월 외지인 업종별 소비 합계 (만 원)',
            data: indVals,
            backgroundColor: ['#1f5c45', '#355446', '#8a6a44', '#6f8f7b', '#b59469', '#a9b8af'],
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

  function renderPilotFactCards() {
    const container = document.getElementById('pilotFactCards');
    const codesToShow = showAllPilots ? PILOT_CODES : [activeCode];

    container.innerHTML = codesToShow.map(cd => {
      const cost = publicCases.pilot_conversion_costs.find(x => x.region_code === cd);
      const cand = publicCases.pilot_candidate_housing.find(x => x.region_code === cd);
      if (!cost || !cand) return '';
      return `
        <div class="grid-2" style="margin-bottom:${showAllPilots ? '16px' : '0'};">
          <div class="info-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <span class="badge badge-accent">${LP.escapeHtml(cost.region)} · 전환비 현황</span>
              <span class="badge badge-wood">${LP.escapeHtml(cost.cost_tag)}</span>
            </div>
            <div style="font-weight:800;font-size:15.5px;">${LP.escapeHtml(cost.facility)}</div>
            <div class="big-figure">${LP.escapeHtml(cost.headline_cost)}</div>
            <ul class="kv-list">
              <li class="kv-item"><span class="kv-key">계약·공고</span>${LP.escapeHtml(cost.contract_budget)}</li>
              <li class="kv-item"><span class="kv-key">공사 범위</span>${LP.escapeHtml(cost.scope_area)}</li>
              <li class="kv-item"><span class="kv-key warn">미확인</span>${LP.escapeHtml(cost.unverified)}</li>
            </ul>
          </div>
          <div class="info-card">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
              <span class="badge badge-accent">${LP.escapeHtml(cand.region)} · 후보 주택 현황</span>
              <span class="badge badge-warn">확정 동수 현장조사 필요</span>
            </div>
            <div style="font-weight:800;font-size:15.5px;">빈집 추정 및 사업 가능 물량 점검</div>
            <div class="big-figure">${LP.escapeHtml(cand.estimated_count)}</div>
            <ul class="kv-list">
              <li class="kv-item"><span class="kv-key">기준·등급</span>${LP.escapeHtml(cand.base_and_grade)}</li>
              <li class="kv-item"><span class="kv-key warn">개보수·동의</span>${LP.escapeHtml(cand.repair_and_consent)}</li>
              <li class="kv-item"><span class="kv-key">협약·선정</span>${LP.escapeHtml(cand.agreement_and_selection)}</li>
            </ul>
          </div>
        </div>
      `;
    }).join('');

    const dy = publicCases.danyang_lodging_ref;
    document.getElementById('danyangLodgingNote').innerHTML =
      `<strong>단양군 기존 숙박 공급 참고 (${LP.escapeHtml(dy.source)}):</strong> 총 ${dy.total_facilities}개 시설 · ${LP.fmt(dy.total_rooms)}실 (` +
      dy.breakdown.map(x => `${LP.escapeHtml(x.category)} ${x.facilities}개소·${LP.fmt(x.rooms)}실`).join(', ') +
      `) · <em>${LP.escapeHtml(dy.limitation)}</em>`;
  }

  function renderBenchmarks() {
    const grid = document.getElementById('benchmarkCardGrid');
    const items = activeBenchFilter === 'ALL'
      ? publicCases.public_benchmarks
      : publicCases.public_benchmarks.filter(b => b.category === activeBenchFilter);

    grid.innerHTML = items.map(b => `
      <article class="bench-card">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span class="badge badge-accent">${LP.escapeHtml(b.scenario)}</span>
          <span class="badge badge-wood">${LP.escapeHtml(b.type)}</span>
        </div>
        <div style="font-weight:800;font-size:15px;color:#162922;">${LP.escapeHtml(b.name)}</div>
        <div class="bench-cost">${LP.escapeHtml(b.headline_cost)}</div>
        <div class="bench-meta"><strong>예산 상세:</strong> ${LP.escapeHtml(b.budget_detail)}</div>
        <div class="bench-meta"><strong>사업 규모:</strong> ${LP.escapeHtml(b.scale_text)}</div>
        <div class="bench-warn"><strong>실무 주의:</strong> ${LP.escapeHtml(b.constraint_note)}</div>
        <div class="bench-source">출처: ${LP.escapeHtml(b.source)}</div>
      </article>
    `).join('');
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
    renderPilotFactCards();
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
    document.querySelectorAll('.bench-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bench-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeBenchFilter = btn.dataset.cat;
        renderBenchmarks();
      });
    });
    document.getElementById('toggleAllPilotsBtn').addEventListener('click', (e) => {
      showAllPilots = !showAllPilots;
      e.target.classList.toggle('active', showAllPilots);
      e.target.textContent = showAllPilots ? '선택 거점만 보기' : '3개 지역 전체 비교';
      renderPilotFactCards();
    });

    renderBenchmarks();
    const st = LP.getState();
    selectPilot(PILOT_CODES.includes(st.regionCode) ? st.regionCode : '43800');
  } catch (err) {
    console.error(err);
  }
})();
