import {ASSETS,totals,type Portfolio,type Market} from './model.ts';
export const PERFORMANCE_SCOPES=[
 {key:'all',name:'Tudo agregado',description:'Toda a carteira, incluindo renda fixa e ETFs na B3.'},
 {key:'us',name:'Ações/ETFs americanos',description:'Ativos negociados em dólar, convertidos para reais com o câmbio de cada observação.'},
 {key:'br',name:'Ações na B3',description:'Somente ações brasileiras; ETFs na B3 ficam no consolidado.'},
 {key:'btc',name:'Bitcoin',description:'Somente Bitcoin direto (BTC). ABTC11 permanece no consolidado.'},
] as const;
export type PerformanceScope=typeof PERFORMANCE_SCOPES[number]['key'];
type Segment=Exclude<PerformanceScope,'all'>;
export function performancePortfolio(p:Portfolio,scope:PerformanceScope):Portfolio{
 if(scope==='all')return p;
 const matches=(ticker:string)=>{const asset=ASSETS.find(a=>a.ticker===ticker);return scope==='btc'?ticker==='BTC':scope==='br'?asset?.group==='br':asset?.currency==='USD'&&ticker!=='BTC';};
 return {...p,transactions:p.transactions.filter(t=>matches(t.ticker)),incomes:(p.incomes??[]).filter(i=>matches(i.ticker)),fixedIncome:[],tradeHistory:p.tradeHistory?.filter(e=>matches(e.ticker))};
}
export type BenchmarkKey='ibov'|'sp500'|'bitcoin'|'cdi';
export type Benchmarks=Partial<Record<Exclude<BenchmarkKey,'cdi'>,number>>;
export type TrackedHolding={ticker:string;quantity:number};
export type TrackedFixed={id:string;value:number;cost:number|null};
export type PerformanceState={startedAt:string;capturedAt:string;unitIndex:number;value:number;totalFlow:number;holdings:TrackedHolding[];fixed:TrackedFixed[];incomeIds:string[];portfolioRevision:number;segments?:Partial<Record<Segment,PerformanceState>>};
export type SegmentPoint={startedAt:string;value:number;index:number;flow:number;income:number;baseline:boolean};
export type RecordedPoint={time:string;value:number;index:number;flow:number;income:number;benchmarks:Benchmarks;baseline:boolean;segments?:Partial<Record<Segment,SegmentPoint>>};
export type PerformanceData={points:RecordedPoint[];startedAt:string;updatedAt:string;warnings:string[];error?:string};
export type ChartPoint={time:number;date:string;portfolio:number;ibov?:number;sp500?:number;bitcoin?:number;cdi?:number;value?:number;flow?:number};
export type CdiRate={date:string;rate:number};
export const brDate=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
function priceBRL(ticker:string,m:Market):number|null{
 const a=ASSETS.find(a=>a.ticker===ticker),q=m.quotes[ticker];if(!a||!q||q.stale)return null;
 if(a.currency==='BRL')return q.price;
 const fx=m.quotes.USD;return fx&&!fx.stale?q.price*fx.price:null;
}
export function benchmarkLevels(m:Market):Benchmarks{
 const fx=m.quotes.USD&&!m.quotes.USD.stale?m.quotes.USD.price:undefined,b:Benchmarks={};
 if(m.quotes.IBOV&&!m.quotes.IBOV.stale)b.ibov=m.quotes.IBOV.price;
 if(fx&&m.quotes.SP500&&!m.quotes.SP500.stale)b.sp500=m.quotes.SP500.price*fx;
 if(fx&&m.quotes.BTC&&!m.quotes.BTC.stale)b.bitcoin=m.quotes.BTC.price*fx;
 return b;
}
// Link observed holding returns; position changes are neutralized at observation prices.
// This measures the registered portfolio, not trades before registration or intraday broker cash flows.
function captureSnapshot(p:Portfolio,m:Market,previous:PerformanceState|undefined,revision:number,at:string){
 const t=totals(p,m);if(t.missing.length)throw new Error('Aguarde as cotações da carteira e o câmbio para registrar o histórico.');
 if(!previous&&!(t.value>0))throw new Error('Cadastre posições para iniciar o acompanhamento.');
 let unitIndex=previous?.unitIndex??100,flow=0,income=0;const warnings:string[]=[];
 if(previous){
  let beforeChange=previous.fixed.reduce((s,r)=>s+r.value,0);
  for(const a of previous.holdings){const price=priceBRL(a.ticker,m);if(price===null)throw new Error('Cotação anterior pendente: '+a.ticker);beforeChange+=a.quantity*price;}
  for(const old of previous.fixed){
   const current=p.fixedIncome.find(r=>r.id===old.id);if(!current||current.value===old.value)continue;
   if(old.cost!==null&&current.cost!==null)beforeChange+=(current.value-old.value)-(current.cost-old.cost);
   else warnings.push('Alteração de saldo manual sem capital inicial foi tratada como ajuste de posição, sem presumir rendimento.');
  }
  const known=new Set(previous.incomeIds),startDay=brDate(new Date(previous.startedAt));
  for(const i of p.incomes??[]){
   if(known.has(i.id)||i.kind!=='payment')continue;
   if(i.date<startDay){warnings.push('Provento anterior ao início do acompanhamento permanece no resultado do ativo, fora da curva registrada.');continue;}
   if(i.currency==='BRL')income+=i.amount;
   else{const fx=m.quotes.USD;if(!fx||fx.stale)throw new Error('Câmbio pendente para registrar provento em dólar.');income+=i.amount*fx.price;}
  }
  if(previous.value>0)unitIndex=previous.unitIndex*(beforeChange+income)/previous.value;
  flow=t.value-beforeChange;
 }
 if(!Number.isFinite(unitIndex)||unitIndex<0)throw new Error('Não foi possível calcular o retorno desta observação.');
 const state:PerformanceState={startedAt:previous?.startedAt??at,capturedAt:at,unitIndex,value:t.value,totalFlow:(previous?.totalFlow??0)+flow,holdings:t.rows.filter(a=>a.quantity>0).map(a=>({ticker:a.ticker,quantity:a.quantity})),fixed:p.fixedIncome.map(r=>({id:r.id,value:r.value,cost:r.cost})),incomeIds:(p.incomes??[]).map(i=>i.id),portfolioRevision:revision};
 const point:RecordedPoint={time:at,value:t.value,index:unitIndex,flow:state.totalFlow,income,benchmarks:benchmarkLevels(m),baseline:!previous};
 return {state,point,warnings};
}
export function capturePerformance(p:Portfolio,m:Market,previous:PerformanceState|undefined,revision:number,at:string){
 const captured=captureSnapshot(p,m,previous,revision,at);
 captured.state.segments={};captured.point.segments={};
 for(const scope of ['us','br','btc'] as const){
  const subset=performancePortfolio(p,scope),prior=previous?.segments?.[scope];
  if(!prior&&!subset.transactions.some(t=>t.quantity>0))continue;
  const segment=captureSnapshot(subset,m,prior,revision,at);
  captured.state.segments[scope]=segment.state;
  const {value,index,flow,income,baseline}=segment.point;
  captured.point.segments[scope]={startedAt:segment.state.startedAt,value,index,flow,income,baseline};
 }
 return captured;
}
const pct=(v:number,b:number)=>(v/b-1)*100;
export function recordedChart(data:PerformanceData|undefined,days:number,rates:CdiRate[],now=Date.now(),scope:PerformanceScope='all'):ChartPoint[]{
 const points=(data?.points??[]).flatMap(p=>{
  if(scope==='all')return [p];
  const segment=p.segments?.[scope];return segment?[{...p,...segment}]:[];
 }).filter(p=>Date.parse(p.time)>=now-days*86400000).sort((a,b)=>a.time.localeCompare(b.time));
 const first=points[0];if(!first||first.index<=0)return [];
 const start=brDate(new Date(first.time));
 return points.map(p=>({time:Date.parse(p.time),date:brDate(new Date(p.time)),portfolio:pct(p.index,first.index),value:p.value,flow:p.flow-first.flow,...Object.fromEntries((['ibov','sp500','bitcoin'] as const).filter(k=>first.benchmarks[k]&&p.benchmarks[k]).map(k=>[k,pct(p.benchmarks[k]!,first.benchmarks[k]!)])),...(rates.length&&start>=rates[0].date&&brDate(new Date(p.time))<=rates.at(-1)!.date?{cdi:(cdiFactor(rates,start,brDate(new Date(p.time)))-1)*100}:{})}));
}
export function cdiFactor(rates:CdiRate[],start:string,end:string,ratePercent=100){
 return rates.filter(r=>r.date>start&&r.date<=end).reduce((f,r)=>f*(1+r.rate/100*ratePercent/100),1);
}
export type Simulation={points:ChartPoint[];warnings:string[];coverage:number;start:string|null;end:string|null;heldCount:number;excluded:string[];unavailable:BenchmarkKey[]};
export function simulateComposition(p:Portfolio,m:Market,rates:CdiRate[],days:number,selected:BenchmarkKey[],now=Date.now(),scope:PerformanceScope='all'):Simulation{
 p=performancePortfolio(p,scope);
 const t=totals(p,m),warnings:string[]=[],excluded:string[]=[],unavailable:BenchmarkKey[]=[];
 const empty:Simulation={points:[],warnings,coverage:0,start:null,end:null,heldCount:0,excluded,unavailable};
 if(t.missing.length){warnings.push('Aguarde as cotações atuais para definir os pesos da simulação.');return empty;}
 if(!(t.value>0))return empty;
 const hasHistory=(key:string)=>(m.quotes[key]?.history.length??0)>=2,hasFX=hasHistory('USD'),hasCDI=rates.length>=2;
 const usable=t.rows.filter(a=>a.quantity>0&&a.value!==null).filter(a=>{if(hasHistory(a.ticker)&&(a.currency!=='USD'||hasFX))return true;excluded.push(a.ticker);return false;});
 let modeledFixed=p.fixedIncome.filter(r=>r.index?.toUpperCase()==='CDI'&&r.ratePercent!==undefined&&hasCDI);
 for(const r of p.fixedIncome)if(!modeledFixed.some(x=>x.id===r.id))excluded.push(r.name);
 const series=new Map<string,Map<string,number>>();
 let start=new Date(now-days*86400000).toISOString().slice(0,10),end=new Date(now).toISOString().slice(0,10);
 const include=(key:string)=>{const h=m.quotes[key]!.history;series.set(key,new Map(h.map(x=>[x.date,x.close])));start=start>h[0].date?start:h[0].date;end=end<h.at(-1)!.date?end:h.at(-1)!.date;};
 for(const key of new Set([...usable.map(a=>a.ticker),...(usable.some(a=>a.currency==='USD')?['USD']:[])]))include(key);
 if(modeledFixed.length&&(rates[0].date>=end||rates.at(-1)!.date<=start)){excluded.push(...modeledFixed.map(r=>r.name));modeledFixed=[];}
 let needCDI=modeledFixed.length>0;
 if(needCDI){start=start>rates[0].date?start:rates[0].date;end=end<rates.at(-1)!.date?end:rates.at(-1)!.date;}
 const available:BenchmarkKey[]=[];
 for(const key of selected){
  if(key==='cdi'){
   if(!hasCDI||rates[0].date>=end||rates.at(-1)!.date<=start){unavailable.push(key);continue;}
   available.push(key);needCDI=true;start=start>rates[0].date?start:rates[0].date;end=end<rates.at(-1)!.date?end:rates.at(-1)!.date;continue;
  }
  const ticker=key==='ibov'?'IBOV':key==='sp500'?'SP500':'BTC',fx=key!=='ibov';
  if(!hasHistory(ticker)||(fx&&!hasFX)){unavailable.push(key);continue;}
  const histories=[m.quotes[ticker]!.history,...(fx?[m.quotes.USD.history]:[])];
  const commonStart=histories.reduce((d,h)=>d>h[0].date?d:h[0].date,start),commonEnd=histories.reduce((d,h)=>d<h.at(-1)!.date?d:h.at(-1)!.date,end);
  if(commonStart>=commonEnd){unavailable.push(key);continue;}
  include(ticker);if(fx&&!series.has('USD'))include('USD');available.push(key);
 }
 if(unavailable.length)warnings.push('Referências indisponíveis: '+unavailable.map(k=>({ibov:'Ibovespa',sp500:'S&P 500',bitcoin:'Bitcoin',cdi:'CDI'}[k])).join(', ')+'. As demais séries continuam disponíveis.');
 if(start>=end){warnings.push('Ainda não há histórico comum suficiente entre os ativos.');return empty;}
 const dates=Array.from(new Set([...usable.flatMap(a=>a.quote!.history.map(x=>x.date)),...(needCDI?rates.map(r=>r.date):[])])).filter(d=>d>=start&&d<=end).sort();
 const carried=new Map<string,number>();
 for(const [key,map] of series)for(const [date,value] of map)if(date<start)carried.set(key,value);
 const rows:{date:string;levels:Map<string,number>}[]=[];
 for(const date of dates){for(const [key,map] of series){const value=map.get(date);if(value!==undefined)carried.set(key,value);}if([...series.keys()].every(key=>carried.has(key)))rows.push({date,levels:new Map(carried)});}
 if(rows.length<2){warnings.push('Histórico comum insuficiente.');return empty;}
 const initial=rows[0],last=rows.at(-1)!,covered=usable.reduce((s,a)=>s+(a.value??0),0)+modeledFixed.reduce((s,r)=>s+r.value,0),base=initial.levels;
 if(!(covered>0))return empty;
 const brlLevel=(levels:Map<string,number>,ticker:string,currency:string)=>levels.get(ticker)!*(currency==='USD'?levels.get('USD')!:1);
 const points=rows.map(row=>{
  let factor=usable.reduce((s,a)=>s+(a.value??0)/covered*brlLevel(row.levels,a.ticker,a.currency)/brlLevel(base,a.ticker,a.currency),0);
  for(const r of modeledFixed)factor+=r.value/covered*cdiFactor(rates,initial.date,row.date,r.ratePercent);
  const b:Partial<Record<BenchmarkKey,number>>={};
  for(const k of available){if(k==='cdi')b.cdi=(cdiFactor(rates,initial.date,row.date)-1)*100;else{const ticker=k==='ibov'?'IBOV':k==='sp500'?'SP500':'BTC',currency=k==='ibov'?'BRL':'USD';b[k]=pct(brlLevel(row.levels,ticker,currency),brlLevel(base,ticker,currency));}}
  return {time:Date.parse(row.date+'T12:00:00Z'),date:row.date,portfolio:(factor-1)*100,...b};
 });
 if(excluded.length)warnings.push('Fora da simulação por falta de histórico ou taxa: '+excluded.join(', ')+'.');
 const requested=new Date(now-days*86400000).toISOString().slice(0,10);if(initial.date>requested)warnings.push('O período começa em '+initial.date.split('-').reverse().join('/')+' para respeitar o histórico disponível dos ativos incluídos.');
 if(needCDI)warnings.push('CDBs são simulados pelo percentual informado do CDI, com juros brutos e sem impostos. A comparação termina na última data comum com o CDI ('+last.date.split('-').reverse().join('/')+').');
 warnings.push('Pesos atuais no início do período, sem novos aportes ou rebalanceamento. Preços ajustados pelo provedor quando disponíveis; os proventos acumulados do extrato não são somados novamente.');
 return {points,warnings,coverage:covered/t.value*100,start:initial.date,end:last.date,heldCount:usable.length,excluded,unavailable};
}
