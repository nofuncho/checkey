// app/_layout.js
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Slot, usePathname } from 'expo-router';
import TopBar from '../components/TopBar';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import React from 'react';

export default function Layout() {
  const pathname = usePathname();
  const HIDE_SEGMENTS = ['login', 'signup', 'auth', 'onboarding'];
  const hideHeader = HIDE_SEGMENTS.some((seg) => pathname?.includes(seg));

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <SafeAreaProvider>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
          {hideHeader ? null : <TopBar />}{/* ← 사이에 공백/주석 안 남기고 바로 이어붙임 */}<Slot />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
