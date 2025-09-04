import { useState, useEffect } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export default function InputBox({ onSend, initialValue = '' }) {
  const [text, setText] = useState(initialValue);

  // draft 값이 바뀔 때마다 반영
  useEffect(() => {
    if (initialValue !== undefined) {
      setText(initialValue);
    }
  }, [initialValue]);

  const handleSend = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        backgroundColor: '#fff', // 경계선 제거
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: '#f8f8f8',
          borderRadius: 18,
          paddingHorizontal: 14,
          height: 44, // 입력창 고정 높이
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="말해줘: 예) 내일 3시에 팀 미팅, 오늘 안에 보고서 정리"
          placeholderTextColor="#9AA0A6"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          style={{
            fontSize: 16,
            lineHeight: 20,
            paddingVertical: 0,         // 상하 패딩 제거
            includeFontPadding: false,  // Android 여백 제거
            textAlignVertical: 'center' // Android 세로 중앙
          }}
        />
      </View>

      <Pressable
        onPress={handleSend}
        style={{
          marginLeft: 8,
          height: 44,
          paddingHorizontal: 16,
          borderRadius: 22,
          backgroundColor: '#111',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>전송</Text>
      </Pressable>
    </View>
  );
}
