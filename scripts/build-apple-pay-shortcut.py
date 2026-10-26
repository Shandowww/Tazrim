"""Generate a secret-free sender. Sign with macOS shortcuts sign before release."""
import plistlib
import uuid
from pathlib import Path

actions=[]
def uid(): return str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/apple-pay/v1/'+str(len(actions)))).upper()
def direct(identifier, name='Dictionary Value'):
    return {'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':identifier,'OutputName':name}}
def text(value): return {'WFSerializationType':'WFTextTokenString','Value':{'string':value}}
def token(identifier,name='Dictionary Value',prefix=''):
    return {'WFSerializationType':'WFTextTokenString','Value':{'string':prefix+'\ufffc','attachmentsByRange':{'{%d, 1}'%len(prefix):direct(identifier,name)['Value']}}}
def fields(values):
    return {'WFSerializationType':'WFDictionaryFieldValue','Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':text(k),'WFValue':v if isinstance(v,dict) else text(v)} for k,v in values.items()]}}
def add(action,**params):
    identifier=uid();params['UUID']=identifier
    actions.append({'WFWorkflowActionIdentifier':'is.workflow.actions.'+action,'WFWorkflowActionParameters':params})
    return identifier
secret=add('gettext',WFTextActionText='')
add('comment',WFCommentActionText='Budgit: קיצור שליחה בלבד. באוטומציית Wallet העבירו מילון עם merchant, amount, currency מתוך העסקה. אין לשלוח נתוני דמה או לקבוע ILS לעסקאות במטבע אחר. זמן הקליטה יסומן כאומדן. אין תור אופליין ואין ניסיון חוזר אוטומטי.')
shortcut_input={'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ExtensionInput'}}
values={k:add('getvalueforkey',WFInput=shortcut_input,WFDictionaryKey=k) for k in ['merchant','amount','currency']}
# Fail closed before HTTP when setup/input is incomplete; no manual fabricated fallback.
for identifier,name in [(secret,'Text')]+[(v,'Dictionary Value') for v in values.values()]:
    group=str(uuid.uuid5(uuid.NAMESPACE_URL,'budgit/guard/'+identifier)).upper()
    add('conditional',WFInput={'Type':'Variable','Variable':direct(identifier,name)},WFCondition=101,GroupingIdentifier=group,WFControlFlowMode=0)
    add('notification',WFNotificationActionTitle='Budgit — לא נשלחה רכישה',WFNotificationActionBody='חסר מפתח או קלט עסקה. בדקו את המפתח בפעולת הטקסט הראשונה ואת מילון merchant / amount / currency באוטומציה.')
    add('exit')
    add('conditional',GroupingIdentifier=group,WFControlFlowMode=2)
