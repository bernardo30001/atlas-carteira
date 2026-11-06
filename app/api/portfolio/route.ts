import { getChatGPTUser } from '../../chatgpt-auth';
import { getDb } from '../../../db';
import { portfolios } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { EMPTY } from '../../lib/model';
import {requestSchema as schema} from '../../lib/validation';
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
  let body;try{const raw=await request.text();if(raw.length>2000000)return respond({error:'Arquivo muito grande'},413);body=schema.parse(JSON.parse(raw));}catch{return respond({error:'Confira os valores, moedas, quantidades, datas e metas (total de 100%).'},400);}
  try{
    const db=getDb(),payload=JSON.stringify(body.portfolio),now=new Date().toISOString();
    await db.insert(portfolios).values({userId:user.userId,payload:JSON.stringify(EMPTY),revision:0,updatedAt:now}).onConflictDoNothing();
    const saved=await db.update(portfolios).set({payload,revision:sql`${portfolios.revision}+1`,updatedAt:now}).where(and(eq(portfolios.userId,user.userId),eq(portfolios.revision,body.revision))).returning({revision:portfolios.revision});
    if(!saved.length)return respond({error:'A carteira mudou em outra aba. Recarregue a página antes de salvar.'},409);
    return respond({revision:saved[0].revision});
  }catch{return respond({error:'Não foi possível salvar. Mantenha esta tela aberta e tente novamente.'},503);}
}
