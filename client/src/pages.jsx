import {useMemo,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {ArrowRight,ChevronRight,Clock,Crown,Gavel,Radio,Search,Sparkles,Trophy,Zap} from 'lucide-react'
import {Avatar,Async,CricLink,Empty,Metric,PageHero,SectionHead,TeamDot,ago,api,fmtDate,fmtTime,money,useApi,useSite,useTicker} from './ui'

const ROLES=['All','Batter','Bowler','All-rounder','Wicketkeeper']

function FixtureCard({m}){
 return <Link className="fixture-card" to={`/matches/${m._id}`}>
  <div className="fixture-top"><span>{m.tournament?.name||'League'}</span><b>{fmtDate(m.startsAt)}</b></div>
  <div className="versus"><TeamDot team={m.teamA}/><strong>{m.teamA?.shortName}</strong><small>VS</small><strong>{m.teamB?.shortName}</strong><TeamDot team={m.teamB}/></div>
  <div className="fixture-foot"><Clock size={14}/>{fmtTime(m.startsAt)||'TBA'}<span>·</span>{m.venue||'Venue TBA'}</div>
 </Link>
}
export function PointsTable({rows}){
 return <div className="table-card"><div className="tr th"><span># TEAM</span><span>P</span><span>W</span><span>L</span><span>NRR</span><span>PTS</span></div>
  {rows.map((t,i)=><div className="tr" key={t._id}><span><b className="rank">{i+1}</b><TeamDot team={t}/><strong>{t.name}</strong></span><span>{t.stats?.played??0}</span><span>{t.stats?.won??0}</span><span>{t.stats?.lost??0}</span><span className={t.stats?.nrr>0?'positive':''}>{t.stats?.nrr>0?'+':''}{Number(t.stats?.nrr||0).toFixed(2)}</span><span><b>{t.stats?.points??0}</b></span></div>)}</div>
}
function Leader({title,icon,color,data,metric}){
 return <div className="leader-card" style={{'--leader':color}}><div className="leader-title"><span>{icon}</span><b>{title}</b></div>
  {data.length===0&&<p style={{padding:16,opacity:.6}}>No data yet.</p>}
  {data.map((p,i)=><Link to={`/players/${p._id}`} className="leader-row" key={p._id}><b>0{i+1}</b><Avatar p={p}/><span><strong>{p.name}</strong><small>{p.team?.name||'Unsigned'}</small></span><em>{p.stats?.[metric]??0}<small>{metric==='runs'?' RUNS':' WKTS'}</small></em></Link>)}</div>
}

export function Home(){
 const home=useApi('/public/home',[],{refreshMs:30000}),stats=useApi('/insights/stats'),auction=useApi('/auction/current'),site=useSite()
 return <>
  <section className="hero" style={site.heroImage?{backgroundImage:`linear-gradient(#050d0acc,#050d0aee),url(${site.heroImage})`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}>
   <div className="hero-grid"/>
   <div className="hero-copy"><div className="season"><span/> {site.seasonLabel}</div>
    <h1>{site.heroTitle}</h1><p>{site.heroSubtitle}</p>
    <div className="hero-actions"><Link className="btn gold" to="/matches"><Radio size={18}/> Follow live</Link><Link className="btn ghost" to="/auction"><Gavel size={18}/> Enter auction room</Link></div>
    <div className="hero-stats"><div><b>{String(home.data?.pointsTable?.length??0).padStart(2,'0')}</b><span>TEAMS</span></div><div><b>{String((home.data?.upcomingFixtures?.length??0)+(home.data?.liveMatches?.length??0)).padStart(2,'0')}</b><span>MATCHES AHEAD</span></div><div><b>{String(stats.data?.totalPlayers??0).padStart(2,'0')}</b><span>PLAYERS</span></div></div></div>
   <div className="hero-art"><div className="ball-orbit">{site.logo?<img src={site.logo} alt="ICL" style={{width:'60%'}}/>:<span>ICL</span>}</div>
    {home.data?.upcomingFixtures?.[0]&&(()=>{const m=home.data.upcomingFixtures[0];return <div className="match-chip"><small>NEXT UP · {fmtDate(m.startsAt)}</small><div><TeamDot team={m.teamA}/><b>VS</b><TeamDot team={m.teamB}/></div><p>{fmtTime(m.startsAt)} · {m.venue||'Venue TBA'}</p></div>})()}</div>
  </section>
  <Async res={home} empty={null}>{d=><>
   <section className="wrap"><SectionHead eyebrow="On the calendar" title="UPCOMING FIXTURES" action={['All fixtures','/matches']}/>
    {[...d.liveMatches,...d.upcomingFixtures].length?<div className="fixture-grid">{[...d.liveMatches,...d.upcomingFixtures].slice(0,6).map(m=><FixtureCard key={m._id} m={m}/>)}</div>:<Empty title="No fixtures scheduled" copy="Check back soon."/>}</section>
   <section className="wrap standings-block"><SectionHead eyebrow="League standings" title="ROAD TO THE FINAL" action={['Full table','/matches']}/>
    <div className="split"><PointsTable rows={d.pointsTable}/><div className="form-card"><div className="trophy-mini"><Trophy/></div><span className="eyebrow">Last updated</span><h3>{d.syncStatus==='ok'?'SYNCED WITH CRICHEROES':'MANUALLY MANAGED'}</h3><p>{new Date(d.lastUpdated).toLocaleString('en-IN')}</p></div></div></section>
   <section className="wrap"><SectionHead eyebrow="Top performers" title="THE LEADERS" action={['All players','/players']}/>
    <div className="leader-grid"><Leader title="ORANGE CAP" icon={<Crown/>} color="#f59e42" data={d.orangeCap.slice(0,3)} metric="runs"/><Leader title="PURPLE CAP" icon={<Zap/>} color="#a98bff" data={d.purpleCap.slice(0,3)} metric="wickets"/></div></section>
  </>}</Async>
  {auction.data?.currentPlayer&&<section className="auction-cta"><div><span className="eyebrow">{auction.data.status==='live'?'Auction live now':'Auction room'}</span><h2>BUILD YOUR<br/><em>DREAM XI.</em></h2><p>Watch every bid unfold in real time. Live purse updates, instant sold calls and all the drama.</p><Link className="btn gold" to="/auction">Enter the room <ArrowRight size={18}/></Link></div>
   <div className="bid-preview"><span className="live-tag"><i/> {auction.data.status==='live'?'LIVE':'PAUSED'}</span><Avatar p={auction.data.currentPlayer} className="avatar big"/><h3>{auction.data.currentPlayer.name.toUpperCase()}</h3><p>{auction.data.currentPlayer.role} · {auction.data.currentPlayer.category}</p><small>CURRENT BID</small><strong>{money(auction.data.currentBid)}</strong>{auction.data.highestBidder&&<div className="bidder"><TeamDot team={auction.data.highestBidder}/> {auction.data.highestBidder.name}</div>}</div></section>}
  {site.sponsors?.length>0&&<section className="wrap"><SectionHead eyebrow="Partners" title="OUR SPONSORS"/><div style={{display:'flex',gap:28,flexWrap:'wrap',alignItems:'center'}}>{site.sponsors.map(s=>{const img=s.logo?<img src={s.logo} alt={s.name} style={{height:56,maxWidth:160,objectFit:'contain'}}/>:<b>{s.name}</b>;return s.url?<a key={s.name} href={s.url} target="_blank" rel="noreferrer">{img}</a>:<span key={s.name}>{img}</span>})}</div></section>}
 </>
}

export function Teams(){
 const res=useApi('/teams')
 return <><PageHero kicker="Franchises · One crown" title="MEET THE TEAMS" copy="The squads, leaders and stories fighting for ICL glory."/>
  <Async res={res} empty={<Empty title="No teams yet" copy="Teams will appear once the league is set up."/>}>{teams=><section className="wrap team-grid">{teams.map(t=><Link to={`/teams/${t._id}`} className="team-card" key={t._id} style={{'--team':t.color}}>
   <div className="team-crest">{t.logo?<img src={t.logo} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit'}}/>:t.shortName}</div>
   <h2>{t.name}</h2><p>Captain · {t.captain||t.manager||'TBA'}</p>
   <div className="team-record"><span><b>{t.stats?.won??0}</b>WINS</span><span><b>{t.stats?.lost??0}</b>LOSSES</span><span><b>{Number(t.stats?.nrr||0).toFixed(2)}</b>NRR</span></div>
   <div className="text-link">View squad <ArrowRight size={16}/></div></Link>)}</section>}</Async></>
}

export function PlayerCard({p}){
 return <Link to={`/players/${p._id}`} className="player-card"><Avatar p={p} className="avatar player-avatar"/><span className="category">{p.category}</span><span className="rating">★ {p.rating}</span>
  <h3>{p.name}</h3><p>{p.role}{p.battingStyle?` · ${p.battingStyle}`:''}</p>
  <div className="player-stats"><span><b>{p.stats?.runs??0}</b>RUNS</span><span><b>{p.stats?.wickets??0}</b>WKTS</span><span><b>{p.stats?.strikeRate??0}</b>S/R</span></div>
  <div className="player-team">{p.team?.name||(p.soldPrice?'':`Base ${money(p.basePrice)}`)}{p.soldPrice?` · ${money(p.soldPrice)}`:''}<ChevronRight size={17}/></div></Link>
}

export function TeamDetail(){
 const {id}=useParams(),res=useApi(`/teams/${id}`),comp=useApi(`/insights/teams/${id}/composition`)
 return <Async res={res}>{t=><>
  <section className="team-detail" style={{'--team':t.color}}><TeamDot team={t}/><div><span className="eyebrow">ICL FRANCHISE</span><h1>{t.name}</h1><p>Captain {t.captain||t.manager||'TBA'}{t.viceCaptain?` · Vice-captain ${t.viceCaptain}`:''} · {t.squad.length} player squad</p></div><CricLink url={t.cricheroesUrl}/></section>
  <section className="wrap"><div className="metric-grid"><Metric label="POINTS" value={t.stats?.points??0}/><Metric label="NET RUN RATE" value={Number(t.stats?.nrr||0).toFixed(2)}/><Metric label="PURSE LEFT" value={money(t.purseBalance)} sub={`of ${money(t.purseStart)}`}/><Metric label="SQUAD" value={`${t.squad.length}/${t.squadLimit}`}/></div>
   {comp.data&&<div className="metric-grid" style={{marginTop:12}}><Metric label="BATTERS" value={comp.data.composition.batters}/><Metric label="BOWLERS" value={comp.data.composition.bowlers}/><Metric label="ALL-ROUNDERS" value={comp.data.composition.allRounders}/><Metric label="WICKETKEEPERS" value={comp.data.composition.wicketkeepers}/></div>}
   <SectionHead eyebrow="The squad" title="PLAYING UNIT"/>
   {t.squad.length?<div className="player-grid">{t.squad.map(p=><PlayerCard key={p._id} p={{...p,team:null}}/>)}</div>:<Empty title="No players signed yet" copy="Squad fills up during the auction."/>}</section></>}</Async>
}

export function Players(){
 const [q,setQ]=useState(''),[role,setRole]=useState('All'),[category,setCategory]=useState(''),[sort,setSort]=useState('rating'),[max,setMax]=useState('')
 const qs=new URLSearchParams({sort,...(q&&{q}),...(role!=='All'&&{role}),...(category&&{category}),...(max&&{maxPrice:max})}).toString()
 const res=useApi(`/players?${qs}`)
 return <><PageHero kicker="Player directory" title="THE TALENT POOL" copy="Profiles, form, roles and auction values for every registered player.">
  <div className="filters"><label><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search player..."/></label>{ROLES.map(r=><button onClick={()=>setRole(r)} className={role===r?'active':''} key={r}>{r}</button>)}</div>
  <div className="filters" style={{marginTop:10}}>
   <select value={category} onChange={e=>setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{['Marquee','Premium','Regular','Emerging'].map(c=><option key={c}>{c}</option>)}</select>
   <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort"><option value="rating">Sort: Rating</option><option value="runs">Sort: Runs</option><option value="wickets">Sort: Wickets</option><option value="price">Sort: Base price</option><option value="name">Sort: Name</option></select>
   <select value={max} onChange={e=>setMax(e.target.value)} aria-label="Max base price"><option value="">Any base price</option>{[2500,5000,7500,10000].map(v=><option key={v} value={v}>Up to {money(v)}</option>)}</select>
   <Link className="btn ghost small" to="/register">Register as player</Link></div></PageHero>
  <Async res={res} empty={<section className="wrap"><Empty title="No players match" copy="Try changing the filters."/></section>}>{rows=><section className="wrap player-grid">{rows.map(p=><PlayerCard key={p._id} p={p}/>)}</section>}</Async></>
}

export function PlayerDetail(){
 const {id}=useParams(),res=useApi(`/players/${id}`),[ai,setAi]=useState(null),[busy,setBusy]=useState(false)
 const estimate=async()=>{setBusy(true);try{const [price,perf]=await Promise.all([api(`/ai/players/${id}/price`),api(`/ai/players/${id}/performance`)]);setAi({price,perf})}catch(e){setAi({error:e.message})}finally{setBusy(false)}}
 return <Async res={res}>{p=><>
  <section className="profile-hero"><Avatar p={p} className="avatar mega"/><div><span className="pill">{p.category}</span><h1>{p.name}</h1><p>{p.role}{p.battingStyle?` · ${p.battingStyle}`:''}{p.bowlingStyle?` · ${p.bowlingStyle}`:''}</p><div className="profile-tags"><span>★ {p.rating} rating</span><span>{p.team?.name||'Unsigned'}</span><span>Base {money(p.basePrice)}</span></div></div><CricLink url={p.cricheroesUrl}/></section>
  <section className="wrap"><div className="metric-grid"><Metric label="MATCHES" value={p.stats?.matches??0}/><Metric label="RUNS" value={p.stats?.runs??0}/><Metric label="WICKETS" value={p.stats?.wickets??0}/><Metric label="STRIKE RATE" value={p.stats?.strikeRate??0}/></div>
   <div className="metric-grid" style={{marginTop:12}}><Metric label="ECONOMY" value={p.stats?.economy??0}/><Metric label="AUCTION STATUS" value={p.auctionState.toUpperCase()}/><Metric label="SOLD FOR" value={p.soldPrice?money(p.soldPrice):'—'}/><Metric label="BASE PRICE" value={money(p.basePrice)}/></div>
   {(p.stats?.average||p.stats?.highestScore||p.stats?.fifties||p.stats?.sixes||p.stats?.bestBowling)&&<div className="metric-grid" style={{marginTop:12}}>{p.stats.average!=null&&<Metric label="BATTING AVG" value={p.stats.average}/>}{p.stats.highestScore!=null&&<Metric label="HIGHEST SCORE" value={p.stats.highestScore}/>}{p.stats.fifties!=null&&<Metric label="50s / 100s" value={`${p.stats.fifties??0} / ${p.stats.hundreds??0}`}/>}{p.stats.sixes!=null&&<Metric label="4s / 6s" value={`${p.stats.fours??0} / ${p.stats.sixes}`}/>}{p.stats.bestBowling&&<Metric label="BEST BOWLING" value={p.stats.bestBowling}/>}</div>}
   <div className="panel prose"><h2><Sparkles size={18}/> AI INSIGHTS <small style={{opacity:.6,fontSize:12}}>(optional estimate)</small></h2>
    {!ai&&<button className="btn gold" onClick={estimate} disabled={busy}>{busy?'Analysing…':'Predict price & performance'}</button>}
    {ai?.error&&<p className="form-error">{ai.error}</p>}
    {ai?.price&&<><p>Expected auction price: <b>{money(ai.price.predicted)}</b> (range {money(ai.price.low)} – {money(ai.price.high)}) · confidence {ai.price.confidence} · based on {ai.price.basis}.</p>
     <p>Projected rating <b>{ai.perf.projectedRating}</b> · {ai.perf.outlook} · ≈{ai.perf.expectedPerMatch.runs} runs and {ai.perf.expectedPerMatch.wickets} wickets per match.</p><small style={{opacity:.6}}>{ai.price.note}</small></>}</div></section></>}</Async>
}

export function Matches(){
 const res=useApi('/matches',[],{refreshMs:30000})
 return <><PageHero kicker="Fixtures & results" title="MATCH CENTRE" copy="Every fixture, every scorecard, one place."/>
  <Async res={res} empty={<section className="wrap"><Empty title="No matches yet" copy="Fixtures will be published by the organisers."/></section>}>{rows=>{
   const live=rows.filter(m=>m.status==='live'),up=rows.filter(m=>m.status==='upcoming'),done=rows.filter(m=>m.status==='completed').reverse()
   return <section className="wrap">
    {live.length>0&&<><SectionHead eyebrow="Happening now" title="LIVE"/><div className="fixture-grid">{live.map(m=><FixtureCard key={m._id} m={m}/>)}</div></>}
    <SectionHead eyebrow="Next on the pitch" title="UPCOMING"/>{up.length?<div className="fixture-grid">{up.map(m=><FixtureCard key={m._id} m={m}/>)}</div>:<Empty title="Nothing scheduled" copy="No upcoming fixtures."/>}
    <SectionHead eyebrow="Latest action" title="RESULTS"/>{done.length?<div className="results">{done.map(m=><Link to={`/matches/${m._id}`} key={m._id}><span>{fmtDate(m.startsAt)}</span>
     {[0,1].map(i=>{const t=i?m.teamB:m.teamA,inn=m.innings?.find(x=>String(x.team)===String(t?._id))||m.innings?.[i];return <div key={i}><TeamDot team={t}/><b>{t?.shortName}</b><strong>{inn?`${inn.runs}/${inn.wickets}`:'—'}</strong></div>})}
     <em>{m.result||'Completed'}</em><ChevronRight/></Link>)}</div>:<Empty title="No results yet" copy="Completed matches appear here."/>}</section>}}</Async></>
}

export function LivePanel({m}){
 useTicker()
 const l=m.live
 if(m.status!=='live'||!l)return null
 return <div className="panel" style={{borderColor:'#ff6b61'}}><div className="panel-title"><span className="live-tag"><i/> LIVE</span><small>Updated {ago(m.liveUpdatedAt)} · refreshes every 30s</small></div>
  {m.liveMessage&&<h3>{m.liveMessage}</h3>}
  <div className="metric-grid">{l.runRate!==undefined&&<Metric label="RUN RATE" value={l.runRate}/>}{l.projectedScore&&<Metric label="PROJECTED" value={l.projectedScore}/>}{l.requiredRate&&<Metric label="REQUIRED RATE" value={l.requiredRate}/>}{l.partnership&&<Metric label="PARTNERSHIP" value={l.partnership}/>}</div>
  {l.batters?.map(b=><div className="innings" key={b.name}><span>{b.name}{b.onStrike?' *':''} <strong>{b.runs} ({b.balls})</strong> <small>{b.fours}x4 · {b.sixes}x6 · SR {b.strikeRate}</small></span></div>)}
  {l.bowler&&<div className="innings"><span>{l.bowler.name} <strong>{l.bowler.wickets}/{l.bowler.runs} ({l.bowler.overs} ov)</strong> <small>Econ {l.bowler.economy}</small></span></div>}
  {l.recentOver&&<p>This over: <b style={{letterSpacing:2}}>{l.recentOver}</b></p>}
  {l.lastWicket&&<small>Last wicket: {l.lastWicket}</small>}</div>
}

export function MatchDetail(){
 const {id}=useParams(),res=useApi(`/matches/${id}`,[],{refreshMs:30000})
 return <Async res={res}>{m=>{
  const inn=i=>{const t=i?m.teamB:m.teamA;return m.innings?.find(x=>String(x.team)===String(t?._id))||m.innings?.[i]}
  return <><section className="page-hero"><span className={m.status==='live'?'live-tag':'pill'}>{m.status==='live'&&<i/>} {m.status.toUpperCase()}</span><h1>{m.teamA?.shortName} <em>vs</em> {m.teamB?.shortName}</h1><p>{fmtDate(m.startsAt,{day:'numeric',month:'long',year:'numeric'})} · {m.venue||'Venue TBA'}</p></section>
  <section className="wrap"><div className="scorecard">{[0,1].map(i=>{const t=i?m.teamB:m.teamA,x=inn(i);return <div key={i}><TeamDot team={t}/><h2>{t?.name}</h2><strong>{x?`${x.runs}/${x.wickets}`:'—'}</strong><span>{x?.overs?`${x.overs} OVERS`:''}</span></div>}).reduce((a,b)=>[a,<b key="vs">VS</b>,b])}
   <p>{m.result||m.liveMessage||'Awaiting result'}{m.currentOver?` · Over ${m.currentOver}`:''}</p></div>
   <LivePanel m={m}/>
   {m.balls?.length>0&&<div className="panel"><h3>BALL BY BALL</h3>{[...m.balls].reverse().slice(0,18).map(b=><div className="innings" key={b._id}><span>{b.innings}.{b.over}.{b.ball} · {b.bowler?.name||'—'} to {b.batter?.name||'—'}<strong>{b.wicket?'WICKET':b.extraType?`${b.extraType} +${b.extraRuns}`:`${b.runs} run${b.runs===1?'':'s'}`}</strong></span></div>)}</div>}
   <CricLink url={m.cricheroesUrl}/></section></>}}</Async>
}

export function Gallery(){
 const res=useApi('/gallery'),[open,setOpen]=useState(null)
 return <><PageHero kicker="Through the lens" title="LEAGUE GALLERY" copy="Big hits, bigger moments, and everything between the wickets."/>
  <Async res={res} empty={<section className="wrap"><Empty title="No photos yet" copy="Photos appear here once the admin uploads them."/></section>}>{items=><>
   <section className="wrap gallery-grid">{items.map((x,i)=><article className={`gallery-item g${i%6}`} key={x._id} onClick={()=>setOpen(x)} style={{cursor:'zoom-in',backgroundImage:`url(${x.imageUrl})`,backgroundSize:'cover',backgroundPosition:'center'}}><div><span>{x.takenAt?fmtDate(x.takenAt,{day:'numeric',month:'short',year:'numeric'}):'MATCHDAY'}</span><h3>{x.title}</h3></div></article>)}</section>
   {open&&<div className="sold-overlay" style={{background:'#000d',cursor:'zoom-out'}} onClick={()=>setOpen(null)}><img src={open.imageUrl} alt={open.title} style={{maxWidth:'92vw',maxHeight:'80vh',borderRadius:12}}/><p>{open.title}{open.caption?` — ${open.caption}`:''}</p></div>}</>}</Async></>
}

export function Rules(){
 const res=useApi('/tournament')
 return <><PageHero kicker="How it works" title="RULES & FORMAT" copy="Fast cricket. Fair play. A format built for unforgettable finishes."/>
  <Async res={res} empty={<section className="wrap"><Empty title="Rules not published" copy="The organisers have not added the rules yet."/></section>}>{t=><section className="wrap rules-grid"><div className="rules-nav"><a href="#format">01 · Tournament format</a><a href="#rules">02 · Playing rules</a></div>
   <div className="rules-copy"><article id="format"><span>01</span><h2>{t.name} · {t.season}</h2><p style={{whiteSpace:'pre-line'}}>{t.format||'To be announced.'}</p></article><article id="rules"><span>02</span><h2>Playing rules</h2><p style={{whiteSpace:'pre-line'}}>{t.rules||'To be announced.'}</p></article><CricLink url={t.cricheroesUrl}/></div></section>}</Async></>
}
void useMemo
