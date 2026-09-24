import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Variables de entorno faltantes en apps/agropulse/.env');
}

// Adaptador seguro para SSR y bundling en Node.js donde window es undefined
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

const safeStorage = {
  getItem: (key: string) => {
    if (isServer) {
      return Promise.resolve(null);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (isServer) {
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (isServer) {
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'not-configured', {
  global: {
    fetch: async (input, options) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const abort = () => controller.abort();
      options?.signal?.addEventListener('abort', abort);
      if (options?.signal?.aborted) controller.abort();
      try { return await fetch(input, { ...options, signal: controller.signal }); }
      finally { clearTimeout(timer); options?.signal?.removeEventListener('abort', abort); }
    },
  },
  auth: {
    storage: safeStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
