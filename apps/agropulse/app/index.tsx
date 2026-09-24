import { useState } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase, isConfigured } from '../src/lib/supabase';
import { Card, Button, ui, colors } from '../src/components/FieldUI';
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const login = async () => {
    if (!email.trim() || !password) { setError('Completá tu correo y contraseña.'); return; }
    setBusy(true); setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.page, { paddingTop: 70 }]}>
      <Text style={ui.eyebrow}>AGROPULSE / AGRICULTURA DE PRECISIÓN</Text>
      <Text style={[ui.title, { fontSize: 46 }]}>Tu campo.{'\n'}Más cerca.</Text>
      <Text style={ui.body}>Humedad, lotes y riego en un solo lugar.</Text>
      <Card><Text style={ui.heading}>Ingresá a tu establecimiento</Text>
        {!isConfigured && <Text style={{ color: colors.red }}>Falta configurar Supabase en el archivo de entorno de la app.</Text>}
        <Text style={ui.note}>Correo electrónico</Text>
        <TextInput style={ui.input} accessibilityLabel="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Text style={ui.note}>Contraseña</Text>
        <TextInput style={ui.input} accessibilityLabel="Contraseña" secureTextEntry value={password} onChangeText={setPassword} />
        {!!error && <Text accessibilityRole="alert" style={{ color: colors.red }}>{error}</Text>}
        <Button title={busy ? 'Ingresando…' : 'Ingresar'} disabled={busy || !isConfigured} onPress={() => { void login(); }} />
      </Card>
      <View style={ui.card}><Text style={ui.eyebrow}>UN CAMPO DE PRÁCTICA</Text>
        <Text style={ui.body}>Demo educativa con sensores y válvulas simulados. Los datos y las coordenadas de ejemplo son ficticios.</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
