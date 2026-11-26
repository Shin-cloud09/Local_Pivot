/**
 * alternatives.html [3. 대안 시뮬레이션] 전용 스크립트
 * - 모든 금액 단위: 만 원 통일 / 방문 단위: 회 / 정착 단위: 명
 * - 기준 가동률 정의·연간 운영일수 실시간 설명
 * - 대안별(A·B·C) 인터랙티브 카드 + 3개년 누적 총사업비 자동 계산
 * - 초심자용 빠른 프리셋 + 목표 달성 필요 조건 역산 + 공무원 CSV 로컬 업로드
 */
(async () => {
  const LP = window.LocalPivot;
  const UP = window.LocalPivotUploader;
  let regions = {};
  let simChart = null;
  let state = LP.getState();

  const el = id => document.getElementById(id);

  function syncCustomBanner() {
    const custom = LP.getCustomData();
    const statusBox = el('uploadStatusBox');
    const resetBtn = el('resetCustomBtn');
    const modeBadge = el('simModeBadge');
    const capWrap = el('capCandidateWrap');
    const uploadDetails = el('uploadDetails');

    if (custom) {
      statusBox.className = 'info-box';
      statusBox.style.borderLeft = '4px solid #8a6a44';
      statusBox.innerHTML = `<strong>[자체 내부 데이터 반영 중]</strong> ${LP.escapeHtml(custom.regionName)} · 보유 후보주택 <strong>${LP.fmt(custom.candidateUnits)}동</strong> · 호당 전환비 <strong>${LP.fmtMan(custom.unitCostMan)}</strong> · 투입예산 <strong>${LP.fmtMan(custom.budgetMan)}</strong> · 실측 가동률 <strong>${custom.occRate}%</strong> <span style="color:#4b6359;">(${LP.escapeHtml(custom.uploadedAt)})</span>`;
      resetBtn.disabled = false;
      modeBadge.textContent = '자체 데이터 반영 중';
      modeBadge.className = 'badge badge-wood';
      capWrap.style.display = 'inline-flex';
      if (uploadDetails) uploadDetails.open = true;
    } else {
      statusBox.className = 'info-box';
      statusBox.style.borderLeft = '4px solid #1f5c45';
      statusBox.innerHTML = `현재 <strong>공개자료·예시 가정값</strong>으로 계산 중입니다. 지자체에서 조사한 빈집 수·견적 단가·가동률 CSV가 있다면 아래에 올려 즉시 반영할 수 있습니다.`;
      resetBtn.disabled = true;
      modeBadge.textContent = '공개자료·가정 기준';
      modeBadge.className = 'badge badge-accent';
      capWrap.style.display = 'none';
    }
    LP.renderNavStatus(regions);
  }

  function applyCustomToInputs(custom) {
    const match = Object.values(regions).find(r =>
      r.full_name === custom.regionName || r.sigungu_name === custom.regionName
    );
    if (match) {
      el('simRegionSelect').value = match.adm_cd;
      state.regionCode = match.adm_cd;
    }
    ['A', 'B', 'C'].forEach(k => {
      el(`initCost${k}`).value = custom.unitCostMan;
    });
    el('budget').value = custom.budgetMan;
    el('inputUnits').value = custom.candidateUnits;
    el('occRate').value = custom.occRate;
    el('costMode').value = custom.budgetMan > 0 ? 'budget' : 'units';
    syncScenarioDetailInputs(state.scenarioKey);
    runSimulation();
  }

  function selectActiveScenario(key) {
    if (!['A', 'B', 'C'].includes(key)) return;
    state = LP.setState({ scenarioKey: key });
    el('scenarioSelect').value = key;
    ['A', 'B', 'C'].forEach(k => {
      const card = el(`altCard${k}`);
      const radio = el(`altRadio${k}`);
      if (card) card.classList.toggle('selected', k === key);
      if (radio) radio.checked = (k === key);
    });
    syncScenarioDetailInputs(key);
    runSimulation();
  }

  function readScenariosFromUI() {
    const cur = LP.getState().scenarios;
    const activeKey = el('scenarioSelect').value;
    const next = {
      A: { ...cur.A, initCostMan: Number(el('initCostA').value), opCostMan: Number(el('opCostA').value) },
      B: { ...cur.B, initCostMan: Number(el('initCostB').value), opCostMan: Number(el('opCostB').value) },
      C: { ...cur.C, initCostMan: Number(el('initCostC').value), opCostMan: Number(el('opCostC').value) }
    };
    const mv = Number(el('paramMonthlyVisits').value);
    const rg = Number(el('paramResidentGain').value);
    const sm = Number(el('paramSpendMult').value);
    if (Number.isFinite(mv) && mv >= 0) next[activeKey].monthlyVisitorsPerUnit = mv;
    if (Number.isFinite(rg) && rg >= 0) next[activeKey].residentGainPerUnit = rg;
    if (Number.isFinite(sm) && sm > 0) next[activeKey].spendMultiplier = sm;
    return next;
  }

  function syncScenarioDetailInputs(activeKey) {
    const scn = LP.getState().scenarios[activeKey];
    el('activeParamLabel').textContent = scn.name;
    el('paramMonthlyVisits').value = scn.monthlyVisitorsPerUnit;
    el('paramResidentGain').value = scn.residentGainPerUnit;
    el('paramSpendMult').value = scn.spendMultiplier;
  }

  function computeUnitsForScenario(scn, costMode, rawUnits, budgetMan, custom, capEnabled) {
    let units = 0;
    let capped = false;
    if (costMode === 'budget') {
      if (!Number.isFinite(scn.initCostMan) || scn.initCostMan <= 0 || !Number.isFinite(budgetMan) || budgetMan < 0) {
        return { valid: false, units: 0, capped: false };
      }
      units = Math.floor(budgetMan / scn.initCostMan);
    } else {
      if (!Number.isFinite(rawUnits) || rawUnits < 1 || !Number.isInteger(rawUnits)) {
        return { valid: false, units: 0, capped: false };
      }
      units = rawUnits;
    }
    if (custom && capEnabled && units > custom.candidateUnits) {
      units = custom.candidateUnits;
      capped = true;
    }
    return { valid: true, units, capped };
  }

  function runGoalSeek(activeScn, occRate, budgetMan, custom) {
    const goalType = el('goalType').value;
    const goalTarget = Number(el('goalTarget').value);
    const outBox = el('goalSeekResult');

    if (!Number.isFinite(goalTarget) || goalTarget <= 0) {
      outBox.innerHTML = '0보다 큰 목표 수치를 입력하세요.';
      return null;
    }

    const perUnitAnnualAt100 = goalType === 'visits'
      ? activeScn.monthlyVisitorsPerUnit * 12
      : activeScn.residentGainPerUnit;

    if (perUnitAnnualAt100 <= 0) {
      outBox.innerHTML = `<strong>${LP.escapeHtml(activeScn.name)}</strong>은(는) 해당 목표 항목 계수가 0이므로 산출할 수 없습니다. 다른 대안이나 목표 항목을 선택하세요.`;
      return null;
    }

    const reqUnitsAtOcc = occRate > 0
      ? Math.ceil(goalTarget / (perUnitAnnualAt100 * (occRate / 100)))
      : Infinity;
    const reqInitBudgetMan = Number.isFinite(reqUnitsAtOcc) ? reqUnitsAtOcc * activeScn.initCostMan : Infinity;

    const affordableUnits = (activeScn.initCostMan > 0 && budgetMan > 0)
      ? Math.floor(budgetMan / activeScn.initCostMan)
      : 0;
    const reqOccAtBudget = affordableUnits > 0
      ? (goalTarget / (affordableUnits * perUnitAnnualAt100)) * 100
      : Infinity;

    const warnings = [];
    if (reqOccAtBudget > 85) {
      warnings.push(`현재 예산(${LP.fmtMan(budgetMan)}, ${LP.fmt(affordableUnits)}호) 기준 필요 최소 가동률이 ${LP.fmtDec(reqOccAtBudget, 1)}%로 현실적 상한(85%)을 초과합니다.`);
    }
    if (custom && reqUnitsAtOcc > custom.candidateUnits) {
      warnings.push(`필요 최소 호수(${LP.fmt(reqUnitsAtOcc)}호)가 업로드된 보유 후보주택(${LP.fmt(custom.candidateUnits)}동)을 초과합니다.`);
    }

    const goalUnitLabel = goalType === 'visits' ? '회' : '명';
    outBox.innerHTML = `
      <div>• <strong>기준 가동률(${occRate}%) 유지 시:</strong> 목표(${LP.fmt(goalTarget)}${goalUnitLabel}) 달성에 최소 <strong>${Number.isFinite(reqUnitsAtOcc) ? LP.fmt(reqUnitsAtOcc) + '호' : '산출 불가'}</strong> 필요 (예상 초기 전환비 <strong>${Number.isFinite(reqInitBudgetMan) ? LP.fmtMan(reqInitBudgetMan) : '—'}</strong>)</div>
      <div style="margin-top:5px;">• <strong>현재 예산(${LP.fmtMan(budgetMan)} → ${LP.fmt(affordableUnits)}호) 기준 시:</strong> 목표 달성에 필요한 최소 가동률은 <strong>${Number.isFinite(reqOccAtBudget) ? LP.fmtDec(reqOccAtBudget, 1) + '%' : '산출 불가'}</strong></div>
      ${warnings.length ? `<div class="notice-danger" style="margin-top:8px;"><strong>[실현 가능성 주의]</strong> ${warnings.join(' ')}</div>` : '<div style="margin-top:6px;color:#1f5c45;font-weight:700;">※ 현재 가동률·예산 범위 내에서 물리적으로 검토 가능한 수준입니다.</div>'}
    `;

    return { goalType, goalTarget, reqUnitsAtOcc, reqOccAtBudget, warnings };
  }

  function runSimulation() {
    const code = el('simRegionSelect').value;
    const region = regions[code];
    if (!region) return;

    const monthKey = el('simMonthSelect').value;
    const activeKey = el('scenarioSelect').value;
    const costMode = el('costMode').value;
    const rawUnits = Number(el('inputUnits').value);
    const budgetMan = Number(el('budget').value);
    const occRate = Number(el('occRate').value);
    const perVisitSpendMan = Number(el('perVisitSpendMan').value);
    const capEnabled = el('capCandidateCheck').checked;
    const scenarios = readScenariosFromUI();
    const activeScn = scenarios[activeKey];
    const custom = LP.getCustomData();

    el('budgetWrap').style.display = costMode === 'budget' ? 'flex' : 'none';
    el('unitsWrap').style.display = costMode === 'budget' ? 'none' : 'flex';
    const occDays = Math.round(365 * occRate / 100);
    el('occRateVal').textContent = `${occRate}% (연 약 ${occDays}일 운영)`;
    el('occExplain').textContent = `기준 가동률 ${occRate}%는 빈집 1호당 1년(365일) 중 약 ${occDays}일 실제로 예약·입주·운영됨을 뜻합니다. 아래 결과에서는 보수(${Math.max(0, occRate - 10)}%) · 기준(${occRate}%) · 낙관(${Math.min(100, occRate + 10)}%) 3구간을 함께 비교합니다.`;

    // Diagnosis banner
    const diag = LP.diagnoseRegion(region, regions);
    const lp = region.living_pop[monthKey] || region.living_pop.avg;
    el('simDiagBanner').innerHTML =
      `<strong>${LP.escapeHtml(region.full_name)} 데이터 진단 [${LP.escapeHtml(diag.typeLabel)}]:</strong> 1차 우선 검토 대안은 <strong>${LP.escapeHtml(diag.recommendedText)}</strong>입니다. ` +
      `<span style="color:#4b6359;">(통계청 ${LP.periodLabel(monthKey)} 월간 1인당 카드소비액 참고: ${LP.fmtWonAsMan(lp.spend_per_person, 2)}/월)</span>`;

    // Show recommendation badges on the 3 alternative cards
    ['A', 'B', 'C'].forEach(k => {
      const b = el(`altRecBadge${k}`);
      if (b) b.style.display = (k === diag.recommendedKey) ? 'inline-block' : 'none';
    });

    if (!Number.isFinite(perVisitSpendMan) || perVisitSpendMan < 0) {
      el('simErrorBox').style.display = 'block';
      el('simErrorBox').textContent = '1회 방문당 추정 소비액(만 원)은 0 이상의 숫자여야 합니다.';
      return;
    }

    const activeCalc = computeUnitsForScenario(activeScn, costMode, rawUnits, budgetMan, custom, capEnabled);
    if (!activeCalc.valid) {
      el('simErrorBox').style.display = 'block';
      el('simErrorBox').textContent = costMode === 'budget'
        ? '0 이상의 투입 예산(만 원)과 0보다 큰 대안별 초기 전환비를 입력하세요.'
        : '전환 호수는 1 이상의 정수를 입력하세요.';
      return;
    }
    el('simErrorBox').style.display = 'none';

    // Update live mini-summary inside each of the 3 Alternative Cards
    ['A', 'B', 'C'].forEach(k => {
      const p = scenarios[k];
      const c = computeUnitsForScenario(p, costMode, rawUnits, budgetMan, custom, capEnabled);
      const u = c.valid ? c.units : 0;
      const initM = u * p.initCostMan;
      const opM = u * (Number.isFinite(p.opCostMan) ? p.opCostMan : 0);
      const threeYrM = initM + opM * 3;
      const sumEl = el(`altSum${k}`);
      if (sumEl) {
        sumEl.innerHTML = `전환 <strong>${LP.fmt(u)}호</strong> · 초기비 <strong>${LP.fmtMan(initM)}</strong><br>연 운영비 ${LP.fmtMan(opM)} · <strong>3년 누적 총비용 ${LP.fmtMan(threeYrM)}</strong>`;
      }
    });

    const units = activeCalc.units;
    const initTotalMan = units * activeScn.initCostMan;
    const opTotalMan = units * (Number.isFinite(activeScn.opCostMan) ? activeScn.opCostMan : 0);
    const threeYearTotalMan = initTotalMan + opTotalMan * 3;
    const rows = LP.estimateRows(activeScn, units, occRate, perVisitSpendMan);
    const baseRow = rows[1];

    // Persist state
    state = LP.setState({
      regionCode: code,
      monthKey,
      scenarioKey: activeKey,
      costMode,
      units: costMode === 'units' ? rawUnits : units,
      budgetMan,
      occRate,
      perVisitSpendMan,
      capToCandidate: capEnabled,
      scenarios
    });
    LP.renderNavStatus(regions);

    const pctUnocc = region.unoccupied_housing > 0 ? ((units / region.unoccupied_housing) * 100).toFixed(2) : '—';
    const capNote = activeCalc.capped
      ? ` [보유 후보주택 ${LP.fmt(custom.candidateUnits)}동 상한 적용됨]`
      : (custom && units > custom.candidateUnits ? ` ※ 주의: 산출 호수(${LP.fmt(units)}호)가 보유 후보주택(${LP.fmt(custom.candidateUnits)}동)을 초과합니다.` : '');
    const capacityAlert = baseRow.capacityWarn
      ? ' ※ 물리적 수용 한계 주의: 연간 방문 횟수가 연간 가동 객실일수의 2배를 초과합니다.'
      : '';

    const costNoteText = `[${activeScn.name}] 전환 규모 ${LP.fmt(units)}호(미거주주택 대비 ${pctUnocc}%) · 초기 전환비 ${LP.fmtMan(initTotalMan)} + 연 운영비 ${LP.fmtMan(opTotalMan)} (3년 누적 ${LP.fmtMan(threeYearTotalMan)})${capNote}${capacityAlert}`;
    el('costNote').textContent = costNoteText;

    // KPIs
    el('resUnits').textContent = `${LP.fmt(units)}호`;
    el('resUnitsSub').textContent = `연간 가동 객실일수 ${LP.fmt(baseRow.activeRoomDays)}일 (가동률 ${occRate}%)`;
    el('resVisits').textContent = `${LP.fmt(baseRow.visits)}회`;
    el('resVisitsSub').textContent = `보수 ${LP.fmt(rows[0].visits)} ~ 낙관 ${LP.fmt(rows[2].visits)}회 (중복 포함)`;
    el('resSettlers').textContent = `${LP.fmt(baseRow.settlers)}명`;
    el('resSettlersSub').textContent = `보수 ${LP.fmt(rows[0].settlers)} ~ 낙관 ${LP.fmt(rows[2].settlers)}명 (방문과 별개)`;
    el('resSpend').textContent = LP.fmtMan(baseRow.spendMan);

    if (initTotalMan > 0) {
      const ratio = baseRow.spendMan / initTotalMan;
      const perThousand = Math.round(ratio * 1000);
      el('resEfficiency').textContent = `초기비 1,000만 원당 연 ${LP.fmtMan(perThousand)} (${LP.fmtDec(ratio, 2)}배)`;
    } else {
      el('resEfficiency').textContent = '초기 전환비 미입력';
    }

    // 3-Alternative Fair Comparison Table
    const compBody = el('compareAllBody');
    compBody.innerHTML = ['A', 'B', 'C'].map(k => {
      const p = scenarios[k];
      const cCalc = computeUnitsForScenario(p, costMode, rawUnits, budgetMan, custom, capEnabled);
      const u = cCalc.valid ? cCalc.units : 0;
      const initM = u * p.initCostMan;
      const opM = u * (Number.isFinite(p.opCostMan) ? p.opCostMan : 0);
      const threeM = initM + opM * 3;
      const r3 = LP.estimateRows(p, u, occRate, perVisitSpendMan);
      const mid = r3[1];
      const eff = initM > 0 ? `${LP.fmtDec(mid.spendMan / initM, 2)}배` : '—';
      const isRec = k === diag.recommendedKey;
      return `
        <tr class="${k === activeKey ? 'row-highlight' : ''}">
          <td>
            <strong>${LP.escapeHtml(p.short)}</strong>
            ${isRec ? '<span class="badge badge-accent" style="margin-left:4px;">진단 1순위</span>' : ''}
            <br><small style="color:#4b6359;">호당 초기 ${LP.fmtMan(p.initCostMan)} · 연운영 ${LP.fmtMan(p.opCostMan)}</small>
          </td>
          <td class="num">${LP.fmt(u)}호</td>
          <td class="num">${LP.fmtMan(initM)}<br><small style="color:#4b6359;">3년 누적 ${LP.fmtMan(threeM)}</small></td>
          <td class="num">${LP.fmt(mid.visits)}회</td>
          <td class="num">${LP.fmt(mid.settlers)}명</td>
          <td class="num">${LP.fmtMan(mid.spendMan)}</td>
          <td class="num">${eff}</td>
        </tr>
      `;
    }).join('');

    // Sensitivity Table
    el('sensitivityBody').innerHTML = rows.map((r, i) => `
      <tr class="${i === 1 ? 'row-highlight' : ''}">
        <td>${r.label}</td>
        <td class="num">${r.occ}%</td>
        <td class="num">${LP.fmt(r.activeRoomDays)}일</td>
        <td class="num">${LP.fmt(r.visits)}회</td>
        <td class="num">${LP.fmt(r.settlers)}명</td>
        <td class="num">${LP.fmtMan(r.spendMan)}</td>
      </tr>
    `).join('');

    // Chart.js (Zero-lag update('none'), 만 원 & 회)
    const ctx = el('simChart').getContext('2d');
    const chartVisits = rows.map(r => r.visits);
    const chartSpendMan = rows.map(r => r.spendMan);
    if (!simChart) {
      simChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: rows.map(r => `${r.label} (${r.occ}%)`),
          datasets: [
            {
              label: '연간 예상 방문 (회)',
              data: chartVisits,
              backgroundColor: 'rgba(31, 92, 69, 0.84)',
              borderRadius: 6,
              yAxisID: 'y'
            },
            {
              label: '연간 추가 소비 추정 (만 원)',
              data: chartSpendMan,
              backgroundColor: 'rgba(138, 106, 68, 0.84)',
              borderRadius: 6,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: '방문 횟수 (회)' } },
            y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: '추가 소비 (만 원)' } }
          }
        }
      });
    } else {
      simChart.data.labels = rows.map(r => `${r.label} (${r.occ}%)`);
      simChart.data.datasets[0].data = chartVisits;
      simChart.data.datasets[1].data = chartSpendMan;
      simChart.update('none');
    }

    const goalSeekRes = runGoalSeek(activeScn, occRate, costMode === 'budget' ? budgetMan : initTotalMan, custom);

    // Save snapshot for report.html
    try {
      const chartImg = simChart ? simChart.toBase64Image() : null;
      localStorage.setItem('localPivot_lastSim_v4', JSON.stringify({
        regionCode: code,
        regionName: region.full_name,
        sigunguName: region.sigungu_name,
        monthKey,
        scenarioKey: activeKey,
        scenarioName: activeScn.name,
        scenarioParams: activeScn,
        costMode,
        units,
        initCostMan: activeScn.initCostMan,
        opCostMan: activeScn.opCostMan,
        initTotalMan,
        opTotalMan,
        threeYearTotalMan,
        budgetMan,
        occRate,
        perVisitSpendMan,
        rows,
        costNote: costNoteText,
        diagnosis: diag,
        goalSeek: goalSeekRes,
        customData: custom,
        chartImg
      }));
    } catch {}
  }

  const debouncedRun = LP.debounce(runSimulation, 120);

  try {
    regions = await LP.fetchCachedJSON('data/regions_89_master.json');
    const sel = el('simRegionSelect');
    const pilotCodes = ['43800', '46770', '47730'];
    const pilots = pilotCodes.map(c => regions[c]).filter(Boolean);
    const others = Object.values(regions).filter(r => !pilotCodes.includes(r.adm_cd))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ko'));
    for (const [label, items] of [['시범 거점 3개 지역', pilots], ['그 외 인구감소지역 (86곳)', others]]) {
      const grp = document.createElement('optgroup');
      grp.label = label;
      items.forEach(r => grp.append(new Option(r.full_name, r.adm_cd)));
      sel.append(grp);
    }

    // Restore state
    sel.value = regions[state.regionCode] ? state.regionCode : '43800';
    el('simMonthSelect').value = state.monthKey || 'avg';
    el('scenarioSelect').value = state.scenarioKey || 'A';
    el('costMode').value = state.costMode || 'units';
    el('inputUnits').value = state.units ?? 10;
    el('budget').value = state.budgetMan ?? 80000;
    el('occRate').value = state.occRate ?? 55;
    el('perVisitSpendMan').value = state.perVisitSpendMan ?? 5.0;
    el('capCandidateCheck').checked = Boolean(state.capToCandidate);

    ['A', 'B', 'C'].forEach(k => {
      el(`initCost${k}`).value = state.scenarios[k].initCostMan;
      el(`opCost${k}`).value = state.scenarios[k].opCostMan;
      el(`altCardHead${k}`).addEventListener('click', () => selectActiveScenario(k));
    });

    ['simRegionSelect', 'simMonthSelect', 'costMode', 'capCandidateCheck', 'goalType'].forEach(id => {
      el(id).addEventListener('change', runSimulation);
    });
    el('scenarioSelect').addEventListener('change', () => selectActiveScenario(el('scenarioSelect').value));

    ['inputUnits', 'budget', 'occRate', 'perVisitSpendMan', 'initCostA', 'opCostA', 'initCostB', 'opCostB', 'initCostC', 'opCostC', 'paramMonthlyVisits', 'paramResidentGain', 'paramSpendMult', 'goalTarget'].forEach(id => {
      el(id).addEventListener('input', debouncedRun);
    });

    // Novice quick scenario presets
    document.querySelectorAll('.quick-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        el('costMode').value = mode;
        if (mode === 'units') el('inputUnits').value = btn.dataset.val;
        else el('budget').value = btn.dataset.val;
        runSimulation();
      });
    });

    // Verified public notice presets (only for C. 귀농·귀촌 정착)
    document.querySelectorAll('.preset-c-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        el('initCostC').value = btn.dataset.cost;
        selectActiveScenario('C');
      });
    });

    el('resetParamsBtn').addEventListener('click', () => {
      const def = JSON.parse(JSON.stringify(LP.DEFAULT_SCENARIOS));
      LP.setState({ scenarios: def, perVisitSpendMan: 5.0 });
      ['A', 'B', 'C'].forEach(k => {
        el(`initCost${k}`).value = def[k].initCostMan;
        el(`opCost${k}`).value = def[k].opCostMan;
      });
      el('perVisitSpendMan').value = 5.0;
      syncScenarioDetailInputs(el('scenarioSelect').value);
      runSimulation();
    });

    // Uploader bindings
    el('downloadTemplateBtn').addEventListener('click', () => UP.downloadTemplate());
    const fileInput = el('csvFileInput');
    const dropzone = el('csvDropzone');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) processUpload(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) processUpload(e.target.files[0]);
      fileInput.value = '';
    });

    function processUpload(file) {
      el('uploadErrorBox').style.display = 'none';
      UP.handleFile(
        file,
        (data) => {
          syncCustomBanner();
          applyCustomToInputs(data);
        },
        (errors) => {
          el('uploadErrorBox').style.display = 'block';
          el('uploadErrorBox').innerHTML = `<strong>업로드 검증 오류:</strong><ul style="margin:4px 0 0;padding-left:18px;">${errors.map(x => `<li>${LP.escapeHtml(x)}</li>`).join('')}</ul>`;
        }
      );
    }

    el('resetCustomBtn').addEventListener('click', () => {
      LP.setCustomData(null);
      el('uploadErrorBox').style.display = 'none';
      el('capCandidateCheck').checked = false;
      syncCustomBanner();
      runSimulation();
    });

    syncCustomBanner();
    selectActiveScenario(state.scenarioKey || 'A');
  } catch (err) {
    console.error(err);
  }
})();
