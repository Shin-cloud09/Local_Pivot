/**
 * alternatives.html [3. 대안 시뮬레이션] 전용 스크립트
 * - 외부 Chart.js CDN 완전 제거 (LocalPivotCharts 순수 SVG 그래프 사용 → 그래프 미산출 원천 차단)
 * - 동일 예산 비교(budget) 기본화 + 예산 잔액 + 5년 단순 누적 재정부담
 * - 전국 공통 가정 투명 고지(P0-03), 방문 관련 소비 추정액 정직 표기(P0-07), 다중행·대안별 CSV(P1-01), 사전 추진가능성 점검(P1-08)
 */
(async () => {
  const LP = window.LocalPivot;
  const UP = window.LocalPivotUploader;
  const CH = window.LocalPivotCharts;
  LP.initOnboardingGuide(false);

  let regions = {};
  let state = LP.getState();
  const el = id => document.getElementById(id);

  function syncCustomBanner() {
    const custom = LP.getCustomData();
    const statusBox = el('uploadStatusBox');
    const resetBtn = el('resetCustomBtn');
    const modeBadge = el('simModeBadge');
    const capWrap = el('capCandidateWrap');
    const multiWrap = el('csvRowSelectWrap');
    const multiSel = el('csvRowSelect');
    const uploadDetails = el('uploadDetails');

    if (custom) {
      const costSummary = custom.altCosts
        ? `대안별 단가(A ${LP.fmtMan(custom.altCosts.A)} / B ${LP.fmtMan(custom.altCosts.B)} / C ${LP.fmtMan(custom.altCosts.C)})`
        : `공통 단가 ${LP.fmtMan(custom.unitCostMan)}`;
      statusBox.className = 'info-box';
      statusBox.style.borderLeft = '4px solid #8b7355';
      statusBox.innerHTML = `${LP.certBadge('actual')} <strong>자체 내부 데이터 반영 중:</strong> ${LP.escapeHtml(custom.regionName)} · 보유 후보주택 <strong>${LP.fmt(custom.candidateUnits)}동</strong> · ${costSummary} · 투입예산 <strong>${LP.fmtMan(custom.budgetMan)}</strong> · 실측 가동률 <strong>${custom.occRate}%</strong>`;
      resetBtn.disabled = false;
      modeBadge.textContent = '자체 데이터 반영 [실측]';
      modeBadge.className = 'badge badge-earth';
      capWrap.style.display = 'inline-flex';
      if (uploadDetails) uploadDetails.open = true;

      if (custom.allRows && custom.allRows.length > 1) {
        multiWrap.style.display = 'flex';
        multiSel.innerHTML = '';
        custom.allRows.forEach((row, idx) => {
          multiSel.append(new Option(`${idx + 1}행: ${row.regionName} (후보 ${row.candidateUnits}동 · 예산 ${LP.fmtMan(row.budgetMan)})`, String(idx)));
        });
        multiSel.value = String(custom.selectedIndex || 0);
      } else {
        multiWrap.style.display = 'none';
      }
    } else {
      statusBox.className = 'info-box';
      statusBox.style.borderLeft = '4px solid #556b2f';
      statusBox.innerHTML = `${LP.certBadge('unknown')} <strong>현장 확보 물량 미확인:</strong> 현재 공개자료·예시 가정값 기준입니다. 지자체 보유 CSV를 올리면 확정 후보주택 상한과 실측 단가·가동률이 즉시 반영됩니다.`;
      resetBtn.disabled = true;
      modeBadge.textContent = '공개자료·가정 기준';
      modeBadge.className = 'badge badge-accent';
      capWrap.style.display = 'none';
      multiWrap.style.display = 'none';
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
    // P1-01: 대안별 비용 열이 있으면 개별 보존, 통합 단가일 경우에만 현재 선택 대안(또는 전체) 명시 적용
    if (custom.altCosts) {
      el('initCostA').value = custom.altCosts.A;
      el('initCostB').value = custom.altCosts.B;
      el('initCostC').value = custom.altCosts.C;
    } else {
      const activeKey = el('scenarioSelect').value || 'A';
      el(`initCost${activeKey}`).value = custom.unitCostMan;
    }
    el('budget').value = custom.budgetMan;
    el('inputUnits').value = Math.max(1, custom.candidateUnits);
    el('occRate').value = custom.occRate;
    el('costMode').value = custom.budgetMan > 0 ? 'budget' : 'units';
    el('capCandidateCheck').checked = true;
    syncScenarioDetailInputs(el('scenarioSelect').value);
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
    let budgetRemainderMan = 0;
    if (costMode === 'budget') {
      if (!Number.isFinite(scn.initCostMan) || scn.initCostMan <= 0 || !Number.isFinite(budgetMan) || budgetMan < 0) {
        return { valid: false, units: 0, capped: false, budgetRemainderMan: 0 };
      }
      units = Math.floor(budgetMan / scn.initCostMan);
    } else {
      if (!Number.isFinite(rawUnits) || rawUnits < 1 || !Number.isInteger(rawUnits)) {
        return { valid: false, units: 0, capped: false, budgetRemainderMan: 0 };
      }
      units = rawUnits;
    }
    if (custom && capEnabled && units > custom.candidateUnits) {
      units = custom.candidateUnits;
      capped = true;
    }
    if (costMode === 'budget') {
      budgetRemainderMan = Math.max(0, budgetMan - units * scn.initCostMan);
    }
    return { valid: true, units, capped, budgetRemainderMan };
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
      outBox.innerHTML = `<strong>${LP.escapeHtml(activeScn.name)}</strong>은(는) 해당 목표 항목의 가정 계수가 0이므로 산출할 수 없습니다. 다른 대안이나 목표 항목을 선택하세요.`;
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

    // P1-03: 85% 검토 기준 상한과 100% 물리적 이론 상한 구분
    const warnings = [];
    if (reqOccAtBudget > 100) {
      warnings.push(`필요 가동률(${LP.fmtDec(reqOccAtBudget, 1)}%)이 물리적 이론 상한(100%)을 초과해 현재 호수(${LP.fmt(affordableUnits)}호)만으로는 달성이 불가능합니다.`);
    } else if (reqOccAtBudget > 85) {
      warnings.push(`필요 가동률(${LP.fmtDec(reqOccAtBudget, 1)}%)이 현재 설정된 검토 기준 상한(85%)을 초과합니다.`);
    }
    if (custom && reqUnitsAtOcc > custom.candidateUnits) {
      warnings.push(`필요 최소 호수(${LP.fmt(reqUnitsAtOcc)}호)가 보유 후보주택(${LP.fmt(custom.candidateUnits)}동)을 초과합니다.`);
    }

    const goalUnitLabel = goalType === 'visits' ? '회' : '명';
    outBox.innerHTML = `
      <div>• <strong>기준 가동률(${occRate}%) 유지 시:</strong> 목표(${LP.fmt(goalTarget)}${goalUnitLabel}) 달성에 최소 <strong>${Number.isFinite(reqUnitsAtOcc) ? LP.fmt(reqUnitsAtOcc) + '호' : '산출 불가'}</strong> 필요 (예상 초기 전환비 <strong>${Number.isFinite(reqInitBudgetMan) ? LP.fmtMan(reqInitBudgetMan) : '—'}</strong>)</div>
      <div style="margin-top:5px;">• <strong>현재 예산(${LP.fmtMan(budgetMan)} → ${LP.fmt(affordableUnits)}호) 기준 시:</strong> 목표 달성에 필요한 최소 가동률은 <strong>${Number.isFinite(reqOccAtBudget) ? LP.fmtDec(reqOccAtBudget, 1) + '%' : '산출 불가'}</strong> (이론 상한 100% / 검토 기준 상한 85%)</div>
      ${warnings.length ? `<div class="notice-danger" style="margin-top:8px;"><strong>[실현 가능성 주의]</strong> ${warnings.join(' ')}</div>` : '<div style="margin-top:6px;color:#556b2f;font-weight:700;">※ 현재 검토 기준 상한(85%) 및 예산 범위 내에서 사전검토 가능한 수준입니다.</div>'}
    `;

    return { goalType, goalTarget, reqUnitsAtOcc, reqOccAtBudget, warnings };
  }

  function readFeasibilityChecks() {
    return {
      housingSecured: el('chkHousing').checked,
      ownerConsent: el('chkConsent').checked,
      safetyCheck: el('chkSafety').checked,
      legalPermits: el('chkLegal').checked,
      operatorReady: el('chkOperator').checked,
      opBudgetReady: el('chkOpBudget').checked
    };
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
    const checks = readFeasibilityChecks();

    el('budgetWrap').style.display = costMode === 'budget' ? 'flex' : 'none';
    el('unitsWrap').style.display = costMode === 'budget' ? 'none' : 'flex';
    const occDays = Math.round(365 * occRate / 100);
    el('occRateVal').textContent = `${occRate}% (연 약 ${occDays}일 운영)`;
    el('occExplain').textContent = `기준 가동률 ${occRate}%는 1개소당 1년(365일) 중 약 ${occDays}일 실제 운영·입주됨을 뜻합니다. 보수(${Math.max(0, occRate - 10)}%) · 기준(${occRate}%) · 낙관(${Math.min(100, occRate + 10)}%) 3구간을 비교합니다.`;

    // P0-03: 지역 진단 + 전국 공통 가정 투명 고지
    const diag = LP.diagnoseRegion(region, regions);
    const lp = region.living_pop[monthKey] || region.living_pop.avg;
    el('simDiagBanner').innerHTML =
      `${LP.certBadge('official')} <strong>${LP.escapeHtml(region.full_name)}</strong> (${LP.escapeHtml(diag.typeLabel)} · 우선 검토 후보: <strong>${LP.escapeHtml(diag.recommendedText)}</strong> · 공식 월간 카드소비 ${LP.fmtWonAsMan(lp.spend_per_person, 2)}/월)<br>` +
      `<span style="color:#5c634d;font-size:12.5px;">${LP.certBadge('assumed')} <strong>전국 공통 가정 안내:</strong> 아래 방문·정착·소비 추정식은 임의 지역 보정치를 넣지 않은 전국 공통 가정 모델입니다. 지역별 실측 차이를 반영하려면 자체 CSV를 업로드하거나 고급 설정 계수를 수정하세요.</span>`;

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

    // Update each of the 3 Alternative Cards (with 5-year fiscal burden & budget remainder)
    ['A', 'B', 'C'].forEach(k => {
      const p = scenarios[k];
      const c = computeUnitsForScenario(p, costMode, rawUnits, budgetMan, custom, capEnabled);
      const u = c.valid ? c.units : 0;
      const initM = u * p.initCostMan;
      const opM = u * (Number.isFinite(p.opCostMan) ? p.opCostMan : 0);
      const fiveYrM = initM + opM * 5;
      const remTxt = costMode === 'budget' ? ` · 잔액 ${LP.fmtMan(c.budgetRemainderMan)}` : '';
      const sumEl = el(`altSum${k}`);
      if (sumEl) {
        sumEl.innerHTML = `전환 <strong>${LP.fmt(u)}호</strong>${remTxt}<br>초기 ${LP.fmtMan(initM)} · <strong>5년 누적 재정부담 ${LP.fmtMan(fiveYrM)}</strong>`;
      }
    });

    const units = activeCalc.units;
    const initTotalMan = units * activeScn.initCostMan;
    const opTotalMan = units * (Number.isFinite(activeScn.opCostMan) ? activeScn.opCostMan : 0);
    const fiveYearTotalMan = initTotalMan + opTotalMan * 5;
    const rows = LP.estimateRows(activeScn, units, occRate, perVisitSpendMan);
    const baseRow = rows[1];

    // Save state
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
      feasibilityChecks: checks,
      scenarios
    });
    LP.renderNavStatus(regions);

    const pctUnocc = region.unoccupied_housing > 0 ? ((units / region.unoccupied_housing) * 100).toFixed(2) : '—';
    const capNote = activeCalc.capped
      ? ` [보유 후보주택 ${LP.fmt(custom.candidateUnits)}동 상한 적용됨]`
      : (custom && units > custom.candidateUnits ? ` ※ 주의: 산출 호수(${LP.fmt(units)}호)가 보유 후보주택(${LP.fmt(custom.candidateUnits)}동)을 초과합니다.` : '');
    const remNote = costMode === 'budget' ? ` · 예산 잔액 ${LP.fmtMan(activeCalc.budgetRemainderMan)}` : '';
    const capacityAlert = baseRow.capacityWarn
      ? ` ※ 물리적 수용 한계 주의: 연간 방문 횟수가 ${activeScn.capacityLabel}의 2배를 초과합니다.`
      : '';

    const costNoteText = `[${activeScn.name}] 전환 ${LP.fmt(units)}호(미거주주택 대비 ${pctUnocc}%)${remNote} · 초기 전환비 ${LP.fmtMan(initTotalMan)} + 연 운영비 ${LP.fmtMan(opTotalMan)} → 5년 단순 누적 재정부담 ${LP.fmtMan(fiveYearTotalMan)} (물가·할인율 미반영)${capNote}${capacityAlert}`;
    el('costNote').textContent = costNoteText;

    // P0-06 & P1-04 KPIs
    el('resUnitsLabel').innerHTML = `<span>전환 규모 · ${LP.escapeHtml(activeScn.capacityLabel)}</span> ${LP.certBadge('calc')}`;
    el('resUnits').textContent = `${LP.fmt(units)}호`;
    el('resUnitsSub').textContent = `${LP.fmt(baseRow.activeDays)} ${activeScn.capacityUnit} (가동률 ${occRate}%)`;

    el('resFiscal').textContent = LP.fmtMan(fiveYearTotalMan);
    el('resFiscalSub').textContent = `초기 ${LP.fmtMan(initTotalMan)} + 5년 운영 ${LP.fmtMan(opTotalMan * 5)} (단순합계)`;

    el('resVisits').textContent = `${LP.fmt(baseRow.visits)}회`;
    el('resVisitsSub').textContent = `보수 ${LP.fmt(rows[0].visits)} ~ 낙관 ${LP.fmt(rows[2].visits)}회 (중복 포함 · 정착 ${LP.fmt(baseRow.settlers)}명 별도)`;

    // P0-07: 방문 관련 소비 추정액 (ROI/순증 소비 오인 방지)
    el('resSpend').textContent = LP.fmtMan(baseRow.spendMan);
    el('resEfficiency').textContent = '순증 소비·지자체 세수·투자수익률(ROI)이 아닌 참고 추정치';

    // P1-09: Comparison Table (shows comparison mode, remainder, 5-yr fiscal burden, separate spend axis)
    el('compareModeBadge').textContent = costMode === 'budget'
      ? `동일 예산(${LP.fmtMan(budgetMan)}) 기준 비교`
      : `동일 규모(${LP.fmt(rawUnits)}호) 기준 비교`;

    el('compareAllBody').innerHTML = ['A', 'B', 'C'].map(k => {
      const p = scenarios[k];
      const cCalc = computeUnitsForScenario(p, costMode, rawUnits, budgetMan, custom, capEnabled);
      const u = cCalc.valid ? cCalc.units : 0;
      const initM = u * p.initCostMan;
      const opM = u * (Number.isFinite(p.opCostMan) ? p.opCostMan : 0);
      const fiveM = initM + opM * 5;
      const r3 = LP.estimateRows(p, u, occRate, perVisitSpendMan);
      const mid = r3[1];
      const isRec = k === diag.recommendedKey;
      return `
        <tr class="${k === activeKey ? 'row-highlight' : ''}">
          <td>
            <strong>${LP.escapeHtml(p.short)}</strong>
            ${isRec ? '<span class="badge badge-accent" style="margin-left:4px;">우선 후보</span>' : ''}
            <br><small style="color:#5c634d;">호당 초기 ${LP.fmtMan(p.initCostMan)} · 연운영 ${LP.fmtMan(p.opCostMan)}</small>
          </td>
          <td class="num">${LP.fmt(u)}호${costMode === 'budget' ? `<br><small style="color:#5c634d;">잔액 ${LP.fmtMan(cCalc.budgetRemainderMan)}</small>` : ''}</td>
          <td class="num">${LP.fmtMan(initM)}<br><small style="color:#5c634d;">연운영 ${LP.fmtMan(opM)}</small></td>
          <td class="num"><strong>${LP.fmtMan(fiveM)}</strong></td>
          <td class="num">${LP.fmt(mid.visits)}회</td>
          <td class="num">${LP.fmt(mid.settlers)}명</td>
          <td class="num">${LP.fmtMan(mid.spendMan)}</td>
        </tr>
      `;
    }).join('');

    // Sensitivity Table (Facility-specific capacity header)
    el('sensCapHeader').textContent = activeScn.capacityLabel;
    el('sensitivityBody').innerHTML = rows.map((r, i) => `
      <tr class="${i === 1 ? 'row-highlight' : ''}">
        <td>${r.label}</td>
        <td class="num">${r.occ}%</td>
        <td class="num">${LP.fmt(r.activeDays)} ${activeScn.capacityUnit}</td>
        <td class="num">${LP.fmt(r.visits)}회</td>
        <td class="num">${LP.fmt(r.settlers)}명</td>
        <td class="num">${LP.fmtMan(r.spendMan)}</td>
      </tr>
    `).join('');

    // Native Zero-CDN SVG Chart (Never fails!)
    const chartSvg = CH.renderSensitivityBarChart(el('simChartBox'), rows);

    // Goal-Seek
    const goalSeekRes = runGoalSeek(activeScn, occRate, costMode === 'budget' ? budgetMan : initTotalMan, custom);

    // P1-08: Feasibility Review Status
    const hasBudgetIssue = units === 0 || (costMode === 'budget' && budgetMan < activeScn.initCostMan);
    const feas = LP.evaluateFeasibilityStatus(checks, hasBudgetIssue);
    el('feasibilityStatusBox').innerHTML =
      `<span class="badge ${feas.cls}" style="font-size:13px;padding:4px 12px;">사전검토 상태: ${LP.escapeHtml(feas.label)}</span> ` +
      `<span style="margin-left:8px;font-size:13.5px;">${LP.escapeHtml(feas.action)}</span>`;

    // Save snapshot for report.html
    try {
      localStorage.setItem('localPivot_lastSim_v5', JSON.stringify({
        regionCode: code,
        regionName: region.full_name,
        sigunguName: region.sigungu_name,
        monthKey,
        scenarioKey: activeKey,
        scenarioName: activeScn.name,
        scenarioParams: activeScn,
        costMode,
        units,
        budgetRemainderMan: activeCalc.budgetRemainderMan,
        initCostMan: activeScn.initCostMan,
        opCostMan: activeScn.opCostMan,
        initTotalMan,
        opTotalMan,
        fiveYearTotalMan,
        budgetMan,
        occRate,
        perVisitSpendMan,
        rows,
        costNote: costNoteText,
        diagnosis: diag,
        goalSeek: goalSeekRes,
        feasibility: { checks, status: feas },
        customData: custom,
        chartSvg
      }));
    } catch {}
  }

  const debouncedRun = LP.debounce(runSimulation, 100);

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
    el('costMode').value = state.costMode || 'budget';
    el('inputUnits').value = state.units ?? 10;
    el('budget').value = state.budgetMan ?? 80000;
    el('occRate').value = state.occRate ?? 55;
    el('perVisitSpendMan').value = state.perVisitSpendMan ?? 5.0;
    el('capCandidateCheck').checked = Boolean(state.capToCandidate);

    const fc = state.feasibilityChecks || {};
    el('chkHousing').checked = Boolean(fc.housingSecured);
    el('chkConsent').checked = Boolean(fc.ownerConsent);
    el('chkSafety').checked = Boolean(fc.safetyCheck);
    el('chkLegal').checked = Boolean(fc.legalPermits);
    el('chkOperator').checked = Boolean(fc.operatorReady);
    el('chkOpBudget').checked = Boolean(fc.opBudgetReady);

    ['A', 'B', 'C'].forEach(k => {
      el(`initCost${k}`).value = state.scenarios[k].initCostMan;
      el(`opCost${k}`).value = state.scenarios[k].opCostMan;
      el(`altCardHead${k}`).addEventListener('click', () => selectActiveScenario(k));
    });

    ['simRegionSelect', 'simMonthSelect', 'costMode', 'capCandidateCheck', 'goalType',
     'chkHousing', 'chkConsent', 'chkSafety', 'chkLegal', 'chkOperator', 'chkOpBudget'].forEach(id => {
      el(id).addEventListener('change', runSimulation);
    });
    el('scenarioSelect').addEventListener('change', () => selectActiveScenario(el('scenarioSelect').value));

    ['inputUnits', 'budget', 'occRate', 'perVisitSpendMan', 'initCostA', 'opCostA', 'initCostB', 'opCostB', 'initCostC', 'opCostC', 'paramMonthlyVisits', 'paramResidentGain', 'paramSpendMult', 'goalTarget'].forEach(id => {
      el(id).addEventListener('input', debouncedRun);
    });

    document.querySelectorAll('.quick-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        el('costMode').value = mode;
        if (mode === 'units') el('inputUnits').value = btn.dataset.val;
        else el('budget').value = btn.dataset.val;
        runSimulation();
      });
    });

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

    // Multi-row CSV row switcher
    el('csvRowSelect').addEventListener('change', (e) => {
      const custom = LP.getCustomData();
      if (!custom || !custom.allRows) return;
      const idx = Number(e.target.value);
      const chosen = custom.allRows[idx];
      if (!chosen) return;
      const updated = { ...chosen, allRows: custom.allRows, selectedIndex: idx };
      LP.setCustomData(updated);
      syncCustomBanner();
      applyCustomToInputs(updated);
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
      syncCustomBanner();
      runSimulation();
    });

    syncCustomBanner();
    selectActiveScenario(state.scenarioKey || 'A');
  } catch (err) {
    const errBox = el('simErrorBox');
    if (errBox) {
      errBox.style.display = 'block';
      errBox.textContent = `초기화 오류: ${err.message} (브라우저 강력 새로고침 Ctrl+Shift+R 또는 data/ 폴더 업로드 여부를 확인하세요)`;
    }
    console.error(err);
  }
})();
