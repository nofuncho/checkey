// lib/nlp.js
import dayjs from 'dayjs';

const OPENAI_API_KEY =
  process.env.EXPO_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

async function callOpenAI(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim() || '{}';
  return JSON.parse(content);
}

/* ---------- 상대 날짜/시간 헬퍼 ---------- */
// “시간이 명시됐는지” 판단 (오전/오후/AM/PM, ‘시/분’, HH:MM)
function hasExplicitTime(text = '') {
  return (
    /(오전|오후|AM|PM)/i.test(text) ||
    /\b\d{1,2}\s*시(\s*\d{1,2}\s*분)?/.test(text) ||
    /\b\d{1,2}:\d{2}\b/.test(text)
  );
}

// 날짜(오늘/내일/모레)만 뽑기 — 시간은 만들지 않음
function parseRelativeDayISO(text = '') {
  const now = dayjs();
  if (/모레/.test(text)) return now.add(2, 'day').startOf('day').toISOString();
  if (/내일/.test(text)) return now.add(1, 'day').startOf('day').toISOString();
  if (/오늘/.test(text)) return now.startOf('day').toISOString();
  return null;
}

// 날짜+시간이 모두 있는 경우에만 startTime 생성
function parseRelativeDateTimeISO(text = '') {
  if (!hasExplicitTime(text)) return null;

  // 기준 날짜 (오늘/내일/모레 없으면 오늘)
  let base = dayjs();
  if (/모레/.test(text)) base = base.add(2, 'day');
  else if (/내일/.test(text)) base = base.add(1, 'day');

  // 시/분 파싱
  let hour = 9;
  let minute = 0;

  const hhmm = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const hKr = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);

  if (hhmm) {
    hour = parseInt(hhmm[1], 10);
    minute = parseInt(hhmm[2], 10);
  } else if (hKr) {
    hour = parseInt(hKr[1], 10);
    minute = hKr[2] ? parseInt(hKr[2], 10) : 0;
  }

  // 오전/오후 보정
  if (/(오후|PM)/i.test(text) && hour < 12) hour += 12;
  if (/(오전|AM)/i.test(text) && hour === 12) hour = 0;

  return base
    .hour(hour)
    .minute(minute)
    .second(0)
    .millisecond(0)
    .toISOString();
}

/* ---------- 안전 분리기(폴백 + 후처리 공용) ---------- */

/** 동반활동 키워드 (문장 내부에서 분리 금지) */
const WITH_ACTIVITY = /(데이트|만나|미팅|식사|밥|점심|저녁|영화|산책|파티|축하|쇼핑|카페|차|티타임|여행|모임|콜|통화|전화|상담|면담)/;

/** “A랑 B” 형태를 기본적으로 자르지 않기 위해 ‘와/과/랑/하고/및’은 기본 분리자에서 제외  */
function safeSplitTasks(input = '') {
  const raw = String(input).replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  // 1) 강한 구분자 위주 1차 분리
  const HARD_SEP = /[\n,;／/、]+|(?:\s+)?(?:그리고|또|겸)(?:\s+)?/g;
  let chunks = raw.split(HARD_SEP).map(s => s.trim()).filter(Boolean);

  // 2) ‘…하고…하고…’가 2회 이상일 때만 나열로 간주하여 분리
  if (chunks.length === 1) {
    const text = chunks[0];
    const cntHago = (text.match(/\s하고\s/g) || []).length;
    if (cntHago >= 2) {
      chunks = text.split(/\s*하고\s*/g).map(s => s.trim()).filter(Boolean);
    }
  }

  // 3) 동반활동 보호 & 재결합
  //   - “엄마랑” 단독 + 다음이 활동문이면 결합
  //   - “A와/랑 B(활동)” 한 문장으로 남김
  const CONNECT_TAIL = /(랑|하고|과|와)$/;
  const CONNECT_ANY = /(랑|하고|과|와)\s+/;

  const merged = [];
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];

    // 한 문장에 이미 동반표현 + 활동 키워드가 같이 있으면 그대로 유지
    if (CONNECT_ANY.test(cur) && WITH_ACTIVITY.test(cur)) {
      merged.push(cur);
      continue;
    }

    // "엄마랑" 처럼 접속조사로 끝나고, 다음 토막이 활동이면 결합
    if (CONNECT_TAIL.test(cur)) {
      const next = chunks[i + 1];
      if (next && WITH_ACTIVITY.test(next)) {
        merged.push(`${cur} ${next}`.replace(/\s+/g, ' ').trim());
        i += 1;
        continue;
      }
    }

    merged.push(cur);
  }

  // 4) 노이즈 정리 + 중복 제거
  const cleaned = merged
    .map(s =>
      s
        .replace(/^(그럼|그리고|또)\s*/,'')
        .replace(/^\-+\s*/,'')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(s => s.length >= 2);

  return [...new Set(cleaned)];
}

