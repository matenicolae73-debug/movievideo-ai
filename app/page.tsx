"use client"
import {useState} from "react"

export default function Home(){
 const [prompt,setPrompt]=useState("A cinematic premium energy drink commercial on a futuristic city rooftop at golden hour")
 const [resolution,setResolution]=useState("720p"),[aspect,setAspect]=useState("16:9"),[duration,setDuration]=useState(5)
 const [busy,setBusy]=useState(false),[out,setOut]=useState<any>(null),[err,setErr]=useState("")
 const [email,setEmail]=useState(""),[name,setName]=useState(""),[newKey,setNewKey]=useState<any>(null),[apiKey,setApiKey]=useState(""),[plan,setPlan]=useState("starter")

 async function generate(){
  setBusy(true);setOut(null);setErr("")
  try{
   const r=await fetch("/api/video/generate",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({prompt,resolution,aspectRatio:aspect,duration})})
   const d=await r.json(); if(!r.ok) throw Error(d.error||"Generation failed")
   if(d.videoUrl){setOut({...d,downloadUrl:d.videoUrl,message:"Video generated successfully."});return}
   setOut({...d,message:`AI video job accepted. Request ID: ${d.requestId}. Generating…`})
   for(let attempt=0;attempt<45;attempt++){
    await new Promise(r=>setTimeout(r,4000))
    const sr=await fetch(`/api/video/status?id=${encodeURIComponent(d.requestId)}`,{headers:{Authorization:`Bearer ${apiKey}`}})
    const sd=await sr.json(); if(!sr.ok) throw Error(sd.error||"Unable to read video status")
    if(sd.status==="COMPLETED"&&sd.videoUrl){setOut({...d,...sd,downloadUrl:sd.videoUrl,message:"Video generated successfully."});return}
    if(["FAILED","CANCELLED","ERROR"].includes(sd.status)) throw Error("Video generation failed. Credits were refunded.")
    setOut({...d,...sd,message:`Video status: ${sd.status}`})
   }
   throw Error("Video is still processing. Use the request ID to poll its status.")
  }catch(e:any){setErr(e.message||"Generation failed")}finally{setBusy(false)}
 }

 async function createKey(){setErr("");setNewKey(null);try{const r=await fetch("/api/keys/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,name})});const d=await r.json();if(!r.ok)throw Error(d.error);setNewKey(d);setApiKey(d.key)}catch(e:any){setErr(e.message)}}
 async function buy(){try{const r=await fetch("/api/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,plan,apiKey})});const d=await r.json();if(!r.ok)throw Error(d.error);location.href=d.url}catch(e:any){setErr(e.message)}}

 return <main className="shell">
  <nav><div className="logo">ViralMovie <span>API</span></div><div className="links"><a href="#generate">Generate</a><a href="#keys">API Keys</a><a href="#pricing">Pricing</a></div></nav>
  <section className="hero"><div className="badge">VIRALMOVIE VIDEO API</div><h1>Build your own <span className="grad">video API.</span></h1><p className="sub">Customers get a ViralMovie API key, buy credits and generate real AI videos without ever seeing the underlying provider key.</p></section>
  <section className="grid" id="generate">
   <div className="card"><h2>Generate video</h2><div className="muted">Credits depend on resolution: 360p/540p = 1 credit/sec · 720p = 3 credits/sec · 1080p = 4 credits/sec.</div><label>Prompt</label><textarea value={prompt} onChange={e=>setPrompt(e.target.value)}/><div className="row"><div><label>Resolution</label><select value={resolution} onChange={e=>setResolution(e.target.value)}><option>360p</option><option>540p</option><option>720p</option><option>1080p</option></select></div><div><label>Aspect ratio</label><select value={aspect} onChange={e=>setAspect(e.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option></select></div></div><label>Duration</label><select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value={5}>5 seconds</option><option value={6}>6 seconds</option><option value={7}>7 seconds</option><option value={8}>8 seconds</option></select><button className="btn" disabled={busy||!prompt.trim()||!apiKey} onClick={generate}>{busy?"Generating…":"Generate AI video"}</button>{!apiKey&&<div className="status">Create an API key first.</div>}{err&&<div className="status">Error: {err}</div>}{out&&<div className="status"><b>{out.message}</b>{out.videoUrl&&<><video src={out.videoUrl} controls playsInline style={{width:"100%",borderRadius:12,marginTop:12}}/><a className="btn" style={{display:"inline-block",marginTop:12,textDecoration:"none"}} href={out.downloadUrl} download="viralmovie-video.mp4">Download MP4</a></>}</div>}</div>
   <div className="card" id="keys"><h2>Customer API key</h2><p className="muted">ViralMovie creates the key. The provider key stays server-side.</p><label>Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="My app"/><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email"/><button className="btn" onClick={createKey}>Create API key · FREE</button>{newKey&&<div className="status"><b>Save your API key now</b><div className="code" style={{marginTop:8,wordBreak:"break-all"}}>{newKey.key}</div><p className="muted">10 free credits included.</p></div>}</div>
  </section>
  <section className="grid" id="pricing"><div className="card"><h2>Public API</h2><p className="muted">Authenticate with your ViralMovie key.</p><pre className="code">{`POST /api/video/generate\nAuthorization: Bearer vm_live_xxx\nIdempotency-Key: unique-request-id\nContent-Type: application/json\n\n{\n  "prompt": "cinematic coffee commercial",\n  "duration": 5,\n  "resolution": "720p",\n  "aspectRatio": "16:9"\n}`}</pre></div><div className="card"><h2>Buy API credits</h2><p className="muted">Stripe payments are converted into ViralMovie credits after webhook verification.</p><label>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email"/><select value={plan} onChange={e=>setPlan(e.target.value)}><option value="starter">Starter · 100 credits · €9</option><option value="pro">Pro · 500 credits · €29</option><option value="business">Business · 2,000 credits · €99</option></select><button className="btn" onClick={buy}>Pay with Stripe</button></div></section>
  <section className="card"><h2>Production architecture</h2><div className="kpis"><div className="kpi"><b>Customer key</b><span>vm_live_…</span></div><div className="kpi"><b>Credits</b><span>Credits by resolution</span></div><div className="kpi"><b>Payments</b><span>Stripe → credits</span></div><div className="kpi"><b>AI video</b><span>fal.ai Vidu Q3 Turbo</span></div></div></section>
  <div className="footer">ViralMovie API · production-ready architecture</div>
 </main>
}
