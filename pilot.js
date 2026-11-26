/**
 * solution.html [2. 거점 · 사례 분석] 전용 스크립트
 * - 외부 차트 CDN 미사용 (LocalPivotCharts 순수 SVG 차트)
 */
(async () => {
  const LP = window.LocalPivot;
  const CH = window.LocalPivotCharts;
  LP.initOnboardingGuide(false);

  let pilotData = {};
  let publicCases = {};
  let regions = {};
  let activeCode = '43800';
  let activeChartMode = 'visits';
  let activeBenchFilter = 'ALL';
  let showAllPilots = false;

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
    document.getElementById('diagRecommendedTitle').textContent = `${reg.full_name} → 우선 검토 후보: ${diag.recommendedText}`;
    document.getElementById('diagReasonText').textContent = diag.reason;
    document.getElementById('diagSectorText').textContent =
      `12개월 외지인 소비 비중 [공식]: 식음료 ${fbPct}% · 쇼핑 ${shopPct}% · 운송 ${transPct}% · 숙박 ${lodgPct}% (89개 중 체류배수 ${diag.ranks.stayRatioRank}위 · 체류시간 ${diag.ranks.stayHoursRank}위 · 미거주율 ${diag.ranks.unoccRateRank}위)`;

    const jumpLink = document.getElementById('diagSimLink');
    jumpLink.href = `alternatives.html?region=${code}&scenario=${diag.recommendedKey}`;
    jumpLink.textContent = `선택 거점으로 시뮬레이션 열기 →`;
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
    const totalSpendMan = rows.reduce((s, r) => s + (r.nonlocal_spend_thousand_krw || 0), 0) / 10;

    document.getElementById('pKpiVisits').textContent = `${LP.fmt(totalVisits)}회`;
    document.getElementById('pKpiOvernight').textContent = `${LP.fmtDec(simpleOvernight, 2)}%`;
    document.getElementById('pKpiOvernightSub').textContent = `12개월 단순평균 (방문량 가중 ${LP.fmtDec(weightedOvernight, 2)}%)`;
    document.getElementById('pKpiLodging').textContent = `${LP.fmtDec(simpleLodging, 2)}박`;
    document.getElementById('pKpiSpend').textContent = LP.fmtMan(totalSpendMan);

    const reg = regions[code];
    document.getElementById('pilotRegionHeading').textContent = `${reg ? reg.full_name : rows[0].region} · 12개월 관광·소비 추이 (2025.11~2026.10)`;
  }

  function renderCharts(code) {
    const rows = pilotData[code] || [];
    const labels = rows.map(r => r.year_month);

    const configs = {
      visits: {
        title: '월간 방문 횟수 추이 (회, 중복 포함) [공식]',
        values: rows.map(r => r.visitor_person_visits),
        unit: '회', color: '#556b2f', decimals: 0
      },
      overnight: {
        title: '월별 숙박방문자 비율 추이 (%) [공식]',
        values: rows.map(r => r.overnight_visitors_pct),
        unit: '%', color: '#8b7355', decimals: 1
      },
      lodging: {
        title: '월별 평균 숙박일수 추이 (박) [공식]',
        values: rows.map(r => r.avg_lodging_days),
        unit: '박', color: '#415323', decimals: 2
      },
      spend: {
        title: '월별 외지인 관광소비액 추이 (만 원) [공식]',
        values: rows.map(r => Math.round((r.nonlocal_spend_thousand_krw || 0) / 10)),
        unit: '만 원', color: '#2b331f', decimals: 0
      }
    };

    CH.renderLineChart(document.getElementById('pilotTrendChart'), {
      labels,
      ...configs[activeChartMode]
    });

    const sumMan = k => Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) / 10);
    CH.renderHorizontalBarChart(document.getElementById('pilotIndustryChart'), {
      title: '12개월 외지인 업종별 소비 합계 (만 원) [공식]',
      labels: ['식음료', '운송', '쇼핑', '여가', '숙박', '웰니스/기타'],
      values: [
        sumMan('nonlocal_food_beverage_spend_thousand_krw'),
        sumMan('nonlocal_transport_spend_thousand_krw'),
        sumMan('nonlocal_shopping_spend_thousand_krw'),
        sumMan('nonlocal_leisure_spend_thousand_krw'),
        sumMan('nonlocal_lodging_spend_thousand_krw'),
        sumMan('nonlocal_wellness_spend_thousand_krw') + sumMan('nonlocal_travel_spend_thousand_krw')
      ],
      unit: '만 원'
    });
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
              <span class="badge badge-earth">${LP.escapeHtml(cost.cost_tag)}</span>
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
          <span class="badge badge-earth">${LP.escapeHtml(b.type)}</span>
        </div>
        <div style="font-weight:800;font-size:15px;color:#252c1b;">${LP.escapeHtml(b.name)}</div>
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
