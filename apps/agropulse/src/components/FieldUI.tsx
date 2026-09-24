import React, { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useApp } from '../context/AppContext';
export const colors = { bg: '#F5F3EB', card: '#FFFFFF', ink: '#173C32', muted: '#52675D',
  line: '#DBE3D9', green: '#215C44', soft: '#E9F0E5', red: '#AB3434' };
export function Button({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress}
    disabled={disabled} style={[ui.button, secondary && { backgroundColor: colors.soft }, disabled && { opacity: 0.5 }]}>
    <Text style={{ color: secondary ? colors.ink : '#FFFFFF', fontWeight: '700', textAlign: 'center' }}>{title}</Text>
  </Pressable>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={ui.card}>{children}</View>; }
export function Page({ children }: { children: ReactNode }) {
  const { error, isLoading, refreshData, isPreview } = useApp();
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={ui.page}
    refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { void refreshData(); }} />}>
    {isPreview && <Text style={[ui.note, { backgroundColor: '#FFF1C9', padding: 12, borderRadius: 10 }]}>Vista previa · datos locales de ejemplo · órdenes deshabilitadas</Text>}
    {error && <View accessibilityRole="alert" style={ui.card}>
      <Text style={{ color: colors.red }}>{error}</Text>
      <Button title="Reintentar conexión" onPress={() => { void refreshData(); }} secondary />
    </View>}
    {children}
    <Text style={ui.note}>Demo educativa · Humedad y coordenadas de ejemplo ficticias.</Text>
  </ScrollView>;
}
export function OrganizationPicker() {
  const { organization, memberships, selectOrganization } = useApp();
  return <View style={{ gap: 8 }}><Text style={ui.eyebrow}>ESTABLECIMIENTO</Text>
    <Text style={ui.heading}>{organization?.name ?? 'Sin establecimiento asignado'}</Text>
    <Text style={ui.body}>{organization?.region ?? 'Solicitá una membresía para ver los lotes.'}</Text>
    {memberships.length > 1 && <View style={ui.row}>{memberships.map(m =>
      <Button key={m.organization_id} title={m.organizations.name}
        secondary={m.organization_id !== organization?.id}
        onPress={() => { void selectOrganization(m.organization_id); }} />)}</View>}
  </View>;
}
export const ui = StyleSheet.create({
  page: { padding: 20, gap: 18, paddingBottom: 40, width: '100%', maxWidth: 920, alignSelf: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 12 },
  title: { fontSize: 32, fontWeight: '800', color: colors.ink, letterSpacing: -1 },
  heading: { fontSize: 21, fontWeight: '700', color: colors.ink },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  button: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.green, minHeight: 48 },
  input: { backgroundColor: colors.card, color: colors.ink, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, padding: 14, fontSize: 16, minHeight: 48 },
});
