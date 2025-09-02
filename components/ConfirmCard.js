// components/ConfirmCard.js
import { useState, useMemo } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import dayjs from 'dayjs';

// 🔒 안전한 Date 변환 (Firestore Timestamp/number/string 모두 지원)
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();                // compat Timestamp
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function ConfirmCard({ card, onConfirm, onCancel }) {
  if (!card) return null;

  const hasTasks = Array.isArray(card.tasks) && card.tasks.length > 0;
  const isSchedule = card.type === 'schedule' || !!card.startTime;
  const isTask = card.type === 'task' || hasTasks;
  const isBoth = (card.type || '').toLowerCase() === 'both' || (isSchedule && hasTasks);

  const [checks, setChecks] = useState((card.tasks || []).map(() => true));
  const toggleCheck = (i) => setChecks((prev) => prev.map((c, idx) => (i === idx ? !c : c)));
  const selectedTasks = (card.tasks || []).filter((_, i) => checks[i]);

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

  // 체키(assistant) 버블: 좌상단 r=0, #FAFAFA, 그림자 없음, 너비 고정
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
      }}
    >
      {children}
    </View>
  );

  // 버튼: 취소 < 등록(가로 더 큼), 높이 고정
  const Buttons = () => (
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          height: 48,                  // ★ 높이 고정
          borderRadius: 12,
          backgroundColor: '#EDEDED',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontWeight: '600', color: '#111' }}>취소</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          const extra = isBoth
            ? { mode: 'both', selectedTasks: card.tasks || [] }
            : isSchedule
            ? { mode: 'schedule', selectedTasks: [] }
            : { mode: 'task', selectedTasks };
          onConfirm?.(card, extra);
        }}
        style={{
          flex: 1.4,                   // ★ 등록 가로 더 넓게
          height: 48,                  // ★ 높이 고정
          borderRadius: 12,
          backgroundColor: '#111',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontWeight: '700', color: '#fff' }}>등록</Text>
      </Pressable>
    </View>
  );

  const TitleLine = ({ children }) => (
    <Text style={{ fontSize: 15, marginBottom: 4, color: '#111', flexShrink: 1 }}>
      {children}
    </Text>
  );

  // 일정 카드
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

  // 할 일 카드 — 버블 내부 흰 박스 컨테이너 + 체크
  const TasksBlock = () => (
    <Bubble>
      <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
        오늘의 할 일에 추가할게!
      </Text>
      <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
        예상 소요시간이 짧으면 바로 리마인드도 줄게, 빠르게 끝내보자!
      </Text>

      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#EEE',
          borderRadius: 14,
          padding: 10,
          gap: 10,
        }}
      >
        {hasTasks ? (
          (card.tasks || []).map((t, idx) => (
            <Pressable
              key={`${t?.id || (typeof t === 'string' ? t : t?.title) || idx}`}
              onPress={() => toggleCheck(idx)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E9E9E9',
                gap: 10,
              }}
            >
              {/* 체크박스 */}
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: checks[idx] ? '#111' : '#BDBDBD',
                  backgroundColor: checks[idx] ? '#111' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {checks[idx] && (
                  <View style={{ width: 8, height: 8, backgroundColor: '#fff', borderRadius: 2 }} />
                )}
              </View>

              {/* 제목(문자열/객체 모두 안전 표기) */}
              <Text style={{ fontSize: 15, color: '#111', flexShrink: 1 }}>
                {(typeof t === 'string' ? t : (t?.title ?? ''))
                  .toString()
                  .trim() || '(제목 없음)'}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={{ fontSize: 15, color: '#111', flexShrink: 1 }}>
            {String(card.title ?? '').trim() || '(제목 없음)'}
          </Text>
        )}
      </View>

      <Buttons />
    </Bubble>
  );

  return (
    <View>
      {isSchedule && <ScheduleBlock />}
      {!isBoth && isTask && <TasksBlock />}
    </View>
  );
}
