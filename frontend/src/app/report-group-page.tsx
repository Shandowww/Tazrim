import {PurchaseNoteReviewProvider,PurchaseNoteReviewStatus} from './purchase-note-review';
import {ReportMatchReview} from './report-match-review';
import {ReportClassificationReview,ReportReviewChecks} from './report-classification-review';
import {optionalCategoryCounts,reportReviewChecks,exceptionId} from './report-classification-model';
import {wholeDuplicateReview,prepareDuplicateCompletion,finishDuplicateCompletion} from './report-duplicate-completion';
import {ReportResult,downloadReportOriginal} from './report-result';
import {GuidedReportSummary, initialGuidedReview, type ReviewStep} from './report-guided-review';
import {updateReportLifecycle,ReportLifecycleError} from './report-lifecycle-api';
import Link from './link';
import { ReportStatementConflict } from './report-statement-conflict';
import { PageHeading } from './page-heading';
import { reportStorageDisclosure } from '../../../src/report-inbox-controller.js';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { cashAccountList, creditCards, budgetFields } from '../../../src/budget.js';
import { buildReportInbox, changeReportInbox, reportInboxBase, reportInboxDraft, reportInboxDraftForWrite } from '../../../src/report-inbox-controller.js';
import * as classifier from '../../../tools/bank-csv/classifier.mjs';
import * as activityAPI from '../../../tools/bank-csv/cal-activity.mjs';
import * as reader from '../../../tools/bank-csv/intake-reader.mjs';
import { loadReportGroup, copyReportGroupUi } from './report-group-loader';
import { saveStoredReportGroupDraft, commitStoredReportGroup } from './report-review-api';
import { AccessError, type BudgetResponse } from './budget-api';
import type { BudgetState } from './use-budget';
import {useFormDraft} from './use-form-draft';
import {groupFormValues,restoreGroupForm} from './report-form-draft';
import { useCreatedEditorRoute } from './use-created-editor-route';
import {syncReturnHref} from './sync-center-model';
import { usePeriodHref } from '../tazrim/components/layout/period-context';
const input = 'mt-1 min-h-11 w-full rounded-xl border bg-card px-3 py-2 text-sm',
  button = 'min-h-11 rounded-xl border px-4 text-sm disabled:opacity-50',
  money = (n: number) => Number.isFinite(n) ? new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS'
  }).format(n) : 'סכום לא זמין';
