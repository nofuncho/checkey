// components/ScheduleSummaryCard.js
import { useState, useMemo } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import dayjs from 'dayjs';

function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();                // Firestore Timestamp(compat)
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
const fmtTime = (v) => {
  const d = toDateSafe(v);
  return d ? dayjs(d).format('A h:mm') : '';
};

// ✅ 날짜 라벨 (오늘/내일/그 외 M.D (ddd))
const fmtDateLabel = (d) => {
  const day = dayjs(d);
  if (day.isSame(dayjs(), 'day')) return '오늘';
  if (day.isSame(dayjs().add(1, 'day'), 'day')) return '내일';
  return day.format('M.D (ddd)');
};

// 🔒 문자열/객체 섞여 들어오는 tasks 표준화
function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((t) => {
    if (typeof t === 'string') return { title: t.trim() || '(제목 없음)' };
    const title = (t?.title ?? '').toString().trim();
    return { ...t, title: title || '(제목 없음)' };
  });
}

// ✅ 항상 고유 key 보장
function getTaskKey(task, index) {
  const id = task?.taskId || task?.id;
  if (id) return `t:${String(id)}`;
  const title =
    (typeof task === 'string' ? task : (task?.title ?? '')).toString().trim() || '(untitled)';
  return `t:${title}:${index}`;
}

// ✅ 체크박스
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
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 12 }}>✓</Text>
    ) : null}
  </View>
);

export default function ScheduleSummaryCard({
  title,
  items = [],
  tasks = [],
  messageId,
  onTaskComplete,
  onTaskDelete,
  onTaskSnooze,
  onRefreshTasks,
}) {
  const normTasks = normalizeTasks(tasks);
  const [checks, setChecks] = useState(normTasks.map(() => false));
  const { width: W } = Dimensions.get('window');
  const bubbleWidth = useMemo(() => Math.min(250, W - 12 - 12 - 8), [W]);
  const [disabledMap, setDisabledMap] = useState({});

  // ===== 일정: 날짜별 그룹핑
  const groupedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const da = toDateSafe(a?.startTime)?.getTime() ?? 0;
      const db = toDateSafe(b?.startTime)?.getTime() ?? 0;
      return da - db;
    });
    const groups = {};
    sorted.forEach((it) => {
      const d = toDateSafe(it?.startTime);
      if (!d) return;
      const key = fmtDateLabel(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    });
    return Object.entries(groups).map(([date, list]) => ({ date, list }));
  }, [items]);

  // ===== 스와이프 액션
  const ACTION_W = 104;
  const LeftAction = () => (
    <View style={{ width: ACTION_W, justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: 16, backgroundColor: '#ef4444', height: '100%', borderRadius: 12 }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>삭제</Text>
    </View>
  );
  const RightAction = () => (
    <View style={{ width: ACTION_W, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16, backgroundColor: '#3b82f6', height: '100%', borderRadius: 12 }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>내일하기</Text>
    </View>
  );

  // ===== TaskRow
  const TaskRow = ({ task, index }) => {
    let swipeRef = null;
    const rowKey = getTaskKey(task, index);
    const disabledInfo = disabledMap[rowKey];
    const titleTxt =
      (typeof task === 'string' ? task : (task?.title ?? '')).toString().trim() || '(제목 없음)';
    const completed = !!task?.completed;
    const est = Number.isFinite(task?.estimatedDurationMinutes) ? task.estimatedDurationMinutes : 5;

    if (disabledInfo) {
      return (
        <View style={{ marginTop: 8, backgroundColor: '#F3F4F6', borderRadius: 12, padding: 10, opacity: 0.8 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#9ca3af' }}>{titleTxt}</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            {disabledInfo.reason === 'deleted' ? '삭제됨' : '내일로 미뤄짐'}
          </Text>
        </View>
      );
    }

    return (
      <View style={{ marginTop: 8 }}>
        <Swipeable
          ref={(ref) => (swipeRef = ref)}
          renderLeftActions={LeftAction}
          renderRightActions={RightAction}
          leftThreshold={40}
          rightThreshold={40}
          friction={1.5}
          overshootLeft={false}
          overshootRight={false}
          onSwipeableLeftOpen={() => {
            setDisabledMap((prev) => ({ ...prev, [rowKey]: { reason: 'deleted' } }));
            requestAnimationFrame(() => swipeRef?.close?.());
            onTaskDelete?.(task, messageId, { quiet: true });
            onRefreshTasks?.();
          }}
          onSwipeableRightOpen={() => {
            setDisabledMap((prev) => ({ ...prev, [rowKey]: { reason: 'snoozed' } }));
            requestAnimationFrame(() => swipeRef?.close?.());
            onTaskSnooze?.(task, messageId, { quiet: true });
            onRefreshTasks?.();
          }}
        >
          <Pressable
            onPress={() => {
              setChecks((prev) => prev.map((c, i) => (i === index ? !c : c)));
              onTaskComplete?.(task, messageId, { quiet: true });
              onRefreshTasks?.();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#EEE' }}
          >
            <Checkbox checked={checks[index] || completed} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '600', color: (checks[index] || completed) ? '#9ca3af' : '#111827', textDecorationLine: (checks[index] || completed) ? 'line-through' : 'none' }}>
                {titleTxt}
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>⏱ {est}분 소요 예정</Text>
            </View>
          </Pressable>
        </Swipeable>
      </View>
    );
  };

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        marginLeft: 12,
        marginVertical: 6,
        width: bubbleWidth,
        padding: 16,
        backgroundColor: '#FAFAFA',
        borderRadius: 16,
        borderTopLeftRadius: 0,
        overflow: 'visible',
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 8, color: '#111' }}>
        {title || '스케줄/할 일'}
      </Text>

      {/* 일정 리스트 (날짜별 그룹핑) */}
      {groupedItems.map((group, gIdx) => (
        <View key={group.date} style={{ marginTop: gIdx === 0 ? 0 : 16 }}>
          {/* 👉 날짜 라벨: 왼쪽 정렬 + 크게/굵게 */}
          <Text
            style={{
              fontSize: 17,
              fontWeight: '700',
              color: '#111',
              marginBottom: 8,
              marginLeft: 2,
            }}
          >
            {group.date}
          </Text>

          {group.list.map((it, idx) => (
            <View
              key={String(it?.scheduleId ?? idx)}
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#EEE',
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginTop: idx === 0 ? 0 : 8,
              }}
            >
              <Text style={{ fontSize: 15, color: '#111', marginBottom: 4 }}>
                {String(it?.title ?? '').trim() || '(제목 없음)'}
              </Text>
              <Text style={{ fontSize: 13, color: '#666' }}>{fmtTime(it?.startTime)}</Text>
            </View>
          ))}
        </View>
      ))}

      {/* 할 일 리스트 */}
      {normTasks.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 6, color: '#111' }}>할 일</Text>
          {normTasks.map((t, idx) => (
            <TaskRow key={getTaskKey(t, idx)} task={t} index={idx} />
          ))}
        </View>
      )}

      {items.length === 0 && normTasks.length === 0 && (
        <Text style={{ fontSize: 14, color: '#666' }}>표시할 일정/할 일이 없어요. 🙌</Text>
      )}
    </View>
  );
}
