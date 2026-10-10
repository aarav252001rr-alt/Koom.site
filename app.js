const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS={get(k){try{return localStorage.getItem(k)}catch(e){}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const THEMES={dark:['Dark','#fa243c','#0d0d10'],light:['Light','#fa243c','#f5f5f7'],ocean:['Ocean','#0a84ff','#0a0d14'],violet:['Violet','#bf5af2','#100c16'],forest:['Forest','#30d158','#0a120d']};
const setTheme=k=>{document.documentElement.dataset.theme=k;LS.set('theme',k)};
setTheme(THEMES[LS.get('theme')]?LS.get('theme'):'dark');
const SK=(d)=>`<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></g>`;
const IC={play:'<path d="M8 5v14l11-7z"/>',pause:'<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',next:'<path d="M6 6l9 6-9 6zM16 6h2v12h-2z"/>',prev:'<path d="M18 6l-9 6 9 6zM6 6h2v12H6z"/>',
shuf:SK('M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5'),rep:SK('M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3'),
dl:SK('M12 4v11m0 0l-4-4m4 4l4-4M5 20h14'),info:SK('M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.01'),vol:SK('M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7'),
logo:SK('M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z'),theme:SK('M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18'),back:SK('M15 5l-7 7 7 7')};
Object.assign(IC,{search:SK('M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z'),home:SK('M3 11l9-8 9 8M5 10v10h14V10'),list:SK('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'),quote:SK('M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2zM8 9h8M8 13h5'),down:SK('M6 9l6 6 6-6'),lib:SK('M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.8-1 3.7 15-3.8 1z')});
Object.assign(IC,{heart:SK('M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z'),heartf:'<path d="M12 21l-1.5-1.4C5.4 15 2 11.900 2 8.500 2 5.400 4.400 3 7.500 3c1.700 0 3.400.8 4.500 2.100C13.100 3.800 14.800 3 16.500 3 19.600 3 22 5.400 22 8.500c0 3.400-3.400 6.500-8.500 11.100z"/>',more:'<g fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></g>',clock:SK('M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2'),sliders:SK('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'),plus:SK('M12 5v14M5 12h14'),trash:SK('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6'),check:SK('M5 12l5 5L20 7'),dldone:SK('M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6'),bolt:SK('M13 2L4 14h7l-1 8 9-12h-7z'),moon:SK('M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z'),speed:SK('M12 14l4-4M3 17a9 9 0 1118 0'),qadd:SK('M3 6h13M3 12h13M3 18h7M18 14v6M15 17h6'),expand:SK('M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7'),x:SK('M6 6l12 12M18 6L6 18'),refresh:SK('M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5'),gear:SK('M12 15a3 3 0 100-6 3 3 0 000 6zM19.400 15a1.700 1.700 0 00.3 1.800l.1.1a2 2 0 11-2.800 2.800l-.1-.1a1.700 1.700 0 00-1.800-.3 1.700 1.700 0 00-1 1.500V21a2 2 0 11-4 0v-.1a1.700 1.700 0 00-1.100-1.500 1.700 1.700 0 00-1.800.3l-.1.1a2 2 0 11-2.800-2.800l.1-.1a1.700 1.700 0 00.3-1.800 1.700 1.700 0 00-1.500-1H3a2 2 0 110-4h.1a1.700 1.700 0 001.500-1.100 1.700 1.700 0 00-.3-1.800l-.1-.1a2 2 0 112.800-2.800l.1.1a1.700 1.700 0 001.800.3H9a1.700 1.700 0 001-1.500V3a2 2 0 114 0v.1a1.700 1.700 0 001 1.500 1.700 1.700 0 001.800-.3l.1-.1a2 2 0 112.800 2.800l-.1.1a1.700 1.700 0 00-.3 1.800V9a1.700 1.700 0 001.500 1H21a2 2 0 110 4h-.1a1.700 1.700 0 00-1.500 1z')});
const ic=(n,s=22)=>`<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true">${IC[n]}</svg>`;
const PH='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3b2a8f"/><stop offset="1" stop-color="#0f6c8a"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path d="M42 34v32a8 8 0 1 1-4-7V40l24-6v22a8 8 0 1 1-4-7V34z" fill="rgba(255,255,255,.55)"/></svg>');
const mm=s=>isFinite(s)&&s>0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
function toast(m){let e=$('#toast');if(!e){e=document.createElement('div');e.id='toast';e.className='toast glass';document.body.append(e)}e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2600)}
const mk=x=>({c:x,url:x.url,tags:{},alt:x.alt||x.altUrl||''});
const natural=(a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
const AX=['m4a','aac','opus','ogg','mp3'];
const dec=s=>{try{return decodeURIComponent(s)}catch(e){return s}};
async function listFolder(folder,files){
 const base=new URL(folder.endsWith('/')?folder:folder+'/',location.href),dbg={folder:base.href};let tracks=[];
 try{
  let h=[];
  if(files)h=files.map(n=>encodeURIComponent(n));
  else{
   const r=await fetch(base,{cache:'no-store'});dbg.status=r.status;dbg.type=r.headers.get('content-type')||'?';
   if(!r.ok)throw new Error(_('errList',{n:r.status}));
   const s=await r.text();dbg.sample=s.slice(0,140).replace(/\s+/g,' ');const c=s.trim()[0];
   if(c==='['||c==='{'){try{let j=JSON.parse(s);j=Array.isArray(j)?j:(j.files||j.entries||[]);h=j.map(x=>encodeURIComponent(x.name||x))}catch(e){}}
   if(!h.length)h=[...new DOMParser().parseFromString(s,'text/html').querySelectorAll('a[href]')].map(a=>a.getAttribute('href'));
   dbg.links=h.length;dbg.hrefs=h.slice(0,8).map(dec).join(' , ');
   if(!h.some(x=>/\.(flac|lrc)([?#]|$)/i.test(x)))h=[...s.matchAll(/["'>]([^"'<>\/]+\.(?:flac|lrc))["'<]/gi)].map(m=>/%/.test(m[1])?m[1]:encodeURIComponent(m[1]));
  }
  const ext=u=>((u.pathname.match(/\.(\w+)$/)||[])[1]||'').toLowerCase(),key=u=>dec(u.pathname).replace(/\.\w+$/,'').toLowerCase();
  const resolve=root=>{const m=new Map();for(const n of h){try{const u=new URL(n,root);if(u.origin===base.origin&&['flac','lrc',...AX].includes(ext(u)))m.set(u.href,u)}catch(e){}}return[...m.values()]};
  const inside=u=>dec(u.pathname).toLowerCase().startsWith(dec(base.pathname).toLowerCase());
  let u=resolve(base).filter(inside);
  if(!u.some(x=>ext(x)==='flac'))u=resolve(base.origin+'/').filter(inside);
  if(!u.some(x=>ext(x)==='flac')){const nm=[...new Set(h.map(x=>(dec(x).match(/([^\/=?&#]+\.(?:flac|lrc|m4a|aac|opus|ogg|mp3))(?:[&#]|$)/i)||[])[1]).filter(Boolean))];u=nm.map(n=>new URL(encodeURIComponent(n),base))}
  const lr=new Map(u.filter(x=>ext(x)==='lrc').map(x=>[key(x),x.href]));
  const al=new Map();u.filter(x=>AX.includes(ext(x))).forEach(x=>{const k=key(x),c=al.get(k),p=AX.indexOf(ext(x));if(!c||p<c.p)al.set(k,{p,h:x.href})});
  tracks=u.filter(x=>ext(x)==='flac').sort((a,b)=>natural(key(a),key(b))).map(x=>({url:x.href,...(lr.has(key(x))?{lyricsUrl:lr.get(key(x))}:{}),...(al.has(key(x))?{alt:al.get(key(x)).h}:{})}));
  dbg.flac=tracks.length;dbg.lrc=lr.size;
 }catch(e){dbg.error=e.message||String(e)}
 return{tracks,dbg}}
const dbgMsg=p=>{const d=p.dbg||{};return`<div class="msg"><b>${esc(p.name||'')}</b><br>${_('noTracks')}<br>${d.error?esc(d.error)+'<br>':''}<small style="word-break:break-all">${esc(Object.entries(d).filter(([k])=>k!=='error').map(([k,v])=>k+': '+v).join(' | '))}</small><br><small>${_('noTracksHint')}</small></div>`};
async function loadCfg(one){
 const r=await fetch('config.json',{cache:'no-store'});if(!r.ok)throw new Error(_('errCfgNf',{n:r.status}));
 const tx=await r.text();let c;try{c=JSON.parse(tx)}catch(e){try{c=JSON.parse(tx.replace(/,\s*([}\]])/g,'$1'))}catch(e2){throw new Error(_('errCfgSyntax',{m:e2.message}))}}
 const name=c.site?.name||'Music';document.querySelectorAll('.site').forEach(e=>e.textContent=name);window.SITE=name;
 const P=(c.playlists||[]).map((p,i)=>({...p,id:p.id||'p'+i}));if(!P.length)throw new Error(_('errPlEmpty'));
 const tgt=one?(P.find(p=>p.id===new URLSearchParams(location.search).get('p'))||P[0]):null;
 await Promise.all(P.map(async p=>{
  let x=(p.tracks||[]).filter(t=>t.url);
  if(p.folder&&(!one||p===tgt)){const L=await listFolder(p.folder,p.files);x=[...x,...L.tracks];p.dbg=L.dbg;if(L.dbg.error)p.err=1}
  p.tracks=x.map(mk);
 }));
 return P}
const fail=e=>`<div class="msg"><b>${_('failTitle')}</b><br>${esc(e&&e.message||e)}<br><small>${_('failHint')}</small></div>`;
const F=(t,k,tag)=>t.c[k]||t.tags[tag||k.toUpperCase()]||'';
const title=t=>F(t,'title')||decodeURIComponent(t.url.split('/').pop().split('?')[0]).replace(/\.flac$/i,'');
const artist=t=>F(t,'artist')||_('unknown');
const cover=t=>t.c.cover||t.pic||PH;
const dur=t=>t.dur||t.c.duration||0;
function qual(t){const p=[];if(t.bps)p.push(t.bps+'-bit');if(t.sr)p.push(t.sr/1000+' kHz');const hi=t.bps>16||t.sr>48000;return{label:t.c.quality||(hi?'Hi-Res':'Lossless'),hi,spec:p.join(' / ')}}
function parse(b,t){const dv=new DataView(b.buffer),td=new TextDecoder();if(td.decode(b.subarray(0,4))!=='fLaC')return;
 let p=4,last=0;while(!last&&p+4<=b.length){const h=b[p];last=h>>7;const ty=h&127,len=dv.getUint32(p)&0xffffff;p+=4;if(p+len>b.length)break;
  if(ty===0){t.sr=(b[p+10]<<12)|(b[p+11]<<4)|(b[p+12]>>4);t.ch=((b[p+12]>>1)&7)+1;t.bps=(((b[p+12]&1)<<4)|(b[p+13]>>4))+1;const tot=(b[p+13]&15)*4294967296+dv.getUint32(p+14);if(t.sr&&tot)t.dur=tot/t.sr}
  else if(ty===4){let q=p;q+=4+dv.getUint32(q,true);const n=dv.getUint32(q,true);q+=4;for(let i=0;i<n;i++){const l=dv.getUint32(q,true);q+=4;const s=td.decode(b.subarray(q,q+l));q+=l;const k=s.indexOf('=');if(k>0)t.tags[s.slice(0,k).toUpperCase()]=s.slice(k+1)}}
  else if(ty===6){let q=p+4;const ml=dv.getUint32(q);q+=4;const mime=td.decode(b.subarray(q,q+ml));q+=ml;const dl=dv.getUint32(q);q+=4+dl+16;const pl=dv.getUint32(q);q+=4;if(q+pl<=p+len)t.pic=URL.createObjectURL(new Blob([b.subarray(q,q+pl)],{type:mime}))}
  p+=len}}
async function enrich(t){if(t.done)return;t.done=1;
 try{const r=await fetch(t.url,{headers:{Range:'bytes=0-1048575'}});const cr=r.headers.get('Content-Range');t.size=cr?+cr.split('/')[1]:+r.headers.get('Content-Length')||0;
  const rd=r.body.getReader(),ch=[];let n=0;while(n<1048576){const{done,value}=await rd.read();if(done)break;ch.push(value);n+=value.length}rd.cancel();
  const b=new Uint8Array(n);let o=0;for(const c of ch){b.set(c,o);o+=c.length}parse(b,t)}catch(e){}return 1}
function enrichAll(list,cb){let k=0;const w=async()=>{while(k<list.length){await enrich(list[k++]);cb&&cb()}};w();w()}
async function dl(t){const name=`${artist(t)} - ${title(t)}.flac`;toast(_('saving'));
 try{const r=await fetch(t.url);if(!r.ok)throw 0;const u=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),4e4);toast(_('saved'))}
 catch(e){const a=document.createElement('a');a.href=t.url;a.download=name;a.target='_blank';a.click()}}
const total=l=>{const s=l.reduce((a,t)=>a+dur(t),0);return s?_('min',{n:Math.round(s/60)}):''};
