import {useEffect,useState} from 'react'
import {Check,RefreshCw,Zap} from 'lucide-react'
import {api} from './api'

const HINTS={
 groq:'Free tier available. Key starts with gsk_…',
 openai:'Key starts with sk-… Change the base URL to use any OpenAI-compatible service (OpenRouter, Together, Azure, Ollama…).',
 gemini:'Get a key from Google AI Studio. Uses Google’s OpenAI-compatible endpoint.',
 xai:'xAI Grok key from console.x.ai.',
 custom:'Any OpenAI-compatible server. Base URL is required, e.g. http://localhost:11434/v1',
}

export function AiAdmin({toast}){
 const [info,setInfo]=useState(null),[form,setForm]=useState({provider:'off',apiKey:'',baseUrl:'',model:''}),[busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[result,setResult]=useState(null)
 const set=(k,v)=>setForm(f=>({...f,[k]:v}))
 const load=async()=>{try{const s=await api('/admin/llm');setInfo(s);const v=s.saved||(s.active?{provider:s.active.provider,baseUrl:s.active.baseUrl,model:s.active.model}:null);if(v)setForm(f=>({...f,provider:v.provider||'off',baseUrl:v.baseUrl||'',model:v.model||''}))}catch(e){toast('Could not load AI settings',e.message,'error')}}
 useEffect(()=>{load()},[])
 const p=info?.providers.find(x=>x.id===form.provider)
 async function save(e){e.preventDefault();setBusy(true);try{setInfo(await api('/admin/llm',{method:'PUT',body:JSON.stringify(form)}));setForm(f=>({...f,apiKey:''}));toast('AI settings saved','The chatbot uses this provider now.')}catch(err){toast('Could not save',err.message,'error')}finally{setBusy(false)}}
 async function test(){setTesting(true);setResult(null);try{setResult(await api('/admin/llm/test',{method:'POST',body:JSON.stringify(form),timeoutMs:25000}))}catch(err){setResult({error:err.message})}finally{setTesting(false)}}
 return <>
  <div className="admin-title"><div><span className="eyebrow">Chatbot</span><h2>AI provider</h2><p>Choose which AI service powers the ICL assistant. With no provider, the chatbot answers from the database in Basic mode.</p></div></div>
  <form className="admin-form-card" onSubmit={save}>
   {info?.active&&<p className="muted">Active now: <b>{info.active.label}</b> · {info.active.model} · key {info.active.key} · set via {info.active.source==='admin'?'this page':'server environment'}</p>}
   {!info?.active&&info&&<p className="muted">No provider active — chatbot is in Basic mode.</p>}
   <div className="editor-grid">
    <label className="field"><span>Provider</span><select value={form.provider} onChange={e=>setForm(f=>({...f,provider:e.target.value,baseUrl:'',model:''}))}><option value="off">Off (Basic mode)</option>{info?.providers.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
    {form.provider!=='off'&&<>
     <label className="field"><span>API key {info?.saved?.hasKey&&info.saved.provider===form.provider&&'(saved — leave blank to keep)'}</span><input type="password" autoComplete="off" value={form.apiKey} onChange={e=>set('apiKey',e.target.value)} placeholder="Paste key"/></label>
     <label className="field"><span>Base URL</span><input type="url" value={form.baseUrl} onChange={e=>set('baseUrl',e.target.value)} placeholder={p?.baseUrl||'https://…/v1'}/></label>
     <label className="field"><span>Model</span><input value={form.model} onChange={e=>set('model',e.target.value)} placeholder={p?.model||'model name'}/></label>
     <p className="muted full">{HINTS[form.provider]} Keys are stored encrypted on the server and never sent back to the browser.</p></>}
   </div>
   {result&&(result.error?<p className="form-error">{result.error}</p>:<p className="muted">Connected in {result.ms} ms · reply: “{result.reply}”</p>)}
   <div className="modal-actions">
    {form.provider!=='off'&&<button type="button" onClick={test} disabled={testing}>{testing?<RefreshCw className="spin"/>:<Zap/>}{testing?'Testing…':'Test connection'}</button>}
    <button className="admin-primary" disabled={busy}>{busy?<RefreshCw className="spin"/>:<Check/>}{busy?'Saving…':'Save'}</button>
   </div>
  </form></>
}
