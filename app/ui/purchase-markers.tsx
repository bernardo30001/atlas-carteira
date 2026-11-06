import type {TradeEvent} from '../lib/model';
import type {PurchaseLabelPlacement} from '../lib/purchase-label-layout';
const quantity=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:8});
const money=(value:number,currency:string)=>value.toLocaleString('pt-BR',{style:'currency',currency});
const date=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString('pt-BR');
const description=(event:TradeEvent,hidden:boolean)=>`${date(event.date)} · ${event.ticker} · ${hidden?'valores ocultos':`${quantity(event.quantity)} × ${money(event.price,event.currency)} · total ${money(event.total,event.currency)}`}`;

export function PurchaseDot({cx,cy,payload,hidden,fallback,labelPlacement}:{cx?:number;cy?:number;payload?:{purchases?:TradeEvent[]};hidden:boolean;fallback:boolean;labelPlacement?:PurchaseLabelPlacement}){
 if(cx===undefined||cy===undefined)return <g/>;
 const purchases=payload?.purchases??[];
 if(!purchases.length)return fallback?<circle cx={cx} cy={cy} r={4} fill="var(--positive)"/>:<g/>;
 const label=purchases.map(e=>description(e,hidden)).join('\n');
 const placement=labelPlacement??{dx:0,dy:cy<38?13:-32,width:Math.max(24,String(purchases.length).length*7.5+10)};
 const x=cx+placement.dx,y=cy+placement.dy;
 return <g tabIndex={0} role="img" aria-label={'Compra no extrato: '+label} className="purchase-dot"><title>{label}</title>{purchases.length>1&&<g className="purchase-count-badge" aria-hidden="true" pointerEvents="none"><line x1={cx} y1={cy} x2={x} y2={placement.dy<0?y+19:y} stroke="var(--purchase-label-border)" strokeWidth={1}/><rect x={x-placement.width/2} y={y} width={placement.width} height={19} rx={4} fill="var(--purchase-label-bg)" stroke="var(--purchase-label-border)"/><text x={x} y={y+13.5} textAnchor="middle" fill="var(--purchase-label-text)" fontSize={12.5} fontWeight={750}>{purchases.length}</text></g>}<circle cx={cx} cy={cy} r={6} fill="var(--purchase-marker)" stroke="var(--purchase-marker-border)" strokeWidth={2}/></g>;
}

export function PurchaseTooltipHeader({label,purchases,hidden}:{label:string;purchases:TradeEvent[];hidden:boolean}){
 return <div className="purchase-tooltip"><b>{label}</b>{purchases.length>0&&<><strong>{purchases.length===1?'Compra registrada':'Compras registradas'}</strong>{purchases.map(e=><div key={e.id}><b>{e.ticker}</b><span>{hidden?'Valores ocultos':`${quantity(e.quantity)} × ${money(e.price,e.currency)}`}</span><span>{hidden?'••••••':'Total: '+money(e.total,e.currency)}</span></div>)}<small>Data da movimentação no extrato. O ponto acompanha o rendimento do grupo nessa data.</small></>}</div>;
}

export function PurchaseTable({purchases,hidden}:{purchases:TradeEvent[];hidden:boolean}){
 if(!purchases.length)return null;
 return <details className="performance-method"><summary>Consultar {purchases.length} compras marcadas no gráfico</summary><div className="table-wrap chart-data-table" tabIndex={0} role="region" aria-label="Compras da posição atual no período"><table><caption>Compras do ciclo atual · data e valores do extrato</caption><thead><tr><th>Data</th><th>Ativo</th><th>Quantidade</th><th>Preço pago</th><th>Valor da operação</th></tr></thead><tbody>{purchases.map(e=><tr key={e.id}><td>{date(e.date)}</td><th scope="row">{e.ticker}</th><td>{hidden?'•••':quantity(e.quantity)}</td><td>{hidden?'••••••':money(e.price,e.currency)}</td><td>{hidden?'••••••':money(e.total,e.currency)}</td></tr>)}</tbody></table></div></details>;
}
