"""Build the daily-report workflow draft. Native acceptance is required before release.

Known action schemas were exported from macOS Shortcuts 5037.0.19.
Default output has blank setup fields; --qa-config is restricted to disposable
loopback test endpoints and temporary synthetic fixture directories.
"""
import argparse
import json
import plistlib
import uuid
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


def build(config=None):
    actions = []

    def add(name, **params):
        identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/reports/draft/v1/' + str(len(actions)))).upper()
        params['UUID'] = identifier
        actions.append({'WFWorkflowActionIdentifier': 'is.workflow.actions.' + name, 'WFWorkflowActionParameters': params})
        return identifier

    def ref(identifier, name):
        return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': 'ActionOutput', 'OutputUUID': identifier, 'OutputName': name}}

    def variable(name):
        return {'WFSerializationType': 'WFTextTokenAttachment', 'Value': {'Type': 'Variable', 'VariableName': name}}

    def text(value, *references):
        attachments, offset = {}, 0
        for reference in references:
            offset = value.index('\ufffc', offset)
            # Apple's token offsets count UTF-16 code units, including emoji.
            utf16 = len(value[:offset].encode('utf-16-le')) // 2
            attachments['{%d, 1}' % utf16] = reference['Value']
            offset += 1
        return {'WFSerializationType': 'WFTextTokenString', 'Value': {'string': value, 'attachmentsByRange': attachments}}

    def folder(path):
        return {'fileLocation': {'relativeSubpath': path, 'WFFileLocationType': 'Absolute'}, 'filename': Path(path).name, 'displayName': Path(path).name}

    def begin(value, condition=4, expected=None):
        group = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/reports/condition/' + str(len(actions)))).upper()
        params = {'GroupingIdentifier': group, 'WFControlFlowMode': 0, 'WFInput': {'Type': 'Variable', 'Variable': value}, 'WFCondition': condition}
        if expected is not None:
            params['WFConditionalActionString'] = expected
        add('conditional', **params)
        return group

    def end(group):
        add('conditional', GroupingIdentifier=group, WFControlFlowMode=2)

    def notice(message):
        add('notification', WFNotificationActionTitle='Budgit — תיבת הדוחות', WFNotificationActionBody=message)

    def require(value, message):
        group = begin(value, 101)
        notice(message)
        add('exit')
        end(group)

    def equal_or_stop(value, expected, message):
        group = begin(value, expected=expected)
        add('conditional', GroupingIdentifier=group, WFControlFlowMode=1)
        notice(message)
        add('exit')
        end(group)

    def repeat(value):
        group = str(uuid.uuid5(uuid.NAMESPACE_URL, 'budgit/reports/loop/' + str(len(actions)))).upper()
        add('repeat.each', WFInput=value, GroupingIdentifier=group, WFControlFlowMode=0)
        return group

    def repeat_end(group):
        add('repeat.each', GroupingIdentifier=group, WFControlFlowMode=2)

    def property_of(value, name):
        return ref(add('properties.files', WFInput=value, WFContentItemPropertyName=name), name)

    def destination_guard(destination, current_name):
        files = ref(add('file.getfoldercontents', WFFolder=destination, WFGetFolderContentsRecursive=False), 'Folder Contents')
        group = repeat(files)
        name = property_of(variable('Repeat Item'), 'Name')
        collision = begin(name, expected=text('\ufffc', current_name))
        notice('כבר קיים ביעד קובץ באותו שם. המקור נשאר במקומו; לא בוצעה דריסה. בדקו את הקבצים ונסו שוב.')
        add('exit')
        end(collision)
        repeat_end(group)

    setup = config or {}
    endpoint = setup.get('endpoint', 'https://budgit.duckdns.org/api/imports/reports')
    if config:
        url = urlsplit(endpoint)
        if url.scheme != 'http' or url.hostname != '127.0.0.1' or url.path != '/api/imports/reports' or url.query or url.fragment or url.username:
            raise ValueError('QA accepts only the local synthetic endpoint')
        for field in ['input', 'uploaded']:
            path = Path(setup[field]).resolve()
            if path.parent.parent != Path(tempfile.gettempdir()).resolve() or not path.parent.name.startswith('budgit-shortcut-qa-') or path.name not in ['input', 'uploaded', 'probe'] or not path.is_dir():
                raise ValueError('QA accepts only generated temporary fixture folders')
        if len(setup.get('token', '')) != 43:
            raise ValueError('Use the disposable QA token')

    secret = ref(add('gettext', WFTextActionText=setup.get('token', '')), 'Text')
    require(secret, 'לא הוגדר מפתח העלאה. צרו חיבור בתיבת הדוחות והדביקו את המפתח בפעולת הטקסט הראשונה. לא הועלה או הועבר קובץ.')
    source_index = len(actions)
    source = ref(add('file', **({'WFFile': folder(str(Path(setup['input']).resolve()))} if config else {})), 'File')
    destination_index = len(actions)
    destination = ref(add('file', **({'WFFile': folder(str(Path(setup['uploaded']).resolve()))} if config else {})), 'File')
    add('comment', WFCommentActionText='טיוטת פיתוח — עדיין לא אושרה להפצה. מעלה מקור לבדיקה, ללא קליטה אוטומטית בתקציב. אין מחיקה. ההרצה נעצרת בכשל כדי להשאיר קבצים שלא הועברו. אין לשתף עותק שמכיל מפתח אישי. התזמון מוגדר בנפרד באייפון רק אחרי בדיקה ידנית.')
    require(source, 'בחרו תיקיית מקור בפעולת File הראשונה.')
    require(destination, 'בחרו תיקיית הועלו בפעולת File השנייה.')
    source_path = property_of(source, 'File Path')
    destination_path = property_of(destination, 'File Path')
    same = begin(source_path, expected=text('\ufffc', destination_path))
    notice('תיקיות המקור והיעד זהות. בחרו תיקיית יעד נפרדת. לא הועבר קובץ.')
    add('exit')
    end(same)
    # Compare with a real JSON Boolean, using this device's localized type/value.
    expected_json = ref(add('gettext', WFTextActionText='{"expected":true}'), 'Text')
    expected_bool = ref(add('getvalueforkey', WFInput=expected_json, WFDictionaryKey='expected'), 'Dictionary Value')
    expected_type = ref(add('getitemtype', WFInput=expected_bool), 'Type')
    expected_text = ref(add('gettext', WFTextActionText=text('\ufffc', expected_bool)), 'Text')
    for name in ['BudgitAttempted', 'BudgitUploaded']:
        empty = ref(add('list', WFItems=[]), 'List')
        add('setvariable', WFVariableName=name, WFInput=empty)
    files = ref(add('file.getfoldercontents', WFFolder=source, WFGetFolderContentsRecursive=False), 'Folder Contents')
    outer = repeat(files)
    add('setvariable', WFVariableName='BudgitSource', WFInput=variable('Repeat Item'))
    current = variable('BudgitSource')
    name = property_of(current, 'Name')
    extension = property_of(current, 'File Extension')
    no = ref(add('gettext', WFTextActionText='no'), 'Text')
    add('setvariable', WFVariableName='BudgitSupported', WFInput=no)
    for ext in ['csv', 'CSV', 'xls', 'XLS', 'xlsx', 'XLSX', 'pdf', 'PDF']:
        supported = begin(extension, expected=ext)
        yes = ref(add('gettext', WFTextActionText='yes'), 'Text')
        add('setvariable', WFVariableName='BudgitSupported', WFInput=yes)
        end(supported)
    supported = begin(variable('BudgitSupported'), expected='yes')
    # Count supported candidates, so unrelated files cannot starve later reports.
    add('appendvariable', WFVariableName='BudgitAttempted', WFInput=name)
    attempted = ref(add('count', WFInput=variable('BudgitAttempted'), WFCountType='Items'), 'Count')
    attempted_text = ref(add('gettext', WFTextActionText=text('\ufffc', attempted)), 'Text')
    limit = begin(attempted_text, expected='11')
    uploaded_count = ref(add('count', WFInput=variable('BudgitUploaded'), WFCountType='Items'), 'Count')
    notice(text('ההרצה הגיעה למגבלת עשרה דוחות. הועברו \ufffc קבצים; היתר נשארו בתיקייה להרצה הבאה.', uploaded_count))
    add('exit')
    end(limit)
    destination_guard(destination, name)
    before_hash = ref(add('hash', WFInput=current, WFHashType='SHA256'), 'Hash')
    encoded_name = ref(add('urlencode', WFInput=text('\ufffc', name)), 'URL Encoded Text')
    headers = {'WFSerializationType': 'WFDictionaryFieldValue', 'Value': {'WFDictionaryFieldValueItems': [
        {'WFItemType': 0, 'WFKey': text('Authorization'), 'WFValue': text('Bearer \ufffc', secret)},
        {'WFItemType': 0, 'WFKey': text('Content-Type'), 'WFValue': text('application/octet-stream')},
    ]}}
    receipt = ref(add('downloadurl', WFURL=text(endpoint + '?name=\ufffc', encoded_name), WFHTTPMethod='POST', WFHTTPBodyType='File', WFRequestVariable=current, ShowHeaders=True, WFHTTPHeaders=headers), 'Contents of URL')
    stored = ref(add('getvalueforkey', WFInput=receipt, WFDictionaryKey='stored'), 'Dictionary Value')
    received_type = ref(add('getitemtype', WFInput=stored), 'Type')
    equal_or_stop(received_type, text('\ufffc', expected_type), 'השרת לא החזיר אישור שמירה בוליאני תקין. המקור נשאר בתיקייה.')
    received_text = ref(add('gettext', WFTextActionText=text('\ufffc', stored)), 'Text')
    equal_or_stop(received_text, text('\ufffc', expected_text), 'שמירת המקור לא אושרה. המקור נשאר בתיקייה.')
    receipt_id = ref(add('getvalueforkey', WFInput=receipt, WFDictionaryKey='receiptId'), 'Dictionary Value')
    require(receipt_id, 'חסר מזהה קבלת שמירה. המקור נשאר בתיקייה.')
    received_hash = ref(add('getvalueforkey', WFInput=receipt, WFDictionaryKey='sourceHash'), 'Dictionary Value')
    equal_or_stop(received_hash, text('\ufffc', before_hash), 'חתימת הקבלה אינה תואמת למקור. המקור נשאר בתיקייה.')
    # Re-enumerate instead of hashing the pre-upload File object again.
    fresh = ref(add('file.getfoldercontents', WFFolder=source, WFGetFolderContentsRecursive=False), 'Folder Contents')
    inner = repeat(fresh)
    fresh_file = variable('Repeat Item')
    fresh_name = property_of(fresh_file, 'Name')
    found = begin(fresh_name, expected=text('\ufffc', name))
    add('setvariable', WFVariableName='BudgitConfirmedSource', WFInput=fresh_file)
    after_hash = ref(add('hash', WFInput=variable('BudgitConfirmedSource'), WFHashType='SHA256'), 'Hash')
    equal_or_stop(after_hash, text('\ufffc', before_hash), 'הקובץ השתנה בזמן ההעלאה. הגרסה הנוכחית נשארה במקור; יש להעלות אותה שוב.')
    destination_guard(destination, name)
    # Replacement is disabled by the native action's exported default. This
    # action still requires collision/race testing before any release.
    add('file.move', WFFile=variable('BudgitConfirmedSource'), WFFolder=destination)
    add('appendvariable', WFVariableName='BudgitUploaded', WFInput=name)
    notice(text('נשמר בתיבת הדוחות והועבר לתיקיית הועלו: \ufffc. נדרשת בדיקה לפני קליטה לתקציב.', name))
    end(found)
    repeat_end(inner)
    end(supported)
    repeat_end(outer)
    uploaded_count = ref(add('count', WFInput=variable('BudgitUploaded'), WFCountType='Items'), 'Count')
    notice(text('הסריקה הסתיימה. נשמרו והועברו \ufffc דוחות. יתר המקורות נשארו בתיקייה; בדקו את תיבת הדוחות לפני קליטה לתקציב.', uploaded_count))
    questions = [] if config else [
        {'ActionIndex': 0, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '', 'Text': 'הדביקו רק את מפתח העלאת הדוחות מ־Budgit, בלי Bearer. אין להדביק מפתח שחזור או סיסמה.'},
        {'ActionIndex': source_index, 'Category': 'Parameter', 'ParameterKey': 'WFFile', 'DefaultValue': '', 'Text': 'בחרו את תיקיית המקור לדוחות, ולא קובץ בודד.'},
        {'ActionIndex': destination_index, 'Category': 'Parameter', 'ParameterKey': 'WFFile', 'DefaultValue': '', 'Text': 'בחרו תיקיית הועלו נפרדת. המקורות אינם נמחקים.'},
    ]
    return {'WFWorkflowName': 'Budgit — דוחות (טיוטת פיתוח)', 'WFWorkflowClientVersion': '5037.0.19', 'WFWorkflowMinimumClientVersion': 900, 'WFWorkflowMinimumClientVersionString': '900', 'WFQuickActionSurfaces': [], 'WFWorkflowTypes': [], 'WFWorkflowHasShortcutInputVariables': False, 'WFWorkflowInputContentItemClasses': [], 'WFWorkflowOutputContentItemClasses': [], 'WFWorkflowImportQuestions': questions, 'WFWorkflowIcon': {'WFWorkflowIconGlyphNumber': 61440, 'WFWorkflowIconStartColor': -23508481}, 'WFWorkflowActions': actions}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qa-config', type=Path)
    parser.add_argument('--output', type=Path, default=Path('shortcuts/budgit-reports-draft.wflow'))
    args = parser.parse_args()
    config = json.loads(args.qa_config.read_text()) if args.qa_config else None
    if config and (str(args.output).startswith('public/') or args.output.resolve().is_relative_to(Path('public').resolve())):
        parser.error('QA workflows cannot be written into public assets')
    args.output.write_bytes(plistlib.dumps(build(config), fmt=plistlib.FMT_BINARY, sort_keys=False))
