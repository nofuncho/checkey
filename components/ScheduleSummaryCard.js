// components/ScheduleSummaryCard.js
import { useState, useMemo } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import dayjs from 'dayjs';

function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();                // Firestore Timestamp(compat)
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
const fmt = (v) => {
  const d = toDateSafe(v);
  return d ? dayjs(d).format('YYYY.M.D A h:mm') : 'Invalid Date';
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

export default function ScheduleSummaryCard({ title, items = [], tasks = [] }) {
  const normTasks = normalizeTasks(tasks);
  const [checks, setChecks] = useState(normTasks.map(() => true));
  const toggle = (i) => setChecks((prev) => prev.map((c, idx) => (idx === i ? !c : c)));

  // ✅ ConfirmCard와 동일한 고정 너비/여백
  const { width: W } = Dimensions.get('window');
  const bubbleWidth = useMemo(
    () => Math.min(250, W - 12 - 12 - 8), // MAX=250, L=12, R=12, safe=8
    [W]
  );

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
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 8, color: '#111' }}>
        {title || '스케줄/할 일'}
      </Text>

      {/* 일정 리스트 */}
      {(items || []).map((it, idx) => (
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
          <Text style={{ fontSize: 15, color: '#111', marginBottom: 6 }}>
            {String(it?.title ?? '').trim() || '(제목 없음)'}
          </Text>
          <Text style={{ fontSize: 13, color: '#666' }}>{fmt(it?.startTime)}</Text>
        </View>
      ))}

      {/* 할 일 리스트 (체크 토글) */}
      {normTasks.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 6, color: '#111' }}>
            할 일
          </Text>
          {normTasks.map((t, idx) => {
            const checked = checks[idx];
            return (
              <Pressable
                key={`${t?.id ?? t.title ?? idx}`}
                onPress={() => toggle(idx)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#E9E9E9',
                  backgroundColor: checked ? '#EEE' : '#FFF', // ✅ 선택 시 어둡게
                  gap: 10,
                  marginTop: idx === 0 ? 0 : 8,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: checked ? '#111' : '#BDBDBD',
                    backgroundColor: checked ? '#111' : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {checked && <View style={{ width: 8, height: 8, backgroundColor: '#fff' }} />}
                </View>
                <Text style={{ fontSize: 15, color: '#111', flexShrink: 1 }}>{t.title}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 아무것도 없을 때 */}
      {items.length === 0 && normTasks.length === 0 && (
        <Text style={{ fontSize: 14, color: '#666' }}>표시할 일정/할 일이 없어요. 🙌</Text>
      )}
    </View>
  );
}
