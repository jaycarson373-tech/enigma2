import { getBase58Encoder } from '@solana/kit';
import { PROGRAM, PUMP } from './constants.mjs';
import { discriminator } from './protocol.mjs';
const decoder=getBase58Encoder();
const programOf=i=>typeof i.programId==='string'?i.programId:i.programId?.toString();
async function isInstruction(i,name){try{const b=decoder.encode(i.data||'');const d=await discriminator('global:'+name);return d.every((v,n)=>b[n]===v);}catch{return false;}}
export async function verifyLaunchReceipt(tx,book){
 if(!tx?.meta || tx.meta.err || book.status!=='launched')return false;
 const top=tx.transaction?.message?.instructions||[];
 for(let index=0;index<top.length;index++){
  const ix=top[index];
  if(programOf(ix)!==PROGRAM || !await isInstruction(ix,'launch') || ix.accounts?.[1]!==book.mint || ix.accounts?.[2]!==book.address)continue;
  const inner=(tx.meta.innerInstructions||[]).find(g=>g.index===index)?.instructions||[];
  const pump=inner.filter(i=>programOf(i)===PUMP && i.accounts?.includes(book.mint));
  let created=false,bought=false;
  for(const i of pump){created ||= await isInstruction(i,'create_v2')||await isInstruction(i,'create');
   for(const name of ['buy','buy_v2','buy_v3','buy_exact_sol_in','buy_exact_quote_in_v2','buy_exact_quote_in_v3'])bought ||= await isInstruction(i,name);}
  if(created && (BigInt(book.raised)===0n || bought))return true;
 }
 return false;
}
