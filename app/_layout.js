// app/_layout.js
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native';
import { Slot, usePathname } from 'expo-router';
import TopBar from '../components/TopBar';

export default function Layout() {
  const pathname = usePathname();

  // ✅ 어떤 그룹/경로 구조에서도 동작하도록 부분 일치로 체크
  const HIDE_SEGMENTS = ['login', 'signup', 'auth', 'onboarding'];
  const hideHeader = HIDE_SEGMENTS.some((seg) => pathname?.includes(seg));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        {!hideHeader && <TopBar />}
        <Slot />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}
