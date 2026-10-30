import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  History, Radio, Search, Filter, Calendar, CheckCircle, Phone, Truck,
  Shield, AlertTriangle, AlertCircle, ArrowLeft, RefreshCw, ChevronLeft,
  ChevronRight, Eye, Clock, User, X, Info, ExternalLink, Activity, FileText,
  UserCheck, LogOut
} from 'lucide-react';
import SVIBadge from '@/components/SVIBadge';

export default function OfficerHistory() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Data & loading states
  const [data, setData] = useState({
    stats: {
      total_cases_handled: 0,
      acknowledgments_count: 0,
      contacts_count: 0,
      dispatches_count: 0,
      resolved_count: 0,
      live_cases_count: 0,
      test_cases_count: 0,
    },
    cases: [],
    total: 0,
    page: 1,
    limit: 10,
    total_pages: 1,
    data_filter: 'live',
  });
  const [loading, setLoading] = useState(true);

  // Filters state
  const [dataFilter, setDataFilter] = useState('live'); // 'live' | 'all' | 'test'
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [actionTypeFilter, setActionTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Timeline / Case detail modal state
  const [selectedCase, setSelectedCase] = useState(null);
  const [timelineLogs, setTimelineLogs] = useState([]);
  const [caseDetail, setCaseDetail] = useState(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('data_filter', dataFilter);
      params.set('page', page.toString());
      params.set('limit', '10');

      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter && priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (actionTypeFilter && actionTypeFilter !== 'all') params.set('action_type', actionTypeFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await api.get(`/officer/history?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load officer history:', err);
      toast.error('Failed to load case history records');
    } finally {
      setLoading(false);
    }
  }, [dataFilter, statusFilter, priorityFilter, actionTypeFilter, searchQuery, dateFrom, dateTo, page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleOpenTimeline = async (caseItem) => {
    setSelectedCase(caseItem);
    setLoadingTimeline(true);
    setTimelineLogs([]);
    setCaseDetail(null);

    try {
      const [logsRes, detailRes] = await Promise.allSettled([
        api.get(`/cases/${caseItem.id}/logs`),
        api.get(`/cases/${caseItem.id}`)
      ]);

      if (logsRes.status === 'fulfilled') {
        setTimelineLogs(logsRes.value.data.logs || []);
      }
      if (detailRes.status === 'fulfilled') {
        setCaseDetail(detailRes.value.data);
      }
    } catch (err) {
      console.warn('Error loading timeline details:', err);
      toast.error('Could not load complete event timeline');
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setActionTypeFilter('all');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const formatDateTime = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white uppercase">Officer Case & Action History</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 font-mono font-semibold">
                  Audit Verified
                </span>
              </div>
              <div className="text-xs text-neutral-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Duty Officer: <strong>{user?.name || user?.email}</strong></span>
                <span className="text-neutral-600">|</span>
                <span className="text-neutral-400">Authenticated Records</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Response Center Link */}
            <Link
              to="/officer"
              data-testid="officer-nav-live"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:text-white transition shadow-sm"
              title="Return to the Live Map and Real-Time Dispatch Console"
            >
              <Radio className="w-4 h-4 text-emerald-400" /> Live Response Center
            </Link>

            {/* Refresh */}
            <button
              onClick={loadHistory}
              disabled={loading}
              data-testid="refresh-history-btn"
              className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition disabled:opacity-50"
              title="Refresh history records from server"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              data-testid="officer-history-logout"
              className="p-2 rounded-lg bg-neutral-900 hover:bg-red-950/40 border border-neutral-800 hover:border-red-900/60 text-neutral-400 hover:text-red-300 transition"
              title="Sign out of officer session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Data Provenance & Operational Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 p-3 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400 font-semibold flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-400" /> Data Source View:
            </span>
            <div className="inline-flex rounded-lg bg-neutral-950 p-1 border border-neutral-800">
              <button
                onClick={() => { setDataFilter('live'); setPage(1); }}
                data-testid="filter-prov-live"
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  dataFilter === 'live'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Live Operational ({data.stats.live_cases_count})
              </button>
              <button
                onClick={() => { setDataFilter('all'); setPage(1); }}
                data-testid="filter-prov-all"
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  dataFilter === 'all'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                All Records ({data.stats.live_cases_count + data.stats.test_cases_count})
              </button>
              <button
                onClick={() => { setDataFilter('test'); setPage(1); }}
                data-testid="filter-prov-test"
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  dataFilter === 'test'
                    ? 'bg-purple-900 text-purple-200 border border-purple-700 shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Automated Test ({data.stats.test_cases_count})
              </button>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400 flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-neutral-500" />
            <span>
              {dataFilter === 'live'
                ? 'Showing genuine operational incidents handled by you. Test suite records excluded.'
                : dataFilter === 'test'
                ? 'Showing automated test suite verification runs preserved for audit consistency.'
                : 'Showing complete combined record log for compliance audit.'}
            </span>
          </div>
        </div>

        {/* Section A: Overview Cards */}
        <section aria-labelledby="overview-heading" className="space-y-2">
          <h2 id="overview-heading" className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" /> Authorized Officer Activity Metrics
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="officer-history-overview-cards">
            {/* 1. Cases Handled */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="font-semibold uppercase tracking-wider">Cases Handled</span>
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white font-mono" data-testid="stat-cases-handled">
                  {data.stats.total_cases_handled}
                </span>
                <span className="text-[11px] text-neutral-400">cases</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-400 leading-tight">
                Assigned to or acted upon by you
              </p>
            </div>

            {/* 2. Emergency Acknowledgments */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="font-semibold uppercase tracking-wider">Acknowledgments</span>
                <CheckCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-amber-400 font-mono" data-testid="stat-acknowledgments">
                  {data.stats.acknowledgments_count}
                </span>
                <span className="text-[11px] text-neutral-400">confirmed</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-400 leading-tight">
                Emergency SOS alerts acknowledged
              </p>
            </div>

            {/* 3. Contact Attempts */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="font-semibold uppercase tracking-wider">Contact Attempts</span>
                <Phone className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-emerald-400 font-mono" data-testid="stat-contacts">
                  {data.stats.contacts_count}
                </span>
                <span className="text-[11px] text-neutral-400">attempts</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-400 leading-tight">
                Victim telephone calls logged
              </p>
            </div>

            {/* 4. Internal Dispatches */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between text-neutral-400 text-xs">
                <span className="font-semibold uppercase tracking-wider">Internal Dispatches</span>
                <Truck className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-blue-400 font-mono" data-testid="stat-dispatches">
                  {data.stats.dispatches_count}
                </span>
                <span className="text-[11px] text-neutral-400">units</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-400 leading-tight">
                NIVARA duty patrol units deployed
              </p>
            </div>
          </div>
        </section>

        {/* Section D: Search and Filter Controls */}
        <section aria-labelledby="filter-heading" className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="filter-heading" className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-blue-400" /> Search & Filter History
            </h2>
            <button
              onClick={handleClearFilters}
              data-testid="clear-filters-btn"
              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2 relative">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Search Records</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  data-testid="history-search-input"
                  placeholder="Case ID, title, or victim..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                data-testid="history-status-filter"
                className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white outline-none focus:border-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="assigned">Assigned</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
                data-testid="history-priority-filter"
                className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white outline-none focus:border-blue-500"
              >
                <option value="all">All Priorities</option>
                <option value="emergency">🚨 Emergency</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Action Type Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Action Performed</label>
              <select
                value={actionTypeFilter}
                onChange={(e) => { setActionTypeFilter(e.target.value); setPage(1); }}
                data-testid="history-action-filter"
                className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white outline-none focus:border-blue-500"
              >
                <option value="all">All Actions</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="contacted_victim">Contacted Victim</option>
                <option value="dispatched_unit">Dispatched Unit</option>
                <option value="assigned_to_counsellor">Assigned Counsellor</option>
                <option value="closed_case">Marked Resolved</option>
              </select>
            </div>

            {/* Date Range: From */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                data-testid="history-date-from"
                className="w-full px-2 py-1 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Section B: Case History Table */}
        <section aria-labelledby="history-table-heading" className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="history-table-heading" className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" /> Case Records Handled by Officer
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Showing {data.cases.length} of {data.total} matching case records
              </p>
            </div>

            {/* Page Count */}
            <div className="text-xs text-neutral-400 font-mono">
              Page {data.page} of {data.total_pages}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="officer-history-table">
              <thead className="bg-neutral-950 text-neutral-400 uppercase text-[10px] font-bold tracking-wider border-b border-neutral-800">
                <tr>
                  <th scope="col" className="px-4 py-3">Case ID</th>
                  <th scope="col" className="px-4 py-3">Victim</th>
                  <th scope="col" className="px-4 py-3">Title / Category</th>
                  <th scope="col" className="px-4 py-3">Risk & Priority</th>
                  <th scope="col" className="px-4 py-3">Officer Involvement</th>
                  <th scope="col" className="px-4 py-3">Created</th>
                  <th scope="col" className="px-4 py-3">Last Action</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-neutral-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                      <span>Loading historical case records...</span>
                    </td>
                  </tr>
                ) : data.cases.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-neutral-400 space-y-2">
                      <History className="w-8 h-8 mx-auto text-neutral-600 mb-1" />
                      <div className="font-semibold text-neutral-300">No Historical Cases Found</div>
                      <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                        {dataFilter === 'live'
                          ? 'No live operational cases match your current filter criteria. You can switch to "All Records" or clear active filters.'
                          : 'No case records were found matching the specified parameters.'}
                      </p>
                      <button
                        onClick={handleClearFilters}
                        className="mt-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold"
                      >
                        Reset All Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  data.cases.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-neutral-850/60 transition group cursor-pointer"
                      onClick={() => handleOpenTimeline(c)}
                    >
                      {/* Case ID */}
                      <td className="px-4 py-3 font-mono font-medium text-blue-400">
                        <span title={c.id}>#{c.id.slice(0, 8)}</span>
                        {c.is_demo_or_test && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800" title="Automated Test Record">
                            test
                          </span>
                        )}
                      </td>

                      {/* Victim */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{c.victim_name || 'Victim'}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">ID: {c.victim_id.slice(0, 8)}</div>
                      </td>

                      {/* Category & Title */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="font-medium text-neutral-200 truncate" title={c.title}>{c.title}</div>
                        <div className="text-[10px] text-neutral-400">{c.category}</div>
                      </td>

                      {/* Priority / SVI */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {c.priority === 'emergency' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Emergency
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-800 text-neutral-300">
                              {c.priority}
                            </span>
                          )}
                          <SVIBadge score={c.svi_score} level={c.risk_level} />
                        </div>
                      </td>

                      {/* Officer Involvements */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.involvements && c.involvements.length > 0 ? (
                            c.involvements.map((inv, idx) => (
                              <span
                                key={idx}
                                className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                  inv === 'Acknowledged'
                                    ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                                    : inv === 'Contacted'
                                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                                    : inv === 'Dispatched'
                                    ? 'bg-blue-950/70 text-blue-300 border border-blue-800/60'
                                    : inv === 'Assigned Officer'
                                    ? 'bg-purple-950/70 text-purple-300 border border-purple-800/60'
                                    : 'bg-neutral-800 text-neutral-300'
                                }`}
                              >
                                {inv}
                              </span>
                            ))
                          ) : (
                            <span className="text-neutral-500 text-[10px]">Handled</span>
                          )}
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="px-4 py-3 text-neutral-400 text-[11px] whitespace-nowrap">
                        {formatDateTime(c.created_at)}
                      </td>

                      {/* Last Action Date */}
                      <td className="px-4 py-3 text-neutral-300 text-[11px] font-medium whitespace-nowrap">
                        {formatDateTime(c.last_action_at)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            c.status === 'resolved'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : c.status === 'in_progress'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : c.status === 'assigned'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* View Action */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleOpenTimeline(c); }}
                          data-testid={`view-timeline-${c.id}`}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700 transition flex items-center gap-1.5 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-400" /> View Timeline
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-neutral-400">
              Showing page <span className="font-bold text-white">{data.page}</span> of <span className="font-bold text-white">{data.total_pages}</span> ({data.total} total cases)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1 || loading}
                data-testid="pagination-prev-btn"
                className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-300 flex items-center gap-1 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={data.page >= data.total_pages || loading}
                data-testid="pagination-next-btn"
                className="px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-300 flex items-center gap-1 transition"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Section C: Case Activity Timeline Drawer / Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-neutral-900 border-l border-neutral-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between bg-neutral-950">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400">Case #{selectedCase.id.slice(0, 8)}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      selectedCase.status === 'resolved'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : selectedCase.status === 'in_progress'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {selectedCase.status.replace('_', ' ')}
                  </span>
                  {selectedCase.priority === 'emergency' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> Emergency
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white">{selectedCase.title}</h3>
                <p className="text-xs text-neutral-400">
                  Victim: <strong className="text-neutral-200">{selectedCase.victim_name || 'Victim'}</strong> (ID: {selectedCase.victim_id.slice(0, 8)})
                </p>
              </div>

              <button
                onClick={() => setSelectedCase(null)}
                data-testid="close-timeline-modal"
                className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                title="Close timeline"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Case Quick Metadata Bar */}
            <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-900/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Risk Assessment</span>
                  <SVIBadge score={selectedCase.svi_score} level={selectedCase.risk_level} />
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Created Date</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{formatDateTime(selectedCase.created_at)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Last Action</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{formatDateTime(selectedCase.last_action_at)}</span>
                </div>
              </div>

              {/* Jump to Live Response Center if active */}
              {selectedCase.status !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => navigate(`/officer?caseId=${selectedCase.id}`)}
                  data-testid="jump-to-live-center-btn"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow"
                  title="Open this case in the Live Response Center map and dispatch console"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in Live Center
                </button>
              )}
            </div>

            {/* Activity Timeline List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" /> Chronological Event Timeline ({timelineLogs.length})
                </h4>
                <span className="text-[10px] text-neutral-500 font-mono">Newest events first</span>
              </div>

              {loadingTimeline ? (
                <div className="py-12 text-center text-neutral-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                  <span className="text-xs">Loading tamper-evident activity logs...</span>
                </div>
              ) : timelineLogs.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 space-y-2">
                  <Activity className="w-6 h-6 mx-auto text-neutral-600" />
                  <div className="text-xs font-semibold text-neutral-400">No activity logs recorded yet</div>
                  <p className="text-[11px] text-neutral-500 max-w-xs mx-auto">
                    Actions performed on this case will appear here in chronological order with immutable server timestamps.
                  </p>
                </div>
              ) : (
                <ol className="relative border-l border-neutral-800 ml-3 space-y-4">
                  {timelineLogs.map((entry, idx) => {
                    const isDispatch = entry.action === 'dispatched_unit' || entry.action === 'officer_internal_dispatch_recorded';
                    const isContact = entry.action === 'contacted_victim' || entry.action === 'victim_contact_recorded';
                    const isAck = entry.action === 'acknowledged' || entry.action === 'officer_emergency_acknowledged';
                    const isAssign = entry.action === 'assigned_to_counsellor' || entry.action === 'counsellor_assigned';
                    const isResolved = entry.action === 'closed_case' || entry.action === 'case_resolved';

                    return (
                      <li key={entry.id || idx} className="ml-5 relative group" data-testid={`timeline-event-${idx}`}>
                        {/* Timeline Bullet Icon */}
                        <span
                          className={`absolute -left-[27px] top-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ring-4 ring-neutral-900 ${
                            isDispatch
                              ? 'bg-blue-600 text-white'
                              : isContact
                              ? 'bg-emerald-600 text-white'
                              : isAck
                              ? 'bg-amber-600 text-white'
                              : isAssign
                              ? 'bg-purple-600 text-white'
                              : isResolved
                              ? 'bg-green-600 text-white'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {isDispatch ? '🚚' : isContact ? '📞' : isAck ? '✓' : isAssign ? '👤' : '•'}
                        </span>

                        <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white capitalize">
                              {entry.action.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              {formatDateTime(entry.created_at)}
                            </span>
                          </div>

                          <div className="text-[11px] text-neutral-300 leading-relaxed">
                            {entry.details || (entry.meta && JSON.stringify(entry.meta)) || 'Action recorded'}
                          </div>

                          {/* Specific distinction for Internal Dispatch */}
                          {isDispatch && (
                            <div className="mt-1 p-2 bg-blue-950/30 border border-blue-800/40 rounded text-[10px] text-blue-300 flex items-center gap-1.5">
                              <Info className="w-3 h-3 text-blue-400 shrink-0" />
                              <span>Internal NIVARA Duty Patrol Dispatch. Note: 112 police emergency call is not automated.</span>
                            </div>
                          )}

                          {/* Actor Info */}
                          <div className="flex items-center gap-2 pt-1 border-t border-neutral-900 text-[10px] text-neutral-500">
                            <span className="flex items-center gap-1">
                              <User className="w-2.5 h-2.5" /> Actor: <span className="text-neutral-400">{entry.actor_name || 'System'}</span>
                            </span>
                            <span className="text-neutral-700">•</span>
                            <span className="uppercase text-[9px] font-semibold text-neutral-500">{entry.actor_role || 'audit'}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between">
              <span className="text-[10px] text-neutral-500">
                NIVARA Tamper-Evident Incident History Record
              </span>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
