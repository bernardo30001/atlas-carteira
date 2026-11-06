'use client';
import {createContext,useContext,useId,useState,type FormEvent,type InputHTMLAttributes,type ReactNode} from 'react';
type Errors=Record<string,string>;
const FormContext=createContext<{errors:Errors;update:(input:HTMLInputElement)=>void}|null>(null);
export function inputError(input:HTMLInputElement){
 const v=input.validity;
 if(v.valid)return '';
 if(v.valueMissing)return 'Preencha este campo.';
 if(v.badInput||v.typeMismatch)return 'Informe um valor válido.';
 if(v.rangeUnderflow)return input.type==='date'?'A data deve ser igual ou posterior à referência.':`Informe um valor a partir de ${input.min.replace('.',',')}.`;
 if(v.rangeOverflow)return input.type==='date'?'A data não pode estar no futuro.':`O valor máximo é ${input.max.replace('.',',')}.`;
 if(v.stepMismatch)return input.step==='1'?'Informe uma quantidade inteira.':`Use até ${String(input.step).split('.')[1]?.length??2} casas decimais.`;
 if(v.tooLong)return `Use até ${input.maxLength} caracteres.`;
 return 'Confira o valor informado.';
}
export function ValidatedForm({children,onValidSubmit,busy=false}:{children:ReactNode;onValidSubmit:(event:FormEvent<HTMLFormElement>)=>void|Promise<void>;busy?:boolean}){
 const [errors,setErrors]=useState<Errors>({}),[submitted,setSubmitted]=useState(false);
 const update=(input:HTMLInputElement)=>setErrors(old=>({...old,[input.name||input.id]:inputError(input)}));
 return <FormContext.Provider value={{errors,update}}><form noValidate aria-busy={busy} onSubmit={async e=>{e.preventDefault();setSubmitted(true);const form=e.currentTarget,inputs=Array.from(form.querySelectorAll<HTMLInputElement>('input')),next=Object.fromEntries(inputs.filter(x=>x.willValidate).map(x=>[x.name||x.id,inputError(x)]));setErrors(next);const first=inputs.find(x=>next[x.name||x.id]);if(first){requestAnimationFrame(()=>first.focus());return;}await onValidSubmit(e);}}>{submitted&&Object.values(errors).some(Boolean)&&<p className="validation-summary" role="alert">Confira os campos destacados antes de salvar.</p>}{children}</form></FormContext.Provider>;
}
export function FormInput({hint,onBlur,onChange,...props}:InputHTMLAttributes<HTMLInputElement>&{hint?:string}){
 const context=useContext(FormContext),generated=useId(),id=props.id??generated,error=context?.errors[props.name||id],hintId=hint?id+'-hint':undefined,errorId=error?id+'-error':undefined;
 return <><input {...props} id={id} aria-invalid={error?true:undefined} aria-describedby={[props['aria-describedby'],hintId,errorId].filter(Boolean).join(' ')||undefined} onBlur={e=>{context?.update(e.currentTarget);onBlur?.(e);}} onChange={e=>{if(error)context?.update(e.currentTarget);onChange?.(e);}}/>{hint&&<span className="field-hint" id={hintId}>{hint}</span>}<span className={'field-error-slot'+(error?' field-error':'')} id={id+'-error'}>{error??''}</span></>;
}
