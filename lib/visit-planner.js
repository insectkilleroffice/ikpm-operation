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
  if(v.type==='monthly')return 'Monthly visit';
  if(v.type==='contract')return 'New contract (from Admin)';
  if(v.type==='revisit')return 'Revisit (from complaint)';
  if(v.type==='meeting')return v.from==='Admin'?'Client meeting (from Admin)':'Client meeting';
  return v.from==='Admin'?'Site inspection (from Admin)':'Site inspection';
}

var SITES=[];    // from ops.sites + ops.clients
function isPending(x){return !!x.pending;}
function live(){return SITES.filter(function(x){return !isPending(x);});}
function site(id){return SITES.filter(function(s){return s.id===id;})[0];}
function place(s){return esc(s.name)+', '+esc(s.client)+(s.city?' · '+esc(s.city):'');}

function siteName(v){return v.site?site(v.site).name:v.prospect;}
function whereOf(v){return v.site?place(site(v.site)):esc(v.prospect)+' · not a client yet';}

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
    rows(db.from('sites').select('id,client_id,name,city,visits_per_month,supervisor_id,status')),
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
      return {id:s.id,client:cl[s.client_id]||'',name:s.name,city:s.city||'',per:s.visits_per_month,sup:staffName(s.supervisor_id)||PEOPLE[0]||'',pending:s.status==='pending'};
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
      if((x=svc[v.id]))rep={by:staffName(v.supervisor_id)||x.submitted_by_name,team:(x.team_ids||[]).map(staffName).filter(Boolean),outcome:x.outcome,
        items:(x.items||[]).map(function(i){return {n:i.name,q:i.qty,u:i.unit};}),extras:(x.extras||[]).map(function(e){return {d:e.work,c:Number(e.charge)||0};}),
        notes:x.notes||'',finds:x.findings||[],photos:{before:v.before_photos||[],found:x.found_photos||[],after:x.after_photos||[]},
        challan:{no:x.challan_no,date:x.challan_date,file:x.challan_file},at:day(x.submitted_at)};
      else if((x=meet[v.id]))rep={by:x.written_by_name,with:x.joined,outcome:x.outcome,notes:x.notes||'',at:day(x.written_at)};
      else if((x=insp[v.id]))rep={by:x.written_by_name,activity:x.activity,rec:x.advice,areas:x.areas,notes:x.notes||'',at:day(x.written_at)};
      return {id:v.id,site:v.site_id,type:v.kind,date:v.visit_date,fixed:v.status==='needs_pco',time:v.visit_time,
        pco:staffName(v.supervisor_id),crew:(v.crew_ids||[]).map(staffName).filter(Boolean),status:ST_MAP[v.status],
        note:v.note||'',due:'',from:v.source==='admin'?'Admin':'Ops',report:rep,job:v.job_code||'',prospect:v.prospect_name||'',
        history:hist[v.id]||[],guests:v.guests||'',complaint:v.complaint_id?comp[v.complaint_id]||null:null,
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
var VIEW_KEYS=['sel','filter','cview','open'];
function loadView(){try{var o=JSON.parse(localStorage.getItem(KEY)||'null');if(o&&o.v===1)return o;}catch(e){}return {};}
function save(){try{var o={v:1};VIEW_KEYS.forEach(function(k){o[k]=S[k];});localStorage.setItem(KEY,JSON.stringify(o));}catch(e){}}
var S=Object.assign({sel:null,scope:'day',filter:'all',cview:'month',open:{}},loadView(),
  {edit:null,rep:null,sched:false,lodge:false,msg:'',err:'',visits:[],issues:[],complaints:[],ready:false,loadErr:''});

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
function teamText(v){
  if(isOps(v))return 'You (Ops manager)'+(v.crew&&v.crew.length?' + '+v.crew.map(esc).join(', '):'')+(v.guests?' · with '+esc(v.guests):'');
  if(!isSvc(v))return 'PCO '+esc(v.pco);
  return 'Supervisor '+esc(v.pco)+(v.crew&&v.crew.length?' + PCO '+v.crew.map(esc).join(', '):'');
}

/* small html helpers */
function fld(label,id,inner,hint){return '<div class="fld"><label for="'+id+'">'+label+'</label>'+inner+(hint?'<small>'+hint+'</small>':'')+'</div>';}
function sel(id,opts,val){return '<select id="'+id+'">'+opts.map(function(o){return '<option'+(o===val?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select>';}
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
  return '<div class="fld"><span class="lb">'+lab+'</span><div class="file"><span class="btn alt sm">'+text+'</span><input id="'+id+'" type="file" accept="'+accept+'"'+(multi?' multiple':'')+' aria-label="'+esc(lab)+'"></div><span class="fnames" id="'+id+'-n">Nothing added yet</span></div>';
}
function fileNames(id){var e=$(id);return e&&e.files?Array.prototype.map.call(e.files,function(f){return f.name;}):[];}
function rowHtml(k){
  var rm='<button type="button" class="btn alt sm" data-a="rmrow">Remove</button>';
  if(k==='item')return '<div class="rowx" data-row="item"><input type="text" data-f="n" placeholder="Product / item name" aria-label="Product or item name"><input type="number" min="0" step="any" data-f="q" placeholder="Qty" aria-label="Quantity"><select data-f="u" aria-label="Unit">'+UNITS.map(function(u){return '<option>'+u+'</option>';}).join('')+'</select>'+rm+'</div>';
  if(k==='extra')return '<div class="rowx two" data-row="extra"><input type="text" data-f="d" placeholder="What extra work was done" aria-label="Extra work"><input type="number" min="0" data-f="c" placeholder="Charge before tax (PKR)" aria-label="Charge before tax"> '+rm+'</div>';
  return '<div class="rowx one" data-row="find"><input type="text" data-f="t" placeholder="What did you find?" aria-label="Finding"> '+rm+'</div>';
}
function rowsOf(id){
  return Array.prototype.map.call(document.querySelectorAll('#'+id+' .rowx'),function(r){
    var o={};Array.prototype.forEach.call(r.querySelectorAll('[data-f]'),function(i){o[i.dataset.f]=String(i.value).trim();});return o;
  });
}

/* visit cards */
function reportRows(v){
  var r=v.report;if(!r)return [];
  var by=[isOps(v)?'Written by':'Submitted by',(isSvc(v)?'Supervisor ':(isOps(v)?'':'PCO '))+r.by+' on '+fmtDay(r.at)];
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
  var fb=files.length?'<div class="row">'+files.map(function(f){return '<button type="button" class="btn alt sm" data-a="openfile" data-path="'+esc(f[1])+'">Open '+esc(f[0])+'</button>';}).join('')+'</div>':'';
  return '<div class="rep"><h4>'+(v.type==='meeting'?'Meeting report':v.type==='inspection'?'Inspection report':'Report from '+(isSvc(v)?'Supervisor ':'PCO ')+esc(r.by))+'</h4><dl class="kv">'+reportRows(v).map(function(x){return '<dt>'+esc(x[0])+'</dt><dd>'+esc(x[1])+'</dd>';}).join('')+'</dl>'+fb+'</div>';
}
function reqBox(v){
  var x=site(v.site),info='';
  if(v.type==='contract'&&isPending(x))info='New client: '+esc(x.client)+' will be added to the client list with this visit.';
  else if(v.type==='revisit'){
    var all=S.visits.filter(function(q){return q.site===v.site&&isSvc(q);}),dn=all.filter(function(q){return q.status==='done';}).length;
    info=(v.complaint?'From complaint '+esc(v.complaint.code)+': '+esc(v.complaint.description)+'. ':'')+'This is visit '+all.length+' for this site ('+dn+' done so far).';
  }
  if(!PEOPLE.length)return '<div class="alert late">Admin set '+fmtDay(v.date)+' at <b>'+esc(v.time)+'</b>. '+info+'</div><p class="err">No field team yet. Ask Admin to add supervisors and PCOs.</p>';
  return '<div class="alert late">Admin set '+fmtDay(v.date)+' at <b>'+esc(v.time)+'</b>. Pick the PCO.'+(info?' '+info:'')+'</div><div class="qa one"><div class="fld"><label for="n-pco-'+v.id+'">PCO</label>'+sel('n-pco-'+v.id,PEOPLE,x.sup)+'</div><button type="button" class="btn go" data-a="assign" data-id="'+v.id+'">Assign PCO</button></div>';
}
function visitCard(v,showSite){
  var ms=missedOf(v),nd=needsDay(v);
  var cls='visit '+v.status+(ms?' hasalert':'');
  var when;
  if(nd){
    var dd=(v.status==='resched'||v.fixed)?v.date:v.due;
    when='<div class="when"><em>'+(v.fixed?'On':(v.status==='resched'?'Was':'Needed by'))+'</em><b>'+dt(dd).getDate()+'</b><span>'+dt(dd).toLocaleDateString('en-GB',{month:'short'})+'</span></div>';
  }else when='<div class="when"><b>'+dt(v.date).getDate()+'</b><span>'+dt(v.date).toLocaleDateString('en-GB',{month:'short'})+'</span><small>'+dt(v.date).toLocaleDateString('en-GB',{weekday:'short'})+'</small></div>';
  var status='';
  if(v.status==='scheduled')status='<span class="chip mini wait">'+(isOps(v)?'Waiting for your report':'Not started')+'</span>';
  else if(v.status==='started')status='<span class="chip mini go">Visit started</span>';
  else if(v.status==='done'){
    var oc=v.report&&v.report.outcome;
    status='<span class="chip mini ok">'+(oc&&OUT[oc]?OUT[oc]:(isOps(v)?'Report written':'Report submitted'))+'</span>';
  }
  var extra='';
  if(v.type==='inspection')extra=v.site?'<span class="chip mini ok">Goes to site inspection report</span>':'<span class="chip mini wait">Not a client yet</span>';
  if(v.type==='meeting'&&!v.site)extra='<span class="chip mini wait">Not a client yet</span>';
  var lead=(nd&&v.fixed)?'<strong>'+esc(v.time)+'</strong><span>Waiting for a PCO</span>':nd?'<strong>'+(v.status==='resched'?'Needs a new day':'Not assigned yet')+'</strong>':'<strong>'+esc(v.time)+'</strong><span>'+teamText(v)+'</span>';
  var body='<div class="line">'+lead+'<span class="chip '+v.type+'">'+label(v)+'</span>'+status+extra+'</div>';
  if(v.job)body+='<div class="job">'+esc(v.job)+'</div>';
  if(showSite||!v.site)body+='<div class="sitel">'+whereOf(v)+'</div>';
  if(v.note)body+='<div class="note">'+esc(v.note)+'</div>';
  if(v.history&&v.history.length)body+='<div class="hist">'+v.history.map(function(h){return 'Rescheduled from '+fmtDay(h.from)+(h.time?', '+esc(h.time):'')+': '+esc(h.reason)+(h.note?' ('+esc(h.note)+')':'');}).join('<br>')+'</div>';
  if(ms)body+='<div class="alert late">'+(v.status==='started'?'This visit was started but not closed':'This was not done')+' on '+fmtDay(v.date)+'. Reschedule it.</div>';
  if(v.fixed&&v.status==='toassign')body+=reqBox(v);
  if(v.report&&S.open[v.id])body+=reportBox(v);
  if(S.edit===v.id)body+=editForm(v);
  if(S.rep===v.id)body+=reportForm(v);
  var acts='';
  if(S.edit!==v.id&&S.rep!==v.id){
    if(v.status==='toassign'&&v.fixed)acts='';
    else if(v.status==='toassign')acts='<button type="button" class="btn go sm" data-a="edit" data-id="'+v.id+'">Set day and PCO</button>';
    else if(v.status==='resched')acts='<button type="button" class="btn go sm" data-a="edit" data-id="'+v.id+'">Reschedule</button>';
    else if(v.status==='scheduled')acts='<button type="button" class="btn '+(ms?'go':'alt')+' sm" data-a="edit" data-id="'+v.id+'">'+(ms?'Reschedule':'Change or reschedule')+'</button><button type="button" class="btn alt sm" data-a="openrep" data-id="'+v.id+'">'+(isSvc(v)?'Open PCO form: start visit':(v.type==='meeting'?'Write meeting report':(v.type==='inspection'?'Write inspection report':'Open PCO form')))+'</button>';
    else if(v.status==='started'){
      acts='<button type="button" class="btn go sm" data-a="openrep" data-id="'+v.id+'">Open PCO form: close out visit</button>';
      if(ms)acts+='<button type="button" class="btn alt sm" data-a="edit" data-id="'+v.id+'">Reschedule</button>';
    }else if(v.report){
      acts='<button type="button" class="btn alt sm" data-a="togglerep" data-id="'+v.id+'">'+(S.open[v.id]?'Hide report':'View report')+'</button>';
    }
  }
  return '<article class="'+cls+'">'+when+'<div class="what">'+body+'</div><div class="acts">'+acts+'</div></article>';
}
function editForm(v){
  var svc=isSvc(v),meet=isOps(v),live=v.status==='scheduled'||v.status==='started';
  var dflt=(v.date&&v.date>=iso(0)&&v.status!=='resched')?v.date:((v.status==='toassign'&&v.due&&v.due>=iso(0))?v.due:iso(1));
  var first=(missedOf(v)||v.status==='resched')?'date':'pco';
  var why=live?'<div class="grid">'+fld('Why?','e-why',sel('e-why',['Not done','Client blocked access','Issue on site','PCO unavailable','Client asked for another day','Other'],missedOf(v)?'Not done':'Client asked for another day'))+fld('Note (optional)','e-wnote','<input id="e-wnote" type="text" placeholder="For example: gate was locked">')+'</div>':'';
  var pco='<div class="etp" data-p="pco"'+(first==='pco'?'':' style="display:none"')+'>'+
    (meet?'':fld(svc?'Supervisor (leads the visit)':'PCO','e-pco',sel('e-pco',PEOPLE,v.pco||(v.site?site(v.site).sup:PEOPLE[0]))))+
    (svc||meet?'<div class="fld"><span class="lb">'+(meet?'People joining you':'Team (the supervisor is ticked and leads)')+'</span>'+checks('e-crew',PEOPLE,v.crew,true)+'</div>':'')+
    '<div class="row"><button type="button" class="btn go sm" data-a="saveedit" data-mode="pco" data-id="'+v.id+'">'+(v.status==='toassign'?'Assign':(meet?'Save people':'Save PCO'))+'</button><button type="button" class="btn alt sm" data-a="closepanel">Cancel</button></div></div>';
  var dat='<div class="etp" data-p="date"'+(first==='date'?'':' style="display:none"')+'>'+why+
    '<div class="grid">'+fld('New day','e-date','<input id="e-date" type="date" min="'+iso(0)+'" value="'+dflt+'">')+fld('Time','e-time',sel('e-time',SLOTS,v.time||'10:00'))+'</div>'+
    '<div class="row"><button type="button" class="btn go sm" data-a="saveedit" data-mode="date" data-id="'+v.id+'">Reschedule</button><button type="button" class="btn alt sm" data-a="closepanel">Cancel</button></div></div>';
  return '<div class="form"><div class="etabs" role="tablist"><button type="button" role="tab" data-a="etab" data-t="pco" aria-selected="'+(first==='pco')+'">'+(meet?'People':'PCO')+'</button><button type="button" role="tab" data-a="etab" data-t="date" aria-selected="'+(first==='date')+'">Reschedule</button></div>'+pco+dat+'</div>';
}

/* PCO forms */
function reportForm(v){
  var s=site(v.site),err=S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'';
  var cancel='<button type="button" class="btn alt" data-a="closepanel">Cancel</button>';
  var demo='<p class="hint">This is the form the PCO fills in on their phone. Fill it here to see how a report arrives.</p>';
  var ta=fld('Notes','r-notes','<textarea id="r-notes" placeholder="Anything the office should know"></textarea>');
  if(v.type==='meeting'){
    var joined=(v.crew||[]).concat(v.guests?v.guests.split(',').map(function(x){return x.trim();}):[]).join(', ');
    return '<div class="form"><h3>Meeting report</h3>'+fld('Who joined the meeting?','r-with','<input id="r-with" type="text" value="'+esc(joined)+'">','You are included. Add or remove names.')+
      fld('How did it go?','r-outcome',sel('r-outcome',['Client agreed','Needs another meeting','Client said no']))+ta+err+
      '<div class="row"><button type="button" class="btn go" data-a="submitsimple" data-id="'+v.id+'">Save meeting report</button>'+cancel+'</div></div>';
  }
  if(v.type==='inspection'){
    return '<div class="form"><h3>Inspection report</h3><p class="sub">You do this inspection yourself'+(v.crew&&v.crew.length?' with '+v.crew.map(esc).join(', '):'')+'.</p><div class="grid">'+fld('Pest activity found','r-activity',sel('r-activity',['None','Low','Medium','High']))+fld('Your advice','r-rec',sel('r-rec',['No action needed','Treat again','Fix site conditions first']))+'</div>'+
      fld('Areas checked','r-areas','<input id="r-areas" type="text" placeholder="Kitchen, store room, drains">')+ta+err+
      '<div class="row"><button type="button" class="btn go" data-a="submitsimple" data-id="'+v.id+'">Save inspection report</button>'+cancel+'</div></div>';
  }
  var head='<h3>'+(v.status==='started'?'Close Out Visit: ':'Start Visit: ')+esc(v.job)+'</h3><p class="sub">'+esc(s.client)+' · '+esc(s.name)+(v.status==='started'?' · '+fmtLong(v.date)+' ('+(v.time<'12:00'?'morning':'afternoon')+')':' · Supervisor: '+esc(v.pco))+'</p>';
  if(v.status==='scheduled'){
    return '<div class="form">'+demo+head+
      '<div class="fld"><span class="lb">Before starting, confirm for the whole team *</span>'+
      '<div class="chks"><label class="chk"><input type="checkbox" name="s-ck" value="uniform"><span>Everyone is in uniform</span></label>'+
      '<label class="chk"><input type="checkbox" name="s-ck" value="gear"><span>Safety gear (mask, gloves, goggles) checked</span></label>'+
      '<label class="chk"><input type="checkbox" name="s-ck" value="chem"><span>Chemicals issued from store and logged</span></label></div></div>'+
      fileBox('p-before','Before photos (optional)','Add photo','image/*',true)+
      '<p class="note">Photograph the problem areas before treatment. Take the after photos of the same areas.</p>'+err+
      '<div class="row"><button type="button" class="btn go" data-a="startvisit" data-id="'+v.id+'">Start visit</button>'+cancel+'</div></div>';
  }
  var open=S.issues.filter(function(i){return i.site===v.site&&i.open;});
  var team=['Supervisor: '+v.pco].concat(v.crew.map(function(c){return c;})).concat(['I (Supervisor) was on site / did it myself']);
  return '<div class="form">'+demo+head+
    '<div class="fld"><span class="lb">What happened on this visit? *</span><div class="radios" role="radiogroup">'+
      [['completed','Completed','Full service done'],['partial','Partial','Some areas done'],['blocked','Client blocked','No access to site'],['postponed','Postponed','Do it another day']].map(function(o,i){
        return '<label class="rad"><input type="radio" name="r-out" value="'+o[0]+'"'+(i===0?' checked':'')+'><span><b>'+o[1]+'</b><small>'+o[2]+'</small></span></label>';
      }).join('')+'</div></div>'+
    '<div class="fld"><span class="lb">Who did the work? *</span>'+checks('r-team',team,[])+'<small>Every ticked PCO gets credit for this visit in payroll once QC verifies it.</small></div>'+
    '<div class="fld"><span class="lb">Extra treatment done on this visit?</span><div class="rows" id="x-extras"></div><div><button type="button" class="btn alt sm" data-a="addrow" data-k="extra" data-to="x-extras">Add extra treatment</button></div>'+
      '<small>Only work outside the contract, with its charge before tax. It is added to this visit\'s invoice. Leave empty if none.</small></div>'+
    '<div class="fld"><span class="lb">Site issues</span>'+(open.length?'<ul class="marks">'+open.map(function(i){return '<li>'+esc(i.text)+'</li>';}).join('')+'</ul>':'<span class="note">None open at this site</span>')+
      '<div class="rows" id="x-finds"></div><div><button type="button" class="btn alt sm" data-a="addrow" data-k="find" data-to="x-finds">Add a finding from this visit</button></div></div>'+
    '<div class="fld"><span class="lb">Items / products used *</span><div class="rows" id="x-items">'+rowHtml('item')+'</div><div><button type="button" class="btn alt sm" data-a="addrow" data-k="item" data-to="x-items">Add item</button></div></div>'+
    fld('Findings / execution notes','r-notes','<textarea id="r-notes"></textarea>')+
    fileBox('p-found','Findings photos (pest activity, problem areas)','Add photo','image/*',true)+
    fileBox('p-after','After photos (same areas, after treatment)','Add photo','image/*',true)+
    '<div class="must"><b>Delivery &amp; Service Challan (Physical Signed Copy) *</b><span><b>Mandatory (Not Optional)</b></span><span>Field protocol requires a physical copy of the delivery &amp; service challan with client signature. Both challan number and signed document copy are required before completing the job.</span></div>'+
    '<div class="grid">'+fld('Physical Challan # *','r-chno','<input id="r-chno" type="text" placeholder="Physical signed delivery/service challan number">')+fld('Challan Date *','r-chdate','<input id="r-chdate" type="date" value="'+iso(0)+'">')+'</div>'+
    fileBox('p-challan','Upload Signed Challan Picture / Document *','Choose file','image/*,application/pdf',false)+
    '<p class="alert leave">Physical signed challan copy is mandatory to submit this service report.</p>'+
    '<p class="note">Items, challan and photos are needed when the visit is Completed or Partial.</p>'+err+
    '<div class="row"><button type="button" class="btn go" data-a="submitclose" data-id="'+v.id+'">Submit service report</button>'+cancel+'</div></div>';
}

/* the three columns */
function curSite(){var ids=S.sel.filter(function(x){return x!=='lead';});return ids.length===1?ids[0]:'';}
function pick(v){if(v.site&&isPending(site(v.site)))return true;return S.sel.indexOf(v.site||'lead')>-1;}
var FILTERS=[['all','All'],['done','Completed'],['revisit','Revisits (from complaints)'],['meeting','Meetings'],['inspect','Inspections']];
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
function shown(){return S.visits.filter(function(v){return pick(v)&&inFilter(v,S.filter)&&qOk(v);});}
function reveal(sid,date){
  var k=sid||'lead';if(S.sel.indexOf(k)<0)S.sel.push(k);
  if(date){S.calMonth=date.slice(0,7);S.calDay=date;S.scope='day';}
}
var CVIEWS=[['month','Monthly'],['week','Week'],['day','Day']];
var DOT={monthly:'#0d7a5b',contract:'#0d7a5b',revisit:'#5a49cf',meeting:'#1f5fa8',inspection:'#8a3fb0'};

function paintSide(){
  var h='<div class="sh"><h2>Clients and sites</h2><span><button type="button" class="link sm" data-a="selall">All</button><button type="button" class="link sm" data-a="selnone">None</button></span></div><div class="slist" role="group" aria-label="Tick the sites to show">';
  live().forEach(function(x){
    var on=S.sel.indexOf(x.id)>-1;
    var rq=S.visits.filter(function(v){return v.site===x.id&&needsDay(v);}).length;
    var ms=S.visits.filter(function(v){return v.site===x.id&&missedOf(v);}).length;
    var nmr=schedRule(x.id),al='';
    if(ms)al+='<span class="sb2 r" title="'+ms+' visit'+(ms===1?'':'s')+' not done">'+ms+'</span>';
    if(rq)al+='<span class="sb2 p" title="'+rq+(rq===1?' request waits':' requests wait')+' for a PCO">'+rq+'</span>';
    if(nmr.ok&&nmr.last)al+='<span class="sb2 a" title="Every visit is done. Schedule next month.">Next</span>';
    h+='<label class="srow'+(on?' on':'')+'"><input type="checkbox" data-a="toggle" data-id="'+x.id+'"'+(on?' checked':'')+'><span class="sn" title="'+esc(x.client+' · '+x.name)+'"><b>'+esc(x.client)+'</b> <span>'+esc(x.name)+'</span></span>'+al+'</label>';
  });
  var onL=S.sel.indexOf('lead')>-1;
  h+='<label class="srow'+(onL?' on':'')+'"><input type="checkbox" data-a="toggle" data-id="lead"'+(onL?' checked':'')+'><span class="sn" title="Meetings and inspections for businesses that are not clients yet"><b>New leads</b> <span>not clients yet</span></span></label></div>'+
    '<p class="note legend-s"><span class="sb2 r">1</span> not done <span class="sb2 p">1</span> request <span class="sb2 a">Next</span> schedule next month</p>';
  $('side').innerHTML=h;
}
function pill(v){
  return '<span class="pl '+v.type+(v.status==='done'?' dn':'')+(missedOf(v)?' ms':'')+(isReq(v)?' req':'')+'" title="'+esc(label(v)+' · '+siteName(v)+' · '+v.time+(v.status==='done'?' · done':'')+(isReq(v)?(v.status==='resched'?' · needs a new day':' · needs a PCO'):''))+'"><b>'+esc(v.time)+'</b> '+esc(siteName(v))+'</span>';
}
function gcell(ds,list,ym,max,sd){
  var d=dt(ds),n=list.length,miss=list.filter(missedOf).length;
  var h='<div class="gc-day'+(ds.slice(0,7)!==ym?' out':'')+(ds===sd&&S.scope!=='month'?' sel':'')+'" role="button" tabindex="0" data-a="calday" data-d="'+ds+'" aria-label="'+esc(fmtDay(ds)+', '+n+(n===1?' item':' items')+(miss?', '+miss+' not done':''))+'"><span class="gc-n'+(ds===iso(0)?' today':'')+'">'+d.getDate()+'</span>';
  h+=list.slice(0,max).map(pill).join('');
  if(n>max)h+='<span class="gc-more">+'+(n-max)+' more</span>';
  return h+'</div>';
}
function paintCal(){
  var cm=S.calMonth||iso(0).slice(0,7),sd=S.calDay||iso(0),v=S.cview==='agenda'?'month':(S.cview||'month');
  var p=cm.split('-'),y=+p[0],m=+p[1],by={};
  shown().forEach(function(x){if(onCal(x)){(by[x.date]=by[x.date]||[]).push(x);}});
  Object.keys(by).forEach(function(k){by[k].sort(byDate);});
  var first=new Date(y,m-1,1),mtitle=first.toLocaleDateString('en-GB',{month:'long'})+', '+y,title=mtitle,sub='';
  var inMonth=Object.keys(by).filter(function(k){return k.slice(0,7)===cm;}).reduce(function(a,k){return a+by[k].length;},0);
  sub=inMonth+(inMonth===1?' item':' items')+' this month';
  var body='';
  var names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if(v==='month'){
    var lead=first.getDay(),days=new Date(y,m,0).getDate(),total=Math.ceil((lead+days)/7)*7;
    body+='<div class="gc-grid">'+names.map(function(n){return '<div class="gc-h">'+n+'</div>';}).join('');
    for(var i=0;i<total;i++){var d=new Date(y,m-1,1-lead+i);var ds=ymd(d);body+=gcell(ds,by[ds]||[],cm,4,sd);}
    body+='</div>';
  }else if(v==='week'){
    var s0=dt(sd);s0.setDate(s0.getDate()-s0.getDay());var e0=new Date(s0);e0.setDate(e0.getDate()+6);
    title=s0.getDate()+' '+s0.toLocaleDateString('en-GB',{month:'short'})+' – '+e0.getDate()+' '+e0.toLocaleDateString('en-GB',{month:'short'})+', '+e0.getFullYear();
    body+='<div class="gc-grid gc-week">'+names.map(function(n,i){var d=new Date(s0);d.setDate(d.getDate()+i);return '<div class="gc-h">'+n+' '+d.getDate()+'</div>';}).join('');
    for(var k=0;k<7;k++){var d2=new Date(s0);d2.setDate(d2.getDate()+k);var ds2=ymd(d2);body+=gcell(ds2,by[ds2]||[],ds2.slice(0,7),30,sd);}
    body+='</div>';
  }else if(v==='day'){
    title=dt(sd).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    var list=by[sd]||[];sub=list.length+(list.length===1?' item':' items')+' on this day';
    body+='<div class="gc-dv">';
    ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].forEach(function(hh){
      var at=list.filter(function(x){return x.time.slice(0,2)===hh.slice(0,2);});
      body+='<div class="dv-row"><span class="dv-t">'+hh+'</span><div class="dv-c">'+at.map(function(x){return '<div class="dv-e">'+pill(x)+'<span class="dv-s">'+label(x)+' · '+teamText(x)+'</span></div>';}).join('')+'</div></div>';
    });
    body+='</div>';
  }else{
    var keys=Object.keys(by).filter(function(k){return k.slice(0,7)===cm;}).sort();
    body+='<div class="gc-ag">'+(keys.length?keys.map(function(k){
      return '<div class="ag" role="button" tabindex="0" data-a="calday" data-d="'+k+'"><b class="ag-d'+(k===iso(0)?' today':'')+'">'+fmtDay(k)+'</b><div class="ag-l">'+by[k].map(function(x){return '<div class="ag-e">'+pill(x)+'<span class="dv-s">'+label(x)+'</span></div>';}).join('')+'</div></div>';
    }).join(''):'<p class="empty">Nothing in '+mtitle+' for the ticked sites.</p>')+'</div>';
  }
  var MS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],unit=v==='week'?'week':(v==='day'?'day':'month'),pl,nl;
  function md(x){return MS[x.getMonth()]+' '+x.getDate();}
  if(v==='month'){
    var pm=new Date(y,m-2,1),nm=new Date(y,m,1);
    pl=pm.toLocaleDateString('en-GB',{month:'long'});nl=nm.toLocaleDateString('en-GB',{month:'long'});
  }else{
    var b0=dt(sd);if(v==='week')b0.setDate(b0.getDate()-b0.getDay());
    var st=v==='week'?7:1,pd=new Date(b0),nd=new Date(b0);pd.setDate(pd.getDate()-st);nd.setDate(nd.getDate()+st);
    function wr(x){var e=new Date(x);e.setDate(e.getDate()+6);return x.getMonth()===e.getMonth()?md(x)+'–'+e.getDate():md(x)+'–'+md(e);}
    if(v==='week'){pl=wr(pd);nl=wr(nd);}else{pl=md(pd);nl=md(nd);}
  }
  var h='<section class="gc" aria-label="Calendar"><div class="gc-top"><div class="gc-title"><h2>'+esc(title)+'</h2><span>'+esc(sub)+'</span></div>'+
    '<select class="gc-f" id="cal-f" aria-label="Show only">'+FILTERS.map(function(f){return '<option value="'+f[0]+'"'+(S.filter===f[0]?' selected':'')+'>'+f[1]+'</option>';}).join('')+'</select>'+
    '<div class="gc-right"><div class="gc-nav"><button type="button" data-a="calnav" data-n="-1" aria-label="Previous '+unit+': '+esc(pl)+'" title="'+esc(pl)+'">&lsaquo;</button><button type="button" data-a="calnav" data-n="1" aria-label="Next '+unit+': '+esc(nl)+'" title="'+esc(nl)+'">&rsaquo;</button></div>'+
    '<div class="gc-views" role="group" aria-label="Calendar view">'+CVIEWS.map(function(c){return '<button type="button" data-a="cview" data-v="'+c[0]+'" aria-pressed="'+(v===c[0])+'">'+c[1]+'</button>';}).join('')+'</div></div></div>'+
    body+
    '<div class="legend"><span><i style="background:'+DOT.monthly+'"></i>Monthly or contract</span><span><i style="background:'+DOT.revisit+'"></i>Revisit</span><span><i style="background:'+DOT.meeting+'"></i>Meeting</span><span><i style="background:'+DOT.inspection+'"></i>Inspection</span><span class="rq"><i style="background:var(--bad)"></i>Needs a PCO</span></div></section>';
  $('center').innerHTML=h;
}
function paintRight(){
  var sd=S.calDay||iso(0),cm=S.calMonth||iso(0).slice(0,7),one=curSite(),s=one?site(one):null,h='';
  var dated=shown().filter(onCal);
  var month=false;
  var list=dated.filter(function(v){return month?v.date.slice(0,7)===cm:v.date===sd;}).sort(byDate);
  var who=s?esc(s.client)+' · '+esc(s.name):(S.sel.length+(S.sel.length===1?' site ticked':' sites ticked'));
  h+='<div class="head"><h1>'+(month?monthName(cm):fmtDay(sd)+(sd===iso(0)?' (today)':''))+'</h1><p>'+list.length+(list.length===1?' visit, meeting or inspection':' visits, meetings and inspections')+' · '+who+'</p></div>';
  if(s){
    var sv=S.visits.filter(function(v){return v.site===s.id&&isSvc(v);}),dn=sv.filter(function(v){return v.status==='done';}).length;
    h+='<div class="stats"><span><b>'+sv.length+'</b> visits in total</span><span class="ok"><b>'+dn+'</b> done</span><span class="todo"><b>'+(sv.length-dn)+'</b> not done yet</span></div>';
  }
  var canSched=s&&schedRule(s.id).ok;
  h+='<div class="row">'+(canSched?'<button type="button" class="btn go sm" data-a="opensched">Schedule monthly visits</button>':'')+(s?'<button type="button" class="btn alt sm" data-a="openlodge">Lodge a complaint</button>':'')+'</div>';
  if(S.msg)h+='<p class="msg" role="status">'+esc(S.msg)+'</p>';
  if(S.sched&&s)h+=schedPanel(s);
  if(S.lodge&&s)h+=lodgePanel(s);
  if(s){
    var oi=S.issues.filter(function(i){return i.site===s.id&&i.open;});
    h+=complaintsBox(s);
    if(oi.length)h+='<div class="issues"><h3>Open issues at this site</h3><ul>'+oi.map(function(i){return '<li><span>'+esc(i.text)+' <span class="job">'+esc(i.job)+'</span></span><button type="button" class="btn alt sm" data-a="fixissue" data-id="'+i.id+'">Mark fixed</button></li>';}).join('')+'</ul></div>';
  }
  h+=list.length?list.map(function(v){return visitCard(v,true);}).join(''):'<p class="empty">Nothing '+(month?'this month':'on this day')+' for the ticked sites.</p>';
  $('main').innerHTML=h;
  if(S.sched&&s)updatePrev();
}
function schedPanel(s){
  var r=schedRule(s.id);
  if(!r.ok)return '<section class="panel warn"><h2>Next month is not ready yet</h2><p>You can schedule the next month only after every visit of this month is done.'+(r.last?' The last visit is on '+fmtDay(r.last.date)+'.':'')+'</p><div class="row"><button type="button" class="btn alt" data-a="closepanel">Close</button></div></section>';
  return '<section class="panel" data-prev="1"><h2>Schedule monthly visits for '+esc(s.name)+'</h2>'+
    '<p class="note">'+(r.last?'The last visit was on '+fmtDay(r.last.date)+'. You can schedule from '+monthName(r.minM)+'.':'This site has no monthly visits yet. You can schedule from '+monthName(r.minM)+'.')+'</p>'+
    '<div class="grid">'+fld('Month','m-month','<input id="m-month" type="month" min="'+r.minM+'" value="'+r.minM+'">')+
    fld('How many visits?','m-n','<input id="m-n" type="number" min="1" max="8" value="'+s.per+'">','Contract: '+s.per+' a month')+
    fld('Time','m-time',sel('m-time',SLOTS,'10:00'))+fld('Supervisor (leads the visit)','m-lead',sel('m-lead',PEOPLE,s.sup))+'</div>'+
    '<div class="fld"><span class="lb">Team (the supervisor is ticked and leads)</span>'+checks('m-crew',PEOPLE,[],true)+'</div>'+
    '<div class="prev" id="prev" aria-live="polite"></div>'+
    (S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'')+
    '<div class="row"><button type="button" class="btn go" data-a="makesched">Create these visits</button><button type="button" class="btn alt" data-a="closepanel">Cancel</button></div></section>';
}
function schedTeam(){var lead=v$('m-lead');return [lead].concat(picked('m-crew').filter(function(c){return c!==lead;}));}
function updatePrev(){
  var p=$('prev');if(!p)return;
  var r=schedRule(curSite());if(!r.ok)return;
  var dates=monthDates(v$('m-month'),parseInt(v$('m-n'),10)||0,r.after,r.minM),team=schedTeam(),time=v$('m-time');
  if(!dates.length){p.innerHTML='<span class="bad">No days available. Pick '+monthName(r.minM)+' or a later month.</span>';return;}
  p.innerHTML='<b>Team: Supervisor '+esc(team[0])+(team.length>1?' + PCO '+team.slice(1).map(esc).join(', '):'')+'. Dates are spread across the month, Sundays skipped:</b>'+dates.map(function(d){
    return '<span>'+fmtDay(d)+' at '+esc(time)+'</span>';
  }).join('');
}
function lodgePanel(s){
  return '<section class="panel warn"><h2>Lodge a complaint for '+esc(s.name)+'</h2>'+
    '<p class="note">The complaint goes to Admin. Admin decides: a revisit (you pick the PCO), an inspection or meeting (on your calendar), or close it.</p>'+
    fld('What did the client complain about?','l-text','<textarea id="l-text" placeholder="For example: cockroaches in the kitchen since Monday"></textarea>')+
    '<div class="grid">'+fld('How serious?','l-sev',sel('l-sev',['Low','Medium','High'],'Medium'))+'</div>'+
    (S.err?'<p class="err" role="alert">'+esc(S.err)+'</p>':'')+
    '<div class="row"><button type="button" class="btn go" data-a="makelodge">Send complaint to Admin</button><button type="button" class="btn alt" data-a="closepanel">Cancel</button></div></section>';
}
function complaintsBox(s){
  var cs=S.complaints.filter(function(c){return c.site_id===s.id&&(c.status==='open'||c.status==='in_progress');});
  if(!cs.length)return '';
  var DEC={revisit:'a revisit',inspection:'an inspection',meeting:'a meeting'};
  return '<div class="issues"><h3>Complaints at this site</h3><ul>'+cs.map(function(c){
    return '<li><span>'+esc(c.code)+' · '+esc(c.description)+' <span class="job">'+(c.status==='open'?'Waiting for Admin to decide':'Admin sent '+(DEC[c.decision]||c.decision))+' · '+esc(c.severity)+' priority</span></span></li>';
  }).join('')+'</ul></div>';
}
function render(){
  $('today').textContent=dt(iso(0)).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  if(!S.ready){
    $('side').innerHTML='';$('center').innerHTML='';
    $('main').innerHTML=S.loadErr?'<p class="err" role="alert">Could not load operations data: '+esc(S.loadErr)+'. Check that ops.sql was run and "ops" is in Supabase → Settings → API → Exposed schemas.</p>':'<p class="empty">Loading…</p>';
    return;
  }
  paintSide();paintCal();paintRight();
  syncLeads();
  save();
}
function clear(){S.edit=null;S.rep=null;S.sched=false;S.lodge=false;S.err='';}
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
    clear();S.msg='';render();
    var b=document.querySelector('input[data-a="toggle"][data-id="'+id+'"]');if(b&&b.focus)b.focus();
  },
  assign:function(el){
    var v=vis(el.dataset.id),x=site(v.site),p=v$('n-pco-'+v.id),wasNew=isPending(x);
    if(!staffId(p))return bad('Pick the PCO.');
    act(el,function(){return rpc('assign_pco',{p_visit_id:v.id,p_supervisor_id:staffId(p),p_crew_ids:[]});},function(){
      reveal(v.site,v.date);S.filter='all';
      return (wasNew?x.client+' is now a client. ':'')+'PCO '+p+' will do the '+label(v).toLowerCase()+' at '+x.name+' on '+fmtDay(v.date)+' at '+v.time+'. The red label is now a normal visit on the calendar'+(wasNew?' and the client is in the list.':' and in the visits for this site.');
    });
  },
  selall:function(){S.sel=live().map(function(x){return x.id;}).concat(['lead']);clear();S.msg='';render();},
  selnone:function(){S.sel=[];clear();S.msg='';render();},
  scope:function(el){S.scope=el.dataset.s;clear();S.msg='';render();},
  filter:function(el){S.filter=el.dataset.f;render();},
  opensched:function(){clear();S.sched=!!curSite()&&schedRule(curSite()).ok;S.msg='';render();},
  openlodge:function(){clear();S.lodge=!!curSite();S.msg='';render();},
  closepanel:function(){clear();go('');},
  edit:function(el){clear();S.edit=el.dataset.id;S.msg='';render();},
  openrep:function(el){clear();S.rep=el.dataset.id;S.msg='';render();},
  calday:function(el){clear();S.scope='day';S.calDay=el.dataset.d;S.calMonth=el.dataset.d.slice(0,7);S.msg='';render();},
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
  fixissue:function(el){act(el,function(){return rpc('fix_issue',{p_issue_id:el.dataset.id});},'Issue marked as fixed.');},
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
    if(!staffId(team[0]))return bad('Pick the supervisor.');
    act(el,function(){return rpc('schedule_month',{p_site_id:s.id,p_dates:dates,p_time:time,p_supervisor_id:staffId(team[0]),p_crew_ids:staffIds(team.slice(1))});},function(){
      reveal(s.id,dates[0]);S.filter='all';
      return dates.length+(dates.length===1?' visit':' visits')+' created for '+s.name+' in '+monthName(dates[0].slice(0,7))+'. Supervisor '+team[0]+(team.length>1?' with '+team.slice(1).join(', '):'')+'.';
    });
  },
  makelodge:function(el){
    var s=site(curSite()),txt=v$('l-text'),sev=v$('l-sev');
    if(!txt)return bad('Please write what the client complained about.');
    act(el,function(){return rpc('lodge_complaint',{p_site_id:s.id,p_description:txt,p_severity:sev});},
      'Complaint sent to Admin for '+s.name+'. Admin decides: revisit, inspection, meeting or close.');
  },
  etab:function(el){
    var f=el.closest('.form');
    f.querySelectorAll('.etp').forEach(function(p){p.style.display=p.dataset.p===el.dataset.t?'':'none';});
    f.querySelectorAll('[data-a="etab"]').forEach(function(b){b.setAttribute('aria-selected',b===el?'true':'false');});
  },
  saveedit:function(el){
    var v=vis(el.dataset.id),mode=el.dataset.mode||'pco',meet=isOps(v),was=v.status,needs=needsDay(v);
    var d=v.date,t=v.time,lead=v.pco,crew=v.crew||[],dateMode=mode==='date'||needs,pcoMode=mode==='pco'||needs;
    if(dateMode){d=v$('e-date');t=v$('e-time');if(!d)return bad('Please pick the day.');}
    if(pcoMode){
      lead=meet?'':v$('e-pco');
      var cr=picked('e-crew');
      crew=meet?cr:cr.filter(function(c){return c!==lead;});
      if(!meet&&!staffId(lead))return bad('Pick the supervisor.');
    }
    var why=v$('e-why')||'Rescheduled',wnote=v$('e-wnote'),sup=meet?null:staffId(lead),crewIds=staffIds(crew);
    var work=needs
      ?function(){return rpc('reschedule',{p_visit_id:v.id,p_date:d,p_time:t,p_reason:why,p_note:wnote,p_set_team:true,p_supervisor_id:sup,p_crew_ids:crewIds});}
      :mode==='date'
        ?function(){return rpc('reschedule',{p_visit_id:v.id,p_date:d,p_time:t,p_reason:why,p_note:wnote});}
        :function(){return rpc('set_team',{p_visit_id:v.id,p_supervisor_id:sup,p_crew_ids:crewIds});};
    act(el,work,function(){
      reveal(v.site,d);
      var team=meet?'you'+(crew.length?' with '+crew.join(', '):''):(isSvc(v)?'Supervisor ':'PCO ')+lead+(crew.length?' with '+crew.join(', '):'');
      return (was==='toassign'?'Assigned: ':(mode==='pco'&&!needs?'Team updated: ':'Rescheduled: '))+siteName(v)+' on '+fmtDay(d)+' at '+t+', '+team+'.';
    });
  },
  startvisit:function(el){
    var v=vis(el.dataset.id);
    if(picked('s-ck').length<3)return bad('Please tick all three checks for the whole team before starting.');
    var before=filesOf('p-before');
    act(el,function(){return upload(v.id,'before',before).then(function(paths){return rpc('start_visit',{p_visit_id:v.id,p_before_photos:paths});});},
      'Visit '+v.job+' started. When the work is finished, press "Open PCO form: close out visit".');
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
    var names=team.map(function(t){return t.indexOf('Supervisor: ')===0?t.slice(12):(t.indexOf('I (Supervisor)')===0?v.pco:t);});
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
      if(!full)return 'Report received for '+v.job+' ('+OUT[out]+'). The visit now needs a new day. It is red on the calendar. Click it and press Reschedule.';
      S.open[v.id]=true;return 'Report received for '+v.job+' ('+OUT[out]+').';
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
      return meet?'Meeting report saved for '+siteName(v)+'.':'Inspection report saved for '+siteName(v)+'.'+(v.site?' It is filed under Inspection reports at '+siteName(v)+'.':'')+' You can read it below.';
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
  if((e.key==='Enter'||e.key===' ')&&t&&t.getAttribute&&t.getAttribute('role')==='button'&&t.dataset&&t.dataset.a){e.preventDefault();t.click();}
}
function onChange(e){
  var t=e.target;
  if(LEADS[t.id])syncLead(t.id);
  if(t.id==='cal-f'){S.filter=t.value;clear();render();return;}
  if(t.closest&&t.closest('[data-prev]'))updatePrev();
  if(t.type==='file'){var n=$(t.id+'-n');if(n){var names=fileNames(t.id);n.textContent=names.length?names.join(', '):'Nothing added yet';}}
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
  rt=setTimeout(function(){refresh().then(function(){if(!(S.edit||S.rep||S.sched||S.lodge))render();});},400);
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
