import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { portfolios } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ASSETS,EMPTY,today } from '../../lib/model';
import { z } from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s&&s<=today(),'Data inválida ou futura');
const amount=z.number().finite().min(0).max(1e12);
const schema=z.object({
  revision:z.number().int().min(0),
  portfolio:z.object({
    transactions:z.array(z.object({id:z.string().uuid(),ticker:z.string().refine(s=>ASSETS.some(a=>a.ticker===s)),kind:z.enum(['opening','buy']),quantity:z.number().positive().max(1e12),price:z.number().positive().max(1e12),fx:z.number().positive().max(10000),fees:amount,date,note:z.string().max(200)}).superRefine((t,c)=>{const a=ASSETS.find(a=>a.ticker===t.ticker);if(a?.currency==='BRL'&&t.fx!==1)c.addIssue({code:'custom',message:'Câmbio de ativo brasileiro deve ser 1'});if(a?.group==='br'&&!Number.isInteger(t.quantity))c.addIssue({code:'custom',message:'Ações brasileiras exigem quantidade inteira'});})).max(10000),
    fixedIncome:z.array(z.object({id:z.string().uuid(),name:z.string().min(1).max(100),cost:amount,value:amount,date,updatedAt:date}).refine(r=>r.updatedAt>=r.date,'Atualização anterior ao cadastro')).max(1000),
    targets:z.object({br:amount.max(100),rf:amount.max(100),etf:amount.max(100),crypto:amount.max(100)}).refine(t=>Math.abs(Object.values(t).reduce((a,b)=>a+b,0)-100)<0.001,'Metas devem somar 100%'),
    weights:z.record(z.number().finite().min(0).max(100)).refine(w=>ASSETS.every(a=>{const list=ASSETS.filter(b=>b.group===a.group);return list.some(b=>(w[b.ticker]??1)>0)}),'Cada classe precisa ter algum peso positivo'),
  }).superRefine((p,c)=>{const ids=[...p.transactions,...p.fixedIncome].map(x=>x.id);if(new Set(ids).size!==ids.length)c.addIssue({code:'custom',message:'Registros duplicados'});}),
});
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
  const user=await getChatGPTUser();if(!user)return respond({error:'Entre com sua conta para carregar a carteira.'},401);
  try{const row=await getDb().select().from(portfolios).where(eq(portfolios.userId,user.userId)).get();return respond({portfolio:row?JSON.parse(row.payload):EMPTY,revision:row?.revision??0,name:user.displayName});}
  catch{return respond({error:'Não foi possível carregar a carteira. Seus dados não foram substituídos.'},503);}
}
export async function PUT(request:Request){
  const user=await getChatGPTUser();if(!user)return respond({error:'Entre com sua conta para salvar.'},401);
  if(request.headers.get('origin')&&new URL(request.url).origin!==request.headers.get('origin'))return respond({error:'Origem inválida'},403);
  if(Number(request.headers.get('content-length'))>2000000)return respond({error:'Arquivo muito grande'},413);
  let body;try{const raw=await request.text();if(raw.length>2000000)return respond({error:'Arquivo muito grande'},413);body=schema.parse(JSON.parse(raw));}catch{return respond({error:'Confira os valores: quantidades e preços positivos, datas válidas e metas somando 100%.'},400);}
  try{
    const db=getDb(),payload=JSON.stringify(body.portfolio),now=new Date().toISOString();
    await db.insert(portfolios).values({userId:user.userId,payload:JSON.stringify(EMPTY),revision:0,updatedAt:now}).onConflictDoNothing();
    const saved=await db.update(portfolios).set({payload,revision:sql`${portfolios.revision}+1`,updatedAt:now}).where(and(eq(portfolios.userId,user.userId),eq(portfolios.revision,body.revision))).returning({revision:portfolios.revision});
    if(!saved.length)return respond({error:'A carteira mudou em outra aba. Recarregue a página antes de salvar.'},409);
    return respond({revision:saved[0].revision});
  }catch{return respond({error:'Não foi possível salvar. Mantenha esta tela aberta e tente novamente.'},503);}
}
