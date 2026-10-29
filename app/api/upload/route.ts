import { sameOrigin } from '@/lib/http.mjs';
import { createHash } from 'node:crypto';
import { put, head } from '@vercel/blob';
import sharp from 'sharp';
export const runtime='nodejs';
export const maxDuration=30;
async function store(path:string,bytes:Uint8Array,type:string){
  try{return await put(path,Buffer.from(bytes),{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:type,cacheControlMaxAge:31536000});}
  catch(e:any){if(e.name==='BlobAlreadyExistsError')return await head(path);throw e;}
}
export async function POST(req:Request){
  if(!sameOrigin(req))return Response.json({error:'Origin not allowed'},{status:403});
  try{
    if(!process.env.BLOB_READ_WRITE_TOKEN)return Response.json({error:'Image hosting is not configured. Your details are kept; no wallet payment was requested.'},{status:503});
    if(Number(req.headers.get('content-length')||0)>2500000)throw Error('Use an image smaller than 2 MB.');
    const form=await req.formData(),file=form.get('file');
    if(!(file instanceof File)||file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP under 2 MB.');
    const name=String(form.get('name')||'').trim(),symbol=String(form.get('symbol')||'').trim();
    if(!name||Buffer.byteLength(name)>32||!/^[A-Za-z0-9]{1,10}$/.test(symbol))throw Error('Enter a name up to 32 bytes and ticker up to 10 letters or digits.');
    const source=Buffer.from(await file.arrayBuffer());
    const info=await sharp(source,{limitInputPixels:20000000}).metadata();
    if(!['png','jpeg','webp'].includes(info.format||''))throw Error('Use a valid PNG, JPG or WebP image.');
    const bytes=await sharp(source,{limitInputPixels:20000000}).rotate().resize(800,800,{fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
    const hash=createHash('sha256').update(bytes).digest('hex');
    const image=await store('coins/'+hash+'.webp',bytes,'image/webp');
    const metadata:Record<string,string|boolean>={name,symbol,description:String(form.get('description')||'').slice(0,1000),image:image.url,showName:true,createdOn:process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : new URL(req.url).origin)};
    for(const k of ['twitter','website']){const v=String(form.get(k)||'');if(v){const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use HTTPS social links.');metadata[k]=u.toString();}}
    const json=Buffer.from(JSON.stringify(metadata)),id=createHash('sha256').update(json).digest('hex');
    const saved=await store('metadata/'+id+'.json',json,'application/json');
    return Response.json({uri:saved.url},{headers:{'Cache-Control':'no-store'}});
  }catch(e:any){const known=/^(Choose |Use |Enter )/.test(e.message);return Response.json({error:known?e.message:'The image host could not finish. Your details are kept; retry without a new payment.'},{status:400});}
}
