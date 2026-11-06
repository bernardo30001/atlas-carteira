import {ASSETS} from './model.ts';
import {parseFundamentals,parseScreening,peerReference,freshFundamentals} from './fundamentals.ts';
import type {Fundamentals,FundamentalData} from './evaluation-config.ts';
let memory:FundamentalData|undefined,pending:Promise<FundamentalData>|undefined;
async function html(path:string,deadline:number){
 const available=deadline-Date.now();if(available<=0)throw Error('Tempo de consulta esgotado');
 const r=await fetch('https://www.fundamentus.com.br/'+path,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},signal:AbortSignal.timeout(Math.min(6000,available))});
 if(!r.ok)throw Error('Fonte indisponível');const bytes=await r.arrayBuffer();if(bytes.byteLength>1500000)throw Error('Resposta inválida');return new TextDecoder('windows-1252').decode(bytes);
}
async function batched<T>(items:T[],task:(item:T)=>Promise<void>){for(let i=0;i<items.length;i+=4)await Promise.allSettled(items.slice(i,i+4).map(task));}
async function refresh():Promise<FundamentalData>{
 const deadline=Date.now()+25000;
 const items:Record<string,Fundamentals>={},errors:string[]=[],pool:Record<string,Fundamentals>={};
 await batched(ASSETS.filter(a=>a.group==='br'),async a=>{try{const f=parseFundamentals(await html('detalhes.php?papel='+a.ticker,deadline),a.ticker);items[a.ticker]=f;pool[a.ticker]=f;}catch{errors.push(a.ticker+' · indicadores indisponíveis');}});
 const segments=[...new Set(ASSETS.map(a=>items[a.ticker]?.segmentId).filter((id):id is string=>!!id))],candidates=new Map<string,string[]>();
 await batched(segments,async segment=>{try{candidates.set(segment,parseScreening(await html('resultado.php?segmento='+segment,deadline)).filter(r=>r.pe!==null&&r.pe>=2&&r.pe<=60&&r.liquidity>=200000&&!Object.values(pool).some(f=>f.ticker.slice(0,4)===r.ticker.slice(0,4))).slice(0,3).map(r=>r.ticker));}catch{errors.push('Pares do segmento '+segment+' indisponíveis');}});
 // Bound external fetches; all candidates are revalidated against dated detail pages.
 const selected:string[]=[];
 // Round-robin by the fixed catalog order, never by network completion order.
 for(let slot=0;slot<3;slot++)for(const segment of segments){const ticker=candidates.get(segment)?.[slot];if(ticker&&!selected.includes(ticker)&&selected.length<20)selected.push(ticker);}
 await batched(selected,async ticker=>{try{pool[ticker]=parseFundamentals(await html('detalhes.php?papel='+ticker,deadline),ticker);}catch{}});
 const peers:FundamentalData['peers']={};
 for(const f of Object.values(items)){const ref=peerReference(f,Object.values(pool));if(ref)peers[f.ticker]=ref;if(!freshFundamentals(f))errors.push(f.ticker+' · datas ausentes ou antigas');}
 return {items,peers,errors,fetchedAt:new Date().toISOString()};
}
export async function loadFundamentals(){
 if(memory&&Date.now()-Date.parse(memory.fetchedAt)<(memory.errors.length?60000:3600000))return memory;
 if(!pending)pending=refresh().then(data=>{if(Object.keys(data.items).length)memory=data;return data;}).finally(()=>{pending=undefined});
 return pending;
}
