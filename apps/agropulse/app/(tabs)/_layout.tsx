import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/components/FieldUI';
export default function TabsLayout() {
  return <Tabs initialRouteName="home" screenOptions={{ tabBarActiveTintColor: colors.green,
    tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.card },
    headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.ink }}>
    <Tabs.Screen name="home" options={{ title: 'Inicio', tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} /> }} />
    <Tabs.Screen name="map" options={{ title: 'Mapa', tabBarIcon: ({ color }) => <Feather name="map" size={22} color={color} /> }} />
    <Tabs.Screen name="plots" options={{ href: null }} />
    <Tabs.Screen name="alerts" options={{ title: 'Alertas', tabBarIcon: ({ color }) => <Feather name="bell" size={22} color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Cuenta', tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} /> }} />
  </Tabs>;
}
