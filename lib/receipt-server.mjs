import { address } from '@solana/kit';
import { cached, offering, rpc } from './server.mjs';
import { verifyLaunchReceipt } from './stonk-receipt.mjs';
export async function launchReceipt(key){
 key=String(address(key));
 return cached('receipt:'+key,60000,async()=>{
  const book=await offering(key);
  if(book.status!=='launched')return {verified:false,reason:'The pooled launch has not finalized.'};
  const rows=await rpc('getSignaturesForAddress',[key,{limit:100,commitment:'finalized'}]);
  const candidates=rows.filter(r=>!r.err && r.blockTime && Math.abs(r.blockTime-book.launchedAt)<60).slice(0,6);
  for(const row of candidates){
   const tx=await rpc('getTransaction',[row.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]);
   if(await verifyLaunchReceipt(tx,book))return {verified:true,signature:row.signature,slot:tx.slot,blockTime:tx.blockTime,offering:key,mint:book.mint,checkedAt:new Date().toISOString(),source:'Finalized Solana transaction: Enigma 2 launch and inner Stonk LaunchLab instructions'};
  }
  return {verified:false,reason:'The launch account is verified. Its atomic transaction receipt was not found in the available history.'};
 });
}
