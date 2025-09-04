// app/calendar.js
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  Dimensions,
  SectionList,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { BlurView } from 'expo-blur';

import { useAppStore } from '../lib/store';
import { fetchSchedulesRange, addSchedule, addTask, addTaskAndSchedule } from '../lib/data';
import * as nlp from '../lib/nlp';

dayjs.locale('ko');

/* ========= Layout / Theme ========= */
const SCREEN = Dimensions.get('window');
const COLS = 7;
const OUTER_PAD = 16;             // 바깥 좌우 여백
const CARD_HPAD = 10;             // 카드 내부 좌우 여백
const GRID_W = SCREEN.width - (OUTER_PAD * 2) - (CARD_HPAD * 2);
const CELL_W = Math.floor(GRID_W / COLS); // 요일/셀 폭 고정
const TOPBAR_H = 56;
const HEADER_H = 40;              // 블러 헤더 높이

const UI = {
  bg: '#F5F7FB',
  cardBg: '#FFFFFF',
  cardRadius: 24,
  border: '#EAECEF',
  chipBg: '#E7F0FF',
  chipText: '#2F6FDB',
  todayBg: '#3D79FF',
  todayText: '#FFFFFF',
  text: '#111',
  textWeak: '#77808B',
  sunday: '#E34A4A',
  saturday: '#2E7BE6',
};

/* ========= Utils ========= */
function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeEvent(ev) {
  const start = ev.startTime ?? ev.start ?? ev.start_at ?? ev.begin ?? null;
  const end   = ev.endTime   ?? ev.end   ?? ev.end_at   ?? ev.finish ?? null;
  const title = ev.title ?? ev.name ?? '일정';
  return {
    ...ev,
    title,
    startTime: toDateSafe(start),
    endTime: toDateSafe(end) || toDateSafe(start),
    location: ev.location ?? ev.place ?? null,
  };
}

function eventsOfDate(all, d) {
  if (!d) return []; // ← 빈 칸(null) 처리
  const s = dayjs(d).startOf('day');
  const e = dayjs(d).endOf('day');
  return (all || []).filter((raw) => {
    const ev = normalizeEvent(raw);
    const ss = dayjs(ev.startTime);
    const ee = dayjs(ev.endTime);
    return ss.isBefore(e) && ee.isAfter(s);
  });
}

/**
 * 월 내부 날짜만 채워진 5~6주 배열 생성
 * - 그 달이 아닌 칸은 null 로 놔둬서 빈 칸으로 렌더
 */
function buildWeeks(baseDate) {
  const startOfMonth = dayjs(baseDate).startOf('month');
  const endOfMonth   = dayjs(baseDate).endOf('month');

  const weeks = [];
  let week = new Array(7).fill(null);

  // 첫 주: 시작 요일 전까지는 null
  let weekday = startOfMonth.day(); // 0(일)~6(토)
  for (let i = 0; i < weekday; i++) week[i] = null;

  // 월 내 날짜 채우기
  let cur = startOfMonth.clone();
  let idx = weekday;
  while (cur.isBefore(endOfMonth) || cur.isSame(endOfMonth, 'day')) {
    week[idx] = cur;
    idx += 1;

    if (idx === 7) {
      weeks.push(week);
      week = new Array(7).fill(null);
      idx = 0;
    }

    cur = cur.add(1, 'day');
  }
  // 마지막 주가 꽉 차지 않으면 그대로 push (나머지는 null)
  if (idx !== 0) weeks.push(week);

  return weeks; // 길이 4~6, 각 주는 [dayjs|null] x7
}

function fallbackParseToCard(text, baseDate) {
  const m = /([01]?\d|2[0-3]):([0-5]\d)/.exec(text);
  const title = text.replace(/\s*\d{1,2}:\d{2}\s*/g, '').trim() || '제목 없음';
  const base = dayjs(baseDate || new Date());
  const slot = m ? base.hour(parseInt(m[1], 10)).minute(parseInt(m[2], 10)) : base.hour(9).minute(0);
  return { type: 'schedule', title, startTime: slot.toDate(), endTime: slot.add(30, 'minute').toDate(), remind: 10 };
}

