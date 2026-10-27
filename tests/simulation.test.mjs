import test from 'node:test';
import assert from 'node:assert/strict';
import {requireSimulation,requireLamports,requireNetworkFee} from '../lib/simulation.mjs';
const good=()=>({context:{slot:123},value:{err:null,unitsConsumed:230110}});
test('Only explicit fresh successful execution is accepted for wallet review',()=>{assert.equal(requireSimulation(good(),120).unitsConsumed,230110);for(const r of [null,{}, {value:{err:null,unitsConsumed:12}}, {context:{slot:123},value:{unitsConsumed:12}}, {context:{slot:123},value:{err:{InstructionError:[0,'Custom']},unitsConsumed:12}}, {context:{slot:123},value:{err:null}}, {context:{slot:123},value:{err:null,unitsConsumed:1400001}}])assert.throws(()=>requireSimulation(r),/Nothing was submitted/);assert.throws(()=>requireSimulation(good(),124),/Nothing was submitted/);});
test('Unverified balances or network fees cannot become an approval amount',()=>{assert.equal(requireLamports(1000000),1000000n);assert.equal(requireNetworkFee(10000),10000n);for(const v of [undefined,null,-1,1.5,Number.MAX_SAFE_INTEGER+1,'10000'])assert.throws(()=>requireLamports(v));for(const v of [0,1000001,undefined])assert.throws(()=>requireNetworkFee(v));});
