import { ASSETS } from '../../lib/model';
type NewsItem={title:string;link:string;source:string;date:string;ticker:string};
const cache=new Map<string,{time:number;items:NewsItem[];provider:string}>();
const decode=(s:string)=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const field=(xml:string,tag:string)=>decode(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`))?.[1]??'');
function parse(xml:string,ticker:string,provider:string):NewsItem[]{
 return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)].map(m=>{
  const x=m[1],link=field(x,'link'),source=field(x,'source')||field(x,'News:Source')||provider,title=field(x,'title');
  return {title:source&&title.endsWith(' - '+source)?title.slice(0,-source.length-3):title,link:link.startsWith('https://')?link:'',source,date:field(x,'pubDate'),ticker:ticker!=='all'?ticker:ASSETS.find(a=>title.includes(a.ticker)||title.toLowerCase().includes(a.name.toLowerCase()))?.ticker??'MERCADO'};
 }).filter(x=>x.link&&x.title).sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,24);
}
export async function GET(request:Request){
 const ticker=new URL(request.url).searchParams.get('ticker')??'all',asset=ASSETS.find(a=>a.ticker===ticker);
 if(ticker!=='all'&&!asset)return Response.json({error:'Ativo inválido'},{status:400});
 const hit=cache.get(ticker);if(hit&&Date.now()-hit.time<300000)return Response.json({...hit,updatedAt:new Date(hit.time).toISOString()});
 const query=asset?asset.query:ASSETS.map(a=>'"'+(a.ticker==='BTC'?'Bitcoin':a.ticker)+'"').join(' OR ');
 const urls=[
  {provider:'Google Notícias',url:`https://news.google.com/rss/search?q=${encodeURIComponent(query+' when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`},
  {provider:'Bing Notícias',url:`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=BR`},
  {provider:'Yahoo Finance',url:`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(asset?asset.symbol:ASSETS.map(a=>a.symbol).join(','))}&region=US&lang=en-US`},
 ];
 for(const {provider,url} of urls){
  try{
   const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const items=parse(await response.text(),ticker,provider);
   if(!items.length)throw new Error('Nenhuma notícia na resposta');
   const result={time:Date.now(),items,provider};cache.set(ticker,result);
   return Response.json({...result,updatedAt:new Date(result.time).toISOString()});
  }catch(e){console.warn('News provider unavailable',provider,e instanceof Error?e.message:'Connection failure');}
 }
 return Response.json({items:hit?.items??[],provider:hit?.provider??'Notícias',stale:!!hit,error:'Não foi possível atualizar as notícias. Tente novamente em instantes.'},{status:hit?200:503});
}
