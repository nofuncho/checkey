// lib/data.js
import { auth, db, firebase, serverTimestamp } from './firebase';

/** 유틸: 다양한 입력을 Firestore Timestamp로 통일 */
function toTimestamp(input) {
  if (!input) return null;
  // 이미 Timestamp인 경우
  if (input?.toDate && input?.seconds !== undefined) return input;
  // 문자열/숫자/Date 지원
  const d = input instanceof Date ? input : new Date(input);
  return firebase.firestore.Timestamp.fromDate(d);
}

function uidOrThrow() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('로그인이 필요합니다.');
  return uid;
}

/** -------------- Task -------------- */
export async function addTask({ title, dueDate, estimatedDurationMinutes = 10, status = 'pending' }) {
  const uid = uidOrThrow();
  const ref = db.collection('users').doc(uid).collection('tasks').doc();
  const doc = {
    taskId: ref.id,
    title: title?.trim() || '',
    dueDate: toTimestamp(dueDate), // Timestamp
    estimatedDurationMinutes,
    status, // 'pending' | 'done'
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    console.log('[data.js] addTask > 요청', { uid, doc });
    await ref.set(doc, { merge: true });
    console.log('[data.js] addTask > 완료', ref.id);
    return ref.id;
  } catch (e) {
    console.log('[data.js] addTask > 에러', e?.message || e);
    throw e;
  }
}