/** GPT가 잘못 쪼갠 경우(예: '엄마' + '데이트하기') 탐지 */
function looksOversplit(titles = [], original = '') {
  for (let i = 0; i < titles.length - 1; i++) {
    const a = (titles[i] || '').trim();
    const b = (titles[i + 1] || '').trim();
    // a가 짧은 인물/대상 + b가 활동문
    if (/^(엄마|아빠|부모님|부모|친구|동생|형|누나|언니|오빠|선생님|고객|사장님|팀원|아이|아기|딸|아들|와이프|남편)$/.test(a)
        && WITH_ACTIVITY.test(b)) {
      // 원문에 "a(이)랑|하고|과|와 b" 패턴이 있었으면 거의 확실
      if (new RegExp(`${a}(?:이랑|랑|하고|과|와)\\s*${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(original)) {
        return true;
      }
      // 또는 b가 "…하기/…만나기" 같은 동사명사화일 때도 의심
      if (/(하기|가|기)$/.test(b)) return true;
    }
  }
  return false;
}

/* ---------- 제목 유도 & 태스크 정규화 ---------- */
const SCHEDULE_KEYWORDS = [
  '미팅','회의','면담','인터뷰','약속','행사','세미나','웨비나','발표',
  '콜','통화','브리핑','킥오프','데모','리뷰'
];

function deriveScheduleTitle(text = '') {
  const t = String(text).trim();
  for (const k of SCHEDULE_KEYWORDS) {
    if (new RegExp(k).test(t)) return k;  // ex) "내일 미팅 ..." -> "미팅"
  }
  const m = t.match(/([가-힣A-Za-z0-9]+)\s*(콜|통화)/);
  if (m) return `${m[2]}`;
  return null;
}

function normalizeTaskTitle(raw = '') {
  let s = String(raw).trim();

  // 접속사 꼬리 정리: "~있고", "~하고", "~고" 끝 제거
  s = s.replace(/\s*(있고|하고|고)\s*$/,'');
  // 구어체 정리: "해야댐/해야됨" -> "해야 함"
  s = s.replace(/해야댐|해야됨/gi, '해야 함');

  // "전화해야 함" -> "전화하기" 등 일반화
  s = s.replace(/전화\s*해야\s*함?$/,'전화하기');
  s = s.replace(/연락\s*해야\s*함?$/,'연락하기');

  // "~하기기" 같은 중복 "기" 제거
  s = s.replace(/하기기$/,'하기');

  // 명사만 남으면 기본 행동 부여
  if (/^(엄마|아빠|친구|고객|팀원|상사|와이프|남편|부모|부모님)$/.test(s)) {
    s = `${s}에게 연락하기`;
  }

  return s.length >= 2 ? s : raw.trim();
}

/* ---------- 메인 파서 ---------- */
export async function parseWithGPT(userText) {
  const system = `
당신은 한국어 일정/할일 파서입니다.
JSON만 반환하세요.
- type: schedule|task|both|other
- startTime: ISO8601 (시간이 명확할 때만)
- dueDate: ISO8601
- tasks: 사용자가 적은 문장에서 "할 일"을 나열한 경우만 분리합니다.
  * 기본 분리 기준: 줄바꿈, 쉼표, 세미콜론, 슬래시, "그리고", "또", "겸"
  * 다음은 분리 금지: "와/과/랑/하고/및" (동반/대상 연결에 자주 쓰임)
  * 특히 "X랑/와/과/하고 + 데이트/만나/식사/영화/산책/파티/축하/통화/콜…"은 하나의 할 일로 남깁니다.
- estimatedDurationMinutes: 5,10,15,20,30,45,60 중 보수적으로 추정
  `.trim();

  const user = `사용자 입력:\n${userText}`.trim();

  const json = await callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  // 기본값 보정
  if (!Array.isArray(json.tasks)) json.tasks = [];
  json.type = String(json.type || '').toLowerCase();

  const toISO = (v) => {
    try {
      return v ? new Date(v).toISOString() : null;
    } catch {
      return null;
    }
  };

  // 1) GPT 결과 우선 반영
  let startTime = json.startTime ? toISO(json.startTime) : null;
  let dueDate = json.dueDate ? toISO(json.dueDate) : null;

  // 2) 우리 보강 규칙
  if (!startTime) {
    const relStart = parseRelativeDateTimeISO(userText);
    if (relStart) startTime = relStart;
  }
  if (!startTime && !dueDate) {
    const dayISO = parseRelativeDayISO(userText);
    if (dayISO) {
      dueDate = dayjs(dayISO).endOf('day').toISOString();
      json.type = 'task';
    }
  }

  // 숫자 변환
  if (json.estimatedDurationMinutes != null) {
    const n = Number(json.estimatedDurationMinutes);
    json.estimatedDurationMinutes = Number.isFinite(n) ? n : null;
  }

  // ----- tasks 정규화 -----
  let tasks = json.tasks.map((t) => ({
    title: (typeof t === 'string' ? t : t?.title) ?? '',
    dueDate: t?.dueDate ? toISO(t.dueDate) : null,
    estimatedDurationMinutes:
      t?.estimatedDurationMinutes != null
        ? Number(t.estimatedDurationMinutes)
        : null,
  }));

  // (A) GPT가 이상하게 쪼갰다면 → 원문 기준 안전 분리로 교체
  const titles = tasks.map(t => t.title).filter(Boolean);
  if (looksOversplit(titles, userText)) {
    const safe = safeSplitTasks(userText);
    tasks = safe.map(p => ({ title: p }));
  }

  /* ---------- 🔁 최후 폴백 ----------
     - 일정이 없고(tasks도 비었을 때) 원문을 안전 분리기로 분해
     - 하나도 못 나누면 최소 1개라도 생성
  --------------------------------- */
  const noSchedule = !startTime;
  const tasksEmpty = !Array.isArray(tasks) || tasks.length === 0 || tasks.every(t => !t.title?.trim());
  if (noSchedule && tasksEmpty) {
    const parts = safeSplitTasks(userText);
    tasks =
      parts.length > 0
        ? parts.map((p) => ({ title: p }))
        : [{ title: userText.trim() }];
    json.title = json.title || tasks[0]?.title || '';
    json.type = 'task';

    if (!dueDate) {
      const onlyDay = parseRelativeDayISO(userText);
      if (onlyDay) dueDate = dayjs(onlyDay).endOf('day').toISOString();
    }
  }

  /* ---------- 추가 후처리: 제목 보강 & 태스크 정규화 ---------- */

  // 스케줄 제목 자동 보강 (시간이 있는데 제목이 비면)
  if (startTime && !json.title) {
    json.title = deriveScheduleTitle(userText) || '일정';
  }

  // 태스크 문구 정규화
  tasks = tasks
    .map(t => ({ ...t, title: normalizeTaskTitle(t.title || '') }))
    .filter(t => t.title);

  // 시간이 없는데 '스케줄 느낌'만 있는 경우 -> 해당 날짜의 태스크로 보강
  if (!startTime) {
    const hasScheduleWord = SCHEDULE_KEYWORDS.some(k => new RegExp(k).test(userText));
    if (hasScheduleWord) {
      const dayISO = parseRelativeDayISO(userText);
      if (dayISO) {
        const due = dayjs(dayISO).endOf('day').toISOString();
        const guessed = deriveScheduleTitle(userText) || '일정';
        if (!tasks.some(t => t.title.includes(guessed))) {
          tasks.unshift({ title: guessed, dueDate: due, estimatedDurationMinutes: null });
        }
        json.type = 'task';
        if (!dueDate) dueDate = due;
      }
    }
  }

  return {
    type: json.type,
    title: json.title || '',
    startTime,
    dueDate,
    estimatedDurationMinutes: json.estimatedDurationMinutes ?? null,
    tasks,
  };
}

/* ---------- 카드 변환 ---------- */
export function toConfirmCard(parsed) {
  const card = {
    type: parsed.type || 'other',
    title: parsed.title || '',
    startTime: parsed.startTime || null,
    dueDate: parsed.dueDate || null,
    estimatedDurationMinutes: parsed.estimatedDurationMinutes ?? null,
    tasks: parsed.tasks || [],
    summary: null,
  };

  const hasSchedule = !!card.startTime;
  const hasTasks = Array.isArray(card.tasks) && card.tasks.length > 0;

  // ⚠️ 정책: 시간 없는 ‘오늘 회의’는 task로 유지
  if (hasSchedule && hasTasks) card.type = 'both';
  else if (hasSchedule) card.type = 'schedule';
  else if (hasTasks || card.type === 'task') card.type = 'task';

  if (!card.title && hasTasks) {
    card.title =
      typeof card.tasks[0] === 'string'
        ? card.tasks[0]
        : card.tasks[0]?.title || '';
  }

  return card;
}
