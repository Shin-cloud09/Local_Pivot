/**
 * report.html [4. 보고서 출력] 전용 스크립트
 * - 5단계 정책 브리핑 + 현장 사전점검 체크리스트 + CSV 저장 + 결재란 포함 A4 보고서 출력
 * - 모든 금액 단위: 만 원 / 방문 단위: 회
 */
(async () => {
  const LP = window.LocalPivot;
  let regions = {};
  let sim = null;

  function loadSimSnapshot() {
    try {
      const raw = localStorage.getItem('localPivot_lastSim_v4');
      if (raw) return JSON.parse(raw);
    } catch {}
    const st = LP.getState();
    const r = regions[st.regionCode] || regions['43800'];
    if (!r) return null;
    const scn = st.scenarios[st.scenarioKey || 'A'];
    const units = st.costMode === 'budget' && scn.initCostMan > 0
      ? Math.floor(st.budgetMan / scn.initCostMan)
      : st.units;
    const rows = LP.estimateRows(scn, units, st.occRate, st.perVisitSpendMan);
    const initTotalMan = units * scn.initCostMan;
    const opTotalMan = units * scn.opCostMan;
    const threeYearTotalMan = initTotalMan + opTotalMan * 3;
    const diag = LP.diagnoseRegion(r, regions);
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
      initCostMan: scn.initCostMan,
      opCostMan: scn.opCostMan,
      initTotalMan,
      opTotalMan,
      threeYearTotalMan,
      budgetMan: st.budgetMan,
      occRate: st.occRate,
      perVisitSpendMan: st.perVisitSpendMan,
      rows,
      costNote: `[${scn.name}] 전환 규모 ${LP.fmt(units)}호 · 초기 전환비 ${LP.fmtMan(initTotalMan)} + 연 운영비 ${LP.fmtMan(opTotalMan)} (3년 누적 ${LP.fmtMan(threeYearTotalMan)})`,
      diagnosis: diag,
      goalSeek: null,
      customData: LP.getCustomData(),
      chartImg: null
    };
  }

  function buildFallbackSvgChart(rows) {
    const maxV = Math.max(1, ...rows.map(r => r.visits));
    const maxS = Math.max(1, ...rows.map(r => r.spendMan));
    const bars = rows.map((r, i) => {
      const x = 60 + i * 150;
      const hV = Math.round((r.visits / maxV) * 105);
      const hS = Math.round((r.spendMan / maxS) * 105);
      return `
        <rect x="${x}" y="${138 - hV}" width="36" height="${hV}" fill="#1f5c45" rx="3" />
        <text x="${x + 18}" y="${133 - hV}" font-size="9" text-anchor="middle" fill="#162922">${LP.fmt(r.visits)}회</text>
        <rect x="${x + 42}" y="${138 - hS}" width="36" height="${hS}" fill="#8a6a44" rx="3" />
        <text x="${x + 60}" y="${133 - hS}" font-size="8.5" text-anchor="middle" fill="#162922">${LP.fmt(r.spendMan)}만</text>
        <text x="${x + 39}" y="155" font-size="10" text-anchor="middle" fill="#162922">${r.label} (${r.occ}%)</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 520 174" style="width:100%;max-width:480px;border:1px solid #d4dfd7;border-radius:6px;background:#fafcfa;">
      <line x1="40" y1="138" x2="490" y2="138" stroke="#94a3b8" stroke-width="1" />
      ${bars}
      <text x="260" y="169" font-size="9" text-anchor="middle" fill="#4b6359">녹색: 연간 예상 방문(회) | 갈색: 연간 추가 소비 추정(만 원)</text>
    </svg>`;
  }

  function renderBriefing() {
    const region = regions[sim.regionCode];
    const lp = region.living_pop[sim.monthKey] || region.living_pop.avg;
    const scn = sim.scenarioParams;
    const period = LP.periodLabel(sim.monthKey);
    const dataSourceMode = sim.customData
      ? `자체 내부 데이터 반영 (${LP.escapeHtml(sim.customData.regionName)}, ${LP.escapeHtml(sim.customData.uploadedAt)})`
      : '공개자료 및 사용자 조정 가능 예시 가정값 기준';

    document.getElementById('briefHeaderMeta').innerHTML =
      `대상지: <strong>${LP.escapeHtml(sim.regionName)}</strong> &nbsp;|&nbsp; 선택 대안: <strong>${LP.escapeHtml(sim.scenarioName)}</strong> &nbsp;|&nbsp; 데이터 기준: <span class="badge ${sim.customData ? 'badge-wood' : 'badge-accent'}">${dataSourceMode}</span>`;

    const diagText = sim.diagnosis
      ? ` 89개 인구감소지역 상대 진단 유형은 '${sim.diagnosis.typeLabel}'이며, 1차 우선 검토 대안은 '${sim.diagnosis.recommendedText}'입니다.`
      : '';

    document.getElementById('sec01Text').textContent =
      `${region.full_name}의 소멸위험지수는 ${LP.fmtDec(region.extinction_index, 4)}(${region.extinction_class}, 2024.03 기준), 통계청 미거주주택은 ${LP.fmt(region.unoccupied_housing)}호(${LP.fmtDec(region.unoccupied_rate, 2)}%, 2025 기준)입니다. ${period} 기준 체류인구는 ${LP.fmt(lp.stay_pop)}명(등록인구 대비 ${LP.fmtDec(lp.stay_ratio, 2)}배), 월간 1인당 카드소비액은 ${LP.fmtWonAsMan(lp.spend_per_person, 2)}입니다.${diagText} 단, 통계청 미거주주택은 현장 빈집 실태조사 및 실제 사업 가능 물량과 구분합니다.`;

    document.getElementById('sec02Text').textContent =
      `검토 대안은 '${sim.scenarioName}'이며, ${sim.costMode === 'budget' ? '투입 예산 기준' : '전환 호수 기준'}으로 ${LP.fmt(sim.units)}호 전환을 가정했습니다. ${sim.costNote}. 실제 공종별 계약·정산 범위(집기·임차·매입 포함 여부)와 지방비·자부담 분담 비율은 실시설계 및 예산 협의 후 확정해야 합니다.`;

    document.getElementById('briefSensBody').innerHTML = sim.rows.map((r, i) => `
      <tr class="${i === 1 ? 'row-highlight' : ''}">
        <td>${r.label}</td>
        <td class="num">${r.occ}%</td>
        <td class="num">${LP.fmt(r.activeRoomDays)}일</td>
        <td class="num">${LP.fmt(r.visits)}회</td>
        <td class="num">${LP.fmt(r.settlers)}명</td>
        <td class="num">${LP.fmtMan(r.spendMan)}</td>
      </tr>
    `).join('');

    document.getElementById('sec04Text').textContent =
      `적용 가정 계수(사용자 수정 가능): 호당 월 방문 ${scn.monthlyVisitorsPerUnit}회, 호당 정착 계수 ${scn.residentGainPerUnit}명, 1회 방문당 추정 소비액 ${LP.fmtMan(sim.perVisitSpendMan, 1)}, 소비 승수 ${scn.spendMultiplier}배. 기준 가동률(${sim.occRate}%)은 1년 365일 중 실제 운영되는 일수 비율(연 약 ${Math.round(365 * sim.occRate / 100)}일)을 의미합니다. 연간 방문 횟수(회)는 중복 방문을 포함한 연인원 기준이며, 신규 정착 인원(명)과 단위가 달라 합산하지 않습니다.`;

    document.getElementById('kpiTargetItem').textContent =
      `성과관리 지표: ${scn.kpiText}를 사업 착수 전 기준선과 함께 정기 집계`;
  }

  function exportCSV() {
    const headers = ['대상지', '사업유형', '데이터기준', '시나리오', '가동률(%)', '전환호수', '연간가동객실일수', '연간방문(회)', '신규정착(명)', '추가소비(만 원)'];
    const mode = sim.customData ? '자체데이터반영' : '공개공고_가정';
    const lines = [headers.join(',')].concat(
      sim.rows.map(r => [
        `"${sim.regionName}"`,
        `"${sim.scenarioName}"`,
        mode,
        r.label,
        r.occ,
        sim.units,
        r.activeRoomDays,
        r.visits,
        r.settlers,
        r.spendMan
      ].join(','))
    );
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LocalPivot_${sim.sigunguName}_효과범위분석.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function buildA4ReportHTML() {
    const region = regions[sim.regionCode];
    const lp = region.living_pop[sim.monthKey] || region.living_pop.avg;
    const scn = sim.scenarioParams;
    const today = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'long' }).format(new Date());
    const dataSourceLine = sim.customData
      ? `담당자 로컬 업로드 내부 데이터 반영 (${LP.escapeHtml(sim.customData.regionName)}, 보유 후보주택 ${LP.fmt(sim.customData.candidateUnits)}동, 호당 전환비 ${LP.fmtMan(sim.customData.unitCostMan)}, 실측 가동률 ${sim.customData.occRate}%)`
      : '공개자료·지자체 공고 참고치 및 사용자 조정 가능 예시 가정값 기준';

    const chartBlock = sim.chartImg
      ? `<div style="margin:10px 0;text-align:center;"><img src="${sim.chartImg}" alt="가동률 효과 범위 차트" style="max-width:100%;max-height:200px;border:1px solid #d4dfd7;padding:6px;border-radius:6px;"></div>`
      : `<div style="margin:10px 0;text-align:center;">${buildFallbackSvgChart(sim.rows)}</div>`;

    const tableRows = sim.rows.map((r, i) => `
      <tr style="${i === 1 ? 'background:#eaf4ee;font-weight:bold;' : ''}">
        <td>${r.label}</td><td>${r.occ}%</td><td>${LP.fmt(r.activeRoomDays)}일</td><td>${LP.fmt(r.visits)}회</td><td>${LP.fmt(r.settlers)}명</td><td>${LP.fmtMan(r.spendMan)}</td>
      </tr>
    `).join('');

    const goalSeekLine = sim.goalSeek
      ? `<li>목표 달성 역산 참고: 목표(${LP.fmt(sim.goalSeek.goalTarget)}${sim.goalSeek.goalType === 'visits' ? '회' : '명'}) 달성 시 현재 가동률(${sim.occRate}%) 기준 최소 ${Number.isFinite(sim.goalSeek.reqUnitsAtOcc) ? LP.fmt(sim.goalSeek.reqUnitsAtOcc) + '호' : '산출 불가'} 필요</li>`
      : '';

    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>빈집 재생 시범사업 사전검토 보고서</title>
    <style>
      @page{size:A4;margin:14mm} *{box-sizing:border-box}
      body{font:9.8pt/1.52 'Malgun Gothic',system-ui,sans-serif;color:#162922;background:#f4f7f4;margin:0}
      main{max-width:210mm;background:#fff;margin:14px auto;padding:13mm;border:1px solid #d4dfd7}
      .top-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
      .approval{border-collapse:collapse;font-size:8.5pt;width:auto}
      .approval th,.approval td{border:1px solid #94a3b8;padding:3px 10px;text-align:center}
      .approval td{height:36px;width:54px}
      h1{font-size:18pt;margin:.15em 0 .3em;color:#162922}
      h2{font-size:11pt;color:#1f5c45;border-bottom:1.5px solid #1f5c45;padding-bottom:3px;margin:.95em 0 .4em;break-after:avoid}
      .tag{color:#1f5c45;font-weight:800;font-size:8.8pt;letter-spacing:.08em;margin:0}
      .meta{font-size:9.2pt;color:#4b6359;border-bottom:1px solid #d4dfd7;padding:4px 0;margin:0 0 6px}
      ul{padding-left:1.3em;margin:.25em 0 .5em} li{margin:.15em 0}
      table.data{width:100%;border-collapse:collapse;margin:6px 0;font-size:9pt}
      table.data th,table.data td{border:1px solid #d4dfd7;padding:5px 6px;text-align:left} table.data th{background:#eef4ef}
      .print-bar{text-align:center;margin:12px 0}
      .print-bar button{background:#1f5c45;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{body{background:#fff} main{margin:0;padding:0;border:none;max-width:none} .print-bar{display:none}}
    </style></head><body>
    <div class="print-bar"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
    <main>
      <div class="top-header">
        <div>
          <p class="tag">LOCAL PIVOT / 지자체 내부 사전검토 보고서 (금액 단위: 만 원)</p>
          <h1>빈집 재생 시범사업 사전검토 보고서</h1>
        </div>
        <table class="approval">
          <tr><th rowspan="2" style="width:22px;background:#eef4ef;">결<br>재</th><th style="background:#eef4ef;">담당</th><th style="background:#eef4ef;">팀장</th><th style="background:#eef4ef;">과장</th></tr>
          <tr><td></td><td></td><td></td></tr>
        </table>
      </div>
      <p class="meta">대상지: ${LP.escapeHtml(sim.regionName)} &nbsp;|&nbsp; 검토 대안: ${LP.escapeHtml(sim.scenarioName)} &nbsp;|&nbsp; 작성일: ${today}</p>
      <p class="meta">데이터 기준: ${dataSourceLine}</p>

      <h2>1. 대상지 현황 및 데이터 진단</h2>
      <ul>
        <li>소멸위험지수: ${LP.fmtDec(region.extinction_index, 4)} (${LP.escapeHtml(region.extinction_class)}, 2024.03 기준)</li>
        <li>통계청 미거주주택: ${LP.fmt(region.unoccupied_housing)}호 (${LP.fmtDec(region.unoccupied_rate, 2)}%, 2025 기준) — 현장 빈집 실태조사 및 사업 가능 물량과 별도 구분</li>
        <li>체류인구 및 카드소비: ${LP.periodLabel(sim.monthKey)} 기준 체류인구 ${LP.fmt(lp.stay_pop)}명(등록인구 대비 ${LP.fmtDec(lp.stay_ratio, 2)}배), 월간 1인당 카드소비액 ${LP.fmtWonAsMan(lp.spend_per_person, 2)}</li>
        ${sim.diagnosis ? `<li>89개 지자체 상대 진단: [${LP.escapeHtml(sim.diagnosis.typeLabel)}] → 1차 우선 검토 대안 '${LP.escapeHtml(sim.diagnosis.recommendedText)}'</li>` : ''}
      </ul>

      <h2>2. 사업 개요 및 소요예산 검토 (단위: 만 원)</h2>
      <ul>
        <li>검토 규모: ${LP.fmt(sim.units)}호 전환 가정 (${sim.costMode === 'budget' ? '투입 예산 기준' : '전환 호수 기준'})</li>
        <li>소요예산 추정: 초기 전환비 ${LP.fmtMan(sim.initTotalMan)} (호당 ${LP.fmtMan(sim.initCostMan)}) + 연 운영비 ${LP.fmtMan(sim.opTotalMan)} → <strong>3년 누적 총사업비 ${LP.fmtMan(sim.threeYearTotalMan)}</strong></li>
        <li>정책 비교군: 단순 철거 보조(의성 150만~250만 원, 고흥 최대 300만 원 — 유입 효과 없음) 및 공공임대 신축(군위 20세대 770,000만 원, 호당 약 38,500만 원) 대비 중간 대안</li>
        ${goalSeekLine}
      </ul>

      <h2>3. 가동률 변화에 따른 효과 범위 (보수 · 기준 · 낙관)</h2>
      <table class="data"><thead><tr><th>구분</th><th>가동률</th><th>연간 가동객실일수</th><th>연간 방문(회)</th><th>신규 정착(명)</th><th>추가 소비 추정</th></tr></thead><tbody>${tableRows}</tbody></table>
      ${chartBlock}

      <h2>4. 산정 가정 및 해석 유의사항</h2>
      <ul>
        <li>적용 가정 계수: 호당 월 방문 ${scn.monthlyVisitorsPerUnit}회, 호당 정착 ${scn.residentGainPerUnit}명, 1회 방문당 추정 소비액 ${LP.fmtMan(sim.perVisitSpendMan, 1)}, 소비 승수 ${scn.spendMultiplier}배</li>
        <li>기준 가동률(${sim.occRate}%)은 1년 365일 중 실제 운영 일수 비율(연 약 ${Math.round(365 * sim.occRate / 100)}일)을 의미함.</li>
        <li>방문 횟수(회)는 중복 방문을 포함한 연인원 기준이며, 신규 정착 인원(명)과 합산하지 않음. 본 문서는 내부 사전검토용 초안임.</li>
      </ul>

      <h2>5. 착수 전 현장·행정 사전확인 체크리스트</h2>
      <ul>
        <li>[공급·자격] 개보수 가능 판정(1~2등급) 및 소유자 활용 동의(4~7년 무상임대·임대차) 동시 충족 동수 확정 (가압류·근저당·미등기·소유자 불일치 제외)</li>
        <li>[법적·규제] 문화재 구역 현상변경 심의 대상 여부(군위군 지연 사례) 및 자연취락지구 임대업 제한 여부(함양군 전환 사례) 사전 확인</li>
        <li>[재정·정산] 공종별 견적·준공 정산 범위(집기·임차·매입 포함 여부), 초기비·운영비 분리 및 지방비·자부담 분담 확정</li>
        <li>[성과관리] ${LP.escapeHtml(scn.kpiText)}를 사업 전 기준선과 함께 정기 집계</li>
      </ul>
    </main></body></html>`;
  }

  try {
    regions = await LP.fetchCachedJSON('data/regions_89_master.json');
    LP.renderNavStatus(regions);
    sim = loadSimSnapshot();
    if (!sim) return;

    renderBriefing();

    document.getElementById('copyBriefBtn').addEventListener('click', async () => {
      const box = document.getElementById('briefingContainer');
      const st = document.getElementById('actionStatus');
      try {
        await navigator.clipboard.writeText('Local Pivot 정책 의사결정 브리핑\n\n' + box.innerText);
        st.textContent = '브리핑 본문을 클립보드에 복사했습니다.';
      } catch {
        st.textContent = '클립보드 복사가 제한되었습니다. 본문을 직접 선택해 복사하세요.';
      }
    });

    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      exportCSV();
      document.getElementById('actionStatus').textContent = '효과 범위 분석 CSV(만 원 · 회 기준)를 저장했습니다.';
    });

    document.getElementById('printReportBtn').addEventListener('click', () => {
      const html = buildA4ReportHTML();
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const tab = window.open(url, '_blank');
      document.getElementById('actionStatus').textContent = tab
        ? '새 탭에서 A4 보고서를 열었습니다. 인쇄 / PDF 저장을 눌러주세요.'
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
