// components/TopBar.js
import { View, Text, Image, Pressable, Alert } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isChat = pathname === '/' || pathname === '/index';

  const handleFinderPress = () => {
    Alert.alert('체키 파인더(베타)', '아직 준비 중이에요! 곧 열릴 예정입니다 😊');
  };

  return (
    <LinearGradient
      colors={['#ffffff', '#ffffff']} // 위=흰색, 아래=연한 회색
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 20,
      }}
    >
      {/* ✅ 로고 */}
      <Image
        source={require('../assets/logo.png')}
        style={{ width: 32, height: 32, resizeMode: 'contain' }}
      />

      {/* ✅ 체키 */}
      <Pressable onPress={() => router.replace('/')}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '700',
            color: isChat ? '#000' : '#999',
          }}
        >
          체키
        </Text>
      </Pressable>

      {/* ✅ 일정 찾기 */}
      <Pressable onPress={handleFinderPress}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: '700',
            color: isChat ? '#999' : '#000',
          }}
        >
          일정 찾기
        </Text>
      </Pressable>

      <View style={{ flex: 1 }} />
    </LinearGradient>
  );
}
