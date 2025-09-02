// lib/calendar.js
import * as Calendar from 'expo-calendar';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
// import { Platform } from 'react-native'; // 필요 없으면 주석
import { db, auth, serverTimestamp } from './firebase';

/* =========================
 *  Device (기기) 캘린더 연동
 * ========================= */

export async function ensureDeviceCalendarPerms() {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status !== 'granted') {
    const { status: s2 } = await Calendar.requestCalendarPermissionsAsync();
    if (s2 !== 'granted') return false;
  }
  return true;
}

export async function listWritableCalendars() {
  const ok = await ensureDeviceCalendarPerms();
  if (!ok) return [];
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return cals.filter((c) => c.allowsModifications);
}

async function getDefaultDeviceCalendarId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const doc = await db.collection('users').doc(uid).get();
  return doc.data()?.defaultDeviceCalendarId || null;
}

// 간단 정책: 첫 번째 수정가능 캘린더를 기본으로 저장
export async function setDefaultDeviceCalendarIfEmpty() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const existing = snap.data()?.defaultDeviceCalendarId || null;
  if (existing) return existing;

  const writable = await listWritableCalendars();
  const picked = writable?.[0]?.id || null;
  if (picked) {
    await ref.set(
      { defaultDeviceCalendarId: picked, calendarLinkedAt: serverTimestamp() },
      { merge: true }
    );
  }
  return picked;
}

export async function saveScheduleToDeviceCalendar({ title, startTimeISO, durationMinutes = 60 }) {
  const ok = await ensureDeviceCalendarPerms();
  if (!ok || !startTimeISO) return null;
  const calId = (await getDefaultDeviceCalendarId()) || (await setDefaultDeviceCalendarIfEmpty());
  if (!calId) return null;

  const startDate = new Date(startTimeISO);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

  try {
    const eventId = await Calendar.createEventAsync(calId, {
      title: title || '일정',
      startDate,
      endDate,
      notes: '체키에서 생성됨',
      timeZone: undefined, // 기기 기본
    });
    return eventId;
  } catch (e) {
    console.warn('[calendar] save schedule error', e?.message || e);
    return null;
  }
}

export async function saveTaskToDeviceCalendar({ title, dueDateISO, blockMinutes = 30 }) {
  const ok = await ensureDeviceCalendarPerms();
  if (!ok || !dueDateISO) return null;
  const calId = (await getDefaultDeviceCalendarId()) || (await setDefaultDeviceCalendarIfEmpty());
  if (!calId) return null;

  const startDate = new Date(dueDateISO);
  const endDate = new Date(startDate.getTime() + blockMinutes * 60000);

  try {
    const eventId = await Calendar.createEventAsync(calId, {
      title: title || '할 일',
      startDate,
      endDate,
      notes: '체키 할 일(마감)을 캘린더 블록으로 표시',
    });
    return eventId;
  } catch (e) {
    console.warn('[calendar] save task error', e?.message || e);
    return null;
  }
}

// 온보딩 카드에서: 권한 요청 + 기본 캘린더 지정
export async function connectDeviceCalendarsOnce() {
  const ok = await ensureDeviceCalendarPerms();
  if (!ok) return { ok: false, reason: 'perm_denied' };
  const id = await setDefaultDeviceCalendarIfEmpty();
  return { ok: !!id, calendarId: id };
}

/* =========================
 *  Google Calendar OAuth (MVP: 임시 비활성화)
 * ========================= */

// 배포 준비 전까지는 OAuth 버튼을 잠시 비활성화
export const GOOGLE_OAUTH_ENABLED = false;

// 중복 선언 방지: signIn 함수는 단 하나만! (임시 스텁)
export async function googleCalendarSignInAsync() {
  // 나중에 Dev Build에서 네이티브 클라이언트로 재활성화 예정
  return { ok: false, reason: 'disabled_for_mvp' };
}

// 토큰이 이미 저장돼 있을 수 있으니 유틸은 유지
async function getGoogleAccessToken() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  return snap.data()?.googleCalendar?.accessToken || null;
}

// Google Calendar API로 이벤트 생성 (토큰이 있을 때만 사용 가능)
export async function gcalInsertEvent({ title, startTimeISO, endTimeISO }) {
  const token = await getGoogleAccessToken();
  if (!token) return { ok: false, reason: 'no_token' };

  const body = {
    summary: title || '체키 이벤트',
    start: { dateTime: startTimeISO },
    end: {
      dateTime:
        endTimeISO || new Date(new Date(startTimeISO).getTime() + 3600000).toISOString(),
    },
  };

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn('[gcal] insert error', t);
      return { ok: false };
    }
    const json = await res.json();
    return { ok: true, eventId: json.id };
  } catch (e) {
    console.warn('[gcal] fetch error', e?.message || e);
    return { ok: false };
  }
}

/* =========================
 *  Silent Sync (묻지말고 반영)
 * ========================= */

export async function ensureDeviceCalendarReadySilently() {
  try {
    const perm = await Calendar.getCalendarPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Calendar.requestCalendarPermissionsAsync();
      if (req.status !== 'granted') return { ok: false, reason: 'perm_denied' };
    }

    const uid = auth.currentUser?.uid;
    if (!uid) return { ok: false, reason: 'no_uid' };

    let calId = await getDefaultDeviceCalendarId();
    if (!calId) {
      const all = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = all.filter((c) => c.allowsModifications);
      calId = writable?.[0]?.id || null;
      if (calId) {
        await db.collection('users').doc(uid).set(
          { defaultDeviceCalendarId: calId, calendarLinkedAt: serverTimestamp() },
          { merge: true }
        );
      }
    }
    return { ok: !!calId, calendarId: calId || null };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

export async function addScheduleToDeviceIfReady({ title, startTimeISO, durationMinutes = 60 }) {
  const ready = await ensureDeviceCalendarReadySilently();
  if (!ready.ok || !ready.calendarId || !startTimeISO) return null;

  const startDate = new Date(startTimeISO);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  try {
    return await Calendar.createEventAsync(ready.calendarId, {
      title: title || '일정',
      startDate,
      endDate,
      notes: '체키에서 생성됨',
    });
  } catch {
    return null;
  }
}

export async function addTaskToDeviceIfReady({ title, dueDateISO, blockMinutes = 30 }) {
  const ready = await ensureDeviceCalendarReadySilently();
  if (!ready.ok || !ready.calendarId || !dueDateISO) return null;

  const startDate = new Date(dueDateISO);
  const endDate = new Date(startDate.getTime() + blockMinutes * 60000);
  try {
    return await Calendar.createEventAsync(ready.calendarId, {
      title: title || '할 일',
      startDate,
      endDate,
      notes: '체키 할 일(마감)을 캘린더 블록으로 표시',
    });
  } catch {
    return null;
  }
}
