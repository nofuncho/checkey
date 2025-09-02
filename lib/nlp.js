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

/* ---------- 메인 파서 ---------- */
export async function parseWithGPT(userText) {
  const system = `
당신은 한국어 일정/할일 파서입니다.
JSON만 반환하세요.
- type: schedule|task|both|other
- startTime: ISO8601 (시간이 명확할 때만)
- dueDate: ISO8601
- tasks: 쉼표/세미콜론/줄바꿈/그리고/및/와/랑/또 로 분리
- estimatedDurationMinutes: 5,10,15,20,30,45,60 중 보수적 추정
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
  // 2-1) 시간이 명시된 경우에만 startTime 자동 생성
  if (!startTime) {
    const relStart = parseRelativeDateTimeISO(userText);
    if (relStart) startTime = relStart;
  }

  // 2-2) 날짜만 있고 시간은 없을 때 → ‘할 일’로 처리: 그날 23:59 마감
  if (!startTime && !dueDate) {
    const dayISO = parseRelativeDayISO(userText);
    if (dayISO) {
      dueDate = dayjs(dayISO).endOf('day').toISOString(); // 23:59:59
      // 일정 키워드(회의/미팅 등)라도 시간이 없으니 일단 task 로 둔다 (MVP 정책)
      json.type = 'task';
    }
  }

  // 숫자 변환
  if (json.estimatedDurationMinutes != null) {
    const n = Number(json.estimatedDurationMinutes);
    json.estimatedDurationMinutes = Number.isFinite(n) ? n : null;
  }

  let tasks = json.tasks.map((t) => ({
    title: t?.title ?? '',
    dueDate: t?.dueDate ? toISO(t.dueDate) : null,
    estimatedDurationMinutes:
      t?.estimatedDurationMinutes != null
        ? Number(t.estimatedDurationMinutes)
        : null,
  }));

  /* ---------- 🔁 최후 폴백 ----------
     - 일정이 없고(tasks도 비었을 때) 원문을 한국어 접속사 기준으로 분리해서 tasks 생성
     - 하나도 못 나누면 최소 1개라도 생성
  --------------------------------- */
  const noSchedule = !startTime;
  const tasksEmpty = !Array.isArray(tasks) || tasks.length === 0;
  if (noSchedule && tasksEmpty) {
    const parts = String(userText)
      .split(
        /(?:,|·|、|;|\||\n|\s+(?:그리고|및|또|하고)\s+|\s고\s+)/g
      )
      .map((s) => s.trim())
      .filter(Boolean);

    tasks =
      parts.length > 0
        ? parts.map((p) => ({ title: p }))
        : [{ title: userText.trim() }];

    // title이 없으면 첫 항목으로
    json.title = json.title || tasks[0]?.title || '';
    json.type = 'task';

    // 날짜 키워드가 포함되어 있고 dueDate가 아직 없으면 해당 날짜의 23:59 부여
    if (!dueDate) {
      const onlyDay = parseRelativeDayISO(userText);
      if (onlyDay) dueDate = dayjs(onlyDay).endOf('day').toISOString();
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
