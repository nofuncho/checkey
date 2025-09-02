// app/index.js
import { useEffect, useRef } from 'react';
import { Platform, View, FlatList, SafeAreaView, KeyboardAvoidingView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

import InputBox from '../components/InputBox';
import MessageBubble from '../components/MessageBubble';
import ConfirmCard from '../components/ConfirmCard';
import OnboardingCard from '../components/OnboardingCard';
import QuickRangeBar from '../components/QuickRangeBar';

import { useAppStore } from '../lib/store';
import AuthGate from '../components/AuthGate';
import { setupNotificationsOnce, subscribeReminderToChat, scheduleDailyDigests } from '../lib/notify';
import { fetchSchedulesRange } from '../lib/data';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOPBAR_H = 56; // _layout.js의 TopBar 높이와 일치시켜 주세요.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensurePushPermission() {
  if (!Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') await Notifications.requestPermissionsAsync();
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);

  const messages = useAppStore((s) => s.messages);
  const handleUserInput = useAppStore((s) => s.handleUserInput);
  const confirmSave = useAppStore((s) => s.confirmSave);
  const cancelSave = useAppStore((s) => s.cancelSave);
  const addMessage = useAppStore((s) => s.addMessage);
  const user = useAppStore((s) => s.user);
  const ensureEstimated = useAppStore((s) => s.ensureEstimated);

  // 앱 시작 시 권한/채널 세팅
  useEffect(() => {
    ensurePushPermission();
    setupNotificationsOnce();
  }, []);

  // 로그인 직후 1회: 과거 Task 추정치 보정 + 하루 3번 다이제스트 예약
  useEffect(() => {
    if (user?.userId) {
      ensureEstimated?.();
      scheduleDailyDigests(user.userId);
    }
  }, [user?.userId]);

  // 알림 → 채팅 반영
  useEffect(() => {
    const unsubscribe = subscribeReminderToChat((evt) => {
      const d = evt?.data || {};
      const ts = Date.now();

      if (d.kind === 'digest') {
        const digestText =
          (d.message && `**코치 리마인더**\n${d.message}`) ||
          '오늘은 처리할 할 일이 없어요. 🙌';
        addMessage({ id: String(ts), role: 'assistant', type: 'digest', text: digestText, ts });
      } else if (d.kind === 'schedule') {
        addMessage({
          id: String(ts + 1),
          role: 'assistant',
          text: `⏰ 리마인더: '${d.title || '일정'}' — ${d.remindMinutes ?? ''}분 전 알림이에요.`,
          ts,
        });
      } else if (d.kind === 'task') {
        addMessage({
          id: String(ts + 2),
          role: 'assistant',
          text: `📝 마감 임박: '${d.title || '할 일'}' — ${d.remindMinutes ?? ''}분 남았어요.`,
          ts,
        });
      } else {
        const title = evt?.title ?? '알림';
        const body = evt?.body ?? '';
        addMessage({ id: String(ts + 3), role: 'assistant', text: `🔔 ${title}${body ? `: ${body}` : ''}`, ts });
      }

      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    });

    return () => unsubscribe?.();
  }, [addMessage]);

  // ✅ 빠른 기간 버튼 핸들러 (로그 + 빈 결과 처리 포함)
  const handleQuickPick = async (phrase) => {
    const ts = Date.now();
    addMessage({ id: String(ts), role: 'user', text: phrase, ts });

    try {
      // 1) 기간 계산
      const now = new Date();
      let range = { label: '', start: null, end: null };

      if (/오늘/.test(phrase)) {
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now);   end.setHours(23,59,59,999);
        range = { label: '오늘 스케줄', start, end };
      } else if (/이번 주/.test(phrase)) {
        const d = new Date(now);
        const day = d.getDay() || 7;
        const start = new Date(d); start.setDate(d.getDate() - (day - 1)); start.setHours(0,0,0,0);
        const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
        range = { label: '이번 주 스케줄', start, end };
      } else if (/다음 주/.test(phrase)) {
        const d = new Date(now);
        const day = d.getDay() || 7;
        const start = new Date(d); start.setDate(d.getDate() - (day - 1) + 7); start.setHours(0,0,0,0);
        const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
        range = { label: '다음 주 스케줄', start, end };
      } else if (/이번 달/.test(phrase)) {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
        const end   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
        range = { label: '이번 달 스케줄', start, end };
      } else if (/다음 달/.test(phrase)) {
        const start = new Date(now.getFullYear(), now.getMonth()+1, 1, 0,0,0,0);
        const end   = new Date(now.getFullYear(), now.getMonth()+2, 0, 23,59,59,999);
        range = { label: '다음 달 스케줄', start, end };
      }

      // 2) 디버그 로그
      console.log('[QuickPick] phrase=', phrase);
      console.log('[QuickPick] userId=', user?.userId);
      console.log('[QuickPick] range=', {
        label: range.label,
        start: range.start?.toISOString?.(),
        end: range.end?.toISOString?.(),
      });

      // 3) Firestore에서 스케줄 가져오기
      if (user?.userId && range.start && range.end) {
        const items = await fetchSchedulesRange(user.userId, range.start, range.end);
        console.log('[QuickPick] fetched items=', items?.length, items);

        if (Array.isArray(items) && items.length > 0) {
          addMessage({
            id: String(ts + 1),
            role: 'assistant',
            type: 'schedule_summary',
            card: { title: range.label, items },
            ts: ts + 1,
          });
        } else {
          // 빈 결과 안내
          addMessage({
            id: String(ts + 2),
            role: 'assistant',
            text: `${range.label}은(는) 등록된 일정이 없어요. 🙌`,
            ts: ts + 2,
          });
        }
      } else {
        addMessage({
          id: String(ts + 3),
          role: 'assistant',
          text: '로그인이 안 되어 있거나 기간을 계산하지 못했어.',
          ts: ts + 3,
        });
      }
    } catch (err) {
      console.log('[QuickPick] error', err?.message || err);
      addMessage({
        id: String(ts + 99),
        role: 'assistant',
        text: '스케줄을 불러오는 중 오류가 발생했어. 잠시 후 다시 시도해줘.',
        ts: ts + 99,
      });
    } finally {
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    }
  };

  // 스크롤 끝으로 유지
  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
  }, [messages.length]);

  return (
    <AuthGate>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          // TopBar는 SafeArea까지 포함되어 있으니 TopBar 높이만 보정
          keyboardVerticalOffset={insets.top + TOPBAR_H}
        >
          <View style={{ flex: 1 }}>
            {/* 대화 리스트 */}
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                item?.kind === 'confirmCard' ? (
                  <ConfirmCard
                    card={item.card}
                    onConfirm={(_, extra) => confirmSave(item.id, extra)}
                    onCancel={() => cancelSave(item.id)}
                  />
                ) : (
                  <MessageBubble item={item} />
                )
              )} // ✅ 인라인으로 변경: renderItem 변수 의존 제거
              ListHeaderComponent={<OnboardingCard />}
              contentContainerStyle={{
                paddingTop: 8,
                paddingHorizontal: 12,
                paddingBottom: 4,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
              onLayout={() => listRef.current?.scrollToEnd?.({ animated: false })}
            />

            {/* 하단 입력영역 */}
            <View
              style={{
                backgroundColor: '#fff',
                paddingHorizontal: 8,
                paddingTop: 4,
                paddingBottom: insets.bottom > 0 ? Math.max(insets.bottom - 4, 0) : 0,
              }}
            >
              {/* 입력박스 위에 빠른 기간 버튼바 */}
              <QuickRangeBar onPick={handleQuickPick} />

              <InputBox onSend={handleUserInput} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuthGate>
  );
}
