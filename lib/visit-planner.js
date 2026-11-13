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
var UNITS=['g (grams)','kg','ml','litres','bait stations'];
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
      if((x=svc[v.id]))rep={by:staffName(v.pco_id)||x.submitted_by_name,team:(x.team_ids||[]).map(staffName).filter(Boolean),outcome:x.outcome,
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
function fileBase(p){return String(p||'').split('/').pop().replace(/^\d+-\d+-/,'');}

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
var LEADS={'e-pco':'e-crew','m-lead':'m-crew','l-pco':'l-crew'};
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
function fileBox(id,lab,text,accept,multi){
  return '<div class="fld"><span class="lb">'+lab+'</span><div class="file"><span class="btn alt sm">'+text+'</span><input id="'+id+'" type="file" accept="'+accept+'"'+(multi?' multiple':'')+' aria-label="'+esc(lab)+'"></div><span class="fnames" id="'+id+'-n">None yet</span></div>';
}
function fileNames(id){var e=$(id);return e&&e.files?Array.prototype.map.call(e.files,function(f){return f.name;}):[];}
function rowHtml(k){
  var rm='<button type="button" class="rm" data-a="rmrow" aria-label="Remove row">&times;</button>';
  if(k==='item')return '<div class="rowx" data-row="item"><input type="text" data-f="n" placeholder="Item" aria-label="Product or item name"><input type="number" min="0" step="any" data-f="q" placeholder="Qty" aria-label="Quantity"><select data-f="u" aria-label="Unit">'+UNITS.map(function(u){return '<option>'+u+'</option>';}).join('')+'</select>'+rm+'</div>';
  if(k==='extra')return '<div class="rowx two" data-row="extra"><input type="text" data-f="d" placeholder="Work done" aria-label="Extra work"><input type="number" min="0" data-f="c" placeholder="PKR, pre-tax" aria-label="Charge before tax">'+rm+'</div>';
  return '<div class="rowx one" data-row="find"><input type="text" data-f="t" placeholder="Finding" aria-label="Finding">'+rm+'</div>';
}
function rowsOf(id){
  return Array.prototype.map.call(document.querySelectorAll('#'+id+' .rowx'),function(r){
    var o={};Array.prototype.forEach.call(r.querySelectorAll('[data-f]'),function(i){o[i.dataset.f]=String(i.value).trim();});return o;
  });
}

/* visit cards */
function reportRows(v){
  var r=v.report;if(!r)return [];
  var by=[isOps(v)?'Written by':'Submitted by',(isOps(v)?'':'PCO ')+r.by+' on '+fmtDay(r.at)];
  if(v.type==='meeting')return [by,['Who joined',r.with],['How it went',r.outcome],['Notes',r.notes||'None']];
  if(v.type==='inspection')return [by,['Pest activity',r.activity],['Advice',r.rec],['Areas checked',r.areas],['Notes',r.notes||'None'],['Filed under',v.site?'Site inspection report, '+siteName(v):'Not a client yet. Kept here only.']];
  var rows=[['Job',v.job],by,['What happened',OUT[r.outcome]],['Who did the work',r.team.join(', ')]];
  if(r.items&&r.items.length)rows.push(['Items used',r.items.map(function(i){return i.n+' '+i.q+' '+i.u;}).join('; ')]);
  rows.push(['Extra treatment',r.extras&&r.extras.length?r.extras.map(function(x){return x.d+' ('+money(x.c)+' before tax)';}).join('; '):'None']);
  rows.push(['New findings',r.finds&&r.finds.length?r.finds.join('; '):'None']);
  rows.push(['Notes',r.notes||'None']);
  if(r.challan)rows.push(['Signed challan',r.challan.no+', dated '+fmtLong(r.challan.date)+' · '+fileBase(r.challan.file)]);
  if(r.photos)rows.push(['Photos','Before '+r.photos.before.length+', findings '+r.photos.found.length+', after '+r.photos.after.length]);
  return rows;
}
function reportBox(v){
  var r=v.report,files=[];
  if(r.challan&&r.challan.file)files.push(['Signed challan',r.challan.file]);
  if(r.photos)[['Before',r.photos.before],['Finding',r.photos.found],['After',r.photos.after]].forEach(function(g){(g[1]||[]).forEach(function(p,i){files.push([g[0]+' photo '+(i+1),p]);});});
  var fb=files.length?'<div class="files">'+files.map(function(f){return '<button type="button" class="btn alt sm" data-a="openfile" data-path="'+esc(f[1])+'">'+esc(f[0])+'</button>';}).join('')+'</div>':'';
  return '<div class="rep"><h4>'+(v.type==='meeting'?'Meeting report':v.type==='inspection'?'Inspection report':'Service report')+'</h4><dl class="kv">'+reportRows(v).map(function(x){return '<dt>'+esc(x[0])+'</dt><dd>'+esc(x[1])+'</dd>';}).join('')+'</dl>'+fb+'</div>';
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
  var svc=isSvc(v),meet=isOps(v);
  return (meet?'':fld(svc?'Lead PCO':'PCO','e-pco',sel('e-pco',PEOPLE,v.pco||(v.site?site(v.site).sup:PEOPLE[0]))))+
    (svc||meet?(PEOPLE.length?'<div class="fld"><span class="lb">'+(meet?'Joining you':'Team')+'</span>'+checks('e-crew',PEOPLE,v.crew,true)+'</div>':''):'');
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
  var why=live?'<div class="grid">'+fld('Reason','e-why',sel('e-why',['Not done','Client blocked access','Issue on site','PCO unavailable','Client asked for another day','Other'],missedOf(v)?'Not done':'Client asked for another day'))+fld('Note','e-wnote','<input id="e-wnote" type="text" placeholder="Optional">')+'</div>':'';
  // A visit that needs a day also needs its team, so both are saved together.
  return '<div class="form">'+why+
    '<div class="grid">'+fld('New day','e-date','<input id="e-date" type="date" min="'+iso(0)+'" value="'+dflt+'">')+fld('Time','e-time',sel('e-time',SLOTS,v.time||'10:00'))+'</div>'+
    (needs?pcoFields(v):'')+
    '<div class="row"><button type="button" class="btn go sm" data-a="saveedit" data-mode="date" data-id="'+v.id+'">'+(needs?'Save':'Reschedule')+'</button></div></div>';
}
function visitTabs(v){
  var meet=isOps(v);
  if(v.status==='toassign'&&v.fixed)return [['pco','PCO']];
  if(needsDay(v))return [['date','Reschedule']];
  if(v.status==='scheduled')return [['pco',meet?'People':'PCO'],['date','Reschedule'],['work',isSvc(v)?'Start visit':'Report']];
  if(v.status==='started')return [['work','Close out'],['date','Reschedule'],['pco','PCO']];
  return v.report?[['report','Report']]:[];
}
function visitDetail(v){
  var tabs=visitTabs(v),keys=tabs.map(function(t){return t[0];});
  var cur=keys.indexOf(S.ftab)>-1?S.ftab:(missedOf(v)&&keys.indexOf('date')>-1?'date':keys[0]);
  var x=v.site?site(v.site):null,rows=[];
  if(v.job)rows.push(['Job',esc(v.job)]);
  rows.push(['Date',fmtDay(v.date)+(v.time?' · '+esc(v.time):'')]);
  rows.push(['Site',x?esc(x.name)+', '+esc(x.client)+(x.city?' · '+esc(x.city):''):esc(v.prospect)+' · not a client yet']);
  var team=teamOf(v);
  if(isOps(v))rows.push(['With','You'+(v.crew.length?', '+v.crew.map(esc).join(', '):'')+(v.guests?' · '+esc(v.guests):'')]);
  else if(team.length)rows.push(['Team',team.map(esc).join(', ')]);
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
  var head='<h3>'+(v.status==='started'?'Close out':'Start visit')+'</h3><p class="sub">'+esc(v.job)+' · '+esc(s.name)+'</p>';
  if(v.status==='scheduled'){
    return '<div class="form">'+head+
      '<div class="fld"><span class="lb">Team checks</span>'+
      '<div class="chks"><label class="chk"><input type="checkbox" name="s-ck" value="uniform"><span>In uniform</span></label>'+
      '<label class="chk"><input type="checkbox" name="s-ck" value="gear"><span>Safety gear checked</span></label>'+
      '<label class="chk"><input type="checkbox" name="s-ck" value="chem"><span>Chemicals issued and logged</span></label></div></div>'+
      fileBox('p-before','Before photos','Add photos','image/*',true)+err+
      '<div class="row"><button type="button" class="btn go sm" data-a="startvisit" data-id="'+v.id+'">Start visit</button>'+cancel+'</div></div>';
  }
  var open=S.issues.filter(function(i){return i.site===v.site&&i.open;});
  var team=['PCO: '+v.pco].concat(v.crew.map(function(c){return c;}));
  return '<div class="form">'+head+
    '<div class="fld"><span class="lb">Outcome</span><div class="radios" role="radiogroup">'+
      [['completed','Completed'],['partial','Partial'],['blocked','Client blocked'],['postponed','Postponed']].map(function(o,i){
        return '<label class="rad"><input type="radio" name="r-out" value="'+o[0]+'"'+(i===0?' checked':'')+'><span>'+o[1]+'</span></label>';
      }).join('')+'</div></div>'+
    '<div class="fld"><span class="lb">Team</span>'+checks('r-team',team,[])+'</div>'+
    '<div class="fld"><span class="lb">Items used</span><div class="rows" id="x-items">'+rowHtml('item')+'</div><div><button type="button" class="btn alt sm" data-a="addrow" data-k="item" data-to="x-items">Add item</button></div></div>'+
    '<div class="fld"><span class="lb">Extra work (billed)</span><div class="rows" id="x-extras"></div><div><button type="button" class="btn alt sm" data-a="addrow" data-k="extra" data-to="x-extras">Add extra</button></div></div>'+
    '<div class="fld"><span class="lb">Findings</span>'+(open.length?'<ul class="marks">'+open.map(function(i){return '<li>'+esc(i.text)+'</li>';}).join('')+'</ul>':'')+
      '<div class="rows" id="x-finds"></div><div><button type="button" class="btn alt sm" data-a="addrow" data-k="find" data-to="x-finds">Add finding</button></div></div>'+
    ta+
    '<div class="grid">'+fileBox('p-found','Finding photos','Add photos','image/*',true)+fileBox('p-after','After photos','Add photos','image/*',true)+'</div>'+
    '<div class="fld"><span class="lb">Signed challan</span><div class="grid">'+fld('Number','r-chno','<input id="r-chno" type="text" placeholder="CH-0000">')+fld('Date','r-chdate','<input id="r-chdate" type="date" value="'+iso(0)+'">')+'</div></div>'+
    fileBox('p-challan','Challan copy','Upload','image/*,application/pdf',false)+
    '<p class="note">Items and signed challan are required for Completed or Partial.</p>'+err+
    '<div class="row"><button type="button" class="btn go sm" data-a="submitclose" data-id="'+v.id+'">Submit report</button>'+cancel+'</div></div>';
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
    fld('Time','m-time',sel('m-time',SLOTS,'10:00'))+fld('Lead PCO','m-lead',sel('m-lead',PEOPLE,s.sup))+'</div>'+
    '<div class="fld"><span class="lb">Team</span>'+checks('m-crew',PEOPLE,[],true)+'</div>'+
    '<div class="prev" id="prev" aria-live="polite"></div>'+
    (S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'')+
    '<div class="row"><button type="button" class="btn go sm" data-a="makesched">Create visits</button><button type="button" class="btn alt sm" data-a="closepanel">Cancel</button></div></section>';
}
function schedTeam(){var lead=v$('m-lead');return [lead].concat(picked('m-crew').filter(function(c){return c!==lead;}));}
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
    var v=vis(el.dataset.id),x=site(v.site),p=v$('e-pco'),box=$('e-all');
    if(!staffId(p))return bad('Pick the PCO.');
    var crew=staffIds(picked('e-crew').filter(function(c){return c!==p;}));
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
  fixissue:function(el){act(el,function(){return rpc('fix_issue',{p_issue_id:el.dataset.id});},'Issue fixed.');},
  openfile:function(el){
    var w=window.open('','_blank');
    supabase.storage.from('ops-files').createSignedUrl(el.dataset.path,300).then(function(r){
      if(r.error){if(w)w.close();lastEl=el;return bad(r.error.message);}
      if(w)w.location.href=r.data.signedUrl;else window.location.href=r.data.signedUrl;
    });
  },
  addrow:function(el){var c=$(el.dataset.to);if(c)c.insertAdjacentHTML('beforeend',rowHtml(el.dataset.k));},
  rmrow:function(el){var r=el.closest('.rowx');if(r)r.remove();},

  makesched:function(el){
    var s=site(curSite()),r=schedRule(s.id),team=schedTeam(),time=v$('m-time');
    if(!r.ok)return bad('You can schedule the next month only after every visit of this month is done.');
    var dates=monthDates(v$('m-month'),parseInt(v$('m-n'),10)||0,r.after,r.minM);
    if(!dates.length)return bad('No days available. Pick '+monthName(r.minM)+' or a later month.');
    if(!staffId(team[0]))return bad('Pick the PCO.');
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
      lead=meet?'':v$('e-pco');
      var cr=picked('e-crew');
      crew=meet?cr:cr.filter(function(c){return c!==lead;});
      if(!meet&&!staffId(lead))return bad('Pick the PCO.');
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
  startvisit:function(el){
    var v=vis(el.dataset.id);
    if(picked('s-ck').length<3)return bad('Please tick all three checks for the whole team before starting.');
    var before=filesOf('p-before');
    act(el,function(){return upload(v.id,'before',before).then(function(paths){return rpc('start_visit',{p_visit_id:v.id,p_before_photos:paths});});},
      'Visit started.');
  },
  submitclose:function(el){
    var v=vis(el.dataset.id),outEl=document.querySelector('input[name="r-out"]:checked'),out=outEl?outEl.value:'completed';
    var team=picked('r-team');
    if(!team.length)return bad('Please tick who did the work.');
    var full=out==='completed'||out==='partial';
    var items=rowsOf('x-items').filter(function(i){return i.n;}).map(function(i){return {name:i.n,qty:parseFloat(i.q)||0,unit:i.u};});
    var extras=rowsOf('x-extras').filter(function(x){return x.d;}).map(function(x){return {work:x.d,charge:parseFloat(x.c)||0};});
    var finds=rowsOf('x-finds').filter(function(f){return f.t;}).map(function(f){return f.t;});
    if(full&&!items.length)return bad('Add at least one item or product used.');
    if(full&&items.some(function(i){return i.qty<=0;}))return bad('Enter the quantity for every item.');
    var chNo=v$('r-chno'),chDate=v$('r-chdate'),chFile=filesOf('p-challan'),found=filesOf('p-found'),after=filesOf('p-after'),notes=v$('r-notes');
    if(full){
      if(!chNo)return bad('Enter the physical challan number. It is mandatory.');
      if(!chDate)return bad('Enter the challan date.');
      if(!chFile.length)return bad('Upload the signed challan picture or document. It is mandatory.');
    }
    var names=team.map(function(t){return t.indexOf('PCO: ')===0?t.slice(5):t;});
    var teamIds=staffIds(names.filter(function(x,i){return names.indexOf(x)===i;}));
    if(!teamIds.length)return bad('Please tick who did the work.');
    var work=function(){
      if(!full)return rpc('submit_service_report',{p_visit_id:v.id,p_outcome:out,p_team_ids:teamIds,p_items:[],p_extras:[],p_findings:[],p_notes:notes,p_found_photos:[],p_after_photos:[],p_challan_no:null,p_challan_date:null,p_challan_file:null});
      return Promise.all([upload(v.id,'challan',chFile.slice(0,1)),upload(v.id,'findings',found),upload(v.id,'after',after)]).then(function(p){
        return rpc('submit_service_report',{p_visit_id:v.id,p_outcome:out,p_team_ids:teamIds,p_items:items,p_extras:extras,p_findings:finds,p_notes:notes,
          p_found_photos:p[1],p_after_photos:p[2],p_challan_no:chNo,p_challan_date:chDate,p_challan_file:p[0][0]});
      });
    };
    act(el,work,function(){
      if(!full)return OUT[out]+' · visit needs a new day.';
      S.open[v.id]=true;return 'Report submitted.';
    });
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
  if(e.key==='Escape'&&S.focus){e.preventDefault();ACT.unfocus();return;}
  if((e.key==='Enter'||e.key===' ')&&t&&t.getAttribute&&t.getAttribute('role')==='button'&&t.dataset&&t.dataset.a){e.preventDefault();t.click();}
}
function onChange(e){
  var t=e.target;
  if(LEADS[t.id])syncLead(t.id);
  if(t.id==='cal-f'){S.filter=t.value;clear();render();return;}
  if(t.closest&&t.closest('[data-prev]'))updatePrev();
  if(t.type==='file'){var n=$(t.id+'-n');if(n){var names=fileNames(t.id);n.textContent=names.length?names.join(', '):'None yet';}}
}
document.addEventListener('click',onClick);
document.addEventListener('input',onInput);
document.addEventListener('keydown',onKeydown);
document.addEventListener('change',onChange);
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
};
}
