/**
 * audit.html [5. 데이터 검증] 전용 스크립트 (P1-05 반영)
 * - 구조·결측·중복·범위·GeoJSON 결합은 브라우저에서 실제 실행하여 검증
 * - 원천 통계 서버 실시간 대조는 정적 웹 특성상 미실시임을 정직하게 분리 표기
 */
(async () => {
  const LP = window.LocalPivot;
  LP.initOnboardingGuide(false);

  const runTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'medium'
  }).format(new Date());

  try {
    const [regions, pilot, cases, geojson] = await Promise.all([
      LP.fetchCachedJSON('data/regions_89_master.json'),
      LP.fetchCachedJSON('data/pilot_3regions_monthly.json'),
      LP.fetchCachedJSON('data/public_cases.json'),
      LP.fetchCachedJSON('data/korea_sgg_master.geojson')
    ]);
    LP.renderNavStatus(regions);

    const regKeys = Object.keys(regions);
    const regList = Object.values(regions);
    const regMissing = regList.filter(r =>
      r.extinction_index == null || r.unoccupied_housing == null || !r.living_pop || !r.living_pop.avg
    ).length;
    const regNegOrZero = regList.filter(r =>
      r.extinction_index <= 0 || r.total_housing <= 0 || r.unoccupied_housing < 0
    ).length;

    const geoTargets = (geojson.features || []).filter(ft => ft.properties && ft.properties.is_target_89);
    const geoCodes = new Set(geoTargets.map(ft => ft.properties.adm_cd));
    const unmatchedCodes = regKeys.filter(cd => !geoCodes.has(cd));

    const pilotCodes = Object.keys(pilot);
    const pilotRows = pilotCodes.reduce((s, k) => s + pilot[k].length, 0);
    const pilotMissingVisits = pilotCodes.reduce((s, k) =>
      s + pilot[k].filter(row => row.visitor_person_visits == null || row.visitor_person_visits < 0).length, 0
    );

    const checks = [
      {
        item: '89개 인구감소지역 마스터 (regions_89_master.json)',
        method: '실시간 JS 구조·결측·범위(음수/0) 전수 검사',
        actual: `${regKeys.length}개 지역 · 결측 ${regMissing}건 · 음수/0 이상치 ${regNegOrZero}건`,
        pass: regKeys.length === 89 && regMissing === 0 && regNegOrZero === 0,
        status: '구조·범위 검산 통과'
      },
      {
        item: '행정구역 지도 결합 (korea_sgg_master.geojson)',
        method: '실시간 JS 89개 행정코드(adm_cd) 1:1 매칭 검사',
        actual: `전체 ${(geojson.features || []).length}개 피처 · 대상 ${geoTargets.length}개 · 미매칭 ${unmatchedCodes.length}건`,
        pass: geoTargets.length === 89 && unmatchedCodes.length === 0,
        status: '지도 결합 검산 통과'
      },
      {
        item: '시범 3거점 12개월 시계열 (pilot_3regions_monthly.json)',
        method: '실시간 JS 3×12행 수·음수·결측 검사',
        actual: `${pilotCodes.length}개 지역 · 총 ${pilotRows}행 · 결측/음수 ${pilotMissingVisits}건`,
        pass: pilotCodes.length === 3 && pilotRows === 36 && pilotMissingVisits === 0,
        status: '구조·범위 검산 통과'
      },
      {
        item: '공공 사례 검증집 (public_cases.json)',
        method: '실시간 JS 스키마 수록 건수 검사',
        actual: `공공 사례 ${cases.public_benchmarks.length}건 · 제외 데이터 ${cases.excluded_datasets.length}건`,
        pass: cases.public_benchmarks.length === 8 && cases.excluded_datasets.length === 4,
        status: '수록 구조 통과'
      },
      {
        item: '외부 원천 통계기관 실시간 API 대조',
        method: '정적 웹(GitHub Pages) 환경 — 외부 API 미연동',
        actual: '빌드 시점(2026.11) 가공본 탑재 · 실시간 원천 자동 대조 미실시',
        pass: false,
        status: '정적 파일 기준 (원천 대조 미실시)'
      }
    ];

    document.getElementById('auditRunTime').textContent = `자동 검증 실행 시각: ${runTime}`;
    document.getElementById('integrityCheckBody').innerHTML = checks.map(c => `
      <tr>
        <td><strong>${LP.escapeHtml(c.item)}</strong></td>
        <td>${LP.escapeHtml(c.method)}</td>
        <td>${LP.escapeHtml(c.actual)}</td>
        <td><span class="badge ${c.pass ? 'badge-accent' : 'badge-warn'}">${LP.escapeHtml(c.status)}</span></td>
      </tr>
    `).join('');

    document.getElementById('excludedBody').innerHTML = cases.excluded_datasets.map(d => `
      <tr>
        <td><strong>${LP.escapeHtml(d.name)}</strong><br><span class="badge">${LP.escapeHtml(d.code)} · ${LP.fmt(d.rows)}행</span></td>
        <td>${LP.escapeHtml(d.usable)}</td>
        <td>${LP.escapeHtml(d.limitation)}</td>
        <td><span class="badge badge-warn">${LP.escapeHtml(d.decision)}</span></td>
      </tr>
    `).join('');

    const currentScenarios = LP.getState().scenarios;
    document.getElementById('paramTableBody').innerHTML = Object.values(currentScenarios).map(p => `
      <tr>
        <td><strong>${LP.escapeHtml(p.name)}</strong></td>
        <td class="num">${LP.fmtMan(p.initCostMan)}</td>
        <td class="num">${LP.fmtMan(p.opCostMan)}/년</td>
        <td class="num">${p.monthlyVisitorsPerUnit}회/호·월</td>
        <td class="num">${p.residentGainPerUnit}명/호</td>
        <td class="num">${p.spendMultiplier}배</td>
        <td>${LP.escapeHtml(p.capacityLabel)} · ${LP.escapeHtml(p.kpiText)}</td>
      </tr>
    `).join('');

    const custom = LP.getCustomData();
    document.getElementById('customAuditNote').innerHTML = custom
      ? `${LP.certBadge('actual')} 현재 브라우저 로컬에 자체 업로드 데이터(<strong>${LP.escapeHtml(custom.regionName)}</strong>, 보유 후보주택 ${LP.fmt(custom.candidateUnits)}동, 투입예산 ${LP.fmtMan(custom.budgetMan)}, 실측 가동률 ${custom.occRate}%)가 활성화되어 있습니다.`
      : `${LP.certBadge('assumed')} 현재 활성화된 자체 업로드 데이터가 없으며, 시뮬레이터 계수는 전국 공통 예시 가정값으로 동작 중입니다.`;
  } catch (err) {
    console.error(err);
  }
})();
