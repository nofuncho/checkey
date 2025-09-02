// app/ChatScreen.js
import { useEffect, useRef } from 'react';
import { FlatList, SafeAreaView } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import InputBox from '../components/InputBox';
import MessageBubble from '../components/MessageBubble';
import { useAppStore } from '../lib/store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensurePushPermission() {
  if (!Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

export default function ChatScreen() {
  const listRef = useRef(null);
  const messages = useAppStore((s) => s.messages);
  const handleUserInput = useAppStore((s) => s.handleUserInput);
  const confirmCard = useAppStore((s) => s.confirmCard);
  const cancelCard = useAppStore((s) => s.cancelCard);

  useEffect(() => {
    ensurePushPermission();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <MessageBubble item={item} onConfirm={confirmCard} onCancel={cancelCard} />
        )}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
      />
      <InputBox onSend={handleUserInput} />
    </SafeAreaView>
  );
}
