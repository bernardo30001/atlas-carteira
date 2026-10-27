'use client';
import {useEffect,useState} from 'react';
import type {PerformanceData,CdiRate} from '../lib/performance';
export function usePerformance(enabled:boolean,revision:number,marketTime:string){
 const [data,setData]=useState<PerformanceData>(),[busy,setBusy]=useState(false),[rates,setRates]=useState<CdiRate[]>([]),[cdiError,setCdiError]=useState('');
 useEffect(()=>{let stopped=false;async function load(){try{const r=await fetch('/api/cdi');const j:any=await r.json();if(!stopped){setRates(j.points??[]);setCdiError(j.error??'');}}catch{if(!stopped)setCdiError('CDI indisponível no momento.');}}load();const id=setInterval(()=>{if(!document.hidden)load();},3600000);return()=>{stopped=true;clearInterval(id);};},[]);
 useEffect(()=>{
  if(!enabled||!marketTime)return;let stopped=false;setBusy(true);
  fetch('/api/performance',{method:'POST'}).then(async r=>{const j:any=await r.json();if(stopped)return;if(!r.ok)throw Error(j.error);setData(j);}).catch(e=>{if(!stopped)setData(old=>({...old,points:old?.points??[],startedAt:old?.startedAt??'',updatedAt:old?.updatedAt??'',warnings:old?.warnings??[],error:e instanceof Error?e.message:'Histórico indisponível.'}));}).finally(()=>{if(!stopped)setBusy(false);});
  return()=>{stopped=true;};
 },[enabled,revision,marketTime]);
 return {data,busy,rates,cdiError};
}
