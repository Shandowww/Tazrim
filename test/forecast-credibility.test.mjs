import test from 'node:test';
import assert from 'node:assert/strict';
import {cashAccountForecast, cashAccountValues, forecast, graphTimeline, monthlyValues, validatePlan, zero} from '../src/budget.js';

const startMonth = '2026-10';
const savedEstimateMonth = '2026-11';
const unreportedMonth = '2026-12';
const accountId = 'bank';
const report = (values, actual) => ({values: {...zero(), ...values}, actual, includesPlannedCard: false, includesPlannedDirect: false});
const plan = () => ({
 startMonth, opening: 0, buffer: 0, horizon: 12, defaults: zero(), months: {},
 expenses: [], demo: false
});

test('Only configured recurring other income fills unreported aggregate and account months', () => {
 const p = plan();
 p.months[startMonth] = report({salary: 8500, otherIncome: 1000}, true);
 p.months[savedEstimateMonth] = report({salary: 8500, otherIncome: 600}, false);
 p.cashPlanning = {
  accounts: [{id: accountId, label: 'בנק', opening: 0, buffer: 0, defaults: zero()}],
  months: Object.fromEntries(Object.entries(p.months).map(([month, record]) => [month, {[accountId]: record}])),
  cardAccounts: {}, transfers: []
 };
 assert.equal(validatePlan(p), true);
 const before = structuredClone(p);
 const incomes = rows => rows.slice(0, 3).map(row => row.income);
 assert.deepEqual(incomes(forecast(p)), [9500, 9100, 8500]);
 assert.deepEqual(incomes(cashAccountForecast(p, accountId)), [9500, 9100, 8500]);
 assert.deepEqual(p, before);

 p.defaults.otherIncome = 75;
 p.cashPlanning.accounts[0].defaults.otherIncome = 75;
 assert.deepEqual(incomes(forecast(p)), [9500, 9100, 8575]);
 assert.deepEqual(incomes(cashAccountForecast(p, accountId)), [9500, 9100, 8575]);

 p.months[unreportedMonth] = report({salary: 8500}, false);
 p.cashPlanning.months[unreportedMonth] = {[accountId]: p.months[unreportedMonth]};
 assert.equal(monthlyValues(p, unreportedMonth).otherIncome, 0);
 assert.equal(cashAccountValues(p, accountId, unreportedMonth).values.otherIncome, 0);
});

test('Estimated graph net uses the forecast including pending savings while actual net keeps reported semantics', () => {
 const p = plan();
 p.months[startMonth] = report({salary: 1500, personalSaving: 100}, true);
 p.savingTransfers = [
  {month: startMonth, status: 'pending', personal: 50, shared: 25},
  {month: savedEstimateMonth, status: 'pending', personal: 75, shared: 25}
 ];
 p.expenses = [
  {id: 'income', name: 'הכנסה מתוכננת', amount: 40, fees: 0, firstMonth: savedEstimateMonth, payments: 1, source: 'direct', kind: 'income'},
  {id: 'expense', name: 'הוצאה מתוכננת', amount: 20, fees: 0, firstMonth: savedEstimateMonth, payments: 1, source: 'direct', kind: 'expense'}
 ];
 const [actual, estimated] = graphTimeline(p, {startMonth, endMonth: savedEstimateMonth, asOf: startMonth, includeEstimates: true});
 const [currentProjection, futureProjection] = forecast(p);
 assert.equal(actual.actual, true);
 assert.equal(actual.values.net, 1400);
 assert.equal(currentProjection.net, 1325);
 assert.equal(estimated.estimated, true);
 assert.equal(estimated.values.net, futureProjection.net);
 assert.equal(estimated.values.net, 1320);
 assert.equal(estimated.values.balance - actual.values.balance, estimated.values.net);
});
