import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {clone,demoPlan,detailCategories,withRegisteredCategory,renameRegisteredCategory,moveRegisteredCategory,setRegisteredCategoryColor} from '../src/budget.js'
import {householdCategory} from '../frontend/src/app/household-categories.js'

const picturedCategories=['בילויים / חופשות וטיולים','מזון / סופר ומכולת','משפחה / מתנות ואירועים','קניות','מזון','מזון / מסעדות ובתי קפה','בילויים / מנויים ודיגיטל','בריאות / ביטוח בריאות','בילויים','בריאות / כושר וספורט','קניות / אלקטרוניקה','תחבורה / תחבורה ציבורית','משפחה','בריאות / פארם','דיור / חשבונות הבית','כספים / תרומות']

test('Pictured categories and all built-in subcategories have distinct automatic colours without writes',()=>{
 const plan=clone(demoPlan),before=clone(plan)
 for(const labels of [picturedCategories,detailCategories]){
  const colors=labels.map(label=>householdCategory(label,plan).color)
  assert.equal(new Set(colors).size,labels.length)
 }
 assert.deepEqual(plan,before)
})

test('Colours are independent of amounts, order, filtering and added categories',()=>{
 const plan=clone(demoPlan),colors=new Map(picturedCategories.map(label=>[label,householdCategory(label,plan).color]))
 const next=withRegisteredCategory(plan,'מזון / קטגוריה אישית')
 next.details=[]
 for(const label of [...picturedCategories].reverse())assert.equal(householdCategory(label,next).color,colors.get(label))
 assert.notEqual(householdCategory('מזון / קטגוריה אישית',next).color,householdCategory('מזון / קטגוריה אחרת',next).color)
})

test('Subcategory identity retains its colour through registration, rename and move; personal colours win',()=>{
 let plan=clone(demoPlan)
 const original=householdCategory('מזון / סופר ומכולת',plan).color
 plan=withRegisteredCategory(plan,'מזון / סופר ומכולת')
 assert.equal(householdCategory('מזון / סופר ומכולת',plan).color,original)
 plan=renameRegisteredCategory(plan,'מזון / סופר ומכולת','מזון / הסופר שלי')
 plan=moveRegisteredCategory(plan,'מזון / הסופר שלי','קניות')
 assert.equal(householdCategory('קניות / הסופר שלי',plan).color,original)
 assert.equal(householdCategory('מזון / סופר ומכולת',plan).color,original)
 plan=setRegisteredCategoryColor(plan,'קניות / הסופר שלי','#123456')
 assert.equal(householdCategory('קניות / הסופר שלי',plan).color,'#123456')
 assert.equal(householdCategory('מזון / סופר ומכולת',plan).color,'#123456')
})

test('Every automatic colour token resolves in both light and dark themes',()=>{
 const css=readFileSync(new URL('../frontend/src/app.css',import.meta.url),'utf8')
 const themes=[':root','.dark'].map(selector=>css.match(new RegExp(`${selector.replace('.', '\\.')}\\{--household-cat-green:[^}]+\\}`))[0])
 for(const label of [...detailCategories,'הלוואות','קטגוריה אישית / חדשה']){
  const color=householdCategory(label,clone(demoPlan)).color
  for(const [,token] of color.matchAll(/var\((--[a-z0-9-]+)\)/g)){
   const values=themes.map(theme=>theme.match(new RegExp(`${token}:([^;}]+)`))?.[1])
   assert.ok(values.every(Boolean),`${label}: ${token}`)
   assert.notEqual(values[0],values[1])
  }
 }
})
