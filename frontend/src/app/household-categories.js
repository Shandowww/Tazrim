import {categoryRegistryEntry,categoryColor} from '../../../src/budget.js'
const tones={food:'green',pharmacy:'purple',fuel:'orange',shopping:'blue',home:'rose',loans:'teal',other:'neutral'}
function semantic(label){const root=String(label).split(' / ')[0];if(/מזון/.test(root))return 'food';if(/בריאות|פארם/.test(root))return 'pharmacy';if(/תחבורה|דלק/.test(root))return 'fuel';if(/קניות/.test(root))return 'shopping';if(/דיור|בית/.test(root))return 'home';if(/הלווא/.test(root))return 'loans';if(/אחר|ללא סיווג|לא מסווג/.test(root))return 'other';return null}
/** Registry aliases retain the original category identity through rename/move.
 * Explicit saved colours win; automatic legacy colours are presented with the approved palette.
 * No registry, source labels or financial amounts are written here. */
export function householdCategory(category,plan){
 const entry=categoryRegistryEntry(plan,category),original=entry?.aliases[0]??entry?.label??category
 const kind=semantic(original)
 const custom=entry?.color&&entry.color!==categoryColor(original)&&/^#[0-9a-f]{6}$/i.test(entry.color)?entry.color:null
 let hash=0;for(const ch of String(original).split(' / ')[0])hash=(hash*31+ch.codePointAt(0))>>>0
 const tone=kind?tones[kind]:Object.values(tones)[hash%Object.values(tones).length]
 return {id:entry?.id??String(original),kind:kind??'other',color:custom??`var(--household-cat-${tone})`}
}
