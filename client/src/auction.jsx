import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {Activity,Bell,ChevronRight,Download,Gavel,Pause,Play,RotateCcw,ShieldCheck,Undo2,Wifi,WifiOff} from 'lucide-react'
import {io} from 'socket.io-client'
import {SOCKET_URL} from './api'
import {Avatar,Empty,Loading,TeamDot,api,currentUser,download,hasToken,money} from './ui'

const TOTAL_CIRC=276

export default function Auction(){
 const user=currentUser(),role=hasToken()?user?.role:null
 const canControl=role==='admin'||role==='auctioneer',canBid=canControl||role==='manager'
 const [a,setA]=useState(null),[err,setErr]=useState(''),[connected,setConnected]=useState(false),[projector,setProjector]=useState(false)
 const [tick,setTick]=useState(0),[offset,setOffset]=useState(0),[toasts,setToasts]=useState([]),[sold,setSold]=useState(null),[busy,setBusy]=useState(false)
 const [teamId,setTeamId]=useState(user?.team?._id||user?.team||''),[pool,setPool]=useState([]),[pick,setPick]=useState(''),[search,setSearch]=useState(''),[secs,setSecs]=useState(30),[tab,setTab]=useState('pending')
 const myTeamRef=useRef(teamId);myTeamRef.current=teamId

 const toast=useCallback((message,kind='info')=>{const id=Math.random();setToasts(t=>[...t.slice(-3),{id,message,kind}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3800)},[])
 const apply=useCallback(s=>{if(!s)return;setOffset(new Date(s.serverTime).getTime()-Date.now());setA(s);setSecs(v=>v||s.timerSeconds)},[])

 useEffect(()=>{api('/auction/current').then(apply).catch(e=>setErr(e.message))},[apply])
 useEffect(()=>{
  const s=io(SOCKET_URL,{transports:['websocket','polling'],auth:{token:localStorage.getItem('icl_token')||undefined},reconnectionDelayMax:4000})
  s.on('connect',()=>{setConnected(true);api('/auction/current').then(apply).catch(()=>{})})
  s.on('disconnect',()=>setConnected(false))
  s.on('auction:state',apply)
  s.on('player:sold',x=>{setSold(x);setTimeout(()=>setSold(null),6500)})
  s.on('player:unsold',()=>toast('Player went UNSOLD','warn'))
  s.on('player:skipped',()=>toast('Player skipped','warn'))
  s.on('notification',n=>{if(n.type==='new_bid')return toast(n.message);if(n.type==='outbid'){if(String(n.teamId)===String(myTeamRef.current))toast(n.message,'danger');return}toast(n.message,n.type==='sold'?'success':'info')})
  return()=>s.close()
 },[apply,toast])
 useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),250);return()=>clearInterval(t)},[])
 useEffect(()=>{if(canControl)api('/players').then(setPool).catch(()=>{})},[canControl,a?.currentPlayer?._id,a?.status])

 const remaining=useMemo(()=>{
  if(!a)return 0
  if(a.status!=='live'||a.phase==='closed')return a.status==='paused'&&a.phase!=='closed'?a.timerSeconds:0
  return Math.max(0,Math.ceil((new Date(a.endsAt).getTime()-(Date.now()+offset))/1000))
 },[a,offset,tick]) // eslint-disable-line
 const player=a?.currentPlayer,teams=a?.teams||[],myTeam=teams.find(t=>t._id===teamId)
 const nextBid=a?(a.highestBidder?a.currentBid+a.increment:a.currentBid):0
 const open=a&&a.status==='live'&&a.phase!=='closed'&&remaining>0
 const blockers=[]
 if(!canBid)blockers.push(role?'Your role cannot bid':'Sign in as a team manager to bid')
 else if(!myTeam)blockers.push('Select a team')
 else{
  if(String(a?.highestBidder?._id)===String(teamId))blockers.push('You hold the highest bid')
  if(myTeam.purseBalance<nextBid)blockers.push('Not enough purse')
  if(myTeam.squadSize>=myTeam.squadLimit)blockers.push('Squad is full')
 }
 const phaseLabel=!a?'':a.phase==='closed'?(a.lastAction==='sold'?'SOLD':a.lastAction==='unsold'?'UNSOLD':'LOT CLOSED'):a.status==='paused'?'AUCTION PAUSED':remaining===0?'TIME UP':a.phase==='twice'?'GOING TWICE…':a.phase==='once'?'GOING ONCE…':'BIDDING OPEN'

 async function run(path,body={},ok){setBusy(true);try{await api(path,{method:'POST',body:JSON.stringify(body)});ok&&toast(ok,'success')}catch(e){toast(e.message,'danger')}finally{setBusy(false)}}
 const bid=()=>run(`/auction/${a._id}/bid`,{teamId,amount:nextBid},`Bid placed: ${money(nextBid)}`)
 const act=(name,extra={})=>run(`/auction/${a._id}/actions/${name}`,extra)

 if(err&&!a)return <div className="wrap" style={{padding:'80px 0'}}><Empty title="No auction yet" copy={err==='Auction not found'?'An admin needs to create the auction first (Admin → Auction setup).':err}/></div>
 if(!a)return <Loading label="Joining auction room…"/>

 const list=pool.filter(p=>(tab==='pending'?['pending','skipped'].includes(p.auctionState):p.auctionState===tab)&&p.name.toLowerCase().includes(search.toLowerCase()))
 const counts=s=>pool.filter(p=>s==='pending'?['pending','skipped'].includes(p.auctionState):p.auctionState===s).length
 const bidderTeam=a.highestBidder
 const bids=a.bids||[]

 return <div className={projector?'projector auction-page':'auction-page'}>
  <div className="toast-stack" aria-live="polite" style={{position:'fixed',top:76,right:16,zIndex:60,display:'grid',gap:8}}>{toasts.map(t=><div key={t.id} className="toast" style={{position:'static',borderColor:t.kind==='danger'?'#ff6b61':t.kind==='success'?'#50d5c3':undefined}}><Bell size={17}/>{t.message}</div>)}</div>
  {sold&&<div className="sold-overlay" onClick={()=>setSold(null)}><span>SOLD</span><b>{money(sold.amount)}</b><small>{sold.team?.name}</small><p>{player?.name}</p></div>}
  <div className="auction-bar"><div><span className="live-tag"><i/> {a.status==='live'?'LIVE AUCTION':a.status.toUpperCase()}</span><b>{a.name} · Round {a.round}</b></div>
   <div className="auction-tools"><span title={connected?'Connected':'Reconnecting…'} style={{display:'inline-flex',gap:6,alignItems:'center'}}>{connected?<Wifi size={15}/>:<WifiOff size={15}/>}{connected?'Live':'Reconnecting…'}</span><span>{a.remaining} left in pool</span><button onClick={()=>setProjector(!projector)}>{projector?'Exit projector':'Projector mode'}</button></div></div>

  {!player?<div className="wrap" style={{padding:'60px 0'}}><Empty title="Waiting for the next lot" copy={canControl?'Pick a player below to start bidding.':'The auctioneer will bring the next player shortly.'}/></div>:
  <section className="auction-layout">
   <aside className="lot-panel"><div className="lot-top"><span>{player.category?.toUpperCase()}</span><span className="pill">{player.role}</span></div>
    <Avatar p={player} className="avatar auction-avatar"/><h1>{player.name.split(' ').map((w,i)=><span key={i}>{w}{i===0&&<br/>}</span>)}</h1><p>{player.battingStyle||player.role}{player.bowlingStyle?` · ${player.bowlingStyle}`:''}</p>
    <div className="skill-row"><span><b>{player.stats?.runs??0}</b>Runs</span><span><b>{player.stats?.wickets??0}</b>Wickets</span><span><b>{player.rating}</b>Rating</span></div>
    <div className="base"><span>BASE PRICE</span><b>{money(player.basePrice)}</b></div></aside>
   <div className="bid-stage">
    <div className={`countdown ${remaining<6&&open?'danger':''}`}><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle className="progress" cx="50" cy="50" r="44" style={{strokeDashoffset:TOTAL_CIRC-(TOTAL_CIRC*Math.min(1,remaining/(a.timerSeconds||30)))}}/></svg><strong>{remaining}</strong><small>SECONDS</small></div>
    <p className="going">{phaseLabel}</p><span className="current-label">CURRENT BID</span><h2>{money(a.currentBid)}</h2>
    <div className="highest">{bidderTeam?<><TeamDot team={bidderTeam}/><span><small>HIGHEST BIDDER</small><b>{bidderTeam.name}</b></span></>:<span><small>HIGHEST BIDDER</small><b>No bids yet</b></span>}</div>
    {!projector&&<>
     {canControl&&<select value={teamId} onChange={e=>setTeamId(e.target.value)} aria-label="Bid on behalf of" style={{margin:'10px 0'}}><option value="">Bid on behalf of…</option>{teams.map(t=><option key={t._id} value={t._id}>{t.name}</option>)}</select>}
     <button className="bid-button" onClick={bid} disabled={busy||!open||blockers.length>0}><Gavel/> BID {money(nextBid)}<small>{blockers[0]||`ONE-TAP BID · +${money(a.increment)}`}</small></button>
     {myTeam&&<p className="purse-note"><ShieldCheck/> Purse after bid: {money(Math.max(0,myTeam.purseBalance-nextBid))}</p>}</>}
   </div>
   <aside className="history-panel"><div className="panel-title"><span><Activity/> Bid history</span><b>{bids.length} BIDS</b></div>
    <div className="bid-list">{bids.length===0&&<p style={{padding:12,opacity:.6}}>No bids yet.</p>}{bids.map(b=><div key={b._id}><TeamDot team={b.team}/><span><b>{b.team?.name}</b><small>{new Date(b.createdAt).toLocaleTimeString('en-IN')}</small></span><strong>{money(b.amount)}</strong></div>)}</div>
    {myTeam&&<div className="purse-mini"><b>{myTeam.name.toUpperCase()}</b><div><span>Available purse</span><strong>{money(myTeam.purseBalance)}</strong></div><div className="purse-track"><i style={{width:`${Math.min(100,myTeam.purseBalance/Math.max(1,myTeam.purseStart)*100)}%`}}/></div><small>{myTeam.squadSize}/{myTeam.squadLimit} players · {myTeam.byRole.Wicketkeeper} wicketkeeper{myTeam.byRole.Wicketkeeper===1?'':'s'}</small></div>}
   </aside></section>}

  {canControl&&!projector&&<div className="auction-control">
   {a.status==='paused'?<button onClick={()=>act('resume')} disabled={busy||a.phase==='closed'}><Play/>Resume</button>:<button onClick={()=>act('pause')} disabled={busy||a.status!=='live'}><Pause/>Pause</button>}
   <button onClick={()=>act('undo')} disabled={busy||!player}><Undo2/>Undo bid</button>
   <button onClick={()=>act('skip')} disabled={busy||!player||a.phase==='closed'}><ChevronRight/>Skip</button>
   <button className="unsold" onClick={()=>act('unsold')} disabled={busy||!player||a.phase==='closed'}>UNSOLD</button>
   <button className="sold" onClick={()=>act('sold')} disabled={busy||!bidderTeam||a.phase==='closed'}>SOLD</button>
   {a.phase==='closed'&&a.lastAction==='sold'&&player&&<button onClick={()=>download(`/auction/${a._id}/receipt/player/${player._id}.pdf`,`receipt-${player.name}.pdf`).catch(e=>toast(e.message,'danger'))}><Download/>Receipt</button>}
  </div>}

  <section className="wrap" style={{padding:'24px 0'}}>
   <div className="panel"><div className="panel-title"><span>Team purses & squads</span></div>
    <div className="team-board" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12}}>{teams.map(t=><div key={t._id} className="metric" style={{borderColor:String(bidderTeam?._id)===String(t._id)?'#f5b941':undefined}}>
     <span style={{display:'flex',gap:8,alignItems:'center'}}><TeamDot team={t}/>{t.name}</span><strong>{money(t.purseBalance)}</strong>
     <small>{t.squadSize}/{t.squadLimit} players · B{t.byRole.Batter} Bw{t.byRole.Bowler} AR{t.byRole['All-rounder']} WK{t.byRole.Wicketkeeper}</small>
     <div className="purse-track"><i style={{width:`${Math.min(100,(t.spent||0)/Math.max(1,t.purseStart)*100)}%`}}/></div><small>Spent {money(t.spent)}</small></div>)}</div></div>

   {canControl&&!projector&&<div className="panel" style={{marginTop:16}}>
    <div className="panel-title"><span>Player pool</span><small>{role==='admin'&&a.status!=='live'?<ConfigForm a={a} onDone={s=>toast('Auction settings saved','success')} />:null}</small></div>
    <div className="filters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search player…"/>{[['pending','Pending'],['unsold','Unsold'],['sold','Sold']].map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l} ({counts(k)})</button>)}
     <label>Timer <input type="number" min="5" max="180" value={secs} onChange={e=>setSecs(Number(e.target.value))} style={{width:70}}/> s</label></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8,marginTop:12,maxHeight:340,overflow:'auto'}}>{list.slice(0,60).map(p=><div key={p._id} className="metric" style={{display:'flex',gap:10,alignItems:'center'}}>
     <Avatar p={p} className="avatar"/><span style={{flex:1}}><b>{p.name}</b><br/><small>{p.role} · {p.category} · {money(p.basePrice)}</small></span>
     {tab==='sold'?<small>{money(p.soldPrice)}</small>:<button className="btn gold small" disabled={busy||(a.status==='live'&&a.phase!=='closed')} onClick={()=>act(tab==='unsold'||p.auctionState==='skipped'?'reauction':'start',{playerId:p._id,timerSeconds:secs})}>{tab==='unsold'||p.auctionState==='skipped'?<><RotateCcw size={14}/> Re-auction</>:'Start'}</button>}</div>)}
     {list.length===0&&<p style={{opacity:.6}}>No players in this list.</p>}</div></div>}
   {!role&&<p style={{textAlign:'center',marginTop:16}}><Link className="btn gold" to="/login">Sign in to bid</Link></p>}
  </section>
 </div>
}

function ConfigForm({a,onDone}){
 const [inc,setInc]=useState(a.increment),[sec,setSec]=useState(a.timerSeconds),[msg,setMsg]=useState('')
 const save=async()=>{try{await api(`/admin/auctions/${a._id}/config`,{method:'PATCH',body:JSON.stringify({increment:Number(inc),timerSeconds:Number(sec)})});onDone();setMsg('Saved')}catch(e){setMsg(e.message)}}
 return <span style={{display:'inline-flex',gap:8,alignItems:'center',fontSize:12}}>Increment <input type="number" min="1" value={inc} onChange={e=>setInc(e.target.value)} style={{width:80}}/> Default timer <input type="number" min="5" max="180" value={sec} onChange={e=>setSec(e.target.value)} style={{width:60}}/><button className="btn ghost small" onClick={save}>Save</button>{msg}</span>
}
