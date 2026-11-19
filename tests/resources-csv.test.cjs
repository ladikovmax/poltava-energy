const test = require('node:test');
const assert = require('node:assert/strict');
global.window = {EnergyStorage: {keys: {publication: 'test-publication'}}};
require('../dist/js/publication.js');
const {asCsv, importData, parseCsv, plan} = window.PublicationData;

const header = 'uid,date,organizationName,organizationId,providerName,providerId,meterNumber,type,quantity,unitName';
const source = header + '\r\n' +
  '0001,2026-03-31,"Заклад, корпус 1",00000001,"ТОВ ""Приклад""",00000002,00031,Вода,0.0,кубічний метр\r\n';

test('the blank report uses the ten archive columns in publication order', () => {
  assert.equal(asCsv([]), header + '\r\n');
});

test('previous publication preserves identifiers, decimal text and quoted names', () => {
  const state = {journal: [], base: [], rules: []};
  assert.equal(importData(state, source, 'base'), 1);
  assert.equal(importData(state, source, 'base'), 0);
  const {output, blocked} = plan(state);
  assert.equal(blocked, 0);
  assert.equal(asCsv(output), source);
});

test('original published values remain visible when a record needs review', () => {
  const state = {journal: [], base: [], rules: []};
  const historical = source.replace(',00031,Вода,', ',    null,Вода ,');
  importData(state, historical, 'base');
  const {output, blocked} = plan(state);
  assert.equal(blocked, 1);
  assert.deepEqual(parseCsv(asCsv(output)), parseCsv(historical));
});
