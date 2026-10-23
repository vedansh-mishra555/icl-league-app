import {useEffect,useState} from 'react'
import {Link,NavLink,Route,Routes,useLocation,useNavigate} from 'react-router-dom'
import {ArrowRight,Bot,ChevronRight,Gavel,LayoutDashboard,Menu,MessageCircle,Send,X} from 'lucide-react'
import {api} from './api'
import {SiteContext,useApi,useSite,TeamDot} from './ui'
import {Gallery,Home,MatchDetail,Matches,PlayerDetail,Players,Rules,TeamDetail,Teams} from './pages'
import {Dashboard,PostAuction,Register,Stats} from './more'
import Auction from './auction'
import Admin from './Admin'

const nav=[['/','Home'],['/teams','Teams'],['/players','Players'],['/matches','Matches'],['/stats','Stats'],['/report','Report'],['/gallery','Gallery'],['/rules','Rules']]

function Mark(){const site=useSite();return <Link className="mark" to="/"><span className="mark-icon">{site.logo?<img src={site.logo} alt="" style={{width:'100%',height:'100%',objectFit:'contain'}}/>:'I'}</span><span><b>ICL</b><small>IEM CRICKET LEAGUE</small></span></Link>}

function ScoreStrip(){
 const site=useSite(),home=useApi('/public/home',[],{refreshMs:30000}),m=home.data?.liveMatches?.[0]
 if(!site.scoreStripEnabled)return null
 if(site.scoreStripText)return <div className="score-strip"><div className="live-tag"><i/> LIVE</div>{site.scoreStripText}</div>
 if(!m)return null
 const inn=i=>m.innings?.[i]
 return <div className="score-strip"><div className="live-tag"><i/> LIVE</div><b>{m.teamA?.shortName}</b> {inn(0)?`${inn(0).runs}/${inn(0).wickets}`:'—'} {m.currentOver&&<span>{m.currentOver} OV</span>}<b>{m.teamB?.shortName}</b> {inn(1)?`${inn(1).runs}/${inn(1).wickets}`:'—'} {m.liveMessage&&<span>{m.liveMessage}</span>}<Link to={`/matches/${m._id}`}>Match centre <ChevronRight size={14}/></Link></div>
}

function Shell({children}){
 const [open,setOpen]=useState(false),loc=useLocation(),site=useSite(),user=(()=>{try{return JSON.parse(localStorage.getItem('icl_user')||'null')}catch{return null}})()
 useEffect(()=>{setOpen(false);scrollTo({top:0,behavior:'smooth'})},[loc.pathname])
 return <div className="app">
 {site.announcement&&<div className="score-strip" style={{justifyContent:'center'}}>{site.announcementLink?<a href={site.announcementLink} target="_blank" rel="noreferrer">{site.announcement} →</a>:site.announcement}</div>}
 <ScoreStrip/>
 <header><Mark/><nav className={open?'open':''}>{nav.map(([to,label])=><NavLink key={to} to={to}>{label}</NavLink>)}<NavLink className="auction-nav" to="/auction"><Gavel size={16}/> Live auction</NavLink></nav><div className="head-actions"><Link className="icon-btn" to="/dashboard" aria-label="Dashboard"><LayoutDashboard size={19}/></Link>{user?<Link className="btn small desktop-login" to={user.role==='admin'?'/admin':'/dashboard'}>{user.role==='admin'?'Admin':user.name?.split(' ')[0]||'Account'}</Link>:<Link className="btn small desktop-login" to="/login">Sign in</Link>}<button className="menu" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div></header>
 <main>{children}</main><Footer/><Chatbot/></div>
}

function Footer(){
 const site=useSite()
 return <footer><div><Mark/><p>{site.about||<>Built for the passion, played for the pride.<br/>The official home of IEM cricket.</>}</p></div>
 <div><b>League</b><Link to="/teams">Teams</Link><Link to="/matches">Fixtures</Link><Link to="/rules">Rules &amp; format</Link><Link to="/register">Register as player</Link></div>
 <div><b>Experience</b><Link to="/auction">Live auction</Link><Link to="/gallery">Gallery</Link><Link to="/dashboard">Team dashboard</Link><Link to="/report">Auction report</Link></div>
 <div><b>Connect</b>{site.contactEmail&&<a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>}{site.instagram&&<a href={site.instagram} target="_blank" rel="noreferrer">Instagram</a>}{site.youtube&&<a href={site.youtube} target="_blank" rel="noreferrer">YouTube</a>}</div>
 <div className="copyright">© {new Date().getFullYear()} IEM Cricket League · Kolkata, India</div></footer>
}

