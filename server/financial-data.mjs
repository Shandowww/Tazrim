import {createHash} from 'node:crypto';
import {isVault} from '../dist/server/vault.js';
import {creditCards,categoryRegistryEntry} from '../dist/server/budget.js';
const VERSION=4;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const categoryId=name=>'category-'+hash(String(name).normalize('NFKC').trim());
const cents=value=>{const n=Math.round(Number(value)*100);if(!Number.isSafeInteger(n))throw Error('Unsafe financial amount');return n;};
const normalize=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
export function financialProjection(plan){
 const entities=[],transactions=[],months=[],categories=new Map(),accounts=new Map(),registeredCategories=new Map();
 for(const entry of plan.categoryRegistry?.entries??[])for(const name of [entry.label,...entry.aliases])registeredCategories.set(normalize(name),categoryRegistryEntry(plan,name));
 const add=(kind,id,label,payload,parent=null)=>entities.push({kind,id:String(id),label:label??null,parent_id:parent,payload:JSON.stringify(payload)});
 const category=name=>{if(!name)return null;const registered=registeredCategories.get(normalize(name)),label=registered?.label??name,id=registered?.id??categoryId(name);if(!categories.has(id)){const split=label.indexOf(' / '),parent=registered?.parentId??(split<0?null:category(label.slice(0,split)));categories.set(id,true);add('category',id,label,{name:label,aliases:registered?.aliases??[],color:registered?.color??null,archivedAt:registered?.archivedAt??null},parent);}return id;};
 for(const entry of plan.categoryRegistry?.entries??[])category(entry.label);
 for(const a of plan.bankImport?.accounts??[])accounts.set(a.id,a);
 for(const a of plan.cashPlanning?.accounts??[])accounts.set(a.id,{...accounts.get(a.id),...a});
 for(const [id,a]of accounts)add('account',id,a.label,a);
 for(const c of creditCards(plan))add('card',c.id,c.name,c,plan.cashPlanning?.cardAccounts?.[c.id]??null);
 for(const b of plan.bankImport?.batches??[])add('report','bank:'+b.id,b.file,b,b.accountId);
 for(const r of plan.reportInbox?.receipts??[])add('receipt',r.hash,null,r,r.target);
 for(const r of plan.reportInbox?.bindings??[])add('source-binding',r.key,null,r,r.target);
 for(const [accountId,a]of accounts)for(const [i,r] of (a.rules??[]).entries())add('classification-rule',hash([accountId,r.action??r.text,r.beneficiary??'',r.direction,i]),r.text,r,accountId);
 for(const [name,value]of Object.entries(plan.categoryGoals??{}))add('category-goal',category(name),name,{amountCents:cents(value)});
 for(const goal of plan.savingsGoals?.items??[])add('goal',goal.id,goal.name,goal);
 for(const a of plan.savingsGoals?.accounts??[])add('savings-account',a.id,a.name,a);
 if(plan.savingsGoals)add('savings-state','combined',null,plan.savingsGoals);
 for(const kind of ['expenses','loans','savingTransfers'])for(const e of plan[kind]??[])add(kind,e.id,e.name,e,e.cashAccountId??null);
 for(const [month,record]of Object.entries(plan.months??{}))for(const [field,amount]of Object.entries(record.values??{}))months.push({account_id:'',month,field,amount_cents:cents(amount),actual:+!!record.actual,payload:JSON.stringify(record)});
 for(const [month,records]of Object.entries(plan.cashPlanning?.months??{}))for(const [id,record]of Object.entries(records))for(const [field,amount]of Object.entries(record.values??{}))months.push({account_id:id,month,field,amount_cents:cents(amount),actual:+!!record.actual,payload:JSON.stringify(record)});
 const tx=e=>transactions.push({...e,merchant:e.merchant?normalize(e.merchant):null,payload:JSON.stringify(e.payload)});
 for(const e of plan.bankImport?.entries??[])tx({id:'bank:'+e.key,source:'bank',source_key:e.key,report_id:'bank:'+e.batchId,account_id:e.accountId,card_id:null,category_id:e.bankCategoryId?category(plan.categoryRegistry?.entries?.find(row=>row.id===e.bankCategoryId)?.label):null,merchant:e.source?.beneficiary||null,description:e.source?[e.source.description,e.source.details,e.source.purpose].filter(Boolean).join(' · '):null,occurred_on:e.source?.date??null,billing_month:e.month,due_on:null,amount_cents:e.cents,currency:e.source?.currency??'ILS',accounting:e.field==='exclude'?'excluded':'monthly-component',state:'confirmed',detail_level:e.source?'source-fields':'legacy-summary',payload:e});
 for(const e of plan.details??[])tx({id:e.id,source:e.statement?'card-statement':e.wallet?'apple-pay':'manual-detail',source_key:e.statement?.key??e.wallet?.eventId??null,report_id:e.statement?'card:'+e.method+':'+e.statement.dueDate:null,account_id:e.cashAccountId??plan.cashPlanning?.cardAccounts?.[e.method]??null,card_id:e.method?.startsWith('card')||(plan.creditCards??[]).some(c=>c.id===e.method)?e.method:null,category_id:category(e.category),merchant:e.name,description:e.name,occurred_on:e.date??null,billing_month:e.month,due_on:e.statement?.dueDate??null,amount_cents:-cents(e.amount),currency:'ILS',accounting:e.accounting,state:e.status,detail_level:'detail',payload:e});
 for(const r of plan.cardBilling?.reports??[]){add('card-billing',r.cardId+':'+r.dueDate,null,r,r.cardId);add('report','card:'+r.cardId+':'+r.dueDate,null,{...r,type:'card-billing'},r.accountId);}
 return{entities,transactions,months};
}
function synchronize(db,scope,row){
 const p=row.data?JSON.parse(row.data):null,encrypted=isVault(p),at=row.updated_at;
 const opaque=p&&!('startMonth' in p);
 const projection=p&&!encrypted&&!opaque?financialProjection(p):{entities:[],transactions:[],months:[]};
 const oldMonths=db.prepare('SELECT * FROM financial_months WHERE scope=?').all(scope).map(e=>({...e,id:JSON.stringify([e.account_id,e.month,e.field])}));
 const old=db.prepare('SELECT * FROM financial_entities WHERE scope=?').all(scope),oldTx=db.prepare('SELECT * FROM financial_transactions WHERE scope=?').all(scope);
 db.prepare('INSERT INTO financial_scopes VALUES(?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,model_version=excluded.model_version,encrypted=excluded.encrypted,updated_at=excluded.updated_at').run(scope,row.revision,VERSION,+(encrypted||opaque),at);
 const audit=db.prepare('INSERT INTO financial_audit(scope,revision,kind,entity_id,action,before_hash,after_hash,recorded_at) VALUES(?,?,?,?,?,?,?,?)');
 if(encrypted||opaque)db.prepare('DELETE FROM financial_audit WHERE scope=?').run(scope);
 else for(const [kind,previous,current]of [['entity',old,projection.entities],['transaction',oldTx,projection.transactions],['month',oldMonths,projection.months.map(e=>({...e,id:JSON.stringify([e.account_id,e.month,e.field])}))]]){
  const before=new Map(previous.map(e=>[(e.kind??kind)+':'+e.id,e.payload])),after=new Map(current.map(e=>[(e.kind??kind)+':'+e.id,e.payload]));
  for(const key of new Set([...before.keys(),...after.keys()]))if(before.get(key)!==after.get(key))audit.run(scope,row.revision,kind,key,before.has(key)?after.has(key)?'update':'delete':'insert',before.has(key)?hash(before.get(key)):null,after.has(key)?hash(after.get(key)):null,at);
 }
 // Keep unchanged derived rows in place; all operations remain inside the
 // authoritative budget transaction. Compare every projected column, not only
 // payload: category aliases can change a derived identity without source edits.
 const synchronizeRows=(table,keys,columns,current,previousRows)=>{
  const identity=row=>JSON.stringify(keys.map(key=>row[key])),previous=new Map(previousRows.map(row=>[identity(row),row])),wanted=new Set();
  const remove=db.prepare(`DELETE FROM ${table} WHERE scope=? AND ${keys.map(key=>key+'=?').join(' AND ')}`);
  const names=['scope',...columns],upsert=db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(()=>'?').join(',')}) ON CONFLICT(scope,${keys.join(',')}) DO UPDATE SET ${columns.filter(column=>!keys.includes(column)).map(column=>column+'=excluded.'+column).join(',')}`);
  for(const row of current){const id=identity(row),old=previous.get(id);wanted.add(id);if(old&&columns.every(column=>old[column]===(row[column]??null)))continue;upsert.run(scope,...columns.map(column=>row[column]??null));}
  for(const [id,row]of previous)if(!wanted.has(id))remove.run(scope,...keys.map(key=>row[key]));
 };
 synchronizeRows('financial_entities',['kind','id'],['kind','id','label','parent_id','payload'],projection.entities,old);
 synchronizeRows('financial_transactions',['id'],['id','source','source_key','report_id','account_id','card_id','category_id','merchant','description','occurred_on','billing_month','due_on','amount_cents','currency','accounting','state','detail_level','payload'],projection.transactions,oldTx);
 synchronizeRows('financial_months',['account_id','month','field'],['account_id','month','field','amount_cents','actual','payload'],projection.months,oldMonths);
}
export function synchronizeFinancialData(db){
 for(const row of db.prepare("SELECT scope FROM financial_scopes f WHERE NOT EXISTS(SELECT 1 FROM plans p WHERE f.scope='personal:'||p.user_id) AND NOT EXISTS(SELECT 1 FROM budgets b WHERE f.scope='budget:'||b.id)").all()){db.prepare('DELETE FROM financial_audit WHERE scope=?').run(row.scope);db.prepare('DELETE FROM financial_scopes WHERE scope=?').run(row.scope);}
 for(const [table,prefix,key]of [['plans','personal:','user_id'],['budgets','budget:','id']]){
  const rows=db.prepare(`SELECT p.* FROM ${table} p LEFT JOIN financial_scopes f ON f.scope=?||p.${key} WHERE f.scope IS NULL OR f.revision<>p.revision OR f.model_version<>?`).all(prefix,VERSION);
  for(const row of rows)synchronize(db,prefix+row[key],row);
 }
}
export function queryFinancialTransactions(db,scope,filters={}){
 const state=db.prepare('SELECT * FROM financial_scopes WHERE scope=?').get(scope);if(filters.revision!==undefined&&Number(filters.revision)!==(state?.revision??0))return{conflict:true,revision:state?.revision??0};if(state?.encrypted)return{encrypted:true,revision:state.revision};
 const where=['scope=?'],args=[scope];
 for(const [param,column]of Object.entries({account:'account_id',card:'card_id',category:'category_id',month:'billing_month',source:'source',report:'report_id',state:'state'}))if(filters[param]){where.push(column+'=?');args.push(filters[param]);}
 for(const [param,column,op]of [['from','occurred_on','>='],['to','occurred_on','<='],['min','amount_cents','>='],['max','amount_cents','<=']])if(filters[param]!==undefined){where.push(column+op+'?');args.push(filters[param]);}
 if(filters.q){where.push("(merchant LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");const term='%'+filters.q.replace(/[\\%_]/g,'\\$&')+'%';args.push(term,term);}
 const limit=Math.min(200,Math.max(1,Number(filters.limit)||50)),offset=Math.max(0,Math.min(100000,Number(filters.offset)||0));
 const total=db.prepare('SELECT COUNT(*) AS count FROM financial_transactions WHERE '+where.join(' AND ')).get(...args).count;
 const rows=db.prepare('SELECT id,source,source_key,report_id,account_id,card_id,category_id,merchant,description,occurred_on,billing_month,due_on,amount_cents,currency,accounting,state,detail_level FROM financial_transactions WHERE '+where.join(' AND ')+' ORDER BY billing_month DESC,occurred_on DESC,id LIMIT ? OFFSET ?').all(...args,limit,offset);
 return{revision:state?.revision??0,total,limit,offset,rows};
}
