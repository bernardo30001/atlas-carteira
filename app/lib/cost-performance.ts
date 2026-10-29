import {positions,transactionCost,transactionCurrency,type Currency,type Income,type Market,type Point,type Portfolio,type Transaction} from './model.ts';
import {brDate,performancePortfolio,type ChartPoint,type PerformanceScope} from './performance.ts';

export type CostPerformance={
 currency:Currency;cost:number;value:number;income:number;result:number;returnPercent:number|undefined;
 includedCount:number;totalCount:number;excluded:string[];estimatedFX:boolean;
 points:ChartPoint[];warnings:string[];
};
const add=(values:(number|null)[])=>values.some(v=>v===null)?null:values.reduce<number>((s,v)=>s+(v??0),0);
function convert(amount:number,from:Currency,to:Currency,fx:number|null):number|null{
 if(amount===0||from===to)return amount;
 if(!fx||!Number.isFinite(fx)||fx<=0)return null;
 return from==='USD'?amount*fx:amount/fx;
}
function costOf(tx:Transaction,currency:Currency,fx:number|null){
 const rate=tx.fx??fx;
 return add([convert(transactionCost(tx),transactionCurrency(tx),currency,rate),convert(tx.fees,'BRL',currency,rate)]);
}
const incomeOf=(i:Income,currency:Currency,fx:number|null)=>convert(i.amount,i.currency,currency,i.fx??fx);
function needsEstimatedFX(tx:Transaction,currency:Currency){
 return (transactionCurrency(tx)!==currency&&transactionCost(tx)>0||currency==='USD'&&tx.fees>0)&&!tx.fx;
}
const validPrice=(v:number)=>Number.isFinite(v)&&v>0;
function priceSeries(m:Market,ticker:string,today:string):Point[]{
 const quote=m.quotes[ticker];if(!quote||quote.stale||!validPrice(quote.price))return [];
 const points=(quote.priceHistory??quote.history).filter(p=>p.date<=today&&validPrice(p.close));
 // The last point uses the same quote as the accumulated result.
 return [...new Map([...points,{date:today,close:quote.price}].map(p=>[p.date,p])).values()].sort((a,b)=>a.date.localeCompare(b.date));
}
const atDate=(series:Point[],date:string)=>series.findLast(p=>p.date<=date)?.close??null;

/** Cost-weighted profit on the registered positions, including pre-registration gains.
 * Historical prices reconstruct a cost-basis curve; they never become observed history.
 */
