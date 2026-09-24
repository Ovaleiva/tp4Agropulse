const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const { Kafka } = require('kafkajs');
const { createHash } = require('crypto');
const { nextMoisture, validTick } = require('./simulation');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Configurá Supabase en el .env del backend');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const kafka = new Kafka({ clientId: 'agropulse', brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',') });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'agropulse-ingest-v2' });
const mode = process.env.WORKER_MODE || 'all';
const disabled = new Set((process.env.DISABLED_STATIONS || '').split(',').filter(Boolean));
const failRate = Number(process.env.COMMAND_FAILURE_RATE || 0);
if (!Number.isFinite(failRate) || failRate < 0 || failRate > 1) throw new Error('COMMAND_FAILURE_RATE debe estar entre 0 y 1');
const moisture = new Map();
let stopping = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function checked(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function commandLoop() {
  while (!stopping) {
    try {
      const closed = await checked(db.rpc('close_due_valves'));
      if (closed) console.log('[Commands] cierre programado:', closed);
      const commands = await checked(db.from('irrigation_commands').select('id').eq('status', 'pending').limit(100));
      if (commands.length) {
        await sleep(1000);
        await Promise.all(commands.map(async command => {
          try {
            const status = await checked(db.rpc('apply_irrigation', {
              p_command_id: command.id, p_fail: Math.random() < failRate,
            }));
            console.log('[Commands]', command.id, status);
          } catch (error) { console.error('[Commands] se reintentará:', command.id, error.message); }
        }));
      }
    } catch (error) { console.error('[Commands]', error.message); }
    await sleep(500);
  }
}
async function simulate() {
  while (!stopping) {
    try {
      const stations = await checked(db.from('stations').select('id,plot_id'));
      const valves = await checked(db.from('valves').select('plot_id,status'));
      for (const station of stations) {
        if (disabled.has(station.id)) continue;
        if (!moisture.has(station.id)) {
          const rows = await checked(db.from('readings').select('moisture_pct').eq('station_id', station.id)
            .order('measured_at', { ascending: false }).limit(1));
          moisture.set(station.id, Number(rows[0]?.moisture_pct ?? 28));
        }
        const wet = valves.some(v => v.plot_id === station.plot_id && v.status === 'open');
        const value = nextMoisture(moisture.get(station.id), wet);
        moisture.set(station.id, value);
        const tick = { station_id: station.id, moisture_pct: value,
          temp_c: 24, rain_mm: 0, ts: new Date().toISOString() };
        await producer.send({ topic: 'soil.moisture', messages: [{ key: station.id, value: JSON.stringify(tick) }] });
        console.log('[Simulator] produced', station.id, value);
      }
    } catch (error) { console.error('[Simulator]', error.message); }
    await sleep(5000);
  }
}
async function main() {
  if (mode !== 'simulator') {
    await consumer.connect();
    await consumer.subscribe({ topic: 'soil.moisture', fromBeginning: true });
    await consumer.run({ eachMessage: async ({ topic, partition, message }) => {
      let tick;
      try { tick = JSON.parse(message.value.toString()); } catch { console.warn('[Consumer] JSON inválido'); return; }
      if (!validTick(tick)) { console.warn('[Consumer] tick inválido'); return; }
      const station = await checked(db.from('stations').select('id').eq('id', tick.station_id).maybeSingle());
      if (!station) { console.warn('[Consumer] estación desconocida:', tick.station_id); return; }
      const hex = createHash('sha256').update(`${topic}:${partition}:${message.offset}`).digest('hex');
      const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
      await checked(db.from('readings').upsert({ id, station_id: tick.station_id,
        measured_at: tick.ts, moisture_pct: tick.moisture_pct, temp_c: tick.temp_c,
        rain_mm: tick.rain_mm ?? 0, source: 'sensor' }, { onConflict: 'id' }));
      console.log('[Consumer] consumed / upsert reading', tick.station_id);
    } });
    void commandLoop();
  }
  if (mode !== 'consumer') { await producer.connect(); void simulate(); }
}
async function stop() {
  stopping = true;
  await Promise.allSettled([producer.disconnect(), consumer.disconnect()]);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
main().catch(error => { console.error(error); process.exit(1); });
