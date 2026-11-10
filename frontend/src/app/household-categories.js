import {categoryRegistryEntry,categoryColor,detailCategories} from '../../../src/budget.js'
const tones={food:'green',pharmacy:'purple',fuel:'orange',shopping:'blue',home:'rose',loans:'teal',other:'neutral'}
const rootTones={'בילויים':'magenta','חינוך':'indigo','משפחה':'olive','כספים':'brown','ילדים ותינוקות':'gold'}
const categoryIndexes=new Map(detailCategories.map((label,index)=>[label,index]))
function semantic(label){const root=String(label).split(' / ')[0];if(/מזון/.test(root))return 'food';if(/בריאות|פארם/.test(root))return 'pharmacy';if(/תחבורה|דלק/.test(root))return 'fuel';if(/קניות/.test(root))return 'shopping';if(/דיור|בית/.test(root))return 'home';if(/הלווא/.test(root))return 'loans';if(/אחר|ללא סיווג|לא מסווג/.test(root))return 'other';return null}
function automaticColor(label,kind){
 const rootTone=!label.includes(' / ')&&(rootTones[label]??tones[kind])
 if(rootTone)return `var(--household-cat-${rootTone})`
 let hash=0;for(const character of label)hash=(hash*31+character.codePointAt(0))>>>0
 const index=categoryIndexes.get(label)??hash
 const hue=Number(((23+index*137.508)%360).toFixed(3)),shade=index%3
 return `hsl(${hue} ${62+shade*6}% var(--household-cat-lightness-${shade}))`
}
export function householdCategory(category,plan){
 const entry=categoryRegistryEntry(plan,category),original=String(entry?.aliases[0]??entry?.label??category)
 const kind=semantic(original)
 const custom=entry?.color&&(entry.colorCustom||entry.color!==categoryColor(original))&&/^#[0-9a-f]{6}$/i.test(entry.color)?entry.color:null
 return {id:entry?.id??original,kind:kind??'other',color:custom??automaticColor(original,kind)}
}
