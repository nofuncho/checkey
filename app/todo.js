// app/todo.js
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SectionList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';

import TaskSwipeCard from '../components/TaskSwipeCard';
import { useAppStore } from '../lib/store';
import { addTask, getUserTasks /* updateTask, removeTask */ } from '../lib/data';

dayjs.locale('ko');
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

const TOPBAR_H = 56;
const COMPOSER_KEY = '__composer';

// ── 유틸 ──────────────────────────────────────────────────────────────
function estimateDuration(title) {
  if (/(정리|확인|전화|메일|결제|구매|예약)/.test(title)) return 10;
  if (/(작성|보고|제출|면접|준비)/.test(title)) return 25;
  return 5;
}
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function mergeTasks(localArr, remoteArr) {
  const map = new Map();
  (localArr || []).forEach(t => map.set(t.taskId || t.id, t));
  (remoteArr || []).forEach(t => map.set(t.taskId || t.id, t));
  return Array.from(map.values());
}

// ── 메인 ──────────────────────────────────────────────────────────────
export default function TodoScreen() {
  const insets = useSafeAreaInsets();
  const user = useAppStore(s => s.user);
  const tasksFromStore = useAppStore(s => s.tasks);
  const setTasks = useAppStore(s => s.setTasks);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [remoteTasks, setRemoteTasks] = useState([]);

  const safeLocal = Array.isArray(tasksFromStore) ? tasksFromStore : [];

  // 원격 fetch
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const uid = user?.userId || user?.uid;
        if (!uid) return;
        const fetched = await getUserTasks?.(uid);
        if (!mounted) return;
        setRemoteTasks(Array.isArray(fetched) ? fetched : []);
      } catch (e) {
        console.log('[todo] getUserTasks error', e);
      }
    })();
    return () => { mounted = false; };
  }, [user?.userId, user?.uid]);

  // 오늘/내일 경계
  const todayStart = useMemo(() => dayjs().startOf('day'), []);
  const todayEnd   = useMemo(() => dayjs().endOf('day'), []);
  const tomorrowStart = useMemo(() => dayjs().add(1,'day').startOf('day'), []);
  const tomorrowEnd   = useMemo(() => dayjs().add(1,'day').endOf('day'), []);

  // 분류
  const { todayList, tomorrowList } = useMemo(() => {
    const merged = mergeTasks(safeLocal, remoteTasks);
    const todayArr = [];
    const tomorrowArr = [];
    for (const t of merged) {
      const d = toDateSafe(t?.dueDate);
      if (!d) { todayArr.push(t); continue; }
      const dj = dayjs(d);
      if (dj.isSameOrAfter(todayStart) && dj.isSameOrBefore(todayEnd)) {
        todayArr.push(t);
      } else if (dj.isSameOrAfter(tomorrowStart) && dj.isSameOrBefore(tomorrowEnd)) {
        tomorrowArr.push(t);
      } else {
        todayArr.push(t);
      }
    }
    const sortFn = (a, b) => {
      const aDone = a?.status === 'done';
      const bDone = b?.status === 'done';
      if (aDone !== bDone) return aDone ? 1 : -1;
      const ad = toDateSafe(a?.dueDate)?.getTime() ?? Infinity;
      const bd = toDateSafe(b?.dueDate)?.getTime() ?? Infinity;
      return ad - bd;
    };
    todayArr.sort(sortFn);
    tomorrowArr.sort(sortFn);
    return { todayList: todayArr, tomorrowList: tomorrowArr };
  }, [safeLocal, remoteTasks, todayStart, todayEnd, tomorrowStart, tomorrowEnd]);

  // 추가 저장
  const commitAdd = useCallback(async () => {
    const t = title.trim();
    if (!t) return;
    try {
      const uid = user?.userId || user?.uid;
      const draft = {
        title: t,
        estimatedDurationMinutes: estimateDuration(t),
        status: 'pending',
        createdAt: new Date(),
        dueDate: dayjs().endOf('day').toDate(),
      };
      const saved = await addTask?.(uid, draft);
      const merged = { ...draft, ...(saved || {}) }; // ✅ 제목 유지
      setTasks?.([...(safeLocal || []), merged]);
      setRemoteTasks(prev => [...prev, merged]);
      setTitle('');
      setAdding(false);
    } catch (e) {
      console.log('[todo] addTask error', e);
      Alert.alert('오류', '할 일 저장에 실패했어요.');
    }
  }, [title, user?.userId, user?.uid, safeLocal, setTasks]);

  // 토글/미루기/삭제
  const onToggleDone = useCallback((task) => {
    const next = { ...task, status: task?.status === 'done' ? 'pending' : 'done' };
    setTasks?.((safeLocal || []).map(t => (t.taskId === task.taskId ? next : t)));
    setRemoteTasks(prev => prev.map(t => (t.taskId === task.taskId ? next : t)));
  }, [safeLocal, setTasks]);

  const onSnooze = useCallback((task) => {
    const base = toDateSafe(task?.dueDate) || new Date();
    const nextDue = dayjs(base).add(1, 'day').endOf('day').toDate();
    const next = { ...task, dueDate: nextDue };
    setTasks?.((safeLocal || []).map(t => (t.taskId === task.taskId ? next : t)));
    setRemoteTasks(prev => prev.map(t => (t.taskId === task.taskId ? next : t)));
  }, [safeLocal, setTasks]);

  const onDelete = useCallback((task) => {
    setTasks?.((safeLocal || []).filter(t => t.taskId !== task.taskId));
    setRemoteTasks(prev => prev.filter(t => t.taskId !== task.taskId));
  }, [safeLocal, setTasks]);

  // 섹션 데이터: 오늘 끝에 "컴포저 아이템"
  const sections = useMemo(() => ([
    { key: 'today', title: '오늘', data: [...todayList, { [COMPOSER_KEY]: true }] },
    { key: 'tomorrow', title: '내일', data: tomorrowList },
  ]), [todayList, tomorrowList]);

  const renderItem = ({ item }) => {
    if (item[COMPOSER_KEY]) {
      return !adding ? (
        <View style={styles.addCard}>
          <Pressable style={styles.addCircle} onPress={() => setAdding(true)}>
            <Text style={styles.addPlus}>＋</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.editorCard}>
          <TextInput
            placeholder="할 일을 입력하세요"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            multiline
            autoFocus
          />
          <View style={styles.rowEnd}>
            <Pressable
              style={[styles.btn, { backgroundColor: '#232323' }]}
              onPress={() => { setAdding(false); setTitle(''); }}
            >
              <Text style={styles.btnText}>취소</Text>
            </Pressable>
            <Pressable style={[styles.btn, { backgroundColor: '#2f80ed' }]} onPress={commitAdd}>
              <Text style={styles.btnText}>등록</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    return (
      <TaskSwipeCard
        task={item}
        onToggleDone={onToggleDone}
        onSnooze={onSnooze}
        onDelete={onDelete}
        showCheckbox
      />
    );
  };

  const SectionHeader = ({ title }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding' })} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#F5F7FB' }}>
        <SectionList
          sections={sections}
          keyExtractor={(item, idx) =>
            item[COMPOSER_KEY] ? COMPOSER_KEY : item?.taskId || `t-${idx}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{
            paddingTop: insets.top + TOPBAR_H + 8,
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: 16,
          }}
          removeClippedSubviews={false}
          ListEmptyComponent={<View style={{ paddingVertical: 16 }} />}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3A3A3A',
  },
  addCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 6,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C7CDD9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPlus: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 22,
  },
  editorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    marginBottom: 8,
  },
  input: { minHeight: 44, fontSize: 16, color: '#111' },
  rowEnd: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
});
