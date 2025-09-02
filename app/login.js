// app/login.js
import { SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import LoginForm from '../components/LoginForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { auth } from '../lib/firebase';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    // ✅ 로그인 성공하면 홈(/)으로 이동
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        console.log('[LoginScreen] detected login -> go /');
        router.replace('/');
      }
    });
    return unsub;
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top}
      >
        <LoginForm />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
