// lib/store.js
import 'react-native-get-random-values';
import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import dayjs from 'dayjs';
import { parseWithGPT, toConfirmCard } from './nlp';
import { addTask, addSchedule, addTaskAndSchedule, getUserTasks, updateTaskEstimatedDuration } from './data';

let _nlpBusy = false;

/* ===== 휴리스틱(간단 규칙) 추정 함수 — 비어있을 때 채우는 기본값 ===== */
function estimateDurationByHeuristic(title = '') {
  if (/(정리|확인|전화|메일|결제|구매|예약)/.test(title)) return 10;
  if (/(작성|보고|제출|면접|준비)/.test(title)) return 25;
  return 5; // 기본 5분
}

export const useAppStore = create((set, get) => ({
  /* ===================== 사용자 상태 ===================== */
  user: null,                            // ✅ 현재 로그인 사용자 (예: { userId, email })
  setUser(user) { set({ user }); },      // ✅ 로그인/프로필 갱신 시 호출
  clearUser() { set({ user: null }); },  // ✅ 로그아웃 시 호출

  /* ===================== 메시지 상태 ===================== */
  // 모든 대화(텍스트/카드)를 한 배열에 누적
  // - 텍스트: { id, role:'user'|'assistant', text, ts }
  // - 카드:   { id, role:'assistant', kind:'confirmCard', card, ts }
  messages: [],

  addMessage(msg) {
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  /* ========= (4번) ensureEstimated =========
     Firestore의 pending Task를 읽어와서
     estimatedDurationMinutes가 비어있는 항목을 휴리스틱으로 채워 넣는다.
     - 로컬 tasks 상태가 없어도 동작하도록 설계 (Firestore 직접 패치)
  */
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
  // 사용자가 입력
  async handleUserInput(text) {
    if (_nlpBusy) return;
    _nlpBusy = true;

    try {
      // 1) 사용자 텍스트 버블 추가
      const userMsg = { id: uuid(), role: 'user', text, ts: Date.now() };
      set((s) => ({ messages: [...s.messages, userMsg] }));

      // 2) GPT 파싱 → 카드 생성
      const parsed = await parseWithGPT(text);
      const card = toConfirmCard(parsed);

      // 3) 🔥 후처리: 쉼표/엔터/그리고/및 등을 기준으로 여러 할 일 자동 분리
      const needSplit =
        (card.type === 'task' || (card.type === 'both' && !Array.isArray(card.tasks))) &&
        (!Array.isArray(card.tasks) || card.tasks.length <= 1);

      if (needSplit) {
        const src =
          (Array.isArray(card.tasks) && card.tasks[0]?.title) ||
          card.title ||
          text ||
          '';
        const parts = String(src)
          .split(/,|·|、|;|\||\n|그리고|및/g)
          .map((s) => s.trim())
          .filter(Boolean);

        if (parts.length > 1) {
          card.tasks = parts.map((p) => ({ title: p }));
          card.title = card.title || parts[0];
        }
      }

      // 4) 카드 메시지 누적
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
  // 특정 카드 메시지(id) 저장 요청
  async confirmSave(cardMessageId, extra) {
    const { messages } = get();
    const msg = messages.find((m) => m.id === cardMessageId && m.kind === 'confirmCard');
    const card = msg?.card;
    if (!card) return;

    const mode = String(extra?.mode || card.type || '').toLowerCase();
    const selectedTasksInput = Array.isArray(extra?.selectedTasks) ? extra.selectedTasks : [];

    const normalizeTask = (t) => {
      if (typeof t === 'string') return { title: t };
      if (t && typeof t === 'object') {
        return {
          title: t.title || card.title || '-',
          dueDate: t.dueDate ? dayjs(t.dueDate).toISOString() : null,
          estimatedDurationMinutes:
            t.estimatedDurationMinutes ?? card.estimatedDurationMinutes ?? 10,
        };
      }
      return { title: card.title || '-' };
    };

    try {
      const hasTasksArray = Array.isArray(card.tasks) && card.tasks.length > 0;

      // BOTH: 일정 + 여러 할 일 저장
      if (mode === 'both' || (card.startTime && hasTasksArray)) {
        await addSchedule({
          title: card.title,
          startTime: card.startTime ? dayjs(card.startTime).toISOString() : null,
          remind: 10,
        });

        const tasksToSave =
          selectedTasksInput.length > 0 ? selectedTasksInput : (card.tasks || []);
        const normalized = tasksToSave.map(normalizeTask);

        await Promise.all(
          normalized.map((t) =>
            addTask({
              title: t.title,
              dueDate: t.dueDate ?? (card.dueDate ? dayjs(card.dueDate).toISOString() : null),
              estimatedDurationMinutes:
                t.estimatedDurationMinutes ?? card.estimatedDurationMinutes ?? 10,
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
        if (selectedTasksInput.length > 0) {
          const normalized = selectedTasksInput.map(normalizeTask);
          await Promise.all(
            normalized.map((t) =>
              addTask({
                title: t.title,
                dueDate: t.dueDate ?? (card.dueDate ? dayjs(card.dueDate).toISOString() : null),
                estimatedDurationMinutes:
                  t.estimatedDurationMinutes ?? card.estimatedDurationMinutes ?? 10,
              })
            )
          );

          get().addMessage({
            id: uuid(),
            role: 'assistant',
            text: `할 일 ${normalized.length}개 저장했어!`,
            ts: Date.now(),
          });
        } else {
          await addTask({
            title: card.title,
            dueDate: card.dueDate ? dayjs(card.dueDate).toISOString() : null,
            estimatedDurationMinutes: card.estimatedDurationMinutes ?? 10,
          });

          get().addMessage({
            id: uuid(),
            role: 'assistant',
            text: '할 일을 저장했어!',
            ts: Date.now(),
          });
        }
        return;
      }

      // SCHEDULE 전용
      if (mode === 'schedule' || card.type === 'schedule') {
        await addSchedule({
          title: card.title,
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

      // Fallback(과거 로직)
      await addTaskAndSchedule({
        title: card.title,
        startTime: card.startTime ? dayjs(card.startTime).toISOString() : null,
        dueDate: card.dueDate ? dayjs(card.dueDate).toISOString() : null,
        estimatedDurationMinutes: card.estimatedDurationMinutes ?? 10,
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
}));
