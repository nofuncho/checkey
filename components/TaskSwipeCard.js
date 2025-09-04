// components/TaskSwipeCard.js
import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import dayjs from 'dayjs';

function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
const fmtDue = (v) => {
  const d = toDateSafe(v);
  return d ? dayjs(d).format('M.D(ddd) A h:mm') : '';
}

function Checkbox({ done, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.checkbox,
        done && styles.checkboxDone,
      ]}
      hitSlop={8}
    >
      {done ? <Text style={styles.checkmark}>✓</Text> : null}
    </Pressable>
  );
}

/**
 * TaskSwipeCard
 * 왼쪽=삭제, 오른쪽=내일하기
 */
function TaskSwipeCard({
  task,
  onToggleDone,
  onSnooze,
  onDelete,
  onPress,
  colors = {},
  showDue = true,
  showEstimate = true,
  style,
  contentStyle,
  showCheckbox = true,
}) {
  const C = {
    bg: '#FFFFFF',
    text: '#111',
    badgeOpenBg: '#f2f4f6',
    badgeDoneBg: '#d1f7c4',
    swipeDeleteBg: '#EB5757', // 왼쪽
    swipeSnoozeBg: '#2F80ED', // 오른쪽
    ...colors,
  };

  // 스와이프 액션들 (래퍼에서 overflow hidden으로 깔끔하게 클립)
  const renderLeft = () => (
    <View style={[styles.actionBox, { backgroundColor: C.swipeDeleteBg, alignItems: 'flex-start' }]}>
      <Text style={styles.actionText}>삭제</Text>
    </View>
  );
  const renderRight = () => (
    <View style={[styles.actionBox, { backgroundColor: C.swipeSnoozeBg, alignItems: 'flex-end' }]}>
      <Text style={styles.actionText}>내일하기</Text>
    </View>
  );

  const handlePress = () => {
    if (onPress) return onPress(task);
    onToggleDone?.(task);
  };

  return (
    // 🔒 바깥 래퍼가 모서리와 마진을 소유 → 액션과 카드가 함께 클립되어 어긋남 방지
    <View style={styles.swipeWrap}>
      <Swipeable
        renderLeftActions={renderLeft}
        renderRightActions={renderRight}
        onSwipeableLeftOpen={() => onDelete?.(task)}
        onSwipeableRightOpen={() => onSnooze?.(task)}
        overshootLeft={false}
        overshootRight={false}
      >
        <Pressable
          onPress={handlePress}
          style={[
            styles.card,
            { backgroundColor: C.bg, opacity: task?.status === 'done' ? 0.55 : 1 },
            style,
          ]}
        >
          <View style={[styles.row, contentStyle]}>
            {showCheckbox ? (
              <Checkbox done={task?.status === 'done'} onPress={() => onToggleDone?.(task)} />
            ) : null}

            <Text
              style={[
                styles.title,
                {
                  color: C.text,
                  textDecorationLine: task?.status === 'done' ? 'line-through' : 'none',
                },
              ]}
              numberOfLines={2}
            >
              {task?.title || '(제목 없음)'}
            </Text>

            <View
              style={[
                styles.badge,
                { backgroundColor: task?.status === 'done' ? C.badgeDoneBg : C.badgeOpenBg },
              ]}
            >
              <Text style={styles.badgeText}>{task?.status === 'done' ? '완료' : '대기'}</Text>
            </View>
          </View>

          {(showDue || showEstimate) && (task?.dueDate || typeof task?.estimatedDurationMinutes === 'number') ? (
            <View style={styles.metaRow}>
              {showDue && task?.dueDate ? (
                <Text style={styles.metaText}>마감: {fmtDue(task?.dueDate)}</Text>
              ) : null}
              {showEstimate && typeof task?.estimatedDurationMinutes === 'number' ? (
                <Text style={styles.metaText}>예상 {task?.estimatedDurationMinutes}분</Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  // 액션/카드 전체를 감싸는 래퍼: 모서리/마진/클리핑 담당
  swipeWrap: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',      // ✅ 스와이프 배경이 삐져나오지 않게
  },
  // 카드 자체는 마진/그림자 없이
  card: {
    borderRadius: 14,
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginLeft: 10 },
  badgeText: { fontSize: 12, color: '#111', fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  metaText: { fontSize: 12, color: '#666' },

  // 스와이프 액션 박스
  actionBox: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '60%',
    height: '100%',
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // 체크박스
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#111',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxDone: {
    backgroundColor: '#B7EFC5',
    borderColor: '#63C174',
  },
  checkmark: {
    color: '#1B5E20',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '800',
  },
});

export default memo(TaskSwipeCard);
