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
    // 선택: UI 편의를 위해 completed 필드도 같이 유지(양측 호환)
    completed: status === 'done',
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
    .set(
      { status, completed: status === 'done', updatedAt: serverTimestamp() },
      { merge: true }
    );
}

/** ✅ 신규: 부분 업데이트 (completed/dueDate 변환 지원) */
export async function updateTask(taskId, patch) {
  const uid = uidOrThrow();
  if (!taskId) throw new Error('taskId가 필요합니다.');
  if (!patch || typeof patch !== 'object') return;

  const toWrite = { ...patch };

  // completed → status 동기화
  if (typeof patch.completed === 'boolean') {
    toWrite.status = patch.completed ? 'done' : 'pending';
  }

  // dueDate를 Timestamp로
  if (patch.dueDate !== undefined) {
    toWrite.dueDate = toTimestamp(patch.dueDate);
  }

  // updatedAt 보정
  if (!('updatedAt' in toWrite)) {
    toWrite.updatedAt = serverTimestamp();
  }

  console.log('[data.js] updateTask', { uid, taskId, toWrite });
  await db
    .collection('users')
    .doc(uid)
    .collection('tasks')
    .doc(taskId)
    .set(toWrite, { merge: true });
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
        callback(items);
      },
      (err) => console.log('[data.js] subscribeSchedules error', err?.message || err)
    );
}

/** -------------- 둘 다 생성 -------------- */
/**
 * addTaskAndSchedule(options)
 * - 기존 시그니처: { task, schedule }
 * - 평평한(flat) 시그니처도 지원:
 *   { title, startTime, dueDate, estimatedDurationMinutes }
 */
export async function addTaskAndSchedule(options) {
  const uid = uidOrThrow();
  const batch = db.batch();

  let taskInput, scheduleInput;

  if (options?.task || options?.schedule) {
    // 기존 형태
    taskInput = options.task || {};
    scheduleInput = options.schedule || {};
  } else {
    // flat 형태 지원
    taskInput = {
      title: options?.title,
      dueDate: options?.dueDate,
      estimatedDurationMinutes: options?.estimatedDurationMinutes ?? 10,
      status: 'pending',
    };
    scheduleInput = {
      title: options?.title,
      startTime: options?.startTime,
      remind: 10,
    };
  }

  // task
  const taskRef = db.collection('users').doc(uid).collection('tasks').doc();
  const taskDoc = {
    taskId: taskRef.id,
    title: taskInput?.title?.trim() || '',
    dueDate: toTimestamp(taskInput?.dueDate),
    estimatedDurationMinutes: taskInput?.estimatedDurationMinutes ?? 10,
    status: taskInput?.status ?? 'pending',
    completed: (taskInput?.status ?? 'pending') === 'done',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(taskRef, taskDoc);

  // schedule
  const schRef = db.collection('users').doc(uid).collection('schedules').doc();
  const schDoc = {
    scheduleId: schRef.id,
    title: scheduleInput?.title?.trim() || '',
    startTime: toTimestamp(scheduleInput?.startTime),
    remind: scheduleInput?.remind ?? 10,
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
   ✅ 아래 2개: 목록/범위 조회 헬퍼
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
  const snap = await col.orderBy('startTime', 'asc').get();
  const all = snap.docs.map((d) => ({ scheduleId: d.id, ...d.data() }));

  const s = new Date(start).getTime();
  const e = new Date(end).getTime();

  const filtered = all.filter((it) => {
    const ts = it.startTime;
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
