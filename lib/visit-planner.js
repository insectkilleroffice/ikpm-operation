/* IKPM Visit Planner — Operations manager.
   Data lives in Supabase, schema "ops" (see ikpm-admin/supabase/ops.sql), apart from sales.
   Every change goes through a checked database function; this file only shows the
   data and calls those functions. Only view settings (ticked sites, filter, view) are
   kept in this browser. */

/** Mounts the planner into the shell rendered by app/VisitPlanner.tsx. Returns a cleanup function. */
export function mountVisitPlanner(supabase) {
var KEY='ikpm-ops-view-v1';
var db=supabase.schema('ops');
var $=function(id){return document.getElementById(id);};
var v$=function(id){var e=$(id);return e?String(e.value).trim():'';};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
var pad=function(n){return (n<10?'0':'')+n;};
var ymd=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
var iso=function(n){var d=new Date();d.setDate(d.getDate()+n);return ymd(d);};
var dt=function(s){return new Date(s+'T00:00:00');};
var fmtDay=function(s){return s?dt(s).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}):'';};
var fmtLong=function(s){return dt(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'-');};
var money=function(n){return 'PKR '+Math.round(n).toLocaleString('en-US');};

var PEOPLE=[];   // active field team names (from ops.staff)
var SLOTS=['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00'];
var SERVICE=['monthly','contract','revisit'];
var OUT={completed:'Completed',partial:'Partial',blocked:'Client blocked',postponed:'Postponed'};
function isSvc(v){return SERVICE.indexOf(v.type)>-1;}
function isOps(v){return v.type==='meeting'||v.type==='inspection';}
function label(v){
  if(v.type==='monthly')return 'Monthly';
  if(v.type==='contract')return 'Contract';
  if(v.type==='revisit')return 'Revisit';
  if(v.type==='meeting')return 'Meeting';
  return 'Inspection';
}

var SITES=[];    // from ops.sites + ops.clients
function isPending(x){return !!x.pending;}
function live(){return SITES.filter(function(x){return !isPending(x);});}
function site(id){return SITES.filter(function(s){return s.id===id;})[0];}

function siteName(v){return v.site?site(v.site).name:v.prospect;}

/* ---------- data from the database ---------- */
var STAFF=[];
var ST_MAP={needs_pco:'toassign',scheduled:'scheduled',started:'started',needs_new_day:'resched',done:'done'};
function staffName(id){for(var i=0;i<STAFF.length;i++)if(STAFF[i].id===id)return STAFF[i].full_name;return '';}
function staffId(name){for(var i=0;i<STAFF.length;i++)if(STAFF[i].full_name===name)return STAFF[i].id;return null;}
function staffIds(list){return (list||[]).map(staffId).filter(Boolean);}
function day(ts){return ts?String(ts).slice(0,10):'';}
function rows(p){return p.then(function(r){if(r.error)throw r.error;return r.data||[];});}
function rpc(fn,params){return db.rpc(fn,params).then(function(r){if(r.error)throw r.error;return r.data;});}

function loadAll(){
  return Promise.all([
    rows(db.from('staff').select('id,full_name,active').order('full_name')),
    rows(db.from('clients').select('id,name')),
    rows(db.from('sites').select('id,client_id,name,city,visits_per_month,pco_id,status')),
    rows(db.from('visits').select('*').order('visit_date').order('visit_time')),
    rows(db.from('visit_history').select('*').order('at')),
    rows(db.from('service_reports').select('*')),
    rows(db.from('meeting_reports').select('*')),
    rows(db.from('inspection_reports').select('*')),
    rows(db.from('site_issues').select('id,site_id,description,source_visit_id').eq('open',true).order('created_at')),
    rows(db.from('complaints').select('id,code,site_id,description,severity,status,decision,lodged_at,lodged_by_name').order('lodged_at',{ascending:false}))
  ]).then(function(r){
    STAFF=r[0];
    PEOPLE=STAFF.filter(function(s){return s.active;}).map(function(s){return s.full_name;});
    var cl={};r[1].forEach(function(c){cl[c.id]=c.name;});
    SITES=r[2].map(function(s){
      return {id:s.id,client:cl[s.client_id]||'',name:s.name,city:s.city||'',per:s.visits_per_month,sup:staffName(s.pco_id)||PEOPLE[0]||'',pending:s.status==='pending'};
    }).sort(function(a,b){return (a.client+' '+a.name).localeCompare(b.client+' '+b.name);});
    var hist={},svc={},meet={},insp={},jobOf={},comp={};
    r[4].forEach(function(h){(hist[h.visit_id]=hist[h.visit_id]||[]).push({from:h.from_date,time:h.from_time,reason:h.reason,note:h.note||'',at:day(h.at)});});
    r[5].forEach(function(x){svc[x.visit_id]=x;});
    r[6].forEach(function(x){meet[x.visit_id]=x;});
    r[7].forEach(function(x){insp[x.visit_id]=x;});
    r[9].forEach(function(c){comp[c.id]=c;});
    S.complaints=r[9];
    S.visits=r[3].map(function(v){
      if(v.job_code)jobOf[v.id]=v.job_code;
      var rep=null,x;
      if((x=svc[v.id]))rep={by:x.submitted_by_name||staffName(v.pco_id),team:(x.team_ids||[]).map(staffName).filter(Boolean),outcome:x.outcome,
        items:(x.items||[]).map(function(i){return {n:i.name,q:i.qty,u:i.unit};}),extras:(x.extras||[]).map(function(e){return {d:e.work,c:Number(e.charge)||0};}),
        notes:x.notes||'',finds:x.findings||[],photos:{before:v.before_photos||[],found:x.found_photos||[],after:x.after_photos||[]},
        challan:{no:x.challan_no,date:x.challan_date,file:x.challan_file},at:day(x.submitted_at)};
      else if((x=meet[v.id]))rep={by:x.written_by_name,with:x.joined,outcome:x.outcome,notes:x.notes||'',at:day(x.written_at)};
      else if((x=insp[v.id]))rep={by:x.written_by_name,activity:x.activity,rec:x.advice,areas:x.areas,notes:x.notes||'',at:day(x.written_at)};
      return {id:v.id,site:v.site_id,type:v.kind,date:v.visit_date,fixed:v.status==='needs_pco',time:v.visit_time,
        pco:staffName(v.pco_id),crew:(v.crew_ids||[]).map(staffName).filter(Boolean),status:ST_MAP[v.status],
        note:v.note||'',due:'',from:v.source==='admin'?'Admin':'Ops',report:rep,job:v.job_code||'',prospect:v.prospect_name||'',
        history:hist[v.id]||[],guests:v.guests||'',treatments:v.treatments||[],complaint:v.complaint_id?comp[v.complaint_id]||null:null,
        started:v.started_at?{at:day(v.started_at),before:v.before_photos||[]}:null};
    });
    S.issues=r[8].map(function(i){return {id:i.id,site:i.site_id,text:i.description,job:jobOf[i.source_visit_id]||'Finding',open:true};});
  });
}
function refresh(){
  return loadAll().then(function(){
    S.ready=true;S.loadErr='';
    if(!S.sel)S.sel=live().map(function(x){return x.id;}).concat(['lead']);
  }).catch(function(e){S.loadErr=(e&&e.message)||String(e);});
}

/* Files (signed challans, photos) go to the private "ops-files" bucket. */
function filesOf(id){var e=$(id);return e&&e.files?Array.prototype.slice.call(e.files):[];}
function upload(visitId,kind,files){
  return Promise.all(files.map(function(f,i){
    var path=visitId+'/'+kind+'/'+Date.now()+'-'+i+'-'+f.name.replace(/[^A-Za-z0-9._-]/g,'_');
    return supabase.storage.from('ops-files').upload(path,f,{upsert:false}).then(function(r){if(r.error)throw r.error;return path;});
  }));
}

/* view settings only (data is in the database) */
var VIEW_KEYS=['sel','types','cview','open'];
function loadView(){try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&o.v===1)return o;}catch(e){}return {};}
function save(){try{var o={v:1};VIEW_KEYS.forEach(function(k){o[k]=S[k];});localStorage.setItem(KEY,JSON.stringify(o));}catch(e){}}
var S=Object.assign({sel:null,types:[],scope:'day',filter:'all',cview:'month',open:{}},loadView(),
  {filter:'all',edit:null,rep:null,sched:false,lodge:false,msg:'',err:'',visits:[],issues:[],complaints:[],ready:false,loadErr:''});

