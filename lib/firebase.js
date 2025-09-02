// lib/firebase.js
import 'react-native-get-random-values'; // 일부 RN 환경에서 crypto 필요
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCtMFWo75yPAM6BhFW0GMFzKVp_F6S3qVY',
  authDomain: 'checkey-91650.firebaseapp.com',
  projectId: 'checkey-91650',
  storageBucket: 'checkey-91650.appspot.com',        // ✅ 누락된 부분 보완
  messagingSenderId: '15088744386',                  // ✅ senderId 보완
  appId: '1:15088744386:web:f7424898fb03d83fae085b',
};

// ✅ 중복 초기화 방지
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app();
}

// ✅ compat 인스턴스들
export const auth = firebase.auth();
export const db = firebase.firestore();

// (편의) serverTimestamp 헬퍼
export const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;

// ✅ firebase 객체도 named export
export { firebase };
