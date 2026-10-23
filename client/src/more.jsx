import {useEffect,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {Download,Gavel,Sparkles,TrendingUp,Users} from 'lucide-react'
import {Bar,BarChart,CartesianGrid,Cell,Legend,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import {Async,Avatar,Empty,Metric,PageHero,SectionHead,TeamDot,api,currentUser,download,hasToken,money,short$,useApi} from './ui'
import {PlayerCard} from './pages'

const COLORS=['#f5b941','#50d5c3','#a98bff','#ff6b61','#58a6ff','#f578b6']
const tip={contentStyle:{background:'#101b17',border:'1px solid #ffffff18'},formatter:v=>typeof v==='number'?money(v):v}
const ax={stroke:'#7d8984',fontSize:12}

export function Dashboard(){
 const nav=useNavigate(),user=currentUser(),signed=hasToken()&&user
 const teams=useApi('/teams'),[teamId,setTeamId]=useState(user?.team?._id||user?.team||'')
 useEffect(()=>{if(!teamId&&teams.data?.length&&signed&&user.role!=='manager')setTeamId(teams.data[0]._id)},[teams.data]) // eslint-disable-line
 const comp=useApi(teamId?`/insights/teams/${teamId}/composition`:null),needs=useApi(teamId?`/ai/teams/${teamId}/needs`:null),recs=useApi(teamId?`/ai/teams/${teamId}/recommendations`:null)
 const [err,setErr]=useState(''),auctions=useApi('/auction/current')
 if(!signed)return <><PageHero kicker="Team command centre" title="TEAM DASHBOARD" copy="Sign in to see your franchise purse, squad and auction intelligence."><Link className="btn gold" to="/login">Sign in</Link></PageHero></>
 const aid=auctions.data?._id,canReceipt=['admin','auctioneer','manager'].includes(user.role)
 return <><PageHero kicker="Team command centre" title={comp.data?`${comp.data.team.shortName} DASHBOARD`:'TEAM DASHBOARD'} copy="Purse, squad balance and auction intelligence at a glance.">
   <div className="dashboard-actions">
    {user.role!=='manager'&&teams.data&&<select value={teamId} onChange={e=>setTeamId(e.target.value)}>{teams.data.map(t=><option key={t._id} value={t._id}>{t.name}</option>)}</select>}
    {user.role==='admin'&&<Link className="btn ghost" to="/admin">Admin console</Link>}
    {canReceipt&&aid&&teamId&&<button className="btn ghost" onClick={()=>download(`/auction/${aid}/receipt/${teamId}.pdf`,'team-receipt.pdf').catch(e=>setErr(e.message))}><Download size={17}/> Team receipt</button>}
    <Link className="btn gold" to="/auction"><Gavel size={17}/> Open auction</Link></div>{err&&<p className="form-error">{err}</p>}</PageHero>
  {!teamId?<section className="wrap"><Empty title="No team assigned" copy={user.role==='manager'?'Ask an admin to assign you to a team.':'Select a team above.'}/></section>:
  <Async res={comp}>{d=>{
   const c=d.composition,roleData=[['Batters',c.batters],['Bowlers',c.bowlers],['All-rounders',c.allRounders],['Wicketkeepers',c.wicketkeepers]]
   return <section className="wrap">
    <div className="metric-grid"><Metric label="PURSE AVAILABLE" value={short$(d.purseBalance)} sub={`of ${short$(d.team.purseStart)}`}/><Metric label="TOTAL SPENT" value={short$(d.spent)}/><Metric label="SQUAD SIZE" value={`${c.size}/${c.limit}`} sub={`${c.slotsOpen} slots open`}/><Metric label="TEAM STRENGTH" value={d.strength.score} sub={`quality ${d.strength.quality} · balance ${d.strength.balance}`}/></div>
    <div className="dashboard-grid" style={{marginTop:16}}>
     <div className="panel"><div className="panel-title"><span><Users/> Squad composition</span><small>Captain {d.team.captain||'—'} · VC {d.team.viceCaptain||'—'}</small></div>
      <div className="role-list">{roleData.map(([x,n],i)=><div key={x}><i style={{background:COLORS[i]}}/><span>{x}</span><b>{n}</b></div>)}</div>
      {c.size>0&&<ResponsiveContainer width="100%" height={170}><PieChart><Pie data={roleData.map(([name,value])=>({name,value}))} dataKey="value" innerRadius={44} outerRadius={68} paddingAngle={4}>{COLORS.map(x=><Cell key={x} fill={x}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>}
      {c.wicketkeepers===0&&<p className="form-error">You still need a wicketkeeper.</p>}</div>
     <div className="panel"><div className="panel-title"><span><Sparkles/> AI squad analysis</span><small>optional · heuristic</small></div>
      <Async res={needs}>{n=><><p>{n.summary}</p><ul>{n.gaps.map(g=><li key={g.role}>{g.role}: {g.have}/{g.target}{g.short>0?` — need ${g.short}`:' ✓'}</li>)}</ul></>}</Async>
      <Async res={recs}>{r=>r.recommendations.length?<><b>Suggested targets</b>{r.recommendations.slice(0,4).map(x=><Link key={x.player._id} to={`/players/${x.player._id}`} className="leader-row"><Avatar p={x.player}/><span><strong>{x.player.name}</strong><small>{x.player.role} · est. {money(x.expectedPrice)}{x.fillsNeed?' · fills a gap':''}{x.affordable?'':' · over budget'}</small></span></Link>)}</>:null}</Async></div>
    </div>
    <SectionHead eyebrow="Your roster" title="SQUAD"/>
    {d.players.length?<div className="player-grid compact">{d.players.map(p=><PlayerCard key={p._id} p={{...p,team:null,basePrice:p.soldPrice}}/>)}</div>:<Empty title="No players bought yet" copy="Head to the auction room to build your squad."/>}
   </section>}}</Async>}</>
}

export function Register(){
 const user=currentUser(),signed=hasToken()&&user,[f,setF]=useState({name:'',role:'Batter',battingStyle:'',bowlingStyle:'',matches:'',runs:'',wickets:'',photo:'',cricheroesUrl:''}),[msg,setMsg]=useState(null),[busy,setBusy]=useState(false)
 const set=(k,v)=>setF(x=>({...x,[k]:v}))
 if(!signed)return <PageHero kicker="Join the league" title="PLAYER REGISTRATION" copy="Sign in to register as a player."><Link className="btn gold" to="/login">Sign in</Link></PageHero>
 async function submit(e){e.preventDefault();setBusy(true);setMsg(null);try{const r=await api('/players/register',{method:'POST',body:JSON.stringify(f)});setMsg({ok:true,text:r.message});setF(x=>({...x,name:''}))}catch(err){setMsg({ok:false,text:err.message})}finally{setBusy(false)}}
 return <><PageHero kicker="Join the league" title="PLAYER REGISTRATION" copy="Register for the auction. An admin reviews every entry before it goes live."/>
  <section className="wrap"><form className="auth-card" style={{maxWidth:640,margin:'0 auto'}} onSubmit={submit}>
   <label>Full name<input value={f.name} onChange={e=>set('name',e.target.value)} required maxLength={80}/></label>
   <label>Role<select value={f.role} onChange={e=>set('role',e.target.value)}>{['Batter','Bowler','All-rounder','Wicketkeeper'].map(r=><option key={r}>{r}</option>)}</select></label>
   <label>Batting style<input value={f.battingStyle} onChange={e=>set('battingStyle',e.target.value)} placeholder="Right-hand bat"/></label>
   <label>Bowling style<input value={f.bowlingStyle} onChange={e=>set('bowlingStyle',e.target.value)} placeholder="Right-arm fast"/></label>
   {[['matches','Matches played'],['runs','Total runs'],['wickets','Total wickets']].map(([k,l])=><label key={k}>{l}<input type="number" min="0" value={f[k]} onChange={e=>set(k,e.target.value)}/></label>)}
   <label>Photo URL (optional)<input type="url" value={f.photo} onChange={e=>set('photo',e.target.value)} placeholder="https://"/></label>
   <label>CricHeroes profile (optional)<input type="url" value={f.cricheroesUrl} onChange={e=>set('cricheroesUrl',e.target.value)} placeholder="https://cricheroes.com/player-profile/…"/></label>
   {msg&&<p className={msg.ok?'':'form-error'}>{msg.text}</p>}
   <button className="btn gold wide" disabled={busy}>{busy?'Submitting…':'Submit registration'}</button></form></section></>
}

export function Stats(){
 const stats=useApi('/insights/stats'),an=useApi('/insights/analytics')
 return <><PageHero kicker="Auction intelligence" title="STATISTICS & ANALYTICS" copy="Every number from the auction room."/>
  <Async res={stats}>{s=><section className="wrap"><div className="metric-grid"><Metric label="TOTAL PLAYERS" value={s.totalPlayers}/><Metric label="SOLD" value={s.sold}/><Metric label="UNSOLD" value={s.unsold}/><Metric label="STILL PENDING" value={s.pending}/></div>
   <div className="metric-grid" style={{marginTop:12}}><Metric label="HIGHEST BID" value={money(s.highestBid)}/><Metric label="LOWEST BID" value={money(s.lowestBid)}/><Metric label="AVERAGE PRICE" value={money(s.averagePrice)}/><Metric label="TOTAL SPEND" value={money(s.totalSpend)}/></div>
   <div className="metric-grid" style={{marginTop:12}}>{s.mostExpensive&&<Metric label="MOST EXPENSIVE" value={s.mostExpensive.name} sub={`${money(s.mostExpensive.price)} · ${s.mostExpensive.team}`}/>}{s.highestSpendingTeam&&<Metric label="HIGHEST SPENDING TEAM" value={s.highestSpendingTeam.name} sub={money(s.highestSpendingTeam.spent)}/>}</div></section>}</Async>
  <Async res={an}>{d=><section className="wrap">
   <div className="dashboard-grid">
    <div className="panel chart-panel"><div className="panel-title"><span><TrendingUp/> Team spending</span></div><ResponsiveContainer width="100%" height={260}><BarChart data={d.teamSpending}><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="team" {...ax}/><YAxis {...ax} tickFormatter={short$}/><Tooltip {...tip}/><Bar dataKey="spent" radius={[6,6,0,0]}>{d.teamSpending.map((t,i)=><Cell key={t.team} fill={t.color||COLORS[i%6]}/>)}</Bar></BarChart></ResponsiveContainer></div>
    <div className="panel chart-panel"><div className="panel-title"><span>Purse utilisation</span><small>% of starting purse</small></div><ResponsiveContainer width="100%" height={260}><BarChart data={d.teamSpending} layout="vertical"><CartesianGrid stroke="#ffffff10" horizontal={false}/><XAxis type="number" domain={[0,100]} {...ax} unit="%"/><YAxis type="category" dataKey="team" {...ax} width={50}/><Tooltip contentStyle={tip.contentStyle}/><Bar dataKey="utilization" fill="#50d5c3" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
    <div className="panel chart-panel"><div className="panel-title"><span>Role-wise spending</span></div><ResponsiveContainer width="100%" height={260}><BarChart data={d.roleSpend}><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="role" {...ax}/><YAxis {...ax} tickFormatter={short$}/><Tooltip {...tip}/><Bar dataKey="spend" fill="#a98bff" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
    <div className="panel chart-panel"><div className="panel-title"><span>Price distribution</span><small>players per price band</small></div><ResponsiveContainer width="100%" height={260}><BarChart data={d.distribution}><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="range" {...ax}/><YAxis allowDecimals={false} {...ax}/><Tooltip contentStyle={tip.contentStyle}/><Bar dataKey="players" fill="#f5b941" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
    <div className="panel chart-panel"><div className="panel-title"><span>Batters vs bowlers</span></div><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={d.batsmanVsBowler} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>{COLORS.map(c=><Cell key={c} fill={c}/>)}</Pie><Tooltip {...tip}/><Legend/></PieChart></ResponsiveContainer></div>
   </div></section>}</Async></>
}

export function PostAuction(){
 const lb=useApi('/insights/leaderboard'),teams=useApi('/teams'),[sel,setSel]=useState([]),cmp=useApi(sel.length>=2?`/insights/compare?ids=${sel.join(',')}`:null),auc=useApi('/auction/current'),user=currentUser(),admin=hasToken()&&['admin','auctioneer'].includes(user?.role),[err,setErr]=useState('')
 const toggle=id=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id].slice(-4))
 return <><PageHero kicker="After the hammer" title="AUCTION REPORT" copy="Final squads, team strength, comparisons and the leaderboard.">
   {admin&&auc.data&&<div className="dashboard-actions"><button className="btn ghost" onClick={()=>download(`/auction/${auc.data._id}/export.csv`,'icl-auction.csv').catch(e=>setErr(e.message))}><Download size={16}/> Export CSV</button><button className="btn ghost" onClick={()=>download(`/auction/${auc.data._id}/export.pdf`,'icl-auction-report.pdf').catch(e=>setErr(e.message))}><Download size={16}/> Full PDF report</button></div>}{err&&<p className="form-error">{err}</p>}</PageHero>
  <Async res={lb} empty={<section className="wrap"><Empty title="No data yet" copy="The report fills in as players are sold."/></section>}>{d=><section className="wrap">
   <SectionHead eyebrow="Ranked by squad strength" title="LEADERBOARD"/>
   <div className="table-card"><div className="tr th"><span># TEAM</span><span>STRENGTH</span><span>QUALITY</span><span>BALANCE</span><span>SPENT</span><span>SQUAD</span></div>{d.teams.map(t=><div className="tr" key={t._id}><span><b className="rank">{t.rank}</b><TeamDot team={t}/><Link to={`/teams/${t._id}`}><strong>{t.name}</strong></Link></span><span><b>{t.strength.score}</b></span><span>{t.strength.quality}</span><span>{t.strength.balance}</span><span>{short$(t.spent)}</span><span>{t.squadSize}</span></div>)}</div>
   <SectionHead eyebrow="Biggest buys" title="TOP 10 PURCHASES"/>
   {d.topBuys.length?<div className="results">{d.topBuys.map((p,i)=><Link to={`/players/${p._id}`} key={p._id}><span>#{i+1}</span><div><b>{p.name}</b></div><div><TeamDot team={p.team}/><b>{p.team?.shortName}</b></div><em>{p.role}</em><strong>{money(p.soldPrice)}</strong></Link>)}</div>:<Empty title="No sales yet" copy=""/>}
  </section>}</Async>
  <section className="wrap"><SectionHead eyebrow="Pick 2–4 teams" title="TEAM COMPARISON"/>
   <div className="filters">{teams.data?.map(t=><button key={t._id} className={sel.includes(t._id)?'active':''} onClick={()=>toggle(t._id)}>{t.shortName}</button>)}</div>
   {cmp.data&&<div className="table-card" style={{marginTop:16,overflowX:'auto'}}>
    {[['Team',t=>t.name],['Strength',t=>t.strength.score],['Average rating',t=>t.avgRating],['Squad size',t=>t.squadSize],['Spent',t=>money(t.spent)],['Purse left',t=>money(t.purseBalance)],['Batters',t=>t.composition.batters],['Bowlers',t=>t.composition.bowlers],['All-rounders',t=>t.composition.allRounders],['Wicketkeepers',t=>t.composition.wicketkeepers],['Top buy',t=>t.mostExpensive?`${t.mostExpensive.name} (${short$(t.mostExpensive.soldPrice)})`:'—']].map(([label,fn])=><div className="tr" key={label} style={{gridTemplateColumns:`160px repeat(${cmp.data.length},1fr)`}}><span><b>{label}</b></span>{cmp.data.map(t=><span key={t._id}>{fn(t)}</span>)}</div>)}</div>}
   {sel.length===1&&<p style={{opacity:.7}}>Select one more team.</p>}</section></>
}
