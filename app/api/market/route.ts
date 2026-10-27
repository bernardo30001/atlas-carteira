import { ASSETS, metrics, type Quote, type Market } from '../../lib/model';
let memory:Market|undefined;
let pending:Promise<Market>|undefined;
const SYMBOLS=[...ASSETS.map(a=>({ticker:a.ticker,symbol:a.symbol})),{ticker:'USD',symbol:'BRL=X'},{ticker:'SP500',symbol:'^GSPC'},{ticker:'IBOV',symbol:'^BVSP'}];
async function quote(ticker:string,symbol:string):Promise<Quote>{
  let last:unknown;
  for(const host of ['query1','query2']){
    try{
      const r=await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(9000)});
      if(!r.ok)throw new Error(`Fonte: ${r.status}`);
      const data=await r.json() as any,result=data.chart?.result?.[0],meta=result?.meta;
      if(!(meta?.regularMarketPrice>0))throw new Error('Sem cotação');
      const closes=result.indicators?.adjclose?.[0]?.adjclose??result.indicators?.quote?.[0]?.close??[];
      const history=(result.timestamp??[]).map((t:number,i:number)=>({date:new Date(t*1000).toISOString().slice(0,10),close:closes[i]})).filter((p:any)=>Number.isFinite(p.close)&&p.close>0);
      const raw=result.indicators?.quote?.[0]?.close??[];
      const valid=raw.map((c:number,i:number)=>({c,t:result.timestamp?.[i]})).filter((p:any)=>p.c>0);
      const sessionDay=new Date(meta.regularMarketTime*1000).toISOString().slice(0,10);
      const prior=valid.filter((p:any)=>new Date(p.t*1000).toISOString().slice(0,10)<sessionDay).at(-1)?.c;
      const stated=Number.isFinite(meta.regularMarketChangePercent)?meta.regularMarketChangePercent:undefined;
      const prev=stated!==undefined&&stated>-100?meta.regularMarketPrice/(1+stated/100):(prior??meta.previousClose??0);
      return {ticker,price:meta.regularMarketPrice,previous:prev,change:stated??(prev?(meta.regularMarketPrice/prev-1)*100:0),currency:meta.currency,time:meta.regularMarketTime,source:'Yahoo Finance',delay:meta.exchangeDataDelayedBy??null,history,...metrics(history,ticker==='BTC'?365:252)};
    }catch(e){last=e;}
  }
  throw last;
}
async function refresh():Promise<Market>{
  const quotes:Record<string,Quote>={},errors:string[]=[];
  for(let i=0;i<SYMBOLS.length;i+=4){await Promise.all(SYMBOLS.slice(i,i+4).map(async a=>{try{quotes[a.ticker]=await quote(a.ticker,a.symbol);}catch{errors.push(a.ticker);if(memory?.quotes[a.ticker])quotes[a.ticker]={...memory.quotes[a.ticker],stale:true};}}));}
  memory={quotes,errors,fetchedAt:new Date().toISOString()};return memory;
}
export async function GET(){
  if(memory&&Date.now()-Date.parse(memory.fetchedAt)<55000)return Response.json(memory,{headers:{'Cache-Control':'private, max-age=10'}});
  if(!pending)pending=refresh().finally(()=>{pending=undefined});
  return Response.json(await pending,{headers:{'Cache-Control':'private, max-age=10'}});
}
