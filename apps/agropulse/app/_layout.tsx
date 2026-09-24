import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../src/context/AppContext';

function RootNavigation() {
  const { session, isLoading } = useApp();
  const segments = useSegments();
  const router = useRouter();

  const rootSegment = segments[0] ?? '';

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = rootSegment === '(tabs)' || rootSegment === 'plot';

    if (!session && inAuthGroup) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.replace('/');
      } else {
        router.replace('/');
      }
    } else if (session && !inAuthGroup) {
      router.replace('/(tabs)/home' as any);
    }
  }, [session, isLoading, rootSegment, router]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="plot/[id]" 
          options={{ 
            presentation: 'card', 
            headerShown: true, 
            title: 'Detalle de Lote' 
          }} 
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <RootNavigation />
    </AppProvider>
  );
}