const serialized = (ui: any) => JSON.stringify(reportInboxDraft(ui, 'react-group-review-v1'));
function day() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  return p.find(v => v.type === 'year')!.value + '-' + p.find(v => v.type === 'month')!.value + '-' + p.find(v => v.type === 'day')!.value;
}
function GroupEditor({
  budget,
  base,
  initial,
  onDone
}: {
  budget: BudgetState;
  base: BudgetResponse;
  initial: Awaited<ReturnType<typeof loadReportGroup>>;
  onDone: (s: string) => void;
}) {
  const {search}=useLocation(),{id:openedSourceId}=useParams(),query=new URLSearchParams(search),incomingId=query.get('intakeId');
  const [ui, setUi] = useState(() => initialGuidedReview(initial.ui, base.revision)),
    [sources, setSources] = useState(initial.sources),
    [baseline, setBaseline] = useState(() => serialized(initial.ui)),
    [review, setReview] = useState<any>(null),
    [pending, setPending] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [focusTargetId,setFocusTargetId]=useState<string|null>(null),
    [confirmed, setConfirmed] = useState(false),
    [restartConfirmation,setRestartConfirmation]=useState(query.get('restart')==='1'),
    [declareConfirmation,setDeclareConfirmation]=useState(false),
    [declareCommand,setDeclareCommand]=useState<{actionId:string;sources:{id:string;sourceHash:string;revision:number;reviewRevision:number}[]}|null>(null),
    [duplicateCommand,setDuplicateCommand]=useState<ReturnType<typeof prepareDuplicateCompletion>|null>(null),
    [showDuplicateDetails,setShowDuplicateDetails]=useState(false),
    [attempt, setAttempt] = useState<'progress' | 'commit' | null>(null),
    [asOf] = useState(day),
    [actionId] = useState(() => crypto.randomUUID()),
    flight = useRef(false),
    alive = useRef(true),
    reviewedUi = useRef<any>(null),
    reviewedPlan = useRef<any>(null),
    savedUi = useRef(initial.ui),
    duplicateHeading = useRef<HTMLHeadingElement>(null),
    declareHeading = useRef<HTMLHeadingElement>(null),
    declareTrigger = useRef<HTMLButtonElement>(null),
    wasDeclaring = useRef(false);
  const href = usePeriodHref(),
    duplicateOnly = !!review?.items.length && !review.issues && review.items.every((item: any) => item.already && !item.skip),
    committedOnly = sources.every(source => source.state === 'committed'),
    dirty = declareConfirmation || declareCommand !== null || attempt !== null || duplicateCommand !== null || confirmed || restartConfirmation || serialized(ui) !== baseline,
    reviewPending = pending || reviewedUi.current!==ui;
  useEffect(()=>{if(declareConfirmation)declareHeading.current?.focus();else if(wasDeclaring.current)declareTrigger.current?.focus();wasDeclaring.current=declareConfirmation;},[declareConfirmation]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    setPending(true);
    if(reviewedPlan.current!==base.plan)setReview(null);
    const next = copyReportGroupUi(ui);
    buildReportInbox(base.plan, next, {
      month: asOf.slice(0, 7),
      today: asOf,
      classifier,
      activityAPI
    }).then(() => {
      if (current) {reviewedUi.current=ui;reviewedPlan.current=base.plan;setReview(next);}
    }).catch(e => {
      if (current) setError(e.message);
    }).finally(() => {
      if (current) setPending(false);
    });
    return () => {
      current = false;
    };
  }, [ui, base.plan, asOf]);
  useEffect(()=>{if(wholeDuplicateReview(review)&&!pending&&!showDuplicateDetails){duplicateHeading.current?.focus({preventScroll:true});duplicateHeading.current?.scrollIntoView({block:'start'});}},[review,pending,showDuplicateDetails]);
  const update = async (key: string, index: number, value: string, extra: Record<string, string> = {}, checked = false) => {
    if (busy || reviewPending || attempt || !review) return;
    try {
      const next = copyReportGroupUi(review);
      next.error = '';
      await changeReportInbox(base.plan, next, {
        dataset: {
          ['inbox' + key[0].toUpperCase() + key.slice(1)]: String(index),
          ...extra
        },
        value,
        checked
      }, reader);
      setUi(next);
      setConfirmed(false);
      setError('');
      setNotice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הבחירה לא עודכנה.');
    }
  };
  const category = (key: string, value: string) => {
    if (busy || reviewPending || attempt || !review) return;
    const next = copyReportGroupUi(review);
    next.categoryChoices.set(key, value);
    next.guided.categories='unset';
    setUi(next);
    setConfirmed(false);
  };
  const skip = (index: number, month: string) => {
    if (busy || reviewPending || attempt || !review) return;
    const next = copyReportGroupUi(review);
    next.items[index].monthDecisions[month] = 'skip';
    setUi(next);
    setConfirmed(false);
  };
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(base.vault ?? {
        format: 'monthly-flow-v1',
        plan: base.plan
      }, null, 2)], {
        type: 'application/json'
      })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'budgit-before-report-group.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const saveRaw = async (mode: 'progress' | 'commit', proposal = review) => {
    if (flight.current || reviewPending || !review || !initial.storageAllowed || attempt && attempt !== mode || mode === 'commit' && (duplicateOnly || !review.build || review.issues || optionalCategoryCounts(proposal).missing>0&&proposal.guided.categories!=='resolved')) return false;
    flight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const prepared=copyReportGroupUi(proposal);
      if(optionalCategoryCounts(prepared).missing===0)prepared.guided.categories='resolved';
      const draft = reportInboxDraftForWrite(prepared, prepared.items.filter((item: any) => !item.storedCommitted), 'react-group-review-v1');
      setAttempt(mode);
      if (mode === 'progress') {
        const saved = committedOnly ? await Promise.all(sources.map(async source=>{const result=await updateReportLifecycle(budget.budgetId,base,source,'save-review',{draft,reviewRevision:source.reviewRevision??0});return{...source,...result,activeDraft:draft};})) : await saveStoredReportGroupDraft(budget.budgetId, base, sources, draft, prepared.issues ? 'needs_review' : 'ready');
        if (!alive.current) return false;
        const next = copyReportGroupUi(prepared);
        for (const item of next.items) item.storedRevision = saved.find(s => s.id === item.storedId)!.revision;
        setSources(saved);
        savedUi.current = copyReportGroupUi(next);
        setUi(next);
        setBaseline(serialized(next));
        setAttempt(null);
        setConfirmed(false);
        setNotice('החלטות הקבוצה נשמרו. נתוני התקציב לא השתנו.');
      } else {
        if(committedOnly){await updateReportLifecycle(budget.budgetId,base,sources[0],'save-review',{draft,reviewRevision:sources[0].reviewRevision??0});}
        const result = await commitStoredReportGroup(budget.budgetId, base, sources, draft, review.build, actionId);
        if (!alive.current) return false;
        setAttempt(null);
        budget.accept(result);
        onDone('השינויים אושרו ונשמרו בתקציב.');
      }
      return true;
    } catch (e) {
      if (alive.current) {
        if (e instanceof AccessError) budget.invalidate(e.message);else setError(e instanceof Error ? e.message : 'תוצאת הפעולה לא אושרה.');
      }
      return false;
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const formDraft=useFormDraft({
    kind: 'detail',
    dirty,
    busy,
    saveError: (attempt || duplicateCommand || declareCommand) && error ? error : undefined,
    discard: () => {
      setConfirmed(false);
      setDeclareConfirmation(false);
      setDeclareCommand(null);
      setRestartConfirmation(false);
      setDuplicateCommand(null);
      setAttempt(null);
      setUi(copyReportGroupUi(savedUi.current));
      setBaseline(serialized(savedUi.current));
    },
    save: () => declareCommand ? declareDuplicate() : duplicateCommand ? finishDuplicate() : saveRaw('progress')
  },{budgetId:budget.budgetId,base,kind:'report-group',record:initial.sources.map(s=>s.id).sort().join(','),values:groupFormValues(ui),baseline:groupFormValues(savedUi.current),restore:value=>{setUi(initialGuidedReview(restoreGroupForm(savedUi.current,value),base.revision));setConfirmed(false)},mutationPending:!!attempt||!!duplicateCommand||!!declareCommand});
  const save=(mode:'progress'|'commit',proposal=review)=>formDraft.saveWith(()=>saveRaw(mode,proposal));
  const plan = review ? reportInboxBase(base.plan, review) : base.plan,
    accounts = cashAccountList(plan),
    cards = creditCards(plan),
    ready = !reviewPending && !duplicateOnly && initial.storageAllowed && !!review?.build && !review?.issues && (!committedOnly || review.items.some((item: any) => !item.skip && !item.already)) && (!review.items.some((item: any) => item.activity) || initial.activitySupported);
  const checks=reportReviewChecks(review),categoryCounts=optionalCategoryCounts(review);
  const categoriesResolved=categoryCounts.missing===0||ui.guided.categories==='resolved';
  const openCheck=(_target:ReviewStep,id:string)=>{if(busy||reviewPending||attempt||!review)return;setFocusTargetId(id)};
  useEffect(()=>{if(pending||!focusTargetId||reviewedUi.current!==ui)return;const target=document.getElementById(focusTargetId);if(!target||target.closest('[hidden]'))return;target.focus({preventScroll:true});target.scrollIntoView({block:'center'});setFocusTargetId(null)},[pending,review,focusTargetId,ui]);
  const confirmUnknown=(checked:boolean)=>{if(busy||reviewPending||attempt||!review)return;const next=copyReportGroupUi(review);next.guided={...next.guided,categories:checked?'resolved':'unset'};setUi(next);setConfirmed(false)};
  const restart=async()=>{
    if(busy||flight.current||reviewPending||attempt||committedOnly||!restartConfirmation)return;
    setBusy(true);setError('');setNotice('');
    try{
      const fresh=await loadReportGroup(budget.budgetId,base,sources.map(source=>source.id),new AbortController().signal,fetch,false,{},true);
      if(fresh.resultOnly||fresh.sources.length!==sources.length||fresh.sources.some(source=>sources.find(previous=>previous.id===source.id)?.revision!==source.revision))throw Error('הדוחות השתנו. יש לפתוח אותם מחדש לפני התחלה מחדש.');
      const reset=initialGuidedReview(fresh.ui,base.revision);
      await buildReportInbox(base.plan,reset,{month:asOf.slice(0,7),today:asOf,classifier,activityAPI});
      setBusy(false);
      if(await save('progress',reset)){setRestartConfirmation(false);setNotice('הבדיקה התחילה מחדש מהמקורות. הבחירות הקודמות הוסרו; נתוני התקציב לא השתנו.');}
    }catch(e){if(e instanceof AccessError)budget.invalidate(e.message);else setError(e instanceof Error?e.message:'לא ניתן להתחיל מחדש. ההתקדמות השמורה נשארה.');setBusy(false)}
  };
  const declareDuplicate = async () => {
    if(flight.current||!declareConfirmation||sources.some(source=>source.state==='committed')||!initial.storageAllowed)return false;
    const command=declareCommand??{actionId:crypto.randomUUID(),sources:sources.map(source=>({id:source.id,sourceHash:source.sourceHash,revision:source.revision,reviewRevision:source.reviewRevision??0}))};
    setDeclareCommand(command);flight.current=true;setBusy(true);setError('');
    try{
      const result=await updateReportLifecycle(budget.budgetId,base,command.sources[0],'declare-duplicate',{...command,confirm:true});
      if(result.lifecycle!=='digested'||result.completionKind!=='declared-duplicate')throw Error('סיום הדוח לא אומת. אפשר לבדוק שוב את אותה פעולה.');
      if(!alive.current)return false;
      setDeclareCommand(null);setDeclareConfirmation(false);onDone('הדוח סומן ככפול והטיפול הסתיים ללא קליטת תנועות או שינוי בסכומים. המקור נשמר לבדיקה מחודשת.');return true;
    }catch(error){if(alive.current){if(error instanceof ReportLifecycleError&&error.status>=400&&error.status<500)setDeclareCommand(null);if(error instanceof AccessError)budget.invalidate(error.message);else setError(error instanceof Error?error.message:'לא ניתן לאמת את סיום הטיפול. אפשר לנסות שוב את אותה פעולה.');}return false;}
    finally{flight.current=false;if(alive.current)setBusy(false);}
  };
  const finishDuplicate = async () => {
    if(flight.current || reviewPending || !confirmed || !review) return false;
    if(!wholeDuplicateReview(review)){setError('הכפילות הוכחה רק לחלק מהמקור. יש לבדוק את החלקים שנותרו לפני השלמת כל הדוח.');return false;}
    let command;
    try{command=duplicateCommand??prepareDuplicateCompletion(sources,review,base)}catch(error){setError(error instanceof Error?error.message:'יש לפתוח מחדש את הדוח.');return false;}
    setDuplicateCommand(command);flight.current=true;setBusy(true);setError('');
    try{
      await finishDuplicateCompletion(budget.budgetId,base,command);
      if(!alive.current)return false;
      setDuplicateCommand(null);setConfirmed(false);onDone('הדוח הכפול סומן כנקלט. לא בוצע שינוי כספי נוסף.');
      return true;
    }catch(error){if(alive.current){if(error instanceof AccessError)budget.invalidate(error.message);else setError(error instanceof Error?error.message:'השלמת הדוח לא אושרה. אפשר לבדוק שוב את אותה פעולה.');}return false}
    finally{flight.current=false;if(alive.current)setBusy(false)}
  };
  if(wholeDuplicateReview(review)&&!review.items.some((item:any)=>item.matchReviews?.length)&&!reviewPending&&!showDuplicateDetails)return <section className="space-y-4" aria-label="השלמת דוח כפול">
    <h2 ref={duplicateHeading} tabIndex={-1} className="scroll-mt-20 text-xl font-semibold outline-none">דוח כפול · אין נתונים חדשים</h2>
    <p className="text-sm">נתוני הדוח כבר קיימים בתקציב. אפשר לסיים את הטיפול בלי לקלוט אותם שוב.</p>
    {review.items.map((item:any)=><section key={item.storedId} className="surface space-y-3 rounded-xl p-4"><h3 className="break-words font-semibold"><bdi>{item.name}</bdi></h3><p className="text-sm"><bdi>{base.budget?.name??'אישי'}</bdi> · <bdi>{item.kind==='bank'?accounts.find((account:any)=>account.id===item.target)?.label:cards.find((card:any)=>card.id===item.target)?.name}</bdi></p><p className="text-sm">תקופה: <bdi dir="ltr">{item.kind==='bank'?item.from+' — '+item.to:item.report?.dueDate}</bdi></p><button type="button" className={button} disabled={busy} onClick={()=>{const source=sources.find(source=>source.id===item.storedId);if(source)void downloadReportOriginal(budget.budgetId,base,source).catch(error=>setError(error.message))}}>הורדת המקור לבדיקה</button></section>)}
    <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" disabled={busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>בדקתי שהדוח כבר נקלט ושאין בו נתונים חדשים</label>
    {error&&<p role="alert" className="surface rounded-xl border border-destructive p-4 text-sm">{error}</p>}
    <p className="text-xs text-muted-foreground">בסיום Budgit יוודא שהדוח כולו כבר נרשם, יסמן אותו כנקלט וישמור את המקור למשך 30 יום מהשלמת הטיפול.</p>
    <div className="flex flex-wrap gap-3"><button type="button" className={button+' bg-primary text-primary-foreground'} disabled={busy||!confirmed} onClick={()=>void finishDuplicate()}>{busy?'מאמתים את השלמת הדוח…':duplicateCommand?'בדיקת תוצאת הסיום':'סיום טיפול בדוח כפול'}</button><button type="button" className={button} disabled={busy||!!duplicateCommand} onClick={()=>setShowDuplicateDetails(true)}>בדיקת התנועות ושינוי ההחלטות</button>{!committedOnly&&<button type="button" className={button} disabled={busy||!!duplicateCommand} onClick={()=>{setShowDuplicateDetails(true);setRestartConfirmation(true)}}>התחלה מחדש</button>}</div>
    {!committedOnly&&sources.map(source=><Link key={source.id} className="inline-flex min-h-11 items-center text-sm text-destructive underline" href={href(incomingId&&/^[a-f0-9-]{36}$/.test(incomingId)&&source.id===openedSourceId?'/incoming?sync=report&report='+encodeURIComponent(incomingId)+'&panel=delete':'/upload/'+encodeURIComponent(source.id)+'/delete')}>מחיקת דוח שלא נקלט · <bdi className="ms-1">{source.name}</bdi></Link>)}
    {duplicateCommand&&error&&<p className="text-sm">אפשר לנסות שוב את אותה השלמה. דוחות שהושלמו לא ייקלטו מחדש.</p>}
  </section>;
  if(!formDraft.ready)return <p role="status">בודקים טיוטה במכשיר…</p>;
  if(declareConfirmation)return <section className="surface min-w-0 space-y-4 rounded-xl p-4" aria-label="סימון דוח ככפול"><h2 ref={declareHeading} tabIndex={-1} className="scroll-mt-20 text-xl font-semibold outline-none">סיום ללא קליטה — הדוח כולו כפול</h2><p>הפעולה תסמן את כל הדוחות הבאים ככפולים לפי בחירתך ותסיים את הטיפול בהם. לא ייקלטו תנועות, סיווגים או סכומים חדשים, גם אם נשארו בדיקות פתוחות.</p><p className="text-sm">תקציב: <bdi>{base.budget?.name??'אישי'}</bdi></p><ul className="space-y-2">{sources.map(source=><li key={source.id} className="break-words rounded-xl border p-3"><bdi>{source.name}</bdi></li>)}</ul><p className="text-sm text-muted-foreground">יש לבחור בכך רק אם הדוח כולו כבר טופל או אינו מוסיף מידע. המקור וההתקדמות השמורה יישמרו, ואפשר יהיה לפתוח אותו מחדש. הבחירות שלא נשמרו במסך הזה לא ייקלטו.</p>{error&&<p role="alert">{error}</p>}<div className="flex flex-wrap gap-3"><button type="button" className={button+' bg-primary text-primary-foreground'} disabled={busy} onClick={()=>void formDraft.saveWith(declareDuplicate)}>{busy?'מסיימים ללא קליטה…':declareCommand?'בדיקת תוצאת הסיום':'אישור — סימון ככפול וסיום ללא קליטה'}</button><button type="button" className={button} disabled={busy||!!declareCommand} onClick={()=>setDeclareConfirmation(false)}>חזרה לבדיקת הדוח</button></div>{declareCommand&&error&&<p className="text-sm">עד אימות התוצאה הבחירות נעולות. ניסיון חוזר בודק את אותה פעולה ואינו קולט תנועות.</p>}</section>;
  return <div className="space-y-4">{showDuplicateDetails&&wholeDuplicateReview(review)&&<button type="button" className={button} disabled={busy||reviewPending||!!attempt} onClick={()=>setShowDuplicateDetails(false)}>חזרה לסיום הדוח הכפול</button>}<h2 className="scroll-mt-20 text-xl font-semibold">בדיקת הדוח וסיווג העסקאות</h2>{!sources.some(source=>source.state==='committed')&&<section className="surface min-w-0 space-y-2 rounded-xl border p-4" aria-label="סיום ללא קליטה"><h3 className="font-semibold">הדוח כולו כבר טופל?</h3><p className="text-sm">אפשר לסמן אותו ככפול ולסגור את הטיפול ללא קליטת תנועות, גם כשאין התאמה אוטומטית לרישום שמור.</p><button ref={declareTrigger} type="button" className={button} disabled={busy||!!attempt||!!duplicateCommand||!initial.storageAllowed} onClick={()=>{setError('');setDeclareConfirmation(true)}}>סימון הדוח ככפול וסיום ללא קליטה</button></section>}{ui.guidedContextChanged&&<p role="status">התקציב השתנה מאז שמירת הבדיקה. הבחירות נשמרו; יש לבדוק שוב את השלבים.</p>}{base.vault && <p className="surface rounded-xl p-4 text-sm">{reportStorageDisclosure}{!initial.storageAllowed && ' נדרש אישור בעל המרחב במרכז הדוחות לפני שמירת התקדמות או קליטה.'}</p>}{committedOnly && <p className="surface rounded-xl p-4 text-sm">זהו מקור שכבר נקלט בעבר. אפשר לשמור את התקדמות הבדיקה בנפרד מהקליטה המקורית. שמירת התקדמות משהה את מועד הסרת המקור. קובץ המקור ורישום הקליטה הקודם יישמרו.</p>}<p className="text-sm text-muted-foreground">כל הדוחות נבדקים יחד. שמירת התקדמות שומרת החלטות בלבד; קליטה שומרת את הקבוצה והתקציב יחד. קטגוריות אפשר להשלים בהמשך.</p>{pending && <p role="status">בודקים את הקבוצה…</p>}{error && <p role="alert" className="surface rounded-xl p-4 text-sm">{error}</p>}{error&&!pending&&reviewedUi.current!==ui&&<button type="button" className={button} onClick={()=>{setError('');setUi(copyReportGroupUi(ui))}}>בדיקה מחדש של הבחירות</button>}{notice && <p role="status" className="surface rounded-xl p-4 text-sm">{notice}</p>}{review?.error && <p role="alert">{review.error}</p>}<ReportReviewChecks compact={false} checks={checks} disabled={busy||reviewPending||!!attempt||reviewPending} onOpen={openCheck}/><div>{review&&<ReportMatchReview review={review} plan={plan} disabled={busy||reviewPending||!!attempt} focusId={focusTargetId} onChoose={(index,row,value)=>void update('duplicate',index,value,{row})}/>}</div><fieldset disabled={busy || reviewPending || attempt !== null} className="space-y-4">{review?.items.map((item: any, index: number) => <section key={item.storedId} id={`report-source-${index}`} tabIndex={-1} className="surface min-w-0 space-y-3 break-words rounded-xl p-4"><h2 className="font-semibold"><bdi>{item.name}</bdi></h2>{true&&<><p className="text-sm">תקציב: {base.budget?.name??'אישי'}</p><button className={button} type="button" onClick={()=>void downloadReportOriginal(budget.budgetId,base,sources[index]).catch(e=>setError(e.message))}>הורדת המקור לבדיקה</button></>}{item.error ? <p role="alert">{item.error}</p> : item.skip || item.already ? <><p>{item.skip ? 'הקובץ הושאר מחוץ לקליטה. הדוח שכבר נשמר נשאר ללא שינוי.' : item.reason ?? 'המקור כבר קיים; לא יחויב שוב.'}</p>{item.skip && <button type="button" className={button} onClick={() => void update('skip', index, '', {}, false)}>חזרה לבדיקת הקובץ</button>}{item.activity && !item.skip && <button type="button" className={button} onClick={() => void update('cycle', index, '')}>בחירת מחזור פעילות אחר</button>}</> : <><div className="space-y-3" data-review-stage="account">{item.kind === 'ambiguous' && <label className="block text-sm">מה מכיל הקובץ?<select className={input} value="" onChange={e => void update('kind', index, e.target.value)}><option value="">בחירת מבנה</option><option value="bank">תנועות חשבון בנק</option><option value="card">סיכום כרטיס ללא פירוט</option></select></label>}</div><div className="space-y-3" data-review-stage="account">{item.kind === 'sheets' && <label className="block text-sm">בחירת גיליון<select className={input} value="" onChange={e => void update('sheet', index, e.target.value)}><option value="">בחירת גיליון</option>{item.sheets.map((s: any, i: number) => <option key={i} value={i}>{s.sheetName ?? 'גיליון ' + (i + 1)}</option>)}</select></label>}</div>{['bank', 'card'].includes(item.kind) && <><div className="space-y-3" data-review-stage="account"><label className="block text-sm">{item.kind === 'bank' ? 'חשבון בנק' : 'כרטיס'}<select className={input} value={item.target} onChange={e => void update('target', index, e.target.value)}><option value="">בחירת יעד</option>{(item.kind === 'bank' ? accounts : cards).map((target: any) => <option key={target.id} value={target.id}>{target.label ?? target.name}</option>)}<option value="new">הוספת {item.kind === 'bank' ? 'חשבון' : 'כרטיס'}</option></select></label></div><div className="space-y-3" data-review-stage="account">{(review.newAccounts.some((a: any) => a.id === item.target) || review.newCards.some((c: any) => c.id === item.target)) && <label className="block text-sm">שם לזיהוי<input maxLength={60} className={input} value={accounts.find((a: any) => a.id === item.target)?.label ?? cards.find((c: any) => c.id === item.target)?.name ?? ''} onChange={e => void update('label', index, e.target.value)} /></label>}</div><div className="space-y-3" data-review-stage="account">{review.newAccounts.some((a: any) => a.id === item.target) && <label className="block text-sm">הבנק של החשבון החדש<select className={input} value={review.newAccounts.find((a: any) => a.id === item.target).bankName ?? ''} onChange={e => void update('provider', index, e.target.value)}><option value="">בחירת בנק</option><option value="hapoalim">הפועלים</option><option value="one-zero">וואן זירו</option></select></label>}</div><div className="space-y-3" data-review-stage="account">{item.kind === 'card' && <label className="block text-sm">חשבון משלם<select className={input} value={item.payer} onChange={e => void update('payer', index, e.target.value)}><option value="">בחירת חשבון</option>{accounts.filter(a => !plan.cashPlanning?.cardAccounts[item.target] || a.id === plan.cashPlanning.cardAccounts[item.target]).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}{!plan.cashPlanning?.cardAccounts[item.target] && <option value="new">הוספת חשבון משלם חדש</option>}</select></label>}</div><div className="space-y-3" data-review-stage="figures">{item.activity && <><label className="block text-sm">מועד חיוב מתוך הפעילות<select className={input} value={item.activityCycle ?? ''} onChange={e => void update('cycle', index, e.target.value)}><option value="">בחירת מועד</option>{[...new Set(item.activity.entries.filter((r: any) => r.dueDate && !r.pending).map((r: any) => r.dueDate))].sort().map((date: any) => <option key={date} value={date}>{date}</option>)}</select></label><label className="block text-sm">סכום החיוב הסופי שאומת בכרטיס או בבנק<input className={input} type="number" step="0.01" dir="ltr" value={item.activityTotal ?? ''} onChange={e => void update('cycleTotal', index, e.target.value)} /></label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={!!item.activityConfirmed} onChange={e => void update('cycleConfirmed', index, '', {}, e.target.checked)} />בדקתי מול החיוב הסופי; רק המועד שנבחר ייקלט</label>{item.activityError && <p role="status">{item.activityError}</p>}</>}</div><div className="space-y-3" data-review-stage="figures">{item.kind === 'card' && !item.activity && (item.report?.entries ? <p className="text-sm">חיוב המקור: <bdi dir="ltr">{item.report.dueDate}</bdi> · <bdi>{money(item.report.amount)}</bdi></p> : <label className="block text-sm">מועד החיוב<input type="date" className={input} value={item.report?.dueDate ?? ''} onChange={e => void update('date', index, e.target.value)} /></label>)}</div><div className="space-y-3" data-review-stage="figures">{item.kind === 'bank' && <><label className="block text-sm">מתאריך<input type="date" className={input} readOnly={!!item.inspection?.pdfReconciliation} value={item.from ?? ''} onChange={e => void update('from', index, e.target.value)} /></label><label className="block text-sm">עד תאריך<input type="date" className={input} readOnly={!!item.inspection?.pdfReconciliation} value={item.to ?? ''} onChange={e => void update('to', index, e.target.value)} /></label><label className="block text-sm">היקף הדוח<select className={input} value={item.bankOptions.scope} onChange={e => void update('scope', index, e.target.value)}><option value="complete">כל התנועות בטווח</option><option value="partial">דוח מסונן</option></select></label></>}</div></>}<div className="space-y-3" data-review-stage="figures">{item.kind === 'bank' && item.preview?.months?.length > 0 && <section className="space-y-2 text-sm"><h3 className="font-semibold">הצעת הדיווח לחשבון</h3>{item.preview.months.map((month: any) => <div key={month.month} className="space-y-1 rounded-xl border p-3"><p><bdi dir="ltr">{month.month}</bdi> · {month.mode === 'skip' ? 'ללא שינוי' : month.mode === 'full' ? 'דיווח מלא' : 'דיווח חלקי'}</p>{Object.entries(month.accountValues).map(([key, value]) => <p key={key}><bdi>{budgetFields(plan).find(([id]: any) => id === key)?.[1] ?? key}</bdi> · <bdi>{money(Number(value) / 100)}</bdi></p>)}{month.sourceBalance && <p>יתרת מקור: <bdi>{money(month.sourceBalance.cents / 100)}</bdi> · <bdi dir="ltr">{month.sourceBalance.date}</bdi></p>}</div>)}</section>}</div><div className="space-y-3" data-review-stage="figures">{item.preview?.rows?.length > 0 && <details className="rounded-xl border p-3 text-sm"><summary className="min-h-11 cursor-pointer">פירוט המקור · {item.preview.rows.length === 1 ? 'שורה אחת' : `${item.preview.rows.length} שורות`}</summary><p>מוצגות עד 50 שורות. כל שורות המקור נבדקות יחד; הפירוט כלול בסכומים החודשיים.</p><ul className="divide-y">{item.preview.rows.slice(0, 50).map((row: any, i: number) => <li key={row.id ?? i} className="space-y-1 py-2"><p><bdi dir="ltr">{row.entry?.date ?? row.date}</bdi> · <bdi>{row.entry?.merchant ?? row.description}</bdi></p><p>חיוב / תנועה: <bdi>{money((row.entry?.amountCents ?? row.amountCents) / 100)}</bdi>{row.entry && <> · סכום עסקה מקורי: <bdi>{money(row.entry.originalCents / 100)}</bdi></>}</p></li>)}</ul></details>}</div><div className="space-y-3" data-review-stage="figures">{item.activity && <details className="rounded-xl border p-3 text-sm"><summary className="min-h-11 cursor-pointer">שורות מחוץ למחזור שנבחר</summary><p>יתרת הגיליון אינה חיוב חודשי. עסקאות בקליטה, מחזורים אחרים ותשלומים ללא סכום חודשי ברור אינם נכללים.</p>{item.activity.entries.filter((row: any) => row.pending || row.dueDate !== item.activityCycle || row.installment).slice(0, 50).map((row: any, i: number) => <p key={i}><bdi>{row.merchant}</bdi> · <bdi>{money(row.amountCents / 100)}</bdi> · {row.pending ? 'עסקה בקליטה' : row.installment ? 'סכום התשלום החודשי אינו ברור' : row.dueDate ? 'מחזור אחר' : 'ללא מועד חיוב'}</p>)}</details>}</div><div className="space-y-3" data-review-stage="exceptions">{(item.statementConflict || item.preview?.replacement) && <div id={exceptionId(index,Math.max(0,item.questions.findIndex((q:any)=>q.type==='statement-conflict')))} tabIndex={-1}><ReportStatementConflict comparison={item.statementConflict ?? item.preview.replacement} accepted={!!item.preview?.replacement} onReplace={token => void update('replacement', index, token)} onKeep={() => void update('skip', index, '', {}, true)} /></div>}</div><div className="space-y-3" data-review-stage="exceptions">{item.warning && <p id={`report-warning-${index}`} tabIndex={-1} role="alert" className="text-sm">{item.warning}</p>}</div><div className="space-y-3" data-review-stage="exceptions">{item.questions?.map((q: any, qi: number) => ['statement-conflict','duplicate','card-match'].includes(q.type)?null:<div key={qi} id={exceptionId(index,qi)} tabIndex={-1} className="rounded-xl border p-3 text-sm">{q.type === 'protected-month' ? <><p>החודש <bdi dir="ltr">{q.month}</bdi> מוגן מפני החלפה.</p><button type="button" className={button} onClick={() => skip(index, q.month)}>להשאיר את החודש כפי שהוא</button></> : q.type === 'direct' ? <label>האם התכנון של <bdi>{q.month}</bdi> כבר כלול בדוח?<select className={input} value={typeof item.directIncluded[q.month] === 'boolean' ? item.directIncluded[q.month] ? 'included' : 'additional' : ''} onChange={e => void update('direct', index, e.target.value, {
                  month: q.month
                })}><option value="">בחירה מפורשת</option><option value="included">כבר בוצע וכלול בדוח</option><option value="additional">טרם בוצע; להשאיר בתכנון</option></select></label> : <p>המקור דורש בדיקה נוספת; לא תתבצע קליטה חלקית.</p>}</div>)}</div></>}</section>)}<div className="space-y-3" data-review-stage="categories">{review&&<ReportClassificationReview review={review} plan={plan} disabled={busy||reviewPending||!!attempt||reviewPending} focusId={focusTargetId} onBank={(index,value)=>void update('bankReviewGroup',index,value)} onCategory={category} onOpen={openCheck} href={href}/>}</div></fieldset><div className="space-y-3" data-review-stage="summary">{duplicateOnly && <section className="surface space-y-2 rounded-xl p-4"><h2 className="font-semibold">דוח כפול · אין עסקאות חדשות</h2><p className="text-sm">כל התנועות כבר קיימות בחשבון ובתקופה שנבחרו. הדוח לא ייקלט שוב, והנתונים השמורים נשארים ללא שינוי.</p><Link className="inline-flex min-h-11 items-center text-sm underline" href={href('/upload')}>חזרה למרכז הדוחות</Link></section>}</div>{review && <p role="status" className="text-sm">{duplicateOnly ? 'אין נתונים חדשים לקליטה. יש לאשר את השלמת הטיפול בדוח הכפול.' : review.issues ? 'הקליטה ממתינה להחלטות שמפורטות ברשימת הבדיקות.' : review.readyRows === 1 ? 'שורה אחת מוכנה לבדיקה סופית.' : `${review.readyRows} שורות מוכנות לבדיקה סופית.`}</p>}
{categoryCounts.missing>0&&<label className="surface flex min-h-11 items-start gap-3 rounded-xl p-4 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={busy||reviewPending||!!attempt} checked={ui.guided.categories==='resolved'} onChange={event=>confirmUnknown(event.target.checked)}/><span>להשאיר <bdi>{categoryCounts.missing}</bdi> עסקאות כ״לא ידוע״ ולסיים את הטיפול בדוח. אפשר לשנות את הקטגוריה למעלה לפני האישור.</span></label>}
{review&&<><GuidedReportSummary review={review} basePlan={base.plan} budgetName={base.budget?.name??'אישי'} categories={categoriesResolved?'resolved':'later'}/><button type="button" className={button} onClick={backup}>הורדת גיבוי לפני שמירה</button>{duplicateOnly&&<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy||reviewPending||!!attempt} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>בדקתי: הדוח כבר נרשם ואין שינויים חדשים</label>}</>}
<nav aria-label="פעולות בדוח" className="flex flex-wrap gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
 <button type="button" className={button+' bg-primary text-primary-foreground'} disabled={busy||reviewPending||!!attempt||!categoriesResolved||!ready} onClick={()=>void save('commit')}>{busy?'שומרים את הדוח…':attempt==='commit'?'בדיקת תוצאת הסיום':'סיום וקליטה לתקציב'}</button>
 <button type="button" className={button} disabled={busy||reviewPending||attempt==='commit'} onClick={()=>void save('progress')}>שמירת התקדמות</button>
 <Link className="inline-flex min-h-11 items-center underline" href={href('/incoming')}>חזרה לתיבת הדוחות</Link>
</nav>
{!committedOnly&&<section className="surface space-y-3 rounded-xl p-4"><h3 className="font-semibold">ניהול הדוח שלא נקלט</h3><p className="text-sm text-muted-foreground">אפשר להמשיך מההתקדמות השמורה, להתחיל את הבדיקה מחדש מהקובץ, או למחוק מקור שלא נקלט.</p>
 {!restartConfirmation?<button type="button" className={button} disabled={busy||reviewPending||!!attempt} onClick={()=>setRestartConfirmation(true)}>התחלה מחדש</button>:<div className="space-y-3 rounded-xl border p-3"><p className="text-sm">התחלה מחדש תסיר את החלטות הבדיקה השמורות של הקבוצה. קובצי המקור והנתונים שכבר נקלטו בתקציב נשמרים.</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||reviewPending||!!attempt} onClick={()=>void restart()}>אישור התחלה מחדש</button><button type="button" className={button} disabled={busy} onClick={()=>setRestartConfirmation(false)}>ביטול</button></div></div>}
 {sources.map(source=><Link key={source.id} className="inline-flex min-h-11 items-center text-sm text-destructive underline" href={href(incomingId&&/^[a-f0-9-]{36}$/.test(incomingId)&&source.id===openedSourceId?'/incoming?sync=report&report='+encodeURIComponent(incomingId)+'&panel=delete':'/upload/'+encodeURIComponent(source.id)+'/delete')}>מחיקת דוח שלא נקלט · <bdi className="ms-1">{source.name}</bdi></Link>)}
 </section>}{attempt && error && <p className="text-sm">הבחירות נעולות לניסיון חוזר באותה פעולה, כדי למנוע קליטה כפולה.</p>}</div>;
}
export function ReportGroupPage({
  budget,
  fixture
}: {
  budget: BudgetState;
  fixture: boolean;
}) {
  const {
      id = ''
    } = useParams(),
    {
      search
    } = useLocation(),
    reimport = new URLSearchParams(search).get('reimport') === '1',
    href = usePeriodHref(),
    [data, setData] = useState<Awaited<ReturnType<typeof loadReportGroup>> | null>(null),
    [error, setError] = useState(''),
    [done, setDone] = useState(''),
    [loading, setLoading] = useState(true),
    base = budget.status === 'ready' ? budget.value : null,
    viewer = budget.status === 'ready' && budget.spaces.find(s => s.id === budget.budgetId)?.role === 'viewer';
  const returnToSync=syncReturnHref(search);
  useCreatedEditorRoute(done ? returnToSync??href('/incoming') : null, done);
  useEffect(() => {
    if (!base || fixture || viewer || done) return;
    const abort = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    const ids = id ? [id] : (new URLSearchParams(search).get('reports') ?? '').split(',').filter(Boolean);
    loadReportGroup(budget.budgetId, base, ids, abort.signal, fetch, reimport, {
      kind: new URLSearchParams(search).get('kind') ?? undefined,
      target: new URLSearchParams(search).get('target') ?? undefined
    }).then(value => {
      if (!abort.signal.aborted) setData(value);
    }).catch(e => {
      if (abort.signal.aborted) return;
      if (e instanceof AccessError) budget.invalidate(e.message);else setError(e.message);
    }).finally(() => {
      if (!abort.signal.aborted) setLoading(false);
    });
    return () => abort.abort();
  }, [base, budget.budgetId, id, search, fixture, viewer, done, reimport]);
  if (fixture) return <p>קבוצות דוחות אינן זמינות בדוגמה.</p>;
  if (budget.status === 'loading') return <p role="status">טוען חשבון…</p>;
  if (budget.status === 'error') return <p role="alert">{budget.message}</p>;
  return <div className="household-page household-report-page">{returnToSync&&<Link className="inline-flex min-h-11 items-center text-sm text-primary" href={returnToSync}>חזרה למרכז הסנכרון</Link>}<PageHeading className="text-2xl font-semibold">{reimport ? 'בדיקה מחודשת של מקור שמור' : 'בדיקת קבוצת דוחות'}</PageHeading>{viewer ? <p>המרחב פתוח לצפייה בלבד. קליטת דוחות דורשת הרשאת עריכה.</p> : done ? <p role="status">{done}</p> : <>{loading && <p role="status">טוען מקורות והחלטות שמורות…</p>}{error && <p role="alert">{error}</p>}{data && (data.resultOnly?<ReportResult budget={budget} base={budget.value} sources={data.sources}/>:<PurchaseNoteReviewProvider actor={budget.value} enabled={!viewer&&!done}><PurchaseNoteReviewStatus/><GroupEditor budget={budget} base={budget.value} initial={data} onDone={setDone} /></PurchaseNoteReviewProvider>)}</>}</div>;
}
