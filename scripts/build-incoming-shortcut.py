"""Generate secret-free incoming-report Shortcuts. Native/device QA is required.

The folder variant exposes its native folder selector in the setup block.
No device-specific File bookmark is embedded in the generated workflow.
Original files are retained by default; opt-in cleanup requires a fresh full-import
receipt and an immediate byte-hash recheck. A connection-local catalog skips files
already uploaded. --qa-config permits only the disposable loopback endpoint.
"""
import argparse
import json
import plistlib
import re
import uuid
from pathlib import Path
from urllib.parse import urlsplit


def build(config=None, folder_input=True):
    setup = config or {}
    endpoint = setup.get('endpoint', 'https://budgit.duckdns.org/api/imports/incoming')
    if config:
        url = urlsplit(endpoint)
        if url.scheme != 'http' or url.hostname != '127.0.0.1' or url.path != '/api/imports/incoming' or url.query or url.fragment or url.username:
            raise ValueError('QA accepts only the local synthetic incoming endpoint')
        if not re.fullmatch(r'Budgit-Incoming-QA-[A-Za-z0-9-]+', setup.get('qaName', 'Budgit-Incoming-QA-v2')):
            raise ValueError('Invalid synthetic workflow name')
        if len(setup.get('token', '')) != 43:
            raise ValueError('Use the disposable QA token')
    actions = []

    def add(name, **params):
        identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/v1/' + str(len(actions)))).upper()
        params['UUID'] = identifier
        actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.' + name, 'WFWorkflowActionParameters': params})
        return identifier

    def ref(identifier, name):
        return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': 'ActionOutput', 'OutputUUID': identifier, 'OutputName': name}}

    def variable(name):
        return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': 'Variable', 'VariableName': name}}

    def text(value, *refs):
        attachments, offset = {}, 0
        for reference in refs:
            offset = value.index('\ufffc', offset)
            attachments['{%d, 1}' % (len(value[:offset].encode('utf-16-le')) // 2)] = reference['Value']
            offset += 1
        return {'WFSerializationType': 'WFTextTokenString', 'Value': {'string': value, 'attachmentsByRange': attachments}}

    def begin(value, condition=4, expected=None):
        group = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/condition/' + str(len(actions)))).upper()
        p = {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFInput': {'Type': 'Variable', 'Variable': value}, 'WFCondition': condition}
        if expected is not None:
            # Dictionary Value / Type outputs have an ambiguous native content
            # type. Shortcuts can select a different comparison parameter and
            # display an empty RHS despite WFConditionalActionString being set.
            # Materialize Text before *every* equality, including hash/type checks.
            comparison = ref(add('gettext', WFTextActionText=text('\ufffc', value)), 'Text')
            p['WFInput'] = {'Type': 'Variable', 'Variable': comparison}
            p['WFConditionalActionString'] = expected
        add('conditional', **p)
        return group

    def end(group):
        add('conditional', GroupingIdentifier=group, WFControlFlowMode=2)

    def notice(message):
        add('notification', WFNotificationActionTitle='Budgit — סנכרון דוחות', WFNotificationActionBody=message)

    def empty_text(value):
        # Text with an empty string is still one native content item. Testing
        # Has Any Value therefore misclassifies an absent receipt/error/key.
        concrete = ref(add('gettext', WFTextActionText=text('\ufffc', value)), 'Text')
        length = ref(add('count', Input=concrete, WFCountType='Characters'), 'Count')
        return begin(length, expected='0')

    def require(value, message, items=False):
        group = begin(ref(add('count', Input=value, WFCountType='Items'), 'Count'), expected='0') if items else empty_text(value)
        notice(message)
        add('exit')
        end(group)

    def equal_or_stop(value, expected, message):
        group = begin(value, expected=expected)
        add('conditional', GroupingIdentifier=group, WFControlFlowMode=1)
        notice(message)
        add('exit')
        end(group)

    questions = []
    add('comment', WFCommentActionText='הגדרה 1/3 — תיקיית הדוחות. בפעולת File שמתחת בחרו את Downloads/Budgit דרך בורר הקבצים של iPhone. אין לבחור תיקייה דרך Receive … from. בחרו תיקייה בלבד, ולא קובץ יחיד.')
    if folder_input:
        folder_index = len(actions)
        incoming = ref(add('file'), 'File')
        questions.append({'ActionIndex': folder_index, 'Category': 'Parameter', 'ParameterKey': 'WFFile', 'Text': 'בחרו את תיקיית Downloads/Budgit במכשיר שלכם.'})
    else:
        incoming = {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': 'ExtensionInput'}}
    add('comment', WFCommentActionText='הגדרה 2/3 — מפתח העלאה. הדביקו בפעולת Text שמתחת רק מפתח חיבור מסנכרון דוחות ב־Budgit. אין להזין סיסמה או מפתח שחזור ואין לשתף עותק עם מפתח.')
    token_index = len(actions)
    secret = ref(add('gettext', WFTextActionText=setup.get('token', '')), 'Text')
    if not config:
        questions.append({'ActionIndex': token_index, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '', 'Text': 'הדביקו רק את מפתח ההעלאה, בלי Bearer. אין להזין סיסמה או מפתח שחזור.'})
    add('comment', WFCommentActionText='הגדרה 3/3 — שמירת קבצים. השאירו retain בפעולת Text שמתחת: המקורות נשארים במכשיר. הגרסה הזו אינה מוחקת או מעבירה קבצים; אין לשנות ערך זה.')
    cleanup_setting = ref(add('gettext', WFTextActionText='retain'), 'Text')
    add('comment', WFCommentActionText='סוף ההגדרות — אין צורך לערוך את הפעולות שמתחת. הפענוח, השיוך והשמירה הכספית מחייבים אישור בתוך Budgit. תזמון מוגדר בנפרד רק לאחר בדיקה ידנית. גרסת QA עם כתובת 127.0.0.1 עובדת במחשב הבדיקה בלבד, לא ב־iPhone.')
    require(secret, 'חסר מפתח העלאה. מלאו את Text תחת הגדרה 2/3.')
    require(incoming, 'בחרו תיקייה בפעולת File תחת הגדרה 1/3.' if folder_input else 'יש להעביר קובצי דוח מגיליון השיתוף.', items=True)
    headers = {'WFSerializationType': 'WFDictionaryFieldValue', 'Value': {'WFDictionaryFieldValueItems': [
        {'WFItemType': 0, 'WFKey': text('Authorization'), 'WFValue': text('Bearer \ufffc', secret)},
        {'WFItemType': 0, 'WFKey': text('Content-Type'), 'WFValue': text('application/octet-stream')},
    ]}}
    catalog = ref(add('downloadurl', WFURL=endpoint + '?catalog=1', WFHTTPMethod='GET', ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
    version = ref(add('getvalueforkey', WFInput=catalog, WFDictionaryKey='version'), 'Dictionary Value')
    version_text = ref(add('gettext', WFTextActionText=text('\ufffc', version)), 'Text')
    equal_or_stop(version_text, '1', 'קטלוג הקבלות לא התקבל בגרסה נתמכת. הסריקה נעצרה; המקורות נשארו במכשיר.')
    receipts = ref(add('getvalueforkey', WFInput=catalog, WFDictionaryKey='receipts'), 'Dictionary Value')
    expected_json = ref(add('gettext', WFTextActionText='{"expected":true}'), 'Text')
    expected_bool = ref(add('getvalueforkey', WFInput=expected_json, WFDictionaryKey='expected'), 'Dictionary Value')
    expected_type = ref(add('getitemtype', WFInput=expected_bool), 'Type')
    expected_text = ref(add('gettext', WFTextActionText=text('\ufffc', expected_bool)), 'Text')
    files = ref(add('file.getfoldercontents', WFFolder=incoming, Recursive=False), 'Folder Contents') if folder_input else incoming
    for name in ['BudgitUploaded', 'BudgitScanned', 'BudgitExamined', 'BudgitSkipped']:
        empty = ref(add('list', WFItems=[]), 'List')
        add('setvariable', WFVariableName=name, WFInput=empty)
    loop = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/files')).upper()
    add('repeat.each', WFInput=files, GroupingIdentifier=loop, WFControlFlowMode=0)
    add('setvariable', WFVariableName='BudgitSource', WFInput=variable('Repeat Item'))
    current = variable('BudgitSource')
    name = ref(add('properties.files', WFInput=current, WFContentItemPropertyName='Name'), 'Name')
    extension = ref(add('properties.files', WFInput=current, WFContentItemPropertyName='File Extension'), 'File Extension')
    add('appendvariable', WFVariableName='BudgitExamined', WFInput=name)
    no = ref(add('gettext', WFTextActionText='no'), 'Text')
    add('setvariable', WFVariableName='BudgitSupported', WFInput=no)
    for ext in ['csv', 'xls', 'xlsx', 'pdf', 'CSV', 'XLS', 'XLSX', 'PDF', '.csv', '.xls', '.xlsx', '.pdf', '.CSV', '.XLS', '.XLSX', '.PDF']:
        group = begin(extension, expected=ext)
        yes = ref(add('gettext', WFTextActionText='yes'), 'Text')
        add('setvariable', WFVariableName='BudgitSupported', WFInput=yes)
        end(group)
    unsupported = begin(variable('BudgitSupported'), expected='no')
    add('appendvariable', WFVariableName='BudgitSkipped', WFInput=text('\ufffc (\ufffc)', name, extension))
    end(unsupported)
    supported = begin(variable('BudgitSupported'), expected='yes')
    add('appendvariable', WFVariableName='BudgitScanned', WFInput=name)
    count = ref(add('count', Input=variable('BudgitScanned'), WFCountType='Items'), 'Count')
    count_text = ref(add('gettext', WFTextActionText=text('\ufffc', count)), 'Text')
    limit = begin(count_text, expected='501')
    notice('יש יותר מ־500 מקורות נתמכים בתיקייה. יש לארגן את המקורות הישנים ולהריץ שוב; הסריקה אינה מלאה.')
    add('exit')
    end(limit)
    # Preserve a real extension even when a file provider returns only a stem.
    # Strip one existing supported suffix before appending the native extension.
    stem = ref(add('text.replace', WFInput=text('\ufffc', name), WFReplaceTextFind=r'(?i)\.(csv|xls|xlsx|pdf)$', WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=False), 'Updated Text')
    clean_extension = ref(add('text.replace', WFInput=text('\ufffc', extension), WFReplaceTextFind=r'^\.', WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=False), 'Updated Text')
    upload_name = ref(add('gettext', WFTextActionText=text('\ufffc.\ufffc', stem, clean_extension)), 'Text')
    source_hash = ref(add('hash', WFInput=current, WFHashType='SHA256'), 'Hash')
    old = ref(add('getvalueforkey', WFInput=receipts, WFDictionaryKey=text('\ufffc', source_hash)), 'Dictionary Value')
    # A missing dictionary lookup can still produce a native content item.
    # Test a concrete receipt identifier as Text, not the container's presence.
    prior_id = ref(add('getvalueforkey', WFInput=old, WFDictionaryKey='receiptId'), 'Dictionary Value')
    absent = empty_text(prior_id)
    encoded_name = ref(add('urlencode', WFInput=text('\ufffc', upload_name), WFEncodeMode='Encode'), 'URL Encoded Text')
    response = ref(add('downloadurl', WFURL=text(endpoint + '?name=\ufffc', encoded_name), WFHTTPMethod='POST', WFHTTPBodyType='File', WFRequestVariable=current, ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
    server_error = ref(add('getvalueforkey', WFInput=response, WFDictionaryKey='error'), 'Dictionary Value')
    no_error = empty_text(server_error)
    add('conditional', GroupingIdentifier=no_error, WFControlFlowMode=1)
    notice(text('העלאת \ufffc לא אושרה: \ufffc. המקור נשאר במכשיר.', upload_name, server_error))
    add('exit')
    end(no_error)
    stored = ref(add('getvalueforkey', WFInput=response, WFDictionaryKey='stored'), 'Dictionary Value')
    received_type = ref(add('getitemtype', WFInput=stored), 'Type')
    equal_or_stop(received_type, text('\ufffc', expected_type), 'לא התקבל אישור שמירה בוליאני תקין. יש לבדוק את תיבת הסנכרון לפני ניסיון נוסף.')
    received_text = ref(add('gettext', WFTextActionText=text('\ufffc', stored)), 'Text')
    equal_or_stop(received_text, text('\ufffc', expected_text), 'שמירת המקור לא אושרה. המקור נשאר במכשיר.')
    receipt_id = ref(add('getvalueforkey', WFInput=response, WFDictionaryKey='receiptId'), 'Dictionary Value')
    require(receipt_id, 'חסר מזהה קבלת שמירה. המקור נשאר במכשיר.')
    received_hash = ref(add('getvalueforkey', WFInput=response, WFDictionaryKey='sourceHash'), 'Dictionary Value')
    equal_or_stop(received_hash, text('\ufffc', source_hash), 'חתימת הקבלה אינה תואמת למקור. יש לבדוק את הקובץ בתיבה.')
    add('setvariable', WFVariableName='BudgitReceipt', WFInput=response)
    add('appendvariable', WFVariableName='BudgitUploaded', WFInput=name)
    uploaded = ref(add('count', Input=variable('BudgitUploaded'), WFCountType='Items'), 'Count')
    uploaded_text = ref(add('gettext', WFTextActionText=text('\ufffc', uploaded)), 'Text')
    batch = begin(uploaded_text, expected='10')
    notice('נמסרו עשרה קבצים חדשים. יתר הקבצים ייבדקו בהרצה הבאה; הקבלות מאפשרות לדלג על מה שכבר נמסר.')
    add('exit')
    end(batch)
    add('conditional', GroupingIdentifier=absent, WFControlFlowMode=1)
    old_stored = ref(add('getvalueforkey', WFInput=old, WFDictionaryKey='stored'), 'Dictionary Value')
    old_type = ref(add('getitemtype', WFInput=old_stored), 'Type')
    equal_or_stop(old_type, text('\ufffc', expected_type), 'קבלה קודמת אינה תקינה. יש לבדוק את החיבור בתיבת הסנכרון.')
    old_text = ref(add('gettext', WFTextActionText=text('\ufffc', old_stored)), 'Text')
    equal_or_stop(old_text, text('\ufffc', expected_text), 'הקבלה הקודמת אינה מאשרת שמירה. יש לבדוק את התיבה.')
    old_id = ref(add('getvalueforkey', WFInput=old, WFDictionaryKey='receiptId'), 'Dictionary Value')
    require(old_id, 'לקבלה הקודמת חסר מזהה. יש לבדוק את התיבה.')
    old_hash = ref(add('getvalueforkey', WFInput=old, WFDictionaryKey='sourceHash'), 'Dictionary Value')
    equal_or_stop(old_hash, text('\ufffc', source_hash), 'קבלה קודמת אינה תואמת לקובץ. יש לבדוק את התיבה.')
    add('setvariable', WFVariableName='BudgitReceipt', WFInput=old)
    end(absent)
    # Share-sheet inputs cannot be safely re-resolved by folder/name.
    if folder_input and config:
        cleanup_enabled = begin(cleanup_setting, expected='delete-after-saved')
        # Recheck on every sweep, including previously uploaded files. The catalog
        # only skips uploads; it never authorizes removal from a stale snapshot.
        saved_id = ref(add('getvalueforkey', WFInput=variable('BudgitReceipt'), WFDictionaryKey='receiptId'), 'Dictionary Value')
        saved_connection = ref(add('getvalueforkey', WFInput=variable('BudgitReceipt'), WFDictionaryKey='connectionId'), 'Dictionary Value')
        require(saved_connection, 'חסר מזהה חיבור בקבלה הקודמת. הקובץ נשאר במכשיר.')
        fresh = ref(add('downloadurl', WFURL=text(endpoint + '?hash=\ufffc&receipt=\ufffc', source_hash, saved_id), WFHTTPMethod='GET', ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
        fresh_stored = ref(add('getvalueforkey', WFInput=fresh, WFDictionaryKey='stored'), 'Dictionary Value')
        fresh_type = ref(add('getitemtype', WFInput=fresh_stored), 'Type')
        equal_or_stop(fresh_type, text('\ufffc', expected_type), 'קבלת הניקוי אינה תקינה. הקובץ נשאר במכשיר.')
        fresh_text = ref(add('gettext', WFTextActionText=text('\ufffc', fresh_stored)), 'Text')
        equal_or_stop(fresh_text, text('\ufffc', expected_text), 'שמירת המקור לא אושרה. הקובץ נשאר במכשיר.')
        fresh_id = ref(add('getvalueforkey', WFInput=fresh, WFDictionaryKey='receiptId'), 'Dictionary Value')
        equal_or_stop(fresh_id, text('\ufffc', saved_id), 'מזהה הקבלה השתנה. הקובץ נשאר במכשיר.')
        fresh_hash = ref(add('getvalueforkey', WFInput=fresh, WFDictionaryKey='sourceHash'), 'Dictionary Value')
        equal_or_stop(fresh_hash, text('\ufffc', source_hash), 'הקבלה אינה תואמת למקור. הקובץ נשאר במכשיר.')
        # An unrecognized/missing eligibility field keeps the file; strict type and
        # true-value checks prevent a string such as "true" authorizing deletion.
        eligible = ref(add('getvalueforkey', WFInput=fresh, WFDictionaryKey='cleanupEligible'), 'Dictionary Value')
        eligible_type = ref(add('getitemtype', WFInput=eligible), 'Type')
        typed = begin(eligible_type, expected=text('\ufffc', expected_type))
        eligible_text = ref(add('gettext', WFTextActionText=text('\ufffc', eligible)), 'Text')
        allowed = begin(eligible_text, expected=text('\ufffc', expected_text))
        for key, expected in [('fullImportComplete', None), ('budgetState', 'committed'), ('processingState', 'imported')]:
            value = ref(add('getvalueforkey', WFInput=fresh, WFDictionaryKey=key), 'Dictionary Value')
            if expected is None:
                value_type = ref(add('getitemtype', WFInput=value), 'Type')
                equal_or_stop(value_type, text('\ufffc', expected_type), 'חסר אישור קליטה מלאה. הקובץ נשאר במכשיר.')
                value = ref(add('gettext', WFTextActionText=text('\ufffc', value)), 'Text')
            equal_or_stop(value, expected if expected is not None else text('\ufffc', expected_text), 'הקליטה המלאה טרם אושרה. הקובץ נשאר במכשיר.')
        connection = ref(add('getvalueforkey', WFInput=fresh, WFDictionaryKey='connectionId'), 'Dictionary Value')
        equal_or_stop(connection, text('\ufffc', saved_connection), 'החיבור בקבלה השתנה. הקובץ נשאר במכשיר.')
        # A File content item may cache bytes. Resolve a new item by exact name
        # before hashing/deleting; hashing the original item again is insufficient.
        empty = ref(add('list', WFItems=[]), 'List')
        add('setvariable', WFVariableName='BudgitFreshMatches', WFInput=empty)
        fresh_files = ref(add('file.getfoldercontents', WFFolder=incoming, Recursive=False), 'Folder Contents')
        fresh_loop = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/fresh-files')).upper()
        add('repeat.each', WFInput=fresh_files, GroupingIdentifier=fresh_loop, WFControlFlowMode=0)
        candidate = variable('Repeat Item')
        candidate_name = ref(add('properties.files', WFInput=candidate, WFContentItemPropertyName='Name'), 'Name')
        same_name = begin(candidate_name, expected=text('\ufffc', name))
        add('appendvariable', WFVariableName='BudgitFreshMatches', WFInput=candidate)
        end(same_name)
        add('repeat.each', GroupingIdentifier=fresh_loop, WFControlFlowMode=2)
        matches = ref(add('count', Input=variable('BudgitFreshMatches'), WFCountType='Items'), 'Count')
        matches_text = ref(add('gettext', WFTextActionText=text('\ufffc', matches)), 'Text')
        equal_or_stop(matches_text, '1', 'הקובץ אינו זמין באופן חד־משמעי. לא בוצעה מחיקה.')
        current_hash = ref(add('hash', WFInput=variable('BudgitFreshMatches'), WFHashType='SHA256'), 'Hash')
        equal_or_stop(current_hash, text('\ufffc', source_hash), 'הקובץ השתנה בזמן הסריקה. הוא נשאר במכשיר.')
        add('file.delete', WFInput=variable('BudgitFreshMatches'), WFDeleteFileConfirm=True)
        end(allowed)
        end(typed)
        end(cleanup_enabled)
    end(supported)
    add('repeat.each', GroupingIdentifier=loop, WFControlFlowMode=2)
    uploaded = ref(add('count', Input=variable('BudgitUploaded'), WFCountType='Items'), 'Count')
    examined = ref(add('count', Input=variable('BudgitExamined'), WFCountType='Items'), 'Count')
    supported_count = ref(add('count', Input=variable('BudgitScanned'), WFCountType='Items'), 'Count')
    skipped_count = ref(add('count', Input=variable('BudgitSkipped'), WFCountType='Items'), 'Count')
    notice(text('נבדקו \ufffc פריטים; נתמכים: \ufffc; דולגו: \ufffc; נמסרו עכשיו: \ufffc. קבצים שכבר נמסרו אינם נשלחים שוב. המקורות נשארים במכשיר. בדקו את תיבת הסנכרון ב־Budgit.', examined, supported_count, skipped_count, uploaded))
    skipped_text = ref(add('gettext', WFTextActionText=text('\ufffc', skipped_count)), 'Text')
    skipped = begin(skipped_text, expected='0')
    add('conditional', GroupingIdentifier=skipped, WFControlFlowMode=1)
    notice(text('פריטים שדולגו (שם וסיומת): \ufffc', variable('BudgitSkipped')))
    end(skipped)
    return {'WFWorkflowName': setup.get('qaName', 'Budgit-Incoming-QA-v2') if config else ('Budgit — סנכרון תיקייה' if folder_input else 'Budgit — שליחת דוחות'), 'WFWorkflowClientVersion': '5037.0.19', 'WFWorkflowMinimumClientVersion': 900, 'WFWorkflowMinimumClientVersionString': '900', 'WFQuickActionSurfaces': [], 'WFWorkflowTypes': [] if folder_input else ['ActionExtension'], 'WFWorkflowHasShortcutInputVariables': not folder_input, 'WFWorkflowInputContentItemClasses': [] if folder_input else ['WFFileContentItem'], 'WFWorkflowOutputContentItemClasses': [], 'WFWorkflowImportQuestions': questions, 'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 61440, 'WFWorkflowIconStartColor': -23508481}, 'WFWorkflowActions': actions}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qa-config', type=Path)
    parser.add_argument('--files-input', action='store_true')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.qa_config.read_text()) if args.qa_config else None
    if config and args.output.resolve().is_relative_to(Path('public').resolve()):
        parser.error('QA workflows cannot be written into public assets')
    args.output.write_bytes(plistlib.dumps(build(config, not args.files_input), fmt=plistlib.FMT_BINARY, sort_keys=False))
