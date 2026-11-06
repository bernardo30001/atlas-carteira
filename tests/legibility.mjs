import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import postcss from 'postcss';
import {purchaseLabelLayout} from '../app/lib/purchase-label-layout.ts';
const css=postcss.parse(await fs.readFile('app/globals.css','utf8')),light={},dark={};
css.walkRules(rule=>{const target=rule.selector===':root'?light:rule.selector.replace(/"/g,'')==='html[data-theme=dark]'?dark:null;if(target)rule.walkDecls(d=>{if(d.prop.startsWith('--'))target[d.prop]=d.value;});});
const normalize=hex=>hex.length===4?'#'+[...hex.slice(1)].map(v=>v+v).join(''):hex;
const luminance=hex=>{const channels=normalize(hex).slice(1).match(/.{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
const ratio=(a,b)=>{const [high,low]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (high+.05)/(low+.05);};
const textPairs=[['--ink','--surface'],['--ink','--surface-subtle'],['--text-secondary','--surface'],['--text-secondary','--surface-subtle'],['--muted','--surface'],['--muted','--surface-subtle'],['--muted','--surface-selected'],['--ink','--surface-selected'],['--positive','--surface'],['--negative','--surface'],['--warning-text','--warning-bg'],['--on-action','--action'],['--danger-text','--danger-bg'],['--purchase-label-text','--purchase-label-bg'],...['--chart-ibov','--chart-sp500','--chart-cdi','--chart-bitcoin'].map(bg=>['--on-action',bg])];
for(const [theme,palette] of [['light',light],['dark',{...light,...dark}]]){
 for(const [fg,bg] of textPairs){const value=ratio(palette[fg],palette[bg]);assert.ok(value>=4.5,`${theme} ${fg}/${bg}: ${value.toFixed(2)}`);}
 assert.ok(ratio(palette['--purchase-marker'],palette['--surface'])>=3,theme+' marker contrast');assert.ok(ratio(palette['--border-strong'],palette['--surface'])>=3,theme+' field border contrast');
}
function declaration(selector,prop){let found;css.walkRules(rule=>{if(rule.parent.type==='root'&&rule.selector.split(',').some(s=>s.trim().replace(/\s*>\s*/g,'>')===selector))rule.walkDecls(prop,d=>{found=d.value;});});return found;}
assert.equal(declaration('.donut>div','background'),'var(--surface)');assert.equal(declaration('.donut b','color'),'var(--ink)');assert.equal(declaration('.donut span','color'),'var(--text-secondary)');assert.equal(declaration('.skip-link','background'),'var(--surface)');
assert.equal(declaration('.purchase-count-badge rect','fill'),'var(--purchase-label-bg)');assert.equal(declaration('.purchase-count-badge text','fill'),'var(--purchase-label-text)');assert.equal(declaration('button:disabled','opacity'),'1');
assert.equal(declaration('.table-wrap td','font-size').replace(/^0/,''),'.875rem');
const time=date=>Date.parse(date+'T12:00:00Z'),group=(date,count)=>({time:time(date),portfolio:0,purchases:Array.from({length:count},()=>({}))});
const points=[group('2026-01-01',0),group('2026-04-01',11),group('2026-04-03',12),group('2026-04-04',13),group('2026-12-31',0)],snapshot=JSON.stringify(points);
for(const width of [375,720,1200]){
 const layout=purchaseLabelLayout(points,width,288);assert.equal(layout[0],undefined);assert.equal(layout[4],undefined);assert.equal(new Set(layout.filter(Boolean).map(l=>l.dy)).size,3);assert.ok(layout.filter(Boolean).every(l=>Number.isFinite(l.dx)&&Number.isFinite(l.dy)&&l.width>=24));
}
assert.equal(JSON.stringify(points),snapshot);assert.deepEqual(purchaseLabelLayout([],720,288),[]);
console.log('Legibility passed: 18 text/background roles in both themes, visible marker colors, themed donut and skip link, opaque purchase-count badges, readable disabled controls and table text, and separate label lanes without altering financial points.');
