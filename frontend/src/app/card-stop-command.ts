import {activeCards,stopCardForecast,validatePlan} from '../../../src/budget.js'
export function prepareCardStop(plan:any,id:string,month:string,confirmed:boolean){
 if(!validatePlan(plan)||typeof month!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)||!activeCards(plan,month).some((card:any)=>card.id===id))throw Error('יש לבחור כרטיס פעיל בחודש שנבחר.')
 if(confirmed!==true)throw Error('יש לאשר את הפסקת ההערכות לכרטיס בלבד.')
 return stopCardForecast(plan,id,month)
}
