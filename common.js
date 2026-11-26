/**
 * Local Pivot Common State, Diagnosis Engine, Certainty Tags & Onboarding Guide
 * - 금액 단위: 만 원 통일 / 방문 단위: 회 / 정착·인구 단위: 명
 * - 외부 CDN·API 의존성 없음
 */
window.LocalPivot = (() => {
  const STATE_KEY = 'localPivot_state_v5';
  const CUSTOM_KEY = 'localPivot_customData_v5';
  const GUIDE_KEY = 'localPivot_guideDismissed_v5';

  const DEFAULT_SCENARIOS = {
    A: {
      key: 'A',
      name: '체류형 워케이션',
      short: 'A. 워케이션',
      summary: '원격근무·단기체류 방문객 유치',
      capacityLabel: '연간 운영일수 (좌석·체류)',
      capacityUnit: '운영일',
      monthlyVisitorsPerUnit: 16,
      residentGainPerUnit: 0.0,
      spendMultiplier: 1.00,
      initCostMan: 8000,
      opCostMan: 1200,
      refText: '개별 빈집 공고 단가 미확정 · 거점 사례 100,000만~550,000만 원 참고',
      kpiText: '실이용 좌석·운영일, 가동률, 방문 횟수'
    },
    B: {
      key: 'B',
      name: '청년 로컬 창업',
      short: 'B. 청년 창업',
      summary: '주거·창업 복합 공간으로 상권 연계',
      capacityLabel: '연간 영업·운영일수',
      capacityUnit: '영업일',
      monthlyVisitorsPerUnit: 20,
      residentGainPerUnit: 0.4,
      spendMultiplier: 1.00,
      initCostMan: 9000,
      opCostMan: 1500,
      refText: '함양 추가 1동 18,000만 원+운영 10,000만 원 · 영월 신축 478,900만 원 참고',
      kpiText: '영업일, 방문·거래 건수, 입점 유지율'
    },
    C: {
      key: 'C',
      name: '귀농·귀촌 정착',
      short: 'C. 귀농·귀촌',
      summary: '장기 거주 지원으로 정주 인구 유입',
      capacityLabel: '연간 입주·거주일수',
      capacityUnit: '입주일',
      monthlyVisitorsPerUnit: 4,
      residentGainPerUnit: 1.8,
      spendMultiplier: 1.00,
      initCostMan: 6000,
      opCostMan: 300,
      refText: '단양 희망둥지(최대 6,000만 원) · 고흥 새뜰하우스(6,000만~8,000만 원) 공고 한도 참고',
      kpiText: '입주 가구, 입주 인원, 6개월·1년 정착 유지'
    }
  };

  // P1-09: 동일 예산 기준 비교(budget)를 기본값으로 설정
  const DEFAULT_STATE = {
    regionCode: '43800',
    monthKey: 'avg',
    scenarioKey: 'A',
    costMode: 'budget',
    units: 10,
    budgetMan: 80000,
    occRate: 55,
    perVisitSpendMan: 5.0,
    capToCandidate: true,
    feasibilityChecks: {
      housingSecured: false,
      ownerConsent: false,
      safetyCheck: false,
      legalPermits: false,
      operatorReady: false,
      opBudgetReady: false
    },
    scenarios: JSON.parse(JSON.stringify(DEFAULT_SCENARIOS))
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const fmt = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)))
    ? '—'
    : Math.round(Number(n)).toLocaleString('ko-KR');

  const fmtDec = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(Number(n)))
    ? '—'
    : Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

  const fmtMan = (man, decimals = 0) => {
    if (man === null || man === undefined || !Number.isFinite(Number(man))) return '—';
    const val = Number(man);
    if (decimals > 0) {
      return `${val.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}만 원`;
    }
    return `${Math.round(val).toLocaleString('ko-KR')}만 원`;
  };

  const fmtWonAsMan = (won, decimals = 1) => {
    if (won === null || won === undefined || !Number.isFinite(Number(won))) return '—';
    return fmtMan(Number(won) / 10000, decimals);
  };

  function certBadge(type) {
    const map = {
      official: ['공식', 'tag-official'],
      actual: ['실측', 'tag-actual'],
      assumed: ['가정', 'tag-assumed'],
      calc: ['산출', 'tag-calc'],
      unknown: ['미확인', 'tag-unknown']
    };
    const [label, cls] = map[type] || ['참고', 'tag-calc'];
    return `<span class="tag-cert ${cls}">[${label}]</span>`;
  }

  function getState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch {}
    const params = new URLSearchParams(window.location.search);
    const merged = {
      ...DEFAULT_STATE,
      ...saved,
      feasibilityChecks: { ...DEFAULT_STATE.feasibilityChecks, ...(saved.feasibilityChecks || {}) },
      scenarios: {
        A: { ...DEFAULT_SCENARIOS.A, ...(saved.scenarios?.A || {}) },
        B: { ...DEFAULT_SCENARIOS.B, ...(saved.scenarios?.B || {}) },
        C: { ...DEFAULT_SCENARIOS.C, ...(saved.scenarios?.C || {}) }
      }
    };
    if (params.get('region')) merged.regionCode = params.get('region');
    if (params.get('scenario') && ['A', 'B', 'C'].includes(params.get('scenario'))) {
      merged.scenarioKey = params.get('scenario');
    }
    return merged;
  }

  function setState(patch) {
    const cur = getState();
    const next = {
      ...cur,
      ...patch,
      feasibilityChecks: patch.feasibilityChecks
        ? { ...cur.feasibilityChecks, ...patch.feasibilityChecks }
        : cur.feasibilityChecks,
      scenarios: patch.scenarios
        ? {
            A: { ...cur.scenarios.A, ...(patch.scenarios.A || {}) },
            B: { ...cur.scenarios.B, ...(patch.scenarios.B || {}) },
            C: { ...cur.scenarios.C, ...(patch.scenarios.C || {}) }
          }
        : cur.scenarios
    };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); } catch {}
    return next;
  }

  function getCustomData() {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setCustomData(obj) {
    try {
      if (obj) localStorage.setItem(CUSTOM_KEY, JSON.stringify(obj));
      else localStorage.removeItem(CUSTOM_KEY);
    } catch {}
  }

  async function fetchCachedJSON(path) {
    const cacheKey = 'lp_cache_v5_' + path;
    try {
      const hit = sessionStorage.getItem(cacheKey);
      if (hit) return JSON.parse(hit);
    } catch {}
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} 로딩 실패 (HTTP ${res.status})`);
    const data = await res.json();
    try {
      if (!path.endsWith('.geojson')) sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
    return data;
  }

  function median(arr) {
    const s = [...arr].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!s.length) return 0;
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function rankDesc(arr, val) {
    return arr.filter(x => x > val).length + 1;
  }

  /**
   * P0-04 수정: 소멸위험지수 임계치(0.2 미만)를 명시 검사하고,
   * 앞선 조건과 고위험 임계치를 모두 충족하지 않는 지역은 '혼합·일반검토형'으로 분류
   */
  function diagnoseRegion(region, allRegions) {
    const list = Object.values(allRegions);
    const stayRatios = list.map(r => r.living_pop?.avg?.stay_ratio).filter(Number.isFinite);
    const stayHours = list.map(r => r.living_pop?.avg?.avg_stay_hours).filter(Number.isFinite);
    const unoccRates = list.map(r => r.unoccupied_rate).filter(Number.isFinite);
    const extIndices = list.map(r => r.extinction_index).filter(Number.isFinite);

    const medStayRatio = median(stayRatios);
    const medStayHours = median(stayHours);
    const medUnoccRate = median(unoccRates);

    const lp = region.living_pop?.avg;
    if (!lp || !Number.isFinite(region.extinction_index)) {
      return {
        typeLabel: '분류 보류(결측)',
        recommendedKey: 'A',
        recommendedText: '현장 기초자료 확인 후 검토',
        reason: '일부 핵심 지표가 누락되어 자동 분류를 보류했습니다.',
        ranks: { stayRatioRank: '—', stayHoursRank: '—', unoccRateRank: '—', extRiskRank: '—', total: list.length }
      };
    }

    const ranks = {
      stayRatioRank: rankDesc(stayRatios, lp.stay_ratio),
      stayHoursRank: rankDesc(stayHours, lp.avg_stay_hours),
      unoccRateRank: rankDesc(unoccRates, region.unoccupied_rate),
      extRiskRank: extIndices.filter(x => x < region.extinction_index).length + 1,
      total: list.length,
      medians: { medStayRatio, medStayHours, medUnoccRate }
    };

    if (lp.stay_ratio > medStayRatio && lp.avg_stay_hours <= medStayHours) {
      return {
        typeLabel: '유입-단기체류형',
        recommendedKey: 'A',
        recommendedText: 'A. 체류형 워케이션 (보조 후보: B. 청년 로컬 창업)',
        reason: `공식 체류인구 배수(${fmtDec(lp.stay_ratio, 2)}배, 89개 중 ${ranks.stayRatioRank}위)는 중앙값(${fmtDec(medStayRatio, 2)}배)을 상회하나 체류시간(${fmtDec(lp.avg_stay_hours, 1)}시간)이 짧아, 경유 방문객의 체류 연장 대안을 우선 검토 후보로 제안합니다.`,
        ranks
      };
    }

    if (lp.avg_stay_hours > medStayHours && region.unoccupied_rate > medUnoccRate) {
      return {
        typeLabel: '장기체류-빈집풍부형',
        recommendedKey: 'A',
        recommendedText: 'A. 체류형 워케이션 (보조 후보: C. 귀농·귀촌 정착)',
        reason: `평균 체류시간(${fmtDec(lp.avg_stay_hours, 1)}시간, ${ranks.stayHoursRank}위)과 미거주주택 비율(${fmtDec(region.unoccupied_rate, 2)}%, ${ranks.unoccRateRank}위)이 모두 중앙값을 상회해 중장기 체류·정주 전환 대안을 우선 검토 후보로 제안합니다.`,
        ranks
      };
    }

    if (region.extinction_index < 0.2) {
      return {
        typeLabel: '소멸고위험-정주방어형',
        recommendedKey: 'C',
        recommendedText: 'C. 귀농·귀촌 정착 (거점 연계 시 B. 청년 창업 보조)',
        reason: `공인 소멸고위험 기준(지수 0.2 미만)에 해당(${fmtDec(region.extinction_index, 4)}, 위험도 ${ranks.extRiskRank}위)하고 체류배수(${fmtDec(lp.stay_ratio, 2)}배)가 낮아 정주 인구 유입 중심 검토를 우선 후보로 제안합니다.`,
        ranks
      };
    }

    return {
      typeLabel: '혼합·일반검토형',
      recommendedKey: 'B',
      recommendedText: 'A·B·C 병행 비교 후 지역 여건에 맞춰 선택',
      reason: `소멸위험지수(${fmtDec(region.extinction_index, 4)})가 0.2 이상이며 단기유입·장기체류 어느 한쪽으로 극단 편중되지 않아, 3대 대안을 동일 예산 기준으로 병렬 비교하는 것이 적합합니다.`,
      ranks
    };
  }

  /**
   * 3단계 가동률 효과 범위 산출 (금액: 만 원, 방문: 회, 정착: 명)
   */
  function estimateRows(scn, units, occRate, perVisitSpendMan) {
    return ['보수적', '기준', '낙관적'].map((label, i) => {
      const occ = Math.max(0, Math.min(100, occRate + (i - 1) * 10));
      const activeDays = Math.round(units * 365 * (occ / 100));
      const visits = Math.round(units * scn.monthlyVisitorsPerUnit * 12 * (occ / 100));
      const settlers = Math.round(units * scn.residentGainPerUnit * (occ / 100));
      const spendMan = Math.round(visits * perVisitSpendMan * scn.spendMultiplier);
      const capacityWarn = visits > activeDays * 2;
      return { label, occ, activeDays, visits, settlers, spendMan, capacityWarn };
    });
  }

  /**
   * 07-D: 사전 추진가능성 자가점검 상태 판정 (법적 승인 아님)
   */
  function evaluateFeasibilityStatus(checks, hasBudgetIssue) {
    const c = checks || {};
    if (!c.housingSecured || !c.ownerConsent || !c.safetyCheck || !c.legalPermits) {
      return {
        label: '추가 실사 필요',
        cls: 'badge-warn',
        action: '후보 빈집 확보·소유자 동의·안전상태·인허가(문화재/취락지구) 현장 확인이 선행되어야 합니다.'
      };
    }
    if (hasBudgetIssue) {
      return {
        label: '예산 재검토 필요',
        cls: 'badge-danger',
        action: '초기비 또는 5년 누적 재정부담이 검토 재원 대비 과다하므로 규모·재원 분담 조정이 필요합니다.'
      };
    }
    if (!c.operatorReady || !c.opBudgetReady) {
      return {
        label: '운영계획 보완 필요',
        cls: 'badge-warn',
        action: '위탁·직영 운영주체 및 연간 유지관리비 재원 계획을 보완해야 합니다.'
      };
    }
    return {
      label: '시범사업 검토 가능',
      cls: 'badge-accent',
      action: '자체 사전점검 조건을 충족했습니다. 공식 타당성 검토 및 예산 심의 자료를 준비하세요.'
    };
  }

  function renderNavStatus(regions) {
    const state = getState();
    const custom = getCustomData();
    const regEl = document.getElementById('gnbRegionPill');
    const modeEl = document.getElementById('gnbModePill');
    if (regEl && regions && regions[state.regionCode]) {
      regEl.textContent = `선택 지자체: ${regions[state.regionCode].full_name}`;
    }
    if (modeEl) {
      if (custom) {
        modeEl.textContent = `자체 데이터 반영 (${custom.regionName})`;
        modeEl.classList.add('custom');
      } else {
        modeEl.textContent = '공개자료·가정 기준';
        modeEl.classList.remove('custom');
      }
    }
  }

  /**
   * 초기 진입 시 사용 가이드 모달 주입 및 제어
   */
  function initOnboardingGuide(autoOpenOnFirstVisit = false) {
    if (document.getElementById('lpGuideModal')) return;
    const modal = document.createElement('div');
    modal.id = 'lpGuideModal';
    modal.className = 'modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'lpGuideTitle');
    modal.innerHTML = `
      <div class="modal-box">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span class="badge badge-accent">처음 사용하는 담당자를 위한 1분 안내</span>
          <button type="button" id="lpGuideCloseTop" class="btn btn-sm" aria-label="닫기">닫기 ✕</button>
        </div>
        <h2 id="lpGuideTitle" style="margin-top:10px;">Local Pivot 빈집 재생 사전검토 사용 가이드</h2>
        <p style="margin:0 0 10px;font-size:13.8px;color:#5c634d;">
          이 도구는 빈집 리모델링 시범사업을 <strong>예산 심의 전 단계에서 빠르게 사전검토</strong>하기 위한 도구입니다. 모든 금액은 <strong>만 원</strong>, 방문은 <strong>회</strong>, 정착·인구는 <strong>명</strong>으로 통일되어 있습니다.
        </p>
        <div class="modal-step-grid">
          <div class="modal-step-card">
            <strong>STEP 1 · 현황 진단 (현재 화면)</strong>
            전국 89개 인구감소지역 지도나 검색에서 우리 시·군을 선택해 미거주주택·체류인구 공식 통계를 확인합니다.
          </div>
          <div class="modal-step-card">
            <strong>STEP 2 · 거점·공공 사례 참고</strong>
            단양·고흥·의성 12개월 관광 추이와 전국 8개 지자체 공고·회의록 기반 실제 예산 사례를 확인합니다.
          </div>
          <div class="modal-step-card">
            <strong>STEP 3 · 동일 예산 대안 비교</strong>
            예산(만 원)과 기준 가동률을 조절해 3대 대안(워케이션·청년 창업·귀농귀촌)의 5년 재정부담과 효과 범위를 비교합니다.
          </div>
          <div class="modal-step-card">
            <strong>STEP 4 · 결재용 A4/HWP 보고서</strong>
            사전 추진가능성 체크 후 결재란 포함 A4 보고서를 인쇄하거나, 한글(HWP)용 요약 표를 복사해 기안문에 바로 붙입니다.
          </div>
        </div>
        <div class="info-box" style="font-size:12.8px;">
          <strong>데이터 확실성 표기 안내:</strong>
          ${certBadge('official')} 공표통계 직접 확인 &nbsp;
          ${certBadge('actual')} 지자체 CSV 업로드 실측 &nbsp;
          ${certBadge('assumed')} 조정 가능 가정값 &nbsp;
          ${certBadge('calc')} 산식 계산값 &nbsp;
          ${certBadge('unknown')} 현장 확인 필요
        </div>
        <div class="modal-footer">
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:#5c634d;">
            <input type="checkbox" id="lpGuideDontShow" />
            다음 접속 시 자동으로 열지 않기
          </label>
          <button type="button" id="lpGuideStartBtn" class="btn btn-primary">이해했습니다 · 시작하기</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => {
      if (document.getElementById('lpGuideDontShow')?.checked) {
        try { localStorage.setItem(GUIDE_KEY, '1'); } catch {}
      }
      modal.classList.remove('open');
    };
    document.getElementById('lpGuideCloseTop').addEventListener('click', close);
    document.getElementById('lpGuideStartBtn').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const navBtn = document.getElementById('openGuideBtn');
    if (navBtn) navBtn.addEventListener('click', () => modal.classList.add('open'));

    if (autoOpenOnFirstVisit) {
      let dismissed = false;
      try { dismissed = localStorage.getItem(GUIDE_KEY) === '1'; } catch {}
      if (!dismissed) modal.classList.add('open');
    }
  }

  function debounce(fn, wait = 120) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function periodLabel(monthKey) {
    if (monthKey === 'avg') return '2026년 5~6월 평균';
    return `${monthKey.slice(0, 4)}년 ${Number(monthKey.slice(4))}월`;
  }

  return {
    DEFAULT_SCENARIOS,
    DEFAULT_STATE,
    escapeHtml,
    fmt,
    fmtDec,
    fmtMan,
    fmtWonAsMan,
    certBadge,
    getState,
    setState,
    getCustomData,
    setCustomData,
    fetchCachedJSON,
    diagnoseRegion,
    estimateRows,
    evaluateFeasibilityStatus,
    renderNavStatus,
    initOnboardingGuide,
    debounce,
    periodLabel
  };
})();
