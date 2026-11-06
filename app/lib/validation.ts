import {z} from 'zod';
import {ASSETS,KNOWN_ASSETS,today,wholeUnits} from './model.ts';
import {replayTrades} from './trade-history.ts';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s&&s<=today(),'Data inválida ou futura');
const amount=z.number().finite().min(0).max(1e12),signed=z.number().finite().min(-1e12).max(1e12),currency=z.enum(['BRL','USD']),ticker=z.string().refine(t=>KNOWN_ASSETS.some(a=>a.ticker===t),'Ativo inválido');
const transaction=z.object({id:z.string().uuid(),ticker,kind:z.enum(['opening','buy']),quantity:z.number().finite().positive().max(1e12),price:z.number().finite().positive().max(1e12),fx:z.number().finite().positive().max(10000).nullable(),fees:amount,date,note:z.string().max(500),currency:currency.optional(),costNative:amount.optional()}).superRefine((t,c)=>{
 const a=KNOWN_ASSETS.find(a=>a.ticker===t.ticker);if(!a)return;
 const cc=t.currency??a.currency;
 if(cc==='BRL'&&t.fx!==1)c.addIssue({code:'custom',message:'Registros em reais devem ter câmbio 1.'});
 if(a.ticker!=='BTC'&&cc!==a.currency)c.addIssue({code:'custom',message:'Use a moeda de origem do ativo.'});
 if(wholeUnits(a)&&!Number.isInteger(t.quantity))c.addIssue({code:'custom',message:'Ativos da B3 exigem unidades inteiras.'});
});
const income=z.object({id:z.string().uuid(),ticker,amount,currency,date,kind:z.enum(['opening','payment']),fx:z.number().finite().positive().max(10000).nullable().optional(),note:z.string().max(500)}).superRefine((i,c)=>{const a=KNOWN_ASSETS.find(a=>a.ticker===i.ticker);if(a&&a.ticker!=='BTC'&&i.currency!==a.currency)c.addIssue({code:'custom',message:'Provento deve ser registrado na moeda do ativo.'});});
const reportTotals=z.object({balance:amount,cost:amount,dividends:amount,result:signed});
const earningsScenario=z.object({growth:signed.min(-20).max(30),discountRate:amount.min(5).max(40),terminalPE:amount.min(2).max(50),payout:amount.max(100),years:z.number().int().min(1).max(10)});
const tradeEvent=z.object({id:z.string().uuid(),ticker,kind:z.enum(['buy','sell']),quantity:z.number().finite().positive().max(1e12),price:z.number().finite().positive().max(1e12),total:amount,currency,fx:z.number().finite().positive().max(10000).nullable(),fees:amount,date,source:z.string().max(200).optional()}).superRefine((t,c)=>{
 const a=KNOWN_ASSETS.find(a=>a.ticker===t.ticker);if(a&&t.currency!==a.currency)c.addIssue({code:'custom',message:'Moeda da movimentação incompatível com o ativo.'});
 if(a&&wholeUnits(a)&&!Number.isInteger(t.quantity))c.addIssue({code:'custom',message:'A movimentação na B3 usa quantidades inteiras.'});
 if(t.currency==='BRL'&&t.fx!==1)c.addIssue({code:'custom',message:'Registros em reais usam câmbio 1.'});
});
const statement=z.object({id:z.string().uuid(),date,label:z.string().max(150),rows:z.array(z.object({ticker,quantity:amount,average:amount,price:amount,balance:amount,cost:amount,dividends:amount,reportedResult:signed})).max(100),reportedTotals:z.object({BRL:reportTotals,USD:reportTotals}),bitcoin:z.object({quantity:amount,balance:amount,cost:amount,reportedProfit:signed,reportedPercent:signed,twelveMonthProfit:signed}).optional(),notes:z.array(z.string().max(1000)).max(30)});
export const portfolioSchema=z.object({
 transactions:z.array(transaction).max(10000),
 fixedIncome:z.array(z.object({id:z.string().uuid(),name:z.string().min(1).max(100),cost:amount.nullable(),value:amount,date,updatedAt:date,ratePercent:amount.max(10000).optional(),index:z.string().max(20).optional(),note:z.string().max(500).optional()}).refine(r=>r.updatedAt>=r.date,'Atualização anterior ao cadastro')).max(1000),
 targets:z.object({br:amount.max(100),rf:amount.max(100),etf:amount.max(100),crypto:amount.max(100)}).refine(t=>Math.abs(Object.values(t).reduce((a,b)=>a+b,0)-100)<0.001,'Metas devem somar 100%'),
 weights:z.record(z.number().finite().min(0).max(100)).refine(w=>ASSETS.filter(a=>a.group!=='rf').every(a=>ASSETS.filter(b=>b.group===a.group).some(b=>(w[b.ticker]??1)>0)),'Cada classe precisa ter algum peso positivo'),
 incomes:z.array(income).max(10000).optional(),
 statements:z.array(statement).max(100).optional(),
 tradeHistory:z.array(tradeEvent).max(10000).optional(),
 evaluation:z.object({baseWeights:z.record(amount.max(100)).refine(w=>Object.keys(w).every(t=>KNOWN_ASSETS.some(a=>a.ticker===t&&a.group==='br'))&&ASSETS.some(a=>a.group==='br'&&(w[a.ticker]??0)>0),'Informe pesos válidos para as ações brasileiras.'),margin:amount.min(5).max(50),maxIssuerWeight:amount.min(5).max(50),maxSectorWeight:amount.min(10).max(100),scenario:earningsScenario.optional(),overrides:z.record(z.object({referencePrice:amount.positive().nullable(),thesis:z.enum(['unreviewed','intact','review','broken']),note:z.string().max(1000),updatedAt:date,method:z.enum(['auto','peers','scenario','manual']).optional(),scenario:earningsScenario.optional()})).refine(w=>Object.keys(w).every(t=>KNOWN_ASSETS.some(a=>a.ticker===t&&a.group==='br')),'Ativo inválido na avaliação')}).optional(),
}).superRefine((p,c)=>{
 const ids=[...p.transactions,...p.fixedIncome,...(p.incomes??[]),...(p.statements??[])].map(x=>x.id);if(new Set(ids).size!==ids.length)c.addIssue({code:'custom',message:'Registros duplicados'});
 const history=p.tradeHistory??[];if(new Set(history.map(e=>e.id)).size!==history.length)c.addIssue({code:'custom',message:'Movimentações duplicadas'});
 for(const ticker of new Set(history.map(e=>e.ticker))){try{replayTrades(history.filter(e=>e.ticker===ticker));}catch{c.addIssue({code:'custom',message:'Histórico de vendas sem posição suficiente para '+ticker});}}
});
export const requestSchema=z.object({revision:z.number().int().min(0),portfolio:portfolioSchema});