export async function updateTaskStatus(taskId, status) {
  const uid = uidOrThrow();
  console.log('[data.js] updateTaskStatus', { uid, taskId, status });
  await db
    .collection('users')
    .doc(uid)
    .collection('tasks')
    .doc(taskId)
    .set({ status, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteTask(taskId) {
  const uid = uidOrThrow();
  console.log('[data.js] deleteTask', { uid, taskId });
  await db.collection('users').doc(uid).collection('tasks').doc(taskId).delete();
}

/** 실시간 구독 (UI 갱신용) */
export function subscribeTasks(callback) {
  const uid = uidOrThrow();
  console.log('[data.js] subscribeTasks start', { uid });
  return db
    .collection('users')
    .doc(uid)
    .collection('tasks')
    .orderBy('dueDate', 'asc')
    .onSnapshot(
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // console.log('[data.js] subscribeTasks snapshot', items);
        callback(items);
      },
      (err) => console.log('[data.js] subscribeTasks error', err?.message || err)
    );
}

/** -------------- Schedule -------------- */
export async function addSchedule({ title, startTime, remind = 10 }) {
  const uid = uidOrThrow();
  const ref = db.collection('users').doc(uid).collection('schedules').doc();
  const doc = {
    scheduleId: ref.id,
    title: title?.trim() || '',
    startTime: toTimestamp(startTime), // Timestamp
    remind, // 분 단위 (기본 10)
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    console.log('[data.js] addSchedule > 요청', { uid, doc });
    await ref.set(doc, { merge: true });
    console.log('[data.js] addSchedule > 완료', ref.id);
    return ref.id;
  } catch (e) {
    console.log('[data.js] addSchedule > 에러', e?.message || e);
    throw e;
  }
}

export async function deleteSchedule(scheduleId) {
  const uid = uidOrThrow();
  console.log('[data.js] deleteSchedule', { uid, scheduleId });
  await db.collection('users').doc(uid).collection('schedules').doc(scheduleId).delete();
}

export function subscribeSchedules(callback) {
  const uid = uidOrThrow();
  console.log('[data.js] subscribeSchedules start', { uid });
  return db
    .collection('users')
    .doc(uid)
    .collection('schedules')
    .orderBy('startTime', 'asc')
    .onSnapshot(
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // console.log('[data.js] subscribeSchedules snapshot', items);
        callback(items);
      },
      (err) => console.log('[data.js] subscribeSchedules error', err?.message || err)
    );
}

/** -------------- 둘 다 생성 (예: "엄마 생신 선물 준비" 같이 task+schedule) -------------- */
export async function addTaskAndSchedule({ task, schedule }) {
  const uid = uidOrThrow();
  const batch = db.batch();

  // task
  const taskRef = db.collection('users').doc(uid).collection('tasks').doc();
  const taskDoc = {
    taskId: taskRef.id,
    title: task?.title?.trim() || '',
    dueDate: toTimestamp(task?.dueDate),
    estimatedDurationMinutes: task?.estimatedDurationMinutes ?? 10,
    status: task?.status ?? 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(taskRef, taskDoc);

  // schedule
  const schRef = db.collection('users').doc(uid).collection('schedules').doc();
  const schDoc = {
    scheduleId: schRef.id,
    title: schedule?.title?.trim() || '',
    startTime: toTimestamp(schedule?.startTime),
    remind: schedule?.remind ?? 10,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(schRef, schDoc);

  try {
    console.log('[data.js] addTaskAndSchedule > 요청', { uid, taskDoc, schDoc });
    await batch.commit();
    console.log('[data.js] addTaskAndSchedule > 완료', { taskId: taskRef.id, scheduleId: schRef.id });
    return { taskId: taskRef.id, scheduleId: schRef.id };
  } catch (e) {
    console.log('[data.js] addTaskAndSchedule > 에러', e?.message || e);
    throw e;
  }
}

/* ------------------------------------------------------------------
   ✅ 아래 2개가 이번에 추가한 헬퍼들 (compat 스타일)
   - getUserTasks(userId): pending Task 불러오기
   - fetchSchedulesRange(userId, start, end): 기간별 스케줄 불러오기
------------------------------------------------------------------- */

/** pending Task 불러오기 (userId 명시적으로 받음) */
export async function getUserTasks(userId) {
  const uid = userId || uidOrThrow();
  console.log('[data.js] getUserTasks > 요청', { uid });
  const col = db.collection('users').doc(uid).collection('tasks');
  const snap = await col.where('status', '==', 'pending').get();
  const rows = snap.docs.map((d) => ({ taskId: d.id, ...d.data() }));
  console.log('[data.js] getUserTasks > 결과', rows.length);
  return rows;
}

/**
 * 기간 스케줄 불러오기
 * - Firestore where+orderBy로 범위쿼리 하면 인덱스 필요해질 수 있어서
 *   MVP에선 전체를 정렬로 가져와서 JS에서 필터링
 */
export async function fetchSchedulesRange(userId, start, end) {
  const uid = userId || uidOrThrow();
  console.log('[data.js] fetchSchedulesRange > 요청', {
    uid,
    start: new Date(start).toISOString?.() || start,
    end: new Date(end).toISOString?.() || end,
  });

  const col = db.collection('users').doc(uid).collection('schedules');

  // 정렬만 걸고 전부 읽은 뒤, JS에서 시간 필터 (인덱스 회피)
  const snap = await col.orderBy('startTime', 'asc').get();
  const all = snap.docs.map((d) => ({ scheduleId: d.id, ...d.data() }));

  const s = new Date(start).getTime();
  const e = new Date(end).getTime();

  const filtered = all.filter((it) => {
    const ts = it.startTime;
    // ts는 Firestore Timestamp거나 Date일 수 있음
    const t =
      ts?.toMillis?.() ??
      (ts instanceof Date ? ts.getTime() : (ts ? new Date(ts).getTime() : 0));
    return t >= s && t <= e;
  });

  console.log('[data.js] fetchSchedulesRange > 결과', { total: all.length, filtered: filtered.length });
  return filtered;
}

/* ------------------------------------------------------------------
   ✅ (4번) 추정치 업데이트 헬퍼 — ensureEstimated에서 사용
------------------------------------------------------------------- */
export async function updateTaskEstimatedDuration(taskId, minutes, source = 'heuristic') {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('로그인이 필요합니다.');
  console.log('[data.js] updateTaskEstimatedDuration', { uid, taskId, minutes, source });
  await db
    .collection('users')
    .doc(uid)
    .collection('tasks')
    .doc(taskId)
    .set(
      {
        estimatedDurationMinutes: minutes,
        estimateSource: source, // optional 추적용
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
}
