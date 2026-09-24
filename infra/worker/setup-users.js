// Run only against your own educational Supabase project after applying the SQL.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const password = process.env.TEST_USER_PASSWORD;
if (!password || password.includes('REEMPLAZAR') || password.length < 12) {
  throw new Error('Definí TEST_USER_PASSWORD de al menos 12 caracteres en el .env raíz');
}
const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
async function main() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 100) break;
  }
  for (const [email, role, org] of [
    ['productor@agropulse.test','producer','11111111-1111-1111-1111-111111111111'],
    ['operador@agropulse.test','operator','11111111-1111-1111-1111-111111111111'],
    ['asesor@agropulse.test','advisor','11111111-1111-1111-1111-111111111111'],
    ['externo@agropulse.test','producer','11111111-1111-1111-1111-111111111112'],
  ]) {
    let user = users.find(u => u.email === email);
    if (!user) {
      const result = await client.auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error) throw result.error;
      user = result.data.user;
    }
    const memberships = [{ user_id: user.id, organization_id: org, role }];
    if (email === 'productor@agropulse.test') memberships.push({ user_id: user.id,
      organization_id: '11111111-1111-1111-1111-111111111112', role: 'producer' });
    const result = await client.from('memberships').upsert(memberships, { onConflict: 'user_id,organization_id' });
    if (result.error) throw result.error;
    console.log('Usuario listo:', email, role);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
