import {useEffect,useRef,useState} from 'react'
import {Check,Copy,Image as ImageIcon,Link2,Plus,RefreshCw,Trash2,Upload,X} from 'lucide-react'
import {api} from './api'

// Downscale in the browser so uploads stay small and fast, even from phone cameras.
export async function prepareImage(file,max=1600){
 if(!file.type.startsWith('image/'))throw new Error('Choose an image file')
 if(file.type==='image/gif')return fileToDataUrl(file)
 const url=URL.createObjectURL(file)
 try{
  const img=await new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>bad(new Error('Could not read this image'));i.src=url})
  const scale=Math.min(1,max/Math.max(img.width,img.height))
  const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale)
  c.getContext('2d').drawImage(img,0,0,c.width,c.height)
  const webp=c.toDataURL('image/webp',.86)
  return webp.startsWith('data:image/webp')?webp:c.toDataURL('image/jpeg',.88)
 }finally{URL.revokeObjectURL(url)}
}
const fileToDataUrl=f=>new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>bad(new Error('Could not read file'));r.readAsDataURL(f)})
export async function uploadImage(file,extra={}){
 const dataUrl=await prepareImage(file)
 return api('/admin/media',{method:'POST',body:JSON.stringify({name:file.name,dataUrl,...extra}),timeoutMs:60000})
}

export function ImageField({label,value,onChange,toast}){
 const input=useRef(),[busy,setBusy]=useState(false)
 async function pick(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);try{const r=await uploadImage(file);onChange(r.url)}catch(err){toast?.('Upload failed',err.message,'error')}finally{setBusy(false)}}
 return <div className="field full image-field"><span>{label}</span><div className="image-field-row">
  <div className="image-field-preview">{value?<img src={value} alt="" onError={e=>e.currentTarget.style.opacity=.2}/>:<ImageIcon/>}</div>
  <div className="image-field-actions">
   <input ref={input} type="file" accept="image/*" hidden onChange={pick}/>
   <button type="button" className="admin-primary" onClick={()=>input.current.click()} disabled={busy}>{busy?<RefreshCw className="spin"/>:<Upload/>}{busy?'Uploading…':value?'Replace image':'Upload image'}</button>
   {value&&<button type="button" onClick={()=>onChange('')}><X/> Remove</button>}
   <input type="url" placeholder="…or paste an image URL" value={value||''} onChange={e=>onChange(e.target.value)}/>
  </div></div></div>
}

const blank={seasonLabel:'',heroTitle:'',heroSubtitle:'',heroImage:'',logo:'',announcement:'',announcementLink:'',scoreStripEnabled:true,scoreStripText:'',about:'',contactEmail:'',instagram:'',youtube:'',sponsors:[]}

