// Effective annual return converted to monthly compounding; contributions at month-end.
// Pure hypothetical calculation: never modifies budgets, actual deposits or goal balances.
export function investmentProjection({initial,monthly,years,annualReturn,annualIncrease=0}){
 const limits={initial:[0,100000000],monthly:[0,100000000],years:[1,50],annualReturn:[-50,50],annualIncrease:[0,20]};
 for(const [key,[min,max]] of Object.entries(limits)){const value={initial,monthly,years,annualReturn,annualIncrease}[key];if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||key==='years'&&!Number.isInteger(value))throw Error('יש לבדוק את הסכומים, האחוזים ומספר השנים (1–50).');}
 const rate=Math.pow(1+annualReturn/100,1/12)-1;
 let balance=initial,contributed=initial,deposit=monthly;const rows=[{year:0,balance,contributed,growth:0,monthlyDeposit:deposit}];
 for(let month=1;month<=years*12;month++){
  if(month>1&&(month-1)%12===0)deposit*=1+annualIncrease/100;
  balance=balance*(1+rate)+deposit;contributed+=deposit;
  if(month%12===0)rows.push({year:month/12,balance,contributed,growth:balance-contributed,monthlyDeposit:deposit});
 }
 return{rows,...rows.at(-1)};
}
