/**
 * Local Pivot 공무원용 내부 데이터 로컬 업로드 툴
 * - 100% 브라우저 내 FileReader 처리 (외부 서버 전송 없음)
 * - 따옴표·쉼표 포함 CSV 셀 안전 파싱, 음수·문자열·범위 초과 자동 검증
 */
window.LocalPivotUploader = (() => {
  const REQUIRED_HEADERS = [
    '지역명',
    '확정_후보주택_동수',
    '호당_실제전환비_만원',
    '투입예산_억원',
    '실측_가동률_퍼센트'
  ];

  function splitCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function parseNumCell(raw) {
    const cleaned = String(raw ?? '').replace(/,/g, '').trim();
    if (cleaned === '') return NaN;
    return Number(cleaned);
  }

  function downloadTemplate() {
    const csv = '\uFEFF' + [
      REQUIRED_HEADERS.join(','),
      '충청북도 단양군,15,6500,10,60'
    ].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'local_pivot_template.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function parseCSV(text) {
    const cleaned = text.replace(/^\uFEFF/, '').trim();
    const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      return { ok: false, errors: ['헤더(1행)와 데이터(2행)가 모두 필요합니다.'] };
    }
    const headers = splitCsvLine(lines[0]);
    const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
    if (missing.length > 0) {
      return { ok: false, errors: [`필수 열이 누락되었습니다: ${missing.join(', ')}`] };
    }

    const row = splitCsvLine(lines[1]);
    const map = {};
    headers.forEach((h, idx) => { map[h] = row[idx] ?? ''; });

    const errors = [];
    const regionName = String(map['지역명'] ?? '').trim();
    if (!regionName) errors.push('지역명이 비어 있습니다.');

    const candidateUnits = parseNumCell(map['확정_후보주택_동수']);
    if (!Number.isFinite(candidateUnits) || candidateUnits < 0 || !Number.isInteger(candidateUnits)) {
      errors.push('확정_후보주택_동수는 0 이상의 정수여야 합니다.');
    }

    const unitCostMan = parseNumCell(map['호당_실제전환비_만원']);
    if (!Number.isFinite(unitCostMan) || unitCostMan <= 0) {
      errors.push('호당_실제전환비_만원은 0보다 큰 숫자여야 합니다.');
    }

    const budgetEok = parseNumCell(map['투입예산_억원']);
    if (!Number.isFinite(budgetEok) || budgetEok < 0) {
      errors.push('투입예산_억원은 0 이상의 숫자여야 합니다.');
    }

    const occRate = parseNumCell(map['실측_가동률_퍼센트']);
    if (!Number.isFinite(occRate) || occRate < 0 || occRate > 100) {
      errors.push('실측_가동률_퍼센트는 0~100 사이의 숫자여야 합니다.');
    }

    if (errors.length > 0) return { ok: false, errors };

    return {
      ok: true,
      data: {
        regionName,
        candidateUnits,
        unitCostMan,
        budgetMan: Math.round(budgetEok * 10000),
        budgetEok,
        occRate,
        uploadedAt: new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short'
        }).format(new Date())
      }
    };
  }

  function handleFile(file, onSuccess, onError) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError(['CSV 파일(.csv)만 업로드할 수 있습니다.']);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseCSV(String(e.target.result || ''));
      if (!result.ok) {
        onError(result.errors);
      } else {
        window.LocalPivot.setCustomData(result.data);
        onSuccess(result.data);
      }
    };
    reader.onerror = () => onError(['파일을 읽는 중 오류가 발생했습니다.']);
    reader.readAsText(file, 'utf-8');
  }

  return { downloadTemplate, parseCSV, handleFile };
})();
