// components/MessageBubble.js
import { View, Text } from 'react-native';
import ScheduleSummaryCard from './ScheduleSummaryCard';
import { useAppStore } from '../lib/store';

export default function MessageBubble({ item }) {
  const isUser = item.role === 'user';
  const text = item.text || '';

  const base = {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 6,
    maxWidth: '84%',
  };

  // ✅ store 액션 불러오기
  const onTaskComplete = useAppStore((s) => s.onTaskComplete);
  const onTaskDelete   = useAppStore((s) => s.onTaskDelete);
  const onTaskSnooze   = useAppStore((s) => s.onTaskSnooze);

  // 사용자 메시지
  if (isUser) {
    return (
      <View style={{ alignSelf: 'flex-end', marginRight: 12 }}>
        <View
          style={{
            ...base,
            backgroundColor: '#111',
            borderTopRightRadius: 0,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 15 }}>{text}</Text>
        </View>
      </View>
    );
  }

  // ✅ 체키 메시지: 스케줄/할 일 카드
  if (item.type === 'schedule_summary') {
    return (
      <ScheduleSummaryCard
        title={item.card?.title}
        items={item.card?.items || []}
        tasks={item.card?.tasks || []}
        messageId={item.id}
        // 🔑 quiet 옵션을 그대로 전달할 수 있게 보존
        onTaskComplete={(task, _msgId, opts) =>
          onTaskComplete(task, item.id, { quiet: true, ...opts })
        }
        onTaskDelete={(task, _msgId, opts) =>
          onTaskDelete(task, item.id, { quiet: true, ...opts })
        }
        onTaskSnooze={(task, _msgId, opts) =>
          onTaskSnooze(task, item.id, { quiet: true, ...opts })
        }
      />
    );
  }

  if (item.type === 'digest') {
    return (
      <View style={{ alignSelf: 'flex-start', marginLeft: 12 }}>
        <View
          style={{
            ...base,
            backgroundColor: '#FAFAFA',
            borderTopLeftRadius: 0,
          }}
        >
          <Text style={{ color: '#111', fontSize: 15 }}>{item.text}</Text>
        </View>
      </View>
    );
  }

  // 기본 체키 텍스트 메시지
  return (
    <View style={{ alignSelf: 'flex-start', marginLeft: 12 }}>
      <View
        style={{
          ...base,
          backgroundColor: '#FAFAFA',
          borderTopLeftRadius: 0,
        }}
      >
        <Text style={{ color: '#111', fontSize: 15 }}>{text}</Text>
      </View>
    </View>
  );
}
