import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, Bookmark, ArrowUpRight, GraduationCap, CalendarDays, Sparkles, Sun, Moon, X, Compass, BookOpen, Settings2, Check, Globe2, Bell, UserRound, ExternalLink, Send, ShieldCheck, FileText, CalendarClock, ClipboardList, Trash2, Plus, AlertTriangle, CircleCheck } from 'lucide-react';
import scholarships from '../data/scholarships.json';
import { flagFor, COUNTRY_NAMES } from './countries.js';
import { VERDICT, eligibilityFor } from './eligibility.js';
import { TRACK_STATUSES, DEFAULT_TRACK_STATUS, DUE_SOON_DAYS, DOCUMENTS, deadlineInfo, trackerSummary, sortTracked, documentChecklist, todayIso, isValidStatus, isOpenStatus, statusLabel } from './tracker.js';
import { useAi } from './useAi.js';
import { formatCost } from './chat.js';
import { readerClause, egressDisclosure, offlineAnswer, ASSESSOR_GUARD } from './assistant.js';
import './styles.css';

// The AI settings view is loaded on demand. It is an optional surface — a reader
// who never opens it should not download the provider registry, the four request
// adapters and the connect panels. The assistant still works without it, because
// its default is the offline guide; a reader can only reach a *connected*
// assistant by having opened this view, which is what loads the chunk.
//
// This is the only lazily-loaded view. The smoke test renders it directly (see
// scripts/render-smoke.mjs) so that moving it off the main bundle does not move
// it out of reach of the one check that catches a view-level runtime error.
const AiSettings = lazy(() => import('./AiSettings.jsx'));
// The document-reading surface is loaded on demand for the same reason: a
// reader who never attaches a transcript should not download it, and the profile
// view is the largest page in the app. The panel keeps the "nothing is uploaded"
// boundary in one auditable file — see src/IngestPanel.jsx.
const IngestPanel = lazy(() => import('./IngestPanel.jsx'));