/* logic */
function vis(id){return S.visits.filter(function(v){return v.id===id;})[0];}
function teamOf(v){return [v.pco].concat(v.crew||[]).filter(Boolean);}
function monthName(ym){var p=ym.split('-');return new Date(+p[0],+p[1]-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
function nextMonthOf(d){var x=dt(d);x.setDate(1);x.setMonth(x.getMonth()+1);return x.getFullYear()+'-'+pad(x.getMonth()+1);}
function schedRule(sid){
  var all=S.visits.filter(function(v){return v.site===sid&&isSvc(v);}),t=iso(0),last=null;
  all.forEach(function(v){if(v.date&&(!last||v.date>last.date))last=v;});
  if(all.some(function(v){return v.status!=='done';}))return {ok:false,last:last};
  var cur=t.slice(0,7),minM=last?nextMonthOf(last.date):cur;
  if(minM<cur)minM=cur;
  return {ok:true,last:last,after:(last&&last.date>t)?last.date:t,minM:minM};
}
function missedOf(v){return (v.status==='scheduled'||v.status==='started')&&!!v.date&&v.date<iso(0);}
function onCal(v){return !!v.date&&(!needsDay(v)||!!v.fixed||v.status==='resched');}
function isReq(v){return (v.status==='toassign'&&!!v.fixed)||v.status==='resched';}
function needsDay(v){return v.status==='toassign'||v.status==='resched';}
function monthDates(ym,n,after,minM){
  var p=ym.split('-'),y=+p[0],m=+p[1];if(!y||!m||n<1)return [];
  if(minM&&ym<minM)return [];
  var last=new Date(y,m,0).getDate(),first=1,am=after.slice(0,7);
  if(ym<am)return [];
  if(ym===am)first=parseInt(after.slice(8),10)+1;
  if(first>last)return [];
  var span=last-first+1,out=[];
  for(var i=0;i<n;i++){
    var day=first+Math.floor((i+0.5)*span/n);
    if(new Date(y,m-1,day).getDay()===0)day=day+1<=last?day+1:day-1;
    out.push(y+'-'+pad(m)+'-'+pad(day));
  }
  return out;
}
function byDate(a,b){var x=(a.date||a.due),y=(b.date||b.due);return x<y?-1:(x>y?1:(a.time<b.time?-1:1));}
function plusHour(t){var p=t.split(':');var h=+p[0]+1;return pad(h>23?23:h)+':'+(p[1]||'00');}
/** Short team line: lead name plus how many more. */
function teamText(v){
  var crew=v.crew||[];
  if(isOps(v))return 'You'+(crew.length?' + '+crew.length:'');
  if(!v.pco)return '';
  return esc(v.pco)+(crew.length?' + '+crew.length:'');
}
var TCOL={monthly:'var(--t-svc)',contract:'var(--t-svc)',revisit:'var(--t-rev)',meeting:'var(--t-meet)',inspection:'var(--t-insp)'};

/* small html helpers */
function fld(label,id,inner,hint){return '<div class="fld"><label for="'+id+'">'+label+'</label>'+inner+(hint?'<small>'+hint+'</small>':'')+'</div>';}
function sel(id,opts,val){if(!opts.length)return '<select id="'+id+'" disabled><option value="">No PCOs yet</option></select>';return '<select id="'+id+'">'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';}
function checks(name,opts,on,inline){
  return '<div class="chks'+(inline?' inline':'')+'" data-name="'+name+'">'+opts.map(function(o){
    return '<label class="chk"><input type="checkbox" name="'+name+'" value="'+esc(o)+'"'+((on||[]).indexOf(o)>-1?' checked':'')+'><span>'+esc(o)+'</span></label>';
  }).join('')+'</div>';
}
var LEADS={'l-pco':'l-crew'};
/** The ticked PCOs as [main, ...others]. The database keeps one main PCO per visit: the current one if still ticked, else the first. */
function pcoPick(name,prefer){var p=picked(name);if(!p.length)return [];var lead=p.indexOf(prefer)>-1?prefer:p[0];return [lead].concat(p.filter(function(x){return x!==lead;}));}
function syncLead(id){
  var sl=$(id);if(!sl)return;
  var lead=sl.value;
  Array.prototype.forEach.call(document.querySelectorAll('input[name="'+LEADS[id]+'"]'),function(i){
    if(i.value===lead){i.checked=true;i.disabled=true;i.dataset.lock='1';}
    else if(i.dataset.lock==='1'){i.checked=false;i.disabled=false;i.dataset.lock='';}
  });
}
function syncLeads(){Object.keys(LEADS).forEach(syncLead);}
function picked(name){return Array.prototype.map.call(document.querySelectorAll('input[name="'+name+'"]:checked'),function(i){return i.value;});}
function fileNames(id){var e=$(id);return e&&e.files?Array.prototype.map.call(e.files,function(f){return f.name;}):[];}
/* visit cards */
function reportRows(v){
  var r=v.report;if(!r)return [];
  var by=[isOps(v)?'Written by':'Submitted by',(r.by||'Unknown')+' on '+fmtDay(r.at)];
  if(v.type==='meeting')return [by,['Who joined',r.with],['How it went',r.outcome],['Notes',r.notes||'None']];
  if(v.type==='inspection')return [by,['Pest activity',r.activity],['Advice',r.rec],['Areas checked',r.areas],['Notes',r.notes||'None'],['Filed under',v.site?'Site inspection report, '+siteName(v):'Not a client yet. Kept here only.']];
  var rows=[by,['What happened',OUT[r.outcome]],['Who did the work',r.team.join(', ')]];
  if(r.items&&r.items.length)rows.push(['Items used',r.items.map(function(i){return i.n+' '+i.q+' '+i.u;}).join('; ')]);
  if(r.extras&&r.extras.length)rows.push(['Extra treatment',r.extras.map(function(x){return x.d+' ('+money(x.c)+' before tax)';}).join('; ')]);
  if(r.notes)rows.push(['Notes',r.notes]);
  if(r.challan&&r.challan.no)rows.push(['Challan',r.challan.no+(r.challan.date?', '+fmtLong(r.challan.date):'')]);
  return rows;
}
var isPdf=function(p){return /\.pdf$/i.test(String(p||''));};
/** A stored file as a thumbnail. Images load through a signed link (see loadThumbs); tapping opens the viewer. */
function thumb(path,label){
  return '<button type="button" class="th" data-a="viewfile" data-path="'+esc(path)+'" data-label="'+esc(label)+'" aria-label="Open '+esc(label)+'">'+
    (isPdf(path)?'<span class="th-pdf" aria-hidden="true">PDF</span>':'<img data-thumb="'+esc(path)+'" alt="">')+'</button>';
}
/** Pairs finding notes with their photos. New reports keep photos under findings/<n>/; older ones are listed together. */
function findingGroups(r){
  var notes=r.finds||[],photos=(r.photos&&r.photos.found)||[],by={},loose=[];
  photos.forEach(function(p){var m=/\/findings\/(\d+)\//.exec(p);if(m)(by[m[1]]=by[m[1]]||[]).push(p);else loose.push(p);});
  var out=notes.map(function(n,i){return {note:n,photos:by[i+1]||[]};});
  if(loose.length)out.push({note:notes.length?'Other photos':'Photos',photos:loose});
  return out;
}
function reportBox(v){
  var r=v.report,media='';
  if(isSvc(v)){
    if(r.challan&&r.challan.file)media+='<div class="md"><h5>Signed challan</h5><div class="ths">'+thumb(r.challan.file,'signed challan')+'</div></div>';
    var fg=findingGroups(r);
    if(fg.length)media+='<div class="md"><h5>Findings</h5>'+fg.map(function(g,i){
      return '<div class="fnd-r"><div class="ths">'+g.photos.map(function(p,k){return thumb(p,'finding '+(i+1)+' photo '+(k+1));}).join('')+'</div><p>'+esc(g.note)+'</p></div>';
    }).join('')+'</div>';
  }
  return '<div class="rep"><h4>'+(v.type==='meeting'?'Meeting report':v.type==='inspection'?'Inspection report':'Service report')+'</h4><dl class="kv">'+reportRows(v).map(function(x){return '<dt>'+esc(x[0])+'</dt><dd>'+esc(x[1])+'</dd>';}).join('')+'</dl>'+media+'</div>';
}

/* Signed links for stored files, cached until shortly before they expire. */
var LINKS={};
function linkOf(path){var l=LINKS[path];return l&&l.exp>Date.now()?l.url:'';}
function signLinks(paths){
  var need=paths.filter(function(p){return !linkOf(p);});
  if(!need.length)return Promise.resolve();
  return supabase.storage.from('ops-files').createSignedUrls(need,3600).then(function(r){
    if(r.error)throw r.error;
    (r.data||[]).forEach(function(d){if(d.signedUrl)LINKS[d.path]={url:d.signedUrl,exp:Date.now()+55*60*1000};});
  });
}
/** Fills in thumbnail images after a redraw. */
function loadThumbs(){
  var imgs=Array.prototype.slice.call(document.querySelectorAll('img[data-thumb]:not([src])'));
  if(!imgs.length)return;
  var paths=imgs.map(function(i){return i.getAttribute('data-thumb');});
  signLinks(paths).then(function(){imgs.forEach(function(i){var u=linkOf(i.getAttribute('data-thumb'));if(u)i.src=u;});})
    .catch(function(e){console.error('Could not load photos',e);});
}

/* Full-size photo viewer over the page. Esc, the close button or a tap outside closes it. */
var viewerFrom=null;
function openViewer(src,label,from){
  var w=$('viewer');
  if(!w){
    document.body.insertAdjacentHTML('beforeend','<div class="viewer" id="viewer" role="dialog" aria-modal="true" aria-label="Photo" hidden><div class="vw-scrim" data-a="closeview"></div><img class="vw-img" id="vw-img" alt=""><p class="vw-cap" id="vw-cap"></p><button type="button" class="vw-x" data-a="closeview" aria-label="Close photo">&times;</button></div>');
    w=$('viewer');
  }
  viewerFrom=from||document.activeElement;
  $('vw-img').src=src;$('vw-img').alt=label||'Photo';$('vw-cap').textContent=label?label.charAt(0).toUpperCase()+label.slice(1):'';
  w.hidden=false;w.querySelector('.vw-x').focus();
}
function closeViewer(){
  var w=$('viewer');if(!w||w.hidden)return false;
  w.hidden=true;$('vw-img').removeAttribute('src');
  if(viewerFrom&&viewerFrom.focus)viewerFrom.focus();
  return true;
}
function badge(t,c){return '<span class="bdg '+c+'">'+t+'</span>';}
/** One status badge per card, only when it needs attention or is finished. */
function statusBadge(v){
  if(v.status==='toassign')return badge(v.fixed?'Needs PCO':'Needs day','red');
  if(v.status==='resched')return badge('Needs new day','red');
  if(missedOf(v))return badge('Missed','red');
  if(v.status==='started')return badge('In progress','amber');
  if(v.status==='done'){var oc=v.report&&v.report.outcome;return badge(oc&&OUT[oc]?OUT[oc]:'Done','green');}
  return '';
}
/** Other visits of the same new contract that still wait for a PCO. */
function waitingSame(v){return S.visits.filter(function(q){return q.id!==v.id&&q.site===v.site&&q.type==='contract'&&q.status==='toassign';});}
/** Compact card in the day list. Tapping it opens the visit (see visitDetail). */
function cardHead(v){
  // Site name, then company, then type and team.
  var x=v.site?site(v.site):null,sub=[label(v)],team=teamText(v);
  if(team)sub.push(team);
  var company=x?esc(x.client):'New lead';
  // Box on the left: day, month, weekday, then the time.
  var d=v.date?dt(v.date):null;
  var when='<div class="when">'+(d?'<b>'+d.getDate()+'</b><span>'+d.toLocaleDateString('en-GB',{month:'short'})+'</span><small>'+d.toLocaleDateString('en-GB',{weekday:'short'})+'</small>':'<b>—</b>')+(v.time?'<em>'+esc(v.time)+'</em>':'')+'</div>';
  return when+'<div class="what"><div class="v-top"><span class="v-t" title="'+esc(siteName(v))+'">'+esc(siteName(v))+'</span>'+statusBadge(v)+'</div>'+
    '<div class="v-co" title="'+company+'">'+company+'</div>'+
    '<div class="v-s" style="--c:'+TCOL[v.type]+'"><i></i>'+sub.join(' · ')+'</div></div>';
}
function cardCls(v){return 'visit'+(missedOf(v)||isReq(v)||v.status==='toassign'?' attn':'')+(v.status==='started'?' live':'')+(v.status==='done'?' done':'');}
function visitCard(v){
  return '<article class="'+cardCls(v)+' tap'+(S.focus===v.id?' cur':'')+'" role="button" tabindex="0" data-a="focus" data-id="'+v.id+'" aria-label="'+esc(v.time+' '+siteName(v)+', '+label(v))+'">'+cardHead(v)+'</article>';
}

/* Visit detail: PCO, Reschedule and Start visit / Close out / Report tabs. */
function pcoFields(v){
  var meet=isOps(v);
  if(!PEOPLE.length)return '<p class="note">No PCOs yet.</p>';
  if(meet)return '<div class="fld"><span class="lb">Joining you</span>'+checks('e-crew',PEOPLE,v.crew,true)+'</div>';
  var on=v.pco?[v.pco].concat(v.crew||[]):(v.site&&site(v.site).sup?[site(v.site).sup]:[]);
  return '<div class="fld"><span class="lb">PCO</span>'+checks('e-crew',PEOPLE,on,true)+'</div>';
}
function pcoPane(v){
  // A visit Admin sent with a fixed day: only the PCO is picked here.
  var others=v.status==='toassign'&&v.fixed&&v.type==='contract'?waitingSame(v):[];
  return '<div class="form">'+pcoFields(v)+
    (others.length?'<label class="chk"><input type="checkbox" id="e-all" checked><span>Use for all '+(others.length+1)+' contract visits</span></label>':'')+
    '<div class="row"><button type="button" class="btn go sm" data-a="saveedit" data-mode="pco" data-id="'+v.id+'">'+(v.status==='toassign'?'Assign':'Save')+'</button></div></div>';
}
function datePane(v){
  var live=v.status==='scheduled'||v.status==='started',needs=needsDay(v);
  var dflt=(v.date&&v.date>=iso(0)&&v.status!=='resched')?v.date:((v.status==='toassign'&&v.due&&v.due>=iso(0))?v.due:iso(1));
  // Reason full width at the top, the note at the bottom above the button.
  var why=live?fld('Reason','e-why',sel('e-why',['Not done','Client blocked access','Issue on site','PCO unavailable','Client asked for another day','Other'],missedOf(v)?'Not done':'Client asked for another day')):'';
  var note=live?fld('Note','e-wnote','<textarea id="e-wnote" placeholder="Optional"></textarea>'):'';
  // A visit that needs a day also needs its team, so both are saved together.
  return '<div class="form">'+why+
    '<div class="grid">'+fld('New day','e-date','<input id="e-date" type="date" min="'+iso(0)+'" value="'+dflt+'">')+fld('Time','e-time',sel('e-time',SLOTS,v.time||'10:00'))+'</div>'+
    (needs?pcoFields(v):'')+
    note+
    '<div class="row"><button type="button" class="btn go sm" data-a="saveedit" data-mode="date" data-id="'+v.id+'">'+(needs?'Save':'Reschedule')+'</button></div></div>';
}
function visitTabs(v){
  var meet=isOps(v);
  if(v.status==='toassign'&&v.fixed)return [['pco','PCO']];
  if(needsDay(v))return [['date','Reschedule']];
  if(v.status==='scheduled')return [['pco',meet?'People':'PCO'],['date','Reschedule'],['work',isSvc(v)?'Close out':'Report']];
  if(v.status==='started')return [['work','Close out'],['date','Reschedule'],['pco','PCO']];
  return v.report?[['report','Report']]:[];
}
function visitDetail(v){
  var tabs=visitTabs(v),keys=tabs.map(function(t){return t[0];});
  var cur=keys.indexOf(S.ftab)>-1?S.ftab:(missedOf(v)&&keys.indexOf('date')>-1?'date':keys[0]);
  var x=v.site?site(v.site):null,rows=[];
  rows.push(['Date',fmtDay(v.date)+(v.time?' · '+esc(v.time):'')]);
  rows.push(['Site',x?esc(x.name)+', '+esc(x.client)+(x.city?' · '+esc(x.city):''):esc(v.prospect)+' · not a client yet']);
  var team=teamOf(v);
  if(isOps(v))rows.push(['With','You'+(v.crew.length?', '+v.crew.map(esc).join(', '):'')+(v.guests?' · '+esc(v.guests):'')]);
  else if(team.length)rows.push(['PCO',team.map(esc).join(', ')]);
  if(v.treatments&&v.treatments.length)rows.push(['Treatment',v.treatments.map(esc).join(', ')]);
  if(v.note)rows.push(['Note',esc(v.note)]);
  (v.history||[]).forEach(function(h){rows.push(['Moved',fmtDay(h.from)+' · '+esc(h.reason)+(h.note?' ('+esc(h.note)+')':'')]);});
  var h='';
  if(S.msg)h+='<p class="msg" role="status">'+esc(S.msg)+'</p>';
  h+='<article class="'+cardCls(v)+' open">'+cardHead(v)+'<dl class="kv v-d">'+rows.map(function(r){return '<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>';}).join('')+'</dl></article>';
  if(tabs.length>1)h+='<div class="seg tabs" role="tablist">'+tabs.map(function(t){return '<button type="button" role="tab" data-a="ftab" data-t="'+t[0]+'" aria-pressed="'+(t[0]===cur)+'" aria-selected="'+(t[0]===cur)+'">'+t[1]+'</button>';}).join('')+'</div>';
  if(cur==='pco')h+=pcoPane(v);
  else if(cur==='date')h+=datePane(v);
  else if(cur==='work')h+=reportForm(v);
  else if(cur==='report')h+=reportBox(v);
  return h;
}

/* PCO forms */
function reportForm(v){
  // A freshly drawn form starts with no findings: drop photos held for earlier ones.
  Object.keys(FND).forEach(function(k){FND[k].forEach(function(x){URL.revokeObjectURL(x.src);});});FND={};
  var s=site(v.site),err=S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'';
  var cancel='<button type="button" class="btn alt sm" data-a="closepanel">Cancel</button>';
  var ta=fld('Notes','r-notes','<textarea id="r-notes" placeholder="Optional"></textarea>');
  if(v.type==='meeting'){
    var joined=(v.crew||[]).concat(v.guests?v.guests.split(',').map(function(x){return x.trim();}):[]).join(', ');
    return '<div class="form"><h3>Meeting report</h3>'+fld('Attendees','r-with','<input id="r-with" type="text" value="'+esc(joined)+'">')+
      fld('Outcome','r-outcome',sel('r-outcome',['Client agreed','Needs another meeting','Client said no']))+ta+err+
      '<div class="row"><button type="button" class="btn go sm" data-a="submitsimple" data-id="'+v.id+'">Save report</button>'+cancel+'</div></div>';
  }
  if(v.type==='inspection'){
    return '<div class="form"><h3>Inspection report</h3><div class="grid">'+fld('Pest activity','r-activity',sel('r-activity',['None','Low','Medium','High']))+fld('Advice','r-rec',sel('r-rec',['No action needed','Treat again','Fix site conditions first']))+'</div>'+
      fld('Areas checked','r-areas','<input id="r-areas" type="text" placeholder="Kitchen, store room…">')+ta+err+
      '<div class="row"><button type="button" class="btn go sm" data-a="submitsimple" data-id="'+v.id+'">Save report</button>'+cancel+'</div></div>';
  }
  // One close-out form for scheduled and started visits. Outcome is Completed, the team is the
  // visit's assigned team and the challan date is today (see ACT.submitclose).
  var req='<span class="req" aria-hidden="true">*</span>';
  return '<div class="form"><h3>Close out</h3><p class="sub">'+esc(s.name)+'</p>'+
    fld('Challan number'+req,'r-chno','<input id="r-chno" type="text" placeholder="CH-0000" required aria-required="true">')+
    '<div class="fld"><span class="lb">Signed challan'+req+'</span>'+dropZone('p-challan','image/*,application/pdf','JPEG, PNG or PDF','Signed challan, required')+'</div>'+
    '<div class="fld"><span class="lb">Findings</span><div class="rows" id="x-fnd"></div><div><button type="button" class="btn alt sm" data-a="addfnd">Add finding</button></div></div>'+
    ta+err+
    '<div class="row"><button type="button" class="btn go sm" data-a="submitclose" data-id="'+v.id+'">Submit report</button>'+cancel+'</div></div>';
}
/** Upload box: click to browse or drop a file on it. The preview of the chosen file shows below it. */
var UPLOAD_ICON='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.9-8.9A6 6 0 0 1 17.7 8 4 4 0 0 1 17 18"/><path d="M12 12v8M9 15l3-3 3 3"/></svg>';
function dropZone(id,accept,formats,label){
  return '<label class="dz" for="'+id+'">'+
    '<input id="'+id+'" class="dz-in" type="file" accept="'+accept+'" required aria-required="true" aria-label="'+esc(label)+'" aria-describedby="'+id+'-hint">'+
    '<span class="dz-i">'+UPLOAD_ICON+'</span>'+
    '<span class="dz-t">Choose a file or drag &amp; drop it here</span>'+
    '<span class="dz-s" id="'+id+'-hint">'+formats+'</span>'+
    '<span class="btn alt sm dz-b">Browse file</span></label>'+
    '<div class="dz-prev" id="'+id+'-prev" hidden></div>';
}
function fileSize(n){return n<1024*1024?Math.max(1,Math.round(n/1024))+' KB':(n/1024/1024).toFixed(1)+' MB';}
/** Preview under an upload box: image thumbnail or a PDF tile, name, size and a remove button. */
function showUpload(input){
  var p=$(input.id+'-prev');if(!p)return;
  var old=p.querySelector('[data-src]');if(old)URL.revokeObjectURL(old.getAttribute('data-src'));
  var f=input.files&&input.files[0];
  input.closest('.dz').classList.toggle('has',!!f);
  if(!f){p.hidden=true;p.innerHTML='';return;}
  var isImg=/^image\//.test(f.type),src=URL.createObjectURL(f);
  // Tapping the preview opens the photo in the viewer (a PDF opens in a new tab).
  p.innerHTML='<button type="button" class="dz-v" data-a="viewlocal" data-src="'+src+'" data-type="'+esc(f.type)+'" data-label="signed challan" aria-label="Open '+esc(f.name)+'">'+
      (isImg?'<img src="'+src+'" alt="">':'<span class="dz-pdf" aria-hidden="true">PDF</span>')+'</button>'+
    '<span class="dz-pn"><b title="'+esc(f.name)+'">'+esc(f.name)+'</b><small>'+fileSize(f.size)+'</small></span>'+
    '<button type="button" class="rm" data-a="rmupload" data-id="'+input.id+'" aria-label="Remove '+esc(f.name)+'">&times;</button>';
  p.hidden=false;
}
/* Findings: a compact card per finding — two photo tiles (1 required, 1 optional) and a note below.
   Photos are kept per finding in FND (input.files cannot drop a single file), keyed by the finding number.
   Photos can also be dropped anywhere on the card. */
var fndSeq=0,FND={},FND_MAX=2;
var TRASH_ICON='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
var PLUS_ICON='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
function findingRow(){
  var n=++fndSeq;FND[n]=[];
  return '<div class="fnd" data-fnd="'+n+'">'+
    '<div class="fnd-h"><span class="fnd-t">Finding '+n+'</span><button type="button" class="fnd-del" data-a="rmfnd" aria-label="Remove finding '+n+'">'+TRASH_ICON+'</button></div>'+
    '<div class="fnd-ph" id="f-'+n+'-prev">'+findingTiles(n)+'</div>'+
    '<input type="text" class="fnd-note" placeholder="Describe what was found" aria-label="Finding '+n+' note">'+
  '</div>';
}
/** The photo tiles: chosen photos (tap to view, × to remove), then an "Add photo" tile while there is room. */
function findingTiles(n){
  var list=FND[n]||[],id='f-'+n;
  var h=list.map(function(x,i){
    return '<div class="ft">'+
      '<button type="button" class="ft-v" data-a="viewlocal" data-src="'+x.src+'" data-label="finding '+n+' photo '+(i+1)+'" aria-label="Open '+esc(x.file.name)+'"><img src="'+x.src+'" alt=""></button>'+
      '<button type="button" class="ft-x" data-a="rmfndph" data-n="'+n+'" data-i="'+i+'" aria-label="Remove '+esc(x.file.name)+'">&times;</button></div>';
  }).join('');
  if(list.length<FND_MAX){
    h+='<label class="ft ft-add" for="'+id+'">'+
      '<input id="'+id+'" class="dz-in" type="file" accept="image/*" multiple data-fnd-in="'+n+'" aria-label="Add finding '+n+' photo" aria-describedby="'+id+'-hint">'+
      PLUS_ICON+'<span>Add photo</span></label>';
  }
  var hint=list.length===0?'Add 1–2 photos':(list.length===1?'1 more photo (optional)':'2 of 2 photos');
  return h+'<span class="fnd-hint" id="'+id+'-hint">'+hint+'</span>';
}
/** Adds chosen or dropped photos to a finding, up to 2. */
function addFindingPhotos(n,files){
  var list=FND[n]=FND[n]||[],imgs=Array.prototype.filter.call(files||[],function(f){return /^image\//.test(f.type);});
  var room=FND_MAX-list.length,over=imgs.length>room;
  imgs.slice(0,Math.max(0,room)).forEach(function(f){list.push({file:f,src:URL.createObjectURL(f)});});
  renderFindingPhotos(n);
  if(over||imgs.length<(files||[]).length){
    // Message above the form's buttons, without redrawing (which would clear the form).
    var row=document.querySelector('.fnd[data-fnd="'+n+'"]'),form=row&&row.closest('.form');
    lastEl=form&&form.querySelector('[data-a="submitclose"]');
    bad(over?'A finding takes at most 2 photos.':'Use JPEG or PNG photos.');
  }
}
function renderFindingPhotos(n){
  var p=$('f-'+n+'-prev');if(p)p.innerHTML=findingTiles(n);
}

/* the three columns */
function curSite(){var ids=S.sel.filter(function(x){return x!=='lead';});return ids.length===1?ids[0]:'';}
function pick(v){if(v.site&&isPending(site(v.site)))return true;return S.sel.indexOf(v.site||'lead')>-1;}
function inFilter(v,f){
  if(f==='up')return v.status==='scheduled'||v.status==='started'||needsDay(v);
  if(f==='done')return v.status==='done';
  if(f==='revisit')return v.type==='revisit';
  if(f==='meeting')return v.type==='meeting';
  if(f==='inspect')return v.type==='inspection';
  return true;
}
function qOk(v){
  var q=(S.q||'').trim().toLowerCase();if(!q)return true;
  var x=v.site?site(v.site):null;
  return (label(v)+' '+siteName(v)+' '+(x?x.client:'')+' '+teamOf(v).join(' ')+' '+(v.job||'')+' '+(v.guests||'')).toLowerCase().indexOf(q)>-1;
}
function shown(){return S.visits.filter(function(v){return pick(v)&&typeOk(v)&&inFilter(v,S.filter)&&qOk(v);});}
function reveal(sid,date){
  var k=sid||'lead';if(S.sel.indexOf(k)<0)S.sel.push(k);
  if(date){S.calMonth=date.slice(0,7);S.calDay=date;S.scope='day';}
}
var CVIEWS=[['month','Month'],['week','Week'],['day','Day']];

/* Sidebar filter: by type (none ticked = all types) and by company (each company's sites). */
var TYPES=[['svc','Monthly & contract','var(--t-svc)'],['revisit','Revisit','var(--t-rev)'],['meeting','Meeting','var(--t-meet)'],['inspection','Inspection','var(--t-insp)'],['req','Needs PCO','var(--red)']];
function typeKey(v,k){if(k==='svc')return v.type==='monthly'||v.type==='contract';if(k==='req')return isReq(v);return v.type===k;}
function typeOk(v){var t=S.types||[];return !t.length||t.some(function(k){return typeKey(v,k);});}
function companies(){
  var by={};
  live().forEach(function(x){(by[x.client]=by[x.client]||[]).push(x);});
  return Object.keys(by).sort(function(a,b){return a.localeCompare(b);}).map(function(n){return {name:n,sites:by[n]};});
}
/** Things that need the manager: missed visits and visits waiting for a PCO or a new day. */
function attnCount(ids){return S.visits.filter(function(v){return ids.indexOf(v.site)>-1&&(needsDay(v)||missedOf(v));}).length;}
function cnt(n,hot,title){return n?'<span class="fo-c'+(hot?' hot':'')+'"'+(title?' title="'+title+'"':'')+'>'+n+'</span>':'';}
var TICK='<svg class="fo-k" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function fsHead(title,clearAct,active){
  return '<div class="fs-h"><h3>'+title+'</h3><button type="button" class="fs-clear" data-a="'+clearAct+'"'+(active?'':' disabled')+'>Clear</button></div>';
}
function paintSide(){
  var ts=S.types||[],allIds=live().map(function(x){return x.id;}),cm=S.calMonth||iso(0).slice(0,7);
  var mine=S.visits.filter(function(v){return pick(v)&&onCal(v);});
  var h='<div class="fb">';
  h+='<section class="fs">'+fsHead('Type','cleartypes',ts.length>0)+'<div class="fs-l" role="group" aria-label="Show these types">';
  TYPES.forEach(function(t){
    var on=ts.indexOf(t[0])>-1;
    // Needs PCO counts every open request; the others count this calendar month.
    var n=mine.filter(function(v){return typeKey(v,t[0])&&(t[0]==='req'||v.date.slice(0,7)===cm);}).length;
    h+='<label class="fo ty'+(on?' on':'')+'"><input type="checkbox" data-a="ttype" data-id="'+t[0]+'"'+(on?' checked':'')+'><i class="fo-d" style="background:'+t[2]+'"></i><span class="fo-n">'+t[1]+'</span>'+(on?TICK:cnt(n,t[0]==='req'))+'</label>';
  });
  h+='</div></section>';
  var filtered=allIds.some(function(id){return S.sel.indexOf(id)<0;});
  h+='<section class="fs">'+fsHead('Company','selall',filtered)+'<div class="fs-l" role="group" aria-label="Show these companies">';
  companies().forEach(function(c){
    var ids=c.sites.map(function(x){return x.id;}),n=ids.filter(function(id){return S.sel.indexOf(id)>-1;}).length;
    var on=n===ids.length,part=n>0&&!on,multi=c.sites.length>1,a=attnCount(ids);
    h+='<label class="fo co'+(on?' on':'')+(part?' part':'')+'"><input type="checkbox" data-a="tcomp" data-id="'+esc(c.name)+'"'+(on?' checked':'')+'><span class="fo-r"></span><span class="fo-n" title="'+esc(c.name)+'">'+esc(c.name)+'</span>'+cnt(a,true,a+' need attention')+'</label>';
    if(multi)c.sites.forEach(function(x){
      var son=S.sel.indexOf(x.id)>-1;
      h+='<label class="fo co sub'+(son?' on':'')+'"><input type="checkbox" data-a="toggle" data-id="'+x.id+'"'+(son?' checked':'')+'><span class="fo-r"></span><span class="fo-n" title="'+esc(x.name)+'">'+esc(x.name)+'</span></label>';
    });
  });
  h+='</div></section></div>';
  $('side').innerHTML=h;
}
function refocus(a,id){var b=document.querySelector('input[data-a="'+a+'"][data-id="'+String(id).replace(/"/g,'\\"')+'"]');if(b&&b.focus)b.focus();}
function pill(v){
  var st=isReq(v)?(v.status==='resched'?' · needs new day':' · needs PCO'):(missedOf(v)?' · missed':(v.status==='done'?' · done':''));
  return '<span class="pl '+v.type+(v.status==='done'?' dn':'')+(missedOf(v)?' ms':'')+(isReq(v)?' req':'')+'" title="'+esc(v.time+' '+siteName(v)+' · '+label(v)+st)+'"><b>'+esc(v.time)+'</b><span class="pl-t">'+esc(siteName(v))+'</span></span>';
}
function gcell(ds,list,ym,max,sd){
  var d=dt(ds),n=list.length,miss=list.filter(missedOf).length;
  var h='<div class="gc-day'+(ds.slice(0,7)!==ym?' out':'')+(ds===sd?' sel':'')+'" role="button" tabindex="0" data-a="calday" data-d="'+ds+'" aria-label="'+esc(fmtDay(ds)+', '+n+(n===1?' item':' items')+(miss?', '+miss+' missed':''))+'"><span class="gc-n'+(ds===iso(0)?' today':'')+'">'+d.getDate()+'</span>';
  h+=list.slice(0,max).map(pill).join('');
  if(n>max)h+='<span class="gc-more">'+(n-max)+' more</span>';
  return h+'</div>';
}
function paintCal(){
  var cm=S.calMonth||iso(0).slice(0,7),sd=S.calDay||iso(0),v=S.cview==='agenda'?'month':(S.cview||'month');
  var p=cm.split('-'),y=+p[0],m=+p[1],by={};
  shown().forEach(function(x){if(onCal(x)){(by[x.date]=by[x.date]||[]).push(x);}});
  Object.keys(by).forEach(function(k){by[k].sort(byDate);});
  var first=new Date(y,m-1,1),title='<b>'+first.toLocaleDateString('en-GB',{month:'long'})+'</b> '+y;
  var body='';
  var names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(v==='month'){
    var lead=first.getDay(),days=new Date(y,m,0).getDate(),total=Math.ceil((lead+days)/7)*7;
    body+='<div class="gc-grid">'+names.map(function(n){return '<div class="gc-h">'+n+'</div>';}).join('');
    for(var i=0;i<total;i++){var d=new Date(y,m-1,1-lead+i);var ds=ymd(d);body+=gcell(ds,by[ds]||[],cm,3,sd);}
    body+='</div>';
  }else if(v==='week'){
    var s0=dt(sd);s0.setDate(s0.getDate()-s0.getDay());var e0=new Date(s0);e0.setDate(e0.getDate()+6);
    title='<b>'+s0.getDate()+' '+s0.toLocaleDateString('en-GB',{month:'short'})+' – '+e0.getDate()+' '+e0.toLocaleDateString('en-GB',{month:'short'})+'</b> '+e0.getFullYear();
    body+='<div class="gc-grid gc-week">'+names.map(function(n){return '<div class="gc-h">'+n+'</div>';}).join('');
    for(var k=0;k<7;k++){var d2=new Date(s0);d2.setDate(d2.getDate()+k);var ds2=ymd(d2);body+=gcell(ds2,by[ds2]||[],ds2.slice(0,7),30,sd);}
    body+='</div>';
  }else{
    title='<b>'+dt(sd).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})+'</b> '+dt(sd).getFullYear();
    var list=by[sd]||[];
    body+='<div class="gc-dv">';
    ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].forEach(function(hh){
      var at=list.filter(function(x){return x.time.slice(0,2)===hh.slice(0,2);});
      body+='<div class="dv-row"><span class="dv-t">'+hh+'</span><div class="dv-c">'+at.map(function(x){return '<div class="dv-e">'+pill(x)+'<span class="dv-s">'+label(x)+(teamText(x)?' · '+teamText(x):'')+'</span></div>';}).join('')+'</div></div>';
    });
    body+='</div>';
  }
  var unit=v==='week'?'week':(v==='day'?'day':'month');
  // Left: view switch. Right: ‹ Today ›. No visible title; the period is in the calendar's label for screen readers.
  var h='<section class="gc" aria-label="Calendar, '+esc(title.replace(/<[^>]+>/g,''))+'"><div class="gc-top">'+
    '<div class="seg" role="group" aria-label="Calendar view">'+CVIEWS.map(function(c){return '<button type="button" data-a="cview" data-v="'+c[0]+'" aria-pressed="'+(v===c[0])+'">'+c[1]+'</button>';}).join('')+'</div>'+
    '<div class="gc-nav" style="margin-inline-start:auto"><button type="button" data-a="calnav" data-n="-1" aria-label="Previous '+unit+'">&lsaquo;</button><button type="button" class="gc-today" data-a="calnav" data-n="0">Today</button><button type="button" data-a="calnav" data-n="1" aria-label="Next '+unit+'">&rsaquo;</button></div></div>'+
    body+'</section>';
  $('center').innerHTML=h;
}
/* Visit details open in a panel that slides in from the right (#drawer in app/VisitPlanner.tsx).
   The panel element stays in the page, so only opening and closing animate, not every redraw. */
var drawerFrom=null;
function paintDrawer(){
  var dr=$('drawer');if(!dr)return;
  var fv=S.focus?vis(S.focus):null;
  if(!fv){
    S.focus=null;
    if(dr.classList.contains('open')){
      dr.classList.remove('open');dr.inert=true;
      // Back to the card that opened it.
      var c=drawerFrom&&document.querySelector('[data-a="focus"][data-id="'+drawerFrom+'"]');if(c)c.focus();
    }
    return;
  }
  var html;
  try{html=visitDetail(fv);}
  catch(e){
    // Show the problem instead of silently doing nothing.
    console.error('Could not open visit',fv,e);
    html='<p class="err" role="alert">Could not open this visit: '+esc((e&&e.message)||String(e))+'</p>';
  }
  $('dr-title').textContent=siteName(fv)||'Visit';
  $('drawer-body').innerHTML=html;
  if(!dr.classList.contains('open')){
    drawerFrom=fv.id;dr.inert=false;dr.classList.add('open');
    $('drawer-body').scrollTop=0;
    var x=dr.querySelector('.dr-x');if(x)x.focus({preventScroll:true});
  }
}
function paintRight(){
  var sd=S.calDay||iso(0),one=curSite(),s=one?site(one):null,h='';
  var list=shown().filter(onCal).filter(function(v){return v.date===sd;}).sort(byDate);
  h+='<div class="head"><h1>'+(sd===iso(0)?'Today':dt(sd).toLocaleDateString('en-GB',{weekday:'long'}))+'</h1><p>'+dt(sd).toLocaleDateString('en-GB',{day:'numeric',month:'long'})+'</p>'+(list.length?'<span class="head-c">'+list.length+'</span>':'')+'</div>';
  if(S.msg&&!S.focus)h+='<p class="msg" role="status">'+esc(S.msg)+'</p>';
  if(s){
    var sv=S.visits.filter(function(v){return v.site===s.id&&isSvc(v);}),dn=sv.filter(function(v){return v.status==='done';}).length;
    var canSched=schedRule(s.id).ok;
    h+='<section class="sitecard"><div class="sc-t"><b>'+esc(s.name)+'</b><span>'+esc(s.client)+(s.city?' · '+esc(s.city):'')+'</span></div>'+
      '<div class="stats"><span><b>'+dn+'</b>done</span><span><b>'+(sv.length-dn)+'</b>open</span></div>'+
      '<div class="acts">'+(canSched?'<button type="button" class="btn go sm" data-a="opensched">Schedule month</button>':'')+'<button type="button" class="btn alt sm" data-a="openlodge">Log complaint</button></div></section>';
  }
  if(S.sched&&s)h+=schedPanel(s);
  if(S.lodge&&s)h+=lodgePanel(s);
  if(s){
    var oi=S.issues.filter(function(i){return i.site===s.id&&i.open;});
    h+=complaintsBox(s);
    if(oi.length)h+='<section class="issues"><h3>Open issues</h3><ul>'+oi.map(function(i){return '<li><span>'+esc(i.text)+'</span><button type="button" class="btn alt sm" data-a="fixissue" data-id="'+i.id+'">Fixed</button></li>';}).join('')+'</ul></section>';
  }
  h+=list.length?list.map(function(v){return visitCard(v);}).join(''):'<p class="empty">Nothing scheduled</p>';
  $('main').innerHTML=h;
  if(S.sched&&s)updatePrev();
}
function schedPanel(s){
  var r=schedRule(s.id);
  if(!r.ok)return '<section class="panel"><h2>Not ready yet</h2><p class="note">Finish this month&rsquo;s visits first.'+(r.last?' Last one: '+fmtDay(r.last.date)+'.':'')+'</p><div class="row"><button type="button" class="btn alt sm" data-a="closepanel">Close</button></div></section>';
  return '<section class="panel" data-prev="1"><h2>Schedule month</h2>'+
    '<div class="grid">'+fld('Month','m-month','<input id="m-month" type="month" min="'+r.minM+'" value="'+r.minM+'">')+
    fld('Visits','m-n','<input id="m-n" type="number" min="1" max="8" value="'+s.per+'">','Contract: '+s.per+'/month')+
    fld('Time','m-time',sel('m-time',SLOTS,'10:00'))+'</div>'+
    '<div class="fld"><span class="lb">PCO</span>'+checks('m-crew',PEOPLE,s.sup?[s.sup]:[],true)+'</div>'+
    '<div class="prev" id="prev" aria-live="polite"></div>'+
    (S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'')+
    '<div class="row"><button type="button" class="btn go sm" data-a="makesched">Create visits</button><button type="button" class="btn alt sm" data-a="closepanel">Cancel</button></div></section>';
}
function schedTeam(){var s=site(curSite());return pcoPick('m-crew',s&&s.sup);}
function updatePrev(){
  var p=$('prev');if(!p)return;
  var r=schedRule(curSite());if(!r.ok)return;
  var dates=monthDates(v$('m-month'),parseInt(v$('m-n'),10)||0,r.after,r.minM),time=v$('m-time');
  if(!dates.length){p.innerHTML='<span class="bad">No free days. Pick '+monthName(r.minM)+' or later.</span>';return;}
  p.innerHTML=dates.map(function(d){return '<span>'+fmtDay(d)+' · '+esc(time)+'</span>';}).join('');
}
function lodgePanel(s){
  return '<section class="panel"><h2>Log complaint</h2>'+
    fld('Details','l-text','<textarea id="l-text" placeholder="What did the client report?"></textarea>')+
    fld('Priority','l-sev',sel('l-sev',['Low','Medium','High'],'Medium'))+
    '<p class="note">Admin decides the next step.</p>'+
    (S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'')+
    '<div class="row"><button type="button" class="btn go sm" data-a="makelodge">Send to Admin</button><button type="button" class="btn alt sm" data-a="closepanel">Cancel</button></div></section>';
}
function complaintsBox(s){
  var cs=S.complaints.filter(function(c){return c.site_id===s.id&&(c.status==='open'||c.status==='in_progress');});
  if(!cs.length)return '';
  var DEC={revisit:'Revisit sent',inspection:'Inspection sent',meeting:'Meeting sent'};
  return '<section class="issues"><h3>Complaints</h3><ul>'+cs.map(function(c){
    return '<li><span>'+esc(c.description)+'</span>'+badge(c.status==='open'?'With Admin':(DEC[c.decision]||'In progress'),c.status==='open'?'amber':'gray')+'</li>';
  }).join('')+'</ul></section>';
}
function render(){
  $('today').textContent=dt(iso(0)).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  if(!S.ready){
    $('side').innerHTML='';$('center').innerHTML='';
    $('main').innerHTML=S.loadErr?'<p class="err" role="alert">Could not load operations data: '+esc(S.loadErr)+'. Check that ops.sql was run and "ops" is in Supabase → Settings → API → Exposed schemas.</p>':'<p class="empty">Loading…</p>';
    return;
  }
  paintSide();paintCal();paintRight();paintDrawer();
  loadThumbs();
  syncLeads();
  save();
}
// The open visit (S.focus) stays open after a save; its tab resets to fit the new status.
function clear(){S.edit=null;S.rep=null;S.ftab=null;S.sched=false;S.lodge=false;S.err='';}
function go(msg){S.msg=msg||'';S.err='';render();}
var lastEl=null;
function bad(m){
  var row=lastEl&&lastEl.closest?lastEl.closest('.row'):null;
  if(row&&row.parentNode){
    var kids=row.parentNode.children;
    for(var i=kids.length-1;i>=0;i--){if(kids[i].className==='err')kids[i].remove();}
    var p=document.createElement('p');p.className='err';p.setAttribute('role','alert');p.textContent=m;
    row.parentNode.insertBefore(p,row);
    if(p.scrollIntoView)p.scrollIntoView({block:'nearest'});
  }else{S.err=m;render();}
  return false;
}

/* Runs a database change: disables the button, then reloads the data and shows the message.
   On error the message from the database is shown above the buttons. */
function act(el,work,msg){
  lastEl=el;
  var b=el&&el.tagName==='BUTTON'?el:null;if(b)b.disabled=true;
  return Promise.resolve().then(work).then(refresh).then(function(){
    clear();var m=typeof msg==='function'?msg():msg;go(m);
  }).catch(function(e){if(b)b.disabled=false;bad((e&&e.message)||String(e));});
}

/* actions */
var ACT={
  toggle:function(el){
    var id=el.dataset.id,i=S.sel.indexOf(id);
    if(el.checked&&i<0)S.sel.push(id);
    if(!el.checked&&i>-1)S.sel.splice(i,1);
    clear();S.msg='';render();refocus('toggle',id);
  },
  ttype:function(el){
    var k=el.dataset.id,t=S.types=(S.types||[]).filter(function(x){return x!==k;});
    if(el.checked)t.push(k);
    clear();S.msg='';render();refocus('ttype',k);
  },
  cleartypes:function(){S.types=[];clear();S.msg='';render();},
  tcomp:function(el){
    var c=companies().filter(function(x){return x.name===el.dataset.id;})[0];if(!c)return;
    c.sites.forEach(function(x){
      var i=S.sel.indexOf(x.id);
      if(el.checked&&i<0)S.sel.push(x.id);
      if(!el.checked&&i>-1)S.sel.splice(i,1);
    });
    clear();S.msg='';render();refocus('tcomp',c.name);
  },
  assign:function(el){
    // Called from the Assign PCO panel of a visit Admin sent (day and time are Admin's).
    var v=vis(el.dataset.id),x=site(v.site),team=pcoPick('e-crew',v.pco||(x&&x.sup)),p=team[0],box=$('e-all');
    if(!staffId(p))return bad('Tick at least one PCO.');
    var crew=staffIds(team.slice(1));
    // one PCO for every waiting visit of the same new contract, in day order
    var list=[v].concat(box&&box.checked?waitingSame(v):[]).sort(byDate);
    act(el,function(){
      return list.reduce(function(chain,q){return chain.then(function(){return rpc('assign_pco',{p_visit_id:q.id,p_pco_id:staffId(p),p_crew_ids:crew});});},Promise.resolve());
    },function(){
      reveal(v.site,v.date);S.filter='all';
      if(list.length>1)return p+' assigned to '+list.length+' visits at '+x.name+'.';
      return p+' assigned · '+x.name+', '+fmtDay(v.date)+'.';
    });
  },
  selall:function(){S.sel=live().map(function(x){return x.id;}).concat(['lead']);clear();S.msg='';render();},
  selnone:function(){S.sel=[];clear();S.msg='';render();},
  scope:function(el){S.scope=el.dataset.s;clear();S.msg='';render();},
  filter:function(el){S.filter=el.dataset.f;render();},
  opensched:function(){clear();S.sched=!!curSite()&&schedRule(curSite()).ok;S.msg='';render();},
  openlodge:function(){clear();S.lodge=!!curSite();S.msg='';render();},
  closepanel:function(){clear();S.focus=null;go('');},
  focus:function(el){clear();S.focus=el.dataset.id;S.msg='';render();},
  unfocus:function(){clear();S.focus=null;S.msg='';render();},
  ftab:function(el){S.ftab=el.dataset.t;S.err='';render();},
  edit:function(el){clear();S.edit=el.dataset.id;S.msg='';render();},
  openrep:function(el){clear();S.rep=el.dataset.id;S.msg='';render();},
  calday:function(el){clear();S.focus=null;S.scope='day';S.calDay=el.dataset.d;S.calMonth=el.dataset.d.slice(0,7);S.msg='';render();},
  calnav:function(el){
    var n=parseInt(el.dataset.n,10),v=S.cview||'month',sd=S.calDay||iso(0),x;
    clear();S.msg='';
    if(n===0){S.calDay=iso(0);S.calMonth=iso(0).slice(0,7);return render();}
    if(v==='week'||v==='day'){x=dt(sd);x.setDate(x.getDate()+n*(v==='week'?7:1));S.calDay=ymd(x);S.calMonth=S.calDay.slice(0,7);return render();}
    var cm=(S.calMonth||iso(0).slice(0,7)).split('-');
    x=new Date(+cm[0],+cm[1]-1+n,1);
    S.calMonth=x.getFullYear()+'-'+pad(x.getMonth()+1);
    S.calDay=S.calMonth===iso(0).slice(0,7)?iso(0):S.calMonth+'-01';
    render();
  },
  cview:function(el){S.cview=el.dataset.v;clear();S.msg='';if(S.cview==='day')S.scope='day';render();},
  togglerep:function(el){S.open[el.dataset.id]=!S.open[el.dataset.id];render();},
  addfnd:function(){
    var c=$('x-fnd');if(!c)return;
    c.insertAdjacentHTML('beforeend',findingRow());
    var last=c.lastElementChild;if(!last)return;
    last.querySelector('.fnd-t').textContent='Finding '+c.children.length;
    var inp=last.querySelector('[data-fnd-in]');if(inp)inp.focus();
  },
  rmupload:function(el){
    var inp=$(el.dataset.id);if(!inp)return;
    inp.value='';showUpload(inp);inp.focus();
  },
  rmfnd:function(el){
    var r=el.closest('.fnd');if(!r)return;
    var n=r.getAttribute('data-fnd');
    (FND[n]||[]).forEach(function(x){URL.revokeObjectURL(x.src);});delete FND[n];
    var add=document.querySelector('[data-a="addfnd"]');r.remove();if(add)add.focus();
    // Keep the visible numbers in order (the error messages count the same way).
    document.querySelectorAll('#x-fnd .fnd-t').forEach(function(l,i){l.textContent='Finding '+(i+1);});
  },
  rmfndph:function(el){
    var n=el.dataset.n,i=+el.dataset.i,list=FND[n]||[];
    if(list[i]){URL.revokeObjectURL(list[i].src);list.splice(i,1);}
    renderFindingPhotos(n);
    var inp=$('f-'+n);if(inp)inp.focus();else{var t=document.querySelector('.fnd[data-fnd="'+n+'"] .ft-v');if(t)t.focus();}
  },
  fixissue:function(el){act(el,function(){return rpc('fix_issue',{p_issue_id:el.dataset.id});},'Issue fixed.');},
  // A stored file: photos open in the viewer, PDFs in a new tab.
  viewfile:function(el){
    var path=el.dataset.path,label=el.dataset.label||'';
    if(isPdf(path))return ACT.openfile(el);
    signLinks([path]).then(function(){var u=linkOf(path);if(u)openViewer(u,label,el);})
      .catch(function(e){lastEl=el;bad((e&&e.message)||String(e));});
  },
  // A file chosen in a form, before upload.
  viewlocal:function(el){
    if(el.dataset.type==='application/pdf'){window.open(el.dataset.src,'_blank');return;}
    openViewer(el.dataset.src,el.dataset.label||'',el);
  },
  closeview:function(){closeViewer();},
  openfile:function(el){
    var w=window.open('','_blank');
    supabase.storage.from('ops-files').createSignedUrl(el.dataset.path,300).then(function(r){
      if(r.error){if(w)w.close();lastEl=el;return bad(r.error.message);}
      if(w)w.location.href=r.data.signedUrl;else window.location.href=r.data.signedUrl;
    });
  },

  makesched:function(el){
    var s=site(curSite()),r=schedRule(s.id),team=schedTeam(),time=v$('m-time');
    if(!r.ok)return bad('You can schedule the next month only after every visit of this month is done.');
    var dates=monthDates(v$('m-month'),parseInt(v$('m-n'),10)||0,r.after,r.minM);
    if(!dates.length)return bad('No days available. Pick '+monthName(r.minM)+' or a later month.');
    if(!staffId(team[0]))return bad('Tick at least one PCO.');
    act(el,function(){return rpc('schedule_month',{p_site_id:s.id,p_dates:dates,p_time:time,p_pco_id:staffId(team[0]),p_crew_ids:staffIds(team.slice(1))});},function(){
      reveal(s.id,dates[0]);S.filter='all';
      return dates.length+(dates.length===1?' visit':' visits')+' scheduled · '+s.name+'.';
    });
  },
  makelodge:function(el){
    var s=site(curSite()),txt=v$('l-text'),sev=v$('l-sev');
    if(!txt)return bad('Please write what the client complained about.');
    act(el,function(){return rpc('lodge_complaint',{p_site_id:s.id,p_description:txt,p_severity:sev});},
      'Complaint sent to Admin.');
  },
  etab:function(el){
    var f=el.closest('.form');
    f.querySelectorAll('.etp').forEach(function(p){p.style.display=p.dataset.p===el.dataset.t?'':'none';});
    f.querySelectorAll('[data-a="etab"]').forEach(function(b){b.setAttribute('aria-selected',b===el?'true':'false');});
  },
  saveedit:function(el){
    var v=vis(el.dataset.id),mode=el.dataset.mode||'pco',meet=isOps(v),was=v.status,needs=needsDay(v);
    if(v.status==='toassign'&&v.fixed)return ACT.assign(el);
    var d=v.date,t=v.time,lead=v.pco,crew=v.crew||[],dateMode=mode==='date'||needs,pcoMode=mode==='pco'||needs;
    if(dateMode){d=v$('e-date');t=v$('e-time');if(!d)return bad('Please pick the day.');}
    if(pcoMode){
      if(meet){lead='';crew=picked('e-crew');}
      else{var tm=pcoPick('e-crew',v.pco);lead=tm[0]||'';crew=tm.slice(1);if(!staffId(lead))return bad('Tick at least one PCO.');}
    }
    var why=v$('e-why')||'Rescheduled',wnote=v$('e-wnote'),sup=meet?null:staffId(lead),crewIds=staffIds(crew);
    var work=needs
      ?function(){return rpc('reschedule',{p_visit_id:v.id,p_date:d,p_time:t,p_reason:why,p_note:wnote,p_set_team:true,p_pco_id:sup,p_crew_ids:crewIds});}
      :mode==='date'
        ?function(){return rpc('reschedule',{p_visit_id:v.id,p_date:d,p_time:t,p_reason:why,p_note:wnote});}
        :function(){return rpc('set_team',{p_visit_id:v.id,p_pco_id:sup,p_crew_ids:crewIds});};
    act(el,work,function(){
      reveal(v.site,d);
      return (was==='toassign'?'Assigned':(mode==='pco'&&!needs?'Team updated':'Rescheduled'))+' · '+siteName(v)+', '+fmtDay(d)+' '+t+'.';
    });
  },
  /* Close out in one step. A scheduled visit is started first (the database only closes started
     visits). Outcome is Completed, the team is the visit's PCO plus team, the challan date
     is today. Challan number and signed challan are required. Findings are optional; each one
     needs 1–2 photos and a note. Its note becomes a site issue, and its photos are stored under
     findings/<n>/ so they stay tied to that finding. */
  submitclose:function(el){
    var v=vis(el.dataset.id);
    var chNo=v$('r-chno'),chFile=filesOf('p-challan'),notes=v$('r-notes');
    if(!chNo)return bad('Enter the challan number.');
    if(!chFile.length)return bad('Upload the signed challan.');
    var finds=[],rows=document.querySelectorAll('#x-fnd .fnd');
    for(var i=0;i<rows.length;i++){
      var r=rows[i],ph=(FND[r.getAttribute('data-fnd')]||[]).map(function(x){return x.file;}),nt=String(r.querySelector('.fnd-note').value).trim();
      if(!ph.length&&!nt)continue; // empty row: ignored
      if(!ph.length)return bad('Add 1–2 photos to finding '+(i+1)+'.');
      if(ph.length>2)return bad('Finding '+(i+1)+' takes at most 2 photos.');
      if(!nt)return bad('Write a note for finding '+(i+1)+'.');
      finds.push({note:nt,photos:ph});
    }
    var teamIds=staffIds(teamOf(v).filter(function(x,j,a){return a.indexOf(x)===j;}));
    if(!teamIds.length)return bad('Assign a PCO to this visit first.');
    var work=function(){
      var start=v.status==='scheduled'?rpc('start_visit',{p_visit_id:v.id,p_before_photos:[]}):Promise.resolve();
      return start.then(function(){
        return Promise.all([upload(v.id,'challan',chFile.slice(0,1))].concat(finds.map(function(f,k){return upload(v.id,'findings/'+(k+1),f.photos);})));
      }).then(function(p){
        var photos=[].concat.apply([],p.slice(1));
        return rpc('submit_service_report',{p_visit_id:v.id,p_outcome:'completed',p_team_ids:teamIds,p_items:[],p_extras:[],
          p_findings:finds.map(function(f){return f.note;}),p_notes:notes,
          p_found_photos:photos,p_after_photos:[],p_challan_no:chNo,p_challan_date:iso(0),p_challan_file:p[0][0]});
      });
    };
    act(el,work,function(){S.open[v.id]=true;return 'Report submitted.';});
  },
  submitsimple:function(el){
    var v=vis(el.dataset.id),meet=v.type==='meeting',work;
    if(meet){
      var w=v$('r-with'),o=v$('r-outcome'),n=v$('r-notes');
      if(!w)return bad('Please write who joined the meeting.');
      work=function(){return rpc('submit_meeting_report',{p_visit_id:v.id,p_joined:w,p_outcome:o,p_notes:n});};
    }else{
      var a=v$('r-activity'),rc=v$('r-rec'),ar=v$('r-areas'),n2=v$('r-notes');
      if(!ar)return bad('Please write which areas were checked.');
      work=function(){return rpc('submit_inspection_report',{p_visit_id:v.id,p_activity:a,p_advice:rc,p_areas:ar,p_notes:n2});};
    }
    act(el,work,function(){
      S.open[v.id]=true;
      return 'Report saved.';
    });
  },
};

function onClick(e){
  var el=e.target.closest('[data-a]');if(!el)return;
  lastEl=el;
  var f=ACT[el.dataset.a];if(f)f(el);
}
function onInput(e){
  var t=e.target;
  if(t.closest&&t.closest('[data-prev]'))updatePrev();
}
function onKeydown(e){
  var t=e.target;
  if(e.key==='Escape'&&closeViewer()){e.preventDefault();return;}
  if(e.key==='Escape'&&S.focus){e.preventDefault();ACT.unfocus();return;}
  if((e.key==='Enter'||e.key===' ')&&t&&t.getAttribute&&t.getAttribute('role')==='button'&&t.dataset&&t.dataset.a){e.preventDefault();t.click();}
}
function onChange(e){
  var t=e.target;
  if(LEADS[t.id])syncLead(t.id);
  if(t.id==='cal-f'){S.filter=t.value;clear();render();return;}
  if(t.closest&&t.closest('[data-prev]'))updatePrev();
  if(t.hasAttribute&&t.hasAttribute('data-fnd-in')){addFindingPhotos(t.getAttribute('data-fnd-in'),t.files);t.value='';return;}
  if(t.classList&&t.classList.contains('dz-in')){showUpload(t);return;}
  if(t.type==='file'){var n=$(t.id+'-n');if(n){var names=fileNames(t.id);n.textContent=names.length?names.join(', '):'None yet';}}
}
/* Drag and drop onto an upload box. A finding box takes its photos (up to 2); the challan box takes the
   first file if its type is accepted. */
function dzOf(e){return e.target&&e.target.closest?e.target.closest('.dz,.fnd'):null;}
function onDragOver(e){var z=dzOf(e);if(!z)return;e.preventDefault();z.classList.add('over');}
function onDragLeave(e){var z=dzOf(e);if(z&&!z.contains(e.relatedTarget))z.classList.remove('over');}
function onDrop(e){
  var z=dzOf(e);if(!z)return;
  e.preventDefault();z.classList.remove('over');
  var all=e.dataTransfer&&e.dataTransfer.files,f=all&&all[0];if(!f)return;
  // A finding card takes its photos even when its tiles are full (then it says so).
  if(z.classList.contains('fnd'))return addFindingPhotos(z.getAttribute('data-fnd'),all);
  var inp=z.querySelector('.dz-in');if(!inp)return;
  if(!(/^image\//.test(f.type)||f.type==='application/pdf')){
    var form=z.closest('.form');lastEl=form&&form.querySelector('[data-a="submitclose"]');
    return bad('Use a JPEG, PNG or PDF file.');
  }
  var dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;
  inp.dispatchEvent(new Event('change',{bubbles:true}));
}
document.addEventListener('click',onClick);
document.addEventListener('input',onInput);
document.addEventListener('keydown',onKeydown);
document.addEventListener('change',onChange);
document.addEventListener('dragover',onDragOver);
document.addEventListener('dragleave',onDragLeave);
document.addEventListener('drop',onDrop);
render();
refresh().then(render);

/* Live updates: when Admin sends something (or another screen changes data), reload.
   If a form is open, the new data shows when it closes so typing is not lost. */
var rt=null;
var channel=supabase.channel('ops-planner').on('postgres_changes',{event:'*',schema:'ops'},function(){
  clearTimeout(rt);
  rt=setTimeout(function(){refresh().then(function(){if(!(S.focus||S.edit||S.rep||S.sched||S.lodge))render();});},400);
}).subscribe();

return function unmount(){
  clearTimeout(rt);
  supabase.removeChannel(channel);
  document.removeEventListener('click',onClick);
  document.removeEventListener('input',onInput);
  document.removeEventListener('keydown',onKeydown);
  document.removeEventListener('change',onChange);
  document.removeEventListener('dragover',onDragOver);
  document.removeEventListener('dragleave',onDragLeave);
  document.removeEventListener('drop',onDrop);
};
}
