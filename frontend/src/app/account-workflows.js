/** Navigation only: existing editors keep all actor, role, revision and source checks. */
export function accountWorkflows(kind, id = '', readOnly = false) {
 const key=encodeURIComponent(id),card=kind==='cards'
 const common=card?[
  ['/card-setup/new','הוספת כרטיס',true],['/card-setup','ניהול פרטי הכרטיסים',true],
 ]:[['/accounts/new','הוספת חשבון',true],['/accounts/assignments','שיוך כרטיסים והתחייבויות',true],['/accounts/transfers','העברות בין חשבונות',true]]
 const specific=!id?[]:card?[
  ['/categories?card='+key,'עסקאות ופירוט שמור',false],['/card-setup/'+key,'עריכת פרטי הכרטיס',true],
  ['/cards/'+key+'/billing','עדכון סך החיוב',true],['/cards/'+key+'/payer','שיוך חשבון משלם',true],
  ['/cards/'+key+'/no-activity','חודש ללא פעילות · אישור וביטול',true],['/cards/'+key+'/stop','הפסקת הערכות עתידיות',true],
 ]:[['/accounts/'+key+'/activity','תנועות ופירוט שמור',false],['/accounts/'+key+'/edit','עריכת פרטי החשבון והיתרה',true],
  ['/accounts/'+key+'/monthly','דיווח חודשי לחשבון',true],['/accounts/'+key+'/assign-remainder','שיוך סכומים חודשיים ללא חשבון',true],
  ['/accounts/transfers?account='+key,'העברות של החשבון',true]]
 return (id?specific:[...common,['/monthly','עדכון נתוני החודש',true],['/upload','דוחות ומקורות שמורים',false],['/upload/history','היסטוריית קליטה וביטול',false]])
  .filter(([, ,write])=>!readOnly||!write).map(([href,label])=>({href:String(href),label:String(label)}))
}
