"""Generate secret-free incoming-report Shortcuts. Native/device QA is required.

The folder variant exposes its native folder selector in the setup block.
No device-specific File bookmark is embedded in the generated workflow.
Original files are retained by default; opt-in cleanup requires a fresh verified
storage receipt and an immediate byte-hash recheck. Financial import is separate. A connection-local catalog skips files
already uploaded. QA permits loopback or an explicitly enabled temporary synthetic HTTPS tunnel.
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
        loopback = url.scheme == 'http' and url.hostname == '127.0.0.1'
        phone_test = setup.get('syntheticHttps') is True and url.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.trycloudflare\.com', url.hostname or '') and url.port is None
        if not (loopback or phone_test) or url.path != '/api/imports/incoming' or url.query or url.fragment or url.username:
            raise ValueError('QA accepts only loopback or an explicitly enabled disposable synthetic HTTPS endpoint')
        if not re.fullmatch(r'Budgit-Incoming-QA-[A-Za-z0-9-]+', setup.get('qaName', 'Budgit-Incoming-QA-v2')):
            raise ValueError('Invalid synthetic workflow name')
        if len(setup.get('token', '')) != 43:
            raise ValueError('Use the disposable QA token')
    cleanup_mode = setup.get('cleanupMode', 'retain')
    if cleanup_mode not in ['retain', 'delete-after-upload']:
        raise ValueError('Invalid device cleanup mode')
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
    add('comment', WFCommentActionText='הגדרה 1/3 — תיקיית הדוחות. בפעולת File שמתחת בחרו את תיקיית הדוחות דרך בורר הקבצים ב־Mac או ב־iPhone. אין לבחור תיקייה דרך Receive … from. בחרו תיקייה בלבד, ולא קובץ יחיד.')
    if folder_input:
        folder_index = len(actions)
        incoming = ref(add('file'), 'File')
        questions.append({'ActionIndex': folder_index, 'Category': 'Parameter', 'ParameterKey': 'WFFile', 'Text': 'בחרו את תיקיית הדוחות. לשיתוף בין המכשירים אפשר לבחור iCloud Drive/Budgit דרך הבורר בכל מכשיר.'})
    else:
        incoming = {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': 'ExtensionInput'}}
    add('comment', WFCommentActionText='הגדרה 2/3 — מפתח העלאה. הדביקו בפעולת Text שמתחת רק מפתח חיבור פעיל מסנכרון דוחות ב־Budgit. מפתח מקיצור QA זמני אינו מפתח לחיבור הרגיל. אין להזין סיסמה או מפתח שחזור ואין לשתף עותק עם מפתח.')
    token_index = len(actions)
    secret = ref(add('gettext', WFTextActionText=setup.get('token', '')), 'Text')
    if not config:
        questions.append({'ActionIndex': token_index, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '', 'Text': 'הדביקו רק את מפתח ההעלאה, בלי Bearer. אין להזין סיסמה או מפתח שחזור.'})
    add('comment', WFCommentActionText='הגדרה 3/3 — מחיקה אחרי העלאה. retain משאיר קבצים בתיקייה. כדי למחוק אחרי ש־Budgit אימת עותק שמור, בחרו delete-after-upload. כדי למנוע אישור מחיקה בכל הרצה, בהגדרות iOS > יישומים > קיצורים > מתקדם אפשר לאפשר מחיקה ללא אישור. ההגדרה חלה על כל הקיצורים; הרשאות ראשוניות ניתנות במכשיר. בתיקיית iCloud המחיקה מסתנכרנת גם למכשירים אחרים. Budgit שומר דוחות לא גמורים, ומסיר את המקור 30 יום אחרי השלמת הטיפול. אין מחיקה של מקור מגיליון שיתוף.')
    cleanup_index = len(actions)
    cleanup_setting = ref(add('gettext', WFTextActionText=cleanup_mode), 'Text')
    if not config and folder_input:
        questions.append({'ActionIndex': cleanup_index, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': 'retain', 'Text': 'retain לשמירת הקובץ, או delete-after-upload למחיקה מהתיקייה רק אחרי אימות עותק ב־Budgit. מחיקת iCloud מסתנכרנת לכל המכשירים.'})
    add('comment', WFCommentActionText='סוף ההגדרות — אין צורך לערוך את הפעולות שמתחת. הפענוח, השיוך והשמירה הכספית מחייבים אישור בתוך Budgit. תזמון מוגדר בנפרד רק לאחר בדיקה ידנית. גרסת QA עם כתובת 127.0.0.1 עובדת במחשב הבדיקה בלבד, לא ב־iPhone.')
    require(secret, 'חסר מפתח העלאה. מלאו את Text תחת הגדרה 2/3 ממסך סנכרון דוחות ב־Budgit.')
    # Clipboard line breaks around a key are harmless; never accept a full
    # Authorization header or transform characters inside the actual token.
    for edge in [r'^\s+', r'\s+$']:
        secret = ref(add('text.replace', WFInput=text('\ufffc', secret), WFReplaceTextFind=edge, WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=True), 'Updated Text')
    token_length = ref(add('count', Input=secret, WFCountType='Characters'), 'Count')
    equal_or_stop(token_length, '43', 'מפתח ההעלאה צריך לכלול 43 תווים בלבד. בסנכרון דוחות ב־Budgit צרו חיבור והדביקו רק את המפתח ב־Text תחת הגדרה 2/3, בלי Bearer. אל תשתמשו במפתח QA או בסיסמה.')
    valid_chars = ref(add('text.replace', WFInput=text('\ufffc', secret), WFReplaceTextFind=r'[^A-Za-z0-9_-]', WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=True), 'Updated Text')
    equal_or_stop(valid_chars, text('\ufffc', secret), 'מפתח ההעלאה מכיל תווים לא נתמכים. העתיקו רק מפתח חיבור מסנכרון דוחות ל־Text תחת הגדרה 2/3.')
    require(incoming, 'בחרו תיקייה בפעולת File תחת הגדרה 1/3.' if folder_input else 'יש להעביר קובצי דוח מגיליון השיתוף.', items=True)
    headers = {'WFSerializationType': 'WFDictionaryFieldValue', 'Value': {'WFDictionaryFieldValueItems': [
        {'WFItemType': 0, 'WFKey': text('Authorization'), 'WFValue': text('Bearer \ufffc', secret)},
        {'WFItemType': 0, 'WFKey': text('Content-Type'), 'WFValue': text('application/octet-stream')},
    ]}}
    catalog = ref(add('downloadurl', WFURL=endpoint + '?catalog=2', WFHTTPMethod='GET', ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
    # Auth/rate/consent errors are JSON too. Surface their actual safe message
    # before testing the catalog version, without echoing the upload token.
    catalog_error = ref(add('getvalueforkey', WFInput=catalog, WFDictionaryKey='error'), 'Dictionary Value')
    unauthorized = begin(catalog_error, expected='חיבור ההעלאה אינו תקין או בוטל.')
    notice('מפתח החיבור לא התקבל או בוטל. פתחו https://budgit.duckdns.org/next/incoming, העתיקו מפתח חיבור פעיל מסנכרון דוחות ל־Text תחת הגדרה 2/3. אפשר להשתמש באותו מפתח ייצור ב־Mac וב־iPhone; מפתח QA זמני לא מתאים לחיבור הרגיל. הקבצים נשארו במכשיר.' if not config else 'חיבור הבדיקה הזמני אינו זמין. נדרשת בדיקת QA חדשה; אין להכניס מפתח אישי לקיצור בדיקה. הקבצים נשארו במכשיר.')
    add('exit')
    end(unauthorized)
    no_catalog_error = empty_text(catalog_error)
    add('conditional', GroupingIdentifier=no_catalog_error, WFControlFlowMode=1)
    notice(text('Budgit לא אישר את הסריקה: \ufffc. בדקו את סנכרון הדוחות ב־Budgit ונסו שוב. הקבצים נשארו במכשיר.', catalog_error))
    add('exit')
    end(no_catalog_error)
    version = ref(add('getvalueforkey', WFInput=catalog, WFDictionaryKey='version'), 'Dictionary Value')
    version_text = ref(add('gettext', WFTextActionText=text('\ufffc', version)), 'Text')
    equal_or_stop(version_text, '2', 'תשובת קטלוג הקבלות אינה נתמכת. התקינו קיצור מעודכן מתוך סנכרון דוחות ב־Budgit. אם התקלה נמשכת, בדקו את החיבור; המקורות נשארו במכשיר.')
    catalog_connection = ref(add('getvalueforkey', WFInput=catalog, WFDictionaryKey='connectionId'), 'Dictionary Value')
    require(catalog_connection, 'חסר מזהה חיבור בקטלוג. המקורות נשארים במכשיר.')
    receipts = ref(add('getvalueforkey', WFInput=catalog, WFDictionaryKey='receipts'), 'Dictionary Value')
    expected_json = ref(add('gettext', WFTextActionText='{"expected":true}'), 'Text')
    expected_bool = ref(add('getvalueforkey', WFInput=expected_json, WFDictionaryKey='expected'), 'Dictionary Value')
    expected_type = ref(add('getitemtype', WFInput=expected_bool), 'Type')
    expected_text = ref(add('gettext', WFTextActionText=text('\ufffc', expected_bool)), 'Text')
    false_json = ref(add('gettext', WFTextActionText='{"expected":false}'), 'Text')
    false_bool = ref(add('getvalueforkey', WFInput=false_json, WFDictionaryKey='expected'), 'Dictionary Value')
    false_text = ref(add('gettext', WFTextActionText=text('\ufffc', false_bool)), 'Text')

    def field(receipt, key):
        return ref(add('getvalueforkey', WFInput=receipt, WFDictionaryKey=key), 'Dictionary Value')

    def append(name, value):
        add('appendvariable', WFVariableName=name, WFInput=value)

    def otherwise(group):
        add('conditional', GroupingIdentifier=group, WFControlFlowMode=1)

    def check(guards, value, expected, message):
        guards.append((begin(value, expected=expected), message))

    def present(guards, value, name, phase, message):
        group = empty_text(value)
        append('BudgitIssues', text(phase + ' · \ufffc: ' + message, name))
        otherwise(group)
        guards.append((group, None))

    def finish_checks(guards, name, phase):
        for group, message in reversed(guards):
            if message is not None:
                otherwise(group)
                append('BudgitIssues', text(phase + ' · \ufffc: ' + message, name))
            end(group)

    def boolean_receipt(guards, receipt, key, expected, message):
        value = field(receipt, key)
        value_type = ref(add('getitemtype', WFInput=value), 'Type')
        check(guards, value_type, text('\ufffc', expected_type), message)
        check(guards, value, text('\ufffc', expected), message)

    def filename(item):
        name = ref(add('properties.files', WFInput=item, WFContentItemPropertyName='Name'), 'Name')
        extension = ref(add('properties.files', WFInput=item, WFContentItemPropertyName='File Extension'), 'File Extension')
        stem = ref(add('text.replace', WFInput=text('\ufffc', name), WFReplaceTextFind=r'(?i)\.(csv|xls|xlsx|pdf)$', WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=False), 'Updated Text')
        clean = ref(add('text.replace', WFInput=text('\ufffc', extension), WFReplaceTextFind=r'^\.', WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=False), 'Updated Text')
        return name, extension, ref(add('gettext', WFTextActionText=text('\ufffc.\ufffc', stem, clean)), 'Text')

    def count(name):
        return ref(add('count', Input=variable(name), WFCountType='Items'), 'Count')

    files = ref(add('file.getfoldercontents', WFFolder=incoming, Recursive=False), 'Folder Contents') if folder_input else incoming
    for name in ['BudgitUploaded', 'BudgitPosted', 'BudgitScanned', 'BudgitSkipped', 'BudgitKnown', 'BudgitCompleted', 'BudgitDeferred', 'BudgitIssues', 'BudgitCleanupQueue', 'BudgitDeleted']:
        empty = ref(add('list', WFItems=[]), 'List')
        add('setvariable', WFVariableName=name, WFInput=empty)
    loop = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/files')).upper()
    file_loop_output = add('repeat.each', WFInput=files, GroupingIdentifier=loop, WFControlFlowMode=0)
    add('setvariable', WFVariableName='BudgitSource', WFInput=ref(file_loop_output, 'Repeat Item'))
    current = variable('BudgitSource')
    name, extension, upload_name = filename(current)
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
    limit = begin(count('BudgitScanned'), expected='500')
    append('BudgitDeferred', upload_name)
    otherwise(limit)
    append('BudgitScanned', upload_name)
    source_hash = ref(add('hash', WFInput=current, WFHashType='SHA256'), 'Hash')
    old = ref(add('getvalueforkey', WFInput=receipts, WFDictionaryKey=text('\ufffc', source_hash)), 'Dictionary Value')
    # A missing dictionary lookup can still produce a native content item.
    # Test a concrete receipt identifier as Text, not the container's presence.
    prior_id = ref(add('getvalueforkey', WFInput=old, WFDictionaryKey='receiptId'), 'Dictionary Value')
    absent = empty_text(prior_id)
    batch = begin(count('BudgitPosted'), expected='10')
    append('BudgitDeferred', upload_name)
    deferred = ref(add('gettext', WFTextActionText='deferred'), 'Text')
    add('setvariable', WFVariableName='BudgitTransfer', WFInput=deferred)
    otherwise(batch)
    append('BudgitPosted', upload_name)
    encoded_name = ref(add('urlencode', WFInput=text('\ufffc', upload_name), WFEncodeMode='Encode'), 'URL Encoded Text')
    response = ref(add('downloadurl', WFURL=text(endpoint + '?name=\ufffc', encoded_name), WFHTTPMethod='POST', WFHTTPBodyType='File', WFRequestVariable=current, ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
    add('setvariable', WFVariableName='BudgitReceipt', WFInput=response)
    sent = ref(add('gettext', WFTextActionText='sent'), 'Text')
    add('setvariable', WFVariableName='BudgitTransfer', WFInput=sent)
    end(batch)
    otherwise(absent)
    add('setvariable', WFVariableName='BudgitReceipt', WFInput=old)
    known = ref(add('gettext', WFTextActionText='known'), 'Text')
    add('setvariable', WFVariableName='BudgitTransfer', WFInput=known)
    end(absent)
    handle_receipt = begin(variable('BudgitTransfer'), expected='deferred')
    otherwise(handle_receipt)
    receipt = variable('BudgitReceipt')
    server_error = field(receipt, 'error')
    no_error = empty_text(server_error)
    guards = []
    present(guards, field(receipt, 'receiptId'), upload_name, 'העלאה לא אושרה', 'לא התקבלה קבלת שמירה. בדקו את התיבה ונסו שוב.')
    check(guards, field(receipt, 'sourceHash'), text('\ufffc', source_hash), 'חתימת הקבלה אינה תואמת לקובץ.')
    check(guards, field(receipt, 'connectionId'), text('\ufffc', catalog_connection), 'הקבלה שייכת לחיבור אחר.')
    stored = field(receipt, 'stored')
    check(guards, ref(add('getitemtype', WFInput=stored), 'Type'), text('\ufffc', expected_type), 'לא התקבל מצב שמירה תקין.')
    retained = begin(stored, expected=text('\ufffc', expected_text))
    was_sent = begin(variable('BudgitTransfer'), expected='sent')
    duplicate = begin(field(receipt, 'duplicate'), expected=text('\ufffc', expected_text))
    append('BudgitKnown', upload_name)
    otherwise(duplicate)
    append('BudgitUploaded', upload_name)
    end(duplicate)
    otherwise(was_sent)
    append('BudgitKnown', upload_name)
    end(was_sent)
    if folder_input:
        cleanup_enabled = begin(cleanup_setting, expected='delete-after-upload')
        queued = ref(add('setvalueforkey', WFDictionary=receipt, WFDictionaryKey='budgitLocalName', WFDictionaryValue=text('\ufffc', upload_name)), 'Dictionary')
        append('BudgitCleanupQueue', queued)
        end(cleanup_enabled)
    otherwise(retained)
    completion = []
    completion_error = 'לא התקבל אישור תקין על דוח שכבר הושלם.'
    boolean_receipt(completion, receipt, 'stored', false_text, completion_error)
    for key in ['completed', 'completionAcknowledged', 'originalRemoved']:
        boolean_receipt(completion, receipt, key, expected_text, completion_error)
    boolean_receipt(completion, receipt, 'cleanupEligible', false_text, completion_error)
    check(completion, field(receipt, 'processingState'), 'completed-original-removed', completion_error)
    append('BudgitCompleted', upload_name)
    finish_checks(completion, upload_name, 'העלאה לא אושרה')
    end(retained)
    finish_checks(guards, upload_name, 'העלאה לא אושרה')
    otherwise(no_error)
    append('BudgitIssues', text('העלאה לא אושרה · \ufffc: \ufffc', upload_name, server_error))
    end(no_error)
    end(handle_receipt)
    end(limit)
    end(supported)
    add('repeat.each', GroupingIdentifier=loop, WFControlFlowMode=2)

    uploaded, known, completed, deferred, skipped = [count(name) for name in ['BudgitUploaded', 'BudgitKnown', 'BudgitCompleted', 'BudgitDeferred', 'BudgitSkipped']]
    if folder_input:
        cleanup_pending = begin(count('BudgitCleanupQueue'), expected='0')
        otherwise(cleanup_pending)
        notice(text('הועלו: \ufffc · כבר שמורים: \ufffc · בעיות בהעלאה: \ufffc\nכעת נבדקת מחיקה בטוחה מהתיקייה.', uploaded, known, count('BudgitIssues')))
        cleanup_loop = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/cleanup')).upper()
        cleanup_output = add('repeat.each', WFInput=variable('BudgitCleanupQueue'), GroupingIdentifier=cleanup_loop, WFControlFlowMode=0)
        saved = ref(cleanup_output, 'Repeat Item')
        saved_name = field(saved, 'budgitLocalName')
        saved_id = field(saved, 'receiptId')
        saved_hash = field(saved, 'sourceHash')
        saved_name_hash = ref(add('hash', WFInput=ref(add('gettext', WFTextActionText=text('\ufffc', saved_name)), 'Text'), WFHashType='SHA256'), 'Hash')
        fresh = ref(add('downloadurl', WFURL=text(endpoint + '?verifyStorage=1&hash=\ufffc&receipt=\ufffc', saved_hash, saved_id), WFHTTPMethod='GET', ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
        cleanup = []
        check(cleanup, field(fresh, 'receiptId'), text('\ufffc', saved_id), 'מזהה הקבלה השתנה.')
        check(cleanup, field(fresh, 'sourceHash'), text('\ufffc', saved_hash), 'חתימת הקבלה אינה תואמת לקובץ.')
        check(cleanup, field(fresh, 'connectionId'), text('\ufffc', catalog_connection), 'הקבלה שייכת לחיבור אחר.')
        check(cleanup, field(fresh, 'deviceCleanupVersion'), '1', 'לא התקבל אימות שמירה נתמך.')
        for key in ['stored', 'storageVerified', 'deviceCopyRemovable']:
            boolean_receipt(cleanup, fresh, key, expected_text, 'Budgit לא אישר שמותר להסיר את העותק מהמכשיר.')
        boolean_receipt(cleanup, fresh, 'originalRemoved', false_text, 'המקור כבר אינו שמור ב־Budgit.')
        none = ref(add('gettext', WFTextActionText='none'), 'Text')
        add('setvariable', WFVariableName='BudgitMatchState', WFInput=none)
        fresh_files = ref(add('file.getfoldercontents', WFFolder=incoming, Recursive=False), 'Folder Contents')
        fresh_loop = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/incoming/fresh-files')).upper()
        fresh_loop_output = add('repeat.each', WFInput=fresh_files, GroupingIdentifier=fresh_loop, WFControlFlowMode=0)
        candidate = ref(fresh_loop_output, 'Repeat Item')
        _, _, candidate_name = filename(candidate)
        candidate_hash = ref(add('hash', WFInput=candidate_name, WFHashType='SHA256'), 'Hash')
        same_name = begin(candidate_hash, expected=text('\ufffc', saved_name_hash))
        first_match = begin(variable('BudgitMatchState'), expected='none')
        add('setvariable', WFVariableName='BudgitFreshFile', WFInput=candidate)
        one = ref(add('gettext', WFTextActionText='one'), 'Text')
        add('setvariable', WFVariableName='BudgitMatchState', WFInput=one)
        otherwise(first_match)
        multiple = ref(add('gettext', WFTextActionText='multiple'), 'Text')
        add('setvariable', WFVariableName='BudgitMatchState', WFInput=multiple)
        end(first_match)
        end(same_name)
        add('repeat.each', GroupingIdentifier=fresh_loop, WFControlFlowMode=2)
        check(cleanup, variable('BudgitMatchState'), 'one', 'הקובץ לא נמצא באופן חד־משמעי בתיקייה.')
        current_hash = ref(add('hash', WFInput=variable('BudgitFreshFile'), WFHashType='SHA256'), 'Hash')
        check(cleanup, current_hash, text('\ufffc', saved_hash), 'הקובץ השתנה מאז ההעלאה.')
        add('file.delete', WFInput=variable('BudgitFreshFile'), WFDeleteImmediatelyDelete=False)
        append('BudgitDeleted', saved_name)
        finish_checks(cleanup, saved_name, 'לא נמחק')
        add('repeat.each', GroupingIdentifier=cleanup_loop, WFControlFlowMode=2)
        end(cleanup_pending)
    issues = count('BudgitIssues')
    no_issues = begin(issues, expected='0')
    otherwise(no_issues)
    issue_preview = ref(add('text.replace', WFInput=text('\ufffc', variable('BudgitIssues')), WFReplaceTextFind=r'[\r\n][\s\S]*$', WFReplaceTextReplace='', WFReplaceTextRegularExpression=True, WFReplaceTextCaseSensitive=True), 'Updated Text')
    notice(text('\ufffc', issue_preview))
    end(no_issues)
    deleted = count('BudgitDeleted')
    summary = ref(add('gettext', WFTextActionText=text('הועלו: \ufffc · כבר שמורים: \ufffc · בעיות: \ufffc\nהוסרו מהמכשיר: \ufffc · נדחו לסבב הבא: \ufffc\nהושלמו בעבר: \ufffc · לא נתמכים: \ufffc', uploaded, known, issues, deleted, deferred, completed, skipped)), 'Text')
    notice(text('\ufffc', summary))
    add('gettext', WFTextActionText=text('\ufffc\n\nהועלו:\n\ufffc\nכבר שמורים:\n\ufffc\nהושלמו בעבר:\n\ufffc\nנדחו:\n\ufffc\nלא נתמכים:\n\ufffc\nהוסרו מהמכשיר:\n\ufffc\nפרטי בעיות (הקבצים נשארו במכשיר):\n\ufffc\n\nהעלאה לתיבה אינה קליטה לתקציב.', summary, *[variable(name) for name in ['BudgitUploaded', 'BudgitKnown', 'BudgitCompleted', 'BudgitDeferred', 'BudgitSkipped', 'BudgitDeleted', 'BudgitIssues']]))
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
