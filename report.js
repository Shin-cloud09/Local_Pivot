/**
 * report.html [4. 보고서 출력] 전용 스크립트 (P1-07, P1-08 반영)
 * - 결재란 포함 A4 1페이지 인쇄/PDF + 한글(HWP) 친화 표 복사 + CSV 저장
 */
(async () => {
  const LP = window.LocalPivot;
  const CH = window.LocalPivotCharts;
  LP.initOnboardingGuide(false);

  let regions = {};
  let sim = null;

  function loadSimSnapshot() {
    try {
      const raw = localStorage.getItem('localPivot_lastSim_v5');
      if (raw) return JSON.parse(raw);
    } catch {}
    const st = LP.getState();
    const r = regions[st.regionCode] || regions['43800'];
    if (!r) return null;
    const scn = st.scenarios[st.scenarioKey || 'A'];
    const units = st.costMode === 'budget' && scn.initCostMan > 0
      ? Math.floor(st.budgetMan / scn.initCostMan)
      : st.units;
    const budgetRemainderMan = st.costMode === 'budget' ? Math.max(0, st.budgetMan - units * scn.initCostMan) : 0;
    const rows = LP.estimateRows(scn, units, st.occRate, st.perVisitSpendMan);
    const initTotalMan = units * scn.initCostMan;
    const opTotalMan = units * scn.opCostMan;
    const fiveYearTotalMan = initTotalMan + opTotalMan * 5;
    const diag = LP.diagnoseRegion(r, regions);
    const feasStatus = LP.evaluateFeasibilityStatus(st.feasibilityChecks, units === 0);
    return {
      regionCode: r.adm_cd,
      regionName: r.full_name,
      sigunguName: r.sigungu_name,
      monthKey: st.monthKey,
      scenarioKey: scn.key,
      scenarioName: scn.name,
      scenarioParams: scn,
      costMode: st.costMode,
      units,
      budgetRemainderMan,
      initCostMan: scn.initCostMan,
      opCostMan: scn.opCostMan,
      initTotalMan,
      opTotalMan,
      fiveYearTotalMan,
      budgetMan: st.budgetMan,
      occRate: st.occRate,
      perVisitSpendMan: st.perVisitSpendMan,
      rows,
      costNote: `[${scn.name}] 전환 ${LP.fmt(units)}호 · 초기 전환비 ${LP.fmtMan(initTotalMan)} + 연 운영비 ${LP.fmtMan(opTotalMan)} → 5년 누적 재정부담 ${LP.fmtMan(fiveYearTotalMan)}`,
      diagnosis: diag,
      goalSeek: null,
      feasibility: { checks: st.feasibilityChecks, status: feasStatus },
      customData: LP.getCustomData(),
      chartSvg: null
    };
  }

  function getChartSvg() {
    if (sim.chartSvg) return sim.chartSvg;
    const tmp = document.createElement('div');
    return CH.renderSensitivityBarChart(tmp, sim.rows);
  }

  function renderBriefing() {
    const region = regions[sim.regionCode];
    const lp = region.living_pop[sim.monthKey] || region.living_pop.avg;
    const scn = sim.scenarioParams;
    const period = LP.periodLabel(sim.monthKey);
    const dataSourceMode = sim.customData
      ? `[실측] 자체 데이터 반영 (${LP.escapeHtml(sim.customData.regionName)})`
      : '[공식·가정] 공개자료 및 예시 가정값 기준';
    const feas = sim.feasibility?.status || LP.evaluateFeasibilityStatus({}, false);

    document.getElementById('briefHeaderMeta').innerHTML =
      `대상지: <strong>${LP.escapeHtml(sim.regionName)}</strong> &nbsp;|&nbsp; 대안: <strong>${LP.escapeHtml(sim.scenarioName)}</strong> &nbsp;|&nbsp; ` +
      `<span class="badge ${sim.customData ? 'badge-earth' : 'badge-accent'}">${dataSourceMode}</span> &nbsp;` +
      `<span class="badge ${feas.cls}">사전검토 상태: ${LP.escapeHtml(feas.label)}</span>`;

    const diagText = sim.diagnosis
      ? ` 89개 지자체 상대 진단 유형은 '${sim.diagnosis.typeLabel}'이며, 우선 검토 후보는 '${sim.diagnosis.recommendedText}'입니다.`
      : '';

    document.getElementById('sec01Text').textContent =
      `[공식] ${region.full_name}의 소멸위험지수는 ${LP.fmtDec(region.extinction_index, 4)}(${region.extinction_class}, 2024.03), 통계청 미거주주택은 ${LP.fmt(region.unoccupied_housing)}호(${LP.fmtDec(region.unoccupied_rate, 2)}%, 2025)입니다. ${period} 기준 체류인구는 ${LP.fmt(lp.stay_pop)}명(공식 체류배수 ${LP.fmtDec(lp.stay_ratio, 2)}배), 월간 1인당 카드소비액은 ${LP.fmtWonAsMan(lp.spend_per_person, 2)}입니다.${diagText}`;

    document.getElementById('sec02Text').textContent =
      `[산출·가정] 검토 대안은 '${sim.scenarioName}'이며 ${sim.costMode === 'budget' ? `동일 예산(${LP.fmtMan(sim.budgetMan)}) 기준` : '전환 호수 기준'} ${LP.fmt(sim.units)}호 전환을 가정했습니다. 초기 전환비 ${LP.fmtMan(sim.initTotalMan)}(호당 ${LP.fmtMan(sim.initCostMan)}) + 연간 운영비 ${LP.fmtMan(sim.opTotalMan)} → 5년 단순 누적 재정부담 ${LP.fmtMan(sim.fiveYearTotalMan)}(물가·할인율 미반영).`;

    document.getElementById('briefCapHeader').textContent = scn.capacityLabel;
    document.getElementById('briefSensBody').innerHTML = sim.rows.map((r, i) => `
      <tr class="${i === 1 ? 'row-highlight' : ''}">
        <td>${r.label}</td>
        <td class="num">${r.occ}%</td>
        <td class="num">${LP.fmt(r.activeDays)} ${scn.capacityUnit}</td>
        <td class="num">${LP.fmt(r.visits)}회</td>
        <td class="num">${LP.fmt(r.settlers)}명</td>
        <td class="num">${LP.fmtMan(r.spendMan)}</td>
      </tr>
    `).join('');

    document.getElementById('sec04Text').textContent =
      `[가정] 호당 월 방문 ${scn.monthlyVisitorsPerUnit}회, 호당 정착 ${scn.residentGainPerUnit}명, 1회 방문당 추정 소비액 ${LP.fmtMan(sim.perVisitSpendMan, 1)}, 소비 승수 ${scn.spendMultiplier}배(전국 공통 가정). 방문 횟수(회)는 중복 포함 연인원이며, 방문 관련 소비 추정액은 순증 소비·투자수익률(ROI)이 아닙니다. 사전검토 상태('${feas.label}')는 자체 점검 결과이며 공식 인허가·승인이 아닙니다.`;

    document.getElementById('kpiTargetItem').textContent =
      `성과관리 지표: ${scn.kpiText}를 사업 전 기준선과 함께 정기 집계`;
  }

  function exportCSV() {
    const scn = sim.scenarioParams;
    const headers = ['대상지', '사업유형', '데이터기준', '시나리오', '가동률(%)', '전환호수', scn.capacityLabel, '연간방문(회)', '신규정착(명)', '방문관련소비추정(만 원)', '5년누적재정부담(만 원)'];
    const mode = sim.customData ? '자체데이터[실측]' : '공개공고[가정]';
    const lines = [headers.join(',')].concat(
      sim.rows.map(r => [
        `"${sim.regionName}"`,
        `"${sim.scenarioName}"`,
        mode,
        r.label,
        r.occ,
        sim.units,
        r.activeDays,
        r.visits,
        r.settlers,
        r.spendMan,
        sim.fiveYearTotalMan
      ].join(','))
    );
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LocalPivot_${sim.sigunguName}_사전검토.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function buildHwpTabText() {
    const scn = sim.scenarioParams;
    const feas = sim.feasibility?.status?.label || '추가 실사 필요';
    const lines = [
      `[Local Pivot 빈집 재생 사전검토 요약표]`,
      `대상지\t${sim.regionName}\t검토 대안\t${sim.scenarioName}`,
      `전환 호수\t${LP.fmt(sim.units)}호\t사전검토 상태\t${feas}`,
      `초기 전환비\t${LP.fmtMan(sim.initTotalMan)}\t연간 운영비\t${LP.fmtMan(sim.opTotalMan)}`,
      `5년 누적 재정부담\t${LP.fmtMan(sim.fiveYearTotalMan)}\t기준 가동률\t${sim.occRate}%`,
      ``,
      `구분\t가동률\t${scn.capacityLabel}\t연간 방문(회)\t신규 정착(명)\t방문 관련 소비 추정(만 원)`,
      ...sim.rows.map(r => `${r.label}\t${r.occ}%\t${LP.fmt(r.activeDays)} ${scn.capacityUnit}\t${LP.fmt(r.visits)}회\t${LP.fmt(r.settlers)}명\t${LP.fmtMan(r.spendMan)}`),
      ``,
      `※ 본 수치는 [가정] 기반 사전검토 추정치이며 순증 소비·투자수익률(ROI)을 보장하지 않습니다.`
    ];
    return lines.join('\n');
  }

  function buildA4ReportHTML() {
    const region = regions[sim.regionCode];
    const lp = region.living_pop[sim.monthKey] || region.living_pop.avg;
    const scn = sim.scenarioParams;
    const feas = sim.feasibility?.status || LP.evaluateFeasibilityStatus({}, false);
    const nowStr = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const dataSourceLine = sim.customData
      ? `[실측] 자체 업로드 반영 (${LP.escapeHtml(sim.customData.regionName)}, 후보 ${LP.fmt(sim.customData.candidateUnits)}동, 가동률 ${sim.customData.occRate}%)`
      : '[공식·가정] 공개자료·공고 참고치 및 전국 공통 예시 가정값 기준';

    const tableRows = sim.rows.map((r, i) => `
      <tr style="${i === 1 ? 'background:#eef2e5;font-weight:bold;' : ''}">
        <td>${r.label}</td><td>${r.occ}%</td><td>${LP.fmt(r.activeDays)} ${LP.escapeHtml(scn.capacityUnit)}</td><td>${LP.fmt(r.visits)}회</td><td>${LP.fmt(r.settlers)}명</td><td>${LP.fmtMan(r.spendMan)}</td>
      </tr>
    `).join('');

    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>빈집 재생 시범사업 사전검토 보고서</title>
    <style>
      @page{size:A4;margin:12mm} *{box-sizing:border-box}
      body{font:9.2pt/1.46 'Malgun Gothic',system-ui,sans-serif;color:#252c1b;background:#faf8f2;margin:0}
      main{max-width:210mm;background:#fff;margin:10px auto;padding:11mm;border:1px solid #ddd8c8}
      .top-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px}
      .approval{border-collapse:collapse;font-size:8.2pt;width:auto}
      .approval th,.approval td{border:1px solid #8f967f;padding:2px 9px;text-align:center}
      .approval td{height:32px;width:50px}
      h1{font-size:16.5pt;margin:.1em 0 .25em;color:#252c1b}
      h2{font-size:10.5pt;color:#556b2f;border-bottom:1.5px solid #556b2f;padding-bottom:2px;margin:.75em 0 .35em;break-after:avoid}
      .tag{color:#556b2f;font-weight:800;font-size:8.5pt;letter-spacing:.06em;margin:0}
      .meta{font-size:8.8pt;color:#5c634d;border-bottom:1px solid #ddd8c8;padding:3px 0;margin:0 0 4px}
      ul{padding-left:1.25em;margin:.2em 0 .4em} li{margin:.12em 0}
      table.data{width:100%;border-collapse:collapse;margin:5px 0;font-size:8.8pt}
      table.data th,table.data td{border:1px solid #ddd8c8;padding:4px 6px;text-align:left} table.data th{background:#f3f0e6}
      .svg-wrap{max-width:440px;margin:6px auto;border:1px solid #ddd8c8;border-radius:6px;padding:4px}
      .print-bar{text-align:center;margin:10px 0}
      .print-bar button{background:#556b2f;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{body{background:#fff} main{margin:0;padding:0;border:none;max-width:none} .print-bar{display:none}}
    </style></head><body>
    <div class="print-bar"><button onclick="window.print()">A4 인쇄 / PDF 저장</button></div>
    <main>
      <div class="top-header">
        <div>
          <p class="tag">LOCAL PIVOT / 지자체 내부 사전검토 보고서 (단위: 만 원 · 회 · 명)</p>
          <h1>빈집 재생 시범사업 사전검토 보고서</h1>
        </div>
        <table class="approval">
          <tr><th rowspan="2" style="width:20px;background:#f3f0e6;">결<br>재</th><th style="background:#f3f0e6;">담당</th><th style="background:#f3f0e6;">팀장</th><th style="background:#f3f0e6;">과장</th></tr>
          <tr><td></td><td></td><td></td></tr>
        </table>
      </div>
      <p class="meta">대상지: ${LP.escapeHtml(sim.regionName)} | 대안: ${LP.escapeHtml(sim.scenarioName)} | 사전검토 상태: <strong>${LP.escapeHtml(feas.label)}</strong> | 작성시각: ${nowStr}</p>
      <p class="meta">데이터 기준: ${dataSourceLine}</p>

      <h2>1. 대상지 현황 및 데이터 진단 [공식]</h2>
      <ul>
        <li>소멸위험지수: ${LP.fmtDec(region.extinction_index, 4)} (${LP.escapeHtml(region.extinction_class)}, 한국고용정보원 2024.03)</li>
        <li>미거주주택: ${LP.fmt(region.unoccupied_housing)}호 (${LP.fmtDec(region.unoccupied_rate, 2)}%, 통계청 2025) — 현장 빈집 실태조사 물량과 별도 구분</li>
        <li>체류인구·소비: ${LP.periodLabel(sim.monthKey)} 체류인구 ${LP.fmt(lp.stay_pop)}명(공식 체류배수 ${LP.fmtDec(lp.stay_ratio, 2)}배), 월간 카드소비 ${LP.fmtWonAsMan(lp.spend_per_person, 2)}</li>
      </ul>

      <h2>2. 사업 개요 및 5년 재정부담 검토 [산출·가정]</h2>
      <ul>
        <li>전환 규모: ${LP.fmt(sim.units)}호 (${sim.costMode === 'budget' ? `동일 예산 ${LP.fmtMan(sim.budgetMan)} 기준 · 잔액 ${LP.fmtMan(sim.budgetRemainderMan)}` : '전환 호수 직접 입력'})</li>
        <li>재정 추정: 초기 전환비 ${LP.fmtMan(sim.initTotalMan)}(호당 ${LP.fmtMan(sim.initCostMan)}) + 연 운영비 ${LP.fmtMan(sim.opTotalMan)} → <strong>5년 단순 누적 재정부담 ${LP.fmtMan(sim.fiveYearTotalMan)}</strong> (물가·할인율 미반영)</li>
      </ul>

      <h2>3. 가동률별 효과 범위 [가정·산출]</h2>
      <table class="data"><thead><tr><th>구분</th><th>가동률</th><th>${LP.escapeHtml(scn.capacityLabel)}</th><th>연간 방문(회)</th><th>신규 정착(명)</th><th>방문 관련 소비 추정</th></tr></thead><tbody>${tableRows}</tbody></table>
      <div class="svg-wrap">${getChartSvg()}</div>

      <h2>4. 적용 가정 및 해석 한계</h2>
      <ul>
        <li>[가정] 호당 월 방문 ${scn.monthlyVisitorsPerUnit}회, 호당 정착 ${scn.residentGainPerUnit}명, 1회 방문 소비 ${LP.fmtMan(sim.perVisitSpendMan, 1)}, 승수 ${scn.spendMultiplier}배 (전국 공통 가정).</li>
        <li>방문 횟수(회)는 중복 포함 연인원이며, 방문 관련 소비 추정액은 순증 소비·투자수익률(ROI)이 아님. 본 보고서는 내부 사전검토 초안임.</li>
      </ul>

      <h2>5. 착수 전 현장·행정 확인사항 (사전검토: ${LP.escapeHtml(feas.label)})</h2>
      <ul>
        <li>${LP.escapeHtml(feas.action)}</li>
        <li>[필수 확인] 빈집 등급(1~2등급)·소유자 동의(4~7년)·권리관계(미등기·근저당 제외)·문화재/취락지구 규제·운영주체·성과지표(${LP.escapeHtml(scn.kpiText)})</li>
      </ul>
    </main></body></html>`;
  }

  try {
    regions = await LP.fetchCachedJSON('data/regions_89_master.json');
    LP.renderNavStatus(regions);
    sim = loadSimSnapshot();
    if (!sim) return;

    renderBriefing();

    document.getElementById('copyHwpBtn').addEventListener('click', async () => {
      const st = document.getElementById('actionStatus');
      try {
        await navigator.clipboard.writeText(buildHwpTabText());
        st.textContent = '한글(HWP)·엑셀 붙여넣기용 요약 표를 클립보드에 복사했습니다.';
      } catch {
        st.textContent = '클립보드 복사가 제한되었습니다. CSV 저장 또는 HTML 저장을 이용하세요.';
      }
    });

    document.getElementById('copyBriefBtn').addEventListener('click', async () => {
      const box = document.getElementById('briefingContainer');
      const st = document.getElementById('actionStatus');
      try {
        await navigator.clipboard.writeText('Local Pivot 정책 의사결정 브리핑\n\n' + box.innerText);
        st.textContent = '브리핑 전체 본문을 클립보드에 복사했습니다.';
      } catch {
        st.textContent = '클립보드 복사가 제한되었습니다.';
      }
    });

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      exportCSV();
      document.getElementById('actionStatus').textContent = '사전검토 CSV(만 원 · 회 기준)를 저장했습니다.';
    });

    document.getElementById('printReportBtn').addEventListener('click', () => {
      const html = buildA4ReportHTML();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const tab = window.open(url, '_blank');
      document.getElementById('actionStatus').textContent = tab
        ? '새 탭에서 A4 1페이지 보고서를 열었습니다. 인쇄 / PDF 저장을 눌러주세요.'
        : '팝업이 차단되었습니다. HTML 저장 버튼을 이용하세요.';
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });

    document.getElementById('saveReportBtn').addEventListener('click', () => {
      const html = buildA4ReportHTML();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `LocalPivot_${sim.sigunguName}_사전검토보고서.html`;
      a.click();
      document.getElementById('actionStatus').textContent = 'A4 사전검토 보고서 HTML 파일을 저장했습니다.';
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
  } catch (err) {
    console.error(err);
  }
})();
