// lib/notify.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import dayjs from 'dayjs'; // ✅ 추가
import { auth, db, serverTimestamp, firebase } from './firebase';
import { pickTodayDigest } from './reminderCoach'; // ✅ 추가
import { getUserTasks } from './data'; // ✅ 추가

// 포그라운드에서도 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    // sound는 지정 안 함(플랫폼 기본)
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let _initialized = false;

export async function ensurePushPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const { status: s2 } = await Notifications.requestPermissionsAsync();
    return s2 === 'granted';
  }
  return true;
}

export async function setupNotificationsOnce() {
  if (_initialized) return;
  _initialized = true;

  await ensurePushPermission();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

/* -------- Firestore 로깅(실패해도 throw 안 함) -------- */
const uidOrNull = () => auth.currentUser?.uid || null;
const toTs = (iso) => firebase.firestore.Timestamp.fromDate(new Date(iso));

async function safeLog(uid, data) {
  try {
    if (!uid) return null;
    const ref = db.collection('users').doc(uid).collection('notifications').doc();
    await ref.set(
      { ...data, notificationId: ref.id, createdAt: serverTimestamp(), status: 'scheduled' },
      { merge: true }
    );
    return ref.id;
  } catch (e) {
    console.warn('[notify] log error:', e?.message || e);
    return null;
  }
}

async function safeUpdateByScheduledId(scheduledId, patch) {
  try {
    const uid = uidOrNull();
    if (!uid || !scheduledId) return;
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .where('scheduledId', '==', scheduledId)
      .get();
    const batch = db.batch();
    snap.forEach((d) => batch.set(d.ref, patch, { merge: true }));
    if (!snap.empty) await batch.commit();
  } catch (e) {
    // 로깅 실패는 무시
  }
}

// GPT
export async function scheduleCoachNotification({ kind, title, date }) {
  const triggerDate = new Date(date);
  const minutesLeft = Math.max(
    0,
    Math.round((triggerDate.getTime() - Date.now()) / 60000)
  );

  // ⚠️ makeCoachTip은 네 코드 베이스에 이미 있다고 가정 (원본 유지)
  const tip = await makeCoachTip({
    type: kind,
    title,
    minutesLeft,
    shortTasksCount: 1,
  });

  return Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: tip, // ✅ 코치 멘트
      data: { kind, title, remind: 10 },
    },
    trigger: { type: 'date', date: triggerDate },
  });
}

/* -------- 스케줄러 -------- */
// ✅ content에 data 포함 (채팅에 쓰기 위해)
// ✅ trigger는 { type: 'date', date: when } 형식 사용
export async function scheduleScheduleReminder({ title, startTimeISO, remind = 10, relatedId = null }) {
  await setupNotificationsOnce();
  if (!startTimeISO) return null;

  const start = new Date(startTimeISO);
  const when = new Date(start.getTime() - remind * 60 * 1000);
  if (when.getTime() <= Date.now()) {
    console.log('[notify] schedule skipped (past trigger)');
    return null;
  }

  const scheduledId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ 곧 일정이 시작돼요',
      body: `${title} — ${remind}분 뒤 시작`,
      data: { kind: 'schedule', title, remindMinutes: remind, relatedId, startTimeISO },
    },
    trigger: { type: 'date', date: when },
  });

  await safeLog(uidOrNull(), {
    kind: 'schedule',
    title,
    relatedId,
    remindMinutes: remind,
    triggerAt: toTs(when.toISOString()),
    scheduledId,
  });

  return scheduledId;
}

export async function scheduleTaskReminders({
  title,
  dueDateISO,
  estimatedDurationMinutes = 10,
  relatedId = null,
}) {
  await setupNotificationsOnce();
  if (!dueDateISO) return [];

  const due = new Date(dueDateISO);
  const offsets = [60, 15, 5];
  const results = [];

  for (const m of offsets) {
    const when = new Date(due.getTime() - m * 60 * 1000);
    if (when.getTime() <= Date.now()) continue;

    const hint =
      estimatedDurationMinutes <= 10
        ? '지금 10분 컷 가능!'
        : estimatedDurationMinutes <= 25
        ? '여유 있을 때 처리해요'
        : '시간 배정이 필요해요';

    const scheduledId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📝 할 일 마감 임박',
        body: `${title} — ${m}분 남음 · ${hint}`,
        data: {
          kind: 'task',
          title,
          remindMinutes: m,
          hint,
          relatedId,
          dueDateISO,
          estimatedDurationMinutes,
        },
      },
      trigger: { type: 'date', date: when },
    });

    await safeLog(uidOrNull(), {
      kind: 'task',
      title,
      relatedId,
      hint,
      remindMinutes: m,
      triggerAt: toTs(when.toISOString()),
      scheduledId,
      estimatedDurationMinutes,
    });

    results.push(scheduledId);
  }

  return results;
}

