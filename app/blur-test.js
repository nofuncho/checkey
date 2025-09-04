// app/blur-test.js
import { View, Image, Text } from 'react-native';
import { BlurView } from 'expo-blur';

export default function BlurTest() {
  return (
    <View style={{ flex: 1 }}>
      {/* 뒤 배경: 사진 (블러 확인용) */}
      <Image
        source={{ uri: 'https://picsum.photos/900/1600' }}
        style={{ position:'absolute', left:0, right:0, top:0, bottom:0 }}
        resizeMode="cover"
      />
      {/* 블러 패널 */}
      <View style={{ position:'absolute', top: 80, left: 20, right: 20, height: 120 }}>
        <BlurView tint="light" intensity={40} style={{ flex: 1, borderRadius: 16 }}>
          <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
            <Text>블러 보이면 OK</Text>
          </View>
        </BlurView>
      </View>
    </View>
  );
}
