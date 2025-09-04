// app/index.js
import { useEffect, useRef, useState } from 'react';
import { Platform, View, FlatList, KeyboardAvoidingView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useLocalSearchParams } from 'expo-router';

import InputBox from '../components/InputBox';
import MessageBubble from '../components/MessageBubble';
import ConfirmCard from '../components/ConfirmCard';
import OnboardingCard from '../components/OnboardingCard';
import QuickRangeBar from '../components/QuickRangeBar';

import { useAppStore } from '../lib/store';
import AuthGate from '../components/AuthGate';
import { setupNotificationsOnce, subscribeReminderToChat, scheduleDailyDigests } from '../lib/notify';
import { fetchSchedulesRange, getUserTasks } from '../lib/data';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOPBAR_H = 56;

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
  const insetTop = insets.top + TOPBAR_H; // 상단 오버레이 보정
  const listRef = useRef(null);
  const { draft } = useLocalSearchParams();

  // ✅ 하단 입력영역(QuickRangeBar + InputBox) 실제 높이를 측정해 FlatList paddingBottom에 반영
  const [composerH, setComposerH] = useState(84); // 대략값으로 시작, 실제 레이아웃에서 업데이트

  // ====== store 연결
  const messages = useAppStore((s) => s.messages);
  const handleUserInput = useAppStore((s) => s.handleUserInput);
  const confirmSave = useAppStore((s) => s.confirmSave);
  const cancelSave = useAppStore((s) => s.cancelSave);
  const addMessage = useAppStore((s) => s.addMessage);
  const user = useAppStore((s) => s.user);
  const ensureEstimated = useAppStore((s) => s.ensureEstimated);
  const onTaskComplete = useAppStore((s) => s.onTaskComplete);
  const onTaskDelete   = useAppStore((s) => s.onTaskDelete);
  const onTaskSnooze   = useAppStore((s) => s.onTaskSnooze);

  // 앱 시작 세팅
  useEffect(() => {
    ensurePushPermission();
    setupNotificationsOnce();
  }, []);

  // 로그인 직후 1회: 추정치 보정 + 다이제스트 예약
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

  // 스크롤 끝으로 유지
  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
  }, [messages.length]);

  // 빠른 기간 버튼 핸들러 (원본 유지)
  const handleQuickPick = async (phrase) => {
    const ts = Date.now();
    addMessage({ id: String(ts), role: 'user', text: phrase, ts });

    try {
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

      if (user?.userId && range.start && range.end) {
        const [items, allTasks] = await Promise.all([
          fetchSchedulesRange(user.userId, range.start, range.end),
          getUserTasks(user.userId),
        ]);

        const sMs = range.start.getTime();
        const eMs = range.end.getTime();
        const tasksInRange = (allTasks || []).filter((t) => {
          const tsd = t?.dueDate?.toMillis?.()
            ?? (t?.dueDate instanceof Date ? t.dueDate.getTime()
            : t?.dueDate ? new Date(t.dueDate).getTime() : null);
          if (tsd == null) return /오늘/.test(range.label || '');
          return tsd >= sMs && tsd <= eMs;
        }).map((t) => ({
          taskId: t.taskId || t.id,
          id: t.id,
          title: t.title,
          completed: !!t.completed,
          estimatedDurationMinutes: t.estimatedDurationMinutes,
          dueDate: t.dueDate,
        }));

        addMessage({
          id: String(ts + 1),
          role: 'assistant',
          type: 'schedule_summary',
          card: {
            title: range.label,
            items,
            tasks: tasksInRange,
            range: {
              label: range.label,
              start: range.start.toISOString(),
              end: range.end.toISOString(),
            },
          },
          ts: ts + 1,
        });
      } else {
        addMessage({
          id: String(ts + 3),
          role: 'assistant',
          text: '로그인이 안 되어 있거나 기간을 계산하지 못했어.',
          ts: ts + 3,
        });
      }
    } catch (err) {
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

  return (
    <AuthGate>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={{ flex: 1 }}>
          {/* 대화 리스트 */}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              if (item?.kind === 'confirmCard') {
                return (
                  <ConfirmCard
                    messageId={item.id}
                    card={item.card}
                    onConfirm={(_, extra) => confirmSave(item.id, extra)}
                    onCancel={() => cancelSave(item.id)}
                    onTaskComplete={onTaskComplete}
                    onTaskDelete={onTaskDelete}
                    onTaskSnooze={onTaskSnooze}
                  />
                );
              }
              return <MessageBubble item={item} />;
            }}
            ListHeaderComponent={<OnboardingCard />}
            // iOS 상단 오버레이 보정
            contentInset={Platform.OS === 'ios' ? { top: insetTop } : undefined}
            contentOffset={Platform.OS === 'ios' ? { y: -insetTop, x: 0 } : undefined}
            scrollIndicatorInsets={{ top: insetTop }}
            contentContainerStyle={{
              paddingTop: 8,
              paddingHorizontal: 12,
              // ✅ 입력영역 실제 높이만큼만 하단 여백 (KAV와 중복 방지)
              paddingBottom: composerH + 8,
              ...(Platform.OS === 'android' ? { paddingTop: 8 + insetTop } : null),
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
            onLayout={() => listRef.current?.scrollToEnd?.({ animated: false })}
          />

          {/* ✅ 하단 입력영역만 KeyboardAvoidingView로 감싼다 */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0} // 하단만 움직이므로 추가 오프셋 불필요
          >
            <View
              onLayout={(e) => setComposerH(Math.ceil(e.nativeEvent.layout.height))}
              style={{
                backgroundColor: '#fff',
                paddingHorizontal: 8,
                paddingTop: 4,
                // ✅ 홈 인디케이터 안전영역만 적용 (키보드 뜰 때는 KAV가 처리)
                paddingBottom: insets.bottom > 0 ? Math.max(insets.bottom - 4, 0) : 0,
              }}
            >
              <QuickRangeBar onPick={handleQuickPick} />
              <InputBox
                onSend={handleUserInput}
                initialValue={typeof draft === 'string' ? draft : ''}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </AuthGate>
  );
}
