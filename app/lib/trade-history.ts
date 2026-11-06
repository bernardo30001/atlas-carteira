import {ASSETS,transactionCost,transactionCurrency,isTrackedTicker,type Currency,type Portfolio,type TradeEvent} from './model.ts';
const ordered=(events:TradeEvent[])=>[...events].sort((a,b)=>a.date.localeCompare(b.date));
export type TradeBalance={quantity:number;costNative:number;feesBRL:number};

// Reductions preserve the average cost. The sale proceeds are not an acquisition cost.
export function replayTrades(events:TradeEvent[],date='9999-12-31'):TradeBalance{
 let quantity=0,costNative=0,feesBRL=0;
 for(const event of ordered(events).filter(e=>e.date<=date)){
  if(event.kind==='buy'){quantity+=event.quantity;costNative+=event.total;feesBRL+=event.fees;continue;}
  if(event.quantity>quantity+1e-8)throw new Error('Venda sem saldo suficiente em '+event.ticker+' na data '+event.date+'.');
  const factor=quantity>0?Math.max(0,1-event.quantity/quantity):0;
  quantity=Math.max(0,quantity-event.quantity);costNative*=factor;feesBRL*=factor;
  if(quantity<1e-8){quantity=0;costNative=0;feesBRL=0;}
 }
 return {quantity,costNative,feesBRL};
}

/** Keep only the currently open cycle. Old sales without their opening balance
 * precede the supplied acquisition history and cannot create a new position. */
export function openTradeCycle(events:TradeEvent[]):TradeEvent[]{
 let quantity=0;let current:TradeEvent[]=[];
 for(const event of ordered(events)){
  if(event.kind==='buy'){
   if(quantity===0)current=[];
   current.push(event);quantity+=event.quantity;
  }else{
   if(quantity===0)continue;
   if(event.quantity>quantity+1e-8)throw new Error('Movimentação incompleta para '+event.ticker+'.');
   current.push(event);quantity=Math.max(0,quantity-event.quantity);
   if(quantity<1e-8){quantity=0;current=[];}
  }
 }
 return current;
}

export function datedTrades(p:Portfolio):TradeEvent[]{
 const owned=new Set(p.transactions.filter(tx=>tx.quantity>0&&isTrackedTicker(tx.ticker)).map(tx=>tx.ticker));
 const events=(p.tradeHistory??[]).filter(e=>owned.has(e.ticker)),ids=new Set(events.map(e=>e.id));
 for(const tx of p.transactions){
  if(tx.kind!=='buy'||ids.has(tx.id)||!owned.has(tx.ticker))continue;
  events.push({id:tx.id,ticker:tx.ticker,kind:'buy',quantity:tx.quantity,price:tx.price,total:transactionCost(tx),currency:transactionCurrency(tx),fx:tx.fx,fees:tx.fees,date:tx.date,source:'Registro no Atlas'});
 }
 return ordered(events);
}

export function purchasesForPoints<T extends {date:string}>(p:Portfolio,points:T[]):(T&{purchases:TradeEvent[]})[]{
 const trades=datedTrades(p).filter(e=>e.kind==='buy'&&ASSETS.some(a=>a.ticker===e.ticker));
 const lastPerDay=new Map(points.map((point,index)=>[point.date,index]));
 return points.map((point,index)=>({...point,purchases:lastPerDay.get(point.date)===index?trades.filter(e=>e.date===point.date):[]}));
}

export function datedCost(events:TradeEvent[],date:string,currency:Currency,fx:number|null):{quantity:number;cost:number|null}{
 let quantity=0,cost:number|null=0;
 for(const event of ordered(events).filter(e=>e.date<=date)){
  if(event.kind==='buy'){
   const rate=event.fx??fx;
   const native=event.currency===currency?event.total:rate?(event.currency==='USD'?event.total*rate:event.total/rate):null;
   const fee=event.fees===0?0:currency==='BRL'?event.fees:rate?event.fees/rate:null;
   cost=cost===null||native===null||fee===null?null:cost+native+fee;quantity+=event.quantity;
  }else{
   if(event.quantity>quantity+1e-8)throw new Error('Venda sem saldo suficiente para '+event.ticker+'.');
   const factor=quantity?Math.max(0,1-event.quantity/quantity):0;
   quantity=Math.max(0,quantity-event.quantity);if(cost!==null)cost*=factor;
   if(quantity<1e-8){quantity=0;cost=0;}
  }
 }
 return {quantity,cost};
}
