// PaaniLink: small classroom MOCK API. No external packages required.
// In the real backend, replace the demo user header with proper authentication
// and the JSON file with transactional PostgreSQL access.
import http from 'node:http';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const DIR=path.dirname(fileURLToPath(import.meta.url));
const FILE=process.env.PAANILINK_DATA_FILE||path.join(DIR,'demo-data.json');
const PORT=Number(process.env.PORT||5173);
const iso=(offset=0)=>{let d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const seed=()=>({
  settings:{commercial:1600,subsidized:350,monthlyLimit:2,slotHours:2},
  zones:[{id:'z1',name:'Gulshan-e-Iqbal'},{id:'z2',name:'North Nazimabad'},{id:'z3',name:'Clifton'}],
  hydrants:[{id:'h1',name:'NIPA Water Hydrant',zone:'z1',quota:25000,open:7,close:19,active:true},{id:'h2',name:'Sakhi Hassan Hydrant',zone:'z2',quota:22000,open:7,close:19,active:true},{id:'h3',name:'Clifton Water Depot',zone:'z3',quota:18000,open:8,close:20,active:true}],
  tankers:[{id:'t1',plate:'KHI-1012',capacity:1000,hydrant:'h1',active:true},{id:'t2',plate:'KHI-3095',capacity:3000,hydrant:'h1',active:true},{id:'t3',plate:'KHI-6018',capacity:6000,hydrant:'h1',active:true},{id:'t4',plate:'KHI-1025',capacity:1000,hydrant:'h2',active:true},{id:'t5',plate:'KHI-3076',capacity:3000,hydrant:'h2',active:true},{id:'t6',plate:'KHI-6019',capacity:6000,hydrant:'h2',active:true},{id:'t7',plate:'KHI-1023',capacity:1000,hydrant:'h3',active:true},{id:'t8',plate:'KHI-3065',capacity:3000,hydrant:'h3',active:true},{id:'t9',plate:'KHI-6065',capacity:6000,hydrant:'h3',active:true}],
  users:[
    {id:'u1',name:'Sara Ahmed',role:'customer',zone:'z1',address:'Block 7, Gulshan-e-Iqbal, Karachi',cnic:'42101-1111111-1',phone:'03001111111',subsidy:'verified',category:'household',active:true},
    {id:'u2',name:'Hamza Ali',role:'customer',zone:'z2',address:'Block H, North Nazimabad, Karachi',cnic:'42101-2222222-2',phone:'03002222222',subsidy:'pending',category:'household',active:true},
    {id:'u3',name:'Hina Tariq',role:'officer',zone:'z1',active:true},{id:'u4',name:'Ahmed Raza',role:'officer',zone:'z2',active:true},
    {id:'u5',name:'Bilal Sheikh',role:'operator',hydrant:'h1',active:true},{id:'u6',name:'Adeel Mustafa',role:'operator',hydrant:'h2',active:true},
    {id:'u7',name:'Imran Khan',role:'driver',hydrant:'h1',active:true},{id:'u8',name:'Farhan Iqbal',role:'driver',hydrant:'h2',active:true},
    {id:'u9',name:'Nadia Karim',role:'admin',active:true},
    {id:'u10',name:'Yasmin Ali',role:'customer',zone:'z3',address:'Block 5, Clifton, Karachi',cnic:'42101-3333333-3',phone:'03003333333',subsidy:'none',active:true},
    {id:'u11',name:'Salman Tariq',role:'officer',zone:'z3',active:true},{id:'u12',name:'Sara Anwar',role:'operator',hydrant:'h3',active:true},{id:'u13',name:'Amir Ahmed',role:'driver',hydrant:'h3',active:true}
  ],
  subsidies:[{id:'s1',customer:'u1',zone:'z1',category:'household',proof:'Registered assistance document',details:'Verified low-income household',status:'verified',submitted:iso(-10)},{id:'s2',customer:'u2',zone:'z2',category:'household',proof:'Household assistance letter',details:'Applying for household assistance',status:'pending',submitted:iso(-1)}],
  bookings:[
    {id:'PL-1001',customer:'u1',zone:'z1',hydrant:'h1',type:'subsidized',capacity:1000,date:iso(2),slot:'09:00',status:'pending',amount:350},
    {id:'PL-1002',customer:'u1',zone:'z1',hydrant:'h1',type:'commercial',capacity:3000,date:iso(1),slot:'11:00',status:'approved',amount:4800},
    {id:'PL-1003',customer:'u1',zone:'z1',hydrant:'h1',type:'commercial',capacity:1000,date:iso(),slot:'09:00',status:'en_route',amount:1600,tanker:'t1',driver:'u7'},
    {id:'PL-1004',customer:'u1',zone:'z1',hydrant:'h1',type:'commercial',capacity:1000,date:iso(-1),slot:'10:00',status:'delivered',amount:1600,tanker:'t1',driver:'u7'},
    {id:'PL-1005',customer:'u2',zone:'z2',hydrant:'h2',type:'commercial',capacity:3000,date:iso(1),slot:'09:00',status:'approved',amount:4800},
    {id:'PL-1006',customer:'u10',zone:'z3',hydrant:'h3',type:'commercial',capacity:3000,date:iso(-2),slot:'10:00',status:'confirmed',amount:4800,tanker:'t8',driver:'u13'}
  ]
});
if(process.argv.includes('--reset')){fs.writeFileSync(FILE,JSON.stringify(seed(),null,2));console.log('Demo data reset.');process.exit(0)}
let db=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):seed();
const save=()=>fs.writeFileSync(FILE,JSON.stringify(db,null,2));
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const err=(status,message)=>{let e=new Error(message);e.status=status;throw e};
const find=(key,id)=>db[key].find(x=>x.id===id);
const required=(value,label)=>{if(typeof value!=='string'||!value.trim())err(400,`${label} is required.`);return value.trim()};
const countUsed=(hydrant,date,ignore)=>db.bookings.filter(b=>b.id!==ignore&&b.hydrant===hydrant&&b.date===date&&!['pending','cancelled','rejected'].includes(b.status)).reduce((a,b)=>a+b.capacity,0);
const activeTrip=s=>['assigned','filled','en_route','arrived','delivered','confirmed','disputed','failed'].includes(s);
const overlaps=(a,b)=>Math.abs(Number(a.slice(0,2))*60+Number(a.slice(3))-Number(b.slice(0,2))*60-Number(b.slice(3)))<120;
const visible=(u,b)=>u.role==='admin'||u.role==='customer'&&b.customer===u.id||u.role==='officer'&&b.zone===u.zone||u.role==='operator'&&b.hydrant===u.hydrant||u.role==='driver'&&b.driver===u.id;
const role=(u,...roles)=>{if(!roles.includes(u.role))err(403,'Your role cannot perform this action.')};
const checkSlot=(h,b,ignore)=>{
 if(!h||!h.active)err(409,'Hydrant is unavailable.');
 if(typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||b.date<iso()||Number.isNaN(Date.parse(b.date))||new Date(b.date+'T12:00:00').toISOString().slice(0,10)!==b.date)err(400,'Choose today or a future valid date.');
 if(!/^\d\d:00$/.test(b.slot)||Number(b.slot.slice(0,2))<h.open||Number(b.slot.slice(0,2))+2>h.close)err(409,'Slot is outside hydrant opening hours.');
 if(countUsed(h.id,b.date,ignore)+b.capacity>h.quota)err(409,'Hydrant daily water quota would be exceeded.');
};
const allocateAllowed=(b,t,d)=>{
 if(!t||!t.active||t.hydrant!==b.hydrant||t.capacity!==b.capacity)err(409,'Choose an available tanker matching the water quantity.');
 if(!d||!d.active||d.role!=='driver'||d.hydrant!==b.hydrant)err(409,'Choose an available driver for this hydrant.');
 if(db.bookings.some(x=>x.id!==b.id&&x.date===b.date&&activeTrip(x.status)&&overlaps(x.slot,b.slot)&&(x.tanker===t.id||x.driver===d.id)))err(409,'Tanker or driver is already assigned to an overlapping slot.');
};
const expose=(u)=>{
 const bookings=db.bookings.filter(b=>visible(u,b));
 const hydrants=db.hydrants.filter(h=>u.role==='admin'||u.role==='customer'&&h.zone===u.zone||u.role==='officer'&&h.zone===u.zone||['driver','operator'].includes(u.role)&&h.id===u.hydrant).map(h=>({...h,reservedToday:countUsed(h.id,iso())}));
 const users=db.users.filter(x=>u.role==='admin'||x.id===u.id||u.role==='officer'&&x.zone===u.zone||['operator','driver'].includes(u.role)&& (x.hydrant===u.hydrant||bookings.some(b=>b.customer===x.id)));
 const subsidies=db.subsidies.filter(s=>u.role==='admin'||u.role==='customer'&&s.customer===u.id||u.role==='officer'&&s.zone===u.zone).map(({file,...rest})=>({...rest,hasFile:!!file}));
 const tankers=db.tankers.filter(t=>u.role==='admin'||['operator','driver'].includes(u.role)&&t.hydrant===u.hydrant);
 const totals={bookings:bookings.length,active:bookings.filter(b=>['approved','assigned','filled','en_route','arrived','pending'].includes(b.status)).length,delivered:bookings.filter(b=>['delivered','confirmed'].includes(b.status)).length,pending:bookings.filter(b=>b.status==='pending').length,billed:bookings.filter(b=>!['cancelled','rejected'].includes(b.status)).reduce((a,b)=>a+b.amount,0)};
 return {me:u,users,zones:db.zones,hydrants,tankers,bookings,subsidies,settings:db.settings,totals,demoUsers:db.users.filter(x=>x.active).map(({id,name,role})=>({id,name,role}))};
};
async function handle(req,res){
 try{
  const url=new URL(req.url,'http://localhost'),p=url.pathname;
  if(req.method==='GET'&&(p==='/'||p==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(path.join(DIR,'index.html')));return}
  if(!p.startsWith('/api/'))err(404,'Page not found.');
  if(req.method==='GET'&&p==='/api/demo-users')return send(res,200,db.users.filter(x=>x.active).map(({id,name,role})=>({id,name,role})));
  const u=find('users',req.headers['x-demo-user']||'u1');if(!u||!u.active)err(401,'Select a valid demo account.');
  if(req.method==='GET'&&p==='/api/state')return send(res,200,expose(u));
  if(req.method==='GET'&&p.startsWith('/api/proof/')){
    const s=find('subsidies',p.split('/').at(-1));
    if(!s||!s.file||!(u.role==='admin'||u.role==='customer'&&s.customer===u.id||u.role==='officer'&&s.zone===u.zone))err(404,'Proof file not available.');
    const bytes=Buffer.from(s.file.data,'base64');
    res.writeHead(200,{'Content-Type':s.file.mime,'Content-Disposition':`attachment; filename="${s.file.name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});res.end(bytes);return;
  }
  if(req.method==='GET'&&p==='/api/bookings'){
    let bookings=db.bookings.filter(b=>visible(u,b));
    if(url.searchParams.get('status')&&url.searchParams.get('status')!=='all')bookings=bookings.filter(b=>b.status===url.searchParams.get('status'));
    if(url.searchParams.get('q'))bookings=bookings.filter(b=>b.id.toLowerCase().includes(url.searchParams.get('q').toLowerCase()));
    return send(res,200,bookings.slice().reverse());
  }
  if(req.method!=='POST')err(404,'Unknown API route.');
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1800000)err(413,'Request too large.')}
  let body;try{body=JSON.parse(raw||'{}')}catch{err(400,'Invalid JSON.')}const action=body.action;
  if(p==='/api/register'){
    role(u,'admin','customer');const name=required(body.name,'Name'),phone=required(body.phone,'Phone'),address=required(body.address,'Address'),cnic=required(body.cnic,'CNIC');
    if(!/^03\d{9}$/.test(phone)||!/^\d{5}-\d{7}-\d$/.test(cnic))err(400,'Use a valid phone number and CNIC.');
    if(!find('zones',body.zone))err(400,'Choose a service zone.');
    if(db.users.some(x=>x.phone===phone||x.cnic===cnic))err(409,'Phone or CNIC is already registered.');
    const person={id:'u'+(Math.max(...db.users.map(x=>Number(x.id.slice(1))))+1),name,role:'customer',phone,cnic,address,zone:body.zone,subsidy:'none',active:true};db.users.push(person);save();return send(res,201,person);
  }
  if(p==='/api/booking'){
    role(u,'customer');const h=find('hydrants',body.hydrant),capacity=Number(body.capacity),type=body.type;
    if(!h||h.zone!==u.zone)err(400,'Select a hydrant serving your zone.');
    if(![1000,3000,6000].includes(capacity)||!['commercial','subsidized'].includes(type))err(400,'Choose a valid tanker size and booking type.');
    if(!db.tankers.some(t=>t.hydrant===h.id&&t.active&&t.capacity===capacity))err(409,'No active tanker of that size serves this hydrant.');
    const b={id:'PL-'+(Math.max(1000,...db.bookings.map(x=>Number(x.id.slice(3))))+1),customer:u.id,zone:u.zone,hydrant:h.id,date:body.date,slot:body.slot,capacity,type,status:type==='commercial'?'approved':'pending',amount:capacity/1000*db.settings[type]};
    if(type==='subsidized'){
      if(u.subsidy!=='verified')err(403,'Subsidy eligibility must be verified first.');
      if(u.category==='household'&&db.bookings.filter(x=>x.customer===u.id&&x.type===type&&x.date.slice(0,7)===b.date?.slice(0,7)&&!['cancelled','rejected'].includes(x.status)).length>=db.settings.monthlyLimit)err(409,'Monthly subsidized household booking limit reached.');
      checkSlot(h,{...b,capacity:0});
    }else checkSlot(h,b);
    db.bookings.push(b);save();return send(res,201,b);
  }
  if(p==='/api/subsidy'){
    role(u,'customer');if(['pending','verified'].includes(u.subsidy))err(409,'Your subsidy is already pending or verified.');
    if(!['household','hospital','mosque'].includes(body.category))err(400,'Select a subsidy category.');
    let proof=required(body.proof,'Proof description'),details=required(body.details,'Eligibility details');
    if(details.length<10)err(400,'Please add more evidence details.');
    const file=body.file;if(!file||!['application/pdf','image/jpeg','image/png'].includes(file.mime)||typeof file.data!=='string'||!/^[a-zA-Z0-9+/=]+$/.test(file.data))err(400,'Attach a PDF, JPG or PNG proof document.');
    const bytes=Buffer.from(file.data,'base64');if(bytes.length<10||bytes.length>1024*1024)err(400,'Proof file must be smaller than 1 MB.');
    const isValid=file.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':file.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!isValid)err(400,'File does not match its PDF or image format.');
    const storedFile={name:String(file.name||'proof').slice(0,100),mime:file.mime,data:file.data};
    const s={id:'s'+(db.subsidies.length+1),customer:u.id,zone:u.zone,category:body.category,proof,details,file:storedFile,status:'pending',submitted:iso()};db.subsidies.push(s);u.subsidy='pending';u.category=body.category;save();return send(res,201,s);
  }
  if(p==='/api/subsidy-action'){
    role(u,'officer');const s=find('subsidies',body.id);if(!s||s.zone!==u.zone)err(404,'Subsidy not found in your zone.');
    if(s.status!=='pending'||!['verify','reject'].includes(action))err(409,'Subsidy is not pending.');
    if(action==='reject'&&required(body.reason,'Reason').length<5)err(400,'Add a clear rejection reason.');
    s.status=action==='verify'?'verified':'rejected';s.reason=body.reason||'';find('users',s.customer).subsidy=s.status;find('users',s.customer).category=s.category;save();return send(res,200,s);
  }
  if(p==='/api/booking-action'){
    const b=find('bookings',body.id);if(!b||!visible(u,b))err(404,'Booking not found for this account.');
    const is=(r,s)=>{role(u,r);if(b.status!==s)err(409,`Booking must be ${s} first.`)};
    if(action==='cancel'){role(u,'customer');if(!['pending','approved'].includes(b.status))err(409,'Cannot cancel after dispatch.');b.status='cancelled';}
    else if(action==='approve'||action==='reject'){
      is('officer','pending');if(b.type!=='subsidized')err(409,'Only subsidized bookings need officer approval.');
      if(action==='approve'){
        if(find('users',b.customer).subsidy!=='verified')err(409,'Customer subsidy is not verified.');
        if(find('users',b.customer).category==='household'&&db.bookings.filter(x=>x.id!==b.id&&x.customer===b.customer&&x.type==='subsidized'&&x.date.slice(0,7)===b.date.slice(0,7)&&!['cancelled','rejected'].includes(x.status)).length>=db.settings.monthlyLimit)err(409,'Monthly subsidy limit reached.');
        checkSlot(find('hydrants',b.hydrant),b,b.id);b.status='approved';
      }else{if(required(body.reason,'Reason').length<5)err(400,'Add a rejection reason.');b.status='rejected';b.reason=body.reason;}
    }else if(action==='assign'){
      is('operator','approved');checkSlot(find('hydrants',b.hydrant),b,b.id);allocateAllowed(b,find('tankers',body.tanker),find('users',body.driver));b.tanker=body.tanker;b.driver=body.driver;b.status='assigned';
    }else if(action==='fill'||action==='depart'){
      is('operator',action==='fill'?'assigned':'filled');b.status=action==='fill'?'filled':'en_route';
    }else if(action==='arrive'||action==='deliver'||action==='fail'){
      role(u,'driver');if(b.driver!==u.id)err(403,'Not assigned to your trip.');
      if(action==='arrive'){if(b.status!=='en_route')err(409,'Depart first.');b.status='arrived'}
      if(action==='deliver'){if(b.status!=='arrived')err(409,'Mark arrived first.');b.status='delivered'}
      if(action==='fail'){if(!['en_route','arrived'].includes(b.status))err(409,'Delivery is not in progress.');b.reason=required(body.reason,'Reason');b.status='failed'}
    }else if(action==='confirm'||action==='dispute'){
      is('customer','delivered');if(action==='dispute')b.reason=required(body.reason,'Reason');b.status=action==='confirm'?'confirmed':'disputed';b.disputeResolved=false;
    }else if(action==='resolve'){
      is('officer','disputed');b.resolution=required(body.reason,'Resolution');b.disputeResolved=true;
    }else err(400,'Unsupported action.');
    save();return send(res,200,b);
  }
  // Hydrant operators may change availability only for resources at their OWN hydrant.
  // This endpoint checks ownership on the server; hiding UI controls is not security.
  if(p==='/api/resource-status'){
    role(u,'operator');
    if(!['hydrant','tanker'].includes(body.kind))err(400,'Select hydrant or tanker.');
    if(typeof body.active!=='boolean')err(400,'Availability must be true or false.');
    const list=body.kind==='hydrant'?'hydrants':'tankers';
    const resource=find(list,body.id);
    if(!resource)err(404,'Resource not found.');
    if(body.kind==='hydrant'?resource.id!==u.hydrant:resource.hydrant!==u.hydrant)
      err(403,'You may manage only your assigned hydrant and its tankers.');
    resource.active=body.active;
    save();
    return send(res,200,{id:resource.id,kind:body.kind,active:resource.active});
  }
  if(p==='/api/admin'){
    role(u,'admin');const type=body.type;
    if(type==='rate'){
      if(!['commercial','subsidized'].includes(body.name)||!Number.isInteger(Number(body.value))||Number(body.value)<1)err(400,'Invalid rate.');db.settings[body.name]=Number(body.value);
    }else if(type==='quota'){
      const h=find('hydrants',body.id),q=Number(body.value);if(!h||!Number.isInteger(q)||q<1000)err(400,'Invalid quota.');
      let biggest=Math.max(0,...Array.from(new Set(db.bookings.filter(b=>b.hydrant===h.id).map(b=>b.date)),d=>countUsed(h.id,d)));
      if(q<biggest)err(409,`Quota cannot be lower than ${biggest} gallons already reserved.`);h.quota=q;
    }else if(type==='toggle'){
      const list=body.kind==='hydrant'?'hydrants':body.kind==='tanker'?'tankers':null;if(!list)err(400,'Unknown resource type.');const x=find(list,body.id);if(!x)err(404,'Resource not found.');x.active=!x.active;
    }else if(type==='zone'){
      const name=required(body.name,'Zone name');if(db.zones.some(z=>z.name.toLowerCase()===name.toLowerCase()))err(409,'Zone already exists.');db.zones.push({id:'z'+(db.zones.length+1),name});
    }else if(type==='hydrant'){
      const name=required(body.name,'Hydrant name');const quota=Number(body.quota);if(!find('zones',body.zone)||!Number.isInteger(quota)||quota<1000)err(400,'Choose zone and valid quota.');db.hydrants.push({id:'h'+(db.hydrants.length+1),name,zone:body.zone,quota,open:7,close:19,active:true});
    }else if(type==='tanker'){
      const plate=required(body.name,'Vehicle plate');const capacity=Number(body.capacity);if(!find('hydrants',body.hydrant)||![1000,3000,6000].includes(capacity))err(400,'Select valid hydrant and tanker size.');db.tankers.push({id:'t'+(db.tankers.length+1),plate,capacity,hydrant:body.hydrant,active:true});
    }else if(type==='user'){
      const name=required(body.name,'Name'),newRole=body.role;if(!['officer','operator','driver'].includes(newRole))err(400,'Select staff role.');if(newRole==='officer'&&!find('zones',body.zone)||['operator','driver'].includes(newRole)&&!find('hydrants',body.hydrant))err(400,'Choose valid assignment.');db.users.push({id:'u'+(Math.max(...db.users.map(x=>Number(x.id.slice(1))))+1),name,role:newRole,zone:body.zone,hydrant:body.hydrant,active:true});
    }else err(400,'Unknown admin action.');
    save();return send(res,200,{ok:true});
  }
  err(404,'Unknown API route.');
 }catch(e){send(res,e.status||500,{error:e.message||'Unexpected error.'});if(!e.status)console.error(e)}
}
http.createServer(handle).listen(PORT,()=>console.log(`PaaniLink is running at http://localhost:${PORT}`));
