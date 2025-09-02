// components/AuthGate.js
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { auth } from '../lib/firebase';          // ✅ compat auth
import { useAppStore } from '../lib/store';      // ✅ store 연결

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);
  const [fbUser, setFbUser] = useState(null);

  useEffect(() => {
    console.log('[AuthGate] 초기화 중...');
    const unsub = auth.onAuthStateChanged((u) => {
      console.log('[AuthGate] onAuthStateChanged ->', u ? u.uid : 'null', '| pathname =', pathname);

      // ✅ 로컬 상태
      setFbUser(u);
      setReady(true);

      // ✅ 전역 store에 사용자 반영
      if (u) {
        useAppStore.getState().setUser({
          userId: u.uid,
          email: u.email ?? null,
          displayName: u.displayName ?? null,
        });
      } else {
        useAppStore.getState().clearUser();
      }

      // ✅ 라우팅 제어
      if (!u) {
        if (pathname !== '/login') {
          console.log('[AuthGate] 미인증 → /login 이동');
          router.replace('/login');
        }
      } else {
        if (pathname === '/login') {
          console.log('[AuthGate] 인증됨 → / 로 이동');
          router.replace('/');
        }
      }
    });

    return () => {
      try { unsub(); } catch {}
    };
  }, [pathname, router]);

  // 초기 Firebase 응답 대기 중
  if (!ready) return null;

  // 미인증 상태 → /login 라우트가 대신 렌더링됨
  if (!fbUser) {
    console.log('[AuthGate] user 없음 → Login 화면 표시');
    return null;
  }

  // 인증된 상태 → 자식(children) 렌더링
  console.log('[AuthGate] user 인증됨 → children 렌더링');
  return children;
}
