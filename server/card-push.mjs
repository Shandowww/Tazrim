// Legacy authenticated API retained for older clients; card push delivery is retired.
export const israelDate=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
export function createCardPush(db){
 db.exec(`CREATE TABLE IF NOT EXISTS push_keys(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_key TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS push_devices(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,endpoint_hash TEXT UNIQUE NOT NULL,subscription TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS push_schedules(user_id TEXT NOT NULL,budget_id TEXT NOT NULL,revision INTEGER NOT NULL,cards TEXT NOT NULL,PRIMARY KEY(user_id,budget_id));
 CREATE TABLE IF NOT EXISTS push_deliveries(device_id TEXT NOT NULL,budget_id TEXT NOT NULL,card_id TEXT NOT NULL,due_date TEXT NOT NULL,state TEXT NOT NULL,attempt_at INTEGER NOT NULL,PRIMARY KEY(device_id,budget_id,card_id,due_date));`);
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 async function handle(request,user){
  const path=new URL(request.url).pathname;
  if(request.method==='GET')return json({enabled:false,devices:[]});
  if(request.method==='DELETE'&&path==='/api/card-push'){
   let body;try{body=await request.json();}catch{return json({error:'הבקשה אינה תקינה.'},400);}
   if(typeof body?.id!=='string'||body.id.length>100)return json({error:'הבקשה אינה תקינה.'},400);
   const owned=db.prepare('SELECT id FROM push_devices WHERE id=? AND user_id=?').get(body.id,user.id);
   if(owned){db.prepare('DELETE FROM push_deliveries WHERE device_id=?').run(owned.id);db.prepare('DELETE FROM push_devices WHERE id=? AND user_id=?').run(owned.id,user.id);}return json({ok:true});
  }
  return json({error:'תזכורות הדוחות מופיעות כעת במסך סטטוס. פוש הכרטיסים הופסק.'},410);
 }
 return {handle,tick:async()=>{}};
}
