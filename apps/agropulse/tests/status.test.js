const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
function source(file) {
  const m = new Module(file, module);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
  return m.exports;
}
const { calculatePlotStatus } = source(require.resolve('../src/utils/status.ts'));
const { isPointInPolygon } = source(require.resolve('../src/utils/geometry.ts'));
test('Semáforo real: umbrales, límites y falta de datos', () => {
  const recent = new Date().toISOString();
  for (const [value, expected] of [[18,'dry'],[25,'optimal'],[45,'optimal'],[46,'wet']])
    assert.equal(calculatePlotStatus(recent,value,25,45).status,expected);
  assert.equal(calculatePlotStatus(null,30).status,'stale');
  assert.equal(calculatePlotStatus('invalid',30).status,'stale');
  assert.equal(calculatePlotStatus(new Date(Date.now()-16*60*1000).toISOString(),18).status,'stale');
});
test('Geocerca: punto interior, exterior y polígono vacío', () => {
  const polygon = [{latitude:0,longitude:0},{latitude:0,longitude:2},{latitude:2,longitude:2},{latitude:2,longitude:0}];
  assert.equal(isPointInPolygon({latitude:1,longitude:1},polygon),true);
  assert.equal(isPointInPolygon({latitude:3,longitude:1},polygon),false);
  assert.equal(isPointInPolygon({latitude:1,longitude:1},[]),false);
});
