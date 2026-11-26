/**
 * Local Pivot Common State, Diagnosis Engine, Caching & Formatting Utilities
 * - 모든 금액 단위: 만 원 통일
 * - 모든 방문 단위: 회 (중복 포함 연인원 기준) / 정착·인구 단위: 명
 */
window.LocalPivot = (() => {
  const STATE_KEY = 'localPivot_state_v4';
  const CUSTOM_KEY = 'localPivot_customData_v4';

  const DEFAULT_SCENARIOS = {
    A: {
      key: 'A',
      name: '체류형 워케이션',
      short: 'A. 워케이션',
      summary: '단기·중기 원격근무 방문객 유치',
      monthlyVisitorsPerUnit: 16,
      residentGainPerUnit: 0.0,
      spendMultiplier: 1.00,
      initCostMan: 8000,
      opCostMan: 1200,
      refText: '개별 빈집 공고 단가 미확정 · 거점 사례 100,000만~550,000만 원 참고',
      kpiText: '실이용일·가동률·방문 횟수'
    },
    B: {
      key: 'B',
      name: '청년 로컬 창업',
      short: 'B. 청년 창업',
      summary: '주거·창업 복합 공간으로 상권 활력 연계',
      monthlyVisitorsPerUnit: 20,
      residentGainPerUnit: 0.4,
      spendMultiplier: 1.00,
      initCostMan: 9000,
      opCostMan: 1500,
      refText: '함양 빈집 추가 1동 18,000만 원+운영 10,000만 원 · 영월 신축 478,900만 원 참고',
      kpiText: '운영일·방문 또는 거래 건수·입점 유지'
    },
    C: {
      key: 'C',
      name: '귀농·귀촌 정착',
      short: 'C. 귀농·귀촌',
      summary: '장기 거주 지원으로 정주 인구 유입',
      monthlyVisitorsPerUnit: 4,
      residentGainPerUnit: 1.8,
      spendMultiplier: 1.00,
      initCostMan: 6000,
      opCostMan: 300,
      refText: '단양 희망둥지(최대 6,000만 원) · 고흥 새뜰하우스(6,000만~8,000만 원) 공고 한도 참고',
      kpiText: '입주 가구·입주 인원·6개월 및 1년 정착 유지'
    }
  };

  const DEFAULT_STATE = {
    regionCode: '43800', // 충청북도 단양군
    monthKey: 'avg',
    scenarioKey: 'A',
    costMode: 'units',
    units: 10,
    budgetMan: 80000,       // 만 원
    occRate: 55,            // %
    perVisitSpendMan: 5.0,  // 1회 방문당 추정 소비액 (만 원, 예시 가정)
    capToCandidate: false,
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

  // 만 원 단위 통일 포맷터
  const fmtMan = (man, decimals = 0) => {
    if (man === null || man === undefined || !Number.isFinite(Number(man))) return '—';
    const val = Number(man);
    if (decimals > 0) {
      return `${val.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}만 원`;
    }
    return `${Math.round(val).toLocaleString('ko-KR')}만 원`;
  };

  // 원 -> 만 원 변환 포맷터
  const fmtWonAsMan = (won, decimals = 1) => {
    if (won === null || won === undefined || !Number.isFinite(Number(won))) return '—';
    return fmtMan(Number(won) / 10000, decimals);
  };

  function getState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch {}
    const params = new URLSearchParams(window.location.search);
    const merged = {
      ...DEFAULT_STATE,
      ...saved,
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
    const cacheKey = 'lp_cache_v4_' + path;
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

  function diagnoseRegion(region, allRegions) {
    const list = Object.values(allRegions);
    const stayRatios = list.map(r => r.living_pop.avg.stay_ratio);
    const stayHours = list.map(r => r.living_pop.avg.avg_stay_hours);
    const unoccRates = list.map(r => r.unoccupied_rate);
    const extIndices = list.map(r => r.extinction_index);

    const medStayRatio = median(stayRatios);
    const medStayHours = median(stayHours);
    const medUnoccRate = median(unoccRates);
    const medExtIndex = median(extIndices);

    const lp = region.living_pop.avg;
    const ranks = {
      stayRatioRank: rankDesc(stayRatios, lp.stay_ratio),
      stayHoursRank: rankDesc(stayHours, lp.avg_stay_hours),
      unoccRateRank: rankDesc(unoccRates, region.unoccupied_rate),
      extRiskRank: extIndices.filter(x => x < region.extinction_index).length + 1,
      total: list.length,
      medians: { medStayRatio, medStayHours, medUnoccRate, medExtIndex }
    };

    if (lp.stay_ratio > medStayRatio && lp.avg_stay_hours <= medStayHours) {
      return {
        typeLabel: '유입-단기체류형',
        recommendedKey: 'A',
        secondaryKey: 'B',
        recommendedText: 'A. 체류형 워케이션 (보조: B. 청년 로컬 창업)',
        reason: `체류인구 배수(${fmtDec(lp.stay_ratio, 2)}배, 89개 중 ${ranks.stayRatioRank}위)는 전국 중앙값(${fmtDec(medStayRatio, 2)}배)보다 높으나 평균 체류시간(${fmtDec(lp.avg_stay_hours, 1)}시간)이 짧아, 경유 방문객을 숙박·상권 소비로 연장하는 대안이 우선 검토 대상입니다.`,
        ranks
      };
    }

    if (lp.avg_stay_hours > medStayHours && region.unoccupied_rate > medUnoccRate) {
      return {
        typeLabel: '장기체류-빈집풍부형',
        recommendedKey: 'A',
        secondaryKey: 'C',
        recommendedText: 'A. 체류형 워케이션 (보조: C. 귀농·귀촌 정착)',
        reason: `평균 체류시간(${fmtDec(lp.avg_stay_hours, 1)}시간, 89개 중 ${ranks.stayHoursRank}위)과 미거주주택 비율(${fmtDec(region.unoccupied_rate, 2)}%, ${ranks.unoccRateRank}위)이 모두 전국 중앙값을 상회해, 기존 빈집을 활용한 중장기 체류·정주 전환에 유리합니다.`,
        ranks
      };
    }

    return {
      typeLabel: '초고위험-정주방어형',
      recommendedKey: 'C',
      secondaryKey: 'B',
      recommendedText: 'C. 귀농·귀촌 정착 (거점 연계 시 B. 청년 창업 보조)',
      reason: `소멸위험지수(${fmtDec(region.extinction_index, 4)}, 89개 중 위험도 ${ranks.extRiskRank}위)와 체류인구 배수(${fmtDec(lp.stay_ratio, 2)}배, ${ranks.stayRatioRank}위) 구조상 단기 숙박 유치보다 정주 인구 안착 중심 검토가 우선됩니다.`,
      ranks
    };
  }

  /**
   * 3단계 가동률 효과 범위 산출 (모든 금액 만 원, 방문 횟수 회)
   */
  function estimateRows(scn, units, occRate, perVisitSpendMan) {
    return ['보수적', '기준', '낙관적'].map((label, i) => {
      const occ = Math.max(0, Math.min(100, occRate + (i - 1) * 10));
      const activeRoomDays = Math.round(units * 365 * (occ / 100));
      const visits = Math.round(units * scn.monthlyVisitorsPerUnit * 12 * (occ / 100));
      const settlers = Math.round(units * scn.residentGainPerUnit * (occ / 100));
      const spendMan = Math.round(visits * perVisitSpendMan * scn.spendMultiplier);
      const capacityWarn = visits > activeRoomDays * 2;
      return { label, occ, activeRoomDays, visits, settlers, spendMan, capacityWarn };
    });
  }

  function animateNumber(el, target, formatter = fmt, duration = 220) {
    if (!el || !Number.isFinite(target)) {
      if (el) el.textContent = formatter(target);
      return;
    }
    const start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(target * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = formatter(target);
    }
    requestAnimationFrame(step);
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
    getState,
    setState,
    getCustomData,
    setCustomData,
    fetchCachedJSON,
    diagnoseRegion,
    estimateRows,
    animateNumber,
    renderNavStatus,
    debounce,
    periodLabel
  };
})();
