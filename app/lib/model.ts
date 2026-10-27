export type Group = 'br' | 'rf' | 'etf' | 'crypto';
export type Asset = { ticker:string; symbol:string; name:string; group:Group; currency:'BRL'|'USD'; sector:string; color:string; query:string };
export const GROUPS: Record<Group,{name:string;short:string;color:string}> = {
  br:{name:'Ações brasileiras',short:'Brasil',color:'#1f7761'},
  rf:{name:'Renda fixa',short:'Renda fixa',color:'#b7c9b2'},
  etf:{name:'ETFs internacionais',short:'Exterior',color:'#577ca3'},
  crypto:{name:'Bitcoin',short:'Bitcoin',color:'#d7a65d'},
};
export const ASSETS: Asset[] = ([
  ['ALUP11','Alupar','Energia','#626b99','Alupar ALUP11'],
  ['WEGE3','WEG','Indústria','#377fc1','WEG WEGE3'],
  ['ITUB4','Itaú Unibanco','Bancos','#d67e2f','Itaú ITUB4'],
  ['KLBN4','Klabin','Papel e celulose','#5a8c64','Klabin KLBN4'],
  ['EGIE3','Engie Brasil','Energia','#1e8ba8','Engie EGIE3'],
  ['BPAC11','BTG Pactual','Bancos','#344c7c','BTG Pactual BPAC11'],
  ['BBSE3','BB Seguridade','Seguros','#b6a143','BB Seguridade BBSE3'],
  ['PSSA3','Porto Seguro','Seguros','#428cbb','Porto Seguro PSSA3'],
  ['TUPY3','Tupy','Indústria','#9f6f57','Tupy TUPY3'],
  ['LEVE3','Mahle Metal Leve','Autopeças','#4e7e9c','Mahle LEVE3'],
  ['FESA4','Ferbasa','Siderurgia','#a78858','Ferbasa FESA4'],
  ['VALE3','Vale','Mineração','#3a958e','Vale VALE3'],
  ['PRIO3','PRIO','Petróleo e gás','#9c872f','PRIO PRIO3'],
] as string[][]).map(([ticker,name,sector,color,query])=>({ticker,symbol:ticker+'.SA',name,sector,color,query,group:'br' as Group,currency:'BRL' as Asset['currency']})).concat([
  {ticker:'SPHQ',symbol:'SPHQ',name:'Invesco S&P 500 Quality',sector:'Ações EUA · qualidade',color:'#658eb1',query:'SPHQ Invesco ETF',group:'etf',currency:'USD'},
  {ticker:'VEA',symbol:'VEA',name:'Vanguard FTSE Developed',sector:'Mercados desenvolvidos',color:'#9a6272',query:'VEA Vanguard ETF',group:'etf',currency:'USD'},
  {ticker:'VNQ',symbol:'VNQ',name:'Vanguard Real Estate',sector:'Imóveis EUA',color:'#84749f',query:'VNQ Vanguard real estate ETF',group:'etf',currency:'USD'},
  {ticker:'IAU',symbol:'IAU',name:'iShares Gold Trust',sector:'Ouro',color:'#b89b53',query:'IAU iShares ouro gold',group:'etf',currency:'USD'},
  {ticker:'VWO',symbol:'VWO',name:'Vanguard FTSE Emerging',sector:'Mercados emergentes',color:'#4f9291',query:'VWO Vanguard emerging ETF',group:'etf',currency:'USD'},
  {ticker:'BTC',symbol:'BTC-USD',name:'Bitcoin',sector:'Criptomoeda',color:'#d69c48',query:'Bitcoin BTC',group:'crypto',currency:'USD'},
] as Asset[]);
export type Transaction = {id:string;ticker:string;kind:'opening'|'buy';quantity:number;price:number;fx:number;fees:number;date:string;note:string};
export type FixedIncome = {id:string;name:string;cost:number;value:number;date:string;updatedAt:string};
export type Portfolio = {transactions:Transaction[];fixedIncome:FixedIncome[];targets:Record<Group,number>;weights:Record<string,number>};
export const EMPTY:Portfolio = {transactions:[],fixedIncome:[],targets:{br:35,rf:35,etf:22,crypto:8},weights:{}};
export type Point = {date:string;close:number};
export type Quote = {ticker:string;price:number;previous:number;change:number;currency:string;time:number;source:string;delay:number|null;history:Point[];volatility:number|null;momentum:number|null;drawdown:number|null;stale?:boolean};
export type Market = {quotes:Record<string,Quote>;errors:string[];fetchedAt:string};
export const today = ()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function metrics(history:Point[],annual=252) {
  const closes=history.map(p=>p.close).filter(x=>x>0);
  if(closes.length<30)return {volatility:null,momentum:null,drawdown:null};
  const ret=closes.slice(1).map((x,i)=>Math.log(x/closes[i]));
  const mean=ret.reduce((a,b)=>a+b,0)/ret.length;
  const volatility=Math.sqrt(ret.reduce((a,b)=>a+(b-mean)**2,0)/(ret.length-1))*Math.sqrt(annual)*100;
  let peak=closes[0],drawdown=0;for(const c of closes){peak=Math.max(peak,c);drawdown=Math.min(drawdown,(c/peak-1)*100);}
  const days=annual===365?183:126;
  return {volatility,momentum:closes.length>days?(closes.at(-1)!/closes.at(-days-1)!-1)*100:null,drawdown};
}
export function positions(portfolio:Portfolio,market:Market) {
  const fx=market.quotes['USD']?.price;
  return ASSETS.map(a=>{
    const tx=portfolio.transactions.filter(t=>t.ticker===a.ticker);
    const quantity=tx.reduce((s,t)=>s+t.quantity,0);
    const cost=tx.reduce((s,t)=>s+t.quantity*t.price*t.fx+t.fees,0);
    const q=market.quotes[a.ticker];
    const valid=!!q&&(!q.stale)&&(a.currency==='BRL'||(!!fx&&!market.quotes.USD?.stale));
    const value=quantity===0?0:valid?quantity*q.price*(a.currency==='USD'?fx!:1):null;
    return {...a,quantity,cost,value,quote:q,average:quantity?tx.reduce((s,t)=>s+t.quantity*t.price,0)/quantity:0};
  });
}
export function totals(p:Portfolio,m:Market) {
  const rows=positions(p,m),missing=rows.filter(r=>r.quantity>0&&r.value===null);
  const byGroup:Record<Group,number>={br:0,rf:p.fixedIncome.reduce((s,r)=>s+r.value,0),etf:0,crypto:0};
  for(const r of rows)byGroup[r.group]+=r.value??0;
  const value=Object.values(byGroup).reduce((a,b)=>a+b,0),cost=rows.reduce((s,r)=>s+r.cost,0)+p.fixedIncome.reduce((s,r)=>s+r.cost,0);
  return {rows,missing,byGroup,value,cost,result:value-cost};
}
export function allocationPlan(p:Portfolio,m:Market,budget:number) {
  const t=totals(p,m);
  if(t.missing.length||!(budget>0))return [];
  const gaps=(Object.keys(GROUPS) as Group[]).map(group=>({group,gap:Math.max(0,(t.value+budget)*p.targets[group]/100-t.byGroup[group])}));
  const gapSum=gaps.reduce((s,g)=>s+g.gap,0);
  return gaps.map(g=>({...g,amount:gapSum?budget*g.gap/gapSum:0}));
}
export function assetPlan(p:Portfolio,m:Market,budget:number) {
  const t=totals(p,m),groups=allocationPlan(p,m,budget),fx=m.quotes.USD?.price;
  return groups.flatMap(g=>{
    if(g.amount<0.01||g.group==='rf')return [];
    const assets=t.rows.filter(a=>a.group===g.group);
    const sum=assets.reduce((s,a)=>s+(p.weights[a.ticker]??1),0);
    const scored=assets.map(a=>{
      const target=sum?(p.weights[a.ticker]??1)/sum:0;
      const gap=Math.max(0,(t.byGroup[g.group]+g.amount)*target-(a.value??0));
      const q=a.quote;
      const quality=q?.volatility!=null?1/(1+q.volatility/100):0.5;
      const momentum=q?.momentum!=null?Math.max(-1,Math.min(1,q.momentum/100)):0;
      return {a,gap,score:gap*(0.8+0.15*quality+0.05*momentum)};
    });
    const sumScore=scored.reduce((s,a)=>s+a.score,0);
    return scored.filter(x=>x.score>0).map(x=>{
      const q=x.a.quote,unit=q&&!q.stale?(q.price*(x.a.currency==='USD'?(fx??0):1)):0;
      const amount=sumScore?g.amount*x.score/sumScore:0;
      const precision=x.a.group==='br'?1:x.a.group==='crypto'?1e8:1e6;
      const quantity=unit>0?Math.floor(amount/unit*precision)/precision:0;
      return {ticker:x.a.ticker,group:g.group,amount,quantity,executable:quantity*unit,gap:x.gap,quote:q};
    }).sort((a,b)=>b.amount-a.amount);
  }).sort((a,b)=>b.amount-a.amount);
}