export function SiteMediaAdmin({toast,reload}){
 const [site,setSite]=useState(blank),[media,setMedia]=useState([]),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[drag,setDrag]=useState(false),[toGallery,setToGallery]=useState(true),input=useRef()
 const set=(k,v)=>setSite(s=>({...s,[k]:v}))
 const loadMedia=()=>api('/admin/media').then(setMedia).catch(e=>toast('Could not load media',e.message,'error'))
 useEffect(()=>{api('/site').then(s=>setSite({...blank,...s})).catch(()=>{});loadMedia()},[])
 async function saveSite(e){e.preventDefault();setBusy(true);try{setSite({...blank,...await api('/admin/site',{method:'PUT',body:JSON.stringify(site)})});toast('Site updated','Changes are live on the public website.')}catch(err){toast('Could not save',err.message,'error')}finally{setBusy(false)}}
 async function upload(files){
  const list=[...files].filter(f=>f.type.startsWith('image/'));if(!list.length)return toast('No images','Drop JPEG, PNG, WebP or GIF files.','error')
  setUploading(true);let ok=0
  for(const f of list){try{await uploadImage(f,{addToGallery:toGallery});ok++}catch(err){toast(`Failed: ${f.name}`,err.message,'error')}}
  setUploading(false);if(ok){toast(`${ok} image${ok>1?'s':''} uploaded`,toGallery?'Added to the public gallery.':'Saved to the media library.');loadMedia();if(toGallery)reload?.()}
 }
 async function remove(m){if(!confirm('Delete this image? Pages still using it will show a broken image.'))return;try{await api(`/admin/media/${m._id}`,{method:'DELETE'});setMedia(x=>x.filter(i=>i._id!==m._id));toast('Image deleted')}catch(err){toast('Delete failed',err.message,'error')}}
 const copy=async url=>{try{await navigator.clipboard.writeText(url);toast('Link copied')}catch{toast('Copy failed',url,'error')}}
 const sponsors=site.sponsors||[],setSponsor=(i,k,v)=>set('sponsors',sponsors.map((s,j)=>j===i?{...s,[k]:v}:s))
 return <>
  <div className="admin-title"><div><span className="eyebrow">Content</span><h2>Site &amp; media</h2><p>Upload images and edit homepage text, announcements and sponsors — no code needed.</p></div></div>
  <section className="admin-form-card">
   <div className="form-section-head"><span>01</span><div><h3>Image library</h3><p>Drop photos here. Tick the box to publish them straight to the gallery.</p></div></div>
   <div className={`dropzone ${drag?'drag':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);upload(e.dataTransfer.files)}} onClick={()=>input.current.click()} role="button" tabIndex={0}>
    <input ref={input} type="file" accept="image/*" multiple hidden onChange={e=>{upload(e.target.files);e.target.value=''}}/>
    {uploading?<><RefreshCw className="spin"/><b>Uploading…</b></>:<><Upload/><b>Drop images or click to browse</b><small>Large photos are resized automatically · max 4 MB each</small></>}
   </div>
   <label className="check" style={{margin:'12px 0'}}><input type="checkbox" checked={toGallery} onChange={e=>setToGallery(e.target.checked)}/> Also publish to public gallery</label>
   {media.length===0?<p className="muted">No uploads yet.</p>:<div className="media-grid">{media.map(m=><figure key={m._id}><img src={m.url} alt={m.name} loading="lazy"/><figcaption><span title={m.name}>{m.name}</span><div><button type="button" title="Copy link" onClick={()=>copy(m.url)}><Copy/></button><button type="button" title="Delete" className="danger" onClick={()=>remove(m)}><Trash2/></button></div></figcaption></figure>)}</div>}
  </section>
  <form className="admin-form-card" onSubmit={saveSite}>
   <div className="form-section-head"><span>02</span><div><h3>Homepage &amp; branding</h3><p>Hero text, banner image and the site logo.</p></div></div>
   <div className="editor-grid">
    <label className="field"><span>Season label</span><input value={site.seasonLabel} onChange={e=>set('seasonLabel',e.target.value)}/></label>
    <label className="field"><span>Hero title</span><input value={site.heroTitle} onChange={e=>set('heroTitle',e.target.value)}/></label>
    <label className="field full"><span>Hero subtitle</span><textarea rows="2" value={site.heroSubtitle} onChange={e=>set('heroSubtitle',e.target.value)}/></label>
    <ImageField label="Hero background image" value={site.heroImage} onChange={v=>set('heroImage',v)} toast={toast}/>
    <ImageField label="League logo" value={site.logo} onChange={v=>set('logo',v)} toast={toast}/>
   </div>
   <div className="form-section-head"><span>03</span><div><h3>Announcement &amp; live strip</h3><p>A banner for news, plus the scrolling score strip.</p></div></div>
   <div className="editor-grid">
    <label className="field full"><span>Announcement banner (blank to hide)</span><input value={site.announcement} onChange={e=>set('announcement',e.target.value)} placeholder="Final this Sunday at 4 PM!"/></label>
    <label className="field"><span>Announcement link</span><input type="url" value={site.announcementLink} onChange={e=>set('announcementLink',e.target.value)} placeholder="https://"/></label>
    <label className="field"><span>Score strip text override</span><input value={site.scoreStripText} onChange={e=>set('scoreStripText',e.target.value)} placeholder="Leave blank to use the live match"/></label>
    <label className="check"><input type="checkbox" checked={site.scoreStripEnabled} onChange={e=>set('scoreStripEnabled',e.target.checked)}/> Show live score strip</label>
   </div>
   <div className="form-section-head"><span>04</span><div><h3>About &amp; contact</h3><p>Shown in the footer and about section.</p></div></div>
   <div className="editor-grid">
    <label className="field full"><span>About the league</span><textarea rows="4" value={site.about} onChange={e=>set('about',e.target.value)}/></label>
    <label className="field"><span>Contact email</span><input type="email" value={site.contactEmail} onChange={e=>set('contactEmail',e.target.value)}/></label>
    <label className="field"><span>Instagram URL</span><input type="url" value={site.instagram} onChange={e=>set('instagram',e.target.value)}/></label>
    <label className="field"><span>YouTube URL</span><input type="url" value={site.youtube} onChange={e=>set('youtube',e.target.value)}/></label>
   </div>
   <div className="form-section-head"><span>05</span><div><h3>Sponsors</h3><p>Logos appear on the homepage.</p></div></div>
   {sponsors.map((s,i)=><div className="sponsor-row" key={i}><input placeholder="Sponsor name" value={s.name} onChange={e=>setSponsor(i,'name',e.target.value)}/><input type="url" placeholder="Website (optional)" value={s.url||''} onChange={e=>setSponsor(i,'url',e.target.value)}/><ImageField label="Logo" value={s.logo} onChange={v=>setSponsor(i,'logo',v)} toast={toast}/><button type="button" className="danger" onClick={()=>set('sponsors',sponsors.filter((_,j)=>j!==i))}><Trash2/></button></div>)}
   <button type="button" onClick={()=>set('sponsors',[...sponsors,{name:'',logo:'',url:''}])}><Plus/> Add sponsor</button>
   <div className="modal-actions"><button className="admin-primary" disabled={busy}>{busy?<RefreshCw className="spin"/>:<Check/>}{busy?'Saving…':'Publish changes'}</button></div>
  </form>
 </>
}

// "Test link" button for CricHeroes URL fields.
export function CricHeroesTest({url,kind,toast}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null)
 async function run(){setBusy(true);setResult(null);try{setResult(await api('/admin/cricheroes/test',{method:'POST',body:JSON.stringify({url,kind}),timeoutMs:20000}))}catch(e){setResult({error:e.message})}finally{setBusy(false)}}
 return <div className="field full cric-test"><button type="button" onClick={run} disabled={!url||busy}>{busy?<RefreshCw className="spin"/>:<Link2/>}{busy?'Checking…':'Test CricHeroes link'}</button>
  {result?.error&&<p className="form-error">{result.error}</p>}
  {result&&!result.error&&<p className="muted"><b>{result.title||'Page reachable'}</b><br/>{result.note}{Object.keys(result.stats||{}).length>0&&<><br/>{Object.entries(result.stats).map(([k,v])=>`${k}: ${v}`).join(' · ')}</>}</p>}</div>
}
