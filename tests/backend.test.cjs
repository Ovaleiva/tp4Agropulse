const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { nextMoisture, validTick } = require('../infra/worker/simulation');

test('Simulación: el riego aumenta humedad y respeta límites', () => {
  assert.equal(nextMoisture(18,true,()=>0.5),18.7);
  assert.ok(nextMoisture(18,false,()=>0.5)<18);
  assert.equal(nextMoisture(65,true,()=>0.5),65);
  assert.equal(nextMoisture(0,false,()=>0.5),0);
  assert.ok(!validTick({ station_id:'unknown', ts:'bad', moisture_pct:18,temp_c:24 }));
});

test('Postgres: RLS, idempotencia, permisos y cierre transaccional', async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;
      CREATE PUBLICATION supabase_realtime;`);
    // PGlite lacks uuid-ossp; supply its UUID default with Postgres' built-in equivalent.
    await db.exec('CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;');
    const initial = fs.readFileSync('supabase/migrations/01_initial_schema.sql','utf8')
      .replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";','');
    await db.exec(initial);
    await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;');
    await db.exec(fs.readFileSync('supabase/migrations/02_reliable_irrigation.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/seed.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/seed_demo_extra.sql','utf8'));
    const producer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const advisor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    const outsider='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
    const operator='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
    const valve='44444444-4444-4444-4444-444444444442';
    const plot='22222222-2222-2222-2222-222222222222';
    const request='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
    await db.exec(`INSERT INTO auth.users VALUES('${producer}'),('${advisor}'),('${outsider}'),('${operator}');
      INSERT INTO memberships(user_id,organization_id,role) VALUES
      ('${producer}','11111111-1111-1111-1111-111111111111','producer'),
      ('${advisor}','11111111-1111-1111-1111-111111111111','advisor'),
      ('${outsider}','11111111-1111-1111-1111-111111111112','producer'),
      ('${operator}','11111111-1111-1111-1111-111111111111','operator');`);
    const login = async id => { await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub='${id}';`); };
    const send = (req=request,minutes=1) => db.query(`SELECT * FROM request_irrigation($1,'open',$2,$3)`,[valve,minutes,req]);
    await login(producer);
    const first=(await send()).rows[0];
    assert.equal(first.status,'pending');
    assert.equal((await send()).rows[0].id,first.id,'same request returns same command');
    await assert.rejects(send(request,2),/otros datos/);
    await assert.rejects(send('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),/pendiente/);
    await assert.rejects(db.exec(`UPDATE irrigation_commands SET status='applied' WHERE id='${first.id}'`),/permission denied/);
    await assert.rejects(db.exec(`SELECT apply_irrigation('${first.id}',false)`),/permission denied/);
    await login(advisor);
    assert.equal((await db.query('SELECT * FROM plots')).rows.length,3);
    await assert.rejects(send(),/permiso/);
    assert.equal((await db.query('UPDATE plots SET threshold_min=26 RETURNING id')).rows.length,0);
    await login(outsider);
    const outsidePlots = (await db.query('SELECT * FROM plots')).rows;
    assert.equal(outsidePlots.length,1);
    assert.equal(outsidePlots[0].name,'Escuela 1');
    assert.equal((await db.query('SELECT * FROM irrigation_commands')).rows.length,0);
    await login(operator);
    assert.equal((await db.query(`UPDATE plots SET threshold_min=26 WHERE id='${plot}' RETURNING id`)).rows.length,1);
    await assert.rejects(db.exec(`UPDATE plots SET organization_id=gen_random_uuid() WHERE id='${plot}'`),/permission denied/);
    await db.exec(`RESET ROLE;
      CREATE FUNCTION public.reject_test_apply() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status='applied' THEN RAISE EXCEPTION 'test write failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_apply BEFORE UPDATE ON public.irrigation_commands
        FOR EACH ROW EXECUTE FUNCTION public.reject_test_apply();
      SET ROLE service_role;`);
    await assert.rejects(db.query('SELECT apply_irrigation($1,false)',[first.id]), /test write failure/);
    assert.equal((await db.query('SELECT status FROM valves WHERE id=$1',[valve])).rows[0].status,'closed');
    assert.equal((await db.query('SELECT status FROM irrigation_commands WHERE id=$1',[first.id])).rows[0].status,'pending');
    await db.exec('RESET ROLE; DROP TRIGGER reject_test_apply ON public.irrigation_commands; SET ROLE service_role;');
    await db.query('SELECT apply_irrigation($1,false)',[first.id]);
    const open=(await db.query('SELECT * FROM valves WHERE id=$1',[valve])).rows[0];
    assert.equal(open.status,'open'); assert.ok(open.closes_at);
    await db.query('SELECT apply_irrigation($1,false)',[first.id]);
    assert.equal(String((await db.query('SELECT closes_at FROM valves WHERE id=$1',[valve])).rows[0].closes_at),String(open.closes_at));
    await db.exec(`UPDATE valves SET closes_at=now()-interval '1 second' WHERE id='${valve}'`);
    await db.query('SELECT close_due_valves()');
    assert.equal((await db.query('SELECT status FROM valves WHERE id=$1',[valve])).rows[0].status,'closed');
    await login(producer);
    const second=(await send('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')).rows[0];
    await db.query('SELECT cancel_irrigation($1)',[second.id]);
    await db.exec('RESET ROLE; SET ROLE service_role;');
    assert.equal((await db.query('SELECT apply_irrigation($1,false) as status',[second.id])).rows[0].status,'cancelled');
    await login(producer);
    const third=(await send('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3')).rows[0];
    await db.exec('RESET ROLE; SET ROLE service_role;');
    assert.equal((await db.query('SELECT apply_irrigation($1,true) as status',[third.id])).rows[0].status,'failed');
    assert.equal((await db.query('SELECT status FROM valves WHERE id=$1',[valve])).rows[0].status,'closed');
    await login(producer);
    const series=await db.query("SELECT * FROM reading_history('33333333-3333-3333-3333-333333333332')");
    assert.ok(series.rows.length>=12);
    t.diagnostic('Verified real SQL functions and row policies in embedded PostgreSQL; Supabase Auth/Realtime transport excluded.');
  } finally { await db.close(); }
});
