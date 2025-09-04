// lib/store.js
import 'react-native-get-random-values';
import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import dayjs from 'dayjs';
import { parseWithGPT, toConfirmCard } from './nlp';
import {
  addTask,
  addSchedule,
  addTaskAndSchedule,
  getUserTasks,
  updateTaskEstimatedDuration,
  // ✅ 아래 두 개가 lib/data에 있어야 함 (없다면 구현/추가 필요)
  updateTask,
  deleteTask,
} from './data';

let _nlpBusy = false;

/* ===== 안전한 Date 변환 (ConfirmCard와 동일 로직) ===== */
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/* ===== 휴리스틱(간단 규칙) 추정 함수 — 비어있을 때 채우는 기본값 ===== */
function estimateDurationByHeuristic(title = '') {
  if (/(정리|확인|전화|통화|콜|메일|결제|구매|예약)/.test(title)) return 10;
  if (/(작성|보고|제출|면접|준비|정리|정돈)/.test(title)) return 25;
  return 5; // 기본 5분
}

/* ===== 내일로 미루기 계산 유틸 =====
   - keepTime: 기존 시간 유지 (기본)
   - atEndOfDay: 내일 23:59로 고정 (opts.atEndOfDay === true)
*/
function nextDayDate(base, opts = {}) {
  const d = toDateSafe(base) ?? new Date();
  if (opts.atEndOfDay) {
    return dayjs(d).add(1, 'day').hour(23).minute(59).second(0).millisecond(0).toDate();
  }
  return dayjs(d).add(1, 'day').toDate(); // 시간 유지
}

/* ===== Messages 배열 내 특정 confirmCard의 tasks를 현행화 ===== */
function updateCardTasksInMessages(messages, cardMessageId, mutator) {
  if (!cardMessageId) return messages; // 메시지 id를 모르면 스킵(서버만 갱신)
  return messages.map((m) => {
    if (m.id === cardMessageId && m.kind === 'confirmCard' && m.card) {
      const oldTasks = Array.isArray(m.card.tasks) ? m.card.tasks : [];
      const newTasks = mutator(oldTasks);
      return {
        ...m,
        card: {
          ...m.card,
          tasks: newTasks,
        },
      };
    }
    return m;
  });
}

