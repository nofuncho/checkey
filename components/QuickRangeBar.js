import { View, Pressable, Text, StyleSheet } from 'react-native';

const items = [
  { label: '오늘',    phrase: '오늘 스케줄 알려줘' },
  { label: '이번 주', phrase: '이번 주 스케줄 알려줘' },
  { label: '다음 주', phrase: '다음 주 스케줄 알려줘' },
  { label: '이번 달', phrase: '이번 달 스케줄 알려줘' },
  { label: '다음 달', phrase: '다음 달 스케줄 알려줘' },
];

export default function QuickRangeBar({ onPick }) {
  return (
    <View style={styles.wrap}>
      {items.map(it => (
        <Pressable key={it.label} style={styles.btn} onPress={() => onPick?.(it.phrase)}>
          <Text style={styles.txt}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F2F3F5' },
  txt: { fontSize: 13, color: '#222' },
});
