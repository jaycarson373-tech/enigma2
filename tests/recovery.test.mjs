import {test} from 'node:test';import assert from 'node:assert/strict';
import {storageKey,loadPending,reconcile,retryOriginal} from '../lib/transactions.ts';
const map=new Map();globalThis.localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
const pending=()=>({wallet:'wallet-A',signature:'original-signature',wire:'original-wire',lastValid:'100',action:'deposit',offering:'',state:'unknown'});
test('wallet storage is isolated and unknown expired monetary outcomes block resubmission',async()=>{
 const p=pending();map.set(storageKey(p.wallet),JSON.stringify(p));assert.equal(loadPending('wallet-B'),null);
 const calls=[];globalThis.fetch=async(_,input)=>{const b=JSON.parse(input.body);calls.push(b);const result=b.method==='getSignatureStatuses'?{value:[null]}:101;return{json:async()=>({result})}};
 const r=await retryOriginal(p);assert.equal(r.state,'history-check');assert.equal(calls.some(x=>x.method==='sendTransaction'),false);
});
test('a valid original signature is reconciled before any rebroadcast',async()=>{
 const p=pending();globalThis.fetch=async(_,input)=>{let b=JSON.parse(input.body);assert.equal(b.method,'getSignatureStatuses');assert.equal(b.params[0][0],p.signature);return{json:async()=>({result:{value:[{err:null,confirmationStatus:'finalized'}]}})}};
 assert.equal((await retryOriginal(p)).state,'finalized');
});