export const useAppStore = create((set, get) => ({
  /* ===================== 사용자 상태 ===================== */
  user: null,
  setUser(user) {
    set({ user });
  },
  clearUser() {
    set({ user: null });
  },

  /* ===================== 메시지 상태 ===================== */
  messages: [],
  addMessage(msg) {
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  /* ========= (4번) ensureEstimated ========= */
  ensureEstimated: async () => {
    try {
      const tasks = await getUserTasks(); // 현재 로그인 사용자 기준 pending만
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      const needPatch = tasks
        .filter(
          (t) =>
            t?.status === 'pending' &&
            !(Number.isFinite(t?.estimatedDurationMinutes) && t.estimatedDurationMinutes > 0)
        )
        .map((t) => ({
          taskId: t.taskId || t.id,
          minutes: estimateDurationByHeuristic(t.title || ''),
        }));

      if (needPatch.length === 0) return;

      await Promise.all(
        needPatch.map((p) => updateTaskEstimatedDuration(p.taskId, p.minutes, 'heuristic'))
      );
    } catch (e) {
      console.log('[ensureEstimated] error', e?.message || e);
    }
  },

  /* ===================== 입력 처리 ===================== */
  async handleUserInput(text) {
    if (_nlpBusy) return;
    _nlpBusy = true;

    try {
      const userMsg = { id: uuid(), role: 'user', text, ts: Date.now() };
      set((s) => ({ messages: [...s.messages, userMsg] }));

      const parsed = await parseWithGPT(text);
      const card = toConfirmCard(parsed);

      set((s) => ({
        messages: [
          ...s.messages,
          { id: uuid(), role: 'assistant', kind: 'confirmCard', card, ts: Date.now() },
        ],
      }));
    } finally {
      _nlpBusy = false;
    }
  },

  /* ===================== 저장 처리 ===================== */
  async confirmSave(cardMessageId, extra) {
    const { messages } = get();
    const msg = messages.find((m) => m.id === cardMessageId && m.kind === 'confirmCard');
    const card = msg?.card;
    if (!card) return;

    const mode = String(extra?.mode || card.type || '').toLowerCase();
    const selectedTasksInput = Array.isArray(extra?.selectedTasks) ? extra.selectedTasks : [];

    const normalizeTask = (t) => {
      const base =
        typeof t === 'string'
          ? { title: t }
          : t && typeof t === 'object'
          ? {
              title: t.title ?? card.title ?? '-',
              dueDate: t.dueDate ? dayjs(t.dueDate).toISOString() : null,
              estimatedDurationMinutes: t.estimatedDurationMinutes,
            }
          : { title: card.title ?? '-' };

      const minutes = Number.isFinite(base.estimatedDurationMinutes)
        ? base.estimatedDurationMinutes
        : Number.isFinite(card.estimatedDurationMinutes)
        ? card.estimatedDurationMinutes
        : estimateDurationByHeuristic(base.title || '');

      return {
        title: base.title || '-',
        dueDate: base.dueDate ?? (card.dueDate ? dayjs(card.dueDate).toISOString() : null),
        estimatedDurationMinutes: minutes,
      };
    };

    try {
      const hasTasksArray = Array.isArray(card.tasks) && card.tasks.length > 0;

      // BOTH
      if (mode === 'both' || (card.startTime && hasTasksArray)) {
        await addSchedule({
          title: card.title || '일정',
          startTime: card.startTime ? dayjs(card.startTime).toISOString() : null,
          remind: 10,
        });

        const tasksToSave =
          selectedTasksInput.length > 0 ? selectedTasksInput : card.tasks || [];
        const normalized = tasksToSave.map(normalizeTask);

        await Promise.all(
          normalized.map((t) =>
            addTask({
              title: t.title,
              dueDate: t.dueDate,
              estimatedDurationMinutes: t.estimatedDurationMinutes,
            })
          )
        );

        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: `일정 등록 완료! ⏰ ${card.title} (${dayjs(card.startTime).format('YYYY.M.D A h:mm')})`,
          ts: Date.now(),
        });
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: `할 일 ${normalized.length}개도 같이 추가했어.`,
          ts: Date.now(),
        });
        return;
      }

      // TASK 전용
      if (mode === 'task' || card.type === 'task') {
        let tasksToSave = [];

        if (selectedTasksInput.length > 0) {
          tasksToSave = selectedTasksInput;
        } else if (hasTasksArray) {
          tasksToSave = card.tasks;
        } else {
          tasksToSave = [{ title: card.title }];
        }

        const normalized = tasksToSave.map(normalizeTask);

        await Promise.all(
          normalized.map((t) =>
            addTask({
              title: t.title,
              dueDate: t.dueDate,
              estimatedDurationMinutes: t.estimatedDurationMinutes,
            })
          )
        );

        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: normalized.length > 1 ? `할 일 ${normalized.length}개 저장했어!` : '할 일을 저장했어!',
          ts: Date.now(),
        });
        return;
      }

      // SCHEDULE 전용
      if (mode === 'schedule' || card.type === 'schedule') {
        await addSchedule({
          title: card.title || '일정',
          startTime: card.startTime ? dayjs(card.startTime).toISOString() : null,
          remind: 10,
        });

        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: '일정을 저장했어!',
          ts: Date.now(),
        });
        return;
      }

      // Fallback
      await addTaskAndSchedule({
        title: card.title || '일정',
        startTime: card.startTime ? dayjs(card.startTime).toISOString() : null,
        dueDate: card.dueDate ? dayjs(card.dueDate).toISOString() : null,
        estimatedDurationMinutes: Number.isFinite(card.estimatedDurationMinutes)
          ? card.estimatedDurationMinutes
          : estimateDurationByHeuristic(card.title || ''),
      });

      get().addMessage({
        id: uuid(),
        role: 'assistant',
        text: '저장했어! (둘 다)',
        ts: Date.now(),
      });
    } catch (err) {
      console.error(err);
      get().addMessage({
        id: uuid(),
        role: 'assistant',
        text: '저장 중 문제가 생겼어. 잠시 후 다시 시도해줘.',
        ts: Date.now(),
      });
    }
  },

  // 카드 취소
  cancelSave(cardMessageId) {
    get().addMessage({
      id: uuid(),
      role: 'assistant',
      text: '취소했어. 필요하면 다시 말해줘!',
      ts: Date.now(),
    });
  },

  /* ===================== ✅ Task 카드 액션 (ConfirmCard/ScheduleSummaryCard 공용) ===================== */
  // 탭 → 완료 토글
  async onTaskComplete(task, cardMessageId, opts = {}) {
    try {
      const taskId = task?.taskId || task?.id;
      const newCompleted = !task?.completed;

      if (taskId) {
        await updateTask(taskId, { completed: newCompleted });
      }

      // 카드 UI 낙관적 반영
      set((s) => ({
        messages: updateCardTasksInMessages(s.messages, cardMessageId, (old) =>
          old.map((t) =>
            (t?.taskId || t?.id) === taskId ? { ...t, completed: newCompleted } : t
          )
        ),
      }));

      if (!opts.quiet) {
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: newCompleted ? '완료 표시했어! ✅' : '완료 해제했어.',
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.log('[onTaskComplete] error', e?.message || e);
      if (!opts.quiet) {
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: '완료 처리 중 문제가 생겼어.',
          ts: Date.now(),
        });
      }
    }
  },

  // 왼쪽 스와이프 → 삭제
  async onTaskDelete(task, cardMessageId, opts = {}) {
    try {
      const taskId = task?.taskId || task?.id;

      if (taskId) {
        await deleteTask(taskId);
      }

      // 카드 UI에서 제거
      let emptied = false;
      set((s) => {
        const updated = updateCardTasksInMessages(s.messages, cardMessageId, (old) => {
          const next = old.filter((t) => (t?.taskId || t?.id) !== taskId);
          emptied = next.length === 0;
          return next;
        });
        return { messages: updated };
      });

      if (!opts.quiet) {
        if (emptied && cardMessageId) {
          // 카드가 빈 경우: 카드 메시지 대신 안내 멘트 추가
          set((s) => ({
            messages: [
              ...s.messages.filter((m) => m.id !== cardMessageId),
              {
                id: uuid(),
                role: 'assistant',
                text: '할 일을 모두 정리했어! 🎉',
                ts: Date.now(),
              },
            ],
          }));
        } else {
          get().addMessage({
            id: uuid(),
            role: 'assistant',
            text: '삭제했어.',
            ts: Date.now(),
          });
        }
      }
    } catch (e) {
      console.log('[onTaskDelete] error', e?.message || e);
      if (!opts.quiet) {
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: '삭제 중 문제가 생겼어.',
          ts: Date.now(),
        });
      }
    }
  },

  // 오른쪽 스와이프 → 내일로 미루기
  async onTaskSnooze(task, cardMessageId, opts = { atEndOfDay: false, quiet: false }) {
    try {
      const taskId = task?.taskId || task?.id;
      const next = nextDayDate(task?.dueDate, opts); // 기본: 시간 유지

      if (taskId) {
        await updateTask(taskId, { dueDate: next });
      }

      // 카드 UI에 새 dueDate 반영
      set((s) => ({
        messages: updateCardTasksInMessages(s.messages, cardMessageId, (old) =>
          old.map((t) => ((t?.taskId || t?.id) === taskId ? { ...t, dueDate: next } : t))
        ),
      }));

      if (!opts.quiet) {
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: opts?.atEndOfDay ? '내일 23:59로 미뤘어.' : '내일로 미뤘어.',
          ts: Date.now(),
        });
      }
    } catch (e) {
      console.log('[onTaskSnooze] error', e?.message || e);
      if (!opts.quiet) {
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          text: '미루는 중 문제가 생겼어.',
          ts: Date.now(),
        });
      }
    }
  },
}));