function Login(){const nav=useNavigate(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);async function submit(e){e.preventDefault();setLoading(true);setError('');try{const result=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('icl_token',result.token);localStorage.setItem('icl_user',JSON.stringify(result.user));nav(result.user?.role==='admin'?'/admin':'/dashboard')}catch(err){setError(err.message||'Sign in failed')}finally{setLoading(false)}}function demo(){setEmail('admin@icl.test');setPassword('ChangeMe123!')}return <section className="auth-page"><div className="auth-brand"><Mark/><span className="eyebrow">Season 03 · 2026</span><h1>YOUR TEAM.<br/><em>YOUR CALL.</em></h1><p>Access the auction floor, manage your squad, and make every bid count.</p></div><form className="auth-card" onSubmit={submit}><span className="eyebrow">Secure team access</span><h2>WELCOME BACK</h2><p>Sign in with your registered league account.</p><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@iem.edu.in" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/></label>{error&&<p className="form-error">{error}</p>}<div className="form-row"><label className="check"><input type="checkbox"/> Remember me</label><a href="#">Forgot password?</a></div><button className="btn gold wide" disabled={loading}>{loading?'Signing in…':'Sign in'} <ArrowRight/></button><button type="button" className="demo-login" onClick={demo}>Use demo credentials</button><small>Access is restricted to approved league officials and team managers.</small></form></section>}

function Chatbot(){const [open,setOpen]=useState(false),[messages,setMessages]=useState([{role:'bot',text:'Hi! I’m ICL Assist. Ask me about scores, fixtures, players, auction prices or team purses. Hindi aur Hinglish bhi chalega! 🏏'}]),[q,setQ]=useState(''),[basic,setBasic]=useState(false),[typing,setTyping]=useState(false);async function send(text=q){if(!text.trim())return;setMessages(m=>[...m,{role:'user',text}]);setQ('');setTyping(true);try{let r=await api('/chatbot',{method:'POST',body:JSON.stringify({message:text})});setBasic(Boolean(r.basicMode||r.mode==='basic'));setMessages(m=>[...m,{role:'bot',text:r.answer||r.message}])}catch{setBasic(true);const ans='I cannot reach the server right now. Please try again in a moment.';setTimeout(()=>setMessages(m=>[...m,{role:'bot',text:ans}]),500)}finally{setTimeout(()=>setTyping(false),520)}}return <><button className="chat-launch" onClick={()=>setOpen(!open)} aria-label="Open ICL assistant">{open?<X/>:<MessageCircle/>}<span>ASK ICL</span></button>{open&&<aside className="chat"><div className="chat-head"><span><Bot/> <b>ICL ASSIST</b></span><span className={basic?'mode basic':'mode'}><i/>{basic?'Basic mode':'AI online'}</span></div><div className="messages">{messages.map((m,i)=><div className={m.role} key={i}>{m.text}</div>)}{typing&&<div className="bot typing"><i/><i/><i/></div>}</div><div className="suggestions">{['Next match?','Points table','Falcons purse'].map(x=><button onClick={()=>send(x)} key={x}>{x}</button>)}</div><form onSubmit={e=>{e.preventDefault();send()}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ask anything about ICL..."/><button><Send/></button></form></aside>}</>}

function NotFound(){return <section className="not-found"><span>404</span><h1>OUT!</h1><p>That page has left the field.</p><Link className="btn gold" to="/">Back home</Link></section>}

export default function App(){
 const loc=useLocation(),[site,setSite]=useState({scoreStripEnabled:true,seasonLabel:'',heroTitle:'THE PITCH IS OURS.',heroSubtitle:''})
 useEffect(()=>{api('/site').then(s=>setSite(x=>({...x,...s}))).catch(()=>{})},[loc.pathname.startsWith('/admin')])
 if(loc.pathname.startsWith('/admin'))return <Routes><Route path="/admin/*" element={<Admin/>}/></Routes>
 return <SiteContext.Provider value={site}><Shell><Routes>
  <Route path="/" element={<Home/>}/><Route path="/teams" element={<Teams/>}/><Route path="/teams/:id" element={<TeamDetail/>}/>
  <Route path="/players" element={<Players/>}/><Route path="/players/:id" element={<PlayerDetail/>}/>
  <Route path="/matches" element={<Matches/>}/><Route path="/matches/:id" element={<MatchDetail/>}/>
  <Route path="/gallery" element={<Gallery/>}/><Route path="/rules" element={<Rules/>}/>
  <Route path="/auction" element={<Auction/>}/><Route path="/dashboard" element={<Dashboard/>}/>
  <Route path="/register" element={<Register/>}/><Route path="/stats" element={<Stats/>}/><Route path="/report" element={<PostAuction/>}/>
  <Route path="/login" element={<Login/>}/><Route path="*" element={<NotFound/>}/></Routes></Shell></SiteContext.Provider>
}
