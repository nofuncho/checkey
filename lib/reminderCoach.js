import dayjs from 'dayjs';

const BUCKETS = [
  { key: '≤5', max: 5 },
  { key: '≤10', max: 10 },
  { key: '≤30', max: 30 },
  { key: '≤60', max: 60 },
  { key: '>60', max: Infinity },
];

export function bucketizeByDuration(mins = 0) {
  for (const b of BUCKETS) if (mins <= b.max) return b.key;
  return '>60';
}

export function selectDigestCandidates(tasks, now = dayjs()) {
  // pending + (마감 오늘까지 or 마감 없음)
  return tasks.filter(t => {
    if (t.status !== 'pending') return false;
    if (!t.dueDate) return true;
    const due = dayjs(t.dueDate);
    return due.isSame(now, 'day') || due.isBefore(now, 'day') || due.diff(now, 'day') <= 0;
  });
}

function sortTasksWithinBucket(tasks) {
  return tasks.slice().sort((a, b) => {
    const aDue = a.dueDate ? dayjs(a.dueDate).valueOf() : Infinity;
    const bDue = b.dueDate ? dayjs(b.dueDate).valueOf() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    const aUpd = a.updatedAt ? dayjs(a.updatedAt).valueOf() : 0;
    const bUpd = b.updatedAt ? dayjs(b.updatedAt).valueOf() : 0;
    return bUpd - aUpd; // 최근 수정 우선
  });
}

export function buildDigest(tasks) {
  const groups = {};
  for (const t of tasks) {
    const mins = t.estimatedDurationMinutes ?? 5; // 없으면 5로 가정
    const bucket = bucketizeByDuration(mins);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(t);
  }
  for (const k of Object.keys(groups)) groups[k] = sortTasksWithinBucket(groups[k]);
  return groups;
}

export function buildCoachLine(groups) {
  const order = ['≤5', '≤10', '≤30', '≤60', '>60'];
  const parts = [];
  for (const key of order) {
    const cnt = groups[key]?.length ?? 0;
    if (cnt) parts.push(`${key} ${cnt}개`);
  }
  if (!parts.length) return '오늘 처리할 할 일이 없어요. 잘 하고 있어요! 🙌';
  return `지금 처리하면 좋은 일: ${parts.join(', ')}. 짧은 일부터 가볍게 시작해요!`;
}

export function buildDigestMessage(groups) {
  const order = ['≤5', '≤10', '≤30', '≤60', '>60'];
  let lines = [];
  for (const key of order) {
    const arr = groups[key];
    if (!arr || !arr.length) continue;
    lines.push(`• ${key}`);
    arr.slice(0, 5).forEach(t => {
      const mins = t.estimatedDurationMinutes ?? 5;
      const dueText = t.dueDate ? ` (마감 ${dayjs(t.dueDate).format('M/D HH:mm')})` : '';
      lines.push(`   - ${t.title} · ${mins}분${dueText}`);
    });
  }
  return lines.join('\n');
}

export function pickTodayDigest(tasks, now = dayjs()) {
  const cand = selectDigestCandidates(tasks, now);
  if (!cand.length) {
    return { coach: '오늘 처리할 할 일이 없어요. 잘 하고 있어요! 🙌', message: '' };
  }
  const groups = buildDigest(cand);
  return {
    coach: buildCoachLine(groups),
    message: buildDigestMessage(groups),
    groups,
  };
}
