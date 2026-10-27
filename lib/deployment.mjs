import { createHash } from 'node:crypto';
import { getBase58Decoder } from '@solana/kit';
import { PROGRAM_DATA, DEPLOYMENT_SLOT, CODE_HASH } from './constants.mjs';
import { bytes64 } from './protocol.mjs';
export const MAINNET_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
export function verifyDeployment(genesis, program, data) {
  if(genesis!==MAINNET_GENESIS) throw Error('The RPC does not match Solana mainnet.');
  if(!program?.executable || program.owner!==LOADER) throw Error('The launch program is unavailable. Wallet actions are paused.');
  const p=bytes64(program.data[0]);
  if(p.length!==36 || new DataView(p.buffer,p.byteOffset,p.byteLength).getUint32(0,true)!==2 || getBase58Decoder().decode(p.slice(4))!==PROGRAM_DATA) throw Error('The launch program identity changed. A new review is required.');
  if(!data) throw Error('The launch program data is unavailable. Wallet actions are paused.');
  if(data.owner!==LOADER || data.executable) throw Error('The program-data owner could not be verified.');
  const b=bytes64(data.data[0]);
  if(b.length<49 || new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0,true)!==3) throw Error('Invalid program-data account.');
  const slot=new DataView(b.buffer,b.byteOffset,b.byteLength).getBigUint64(4,true);
  const hash=createHash('sha256').update(b.slice(45)).digest('hex');
  if(slot!==DEPLOYMENT_SLOT || hash!==CODE_HASH) throw Error('The protocol was upgraded. A new version review is required before transactions.');
  return {deploymentSlot:String(slot),codeHash:hash};
}
export function failClosed(state) {
  return state.stale ? {...state,writesEnabled:false,filingEnabled:false,reason:'Protocol verification is stale. Wallet actions are paused until the recheck passes.'}:state;
}
