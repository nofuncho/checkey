// components/LoginForm.js
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { signInWithEmail, signUpWithEmail } from '../lib/auth';

export default function LoginForm() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (loading) return;
    try {
      setLoading(true);
      console.log('[LoginForm] submit start', { mode, email });

      if (mode === 'signin') {
        await signInWithEmail({ email, password });
      } else {
        await signUpWithEmail({ email, password, displayName });
      }

      console.log('[LoginForm] submit done (AuthGate가 라우팅 예정)');
      // 성공 시 AuthGate가 / 로 이동
    } catch (e) {
      console.log('[LoginForm] ERROR:', e);
      Alert.alert('오류', e.message ?? String(e));
    } finally {
      setLoading(false);
      console.log('[LoginForm] submit finally');
    }
  };

  return (
    <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>
        {mode === 'signin' ? '로그인' : '회원가입'}
      </Text>

      {mode === 'signup' && (
        <TextInput
          placeholder="닉네임 (선택)"
          value={displayName}
          onChangeText={setDisplayName}
          style={inputStyle}
          autoCapitalize="none"
        />
      )}

      <TextInput
        placeholder="이메일"
        value={email}
        onChangeText={setEmail}
        style={inputStyle}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="비밀번호"
        value={password}
        onChangeText={setPassword}
        style={inputStyle}
        secureTextEntry
      />

      <Pressable onPress={onSubmit} disabled={loading} style={[buttonStyle, loading && { opacity: 0.6 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : (
          <Text style={{ color: 'white', fontWeight: '700' }}>
            {mode === 'signin' ? '로그인' : '회원가입'}
          </Text>
        )}
      </Pressable>

      <Pressable
        disabled={loading}
        onPress={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
        style={{ padding: 8, alignSelf: 'flex-start' }}
      >
        <Text style={{ textDecorationLine: 'underline' }}>
          {mode === 'signin' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
        </Text>
      </Pressable>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
};

const buttonStyle = {
  marginTop: 6,
  backgroundColor: '#111827',
  paddingVertical: 14,
  alignItems: 'center',
  borderRadius: 12,
};
