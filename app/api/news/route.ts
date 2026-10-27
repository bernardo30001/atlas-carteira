import { ASSETS } from '../../lib/model';
const cache=new Map<string,{time:number;items:unknown[]}>();
const decode=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const field=(xml:string,tag:string)=>decode(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1]??'');
export async function GET(request:Request){
  const ticker=new URL(request.url).searchParams.get('ticker')??'all';
  const asset=ASSETS.find(a=>a.ticker===ticker);
  if(ticker!=='all'&&!asset)return Response.json({error:'Ativo inválido'},{status:400});
  const hit=cache.get(ticker);if(hit&&Date.now()-hit.time<300000)return Response.json({items:hit.items,updatedAt:new Date(hit.time).toISOString()});
  try{
    const query=asset?asset.query:'"ALUP11" OR "WEGE3" OR "ITUB4" OR "KLBN4" OR "EGIE3" OR "BPAC11" OR "BBSE3" OR "PSSA3" OR "TUPY3" OR "LEVE3" OR "FESA4" OR "VALE3" OR "PRIO3" OR "SPHQ" OR "VEA" OR "VNQ" OR "IAU" OR "VWO" OR "Bitcoin"';
    const response=await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query+' when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Fonte indisponível');
    const xml=await response.text();
    const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{const x=m[1],link=field(x,'link'),source=field(x,'source'),title=field(x,'title');return {title:source&&title.endsWith(' - '+source)?title.slice(0,-source.length-3):title,link:link.startsWith('https://')?link:'',source,date:field(x,'pubDate'),ticker:asset?.ticker??ASSETS.find(a=>title.includes(a.ticker)||title.toLowerCase().includes(a.name.toLowerCase()))?.ticker??'MERCADO'};}).filter(x=>x.link&&x.title).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,24);
    if(!items.length)throw new Error('Nenhuma notícia recente');
    cache.set(ticker,{time:Date.now(),items});return Response.json({items,updatedAt:new Date().toISOString()});
  }catch{return Response.json({items:hit?.items??[],stale:!!hit,error:'Não foi possível atualizar as notícias. Tente novamente em instantes.'},{status:hit?200:503});}
}
