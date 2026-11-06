import assert from 'node:assert/strict';
import {EMPTY} from '../app/lib/model.ts';
import {costPerformance} from '../app/lib/cost-performance.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const now=Date.parse('2026-10-28T18:00:00Z');
const h=(values)=>values.map((close,i)=>({date:`2026-10-${26+i}`,close}));
const quote=(price,currency='BRL',history=h([price,price,price]))=>({price,currency,history,previous:price,change:0,time:now/1000,source:'fixture',delay:0,volatility:null,momentum:null,drawdown:null});
const tx=(ticker,quantity,price,currency='BRL',extras={})=>({id:crypto.randomUUID(),ticker,quantity,price,currency,fx:currency==='BRL'?1:null,fees:0,kind:'opening',date:'2026-10-27',note:'',...extras});
const income=(ticker,amount,currency='BRL',extras={})=>({id:crypto.randomUUID(),ticker,amount,currency,date:'2026-10-27',kind:'opening',note:'',...extras});
const m={quotes:{WEGE3:quote(60,'BRL',h([45,54,60])),VOO:quote(110,'USD',h([95,100,110])),BTC:quote(60000,'USD',h([50000,55000,60000])),USD:quote(6,'BRL',h([5,5.5,6])),ABTC11:quote(15),AUPO11:quote(11)},errors:[],fetchedAt:new Date(now).toISOString()};
// The provider's raw close, not dividend-adjusted close, is used with explicit payments.
m.quotes.WEGE3.priceHistory=h([50,55,60]);
const br={...EMPTY,transactions:[tx('WEGE3',2,49.99,'BRL',{costNative:100,fees:2})],incomes:[income('WEGE3',4)]};
const original=JSON.stringify(br);
let r=costPerformance(br,m,'br',365,now);
near(r.cost,102);near(r.value,120);near(r.income,4);near(r.result,22);near(r.returnPercent,22/102*100);
assert.equal(r.estimatedFX,false);assert.equal(r.points[0].date,'2026-10-26');near(r.points[0].portfolio,-2/102*100);near(r.points.at(-1).portfolio,r.returnPercent);
assert.ok(r.points[0].portfolio!==0);assert.equal(r.currency,'BRL');assert.equal(JSON.stringify(br),original);
const shorter=costPerformance(br,m,'br',1,now);near(shorter.returnPercent,r.returnPercent);assert.ok(shorter.points.length<r.points.length);
const repeated=costPerformance(br,m,'br',365,now);near(repeated.income,4);near(repeated.result,r.result);
const foreign={...EMPTY,transactions:[tx('VOO',2,99.99,'USD',{costNative:200})],incomes:[income('VOO',5,'USD')]};
r=costPerformance(foreign,m,'us',365,now);assert.equal(r.currency,'USD');near(r.cost,200);near(r.value,220);near(r.income,5);near(r.result,25);near(r.returnPercent,12.5);near(r.points.at(-1).portfolio,12.5);assert.equal(r.estimatedFX,false);
const noFX={...m,quotes:{...m.quotes,USD:undefined}};
near(costPerformance(foreign,noFX,'us',365,now).returnPercent,12.5);
const foreignBRL=costPerformance(foreign,m,'all',365,now);near(foreignBRL.cost,1200);near(foreignBRL.value,1320);near(foreignBRL.income,30);near(foreignBRL.returnPercent,12.5);assert.equal(foreignBRL.estimatedFX,true);
// Known purchase and payment FX include actual exchange gains; unknown FX is identified.
const knownFX={...foreign,transactions:[{...foreign.transactions[0],fx:5}],incomes:[{...foreign.incomes[0],fx:5.5}]};
r=costPerformance(knownFX,m,'all',365,now);near(r.cost,1000);near(r.value,1320);near(r.income,27.5);near(r.returnPercent,34.75);assert.equal(r.estimatedFX,false);
const btc={...EMPTY,transactions:[tx('BTC',.02,200000,'BRL',{costNative:4000}),tx('ABTC11',2,10)]};
r=costPerformance(btc,m,'btc',365,now);near(r.cost,4000);near(r.value,7200);near(r.returnPercent,80);assert.equal(r.totalCount,1);near(r.points.at(-1).portfolio,80);
// Group returns use invested weights, not the mean of percentages or current values.
const weighted={...EMPTY,transactions:[tx('WEGE3',2,50),tx('AUPO11',10,10)]};
r=costPerformance(weighted,m,'all',365,now);near(r.returnPercent,15);near(r.cost,200);near(r.value,230);
const withFixed={...br,fixedIncome:[{id:'known',name:'CDB known',cost:1000,value:1100,date:'2026-10-01',updatedAt:'2026-10-28'},{id:'unknown',name:'CDB unknown',cost:null,value:9000,date:'2026-10-01',updatedAt:'2026-10-28'}]};
r=costPerformance(withFixed,m,'all',365,now);near(r.cost,1102);near(r.value,1220);near(r.result,122);near(r.returnPercent,122/1102*100);assert.equal(r.includedCount,2);assert.equal(r.totalCount,3);assert.ok(r.excluded.some(x=>x.includes('CDB unknown')));
// Fixed balances are present in the summary; no historical daily balances are invented.
near(r.points.at(-1).portfolio,22/102*100);
const buys={...EMPTY,transactions:[tx('WEGE3',2,50,'BRL',{kind:'buy',date:'2026-10-27'}),tx('WEGE3',2,60,'BRL',{kind:'buy',date:'2026-10-28'})]};
r=costPerformance(buys,m,'br',365,now);assert.equal(r.points[0].date,'2026-10-27');near(r.points[0].portfolio,10);near(r.cost,220);near(r.returnPercent,(240-220)/220*100);near(r.points.at(-1).portfolio,r.returnPercent);
const mixedBTC={...EMPTY,transactions:[tx('BTC',.01,200000,'BRL',{costNative:2000}),tx('BTC',.01,50000,'USD',{fx:5,costNative:500})]};
r=costPerformance(mixedBTC,m,'btc',365,now);near(r.cost,4500);near(r.value,7200);near(r.returnPercent,60);
const stale={...m,quotes:{...m.quotes,WEGE3:{...m.quotes.WEGE3,stale:true}}};
r=costPerformance(br,stale,'br',365,now);assert.equal(r.returnPercent,undefined);assert.equal(r.includedCount,0);assert.ok(r.excluded.some(x=>x.includes('cotação pendente')));
r=costPerformance(foreign,noFX,'all',365,now);assert.equal(r.returnPercent,undefined);assert.ok(r.excluded.some(x=>x.includes('câmbio pendente')));
r=costPerformance(EMPTY,m,'all',365,now);assert.equal(r.returnPercent,undefined);assert.deepEqual(r.points,[]);
const fixedOnly={...EMPTY,fixedIncome:withFixed.fixedIncome.slice(0,1)};
r=costPerformance(fixedOnly,m,'all',365,now);near(r.returnPercent,10);assert.deepEqual(r.points,[]);
console.log('Cost performance passed: exact costs and fees, pre-registration returns, invested weighting, raw price history, income once, USD without FX, explicit consolidated FX estimates, known FX, mixed-currency BTC, manual fixed-income coverage, dated buys, privacy-safe data reuse, stale and missing data.');
