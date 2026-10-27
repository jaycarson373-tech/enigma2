import { launchReceipt } from '@/lib/receipt-server.mjs';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(req:Request){try{return Response.json(await launchReceipt(new URL(req.url).searchParams.get('offering')),{headers:{'Cache-Control':'public, s-maxage=60'}})}catch{return Response.json({verified:false,reason:'Receipt history is refreshing. The pool account remains available.'},{status:503});}}