randoms=[add('number.random',WFRandomNumberMinimum=100000000,WFRandomNumberMaximum=999999999) for _ in range(4)]
event_text={'WFSerializationType':'WFTextTokenString','Value':{'string':'\ufffc-\ufffc-\ufffc-\ufffc','attachmentsByRange':{'{%d, 1}'%(i*2):direct(v,'Random Number')['Value'] for i,v in enumerate(randoms)}}}
event=add('gettext',WFTextActionText=event_text)
response=add('downloadurl',WFURL='https://budgit.duckdns.org/api/imports/apple-pay',WFHTTPMethod='POST',WFHTTPBodyType='JSON',ShowHeaders=True,WFHTTPHeaders=fields({'Authorization':token(secret,'Text','Bearer '),'Content-Type':'application/json'}),WFJSONValues=fields({'eventId':token(event,'Text'),**{k:token(v) for k,v in values.items()}}))
error=add('getvalueforkey',WFInput=direct(response,'Contents of URL'),WFDictionaryKey='error')
group=str(uuid.uuid5(uuid.NAMESPACE_URL,'budgit/server-error')).upper()
add('conditional',WFInput={'Type':'Variable','Variable':direct(error)},WFCondition=100,GroupingIdentifier=group,WFControlFlowMode=0)
add('notification',WFNotificationActionTitle='Budgit — הייבוא לא נשמר',WFNotificationActionBody=token(error))
add('exit')
add('conditional',GroupingIdentifier=group,WFControlFlowMode=2)
# No success notification on each purchase; receipt must be checked in the app.
workflow={'WFWorkflowName':'Budgit — קליטת Apple Pay','WFWorkflowClientVersion':'5037.0.19','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFQuickActionSurfaces':[],'WFWorkflowTypes':[],'WFWorkflowHasShortcutInputVariables':True,'WFWorkflowInputContentItemClasses':['WFDictionaryContentItem'],'WFWorkflowOutputContentItemClasses':[],'WFWorkflowIcon':{'WFWorkflowIconGlyphNumber':59452,'WFWorkflowIconStartColor': 2071128575},'WFWorkflowImportQuestions':[{'ActionIndex':0,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':'הדביקו את מפתח החיבור האישי מ־Budgit ← הגדרות ← חיבורים וייבוא. הדביקו רק את המפתח, בלי Bearer. הקיצור מיועד לכרטיס ולתקציב שבחרתם.'}],'WFWorkflowActions':actions}
Path('shortcuts/budgit-apple-pay.wflow').write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_BINARY,sort_keys=False))

# iOS 27: one native Wallet trigger with direct transaction properties.
# TriggerOutput shape verified with a native macOS27 export; property names
# appear in Apple's Wallet transaction inspector. Card picker remains local.
import copy
ios27=copy.deepcopy(workflow)
ios27['WFWorkflowName']='Budgit — Apple Pay iOS 27'
ios27['WFWorkflowClientVersion']='5037.111'
ios27['WFWorkflowTriggers']=[{'WFTriggerIdentifier':'WFWalletTransactionTrigger','WFTriggerSerializedParameters':{},'WFTriggerUUID':str(uuid.uuid5(uuid.NAMESPACE_URL,'budgit/apple-pay/ios27/wallet/v1')).upper()}]
new_actions=[]
for action in ios27['WFWorkflowActions']:
    params=action['WFWorkflowActionParameters']
    if action['WFWorkflowActionIdentifier']=='is.workflow.actions.getvalueforkey' and params.get('WFDictionaryKey') in ['merchant','amount','currency']:
        key=params['WFDictionaryKey']
        value='' if key=='currency' else {'WFSerializationType':'WFTextTokenString','Value':{'string':'\ufffc','attachmentsByRange':{'{0, 1}':{'Type':'TriggerOutput','TriggerIdentifier':'WFWalletTransactionTrigger','Aggrandizements':[{'Type':'WFPropertyVariableAggrandizement','PropertyName':{'merchant':'Merchant','amount':'Amount'}[key]}]}}}}
        action={'WFWorkflowActionIdentifier':'is.workflow.actions.gettext','WFWorkflowActionParameters':{'UUID':params['UUID'],'WFTextActionText':value}}
    if action['WFWorkflowActionIdentifier']=='is.workflow.actions.comment':
        params['WFCommentActionText']='iOS 27: בחרו את הכרטיס בטריגר Wallet והפעילו Automation. המטבע שהוגדר בהתקנה חל על כל הרכישות: הפעילו רק כשכל רכישה בכרטיס משתמשת במטבע הזה. אחרת השאירו כבוי והשתמשו בגרסה הידנית עם מטבע לכל עסקה. לפני ההפעלה כבו את האוטומציה הישנה. אין תור אופליין.'
    if action['WFWorkflowActionIdentifier']=='is.workflow.actions.notification' and params.get('WFNotificationActionTitle')=='Budgit — לא נשלחה רכישה':
        params['WFNotificationActionBody']='חסר מפתח, מטבע או קלט Wallet. בדקו את ההגדרה ואת הכרטיס בטריגר. הפעלה ידנית אינה מספקת עסקה.'
    new_actions.append(action)
ios27['WFWorkflowActions']=new_actions
# Extracted values now come from Text actions, retaining all guards and IDs.
for action in new_actions:
    def rename_outputs(value):
        if isinstance(value,dict):
            if value.get('Type')=='ActionOutput' and value.get('OutputUUID') in values.values(): value['OutputName']='Text'
            for v in value.values(): rename_outputs(v)
        elif isinstance(value,list):
            for v in value: rename_outputs(v)
    rename_outputs(action)
ios27['WFWorkflowImportQuestions'].append({'ActionIndex':4,'Category':'Parameter','DefaultValue':'','ParameterKey':'WFTextActionText','Text':'מהו קוד המטבע לכל העסקאות בכרטיס הזה? לדוגמה ILS לשקלים. אין זיהוי מטבע אוטומטי. אם הכרטיס משמש גם למטבעות אחרים, השאירו ריק ואל תפעילו את האוטומציה; השתמשו בגרסה הידנית.'})
Path('shortcuts/budgit-apple-pay-ios27.wflow').write_bytes(plistlib.dumps(ios27,fmt=plistlib.FMT_BINARY,sort_keys=False))
