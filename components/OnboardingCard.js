// components/OnboardingCard.js
import { useState, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { askPushPermission, getPushPermissionStatus } from '../lib/notify';
import { connectDeviceCalendarsOnce } from '../lib/calendar';

export default function OnboardingCard() {
  const [pushGranted, setPushGranted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [calendarLinked, setCalendarLinked] = useState(false);

  useEffect(() => {
    (async () => {
      const granted = await getPushPermissionStatus();
      setPushGranted(granted);
      setChecking(false);
    })();
  }, []);

  const handleAskPush = async () => {
    const { granted } = await askPushPermission();
    setPushGranted(granted);
    if (granted) {
      Alert.alert('알림 설정 완료', '리마인더를 받을 준비가 되었어요!');
    } else {
      Alert.alert('알림 거부됨', '설정 > 알림에서 언제든 다시 허용할 수 있어요.');
    }
  };

  const handleCalendarLink = async () => {
    const res = await connectDeviceCalendarsOnce();
    if (res.ok) {
      setCalendarLinked(true);
      Alert.alert('캘린더 연결 완료', '기기 캘린더와 연동되었습니다. 기본 캘린더로 저장돼요!');
    } else {
      Alert.alert(
        '연결 실패',
        '캘린더 권한이 거부되었거나 기기 캘린더를 찾을 수 없습니다.\n설정 > 권한에서 캘린더 접근을 허용해 주세요.'
      );
    }
  };

  if (checking) return null;

  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 12,
        marginBottom: 4,
        padding: 14,
        borderRadius: 14,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
        온보딩
      </Text>
      <Text style={{ fontSize: 14, color: '#374151', marginBottom: 12, lineHeight: 20 }}>
        알림 권한을 허용하면 리마인더를 받을 수 있어요.{'\n'}
        캘린더 동기화를 하면 일정/할 일이 기기 캘린더에도 자동 저장돼요.
      </Text>

      {/* 알림 허용하기 */}
      <Pressable
        onPress={handleAskPush}
        disabled={pushGranted}
        style={{
          opacity: pushGranted ? 0.6 : 1,
          backgroundColor: '#111827',
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {pushGranted ? '알림 허용됨 ✅' : '알림 허용하기'}
        </Text>
      </Pressable>

      {/* 기기 캘린더 동기화 */}
      <Pressable
        onPress={handleCalendarLink}
        disabled={calendarLinked}
        style={{
          opacity: calendarLinked ? 0.6 : 1,
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#D1D5DB',
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#111827', fontWeight: '700' }}>
          {calendarLinked ? '캘린더 연결됨 ✅' : '캘린더 동기화'}
        </Text>
      </Pressable>

      {/* Google 캘린더 연결 (준비중) */}
      <Pressable
        disabled
        style={{
          opacity: 0.5,
          backgroundColor: '#4285F4',
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          Google 캘린더 연결 (준비중)
        </Text>
      </Pressable>

      <Text
        style={{
          marginTop: 6,
          fontSize: 12,
          color: '#6B7280',
          textAlign: 'center',
        }}
      >
        기기 캘린더(삼성/애플/구글 앱)에 바로 저장됩니다. Google OAuth는 개발 빌드에서 준비할게요.
      </Text>
    </View>
  );
}