/* ================== ✅ 하루 3번 다이제스트 (08:00 / 13:00 / 19:00) ================== */
// 오늘(또는 이미 지난 경우 내일) 특정 시각 트리거
function triggerAtToday(h, m = 0, s = 0) {
  const now = dayjs();
  let target = now.hour(h).minute(m).second(s).millisecond(0);
  if (target.isBefore(now)) target = target.add(1, 'day'); // 이미 지났으면 내일
  return { type: 'date', date: target.toDate() };
}

/** userId 기준으로 오늘 다이제스트 3개 예약 */
export async function scheduleDailyDigests(userId) {
  await setupNotificationsOnce();
  if (!userId) return;

  const slots = [
    { h: 8,  label: 'morning' },
    { h: 13, label: 'noon' },
    { h: 19, label: 'evening' },
  ];

  // 스냅샷 기반 간단 다이제스트 (MVP)
  const tasks = await getUserTasks(userId);
  const digest = pickTodayDigest(tasks);

  const contentBase = (slotLabel) => ({
    title: '체키 코치 리마인더',
    body: digest.coach || '오늘 처리할 할 일이 없어요. 🙌',
    data: {
      kind: 'digest',
      slot: slotLabel,
      message: digest.message,
    },
    sound: 'default',
  });

  for (const s of slots) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: contentBase(s.label),
        trigger: triggerAtToday(s.h),
      });
    } catch (e) {
      console.log('[notify] scheduleDailyDigests error', e);
    }
  }
}

/** 알림 수신 → 채팅에 바로 붙이는 헬퍼 (옵션) */
export function handleIncomingNotificationToChat(notification, appendChat) {
  const data = notification?.request?.content?.data;
  if (data?.kind === 'digest') {
    const msg = data.message || '';
    appendChat?.({
      role: 'assistant',
      type: 'digest',
      text: (msg && `**코치 리마인더**\n${msg}`) || '오늘은 처리할 할 일이 없어요. 🙌',
    });
  }
}

/* ================== 채팅 브릿지: 알림 → 콜백 ================== */
/** 알림을 받거나(포그라운드) 탭해서 열었을 때 콜백 호출.
 * onEvent({ phase: 'received'|'opened', title, body, data, at })
 * 반환값: 구독 해제 함수
 *
 * ✅ 기존 onEvent는 그대로 두고,
 * ✅ (선택) 두 번째 인자로 appendChat을 넘기면, digest는 자동으로 채팅에 붙음
 */
export function subscribeReminderToChat(onEvent, appendChat) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    const { title, body, data } = n.request.content || {};
    const id = n.request.identifier;
    safeUpdateByScheduledId(id, { status: 'delivered', deliveredAt: serverTimestamp() });
    onEvent?.({ phase: 'received', title, body, data, at: new Date().toISOString() });

    // ✅ digest면 채팅에 자동 첨부 (옵션)
    if (data?.kind === 'digest') {
      handleIncomingNotificationToChat(n, appendChat);
    }
  });

  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    const { title, body, data } = r.notification?.request?.content || {};
    const id = r.notification?.request?.identifier;
    safeUpdateByScheduledId(id, { status: 'opened', openedAt: serverTimestamp() });
    onEvent?.({ phase: 'opened', title, body, data, at: new Date().toISOString() });

    // ✅ digest면 채팅에 자동 첨부 (옵션)
    if (data?.kind === 'digest') {
      handleIncomingNotificationToChat(r.notification, appendChat);
    }
  });

  return () => {
    try { sub1.remove(); } catch {}
    try { sub2.remove(); } catch {}
  };
}

/* 디버그용: 즉시 핑 */
export async function pingIn(seconds = 5) {
  await setupNotificationsOnce();
  return Notifications.scheduleNotificationAsync({
    content: { title: '🔔 핑 테스트', body: `${seconds}s 뒤 알림`, data: { kind: 'ping' } },
    trigger: { type: 'timeInterval', seconds, repeats: false },
  });
}

/* -------- 온보딩용 헬퍼 -------- */

// 현재 알림 권한 상태 가져오기
export async function getPushPermissionStatus() {
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted;
}

// 알림 권한 요청 (OnboardingCard에서 호출)
export async function askPushPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return { granted: status === 'granted' };
}
