function nextMoisture(current, irrigating, random = Math.random) {
  return Math.round(Math.max(0, Math.min(65, current + (irrigating ? 0.7 : -0.015) + (random() - 0.5) * 0.08)) * 100) / 100;
}
function validTick(data) {
  return data && typeof data.station_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.station_id) &&
    Number.isFinite(Date.parse(data.ts)) && Number.isFinite(data.moisture_pct) &&
    data.moisture_pct >= 0 && data.moisture_pct <= 100 && Number.isFinite(data.temp_c) &&
    (data.rain_mm == null || (Number.isFinite(data.rain_mm) && data.rain_mm >= 0));
}
module.exports = { nextMoisture, validTick };