/* ========= Main ========= */
export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const insetTop = insets.top + TOPBAR_H;

  const user = useAppStore((s) => s.user);

  const [cellH, setCellH] = useState(72);
  const [ready, setReady] = useState(false);

  const onContainerLayout = (e) => {
    const h = e.nativeEvent.layout.height;
    const usable = h - (insetTop + 34 /*요일헤더*/ + 24 /*마진*/ + 60 /*여지*/);
    const approx = Math.max(56, Math.floor(usable / 6));
    setCellH(approx);
    setReady(true);
  };

  // ===== 동적 섹션(월) 관리: 현재월 기준으로 양옆 로드 =====
  const CURRENT = dayjs(); // 오늘(예: 2025-09)
  const [sections, setSections] = useState(() => {
    const init = [];
    const PRE_BEFORE = 2;
    const PRE_AFTER = 2;
    for (let i = -PRE_BEFORE; i <= PRE_AFTER; i++) {
      const base = CURRENT.clone().add(i, 'month');
      init.push({
        key: base.format('YYYY-MM'),
        month: base,
        weeks: buildWeeks(base),
        data: ['grid'],
      });
    }
    return init;
  });

  // 월별 이벤트 캐시
  const [eventsByMonth, setEventsByMonth] = useState({});

  const loadMonth = useCallback(
    async (djs) => {
      if (!user?.userId) return;
      const ym = djs.format('YYYY-MM');
      if (eventsByMonth[ym]) return;
      try {
        const start = djs.startOf('month').startOf('week').toDate();
        const end = djs.endOf('month').endOf('week').toDate();
        const items = await fetchSchedulesRange(user.userId, start, end);
        const norm = (items || []).map(normalizeEvent);
        setEventsByMonth((prev) => ({ ...prev, [ym]: norm }));
      } catch (e) {
        console.log('[calendar] fetch error', e);
      }
    },
    [user?.userId, eventsByMonth]
  );

  // 초기: 현재월 + 양옆 월 이벤트 프리패치
  useEffect(() => {
    loadMonth(CURRENT);
    loadMonth(CURRENT.clone().add(1, 'month'));
    loadMonth(CURRENT.clone().add(-1, 'month'));
  }, [loadMonth]);

  // 섹션에 다음 달 추가 (+ 프리패치 강화)
  const appendNextMonth = useCallback(() => {
    setSections((prev) => {
      const last = prev[prev.length - 1]?.month || CURRENT;
      const next = last.clone().add(1, 'month');
      const key = next.format('YYYY-MM');
      if (prev.find((s) => s.key === key)) return prev;
      const added = {
        key,
        month: next,
        weeks: buildWeeks(next),
        data: ['grid'],
      };
      loadMonth(next);
      loadMonth(next.clone().add(1, 'month'));
      return [...prev, added];
    });
  }, [loadMonth]);

  // 섹션에 이전 달 추가 (+ 프리패치 강화)
  const prependPrevMonth = useCallback(() => {
    setSections((prev) => {
      const first = prev[0]?.month || CURRENT;
      const prevMonth = first.clone().add(-1, 'month');
      const key = prevMonth.format('YYYY-MM');
      if (prev.find((s) => s.key === key)) return prev;
      const added = {
        key,
        month: prevMonth,
        weeks: buildWeeks(prevMonth),
        data: ['grid'],
      };
      loadMonth(prevMonth);
      loadMonth(prevMonth.clone().add(-1, 'month'));
      return [added, ...prev];
    });
  }, [loadMonth]);

  // 날짜 선택 / 롱프레스
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composer, setComposer] = useState(null);

  const handleDayPress = (d) => {
    setSelectedDate(d);
    setSheetOpen(true);
  };
  const handleDayLongPress = (d) => {
    setSelectedDate(d);
    setComposer({ visible: true, whenText: d.format('YYYY.MM.DD') });
  };

  // 빠른등록
  const submitComposer = async (text) => {
    const draft = (text || '').trim();
    if (!draft || !user?.userId) return setComposer(null);
    try {
      let card = null;
      if (typeof nlp?.parseLight === 'function' && typeof nlp?.toCard === 'function') {
        const parsed = nlp.parseLight(draft, { base: selectedDate.toDate?.() || new Date() });
        card = nlp.toCard(parsed);
      } else {
        card = fallbackParseToCard(draft, selectedDate.toDate?.());
      }

      if (card?.type === 'schedule' || card?.startTime) {
        await addSchedule(user.userId, {
          title: card.title || '제목 없음',
          startTime: card.startTime,
          endTime: card.endTime || null,
          remind: typeof card.remind === 'number' ? card.remind : 10,
          location: card.location || null,
        });
      } else if (card?.type === 'task' || card?.tasks?.length) {
        await addTask(user.userId, {
          title: card.title || (card.tasks?.[0]?.title) || '할 일',
          dueDate: card.dueDate || selectedDate.endOf('day').toDate(),
          estimatedDurationMinutes: card.estimatedDurationMinutes || 10,
        });
      } else if (card?.type === 'both') {
        await addTaskAndSchedule(user.userId, {
          title: card.title || '제목 없음',
          startTime: card.startTime,
          endTime: card.endTime || null,
          dueDate: card.dueDate || selectedDate.endOf('day').toDate(),
          estimatedDurationMinutes: card.estimatedDurationMinutes || 10,
          remind: typeof card.remind === 'number' ? card.remind : 10,
        });
      } else {
        const fb = fallbackParseToCard(draft, selectedDate.toDate?.());
        await addSchedule(user.userId, fb);
      }

      // invalidate & reload
      const ym = selectedDate.format('YYYY-MM');
      setEventsByMonth((prev) => {
        const c = { ...prev }; delete c[ym]; return c;
      });
      await loadMonth(selectedDate.clone().startOf('month'));
      setSheetOpen(true);
    } catch (e) {
      console.log('[calendar] quick add error', e);
    } finally {
      setComposer(null);
    }
  };

  /* ========= Render ========= */
  const StickyHeader = useCallback(
    ({ section }) => (
      <View style={{ height: HEADER_H }}>
        {/* Blur layer */}
        {Platform.OS === 'ios' ? (
          <BlurView style={StyleSheet.absoluteFill} tint="light" intensity={40} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.85)' }]} />
        )}
        {/* Content */}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            paddingHorizontal: OUTER_PAD,
            paddingBottom: 10, // 타이틀-카드 간 여백
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '900', color: UI.text }}>{section.month.format('M월')}</Text>
          <Text style={{ fontSize: 13, color: UI.textWeak }}>{section.month.format('YYYY년')}</Text>
        </View>
      </View>
    ),
    []
  );

  const MonthCard = useCallback(
    ({ section }) => {
      const base = section.month;
      const ymKey = base.format('YYYY-MM');
      const all = eventsByMonth[ymKey] || [];
      const weeks = section.weeks; // 4~6

      return (
        <View style={[styles.card, { marginTop: 6 }]}>
          {/* 요일 헤더 */}
          <View style={styles.weekHeader}>
            {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
              <View key={w} style={{ width: CELL_W, alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: i === 0 ? UI.sunday : i === 6 ? UI.saturday : UI.textWeak,
                    fontWeight: '600',
                  }}
                >
                  {w}
                </Text>
              </View>
            ))}
          </View>

          {/* 주 단위 렌더 (월 외 날짜는 빈 칸으로) */}
          {weeks.map((week, r) => (
            <View key={r} style={{ flexDirection: 'row' }}>
              {week.map((d, c) => {
                if (!d) {
                  // 빈 칸
                  return <View key={c} style={{ width: CELL_W, height: cellH }} />;
                }

                const isToday = d.isSame(dayjs(), 'day');
                const isSelected = d.isSame(selectedDate, 'day');
                const weekday = d.day();
                const daily = eventsOfDate(all, d);

                return (
                  <Pressable
                    key={c}
                    onPress={() => handleDayPress(d)}
                    onLongPress={() => handleDayLongPress(d)}
                    delayLongPress={300}
                    style={{
                      width: CELL_W,
                      height: cellH,
                      paddingTop: 6,
                      paddingHorizontal: 4,
                      backgroundColor: isSelected ? '#F4F7FF' : 'transparent',
                    }}
                  >
                    {/* 날짜 */}
                    <View style={{ height: 26, alignItems: 'center' }}>
                      <View
                        style={{
                          minWidth: 26,
                          height: 26,
                          paddingHorizontal: 6,
                          borderRadius: 13,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isToday ? UI.todayBg : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '800',
                            color:
                              isToday
                                ? UI.todayText
                                : weekday === 0
                                  ? UI.sunday
                                  : weekday === 6
                                    ? UI.saturday
                                    : UI.text,
                          }}
                        >
                          {d.date()}
                        </Text>
                      </View>
                    </View>

                    {/* 이벤트 칩 */}
                    <View style={{ marginTop: 4, gap: 4 }}>
                      {daily.slice(0, 2).map((ev, j) => (
                        <View
                          key={j}
                          style={{
                            alignSelf: 'flex-start',
                            backgroundColor: UI.chipBg,
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            maxWidth: CELL_W - 8,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: UI.chipText }} numberOfLines={1}>
                            {ev.title || '일정'}
                          </Text>
                        </View>
                      ))}
                      {daily.length > 2 && (
                        <Text style={{ fontSize: 10, color: UI.chipText, marginLeft: 2 }}>+{daily.length - 2}</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      );
    },
    [cellH, eventsByMonth, selectedDate]
  );

  const listRef = useRef(null);

  // 첫 렌더 후 현재 월로 "딱 1번만" 점프
  const didInitialJumpRef = useRef(false);
  useEffect(() => {
    if (ready && listRef.current && !didInitialJumpRef.current) {
      didInitialJumpRef.current = true;
      setTimeout(() => {
        try {
          const idx = sections.findIndex((s) => s.key === CURRENT.format('YYYY-MM'));
          if (idx >= 0) {
            listRef.current.scrollToLocation({ sectionIndex: idx, itemIndex: 0, animated: false });
          }
        } catch {}
      }, 0);
    }
  }, [ready, sections]);

  // 상/하 스크롤에 따라 이전/다음 달 동적 로딩 (방향 감지 + 쿨다운)
  const lastYRef = useRef(0);
  const isPrependingRef = useRef(false);
  const handleScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - (lastYRef.current ?? 0);
    const scrollingUp = dy < -2; // 위로 스와이프 중?
    if (scrollingUp && y < 40 && !isPrependingRef.current) {
      isPrependingRef.current = true;
      requestAnimationFrame(() => {
        prependPrevMonth();
        setTimeout(() => { isPrependingRef.current = false; }, 300); // 쿨다운
      });
    }
    lastYRef.current = y;
  };

  return (
    <View style={{ flex: 1, backgroundColor: UI.bg }} onLayout={onContainerLayout}>
      {ready ? (
        <>
          <SectionList
            ref={listRef}
            sections={sections}
            keyExtractor={(_, idx) => String(idx)}
            ListHeaderComponent={<View style={{ height: insetTop }} />}  // 상단 안전영역 한 번만 확보
            renderSectionHeader={StickyHeader}       // ← 블러 헤더
            renderItem={MonthCard}                   // 섹션당 카드 1개
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: 12 }}
            scrollIndicatorInsets={{ top: insetTop + HEADER_H }}
            onEndReachedThreshold={0.5}
            onEndReached={appendNextMonth}          // 아래로 스크롤 시 다음 달 추가
            onScroll={handleScroll}                  // 위로 스크롤 시 이전 달 추가
            removeClippedSubviews
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            updateCellsBatchingPeriod={40}
            windowSize={7}
            scrollEventThrottle={16}
            // 프리패치: 보이는 섹션 기준 ±1~2개월
            onViewableItemsChanged={({ viewableItems }) => {
              const sec = viewableItems.find((v) => v.section && v.index === 0);
              const base = sec?.section?.month;
              if (base) {
                loadMonth(base.clone().add(1, 'month'));
                loadMonth(base.clone().add(-1, 'month'));
                loadMonth(base.clone().add(2, 'month'));
              }
            }}
            viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
            // 위에 prepend 시 스크롤 점프 방지
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 20,
            }}
          />

          {/* 날짜 탭 → 일정 리스트 시트 */}
          <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' }} onPress={() => setSheetOpen(false)}>
              <View pointerEvents="box-none" style={{ width: '100%' }}>
                <View style={styles.sheet}>
                  <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd' }} />
                  </View>
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800' }}>{selectedDate.format('YYYY.MM.DD (ddd)')}</Text>
                  </View>
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    {(() => {
                      const ym = selectedDate.format('YYYY-MM');
                      const daily = eventsOfDate(eventsByMonth[ym] || [], selectedDate);
                      if (daily.length === 0) {
                        return (
                          <View style={{ padding: 16 }}>
                            <Text style={{ color: UI.textWeak }}>등록된 일정이 없어요.</Text>
                          </View>
                        );
                      }
                      return daily.map((raw, i) => {
                        const ev = normalizeEvent(raw);
                        return (
                          <View key={i} style={styles.eventItem}>
                            <Text style={{ fontWeight: '800', marginBottom: 4 }}>{ev.title || '제목 없음'}</Text>
                            <Text style={{ fontSize: 12, color: '#333' }}>
                              {dayjs(ev.startTime).format('A h:mm')}–{dayjs(ev.endTime).format('A h:mm')}
                            </Text>
                            {ev.location && <Text style={{ fontSize: 12, color: UI.textWeak, marginTop: 2 }}>장소: {ev.location}</Text>}
                          </View>
                        );
                      });
                    })()}
                  </ScrollView>
                </View>
              </View>
            </Pressable>
          </Modal>

          {/* 롱프레스 → 빠른등록 */}
          {composer?.visible && (
            <View style={{ position: 'absolute', left: 16, right: 16, top: insetTop + 60 }}>
              <QuickComposer defaultText={`${composer.whenText} 에 `} onSubmit={submitComposer} onCancel={() => setComposer(null)} />
            </View>
          )}
        </>
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}

/* ========= Styles ========= */
const styles = StyleSheet.create({
  card: {
    backgroundColor: UI.cardBg,
    borderRadius: UI.cardRadius,
    paddingTop: 10,
    paddingBottom: 22,
    paddingHorizontal: CARD_HPAD,
    borderWidth: 1,
    borderColor: UI.border,
    marginHorizontal: OUTER_PAD,
    marginBottom: 12, // 월-월 간격
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    height: Math.round(SCREEN.height * 0.6),
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: UI.border,
  },
  eventItem: {
    padding: 14,
    marginVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: '#F7FAFF',
  },
});

/* ========= Quick Composer ========= */
function QuickComposer({ defaultText, onSubmit, onCancel }) {
  const [text, setText] = useState(defaultText || '');
  return (
    <View
      style={{
        backgroundColor: '#111',
        borderRadius: 16,
        padding: 12,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', marginBottom: 6 }}>빠른 등록</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="예) 15:30 팀 미팅, 엄마 선물 사기…"
        placeholderTextColor="#bbb"
        autoFocus
        style={{
          color: '#fff',
          backgroundColor: '#222',
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          fontSize: 15,
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
        <Pressable onPress={onCancel} style={{ paddingVertical: 8, paddingHorizontal: 10 }}>
          <Text style={{ color: '#bbb', fontWeight: '600' }}>취소</Text>
        </Pressable>
        <Pressable
          onPress={() => onSubmit(text)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 14,
            backgroundColor: '#2D62F0',
            borderRadius: 10,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>등록</Text>
        </Pressable>
      </View>
    </View>
  );
}
