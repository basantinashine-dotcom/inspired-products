import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronDown, CircleAlert, Clock3,
  ExternalLink, Filter, Hash, Link2, LockKeyhole, MessageCircle, MoreHorizontal,
  PanelLeft, Plus, RotateCcw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Trash2, UserRound, Users, X, Zap,
} from 'lucide-react';
import {
  getGetDecisionQueryKey, getGetSummaryQueryKey, getListDecisionsQueryKey,
  useAddReason, useAskForReason, useAskWhy, useCreateDecision, useDeleteDecision, useGetDecision,
  useGetSummary, useListActivity, useListDecisions,
} from '@workspace/api-client-react';
import type { ActivityItem, Decision, ListDecisionsParams, WhyAnswer } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import './index.css';

const queryClient = new QueryClient();

function formatDate(value?: string | null) {
  if (!value) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return 'Unknown time';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function timeAgo(value?: string | null) {
  if (!value) return '';
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function initials(name?: string, fallback = '?') {
  if (!name) return fallback;
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function Avatar({ name, tone = 'coral' }: { name?: string; tone?: 'coral' | 'mint' | 'ink' }) {
  return <span className={`avatar avatar-${tone}`} aria-hidden="true">{initials(name)}</span>;
}

function StatusPill({ status, sourceState }: { status?: string; sourceState?: string }) {
  if (sourceState === 'deleted') return <span className="pill pill-muted"><CircleAlert size={12} /> Source deleted</span>;
  if (status === 'reversed') return <span className="pill pill-reversed"><RotateCcw size={12} /> Reversed</span>;
  return <span className="pill pill-current"><Check size={12} /> Current</span>;
}

function ChannelTag({ channel, privateChannel }: { channel: string; privateChannel?: boolean }) {
  return <span className="channel-tag">{privateChannel ? <LockKeyhole size={12} /> : <Hash size={13} />}{channel.replace(/^#/, '')}</span>;
}

function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" data-testid="loading-state">{Array.from({ length: rows }).map((_, index) => <div className="skeleton h-20 rounded-2xl" key={index} />)}</div>;
}

function ErrorState({ onRetry, compact = false }: { onRetry?: () => void; compact?: boolean }) {
  return <div className={`state-card ${compact ? 'state-card-compact' : ''}`} data-testid="error-state">
    <div className="state-icon state-icon-warn"><CircleAlert size={18} /></div>
    <div><p className="font-semibold">The memory layer went quiet.</p><p className="text-sm text-muted-foreground">We could not load this view right now.</p></div>
    {onRetry && <button className="button button-soft ml-auto" onClick={onRetry} data-testid="button-retry">Try again</button>}
  </div>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="state-card state-card-empty" data-testid="empty-state">
    <div className="empty-mark"><BookOpen size={23} /></div>
    <div><p className="font-display text-lg font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>
    {action}
  </div>;
}

function MetricCard({ label, value, detail, accent = 'coral', loading }: { label: string; value: string | number; detail: string; accent?: string; loading?: boolean }) {
  return <div className={`metric-card metric-${accent}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
    {loading ? <><div className="skeleton h-9 w-20 rounded-lg" /><div className="skeleton mt-3 h-3 w-28 rounded" /></> : <><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-detail">{detail}</div></>}
  </div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const summary = useGetSummary();
  const allDecisions = useListDecisions({ status: 'all' });
  const navItems = [
    { href: '/', label: 'Overview', icon: PanelLeft },
    { href: '/decisions', label: 'Decisions', icon: BookOpen },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ];
  return <div className="app-frame">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-symbol"><span /><span /><span /></div>
        <div><div className="font-display text-lg font-bold leading-none">decision log</div><div className="brand-caption">team memory layer</div></div>
      </div>
      <div className="workspace-switcher" data-testid="workspace-switcher">
        <div className="workspace-dot">N</div><div className="min-w-0 flex-1"><div className="text-xs text-sidebar-muted">Workspace</div><div className="truncate font-semibold">Northstar Product</div></div><ChevronDown size={15} />
      </div>
      <nav className="nav-stack" aria-label="Main navigation">
        <div className="nav-label">Memory</div>
        {navItems.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={() => setMobileNav(false)} className={`nav-link ${location === href ? 'nav-link-active' : ''}`} data-testid={`link-nav-${label.toLowerCase()}`}><Icon size={17} /><span>{label}</span>{label === 'Decisions' && <span className="nav-count">{allDecisions.data?.length ?? '—'}</span>}</Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="capture-mini"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Capture health</span><span className="font-mono-app text-xs text-accent">{summary.data ? `${summary.data.captureRate}%` : '—'}</span></div><div className="health-track"><div style={{ width: `${summary.data?.captureRate ?? 0}%` }} /></div><p className="mt-2 text-[11px] text-sidebar-muted">Reasons are showing up on time.</p></div>
        <div className="sidebar-user"><Avatar name="Mina Park" tone="mint" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">Mina Park</div><div className="truncate text-[11px] text-sidebar-muted">Product lead</div></div><MoreHorizontal size={16} className="text-sidebar-muted" /></div>
      </div>
    </aside>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-navigation" />}
    <main className="main-content">
       <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation" data-testid="button-open-navigation"><PanelLeft size={19} /></button><div className="breadcrumb"><span className="text-muted-foreground">Northstar Product</span><span className="breadcrumb-slash">/</span><span>{location === '/' ? 'Overview' : location.startsWith('/decisions/') ? 'Decision detail' : location.slice(1).replace('-', ' ')}</span></div><div className="topbar-actions"><span className="connection-dot"><span /> Demo workspace</span><Link href="/settings" className="icon-button" aria-label="Open settings" data-testid="link-settings"><Settings2 size={17} /></Link></div></header>
      <div className="page-wrap">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="page-heading fade-up"><div><div className="eyebrow">{eyebrow}</div><h1 className="font-display text-balance">{title}</h1>{detail && <p className="page-detail">{detail}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}

function DecisionRow({ decision }: { decision: Decision }) {
  return <Link href={`/decisions/${decision.id}`} className="decision-row fade-up" data-testid={`link-decision-${decision.id}`}>
    <div className="decision-row-main"><div className="decision-row-title">{decision.title}</div><div className="decision-row-text">{decision.text}</div><div className="decision-row-meta"><ChannelTag channel={decision.channel} privateChannel={decision.channelType === 'private'} /><span className="dot-separator">·</span><span>{formatDate(decision.decidedAt)}</span><span className="dot-separator">·</span><span>{decision.participantCount} participants</span></div></div>
    <div className="decision-row-side"><StatusPill status={decision.status} sourceState={decision.sourceState} /><ArrowUpRight size={17} className="row-arrow" /></div>
  </Link>;
}

function ActivityFeed({ items, loading, error, onRetry }: { items?: ActivityItem[]; loading?: boolean; error?: boolean; onRetry?: () => void }) {
  return <section className="panel activity-panel"><div className="panel-header"><div><div className="eyebrow">The thread around it</div><h2>Recent activity</h2></div><Link href="/decisions" className="text-link" data-testid="link-see-all-activity">See all <ArrowUpRight size={14} /></Link></div>
    {loading ? <LoadingBlock rows={4} /> : error ? <ErrorState compact onRetry={onRetry} /> : !items?.length ? <EmptyState title="No activity yet" detail="Logged decisions and captured reasons will show up here." /> : <div className="activity-list">{items.slice(0, 6).map((item, index) => <div className="activity-item" key={item.id} data-testid={`activity-item-${item.id}`}><div className={`activity-marker marker-${index % 3}`}><Activity size={14} /></div><div className="min-w-0 flex-1"><div className="activity-label">{item.label}</div><div className="activity-detail">{item.detail}</div><div className="activity-meta"><Avatar name={item.person.name} tone={index % 2 ? 'mint' : 'coral'} /><span>{item.person.name}</span><span className="dot-separator">·</span><span>{timeAgo(item.createdAt)}</span></div></div>{item.decisionId && <Link href={`/decisions/${item.decisionId}`} className="activity-link" aria-label={`Open decision for ${item.label}`} data-testid={`link-activity-${item.id}`}><ArrowUpRight size={15} /></Link>}</div>)}</div>}
  </section>;
}

function WhySearch({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<WhyAnswer | undefined>();
  const askWhy = useAskWhy();
  const submit = (event: FormEvent) => { event.preventDefault(); if (!query.trim()) return; askWhy.mutate({ data: { query: query.trim() } }, { onSuccess: setAnswer }); };
  return <section className={`why-box ${compact ? 'why-box-compact' : ''}`}><div className="why-orbit"><Sparkles size={18} /></div><div className="flex-1 min-w-0"><div className="eyebrow eyebrow-light">Ask the memory layer</div><h2>Why was this decided?</h2><p className="why-subtitle">Search the reasons your team can safely see.</p><form onSubmit={submit} className="why-form"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Why did we pause annual billing?" aria-label="Ask why" data-testid="input-why-search" /><button type="submit" className="button button-sun" disabled={askWhy.isPending || !query.trim()} data-testid="button-ask-why">{askWhy.isPending ? 'Looking…' : 'Ask why'}</button></form>{askWhy.isError && <p className="mt-3 text-sm text-[#ffd5c8]">That question could not be answered. Try again.</p>}{answer && <WhyResult answer={answer} />}</div></section>;
}

function WhyResult({ answer }: { answer: WhyAnswer }) {
  const decision = answer.decision ?? answer.matches?.[0];
  return <div className="why-result" data-testid="why-result"><div className="flex items-start gap-3"><div className="result-check"><Check size={15} /></div><div className="min-w-0 flex-1"><p className="text-sm leading-6">{answer.message}</p>{decision && <Link href={`/decisions/${decision.id}`} className="result-decision" data-testid="link-why-decision"><span>{decision.title}</span><ArrowUpRight size={14} /></Link>}{answer.kind === 'tombstone' && <div className="result-tombstone"><CircleAlert size={14} /> The source is no longer available, but the memory is retained.</div>}</div></div></div>;
}

function Overview() {
  const summary = useGetSummary();
  const activity = useListActivity({ limit: 8 });
  const decisions = useListDecisions({ status: 'current' });
  const latest = useMemo(() => (decisions.data ?? []).slice(0, 4), [decisions.data]);
  return <div className="space-y-8"><PageHeading eyebrow="Workspace overview" title="Keep the why close." detail="A clear view of what your team decided, what still holds, and where context needs a nudge." action={<button className="button button-primary" onClick={() => document.dispatchEvent(new CustomEvent('open-create-decision'))} data-testid="button-log-decision"><Plus size={17} /> Log decision</button>} />
    <div className="metric-grid"><MetricCard label="Current decisions" value={summary.data?.currentDecisions ?? 0} detail={`${summary.data?.totalDecisions ?? 0} logged total`} accent="coral" loading={summary.isLoading} /><MetricCard label="Reasons captured" value={summary.data ? `${summary.data.captureRate}%` : '—'} detail={`${summary.data?.withReasons ?? 0} have context`} accent="mint" loading={summary.isLoading} /><MetricCard label="Avg. time to reason" value={summary.data ? `${summary.data.averageTimeToReasonMinutes}m` : '—'} detail="From decision to first why" accent="sun" loading={summary.isLoading} /><MetricCard label="Active channels" value={summary.data?.activeChannels ?? 0} detail="Listening for decisions" accent="ink" loading={summary.isLoading} /></div>
    <div className="overview-grid"><div className="overview-main"><WhySearch /><section className="panel"><div className="panel-header"><div><div className="eyebrow">Still holds</div><h2>Current decisions</h2></div><Link href="/decisions" className="text-link" data-testid="link-browse-decisions">Browse all <ArrowUpRight size={14} /></Link></div>{decisions.isLoading ? <LoadingBlock rows={3} /> : decisions.isError ? <ErrorState compact onRetry={() => decisions.refetch()} /> : latest.length ? <div className="decision-list">{latest.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</div> : <EmptyState title="Your memory is ready" detail="The next decision logged from Slack will land here." action={<Link href="/decisions" className="button button-soft" data-testid="link-empty-decisions">Browse decisions</Link>} />}</section></div><div className="overview-side"><CaptureHealth summary={summary.data} loading={summary.isLoading} /><ActivityFeed items={activity.data} loading={activity.isLoading} error={activity.isError} onRetry={() => activity.refetch()} /></div></div>
  </div>;
}

function CaptureHealth({ summary, loading }: { summary?: { captureRate: number; missingReasons: number; withReasons: number }; loading?: boolean }) {
  const rate = summary?.captureRate ?? 0;
  return <section className="health-card"><div className="flex items-start justify-between"><div><div className="eyebrow">Capture health</div><h2>Make the why durable.</h2></div><ShieldCheck size={21} className="text-primary" /></div>{loading ? <div className="skeleton mt-6 h-28 rounded-xl" /> : <><div className="health-ring" style={{ '--health-progress': `${rate * 3.6}deg` } as CSSProperties}><div><strong>{rate}%</strong><span>captured</span></div></div><div className="health-stat"><span className="health-dot health-dot-good" /><span><strong>{summary?.withReasons ?? 0}</strong> decisions have a reason</span></div><div className="health-stat"><span className="health-dot health-dot-warn" /><span><strong>{summary?.missingReasons ?? 0}</strong> are waiting on context</span></div></>}</section>;
}

function DecisionsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('');
  const params = useMemo<ListDecisionsParams>(() => ({ query: search || undefined, status: status as ListDecisionsParams['status'], channel: channel || undefined }), [search, status, channel]);
  const decisions = useListDecisions(params);
  return <div className="space-y-7"><PageHeading eyebrow="Decision archive" title="What the team chose." detail="Every logged decision, with its source and the reason it made sense at the time." action={<button className="button button-primary" onClick={() => document.dispatchEvent(new CustomEvent('open-create-decision'))} data-testid="button-log-decision-list"><Plus size={17} /> Log decision</button>} /><div className="filter-bar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search decisions" aria-label="Search decisions" data-testid="input-search-decisions" /></div><div className="select-wrap"><Filter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" data-testid="select-status-filter"><option value="all">All statuses</option><option value="current">Current</option><option value="reversed">Reversed</option><option value="incomplete">Needs a reason</option></select></div><div className="select-wrap"><Hash size={15} /><input value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="Channel" aria-label="Filter by channel" data-testid="input-channel-filter" /></div><div className="filter-summary"><SlidersHorizontal size={14} /> {decisions.data?.length ?? 0} found</div></div>{decisions.isLoading ? <LoadingBlock rows={5} /> : decisions.isError ? <ErrorState onRetry={() => decisions.refetch()} /> : decisions.data?.length ? <div className="decision-archive">{decisions.data.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</div> : <EmptyState title="No decisions match that lens" detail="Try a different status, channel, or search phrase." action={<button className="button button-soft" onClick={() => { setSearch(''); setStatus('all'); setChannel(''); }} data-testid="button-clear-filters">Clear filters</button>} />}</div>;
}

function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const [authorId, setAuthorId] = useState('current-user');
  const [showDelete, setShowDelete] = useState(false);
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const decisionQuery = useGetDecision(id ?? '', { query: { enabled: !!id, queryKey: getGetDecisionQueryKey(id ?? '') } });
  const addReason = useAddReason();
  const askForReason = useAskForReason();
  const deleteDecision = useDeleteDecision();
  const decision = decisionQuery.data;
  const submitReason = (event: FormEvent) => { event.preventDefault(); if (!id || !reason.trim()) return; addReason.mutate({ decisionId: id, data: { text: reason.trim(), authorId, repeatability: 'safe' } }, { onSuccess: () => { setReason(''); setShowReason(false); setNotice('Reason added to the memory.'); client.invalidateQueries({ queryKey: getGetDecisionQueryKey(id) }); client.invalidateQueries({ queryKey: getGetSummaryQueryKey() }); } }); };
  const ask = () => { if (!id) return; askForReason.mutate({ decisionId: id }, { onSuccess: (result) => setNotice(result.message || 'A gentle nudge was sent in the source thread.') }); };
  const remove = () => { if (!id) return; deleteDecision.mutate({ decisionId: id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListDecisionsQueryKey() }); window.history.back(); } }); };
  if (decisionQuery.isLoading) return <div className="space-y-6"><div className="skeleton h-8 w-32 rounded" /><LoadingBlock rows={4} /></div>;
  if (decisionQuery.isError || !decision) return <ErrorState onRetry={() => decisionQuery.refetch()} />;
  return <div className="space-y-6"><Link href="/decisions" className="back-link" data-testid="link-back-decisions"><ArrowLeft size={16} /> All decisions</Link><div className="detail-hero fade-up"><div className="detail-kicker"><ChannelTag channel={decision.channel} privateChannel={decision.channelType === 'private'} /><StatusPill status={decision.status} sourceState={decision.sourceState} /><span className="detail-id">DL-{decision.id.slice(-4).toUpperCase()}</span></div><h1 className="font-display">{decision.title}</h1><p className="detail-lead">{decision.text}</p><div className="detail-byline"><Avatar name={decision.decidedBy.name} /><div><span>Decided by <strong>{decision.decidedBy.name}</strong></span><span className="dot-separator">·</span><span>{formatDate(decision.decidedAt)} at {formatTime(decision.decidedAt)}</span></div><div className="detail-actions"><a className="icon-button" href={decision.permalink} target="_blank" rel="noreferrer" aria-label="Open source in Slack" data-testid="link-source-slack"><ExternalLink size={16} /></a><button className="icon-button danger-icon" onClick={() => setShowDelete(true)} aria-label="Delete decision" data-testid="button-delete-decision"><Trash2 size={16} /></button></div></div></div>
    {notice && <div className="notice" data-testid="success-notice"><Check size={16} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice" data-testid="button-dismiss-notice"><X size={14} /></button></div>}
    <div className="detail-grid"><div className="detail-main"><section className="panel reason-panel"><div className="panel-header"><div><div className="eyebrow">The why</div><h2>Reasons that hold</h2></div><span className="reason-count">{decision.reasons.length} {decision.reasons.length === 1 ? 'reason' : 'reasons'}</span></div>{decision.reasons.length ? <div className="reason-list">{decision.reasons.map((item) => <ReasonCard key={item.id} reason={item} />)}</div> : <EmptyState title="The why is still missing" detail="A decision without its reason is a future question waiting to happen." action={<div className="flex flex-wrap gap-2"><button className="button button-primary" onClick={() => setShowReason(true)} data-testid="button-add-first-reason"><Plus size={16} /> Add a reason</button><button className="button button-soft" onClick={ask} disabled={askForReason.isPending} data-testid="button-ask-first-reason"><MessageCircle size={16} /> {askForReason.isPending ? 'Sending…' : 'Ask in Slack'}</button></div>} />}{decision.reasons.length > 0 && <div className="reason-actions"><button className="button button-soft" onClick={() => setShowReason(true)} data-testid="button-add-reason"><Plus size={16} /> Add another reason</button><button className="button button-ghost" onClick={ask} disabled={askForReason.isPending} data-testid="button-ask-reason"><MessageCircle size={16} /> {askForReason.isPending ? 'Sending…' : 'Ask in Slack'}</button></div>}</section><section className="panel source-panel"><div className="panel-header"><div><div className="eyebrow">Source</div><h2>Where this memory came from</h2></div><Link2 size={18} className="text-muted-foreground" /></div><a href={decision.permalink} target="_blank" rel="noreferrer" className="source-card" data-testid="link-source-card"><div className="source-slack-mark"><Hash size={18} /></div><div className="min-w-0 flex-1"><strong>#{decision.channel.replace(/^#/, '')}</strong><p>Original Slack conversation</p>{decision.sourceEditedAt && <span className="source-edited">Edited {formatDate(decision.sourceEditedAt)}</span>}</div><ExternalLink size={16} /></a><div className="access-note"><ShieldCheck size={15} /><span>Access-aware link. People only see what they already have permission to see in Slack.</span></div></section></div><aside className="detail-side"><section className="side-card"><div className="eyebrow">Memory details</div><div className="metadata-list"><MetaItem icon={<UserRound size={15} />} label="Logged by" value={decision.loggedBy.name} /><MetaItem icon={<Users size={15} />} label="Participants" value={`${decision.participantCount} people`} /><MetaItem icon={<MessageCircle size={15} />} label="Questions asked" value={`${decision.askCount ?? 0}`} /></div></section>{decision.status === 'reversed' && decision.replacementTitle && <section className="replacement-card"><div className="eyebrow">Replaced by</div><p>{decision.replacementTitle}</p><Link href={`/decisions/${decision.replacesId}`} className="text-link" data-testid="link-replacement">View decision <ArrowUpRight size={14} /></Link></section>}<section className="side-card"><div className="eyebrow">History</div><div className="history-line"><div className="history-dot" /><div><strong>Decision logged</strong><span>{formatDate(decision.decidedAt)}</span></div></div><div className="history-line"><div className="history-dot history-dot-muted" /><div><strong>Source verified</strong><span>Permission-aware</span></div></div></section></aside></div>
    {showReason && <Modal title="Add the reason" onClose={() => setShowReason(false)}><form onSubmit={submitReason} className="modal-form"><label>What made this the right call?<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Capture the context future-you will need." rows={4} autoFocus data-testid="textarea-reason" /></label><label>Your member ID<input value={authorId} onChange={(event) => setAuthorId(event.target.value)} data-testid="input-reason-author" /></label><div className="modal-actions"><button type="button" className="button button-soft" onClick={() => setShowReason(false)} data-testid="button-cancel-reason">Cancel</button><button className="button button-primary" type="submit" disabled={addReason.isPending || !reason.trim()} data-testid="button-submit-reason">{addReason.isPending ? 'Saving…' : 'Save reason'}</button></div>{addReason.isError && <p className="form-error">Could not save this reason. Try again.</p>}</form></Modal>}{showDelete && <Modal title="Delete this decision?" onClose={() => setShowDelete(false)}><p className="text-sm leading-6 text-muted-foreground">This removes the logged memory from Decision Log. The original Slack conversation will not be changed.</p><div className="modal-actions"><button className="button button-soft" onClick={() => setShowDelete(false)} data-testid="button-cancel-delete">Keep it</button><button className="button button-danger" onClick={remove} disabled={deleteDecision.isPending} data-testid="button-confirm-delete">{deleteDecision.isPending ? 'Deleting…' : 'Delete decision'}</button></div></Modal>}</div>;
}

function ReasonCard({ reason }: { reason: Decision['reasons'][number] }) {
  return <div className={`reason-card ${reason.state === 'superseded' ? 'reason-superseded' : ''}`} data-testid={`reason-${reason.id}`}><div className="reason-quote">“</div><div className="min-w-0 flex-1"><p className="reason-text">{reason.text}</p><div className="reason-meta"><Avatar name={reason.author.name} tone="mint" /><span>{reason.author.name}</span><span className="dot-separator">·</span><span>{formatDate(reason.createdAt)}</span><span className={`repeatability repeatability-${reason.repeatability}`}>{reason.repeatability}</span>{reason.state === 'superseded' && <span className="pill pill-muted">Superseded</span>}</div></div><a href={reason.permalink} target="_blank" rel="noreferrer" className="activity-link" aria-label="Open reason source" data-testid={`link-reason-source-${reason.id}`}><ExternalLink size={15} /></a></div>;
}

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="meta-item"><span className="meta-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">Decision Log</div><h2 className="font-display text-2xl font-semibold">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-modal"><X size={18} /></button></div>{children}</div></div>;
}

function CreateDecisionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const create = useCreateDecision();
  const [form, setForm] = useState({ title: '', text: '', channel: '', channelType: 'public', permalink: '', decidedById: 'current-user', loggedById: 'current-user' });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { ...form, channelType: form.channelType as 'public' | 'private' } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListDecisionsQueryKey() }); client.invalidateQueries({ queryKey: getGetSummaryQueryKey() }); setForm({ title: '', text: '', channel: '', channelType: 'public', permalink: '', decidedById: 'current-user', loggedById: 'current-user' }); onClose(); } }); };
  if (!open) return null;
  return <Modal title="Log a decision" onClose={onClose}><form onSubmit={submit} className="modal-form"><label>Decision title<input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="What did the team decide?" autoFocus required data-testid="input-decision-title" /></label><label>Decision in one line<textarea value={form.text} onChange={(event) => update('text', event.target.value)} placeholder="State the choice and its boundary." rows={3} required data-testid="textarea-decision-text" /></label><div className="form-grid"><label>Slack channel<input value={form.channel} onChange={(event) => update('channel', event.target.value)} placeholder="product-launch" required data-testid="input-decision-channel" /></label><label>Channel access<select value={form.channelType} onChange={(event) => update('channelType', event.target.value)} data-testid="select-decision-channel-type"><option value="public">Public</option><option value="private">Private</option></select></label></div><label>Source permalink<input type="url" value={form.permalink} onChange={(event) => update('permalink', event.target.value)} placeholder="https://your-workspace.slack.com/…" required data-testid="input-decision-permalink" /></label><div className="form-grid"><label>Decided by member ID<input value={form.decidedById} onChange={(event) => update('decidedById', event.target.value)} required data-testid="input-decided-by" /></label><label>Logged by member ID<input value={form.loggedById} onChange={(event) => update('loggedById', event.target.value)} required data-testid="input-logged-by" /></label></div><div className="modal-actions"><button type="button" className="button button-soft" onClick={onClose} data-testid="button-cancel-decision">Cancel</button><button className="button button-primary" type="submit" disabled={create.isPending} data-testid="button-submit-decision">{create.isPending ? 'Logging…' : 'Log decision'}</button></div>{create.isError && <p className="form-error">Could not log this decision. Check the fields and try again.</p>}</form></Modal>;
}

function SettingsPage() {
  return <div className="space-y-8"><PageHeading eyebrow="Workspace settings" title="A memory layer with boundaries." detail="Decision Log stays close to Slack, while making the rules around retention and access visible." /><div className="settings-grid"><section className="panel settings-main"><div className="settings-section"><div className="settings-section-icon settings-icon-coral"><Zap size={18} /></div><div className="flex-1"><div className="eyebrow">Workspace connection</div><h2>Slack connection, ready to wire</h2><p className="settings-copy">This preview uses seeded workspace data so you can explore the capture and retrieval flows before connecting a live Slack workspace.</p><div className="connection-card"><div className="connection-brand">slack</div><div className="min-w-0 flex-1"><strong>Northstar Product demo</strong><span>Live Slack connection not configured</span></div><span className="connected-badge"><Check size={13} /> Demo data</span></div><div className="channel-chips"><ChannelTag channel="product" /><ChannelTag channel="checkout" privateChannel /><span className="channel-more">Seeded channels</span></div></div></div><div className="settings-divider" /><div className="settings-section"><div className="settings-section-icon settings-icon-mint"><Clock3 size={18} /></div><div><div className="eyebrow">Retention policy</div><h2>Keep the memory, respect the source</h2><p className="settings-copy">Logged decisions remain available even when a source message is edited or deleted. Source links always resolve through the viewer’s Slack permissions.</p><div className="policy-row"><div><strong>Decision records</strong><span>Retained while this workspace is active</span></div><span className="policy-value">Workspace lifetime</span></div><div className="policy-row"><div><strong>Source links</strong><span>Access checked at open time</span></div><span className="policy-value policy-green">Permission-aware</span></div></div></div><div className="settings-divider" /><div className="settings-section"><div className="settings-section-icon settings-icon-sun"><LockKeyhole size={18} /></div><div><div className="eyebrow">Privacy & access</div><h2>Safe by default</h2><p className="settings-copy">Private-channel decisions stay private. Asking “why” only returns context the asker is allowed to see.</p><button className="button button-soft" onClick={() => window.alert('Access policy is managed by your Slack connection.')} data-testid="button-review-access"><ShieldCheck size={16} /> Review access policy</button></div></div></section><aside className="settings-aside"><div className="aside-quote"><div className="quote-mark">“</div><p>The best team memory feels less like a database and more like a thoughtful teammate.</p><span>Decision Log principle</span></div><div className="side-card"><div className="eyebrow">Need to connect?</div><p className="text-sm leading-6 text-muted-foreground">Connect Slack when you are ready to replace the seeded workspace with live decision capture.</p><button className="button button-ghost mt-4" onClick={() => window.alert('The preview is currently using seeded demo data.')} data-testid="button-test-connection">Check demo status <ArrowUpRight size={14} /></button></div></aside></div></div>;
}

function CreateDecisionController() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const handler = () => setOpen(true); document.addEventListener('open-create-decision', handler); return () => document.removeEventListener('open-create-decision', handler); }, []);
  return <CreateDecisionModal open={open} onClose={() => setOpen(false)} />;
}

function Router() {
  return <AppShell><CreateDecisionController /><ErrorBoundary><Switch><Route path="/" component={Overview} /><Route path="/decisions" component={DecisionsPage} /><Route path="/decisions/:id" component={DetailPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></ErrorBoundary></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;