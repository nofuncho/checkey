// components/ConfirmCard.js
import { useMemo, useState } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import dayjs from 'dayjs';
import { Swipeable } from 'react-native-gesture-handler';

// 🔒 안전한 Date 변환 (Firestore Timestamp/number/string 모두 지원)
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();                // compat Timestamp
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ✅ 항상 고유 key 보장
function getTaskKey(task, index) {
  const id = task?.taskId || task?.id;
  if (id) return `t:${String(id)}`;
  const title =
    (typeof task === 'string' ? task : (task?.title ?? '')).toString().trim() || '(untitled)';
  return `t:${title}:${index}`;
}

export default function ConfirmCard({
  card,
  onConfirm,
  onCancel,
  messageId,       // 이 카드 메시지 id (있으면 콜백에 전달)
  // ✅ Task용 콜백 (부모에서 주입)
  onTaskComplete,  // (taskObj, cardMessageId?) => void  // 탭 시 완료 토글
  onTaskDelete,    // (taskObj, cardMessageId?) => void  // 왼쪽 스와이프
  onTaskSnooze,    // (taskObj, cardMessageId?) => void  // 오른쪽 스와이프(내일로)
}) {
  if (!card) return null;

  const hasTasks = Array.isArray(card.tasks) && card.tasks.length > 0;
  const isSchedule = card.type === 'schedule' || !!card.startTime;
  const isTask = card.type === 'task' || hasTasks;
  const isBoth = (card.type || '').toLowerCase() === 'both' || (isSchedule && hasTasks);

  // ===== 고정 너비 계산 =====
  const { width: SCREEN_W } = Dimensions.get('window');
  const LEFT_MARGIN = 12;      // 채팅 여백
  const RIGHT_GUTTER = 12;     // 오른쪽 여백
  const SAFE_PADDING = 8;      // 시스템 스크롤 여유
  const MAX_BUBBLE = 250;      // 최대 버블 너비(px)
  const bubbleWidth = useMemo(
    () => Math.min(MAX_BUBBLE, SCREEN_W - LEFT_MARGIN - RIGHT_GUTTER - SAFE_PADDING),
    [SCREEN_W]
  );

  // ✅ 로컬 비활성 상태 저장: { [rowKey]: { reason: 'deleted'|'snoozed' } }
  const [disabledMap, setDisabledMap] = useState({});

  // ✅ '등록' 중복 탭 방지 플래그
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 체키(assistant) 버블: 좌상단 r=0, #FAFAFA, 너비 고정
  const Bubble = ({ children }) => (
    <View
      style={{
        alignSelf: 'flex-start',
        marginLeft: LEFT_MARGIN,
        marginVertical: 6,
        width: bubbleWidth,            // ★ 고정 너비
        padding: 16,
        backgroundColor: '#FAFAFA',
        borderRadius: 16,
        borderTopLeftRadius: 0,
        overflow: 'visible',
      }}
    >
      {children}
    </View>
  );

  // 버튼: 취소 < 등록(가로 더 큼), 높이 고정 — ❗일정 카드에서만 사용
  const Buttons = () => (
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
      <Pressable
        onPress={onCancel}
        disabled={isSubmitting} // 등록 진행 중엔 취소도 잠깐 막아 깔끔하게 처리
        style={{
          flex: 1,
          height: 48,
          borderRadius: 12,
          backgroundColor: '#EDEDED',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isSubmitting ? 0.6 : 1,
        }}
        accessibilityState={{ disabled: isSubmitting }}
        accessibilityLabel="취소"
      >
        <Text style={{ fontWeight: '600', color: '#111' }}>취소</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          if (isSubmitting) return; // 🔒 이중 탭 방지
          setIsSubmitting(true);
          const extra = isBoth
            ? { mode: 'both', selectedTasks: card.tasks || [] }
            : isSchedule
            ? { mode: 'schedule', selectedTasks: [] }
            : { mode: 'task', selectedTasks: [] };
          // 부모에서 저장/동기화 후 카드가 사라질 것으로 가정
          // (안 사라지는 경우에도 중복 저장 방지를 위해 버튼은 잠금 유지)
          onConfirm?.(card, extra);
        }}
        disabled={isSubmitting}
        style={{
          flex: 1.4,
          height: 48,
          borderRadius: 12,
          backgroundColor: '#111',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isSubmitting ? 0.6 : 1,
        }}
        accessibilityState={{ disabled: isSubmitting }}
        accessibilityLabel="등록"
      >
        <Text style={{ fontWeight: '700', color: '#fff' }}>
          {isSubmitting ? '등록 완료' : '등록'}
        </Text>
      </Pressable>
    </View>
  );

  const TitleLine = ({ children }) => (
    <Text style={{ fontSize: 15, marginBottom: 4, color: '#111', flexShrink: 1 }}>
      {children}
    </Text>
  );

  // ===== 일정 카드
  const ScheduleBlock = () => {
    const dt = toDateSafe(card.startTime);
    return (
      <Bubble>
        <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
          일정으로 등록할게!
        </Text>

        <TitleLine>{String(card.title ?? '').trim() || '(제목 없음)'}</TitleLine>

        {dt && (
          <Text style={{ fontSize: 14, color: '#333' }}>
            {dayjs(dt).format('YYYY.M.D A h:mm')}
          </Text>
        )}

        <Text style={{ fontSize: 13, color: '#666', marginTop: 10 }}>
          {isBoth
            ? `등록하면 할 일 ${Array.isArray(card.tasks) ? card.tasks.length : 0}개도 같이 추가할게`
            : '시작 전에 리마인드 남겨줄게'}
        </Text>

        <Buttons />
      </Bubble>
    );
  };

  // ===== 체크박스 (미체크: 검정 테두리, 체크: 초록 배경+테두리+흰 체크)
  const Checkbox = ({ checked }) => (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: checked ? '#22c55e' : '#111',
        backgroundColor: checked ? '#22c55e' : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        marginTop: 1,
        marginLeft: 6,
      }}
    >
      {checked ? (
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 12 }}>
          ✓
        </Text>
      ) : null}
    </View>
  );

  // ===== 스와이프 액션 (폭 고정)
  const ACTION_W = 104;
  const LeftAction = () => (
    <View
      style={{
        width: ACTION_W,
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        backgroundColor: '#ef4444',
        height: '100%',
        borderRadius: 12,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>삭제</Text>
    </View>
  );
  const RightAction = () => (
    <View
      style={{
        width: ACTION_W,
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        backgroundColor: '#3b82f6',
        height: '100%',
        borderRadius: 12,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>내일하기</Text>
    </View>
  );

  // ===== 비활성(잠금) 행
  const DisabledRow = ({ title, reason }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: '#F3F4F6',
        opacity: 0.9,
        borderRadius: 12,
      }}
      pointerEvents="none"
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 5,
          borderWidth: 2,
          borderColor: '#D1D5DB',
          backgroundColor: '#E5E7EB',
          marginRight: 10,
          marginLeft: 6,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15.5, fontWeight: '600', color: '#9ca3af' }} numberOfLines={2}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
          {reason === 'deleted' ? '삭제됨' : '내일로 미뤄짐'}
        </Text>
      </View>
    </View>
  );

  // ===== 개별 Task Row (스와이프/탭)
  const TaskRow = ({ task, index, total }) => {
    let swipeRef = null;

    const rowKey = getTaskKey(task, index);
    const disabledInfo = disabledMap[rowKey];

    // task 객체 정규화
    const title =
      (typeof task === 'string' ? task : (task?.title ?? '')).toString().trim() || '(제목 없음)';
    const completed = !!task?.completed;
    const est = Number.isFinite(task?.estimatedDurationMinutes)
      ? task.estimatedDurationMinutes
      : 5;

    if (disabledInfo) {
      return <DisabledRow title={title} reason={disabledInfo.reason} />;
    }

    return (
      <Swipeable
        key={rowKey}
        ref={(ref) => (swipeRef = ref)}
        renderLeftActions={LeftAction}
        renderRightActions={RightAction}
        // ✅ 더 부드럽게: threshold 낮춤 + friction 완화
        leftThreshold={40}
        rightThreshold={40}
        friction={1.5}
        overshootFriction={6}
        overshootLeft={false}
        overshootRight={false}
        containerStyle={{ overflow: 'visible' }}
        // ✅ 방향별 콜백: 열리는 즉시 잠금 전환 + 다음 프레임에 close()
        onSwipeableLeftOpen={() => {
          setDisabledMap((prev) => ({ ...prev, [rowKey]: { reason: 'deleted' } }));
          requestAnimationFrame(() => swipeRef?.close?.());
          onTaskDelete?.(task, messageId);
        }}
        onSwipeableRightOpen={() => {
          setDisabledMap((prev) => ({ ...prev, [rowKey]: { reason: 'snoozed' } }));
          requestAnimationFrame(() => swipeRef?.close?.());
          onTaskSnooze?.(task, messageId);
        }}
      >
        <Pressable
          onPress={() => {
            onTaskComplete?.(task, messageId);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 10,
            paddingHorizontal: 12,     // ✅ 왼쪽 패딩 살짝 증가
            borderBottomWidth: index < total - 1 ? 0.5 : 0,
            borderColor: '#e5e7eb',
            backgroundColor: '#fff',
            borderRadius: 12,
          }}
        >
          <Checkbox checked={completed} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15.5,
                fontWeight: '600',
                color: completed ? '#9ca3af' : '#111827',
                textDecorationLine: completed ? 'line-through' : 'none',
              }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {/* ⏱ XX분 소요 예정 (due 표시 제거) */}
            <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              ⏱ {est}분 소요 예정
            </Text>
          </View>
        </Pressable>
      </Swipeable>
    );
  };

  // ===== 할 일 카드 — 스와이프/탭 (버튼 없음)
  const TasksBlock = () => {
    const tasks = hasTasks ? card.tasks : (card.title ? [{ title: card.title }] : []);

    return (
      <Bubble>
        <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
          오늘의 할 일에 추가할게!
        </Text>
        <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          짧은 일부터 하나씩 끝내보자. 스와이프/탭으로 관리할 수 있어.
        </Text>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#EEE',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          {tasks.length > 0 ? (
            tasks.map((t, i) => (
              <TaskRow
                key={getTaskKey(t, i)}
                task={t}
                index={i}
                total={tasks.length}
              />
            ))
          ) : (
            <View style={{ padding: 12 }}>
              <Text style={{ fontSize: 15, color: '#111' }}>(할 일 없음)</Text>
            </View>
          )}
        </View>
        {/* ✅ 버튼 제거 (Task 카드) */}
      </Bubble>
    );
  };

  return (
    <View>
      {isSchedule && <ScheduleBlock />}
      {!isBoth && isTask && <TasksBlock />}
    </View>
  );
}
