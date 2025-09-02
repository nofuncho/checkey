// lib/auth.js
import { auth, db } from './firebase';

// 공통: 지정 시간(ms) 안에 응답 없으면 타임아웃
function withTimeout(promise, ms = 12000, label = '요청') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 응답 지연(타임아웃). 네트워크/Firebase 설정을 확인하세요.`)), ms)
    ),
  ]);
}

/** ✅ 로그인 상태 구독 (AuthGate 등에서 사용) */
export function subscribeAuth(callback) {
  return auth.onAuthStateChanged(callback);
}

/** ✅ 이메일 로그인 */
export async function signInWithEmail({ email, password }) {
  if (!email || !password) throw new Error('이메일과 비밀번호를 입력해주세요.');
  console.log('[auth] signIn start', { email });

  try {
    const cred = await withTimeout(
      auth.signInWithEmailAndPassword(email.trim(), password),
      12000,
      '로그인'
    );
    const user = cred.user;
    console.log('[auth] signIn success', user?.uid);

    await withTimeout(
      db.collection('users').doc(user.uid).set(
        {
          userId: user.uid,
          name: user.displayName || '',
          email: user.email || '',
          lastLoginAt: new Date().toISOString(),
        },
        { merge: true }
      ),
      8000,
      '프로필 갱신'
    );

    return user;
  } catch (e) {
    console.log('[auth] signIn ERROR:', e);
    throw new Error(e?.message || '로그인에 실패했습니다.');
  }
}

/** ✅ 이메일 회원가입 */
export async function signUpWithEmail({ email, password, displayName }) {
  if (!email || !password) throw new Error('이메일과 비밀번호를 입력해주세요.');
  console.log('[auth] signUp start', { email });

  try {
    const cred = await withTimeout(
      auth.createUserWithEmailAndPassword(email.trim(), password),
      12000,
      '회원가입'
    );
    const user = cred.user;
    console.log('[auth] signUp success', user?.uid);

    if (displayName) {
      await withTimeout(user.updateProfile({ displayName }), 8000, '프로필 업데이트');
    }

    const now = new Date().toISOString();
    await withTimeout(
      db.collection('users').doc(user.uid).set(
        {
          userId: user.uid,
          name: displayName || '',
          email: user.email || '',
          createdAt: now,
          lastLoginAt: now,
        },
        { merge: true }
      ),
      8000,
      '유저 문서 저장'
    );

    return user;
  } catch (e) {
    console.log('[auth] signUp ERROR:', e);
    throw new Error(e?.message || '회원가입에 실패했습니다.');
  }
}

/** ✅ 로그아웃 */
export async function signOut() {
  await auth.signOut();
}
