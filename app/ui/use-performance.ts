'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import type {PerformanceData,CdiRate} from '../lib/performance';
export function usePerformance(enabled:boolean,revision:number,marketTime:string){
 const [data,setData]=useState<PerformanceData>(),[busy,setBusy]=useState(false),[rates,setRates]=useState<CdiRate[]>([]),[cdiError,setCdiError]=useState(''),[cdiBusy,setCdiBusy]=useState(false),[retry,setRetry]=useState(0);
 const lastCdi=useRef(0),cdiFailed=useRef(false),cdiRunning=useRef(false);
 const loadCdi=useCallback(async(force=false)=>{if(cdiRunning.current)return;cdiRunning.current=true;setCdiBusy(true);try{const r=await fetch('/api/cdi'+(force?'?retry=1':''),{cache:'no-store'});if(!r.ok)throw Error();const j:any=await r.json();setRates(j.points??[]);setCdiError(j.error??'');cdiFailed.current=!!j.error;}catch{setCdiError('Não foi possível atualizar o CDI. As demais comparações foram preservadas.');cdiFailed.current=true;}finally{lastCdi.current=Date.now();cdiRunning.current=false;setCdiBusy(false);}},[]);
 useEffect(()=>{loadCdi();const id=setInterval(()=>{if(!document.hidden&&Date.now()-lastCdi.current>(cdiFailed.current?55000:3550000))loadCdi();},60000);return()=>clearInterval(id);},[loadCdi]);
 useEffect(()=>{if(!enabled)return;let stopped=false;fetch('/api/performance').then(async r=>{if(!r.ok)return;const j:any=await r.json();if(!stopped)setData(old=>old??j);}).catch(()=>{});return()=>{stopped=true;};},[enabled]);
 useEffect(()=>{
  if(!enabled||!marketTime)return;let stopped=false;setBusy(true);
  fetch('/api/performance',{method:'POST'}).then(async r=>{const j:any=await r.json();if(stopped)return;if(!r.ok)throw Error(j.error);setData(j);}).catch(e=>{if(!stopped)setData(old=>({...old,points:old?.points??[],startedAt:old?.startedAt??'',updatedAt:old?.updatedAt??'',warnings:old?.warnings??[],error:e instanceof Error?e.message:'Histórico indisponível.'}));}).finally(()=>{if(!stopped)setBusy(false);});return()=>{stopped=true;};
 },[enabled,revision,marketTime,retry]);
 return {data,busy,rates,cdiError,cdiBusy,retryCdi:()=>loadCdi(true),retryHistory:()=>setRetry(x=>x+1)};
}
