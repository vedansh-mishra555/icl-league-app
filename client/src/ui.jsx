import {createContext,useCallback,useContext,useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowRight,RefreshCw,WifiOff} from 'lucide-react'
import {api,API} from './api'

export const money=v=>`₹${Number(v||0).toLocaleString('en-IN')}`
export const short$=v=>{v=Number(v||0);return v>=100000?`₹${(v/100000).toFixed(v%100000?2:0)}L`:v>=1000?`₹${(v/1000).toFixed(v%1000?1:0)}K`:`₹${v}`}
export const fmtDate=(d,opts={day:'2-digit',month:'short'})=>d?new Date(d).toLocaleDateString('en-GB',opts).toUpperCase():'TBA'
export const fmtTime=d=>d?new Date(d).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):''
export const initials=n=>(n||'?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()

export function currentUser(){try{return JSON.parse(localStorage.getItem('icl_user')||'null')}catch{return null}}
export const hasToken=()=>Boolean(localStorage.getItem('icl_token'))

// Fetch helper with loading/error/reload. `path` null skips the request.
export function useApi(path,deps=[]){
 const [state,setState]=useState({data:null,error:null,loading:Boolean(path)})
 const load=useCallback(async(quiet)=>{
  if(!path)return setState({data:null,error:null,loading:false})
  if(!quiet)setState(s=>({...s,loading:true,error:null}))
  try{setState({data:await api(path),error:null,loading:false})}catch(e){setState(s=>({data:quiet?s.data:null,error:e.message==='signal is aborted without reason'?'The server did not respond':e.message,loading:false}))}
 },[path]) // eslint-disable-line
 useEffect(()=>{load()},[load,...deps]) // eslint-disable-line
 return {...state,reload:load}
}

export async function download(path,filename){
 const res=await fetch(`${API}${path}`,{headers:{Authorization:`Bearer ${localStorage.getItem('icl_token')||''}`}})
 if(!res.ok){let m='Download failed';try{m=(await res.json()).message||m}catch{}throw new Error(m)}
 const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export const SiteContext=createContext({})
export const useSite=()=>useContext(SiteContext)

export const PageHero=({kicker,title,copy,children})=><section className="page-hero"><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{copy}</p>{children}</section>
export const SectionHead=({eyebrow,title,action})=><div className="section-head"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action&&<Link className="text-link" to={action[1]}>{action[0]}<ArrowRight size={16}/></Link>}</div>
export const Metric=({label,value,sub})=><div className="metric"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>

export function TeamDot({team,size}){
 if(!team)return <span className="team-dot">?</span>
 return <span className="team-dot" style={{'--team':team.color||'#f5b941',...(size?{width:size,height:size}:{})}}>{team.logo?<img src={team.logo} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}/>:(team.shortName||team.short||'?')}</span>
}
export function Avatar({p,className='avatar'}){
 return <div className={className}>{p?.photo?<img src={p.photo} alt={p.name} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}/>:initials(p?.name)}</div>
}
export const Loading=({label='Loading…'})=><div className="wrap" style={{padding:'60px 0',textAlign:'center',opacity:.7}}><RefreshCw className="spin"/> <p>{label}</p></div>
export const ErrorBox=({error,retry})=><div className="wrap" style={{padding:'60px 0',textAlign:'center'}}><WifiOff/><h3>Couldn’t load this</h3><p style={{opacity:.7}}>{error}</p>{retry&&<button className="btn ghost" onClick={()=>retry()}>Try again</button>}</div>
export const Empty=({title,copy})=><div className="panel" style={{textAlign:'center',padding:'40px 20px'}}><h3>{title}</h3><p style={{opacity:.7}}>{copy}</p></div>
export function Async({res,children,empty}){
 if(res.loading)return <Loading/>
 if(res.error)return <ErrorBox error={res.error} retry={res.reload}/>
 if(empty&&(!res.data||(Array.isArray(res.data)&&!res.data.length)))return empty
 return children(res.data)
}
export const CricLink=({url})=>url?<a className="btn ghost" href={url} target="_blank" rel="noreferrer">View on CricHeroes ↗</a>:null
export {api}