export function costPerformance(portfolio:Portfolio,market:Market,scope:PerformanceScope='all',days=365,now=Date.now()):CostPerformance{
 const p=performancePortfolio(portfolio,scope),currency:Currency=scope==='us'?'USD':'BRL';
 const rows=positions(p,market).filter(r=>r.quantity>0),excluded:string[]=[],warnings:string[]=[];
 const fxQuote=market.quotes.USD,fx=fxQuote&&!fxQuote.stale&&validPrice(fxQuote.price)?fxQuote.price:null;
 let cost=0,value=0,income=0,includedCount=0,estimatedFX=false;
 const included:typeof rows=[];
 for(const row of rows){
  const rowCost=add(row.transactions.map(tx=>costOf(tx,currency,fx)));
  const rowIncome=add((p.incomes??[]).filter(i=>i.ticker===row.ticker).map(i=>incomeOf(i,currency,fx)));
  const rowValue=row.nativeValue===null?null:convert(row.nativeValue,row.currency,currency,fx);
  if(rowCost===null||rowCost<=0||rowIncome===null||rowValue===null){
   excluded.push(row.ticker+' · '+(rowCost===null||rowIncome===null?'câmbio pendente':rowCost<=0?'custo não informado':'cotação pendente'));continue;
  }
  cost+=rowCost;value+=rowValue;income+=rowIncome;includedCount++;included.push(row);
  if(row.transactions.some(tx=>needsEstimatedFX(tx,currency))||(p.incomes??[]).some(i=>i.ticker===row.ticker&&i.amount>0&&i.currency!==currency&&!i.fx))estimatedFX=true;
 }
 for(const fixed of p.fixedIncome){
  if(fixed.cost===null||fixed.cost<=0){excluded.push(fixed.name+' · capital inicial não informado');continue;}
  cost+=fixed.cost;value+=fixed.value;includedCount++;
 }
 const result=value-cost+income;
 const response:CostPerformance={currency,cost,value,income,result,returnPercent:cost>0?result/cost*100:undefined,includedCount,totalCount:rows.length+p.fixedIncome.length,excluded,estimatedFX,points:[],warnings};
 if(estimatedFX)warnings.push(currency==='USD'?'Taxas em reais sem câmbio registrado são convertidas para dólares pela cotação da data avaliada. Essa parcela do custo é uma estimativa.':'Sem câmbio registrado para parte dos custos ou proventos, a conversão usa o dólar da data avaliada. O consolidado é uma estimativa e não apura o ganho cambial desde a compra. O resultado do grupo americano é calculado em dólares.');
 if(excluded.length)warnings.push('Fora do cálculo acumulado: '+excluded.join('; ')+'.');
 if(!included.length)return response;

 const today=brDate(new Date(now)),start=brDate(new Date(now-days*86400000));
 const series=new Map(included.map(r=>[r.ticker,priceSeries(market,r.ticker,today)]));
 const fxSeries=priceSeries(market,'USD',today);
 const dates=new Set([today]);
 for(const points of series.values())for(const point of points)if(point.date>=start)dates.add(point.date);
 for(const tx of p.transactions)if(tx.kind==='buy'&&tx.date>=start&&tx.date<=today)dates.add(tx.date);
 const selectedTickers=new Set(included.map(r=>r.ticker));
 const incomes=(p.incomes??[]).filter(i=>selectedTickers.has(i.ticker));
 for(const i of incomes)if(i.date>=start&&i.date<=today)dates.add(i.date);
 const orderedDates=[...dates].filter(d=>d>=start&&d<=today).sort();
 for(const date of orderedDates){
  const dayFx=atDate(fxSeries,date);
  let invested=0,balance=0,received=0,complete=true;
  for(const row of included){
   // Opening records contain an average cost, not the dates of the original buys.
   const lots=row.transactions.filter(tx=>tx.kind==='opening'||tx.date<=date);
   if(!lots.length)continue;
   const price=atDate(series.get(row.ticker)!,date),quantity=lots.reduce((s,tx)=>s+tx.quantity,0);
   const lotCost=add(lots.map(tx=>costOf(tx,currency,dayFx)));
   const lotValue=price===null?null:convert(quantity*price,row.currency,currency,dayFx);
   if(lotCost===null||lotValue===null){complete=false;break;}
   invested+=lotCost;balance+=lotValue;
  }
  if(!complete||invested<=0)continue;
  for(const i of incomes){
   if(i.date>date)continue;
   const amount=incomeOf(i,currency,dayFx);if(amount===null){complete=false;break;}
   received+=amount;
  }
  if(complete)response.points.push({time:Date.parse(date+'T12:00:00Z'),date,portfolio:(balance-invested+received)/invested*100,value:balance});
 }
 if(p.transactions.some(tx=>tx.kind==='opening'))warnings.push('Antes da data de referência, posições iniciais são reconstruídas com a quantidade e o preço médio informados. A curva é uma estimativa da posição cadastrada, pois não conhecemos as datas de todas as compras anteriores.');
 if(incomes.some(i=>i.kind==='opening'))warnings.push('Proventos acumulados entram na curva na data de referência registrada. O total acumulado atual inclui todos os proventos informados.');
 if(p.fixedIncome.length)warnings.push('Renda fixa com capital inicial informado entra no resultado acumulado. A curva usa apenas ativos com cotações, pois os saldos de renda fixa são manuais.');
 warnings.push('O período selecionado muda apenas a janela da curva. O acumulado usa o valor investido registrado, sem zerar o retorno no início do gráfico. Novas compras entram na data informada; a curva usa preços sem ajuste por dividendos quando disponíveis.');
 return response;
}
