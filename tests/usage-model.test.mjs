import test from 'node:test';
import assert from 'node:assert/strict';
import { usageModel } from '../server/usage.mjs';
import { languageReadinessModel } from '../server/language-readiness.mjs';

test('publication counts scale with assignment size and do not invent spend', () => {
  const model = usageModel({ metrics: { assigned: 12, responses: 9, matches: 7, clarifications: 2, pending: 3 } });
  assert.equal(model.units.find(unit => unit.key === 'responses').percent, 75);
  assert.ok(model.units.every(unit => unit.limit === 12));
  assert.equal(model.spend.estimated.amount, null);
  assert.ok(usageModel().units.every(unit => unit.percent === 0));
});

test('blank language artifacts cannot pass the content presence check', () => {
  const model = languageReadinessModel({ publication: { snapshot: { title: 'Title', source: ' ', question: 'Question', languages: { ar: { title: 'Title', text: '', question: 'Question' } } } } });
  assert.equal(model.languages.find(language => language.code === 'en').content.state, 'missing');
  assert.equal(model.languages.find(language => language.code === 'ar').content.state, 'missing');
  assert.equal(model.realDataAllowed, false);
});
