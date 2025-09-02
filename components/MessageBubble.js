// components/MessageBubble.js
import { View, Text } from 'react-native';
import ScheduleSummaryCard from './ScheduleSummaryCard'; // ✅ 추가

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
        tasks={item.card?.tasks || []}   // ✅ tasks도 전달
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