// Flags are derived from each country's ISO 3166-1 alpha-2 code in
// data/countries.json — see src/countries.js. There is deliberately no
// hand-written per-country table here: a country missing from such a table
// used to render a generic globe with nothing to warn anyone, and adding a
// country to the data is now the only step needed.
// Country-aware eligibility lives in src/eligibility.js so it can be unit-tested.
const stored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
// The three GPA verdicts as a reader reads them. Kept here, not imported from
// compare.js, so that module stays in the lazy document-panel chunk — the
// strings are the only part the dialog needs, and duplicating three words is
// cheaper than putting the comparison engine on the first-load path. The
// authoritative labels live in src/compare.js VERDICT_LABEL; a test asserts the
// two agree.
const GPA_VERDICT_LABEL = { meets: 'Requirement met', fails: 'Requirement not met', unknown: 'Not checkable' };
const fmtDate = (iso) => { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
// `initialView` exists so the render smoke test can mount every view without a
// browser. It defaults to the real entry view, and nothing in the app passes it
// — see scripts/render-smoke.mjs. It is a seam for testing, not a feature.
function App({ initialView = 'discover' }) {
 const [view,setView]=useState(initialView), [query,setQuery]=useState(''), [country,setCountry]=useState('All destinations'), [field,setField]=useState('All fields'), [level,setLevel]=useState('Any degree'), [sort,setSort]=useState('Best match'), [saved,setSaved]=useState(()=>stored('sh-saved',[])), [profile,setProfile]=useState(()=>stored('sh-profile',{field:'Civil Engineering',degree:'Master',nationality:'',gpa:'',countries:[]})), [dark,setDark]=useState(()=>stored('sh-dark',false)), [selected,setSelected]=useState(null), [chat,setChat]=useState(''), [messages,setMessages]=useState([]), [notice,setNotice]=useState('');
 // The AI connection lives in one hook so the settings view and the assistant
 // share it. The key is never held here — see src/useAi.js.
 const ai=useAi();
 // The tracker is a map of catalog id -> {status, addedAt}. The documents list is
 // the set of ids the reader has ticked. Both live in localStorage beside the
 // shortlist and the profile; neither leaves the browser.
 const [tracker,setTracker]=useState(()=>stored('sh-tracker',{})), [docs,setDocs]=useState(()=>stored('sh-docs',[]));
 const searchRef=useRef(null), dialogRef=useRef(null), lastFocused=useRef(null);
 const [onlyEligible,setOnlyEligible]=useState(false);
 const isMac=typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);
 // Cmd/Ctrl+K focuses the search field. The hint was rendered long before anything
 // listened for it, so the shortcut was decorative; this makes it true.
 useEffect(()=>{const onKey=(e)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setView('discover');requestAnimationFrame(()=>searchRef.current?.focus())}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey)},[]);
 // Detail dialog: move focus in on open, trap Tab, close on Escape, restore focus on close.
 useEffect(()=>{if(!selected)return;lastFocused.current=document.activeElement;const el=dialogRef.current;
  const focusables=()=>[...(el?el.querySelectorAll('button,a[href],input,select,[tabindex]:not([tabindex="-1"])'):[])].filter(x=>!x.disabled&&x.getClientRects().length);
  const first=focusables()[0];if(first)first.focus();else el&&el.focus();
  const onKey=(e)=>{if(e.key==='Escape'){e.preventDefault();setSelected(null);return}
   if(e.key!=='Tab')return;const items=focusables();if(items.length<2)return;
   const f=items[0],l=items[items.length-1];
   if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus()}
   else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus()}};
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('keydown',onKey);if(lastFocused.current&&document.contains(lastFocused.current))lastFocused.current.focus()}},[selected]);
 const countries=['All destinations',...new Set(scholarships.map(s=>s.country))];
 const fields=[...new Set(scholarships.flatMap(s=>s.program_field))].sort();
 // Canonical enum — keep in sync with VALID_DEGREE_LEVELS in scripts/validate-catalog.mjs.
 const DEGREE_LEVELS=['Bachelor','Master','PhD','PostDoc','Non-degree'];
 // The filter offers only levels the catalog can actually return; a profile goal may exceed it.
 const levels=DEGREE_LEVELS.filter(x=>scholarships.some(s=>s.degree_level.includes(x)));
 const elig=useMemo(()=>Object.fromEntries(scholarships.map(s=>[s.id,eligibilityFor(s.nationality_scope,profile.nationality)])),[profile.nationality]);
 const filtered=useMemo(()=>scholarships.filter(s=>{
   const hay=`${s.name} ${s.provider} ${s.country} ${s.university} ${s.description}`.toLowerCase();
   return (!query||hay.includes(query.toLowerCase()))&&(country==='All destinations'||s.country===country)&&(field==='All fields'||s.program_field.includes(field))&&(level==='Any degree'||s.degree_level.includes(level))&&(!onlyEligible||elig[s.id].verdict==='open');
 }).sort((a,b)=>{
   if(sort==='A–Z')return a.name.localeCompare(b.name);
   if(sort==='Country')return a.country.localeCompare(b.country)||a.name.localeCompare(b.name);
   return (Number(saved.includes(b.id))-Number(saved.includes(a.id)))||a.name.localeCompare(b.name);
 }),[query,country,field,level,sort,saved,onlyEligible,elig]);
 const updateSaved=(id)=>{const next=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id];setSaved(next);localStorage.setItem('sh-saved',JSON.stringify(next));setNotice(next.includes(id)?'Added to your saved scholarships':'Removed from saved scholarships');setTimeout(()=>setNotice(''),2400)};
 const saveProfile=()=>{localStorage.setItem('sh-profile',JSON.stringify(profile));setNotice('Your profile is saved on this device');setTimeout(()=>setNotice(''),2400)};
 // --- tracker and documents -------------------------------------------------
 // Every change is persisted, never left behind a Save button: a toggle that
 // still needed saving is a toggle a reader forgets to save. Persisting happens
 // in the effects below rather than inside the handlers, and the handlers use
 // the functional form of setState — two updates in the same tick (a double
 // click, or "track all") would otherwise both build from the same stale value
 // and silently drop one.
 const persist=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
 const flash=(text)=>{setNotice(text);setTimeout(()=>setNotice(''),2400)};
 useEffect(()=>{persist('sh-tracker',tracker)},[tracker]);
 useEffect(()=>{persist('sh-docs',docs)},[docs]);
 const toggleTrack=(record)=>{const removing=!!tracker[record.id];setTracker(prev=>{const next={...prev};if(removing)delete next[record.id];else next[record.id]={status:DEFAULT_TRACK_STATUS,addedAt:todayIso()};return next});flash(removing?'Removed from your tracker':'Now tracking '+record.name)};
 const trackAll=(records)=>{setTracker(prev=>{const next={...prev};records.forEach(r=>{if(!next[r.id])next[r.id]={status:DEFAULT_TRACK_STATUS,addedAt:todayIso()}});return next});flash('Tracking '+records.length+(records.length===1?' opportunity':' opportunities'))};
 const setTrackStatus=(id,status)=>{setTracker(prev=>({...prev,[id]:{status,addedAt:(prev[id]&&prev[id].addedAt)||todayIso()}}))};
 const toggleDoc=(id)=>{setDocs(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])};
 // --- reading the reader's documents ----------------------------------------
 // Design: docs/DOCUMENT-INGESTION.md §4–§6. Everything here is local: the file
 // is read with File.arrayBuffer, parsed in this tab, and never sent anywhere.
 // There is deliberately no upload path, because there is no server to upload
 // to (AGENTS.md, scope discipline).
 //
 // The extracted proposals are **transient React state, never persisted**. They
 // are a reading of a document that could be re-read at any time, so storing
 // them would put a stale transcript summary in localStorage for no gain. What
 // persists is the *confirmed* value, in `sh-profile` alongside the hand-typed
 // fields — the reader's confirmation, not ScholarHub's guess.
 // A confirmed GPA plus the text it was read from, or null. `sh-profile.gpa`
 // stays the reader's hand-typed string for display; the structured value is
 // what a comparison needs, and the two are kept from drifting by writing both
 // when a proposal is confirmed.
 const confirmedGpa=profile.gpaValue&&typeof profile.gpaValue.value==='number'?profile.gpaValue:null;
 // The comparison itself is computed inside the lazily-loaded document panel,
 // which is where `compare.js` travels. `App` holds only the answer, so the
 // detail dialog can show a per-record sentence without putting the comparison
 // module (and its patterns) on the first-load path.
 const [gpaComparison,setGpaComparison]=useState(null);
 const onComparison=useCallback((next)=>setGpaComparison((prev)=>prev===next?prev:next),[]);
 // Confirming a proposal is the only thing that puts a value into the profile.
 // An unconfirmed proposal is never used in a comparison — that rule is what
 // stops a mis-read transcript becoming a confident wrong answer about
 // eligibility. The panel calls back with the proposal and its source file.
 const confirmProposal=(proposal,from)=>{
   setProfile(prev=>{
     const next={...prev};
     if(proposal.field==='gpa'){
       next.gpaValue={value:proposal.value,scale:proposal.scale,from};
       next.gpa=proposal.scale!=null?`${proposal.value} / ${proposal.scale}`:String(proposal.value);
     }else if(proposal.field==='english'){
       next.languageValue={instrument:proposal.instrument,value:proposal.value,subs:proposal.subs||[],from};
       next.language=proposal.label;
     }else if(proposal.field==='classification'){
       next.classification={value:proposal.value,label:proposal.label,from};
     }
     // Written through immediately, not behind the Save button. Confirming a
     // value is a deliberate act and the whole point of it is that the reader
     // can then close the tab — a confirmation lost to a reload would be a bug
     // the reader could not distinguish from the app ignoring them.
     persist('sh-profile',next);
     return next;
   });
   flash('Saved to your profile — you can edit it above');
 };
 // Discarding a confirmed value is the same rule in reverse: the reader is the
 // one who decides what the profile holds, so a value read off a document must
 // be removable without needing to re-open the document.
 const clearConfirmed=(field)=>{
   setProfile(prev=>{
     const next={...prev};
     if(field==='gpa'){delete next.gpaValue;next.gpa=''}
     else if(field==='english'){delete next.languageValue;next.language=''}
     else if(field==='classification'){delete next.classification}
     persist('sh-profile',next);
     return next;
   });
   flash('Removed from your profile');
 };
 // Recomputed per render so a tab left open overnight shows the new day.
 const TODAY=todayIso();
 const tracked=useMemo(()=>sortTracked(scholarships.filter(s=>tracker[s.id]).map(s=>({record:s,status:tracker[s.id].status})),TODAY),[tracker,TODAY]);
 const trackSummary=useMemo(()=>trackerSummary(tracked,TODAY),[tracked,TODAY]);
 const docState=useMemo(()=>documentChecklist(docs,profile.degree),[docs,profile.degree]);
 const untrackedSaved=scholarships.filter(s=>saved.includes(s.id)&&!tracker[s.id]);
 // What the alert badge and the banner are built from: still-open applications
 // whose date is near or gone, plus documents the reader has not ticked.
 const dueSoonList=tracked.filter(({record,status})=>isOpenStatus(status)&&['overdue','today','urgent','soon'].includes(deadlineInfo(record,TODAY).level));
 const pastDue=dueSoonList.filter(({record})=>deadlineInfo(record,TODAY).level==='overdue');
 const imminent=dueSoonList.filter(({record})=>deadlineInfo(record,TODAY).level!=='overdue');
 // Document alerts only start counting once the reader has engaged — by ticking
 // something or by tracking an application. Counting all ten unticked items from
 // a standing start would put a "10" badge on a brand-new visit, and an alert
 // that is always on is one nobody reads. The profile page still states the full
 // list; this is only about when the app interrupts.
 const docAlerts=(docs.length>0||tracked.length>0)?docState.missing.length:0;
 const alertCount=dueSoonList.length+docAlerts;
 const go=(next)=>{setView(next);setSelected(null)};
 const matching=(s)=>{let score=55;if(profile.field&&s.program_field.includes(profile.field))score+=20;if(profile.degree&&s.degree_level.includes(profile.degree))score+=15;const e=elig[s.id]||eligibilityFor(s.nationality_scope,profile.nationality);if(e.verdict==='open')score+=10;if(e.verdict==='closed')score-=25;return Math.max(5,Math.min(96,score))};
 // The assistant. It answers from the offline guide by default, and from the
 // reader's own model once one is connected AND has been proven to answer.
 //
 // Three things it will not do, two from AGENTS.md and one added in v0.31.0: it
 // never presents model output as scholarship fact, it never lets the model
 // invent a deadline, an amount or an eligibility rule, and — since the profile
 // was being attached to every request — it never sends the reader's profile
 // with a question that is not about them. See `src/assistant.js` for the gate,
 // the assessor guard and the disclosure.
 const answer=async(text)=>{
  const q=text||chat;if(!q.trim())return;
  const pool=scholarships.filter(s=>(!profile.field||s.program_field.includes(profile.field))&&(!profile.degree||s.degree_level.includes(profile.degree)));
  const open=pool.filter(s=>elig[s.id]&&elig[s.id].verdict==='open');
  const closed=pool.filter(s=>elig[s.id]&&elig[s.id].verdict==='closed');
  const picks=(open.length?open:pool).slice(0,3);
  // The offline reply is composed in src/assistant.js so it can be unit-tested —
  // it is the default answer, so it is the one most readers actually see.
  const response=offlineAnswer({picks,open,closed,profile});
  setMessages(m=>[...m,{from:'you',text:q}]);setChat('');
  if(!ai.connected){setMessages(m=>[...m,{from:'assistant',text:response}]);return}
  // A streaming reply arrives token by token, so the message is placed empty and
  // filled as deltas land. The placeholder is tagged so a delta can find it
  // without assuming it is last.
  setMessages(m=>[...m,{from:'assistant',text:'',model:true,streaming:true}]);
  const rows=picks.map(s=>'- '+s.name+' | '+s.country+' | '+s.degree_level.join('/')+' | deadline: '+(s.deadline||'no single closing date recorded')+' | funding: '+s.funding_type+' | nationality rule: '+s.eligibility.nationality.join('; ')).join('\n');
  // What leaves the browser is decided by the question, not by whether AI is on.
  // `readerClause` returns null for anything that is not a question about the
  // reader, and the clause is filtered out rather than interpolated — see
  // src/assistant.js for why null beats an empty string here.
  const reader=readerClause(q,profile);
  const system=[
   'You are a scholarship-search assistant inside ScholarHub, a static catalog of '+scholarships.length+' engineering scholarships. You are talking to one reader.',
   reader,
   'Catalog rows relevant to them, exactly as recorded:',
   rows,
   ASSESSOR_GUARD,
   'Rules you must follow: do not invent a deadline, an award amount, a funding term or an eligibility rule that is not in the rows above. If the catalog does not record something, say that it does not and point the reader at the official page. You are not an eligibility decision. Be concrete, and keep the answer under 150 words.',
  ].filter(Boolean).join('\n');
  // Disclosed before the call, not after: the reader is told what was attached
  // and why, and the note survives on the reply so it is visible in the transcript.
  const disclosure=egressDisclosure(q,profile);
  let accumulated='';
  const onDelta=(delta)=>{accumulated+=delta;setMessages(m=>{const next=[...m];const at=next.findIndex(x=>x.streaming);if(at>=0)next[at]={...next[at],text:accumulated};return next})};
  const result=await ai.chatStream([{role:'system',content:system},{role:'user',content:q}],{onDelta});
  const ok=!!(result&&result.text);
  const reply=ok?result.text:('The provider did not answer. '+((result&&result.error)||'No further detail was given.'));
  // What actually happened, stated rather than implied: which model answered,
  // whether a fallback was used, and what the call is estimated to have cost.
  const notes=[];
  if(ok)notes.push('from '+(result.model||ai.provider.label));
  if(result&&result.fellBackFrom)notes.push('fell back from '+result.fellBackFrom);
  if(result&&result.streamFallback)notes.push('no streaming — '+result.streamFallback);
  if(ok&&result.cost)notes.push('\u2248'+formatCost(result.cost.total)+(result.cost.partial?' (input or output only)':''));
  if(ok&&!result.cost)notes.push(result.usage?'no published price for this model, so the cost is unknown':'the provider reported no token usage');
  // What was attached to the request, said in the transcript rather than assumed.
  notes.push(disclosure.included?'profile sent: '+disclosure.fields.join(', '):'no profile sent');
  setMessages(m=>[...m.filter(x=>!x.streaming),{from:'assistant',text:reply,model:ok,notes:notes.join(' \u00b7 ')}]);
 };
 const nav=[['discover','Discover',Compass],['saved','My shortlist',Bookmark],['tracker','Application tracker',ClipboardList],['profile','My profile',UserRound],['assistant','AI assistant',Sparkles],['settings','AI settings',Settings2]];
 return <div className={dark?'app dark':'app'}>
  <aside className="sidebar"><div className="brand"><span className="brand-mark"><GraduationCap size={21}/></span><span>scholar<span className="brand-accent">hub</span></span></div><div className="workspace-label">YOUR WORKSPACE</div><nav>{nav.map(([key,label,Icon])=><button key={key} className={`nav-item ${view===key?'active':''}`} onClick={()=>go(key)} title={key==='tracker'&&alertCount>0?`${label} — ${alertCount} item${alertCount===1?'':'s'} need attention`:label} aria-current={view===key?'page':undefined}><Icon size={18}/>{label}{key==='saved'&&saved.length>0&&<span className="nav-count">{saved.length}</span>}{key==='tracker'&&alertCount>0&&<span className="nav-count alert">{alertCount}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><BookOpen size={17}/></div><div><strong>New to scholarships?</strong><p>Our guide makes it simple.</p><button onClick={()=>setView('assistant')}>Explore the guide <ArrowUpRight size={13}/></button></div></div><button className="theme-toggle" onClick={()=>{const next=!dark;setDark(next);localStorage.setItem('sh-dark',JSON.stringify(next))}}>{dark?<Sun size={17}/>:<Moon size={17}/>}<span>{dark?'Light':'Dark'} appearance</span><span className="toggle-pill"><i/></span></button><div className="privacy"><ShieldCheck size={15}/> Your data stays on this device</div></div></aside>
  <main className="main"><header className="topbar"><div className="breadcrumbs">ScholarHub <span>/</span> <b>{nav.find(n=>n[0]===view)?.[1]||'Details'}</b></div><div className="top-actions"><span className="open-label"><i/> Open access · No account needed</span><button className="icon-btn bell-btn" aria-label={alertCount>0?`Notifications — ${alertCount} item${alertCount===1?'':'s'} need attention`:'Notifications — nothing needs attention'} onClick={()=>go('tracker')}><Bell size={18}/>{alertCount>0&&<span className="bell-dot">{alertCount}</span>}</button><div className="avatar">S</div></div></header>
  {view==='discover'&&<><section className="welcome"><div className="eyebrow"><Sparkles size={14}/> YOUR NEXT CHAPTER STARTS HERE</div><h1>Find funding for<br/><em>what moves you.</em></h1><p className="hero-copy">A calmer way to discover scholarships for engineering students around the world.</p><div className="hero-stats"><div><strong>{scholarships.length}</strong><span>curated opportunities</span></div><div className="stat-divider"/><div><strong>{countries.length-1}</strong><span>destinations to explore</span></div><div className="stat-divider"/><div><strong>Free</strong><span>always, no sign-up</span></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-sun"/><div className="art-cap"><GraduationCap size={80} strokeWidth={1}/></div><div className="art-leaf leaf-one"/><div className="art-leaf leaf-two"/><span className="sparkle s1">✳</span><span className="sparkle s2">✦</span></div></section>
  <section className="discovery"><div className="section-heading"><div><div className="eyebrow muted">THE OPPORTUNITY BOARD</div><h2>Scholarships worth a look</h2><p>Hand-picked places to start your search. Always confirm details with the provider.</p></div><button className="outline-btn" onClick={()=>go('profile')}><SlidersHorizontal size={15}/> Personalize results</button></div>
   <div className="filterbar"><label className="searchbox"><Search size={17}/><input ref={searchRef} aria-label="Search scholarships" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try a university, country, or keyword…"/><kbd aria-hidden="true">{isMac?'⌘ K':'Ctrl K'}</kbd></label><select value={country} onChange={e=>setCountry(e.target.value)} aria-label="Filter by destination">{countries.map(c=><option key={c}>{c}</option>)}</select><select value={field} onChange={e=>setField(e.target.value)} aria-label="Filter by field"><option>All fields</option>{fields.map(f=><option key={f}>{f}</option>)}</select><select value={level} onChange={e=>setLevel(e.target.value)} aria-label="Filter by degree"><option>Any degree</option>{levels.map(x=><option key={x}>{x}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort scholarships"><option>Best match</option><option>A–Z</option><option>Country</option></select><label className="elig-filter" title={profile.nationality?'Show only opportunities open to applicants from '+profile.nationality:'Set your country of origin in My profile to filter by eligibility'}><input type="checkbox" checked={onlyEligible} disabled={!profile.nationality} onChange={e=>setOnlyEligible(e.target.checked)}/><span>Open to my country</span></label></div>
   <div className="results-meta"><span aria-live="polite"><b>{filtered.length}</b> opportunities to explore</span><span><span className="live-dot" aria-hidden="true"/> Details change — verify at the official source</span></div>
   <div className="scholarship-grid">{filtered.map((s,i)=><article className="scholarship-card" key={s.id}><div className="card-top"><div className={`card-icon icon-${i%5}`} aria-hidden="true">{s.country==='Europe'?<Globe2 size={20}/>:<span>{flagFor(s.country)||'🌐'}</span>}</div><button className={`save-btn ${saved.includes(s.id)?'saved':''}`} aria-label={saved.includes(s.id)?'Remove from saved':'Save scholarship'} onClick={()=>updateSaved(s.id)}><Bookmark size={17} fill={saved.includes(s.id)?'currentColor':'none'}/></button></div><div className="card-country">{s.country.toUpperCase()} <span>·</span> {s.provider}</div><h3>{s.name}</h3><div className="university"><GraduationCap size={14}/>{s.university}</div><p className="card-description">{s.description}</p><div className="chip-row">{s.degree_level.map(d=><span className="chip" key={d}>{d}</span>)}<span className="chip field-chip">{s.program_field[0]}</span>{s.deadline&&<span className="chip deadline-chip"><CalendarDays size={11}/>{fmtDate(s.deadline)}</span>}{!s.deadline&&s.deadline_notes&&<span className="chip deadline-chip notes"><CalendarDays size={11}/>Dates in detail</span>}<span className={`status-badge status-${s.status}`}>{s.status==='verify'?'Verify cycle':s.status}</span><span className={`elig-badge elig-${elig[s.id].verdict}`} title={elig[s.id].reason}>{VERDICT[elig[s.id].verdict]}</span></div><div className="card-footer"><div className="match"><span className="match-ring">{matching(s)}%</span><span>profile fit*</span></div><div className="card-actions"><button className={`track-btn ${tracker[s.id]?'tracking':''}`} aria-pressed={!!tracker[s.id]} title={tracker[s.id]?'Stop tracking this deadline':'Track this deadline in your application tracker'} onClick={()=>toggleTrack(s)}><CalendarClock size={14}/>{tracker[s.id]?'Tracking':'Track'}</button><button className="details-link" onClick={()=>setSelected(s)}>View details <ArrowUpRight size={15}/></button></div></div></article>)}</div>
   {filtered.length===0&&<div className="empty-state"><Search size={30}/><h3>No matches just yet</h3><p>Try another keyword or clear a filter.</p><button className="outline-btn" onClick={()=>{setQuery('');setCountry('All destinations');setField('All fields');setLevel('Any degree')}}>Clear filters</button></div>}
   <p className="disclaimer">* Profile fit is a simple local heuristic, not an eligibility assessment. Dates and award values are shown only where a contributor recorded a verified source; confirm every detail with the official provider.</p>
  </section></>}
  {view==='saved'&&<section className="page-section"><div className="eyebrow muted">YOUR PERSONAL SHORTLIST</div><h1 className="page-title">Saved <em>for later.</em></h1><p className="page-lede">Keep the opportunities you’re considering in one quiet corner — then move the ones you’re serious about into your application tracker.</p>{scholarships.filter(s=>saved.includes(s.id)).length===0?<div className="empty-state"><Bookmark size={30}/><h3>Your shortlist is waiting</h3><p>Save a scholarship while exploring to see it here.</p><button className="primary-btn" onClick={()=>go('discover')}>Explore scholarships <ArrowUpRight size={15}/></button></div>:<><div className="scholarship-grid">{scholarships.filter(s=>saved.includes(s.id)).map(s=><article className="scholarship-card compact" key={s.id}><div className="card-top"><div className="card-icon">{flagFor(s.country)||'🌐'}</div><button className="save-btn saved" onClick={()=>updateSaved(s.id)} aria-label="Remove saved"><Bookmark size={17} fill="currentColor"/></button></div><div className="card-country">{s.country.toUpperCase()}</div><h3>{s.name}</h3><p className="card-description">{s.description}</p><div className="chip-row"><span className={'chip countdown countdown-'+deadlineInfo(s,TODAY).level}><CalendarClock size={11}/>{deadlineInfo(s,TODAY).label}</span></div><div className="card-actions"><button className={'track-btn '+(tracker[s.id]?'tracking':'')} aria-pressed={!!tracker[s.id]} onClick={()=>toggleTrack(s)}><CalendarClock size={14}/>{tracker[s.id]?'Tracking':'Track'}</button><button className="details-link" onClick={()=>setSelected(s)}>View details <ArrowUpRight size={15}/></button></div></article>)}</div><div className="shortlist-foot">{untrackedSaved.length>0?<><span>{untrackedSaved.length} saved {untrackedSaved.length===1?'opportunity is':'opportunities are'} not tracked yet.</span><button className="outline-btn" onClick={()=>trackAll(untrackedSaved)}><Plus size={14}/> Track all of them</button></>:<span>Everything on your shortlist is already in the tracker.</span>}<button className="outline-btn" onClick={()=>go('tracker')}><ClipboardList size={14}/> Open application tracker</button></div></>}</section>}
  {view==='tracker'&&<section className="page-section"><div className="eyebrow muted">YOUR APPLICATION PLAN</div><h1 className="page-title">Every deadline, <em>in one place.</em></h1><p className="page-lede">Track the programmes you have decided to go for. Dates are read from each record's official source — a programme with no single closing date says so rather than showing a guess.</p>
   {alertCount>0&&<div className="alert-banner" role="status"><AlertTriangle size={19}/><div><strong>{alertCount===1?'One thing needs your attention':alertCount+' things need your attention'}</strong><ul>{pastDue.length>0&&<li><b>{pastDue.length}</b> tracked {pastDue.length===1?'deadline has':'deadlines have'} passed — {pastDue.map(x=>x.record.name).join(', ')}. Check whether the next cycle is open.</li>}{imminent.length>0&&<li><b>{imminent.length}</b> due within {DUE_SOON_DAYS} days — {imminent.map(x=>x.record.name+' ('+deadlineInfo(x.record,TODAY).label.toLowerCase()+')').join(', ')}.</li>}{docAlerts>0&&<li><b>{docAlerts}</b> of {docState.total} documents for your {profile.degree||'chosen'} goal are not marked ready — {docState.missing.map(d=>d.label).join(', ')}. <button className="link-btn" onClick={()=>go('profile')}>Open the checklist</button></li>}</ul></div></div>}
   {tracked.length===0?<div className="empty-state tracker-empty"><ClipboardList size={30}/><h3>Nothing tracked yet</h3><p>Track a scholarship from the board or your shortlist, and its deadline will appear here with a live countdown.</p><div className="empty-actions"><button className="primary-btn" onClick={()=>go('discover')}>Explore scholarships <ArrowUpRight size={15}/></button>{untrackedSaved.length>0&&<button className="outline-btn" onClick={()=>trackAll(untrackedSaved)}><Plus size={14}/> Track my {untrackedSaved.length} saved</button>}</div></div>:<>
    <div className="summary-strip"><div className="summary-item"><strong>{trackSummary.total}</strong><span>tracked</span></div><div className={`summary-item ${dueSoonList.length>0?'warn':''}`}><strong>{dueSoonList.length}</strong><span>need action now</span></div><div className={`summary-item ${trackSummary.passed>0?'danger':''}`}><strong>{trackSummary.passed}</strong><span>{trackSummary.passed===1?'deadline passed':'deadlines passed'}</span></div><div className="summary-item"><strong>{trackSummary.noDate}</strong><span>no published date</span></div><div className="summary-item ok"><strong>{trackSummary.settled}</strong><span>submitted or decided</span></div></div>
    <div className="status-breakdown">{TRACK_STATUSES.filter(t=>trackSummary.byStatus[t.id]>0).map(t=><span className={`status-pill pill-${t.id}`} key={t.id}>{statusLabel(t.id)} <b>{trackSummary.byStatus[t.id]}</b></span>)}</div>
    <div className="tracker-list">{tracked.map(({record,status})=>{const info=deadlineInfo(record,TODAY);return <article className={`track-row level-${info.level}`} key={record.id}><div className="track-flag" aria-hidden="true">{flagFor(record.country)||'🌐'}</div><div className="track-main"><div className="track-head"><h3>{record.name}</h3><span className={`track-chip countdown-${info.level}`}><CalendarDays size={12}/>{info.hasDate?fmtDate(record.deadline)+' · '+info.label:info.label}</span></div><div className="track-meta"><span>{record.country}</span><span>{record.provider}</span><span>{record.degree_level.join(' · ')}</span></div>{!info.hasDate&&<p className="track-note"><em>{record.deadline_notes||'No date published — check the official source.'}</em></p>}{docState.missing.length>0&&<p className={`track-docs ${docState.complete?'ready':''}`}><FileText size={13}/>{docState.missing.length} of {docState.total} documents not ready</p>}</div><div className="track-controls"><select className={`track-status select-${isValidStatus(status)?status:DEFAULT_TRACK_STATUS}`} value={isValidStatus(status)?status:DEFAULT_TRACK_STATUS} onChange={e=>setTrackStatus(record.id,e.target.value)} aria-label={'Application status for '+record.name}>{TRACK_STATUSES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select><div className="track-buttons"><button className="icon-btn" title="View details" aria-label={'View details for '+record.name} onClick={()=>setSelected(record)}><ArrowUpRight size={16}/></button><button className="icon-btn danger" title="Stop tracking this" aria-label={'Stop tracking '+record.name} onClick={()=>toggleTrack(record)}><Trash2 size={16}/></button></div></div></article>})}</div>
    {untrackedSaved.length>0&&<div className="shortlist-foot"><span>On your shortlist, not tracked yet:</span>{untrackedSaved.map(s=><button key={s.id} className="chip-add" onClick={()=>toggleTrack(s)}><Plus size={12}/>{s.name}</button>)}</div>}
   </>}
   <p className="disclaimer">Countdowns are computed in your browser from the dates recorded in the catalog and the day each source was last checked. They are a planning aid, not a notification service — no reminder leaves this device, and you should confirm every closing date with the provider.</p>
  </section>}
  {view==='profile'&&<section className="page-section"><div className="eyebrow muted">A LITTLE ABOUT YOU</div><h1 className="page-title">Make it <em>personal.</em></h1><p className="page-lede">A few details help us bring relevant opportunities closer. Everything stays in this browser.</p><div className="form-card"><div className="form-heading"><div className="form-icon"><UserRound size={19}/></div><div><h3>Your study goals</h3><p>Update anytime. Nothing is sent to a server.</p></div></div><div className="form-grid"><label>Field of interest<select value={profile.field||fields[0]} onChange={e=>setProfile({...profile,field:e.target.value})}>{fields.map(f=><option key={f}>{f}</option>)}</select></label><label>Degree you're aiming for<select value={profile.degree||'Master'} onChange={e=>setProfile({...profile,degree:e.target.value})}>{DEGREE_LEVELS.map(x=><option key={x}>{x}</option>)}</select></label><label>Country of origin<input list="country-options" value={profile.nationality||''} onChange={e=>setProfile({...profile,nationality:e.target.value})} placeholder="Start typing, e.g. Nepal"/><datalist id="country-options">{COUNTRY_NAMES.map(c=><option key={c} value={c}/>)}</datalist></label><label>Current GPA (optional)<input value={profile.gpa||''} onChange={e=>setProfile({...profile,gpa:e.target.value})} placeholder="e.g. 3.7 / 4.0"/></label><label>Preferred destination<input value={profile.preferred||''} onChange={e=>setProfile({...profile,preferred:e.target.value})} placeholder="e.g. Germany, Australia"/></label><label>Language test scores<input value={profile.language||''} onChange={e=>setProfile({...profile,language:e.target.value})} placeholder="IELTS, TOEFL, etc."/></label></div>
<div className="privacy-note"><ShieldCheck size={17}/><span><strong>Private by design.</strong> Your profile is saved in local storage on this device. Clearing browser data removes it.</span></div><button className="primary-btn" onClick={saveProfile}><Check size={16}/> Save my profile</button></div>
  <Suspense fallback={<div className="form-card ingest-card"><div className="ingest-status">Loading the document reader…</div></div>}>
   <IngestPanel
    onConfirm={confirmProposal}
    currentGpa={profile.gpaValue}
    currentLanguage={profile.languageValue}
    currentClassification={profile.classification}
    onClear={clearConfirmed}
    records={scholarships}
    onComparison={onComparison}
   />
  </Suspense>
  <div className="form-card docs-card"><div className="form-heading"><div className="form-icon"><FileText size={19}/></div><div><h3>Application documents</h3><p>Tell ScholarHub what you already have, and it will flag what is still missing.</p></div></div>
   <div className="docs-progress"><div className="progress-track" role="img" aria-label={docState.presentCount+' of '+docState.total+' documents ready'}><i style={{width:(docState.total?Math.round(docState.presentCount/docState.total*100):0)+'%'}}/></div><span><b>{docState.presentCount}</b> of {docState.total} ready for your {profile.degree||'chosen'} goal</span></div>
   {docState.complete?<div className="docs-alert ready"><CircleCheck size={17}/><span><strong>Nothing missing.</strong> Every document this checklist expects for a {profile.degree||'your'} application is marked ready. Requirements differ between programmes — confirm against each provider.</span></div>:<div className="docs-alert missing" role="status"><AlertTriangle size={17}/><span><strong>Not present ({docState.missing.length}):</strong> {docState.missing.map(d=>d.label).join(', ')}.</span></div>}
   <div className="docs-grid">{DOCUMENTS.map(d=>{const required=docState.required.some(x=>x.id===d.id);const present=docs.includes(d.id);
     // An item the reader's goal does not require is never styled as "missing":
     // an amber "you are missing this" on a research proposal, shown to a
     // Master's applicant, is exactly the false alarm that trains someone to
     // ignore the real ones.
     const state=present?'ready':(required?'missing':'optional');
     return <label className={`doc-item ${state}`} key={d.id}><input type="checkbox" checked={present} onChange={()=>toggleDoc(d.id)}/><span className="doc-text"><b>{d.label}</b><em>{d.hint}</em></span>{!required&&<span className="doc-tag">{d.levels.join(' / ')} only</span>}</label>})}</div>
   <div className="privacy-note"><ShieldCheck size={17}/><span><strong>A checklist, not a requirement list.</strong> No scheme's exact document set is knowable from this catalog, so these are the items applicants are ordinarily asked for. Your ticks are stored on this device and are never sent anywhere.</span></div>
  </div></section>}
  {view==='assistant'&&<section className="page-section assistant-page"><div className="eyebrow muted"><Sparkles size={13}/> YOUR THOUGHTFUL SCHOLARSHIP COMPANION</div><h1 className="page-title">A little help, <em>on your terms.</em></h1><p className="page-lede">Get started with a local guide—or connect an AI model you trust in settings.</p><div className="chat-card"><div className="chat-top"><div className="assistant-orb"><Sparkles size={19}/></div><div><b>Scholarship guide</b><span><i/> {ai.connected?ai.provider.label+' · '+((ai.availableModels.find(m=>m.id===ai.ai.model)||{}).label||ai.ai.model):'Offline · No model connected'}</span></div><button className="icon-btn" aria-label="Open AI settings" onClick={()=>go('settings')}><Settings2 size={18}/></button></div><div className="chat-body" role="log" aria-live="polite" aria-label="Conversation">{messages.length===0?<div className="chat-welcome"><div className="welcome-spark">✦</div><h3>Where would you like to begin?</h3><p>I can help you think through your search. For current eligibility and calls, official program pages are always the source of truth.</p><div className="suggestions">{['What should I check before applying?','Help me plan a scholarship search','Which opportunities fit my study goals?'].map(x=><button key={x} onClick={()=>answer(x)}>{x}<ArrowUpRight size={14}/></button>)}</div></div>:messages.map((m,i)=><div className={`chat-message ${m.from}`} key={i}><div className="message-avatar">{m.from==='you'?'S':<Sparkles size={14}/>}</div><div>{m.text}{m.streaming&&!m.text&&<span className="msg-typing" aria-hidden="true"><i/><i/><i/></span>}{m.notes&&<em className="msg-source">{m.notes} — a model answer, not catalog data</em>}</div></div>)}</div><form className="chat-input" onSubmit={e=>{e.preventDefault();answer()}}><input value={chat} onChange={e=>setChat(e.target.value)} placeholder="Ask a question or explore an idea…" aria-label="Ask the scholarship assistant"/><button aria-label="Send question"><Send size={17}/></button></form><p className="chat-disclaimer">AI suggestions are informational, can be incomplete, and aren't a substitute for official scholarship requirements.</p></div></section>}
  {view==='settings'&&<section className="page-section"><Suspense fallback={<div className="ai-loading" role="status">Loading AI settings…</div>}><AiSettings ai={ai} profile={profile}/></Suspense></section>}
  {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section ref={dialogRef} tabIndex={-1} className="detail-modal" role="dialog" aria-modal="true" aria-label={selected.name} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelected(null)} aria-label="Close details"><X size={20}/></button><div className="eyebrow muted">{flagFor(selected.country)||'🌐'} &nbsp;{selected.country.toUpperCase()}</div><h2>{selected.name}</h2><p className="detail-provider">{selected.provider} · {selected.university}</p><p className="detail-desc">{selected.description}</p><div className="detail-grid"><div><span>Degree levels</span><b>{selected.degree_level.join(', ')}</b></div><div><span>Funding</span><b>{selected.funding_type}</b></div><div><span>Deadline</span><b>{selected.deadline?fmtDate(selected.deadline):(selected.deadline_notes?'No single date — see the note below':'Not maintained — check official source')}</b>{selected.deadline&&<em className={'deadline-note countdown-text countdown-'+deadlineInfo(selected,TODAY).level}>{deadlineInfo(selected,TODAY).label}</em>}{selected.deadline_notes&&<em className="deadline-note">{selected.deadline_notes}</em>}</div><div><span>Amount</span><b>{selected.amount}</b></div><div><span>Location</span><b>{selected.city}, {selected.region}</b></div><div><span>Eligibility</span><b>{selected.eligibility.nationality.join('; ')}</b><em className={'elig-note elig-'+elig[selected.id].verdict}>{VERDICT[elig[selected.id].verdict]} — {elig[selected.id].reason}</em>{profile.nationality&&selected.country_notes&&selected.country_notes[profile.nationality]&&<em className="elig-note country-note">For {profile.nationality}: {selected.country_notes[profile.nationality]}</em>}</div>
   {/* Shown only when the reader has a confirmed GPA — otherwise the row would
       be a per-record "unknown" that says nothing the profile summary has not
       already said. The sentence always names which of the five cases applies. */}
   {confirmedGpa&&gpaComparison&&gpaComparison[selected.id]&&<div><span>Your GPA</span><b className={'gpa-verdict gpa-'+gpaComparison[selected.id].verdict}>{GPA_VERDICT_LABEL[gpaComparison[selected.id].verdict]}</b><em className="elig-note">{gpaComparison[selected.id].sentence}</em>{gpaComparison[selected.id].quote&&<em className="elig-note gpa-quote">The provider writes: “{gpaComparison[selected.id].quote}”</em>}</div>}<div><span>Source last checked</span><b>{selected.last_verified?fmtDate(selected.last_verified):'Not recorded'}</b></div></div><div className="detail-note"><ShieldCheck size={17}/><span>Deadlines and amounts appear only where a contributor recorded them from the official source, together with the date they checked it. Confirm dates, eligibility, and terms directly with the provider.</span></div><div className="modal-actions"><div className="modal-action-group"><button className="outline-btn" onClick={()=>updateSaved(selected.id)}><Bookmark size={15}/>{saved.includes(selected.id)?'Saved':'Save opportunity'}</button><button className={'outline-btn '+(tracker[selected.id]?'tracking':'')} aria-pressed={!!tracker[selected.id]} onClick={()=>toggleTrack(selected)}><CalendarClock size={15}/>{tracker[selected.id]?'Tracking deadline':'Track deadline'}</button></div><a className="primary-btn" href={selected.official_url} target="_blank" rel="noreferrer">Official scholarship page <ExternalLink size={15}/></a></div></section></div>}
  {notice&&<div className="toast" role="status" aria-live="polite"><Check size={16}/>{notice}</div>}<footer className="footer">Made for curious minds. <span>ScholarHub is an independent discovery tool · Always verify with official sources.</span></footer></main></div>
}

export default App;
