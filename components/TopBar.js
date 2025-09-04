// components/TopBar.js
import { View, Text, Image, Pressable, Alert } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isActive = (path) => {
    if ((path === '/' || path === '/index') && (pathname === '/' || pathname === '/index')) return true;
    return pathname.startsWith(path);
  };

  const BAR_H = 56;
  const totalH = insets.top + BAR_H;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: totalH,
        zIndex: 100,
        backgroundColor: 'transparent',
      }}
    >
      {/* 🔥 블러 배경 */}
      <BlurView
        tint="light"
        intensity={40}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
        }}
      >
        <Image
          source={require('../assets/logo.png')}
          style={{ width: 28, height: 28, resizeMode: 'contain', marginRight: 8 }}
        />

        {/* 메인 */}
        <Pressable onPress={() => router.replace('/')}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: isActive('/') ? '#111' : '#A3A3A3' }}>
            체키
          </Text>
        </Pressable>

        {/* 캘린더 */}
        <Pressable onPress={() => router.replace('/calendar')} style={{ marginLeft: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: isActive('/calendar') ? '#111' : '#A3A3A3' }}>
            캘린더
          </Text>
        </Pressable>

        {/* 할 일 (todo.js와 연결) */}
        <Pressable onPress={() => router.replace('/todo')} style={{ marginLeft: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: isActive('/todo') ? '#111' : '#A3A3A3' }}>
            할 일
          </Text>
        </Pressable>

        {/* 파인더 (알림만) */}
        <Pressable
          onPress={() => Alert.alert('체키 파인더(베타)', '아직 준비 중이에요! 곧 열릴 예정입니다 😊')}
          style={{ marginLeft: 16 }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#A3A3A3' }}>
            일정 찾기
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}
