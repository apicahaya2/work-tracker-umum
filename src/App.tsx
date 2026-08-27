import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Copy, 
  Check, 
  RefreshCw, 
  FolderGit2, 
  Plus, 
  Coffee, 
  Briefcase, 
  Layers, 
  Sparkles, 
  ArrowUpDown,
  Trash2,
  Edit,
  BarChart2,
  PieChart as PieChartIcon,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Globe,
  Key,
  User,
  Search
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { Onboarding } from './Onboarding';
import { supabase } from './supabase';

interface Repository {
  name: string;
  path: string;
  lastCommitDate?: string;
}

interface GitActivity {
  repo: string;
  hash: string;
  author: string;
  date: string;
  timestamp?: number;
  activeDurationHours?: number;
  workStartTime?: string;
  workEndTime?: string;
  subject: string;
  branch?: string;
  jiraKey?: string;
}

interface Meeting {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  durationHours: number;
  timeRange?: string;
  date: string; // YYYY-MM-DD
}

interface ManualTask {
  id: string;
  repo: string;
  title: string;
  durationHours: number;
  date: string; // YYYY-MM-DD
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrl?: string;
}

interface JiraSubtask {
  id: string;
  key: string;
  summary: string;
  status: string;
  statusCategory?: string;
  issueType: string;
  issueTypeIcon?: string;
}

interface JiraDevPhases {
  fase1Start?: string;
  fase1End?: string;
  fase1Hours: number;
  isFase1Ongoing?: boolean;
  reviewStart?: string;
  reviewEnd?: string;
  reviewHours: number;
  isReviewOngoing?: boolean;
  fase2Start?: string;
  fase2End?: string;
  fase2Hours: number;
  isFase2Ongoing?: boolean;
  qaStart?: string;
  qaEnd?: string;
  qaHours: number;
  isQaOngoing?: boolean;
  totalDevHours: number;
  totalLeadHours: number;
  currentPhase?: string;
  timeline: { from: string; to: string; date: string }[];
}

interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  statusCategory?: string;
  priority: string;
  issueType: string;
  issueTypeIcon?: string;
  updated: string;
  created?: string;
  projectName?: string;
  projectKey?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  reporterName?: string;
  subtasks?: JiraSubtask[];
  parentKey?: string;
  parentSummary?: string;
  devPhases?: JiraDevPhases;
  url: string;
  timeSpentHours?: number;
  estimatedHours?: number;
}

export function App() {
  // Filters state
  const [filterType, setFilterType] = useState<'daily' | 'range' | 'weekly' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Settings state (Persisted in localStorage)
  const [workHoursPerDay] = useState<number>(() => {
    const saved = localStorage.getItem('wt_workHours');
    return saved ? parseFloat(saved) : 8;
  });
  
  // Data state (Persisted in localStorage)
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>(() => {
    const saved = localStorage.getItem('wt_selectedRepos');
    return saved ? JSON.parse(saved) : [];
  });
  const [gitActivities, setGitActivities] = useState<GitActivity[]>([]);
  // Custom manually added meetings (Persisted in localStorage)
  const [customMeetings, setCustomMeetings] = useState<Meeting[]>(() => {
    const saved = localStorage.getItem('wt_customMeetings');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('wt_customMeetings', JSON.stringify(customMeetings));
  }, [customMeetings]);

  const [calendarMeetings, setCalendarMeetings] = useState<Meeting[]>([]);

  // Combined meetings derived state
  const meetings = [...calendarMeetings, ...customMeetings];

  const [manualTasks, setManualTasks] = useState<ManualTask[]>(() => {
    const saved = localStorage.getItem('wt_manualTasks');
    return saved ? JSON.parse(saved) : [];
  });

  // Ignored/Deleted git commit hashes state & deleted meeting IDs
  const [deletedGitHashes, setDeletedGitHashes] = useState<string[]>(() => {
    const saved = localStorage.getItem('wt_deletedGitHashes');
    return saved ? JSON.parse(saved) : [];
  });

  const [deletedMeetingIds, setDeletedMeetingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('wt_deletedMeetingIds');
    return saved ? JSON.parse(saved) : [];
  });

  // Format duration cleanly without losing 0.25 precision
  const formatDuration = (hours: number): string => {
    const rounded = Math.round(hours * 100) / 100;
    return String(rounded);
  };

  useEffect(() => {
    localStorage.setItem('wt_deletedGitHashes', JSON.stringify(deletedGitHashes));
  }, [deletedGitHashes]);

  useEffect(() => {
    localStorage.setItem('wt_deletedMeetingIds', JSON.stringify(deletedMeetingIds));
  }, [deletedMeetingIds]);

  const handleDeleteMeeting = (id: string) => {
    setDeletedMeetingIds(prev => [...prev, id]);
    setCustomMeetings(prev => prev.filter(m => m.id !== id));
    setCalendarMeetings(prev => prev.filter(m => m.id !== id));
  };

  const handleDeleteManualTask = (id: string) => {
    setManualTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleDeleteGitTask = (hash: string) => {
    setDeletedGitHashes(prev => [...prev, hash]);
  };

  useEffect(() => {
    localStorage.setItem('wt_manualTasks', JSON.stringify(manualTasks));
  }, [manualTasks]);

  useEffect(() => {
    localStorage.setItem('wt_workHours', workHoursPerDay.toString());
  }, [workHoursPerDay]);

  useEffect(() => {
    if (selectedRepos.length > 0) {
      localStorage.setItem('wt_selectedRepos', JSON.stringify(selectedRepos));
    }
  }, [selectedRepos]);
  
  const [icalUrl, setIcalUrl] = useState<string>(() => {
    return localStorage.getItem('wt_icalUrl') || '';
  });

  useEffect(() => {
    localStorage.setItem('wt_icalUrl', icalUrl);
  }, [icalUrl]);

  // Custom overrides for Git tasks & Meetings (e.g. edit title or duration)
  const [itemOverrides, setItemOverrides] = useState<{ [id: string]: { title?: string; durationHours?: number; timeRange?: string } }>(() => {
    const saved = localStorage.getItem('wt_itemOverrides');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('wt_itemOverrides', JSON.stringify(itemOverrides));
  }, [itemOverrides]);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<{
    id: string;
    type: 'git' | 'manual' | 'meeting';
    title: string;
    durationHours: number;
    timeRange?: string;
  } | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTimeError, setEditTimeError] = useState('');

  // Helper to parse time string HH:mm to minutes from midnight
  const parseTimeToMinutes = (timeStr: string): number | null => {
    if (!timeStr || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  // Calculate duration in hours rounded to nearest 0.25h increment
  const calculateDurationFromTimes = (start: string, end: string): number | null => {
    const startMins = parseTimeToMinutes(start);
    const endMins = parseTimeToMinutes(end);
    if (startMins === null || endMins === null) return null;
    let diff = endMins - startMins;
    if (diff < 0) diff += 24 * 60; // Overnight span
    const exactHours = diff / 60;
    // Round to nearest 0.25 step, minimum 0.25h
    return Math.max(0.25, Math.round(exactHours * 4) / 4);
  };

  const openEditModal = (id: string, type: 'git' | 'manual' | 'meeting', title: string, durationHours: number, timeRange?: string) => {
    const current = itemOverrides[id] || {};
    const finalTitle = current.title ?? title;
    const finalTimeRange = current.timeRange ?? timeRange ?? '';
    const finalDuration = current.durationHours ?? durationHours;

    setEditingItem({ id, type, title: finalTitle, durationHours: finalDuration, timeRange: finalTimeRange });
    setEditTitle(finalTitle);
    setEditTimeError('');

    // Parse existing time range e.g. "09:00→11:30" or "09:00"
    if (finalTimeRange) {
      const parts = finalTimeRange.split(/[→\-]/).map(s => s.trim());
      setEditStartTime(parts[0] || '09:00');
      setEditEndTime(parts[1] || parts[0] || '10:00');
    } else {
      setEditStartTime('09:00');
      setEditEndTime('10:00');
    }
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;

    if (!editStartTime || !editEndTime) {
      setEditTimeError('Jam mulai dan jam selesai harus diisi');
      return;
    }

    const calculatedDur = calculateDurationFromTimes(editStartTime, editEndTime);
    if (calculatedDur === null) {
      setEditTimeError('Format jam tidak valid (Gunakan format HH:mm)');
      return;
    }

    const formattedTimeRange = `${editStartTime}→${editEndTime}`;

    if (editingItem.type === 'manual') {
      setManualTasks(prev => prev.map(t => t.id === editingItem.id ? { ...t, title: editTitle, durationHours: calculatedDur } : t));
    } else if (editingItem.type === 'meeting') {
      const isCustom = customMeetings.some(m => m.id === editingItem.id);
      if (isCustom) {
        setCustomMeetings(prev => prev.map(m => m.id === editingItem.id ? { ...m, title: editTitle, durationHours: calculatedDur, timeRange: formattedTimeRange } : m));
      } else {
        setItemOverrides(prev => ({
          ...prev,
          [editingItem.id]: { title: editTitle, durationHours: calculatedDur, timeRange: formattedTimeRange }
        }));
      }
    } else {
      // git task
      setItemOverrides(prev => ({
        ...prev,
        [editingItem.id]: { title: editTitle, durationHours: calculatedDur, timeRange: formattedTimeRange }
      }));
    }
    setEditingItem(null);
  };

  // UI state
  const [, setLoadingRepos] = useState<boolean>(false);
  const [loadingGit, setLoadingGit] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedCycleTime, setCopiedCycleTime] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tracker' | 'jira_cycle' | 'analytics'>('tracker');
  
  // Modal / Add state
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDuration, setNewMeetingDuration] = useState('0.5');
  const [newMeetingDate, setNewMeetingDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskRepo, setNewTaskRepo] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState('1');
  const [newTaskDate, setNewTaskDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Fetch repositories from Supabase
  const fetchRepositories = async () => {
    setLoadingRepos(true);
    try {
      const { data, error } = await supabase
        .from('git_activities')
        .select('repo');
      
      if (!error && data) {
        // Get unique repository names
        const uniqueRepos = Array.from(new Set(data.map((item: any) => item.repo)))
          .map(name => ({ name: name, path: '' }))
          .sort((a, b) => a.name.localeCompare(b.name));
          
        setRepos(uniqueRepos);
        
        if (uniqueRepos.length > 0) {
          const saved = localStorage.getItem('wt_selectedRepos');
          if (!saved) {
            setSelectedRepos(uniqueRepos.map((r: any) => r.name));
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch repos from Supabase', e);
    } finally {
      setLoadingRepos(false);
    }
  };

  // Fetch Git commit logs
  const fetchGitActivity = async () => {
    setLoadingGit(true);
    try {
      let reqStart = selectedDate;
      let reqEnd = selectedDate;

      if (filterType === 'range') {
        reqStart = startDate;
        reqEnd = endDate;
      } else if (filterType === 'weekly') {
        const curr = new Date(selectedDate);
        reqStart = format(startOfWeek(curr, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        reqEnd = format(endOfWeek(curr, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      } else if (filterType === 'monthly') {
        const curr = new Date(selectedDate);
        reqStart = format(startOfMonth(curr), 'yyyy-MM-dd');
        reqEnd = format(endOfMonth(curr), 'yyyy-MM-dd');
      }

      // Fetch from Supabase
      const { data, error } = await supabase
        .from('git_activities')
        .select('*')
        .gte('date', reqStart)
        .lte('date', reqEnd + 'T23:59:59');

      if (!error && data) {
        setGitActivities(data);
      } else {
        console.error('Supabase error:', error);
      }
    } catch (e) {
      console.warn('Could not fetch git activities from backend');
    } finally {
      setLoadingGit(false);
    }
  };

  // Fetch Calendar Events from Sync
  const fetchCalendarEvents = async () => {
    try {
      let reqStart = selectedDate;
      let reqEnd = selectedDate;

      if (filterType === 'range') {
        reqStart = startDate;
        reqEnd = endDate;
      } else if (filterType === 'weekly') {
        const curr = new Date(selectedDate);
        reqStart = format(startOfWeek(curr, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        reqEnd = format(endOfWeek(curr, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      } else if (filterType === 'monthly') {
        const curr = new Date(selectedDate);
        reqStart = format(startOfMonth(curr), 'yyyy-MM-dd');
        reqEnd = format(endOfMonth(curr), 'yyyy-MM-dd');
      }

      const res = await fetch(`/api/calendar-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, startDate: reqStart, endDate: reqEnd, icalUrl })
      });
      if (res.ok) {
        const data = await res.json();
        setCalendarMeetings(data.events || []);
      }
    } catch (e) {
      console.warn('Calendar sync error');
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, []);

  // Onboarding state
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean>(() => {
    return localStorage.getItem('wt_onboardingComplete') === 'true';
  });
  const [hasDailyMeeting, setHasDailyMeeting] = useState<boolean>(() => {
    return localStorage.getItem('wt_hasDailyMeeting') === 'true';
  });
  const [dailyMeetingTitle, setDailyMeetingTitle] = useState<string>(() => {
    return localStorage.getItem('wt_dailyMeetingTitle') || 'Daily Standup';
  });
  const [dailyMeetingTime, setDailyMeetingTime] = useState<string>(() => {
    return localStorage.getItem('wt_dailyMeetingTime') || '09:30';
  });
  const [dailyMeetingDuration, setDailyMeetingDuration] = useState<number>(() => {
    const saved = localStorage.getItem('wt_dailyMeetingDuration');
    return saved ? parseFloat(saved) : 0.5;
  });

  const handleOnboardingComplete = (data: any) => {
    setIcalUrl(data.icalUrl);
    setJiraHost(data.jiraHost);
    setJiraEmail(data.jiraEmail);
    setJiraToken(data.jiraToken);
    setHasDailyMeeting(data.hasDailyMeeting);
    
    if (data.hasDailyMeeting) {
      setDailyMeetingTitle(data.dailyMeetingTitle);
      setDailyMeetingTime(data.dailyMeetingTime);
      setDailyMeetingDuration(data.dailyMeetingDuration);
      localStorage.setItem('wt_dailyMeetingTitle', data.dailyMeetingTitle);
      localStorage.setItem('wt_dailyMeetingTime', data.dailyMeetingTime);
      localStorage.setItem('wt_dailyMeetingDuration', data.dailyMeetingDuration.toString());
    }
    
    localStorage.setItem('wt_icalUrl', data.icalUrl);
    localStorage.setItem('wt_jiraHost', data.jiraHost);
    localStorage.setItem('wt_jiraEmail', data.jiraEmail);
    localStorage.setItem('wt_jiraToken', data.jiraToken);
    localStorage.setItem('wt_hasDailyMeeting', data.hasDailyMeeting.toString());
    localStorage.setItem('wt_onboardingComplete', 'true');
    setIsOnboardingComplete(true);
  };

  // Jira Integration state
  const [jiraHost, setJiraHost] = useState<string>(() => localStorage.getItem('wt_jiraHost') || '');
  const [jiraEmail, setJiraEmail] = useState<string>(() => localStorage.getItem('wt_jiraEmail') || '');
  const [jiraToken, setJiraToken] = useState<string>(() => localStorage.getItem('wt_jiraToken') || '');
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [selectedJiraProject, setSelectedJiraProject] = useState<string>(() => {
    return localStorage.getItem('wt_selectedJiraProject') || '';
  });

  useEffect(() => {
    localStorage.setItem('wt_selectedJiraProject', selectedJiraProject);
  }, [selectedJiraProject]);

  const [loadingJira, setLoadingJira] = useState<boolean>(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  const [jiraUser, setJiraUser] = useState<{ displayName: string; emailAddress: string; avatarUrl?: string } | null>(() => {
    const saved = localStorage.getItem('wt_jiraUser');
    return saved ? JSON.parse(saved) : null;
  });
  const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message: string; user?: any } | null>(null);
  const [showJiraModal, setShowJiraModal] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('wt_jiraHost', jiraHost);
  }, [jiraHost]);

  useEffect(() => {
    localStorage.setItem('wt_jiraEmail', jiraEmail);
  }, [jiraEmail]);

  useEffect(() => {
    localStorage.setItem('wt_jiraToken', jiraToken);
  }, [jiraToken]);

  const safeParseResponse = async (res: Response, endpointName: string) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Backend (${endpointName}) mengembalikan respon bukan JSON (Status ${res.status}). Pastikan konfigurasi API Cloud Anda benar.`);
    }
  };

  const fetchJiraProjects = async () => {
    if (!jiraHost || !jiraToken) return;
    try {
      const res = await fetch(`/api/jira-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jiraHost, jiraEmail, jiraToken })
      });
      if (res.ok) {
        const data = await safeParseResponse(res, '/api/jira-projects');
        const projList: JiraProject[] = data.projects || [];
        setJiraProjects(projList);

        // Find BakmiGM project in the list
        const bakmiProj = projList.find(p => 
          p.key.toLowerCase().includes('bakmi') || 
          p.name.toLowerCase().includes('bakmi') || 
          p.key.toLowerCase() === 'bgm' ||
          p.key.toLowerCase() === 'bgmm'
        );

        const savedProj = localStorage.getItem('wt_selectedJiraProject');
        if (bakmiProj && (!savedProj || savedProj === 'ALL' || savedProj === 'BAKMIGM')) {
          setSelectedJiraProject(bakmiProj.key);
          fetchJiraIssues(jiraScope, jiraSearchQuery, bakmiProj.key);
        }
      }
    } catch (e) {
      console.warn('Could not fetch jira projects:', e);
    }
  };

  const testJiraConnection = async () => {
    setJiraTestResult(null);
    try {
      const res = await fetch(`/api/jira-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jiraHost, jiraEmail, jiraToken })
      });
      const data = await safeParseResponse(res, '/api/jira-test');
      if (data.success) {
        setJiraTestResult({ success: true, message: `Koneksi berhasil! Login sebagai ${data.user.displayName}`, user: data.user });
        setJiraUser(data.user);
        localStorage.setItem('wt_jiraUser', JSON.stringify(data.user));
        fetchJiraProjects();
        fetchJiraIssues();
      } else {
        setJiraTestResult({ success: false, message: data.error || 'Koneksi gagal' });
      }
    } catch (e: any) {
      setJiraTestResult({ success: false, message: e.message || 'Gagal menghubungi server backend' });
    }
  };

  const [jiraScope, setJiraScope] = useState<'active_sprint' | 'my' | 'assigned' | 'reported' | 'active' | 'all_project'>('active_sprint');
  const [jiraSearchQuery, setJiraSearchQuery] = useState<string>('');
  const [onlyActiveSprint, setOnlyActiveSprint] = useState<boolean>(() => {
    const saved = localStorage.getItem('wt_jiraOnlyActiveSprint');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [expandedIssueKeys, setExpandedIssueKeys] = useState<string[]>([]);
  const toggleExpandIssue = (key: string) => {
    setExpandedIssueKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  useEffect(() => {
    localStorage.setItem('wt_jiraOnlyActiveSprint', JSON.stringify(onlyActiveSprint));
  }, [onlyActiveSprint]);

  const fetchJiraIssues = async (
    overrideScope?: typeof jiraScope, 
    overrideQuery?: string, 
    overrideProject?: string,
    overrideSprint?: boolean
  ) => {
    if (!jiraHost || !jiraToken) return;
    setLoadingJira(true);
    setJiraError(null);
    const scopeToUse = overrideScope !== undefined ? overrideScope : jiraScope;
    const queryToUse = overrideQuery !== undefined ? overrideQuery : jiraSearchQuery;
    const projectToUse = overrideProject !== undefined ? overrideProject : selectedJiraProject;
    const sprintToUse = overrideSprint !== undefined ? overrideSprint : onlyActiveSprint;

    try {
      let reqStart = selectedDate;
      let reqEnd = selectedDate;
      if (filterType === 'range') {
        reqStart = startDate;
        reqEnd = endDate;
      } else if (filterType === 'weekly') {
        const curr = new Date(selectedDate);
        reqStart = format(startOfWeek(curr, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        reqEnd = format(endOfWeek(curr, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      } else if (filterType === 'monthly') {
        const curr = new Date(selectedDate);
        reqStart = format(startOfMonth(curr), 'yyyy-MM-dd');
        reqEnd = format(endOfMonth(curr), 'yyyy-MM-dd');
      }

      const res = await fetch(`/api/jira-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraHost,
          jiraEmail,
          jiraToken,
          startDate: reqStart,
          endDate: reqEnd,
          scope: scopeToUse,
          searchQuery: queryToUse,
          projectKey: projectToUse,
          onlyActiveSprint: sprintToUse
        })
      });
      const data = await safeParseResponse(res, '/api/jira-issues');
      if (res.ok) {
        setJiraIssues(data.issues || []);
      } else {
        setJiraError(data.error || 'Gagal memuat tiket dari Jira');
      }
    } catch (e: any) {
      setJiraError(e.message || 'Gagal menghubungi server backend');
    } finally {
      setLoadingJira(false);
    }
  };

  const handleImportJiraToTask = (issue: JiraIssue) => {
    const newTask: ManualTask = {
      id: `jira-import-${issue.key}-${Date.now()}`,
      repo: issue.projectKey || issue.projectName || 'Jira',
      title: `[${issue.key}] ${issue.summary}`,
      durationHours: issue.timeSpentHours || 1,
      date: selectedDate
    };
    setManualTasks(prev => [newTask, ...prev]);
  };

  useEffect(() => {
    fetchGitActivity();
    fetchCalendarEvents();
    if (jiraHost && jiraToken) {
      fetchJiraProjects();
      fetchJiraIssues();
    }
  }, [selectedDate, startDate, endDate, filterType, selectedRepos, jiraHost, jiraToken]);

  // Calculate Date Intervals for selected filter
  const getDateRangeDays = (): string[] => {
    if (filterType === 'daily') return [selectedDate];
    if (filterType === 'range') {
      try {
        const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
        return days.map(d => format(d, 'yyyy-MM-dd'));
      } catch {
        return [selectedDate];
      }
    }
    if (filterType === 'weekly') {
      const curr = parseISO(selectedDate);
      const days = eachDayOfInterval({ start: startOfWeek(curr, { weekStartsOn: 1 }), end: endOfWeek(curr, { weekStartsOn: 1 }) });
      return days.map(d => format(d, 'yyyy-MM-dd'));
    }
    if (filterType === 'monthly') {
      const curr = parseISO(selectedDate);
      const days = eachDayOfInterval({ start: startOfMonth(curr), end: endOfMonth(curr) });
      return days.map(d => format(d, 'yyyy-MM-dd'));
    }
    return [selectedDate];
  };

  // Generate Report Breakdown
  const rawDaysList = getDateRangeDays();
  const daysList = sortOrder === 'desc' ? [...rawDaysList].reverse() : rawDaysList;

  // Compute daily breakdown items
  const reportBreakdown = daysList.map(dateStr => {
    const isWknd = isWeekend(parseISO(dateStr));
    // Exclude any canceled meetings or user-deleted meetings
    let dayMeetings = meetings
      .filter(m => m.date === dateStr)
      .filter(m => !deletedMeetingIds.includes(m.id))
      .filter(m => {
        const lower = m.title.toLowerCase();
        return !lower.startsWith('canceled:') && !lower.startsWith('cancelled:') && !lower.includes('canceled') && !lower.includes('cancelled');
      });

    // Check for configured daily meeting on workdays (unless deleted)
    if (!isWknd && hasDailyMeeting) {
      const syncId = `daily-sync-${dateStr}`;
      const isSyncDeleted = deletedMeetingIds.includes(syncId);
      const hasDailySync = dayMeetings.some(m => m.title.toLowerCase().includes(dailyMeetingTitle.toLowerCase()));
      if (!hasDailySync && !isSyncDeleted) {
        dayMeetings = [
          { 
            id: syncId, 
            title: dailyMeetingTitle, 
            startTime: dailyMeetingTime, 
            endTime: '', 
            durationHours: dailyMeetingDuration, 
            date: dateStr 
          },
          ...dayMeetings
        ];
      }
    }
    const dayManualTasks = manualTasks.filter(t => t.date === dateStr);
    // Filter out deleted git commits
    const dayCommits = gitActivities
      .filter(g => g.date.startsWith(dateStr))
      .filter(g => !deletedGitHashes.some(delHash => delHash.split(',').includes(g.hash)));

    // Group commits by repo
    const repoCommitMap: { [key: string]: GitActivity[] } = {};
    dayCommits.forEach(c => {
      if (!repoCommitMap[c.repo]) repoCommitMap[c.repo] = [];
      repoCommitMap[c.repo].push(c);
    });

    const repoTasks: { hash: string; repo: string; title: string; durationHours: number; type: string; timeRange?: string; branch?: string; jiraKey?: string; jiraIssue?: JiraIssue }[] = [];
    
    Object.keys(repoCommitMap).forEach(repoName => {
      const commits = repoCommitMap[repoName];
      
      const validCommits = commits.filter(c => 
        !c.subject.startsWith('Merge branch') && 
        !c.subject.startsWith('Merged in ') &&
        !c.subject.startsWith('Merge pull request') &&
        !c.subject.startsWith('Merge remote-tracking') &&
        !c.subject.includes('(pull request #')
      );

      if (validCommits.length === 0) return;

      // Calculate true active work hours by merging overlapping session intervals (avoid double-counting multiple commits in the same session)
      const calculateActiveSpanHours = (group: GitActivity[]): number => {
        if (!group || group.length === 0) return 0;

        const intervals: { start: number; end: number }[] = [];
        group.forEach(c => {
          let durSec = (c.activeDurationHours || 0.5) * 3600;
          let endTs = c.timestamp || 0;
          let startTs = endTs - durSec;

          if (c.workStartTime && c.workEndTime && c.date) {
            const dayStr = c.date.slice(0, 10);
            const sDate = new Date(`${dayStr}T${c.workStartTime}:00+07:00`).getTime() / 1000;
            const eDate = new Date(`${dayStr}T${c.workEndTime}:00+07:00`).getTime() / 1000;
            if (!isNaN(sDate) && !isNaN(eDate) && eDate > sDate) {
              startTs = sDate;
              endTs = eDate;
            }
          }

          if (endTs > 0) {
            intervals.push({ start: startTs, end: endTs });
          }
        });

        if (intervals.length === 0) return 0.5;

        intervals.sort((a, b) => a.start - b.start);

        const merged: { start: number; end: number }[] = [];
        intervals.forEach(iv => {
          if (merged.length === 0) {
            merged.push({ ...iv });
          } else {
            const last = merged[merged.length - 1];
            if (iv.start <= last.end + 900) {
              last.end = Math.max(last.end, iv.end);
            } else {
              merged.push({ ...iv });
            }
          }
        });

        let totalSec = 0;
        merged.forEach(m => {
          let spanSec = m.end - m.start;
          const dateObj = new Date(m.end * 1000);
          const yStr = dateObj.getFullYear();
          const mStr = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dStr = String(dateObj.getDate()).padStart(2, '0');
          const lunchStartTs = Math.floor(new Date(`${yStr}-${mStr}-${dStr}T12:00:00+07:00`).getTime() / 1000);
          const lunchEndTs = Math.floor(new Date(`${yStr}-${mStr}-${dStr}T13:00:00+07:00`).getTime() / 1000);

          const overlapStart = Math.max(m.start, lunchStartTs);
          const overlapEnd = Math.min(m.end, lunchEndTs);
          const lunchOverlapSec = Math.max(0, overlapEnd - overlapStart);

          spanSec = Math.max(0, spanSec - lunchOverlapSec);
          totalSec += spanSec;
        });

        const hours = totalSec / 3600;
        return Math.max(0.25, Math.round(hours * 4) / 4);
      };

      // Group commits by Jira Key if present, otherwise group by time sessions
      const jiraKeyGroups: { [key: string]: GitActivity[] } = {};
      const nonJiraGroups: GitActivity[][] = [];

      validCommits.forEach(c => {
        const bMatch = (c.branch || '').match(/([a-zA-Z]{2,10}-\d+)/i);
        const sMatch = (c.subject || '').match(/([a-zA-Z]{2,10}-\d+)/i);
        const cKey = bMatch ? bMatch[1].toUpperCase() : (sMatch ? sMatch[1].toUpperCase() : (c.jiraKey ? c.jiraKey.toUpperCase() : ''));

        if (cKey) {
          if (!jiraKeyGroups[cKey]) jiraKeyGroups[cKey] = [];
          jiraKeyGroups[cKey].push(c);
        } else {
          if (nonJiraGroups.length === 0) {
            nonJiraGroups.push([c]);
          } else {
            const currentGroup = nonJiraGroups[nonJiraGroups.length - 1];
            const lastCommit = currentGroup[currentGroup.length - 1];
            const timeDiffSec = Math.abs((c.timestamp || 0) - (lastCommit.timestamp || 0));
            const isSameTimeStr = (c.workStartTime === lastCommit.workStartTime && c.workEndTime === lastCommit.workEndTime);

            if (timeDiffSec <= 900 || isSameTimeStr) {
              currentGroup.push(c);
            } else {
              nonJiraGroups.push([c]);
            }
          }
        }
      });

      // 1. Process Consolidated Jira Groups
      Object.keys(jiraKeyGroups).forEach(jiraKey => {
        const group = jiraKeyGroups[jiraKey];
        group.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        const matchedJiraIssue = jiraIssues.find(i => i.key.toUpperCase() === jiraKey);
        const branchName = group.find(c => c.branch)?.branch || '';
        const primaryHash = group.map(item => item.hash).join(',');

        // Calculate true non-overlapping active work hours for this group
        const durationHours = calculateActiveSpanHours(group);

        // Collect all distinct session time intervals
        const sessionRanges = Array.from(new Set(group.map(c => {
          if (!c.workStartTime || !c.workEndTime) return '';
          return c.workStartTime === c.workEndTime ? c.workStartTime : `${c.workStartTime}→${c.workEndTime}`;
        }).filter(Boolean)));

        const timeRange = sessionRanges.length > 1 ? sessionRanges.join(', ') : (sessionRanges[0] || '');

        // Formatted sub-commit messages with their individual session times
        const uniqueSubjects = Array.from(new Set(group.map(item => {
          const time = (item.workStartTime && item.workEndTime) ? ` (${item.workStartTime}→${item.workEndTime})` : '';
          return `${item.subject}${time}`;
        })));

        const manualMatch = dayManualTasks.find(m => {
          const mKey = (m.title.match(/([a-zA-Z]{2,10}-\d+)/i) || [])[1];
          return mKey && mKey.toUpperCase() === jiraKey;
        });

        const titleHeader = matchedJiraIssue 
          ? `[${matchedJiraIssue.key}] ${matchedJiraIssue.summary}`
          : (manualMatch
              ? manualMatch.title
              : (uniqueSubjects.length > 0 ? `[${jiraKey}] ${uniqueSubjects[0]}` : `[${jiraKey}] Task`));

        const fullTitle = uniqueSubjects.length > 1
          ? `${titleHeader}\n${uniqueSubjects.map(s => `• ${s}`).join('\n')}`
          : ((matchedJiraIssue || manualMatch) && uniqueSubjects[0] !== titleHeader ? `${titleHeader}\n• ${uniqueSubjects[0]}` : titleHeader);

        const override = itemOverrides[primaryHash];

        repoTasks.push({
          hash: primaryHash,
          repo: repoName,
          title: override?.title ?? fullTitle,
          durationHours: override?.durationHours ?? durationHours,
          timeRange: override?.timeRange ?? timeRange,
          branch: branchName,
          jiraKey,
          jiraIssue: matchedJiraIssue,
          type: 'git'
        });
      });

      // 2. Process non-Jira Groups
      nonJiraGroups.forEach(group => {
        const firstCommit = group[0];
        const lastCommit = group[group.length - 1];
        const primaryHash = group.map(item => item.hash).join(',');

        const durationHours = calculateActiveSpanHours(group);
        const startT = firstCommit.workStartTime || '';
        const endT = lastCommit.workEndTime || firstCommit.workEndTime || '';
        const timeRange = (startT && endT) ? (startT === endT ? startT : `${startT}→${endT}`) : '';

        const uniqueSubjects = Array.from(new Set(group.map(item => item.subject)));
        const titles = uniqueSubjects.length > 1 ? uniqueSubjects.map(s => `• ${s}`).join('\n') : uniqueSubjects[0];
        const override = itemOverrides[primaryHash];

        repoTasks.push({
          hash: primaryHash,
          repo: repoName,
          title: override?.title ?? titles,
          durationHours: override?.durationHours ?? durationHours,
          timeRange: override?.timeRange ?? timeRange,
          branch: group.find(c => c.branch)?.branch || '',
          type: 'git'
        });
      });
    });

    // Deduplicate manual tasks that represent a Jira ticket already present in repoTasks
    const activeManualTasks = dayManualTasks.filter(m => {
      const mKeyMatch = m.title.match(/([a-zA-Z]{2,10}-\d+)/i);
      const mKey = mKeyMatch ? mKeyMatch[1].toUpperCase() : '';
      if (mKey && repoTasks.some(r => r.jiraKey === mKey)) return false;
      if (repoTasks.some(r => r.title.includes(m.title) || m.title.includes(r.title))) return false;
      return true;
    });

    // Apply itemOverrides to dayMeetings
    dayMeetings = dayMeetings.map(m => {
      const override = itemOverrides[m.id];
      if (!override) return m;
      return {
        ...m,
        title: override.title ?? m.title,
        durationHours: override.durationHours ?? m.durationHours,
        timeRange: override.timeRange ?? m.timeRange
      };
    });

    const totalMeetingHours = dayMeetings.reduce((acc, m) => acc + m.durationHours, 0);
    const totalManualHours = activeManualTasks.reduce((acc, t) => acc + t.durationHours, 0);
    const totalGitHours = repoTasks.reduce((acc, r) => acc + r.durationHours, 0);

    const loggedWorkHours = totalMeetingHours + totalManualHours + totalGitHours;
    
    // Standby calculation (only for workdays or if logged hours exist)
    const targetHours = isWknd ? 0 : workHoursPerDay;
    const rawStandby = Math.max(0, targetHours - loggedWorkHours);
    const standbyHours = Math.round(rawStandby * 4) / 4;

    return {
      date: dateStr,
      isWeekend: isWknd,
      meetings: dayMeetings,
      manualTasks: activeManualTasks,
      gitTasks: repoTasks,
      totalMeetingHours,
      totalGitHours,
      totalManualHours,
      standbyHours,
      totalLogged: loggedWorkHours + (isWknd ? 0 : standbyHours)
    };
  });

  // Consolidated Text Report
  const generateTextReport = (): string => {
    let lines: string[] = [];

    if (filterType === 'daily') {
      lines.push(`📋 *DAILY WORK REPORT - ${selectedDate}*`);
      lines.push(`-------------------------------------------`);
      const dayData = reportBreakdown[0];
      if (dayData) {
        if (dayData.standbyHours > 0) {
          lines.push(`• ${formatDuration(dayData.standbyHours)} jam project standby`);
        }
        dayData.gitTasks.forEach(g => {
          const timeInfo = g.timeRange ? ` (${g.timeRange})` : '';
          const branchInfo = g.branch ? ` [branch: ${g.branch}]` : '';
          const jiraPrefix = (g as any).jiraKey ? `[${(g as any).jiraKey}] ` : '';
          lines.push(`• ${formatDuration(g.durationHours)} jam [${g.repo}] ${jiraPrefix}${g.title}${branchInfo}${timeInfo}`);
        });
        dayData.manualTasks.forEach(m => {
          lines.push(`• ${formatDuration(m.durationHours)} jam [${m.repo}] ${m.title}`);
        });
        dayData.meetings.forEach(mt => {
          const timeInfo = mt.timeRange ? ` (${mt.timeRange})` : '';
          lines.push(`• ${formatDuration(mt.durationHours)} jam ${mt.title}${timeInfo}`);
        });
      }
      lines.push(`-------------------------------------------`);
      lines.push(`Total: ${workHoursPerDay} Jam`);
    } else {
      lines.push(`📋 *WORK REPORT (${filterType.toUpperCase()})*`);
      lines.push(`Periode: ${daysList[0]} s/d ${daysList[daysList.length - 1]}`);
      lines.push(`===========================================`);

      reportBreakdown.forEach(day => {
        if (day.isWeekend && day.meetings.length === 0 && day.gitTasks.length === 0) return;

        lines.push(`\n📅 *${day.date}*`);
        if (day.standbyHours > 0) {
          lines.push(`  - ${formatDuration(day.standbyHours)} jam project standby`);
        }
        day.gitTasks.forEach(g => {
          const timeInfo = g.timeRange ? ` (${g.timeRange})` : '';
          const branchInfo = g.branch ? ` [branch: ${g.branch}]` : '';
          const jiraPrefix = (g as any).jiraKey ? `[${(g as any).jiraKey}] ` : '';
          lines.push(`  - ${formatDuration(g.durationHours)} jam [${g.repo}] ${jiraPrefix}${g.title}${branchInfo}${timeInfo}`);
        });
        day.manualTasks.forEach(m => {
          lines.push(`  - ${formatDuration(m.durationHours)} jam [${m.repo}] ${m.title}`);
        });
        day.meetings.forEach(mt => {
          lines.push(`  - ${formatDuration(mt.durationHours)} jam ${mt.title}`);
        });
      });

      const grandTotalStandby = reportBreakdown.reduce((acc, d) => acc + d.standbyHours, 0);
      const grandTotalWork = reportBreakdown.reduce((acc, d) => acc + d.totalGitHours + d.totalManualHours, 0);
      const grandTotalMeeting = reportBreakdown.reduce((acc, d) => acc + d.totalMeetingHours, 0);

      lines.push(`\n===========================================`);
      lines.push(`📊 *TOTAL RINGKASAN PERIODE:*`);
      lines.push(`- Work/Development: ${grandTotalWork.toFixed(1)} jam`);
      lines.push(`- Meetings: ${grandTotalMeeting.toFixed(1)} jam`);
      lines.push(`- Project Standby: ${grandTotalStandby.toFixed(1)} jam`);
      lines.push(`- Total Jam: ${(grandTotalWork + grandTotalMeeting + grandTotalStandby).toFixed(1)} jam`);
    }

    return lines.join('\n');
  };

  // Generate breakdown tasks list only without headers, durations, or summaries
  const generateTasksOnlyText = (): string => {
    const taskTitles: string[] = [];

    reportBreakdown.forEach(day => {
      if (day.isWeekend && day.meetings.length === 0 && day.gitTasks.length === 0 && day.manualTasks.length === 0) return;

      day.gitTasks.forEach(g => {
        const repoPrefix = g.repo ? `[${g.repo}] ` : '';
        const title = `${repoPrefix}${g.title}`;
        if (!taskTitles.includes(title)) {
          taskTitles.push(title);
        }
      });

      day.manualTasks.forEach(m => {
        const repoPrefix = m.repo ? `[${m.repo}] ` : '';
        const title = `${repoPrefix}${m.title}`;
        if (!taskTitles.includes(title)) {
          taskTitles.push(title);
        }
      });

      day.meetings.forEach(mt => {
        const title = mt.title;
        if (!taskTitles.includes(title)) {
          taskTitles.push(title);
        }
      });
    });

    return taskTitles.join(', ');
  };

  const [copiedTasks, setCopiedTasks] = useState<boolean>(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  const handleCopyReport = () => {
    const text = generateTextReport();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyTasksOnly = () => {
    const text = generateTasksOnlyText();
    navigator.clipboard.writeText(text);
    setCopiedTasks(true);
    setTimeout(() => setCopiedTasks(false), 2000);
  };

  const handleCopyCycleTimeReport = () => {
    let lines: string[] = [];
    lines.push(`📊 *JIRA SPRINT & CYCLE TIME BREAKDOWN REPORT*`);
    lines.push(`Project: ${selectedJiraProject || 'BakmiGM Mobile'}`);
    lines.push(`Periode: ${daysList[0]} s/d ${daysList[daysList.length - 1]}`);
    lines.push(`=======================================================`);
    lines.push(`Total Tiket: ${jiraIssues.length} | Scope: ${onlyActiveSprint ? 'Sprint Aktif' : 'Semua Tiket'}\n`);

    jiraIssues.forEach((issue, idx) => {
      const dev = issue.devPhases;
      const matchingCommits = gitActivities.filter(g => 
        (g.jiraKey && g.jiraKey.toUpperCase() === issue.key.toUpperCase()) ||
        (g.branch && g.branch.toUpperCase().includes(issue.key.toUpperCase()))
      );

      lines.push(`${idx + 1}. [${issue.key}] ${issue.summary}`);
      lines.push(`   • Status: ${issue.status} | Tipe: ${issue.issueType}`);
      if (dev) {
        lines.push(`   • Fase 1 (Coding): ${dev.fase1Hours}h (${dev.fase1Start || '-'} ➔ ${dev.fase1End || '-'})`);
        lines.push(`   • Review Wait: ${dev.reviewHours}h (${dev.reviewStart || '-'} ➔ ${dev.reviewEnd || '-'})`);
        lines.push(`   • Fase 2 (Prep QA): ${dev.fase2Hours}h (${dev.fase2Start || '-'} ➔ ${dev.fase2End || '-'})`);
        lines.push(`   • QA Testing: ${dev.qaHours}h (${dev.qaStart || '-'} ➔ ${dev.qaEnd || '-'})`);
        lines.push(`   • Total Dev Work: ${dev.totalDevHours}h | Total Lead Time: ${dev.totalLeadHours}h`);
      }
      if (matchingCommits.length > 0) {
        lines.push(`   • Git Commits (${matchingCommits.length}): ${matchingCommits.map(c => `${c.hash} (${c.activeDurationHours || 0.5}h)`).join(', ')}`);
      }
      lines.push(``);
    });

    lines.push(`=======================================================`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedCycleTime(true);
    setTimeout(() => setCopiedCycleTime(false), 2000);
  };

  const handleCopySingleItem = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItemId(id);
    setTimeout(() => setCopiedItemId(null), 1500);
  };

  const handleAddMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingTitle) return;
    const dur = parseFloat(newMeetingDuration) || 0.5;
    setCustomMeetings([...customMeetings, {
      id: Date.now().toString(),
      title: newMeetingTitle,
      startTime: '10:00',
      endTime: '10:30',
      durationHours: dur,
      date: newMeetingDate
    }]);
    setNewMeetingTitle('');
  };

  const handleAddManualTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle) return;
    const dur = parseFloat(newTaskDuration) || 1.0;
    setManualTasks([...manualTasks, {
      id: Date.now().toString(),
      repo: newTaskRepo || 'General Project',
      title: newTaskTitle,
      durationHours: dur,
      date: newTaskDate
    }]);
    setNewTaskTitle('');
  };

  const toggleRepoSelection = (repoName: string) => {
    if (selectedRepos.includes(repoName)) {
      setSelectedRepos(selectedRepos.filter(r => r !== repoName));
    } else {
      setSelectedRepos([...selectedRepos, repoName]);
    }
  };

  // Prepare data for Analytics Charts
  const dailyChartData = reportBreakdown.map(day => ({
    date: day.date.slice(5), // MM-DD
    Development: Math.round((day.totalGitHours + day.totalManualHours) * 10) / 10,
    Meetings: Math.round(day.totalMeetingHours * 10) / 10,
    Standby: Math.round(day.standbyHours * 10) / 10,
  }));

  const totalDev = reportBreakdown.reduce((acc, d) => acc + d.totalGitHours + d.totalManualHours, 0);
  const totalMeet = reportBreakdown.reduce((acc, d) => acc + d.totalMeetingHours, 0);
  const totalStand = reportBreakdown.reduce((acc, d) => acc + d.standbyHours, 0);

  const pieChartData = [
    { name: 'Development', value: Math.round(totalDev * 10) / 10, color: '#0891b2' },
    { name: 'Meetings', value: Math.round(totalMeet * 10) / 10, color: '#f43f5e' },
    { name: 'Standby', value: Math.round(totalStand * 10) / 10, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  if (!isOnboardingComplete) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '32px 24px' }}>
      
      {/* Header Bar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h1 className="gradient-text" style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-0.03em' }}>apicahayatracker</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
            Auto-generate 8 jam report harian, mingguan, & bulanan terintegrasi Git Repo & Calendar.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Main Page Navigation Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveTab('tracker')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeTab === 'tracker' ? '#111111' : 'transparent',
                color: activeTab === 'tracker' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <Layers size={15} /> Work Tracker
            </button>
            <button
              onClick={() => setActiveTab('jira_cycle')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeTab === 'jira_cycle' ? '#111111' : 'transparent',
                color: activeTab === 'jira_cycle' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <Clock size={15} color={activeTab === 'jira_cycle' ? '#38bdf8' : undefined} /> Jira Cycle Time (Sprint)
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: activeTab === 'analytics' ? '#111111' : 'transparent',
                color: activeTab === 'analytics' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: '600',
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <BarChart2 size={15} /> Visual Analytics
            </button>
          </div>

          {activeTab === 'jira_cycle' ? (
            <button className="btn-primary" onClick={handleCopyCycleTimeReport} style={{ background: '#0052CC', borderColor: '#0052CC' }}>
              {copiedCycleTime ? <Check size={16} /> : <Copy size={16} />}
              {copiedCycleTime ? 'Rekap Lead Di-copy!' : 'Copy Rekap Jira untuk Lead'}
            </button>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleCopyTasksOnly} title="Copy daftar detail breakdown kerja saja">
                {copiedTasks ? <Check size={16} /> : <Copy size={16} />}
                {copiedTasks ? 'Breakdown Di-copy!' : 'Copy Breakdown Only'}
              </button>

              <button className="btn-primary" onClick={handleCopyReport}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Berhasil Di-copy!' : 'Copy Report Text'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Filter & Navigation Control */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Rentang Tanggal Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            {(['daily', 'range', 'weekly', 'monthly'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: filterType === type ? 'var(--accent-primary)' : 'transparent',
                  color: filterType === type ? '#fff' : 'var(--text-muted)',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s'
                }}
              >
                {type === 'daily' && 'Harian'}
                {type === 'range' && 'Range Tanggal'}
                {type === 'weekly' && 'Mingguan'}
                {type === 'monthly' && 'Bulanan'}
              </button>
            ))}
          </div>

          {/* Date Picker Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Calendar size={18} color="var(--accent-cyan)" />
            
            {filterType === 'daily' && (
              <input
                type="date"
                className="input-field"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            )}

            {filterType === 'range' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  className="input-field"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span style={{ color: 'var(--text-dim)' }}>s/d</span>
                <input
                  type="date"
                  className="input-field"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <button 
                  className="btn-secondary" 
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title="Toggle Urutan Tanggal"
                >
                  <ArrowUpDown size={14} />
                  {sortOrder === 'asc' ? 'Urutan: Lama → Baru' : 'Urutan: Baru → Lama'}
                </button>
              </div>
            )}

            {filterType === 'weekly' && (
              <input
                type="date"
                className="input-field"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            )}

            {filterType === 'monthly' && (
              <input
                type="month"
                className="input-field"
                value={selectedDate.slice(0, 7)}
                onChange={(e) => setSelectedDate(`${e.target.value}-01`)}
              />
            )}

            <button className="btn-secondary" onClick={fetchGitActivity} title="Refresh Git Data">
              <RefreshCw size={16} className={loadingGit ? 'spin' : ''} />
              Fetch Git Log
            </button>
          </div>

        </div>
      </div>

      {/* Main Grid Content */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 380px', gap: '28px' }}>
        
        {/* Loading GIF Badge (All 5 Cat Memes Row Floating Screen Centered) */}
        {loadingGit && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid var(--border-color)',
              padding: '24px 32px',
              borderRadius: '24px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              backdropFilter: 'blur(16px)',
              maxWidth: '90vw'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <img 
                  src="https://media1.tenor.com/m/OoG1CF2T3QIAAAAC/kucing-scuba-scuba-cat.gif" 
                  alt="Scuba Cat" 
                  style={{ width: '120px', height: '110px', objectFit: 'cover', borderRadius: '12px' }}
                />
                <img 
                  src="https://media1.tenor.com/m/AYMpLIY7OQcAAAAC/cat-meme.gif" 
                  alt="Uhh Cat" 
                  style={{ width: '120px', height: '110px', objectFit: 'cover', borderRadius: '12px' }}
                />
                <img 
                  src="https://media1.tenor.com/m/iALgQGVcpz4AAAAC/scemer-staring-cat.gif" 
                  alt="Staring Cat" 
                  style={{ width: '120px', height: '110px', objectFit: 'cover', borderRadius: '12px' }}
                />
                <img 
                  src="https://media1.tenor.com/m/Bav2QWeveKgAAAAC/best-banana-cat.gif" 
                  alt="Banana Cat" 
                  style={{ width: '120px', height: '110px', objectFit: 'cover', borderRadius: '12px' }}
                />
                <img 
                  src="https://media1.tenor.com/m/5_gXKXI5wFEAAAAC/catcoin-cat.gif" 
                  alt="CatCoin Cat" 
                  style={{ width: '120px', height: '110px', objectFit: 'cover', borderRadius: '12px' }}
                />
              </div>
              <div style={{ color: '#38bdf8', fontWeight: '700', fontSize: '15px', letterSpacing: '0.5px' }}>
                Memindai Git Reflog & Kalender... 🐱🐾
              </div>
            </div>
          </div>
        )}
        
        {/* Left Column: Log Breakdown & Active Tasks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Header Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
                <span>Target Jam Kerja</span>
                <Clock size={16} color="var(--accent-primary)" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>
                {reportBreakdown.reduce((acc, d) => acc + (d.isWeekend ? 0 : workHoursPerDay), 0)} Jam
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                {daysList.length} Hari ({workHoursPerDay}h/day)
              </div>
            </div>

            <div className="glass-card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
                <span>Active Dev & Meeting</span>
                <Briefcase size={16} color="var(--text-main)" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>
                {reportBreakdown.reduce((acc, d) => acc + d.totalGitHours + d.totalManualHours + d.totalMeetingHours, 0).toFixed(1)} Jam
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                Git Commit + Calendar Sync
              </div>
            </div>

            <div className="glass-card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
                <span>Project Standby</span>
                <Coffee size={16} color="var(--text-muted)" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-muted)' }}>
                {reportBreakdown.reduce((acc, d) => acc + d.standbyHours, 0).toFixed(1)} Jam
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                Auto-filled Standby Time
              </div>
            </div>
          </div>

          {/* Interactive Visual Analytics Dashboard (Dedicated Page View) */}
          {activeTab === 'analytics' && (
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart2 size={20} color="#0891b2" />
                  Visual Time Distribution Analytics Dashboard
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Periode: {daysList[0]} s/d {daysList[daysList.length - 1]}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'center' }}>
                {/* Stacked Bar Chart */}
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} unit="h" />
                      <Tooltip 
                        contentStyle={{ background: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }} 
                        formatter={(val: any) => [`${val}h`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Bar dataKey="Development" stackId="a" fill="#0891b2" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Meetings" stackId="a" fill="#f43f5e" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Standby" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Proportion Pie Chart */}
                <div style={{ width: '100%', height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <PieChartIcon size={16} color="#0891b2" /> Rasio Alokasi Waktu
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        paddingAngle={4}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1e293b', borderRadius: '8px', color: '#fff', fontSize: '11px' }} formatter={(val: any) => [`${val}h`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* JIRA SPRINT & CYCLE TIME BREAKDOWN VIEW */}
          {activeTab === 'jira_cycle' && (
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <Clock size={20} color="#0052CC" />
                    Jira Sprint & Cycle Time Breakdown (Dev In Progress ➔ QA ➔ Done)
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Perhitungan akurat durasi kerja developer per tiket berdasarkan riwayat status changelog Jira & Git commits.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-secondary" onClick={() => fetchJiraIssues()} style={{ fontSize: '11px', padding: '5px 10px' }}>
                    <RefreshCw size={12} className={loadingJira ? 'spin' : ''} /> Refresh Jira
                  </button>
                </div>
              </div>

              {/* Cycle Time Summary Metrics */}
              {(() => {
                let totalDevHoursAll = 0;
                let totalLeadHoursAll = 0;
                let totalReviewHoursAll = 0;
                let activeDevCount = 0;

                jiraIssues.forEach(issue => {
                  const dev = issue.devPhases;
                  const matchingCommits = gitActivities.filter(g => 
                    (g.jiraKey && g.jiraKey.toUpperCase() === issue.key.toUpperCase()) ||
                    (g.branch && g.branch.toUpperCase().includes(issue.key.toUpperCase())) ||
                    g.subject.toUpperCase().includes(issue.key.toUpperCase())
                  );
                  const gitHours = matchingCommits.reduce((acc, c) => acc + (c.activeDurationHours || 0.5), 0);
                  const isInProgress = issue.status.toLowerCase().includes('progress') || issue.statusCategory?.toLowerCase() === 'in progress';
                  
                  const f1 = (dev?.fase1Hours && dev.fase1Hours > 0) ? dev.fase1Hours : (isInProgress || gitHours > 0 ? (gitHours > 0 ? gitHours : 0.5) : 0);
                  const f2 = dev?.fase2Hours || 0;
                  const devTotal = (dev?.totalDevHours && dev.totalDevHours > 0) ? dev.totalDevHours : (f1 + f2);
                  const leadTotal = (dev?.totalLeadHours && dev.totalLeadHours > 0) ? dev.totalLeadHours : devTotal;

                  if (devTotal > 0) {
                    totalDevHoursAll += devTotal;
                    totalLeadHoursAll += leadTotal;
                    totalReviewHoursAll += (dev?.reviewHours || 0);
                    activeDevCount++;
                  }
                });

                const avgDev = activeDevCount > 0 ? (totalDevHoursAll / activeDevCount).toFixed(1) : '0.0';
                const avgReview = activeDevCount > 0 ? (totalReviewHoursAll / activeDevCount).toFixed(1) : '0.0';
                const avgLead = activeDevCount > 0 ? (totalLeadHoursAll / activeDevCount).toFixed(1) : '0.0';

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>TOTAL TIKET SPRINT</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#0052CC' }}>{jiraIssues.length} Tiket</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{onlyActiveSprint ? 'Sprint Aktif' : 'Semua Scope'}</div>
                    </div>
                    <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '11px', color: '#166534', fontWeight: '600', marginBottom: '4px' }}>RATA-RATA DEV WORK</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#15803d' }}>{avgDev} Jam</div>
                      <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px' }}>Fase 1 (Coding) + Fase 2 (Prep QA)</div>
                    </div>
                    <div style={{ background: '#faf5ff', padding: '14px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                      <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: '600', marginBottom: '4px' }}>RATA-RATA REVIEW WAIT</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#7e22ce' }}>{avgReview} Jam</div>
                      <div style={{ fontSize: '11px', color: '#9333ea', marginTop: '2px' }}>Waktu Reviewer (Excluded from Dev)</div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '14px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '11px', color: '#1e40af', fontWeight: '600', marginBottom: '4px' }}>RATA-RATA LEAD TIME</div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: '#1d4ed8' }}>{avgLead} Jam</div>
                      <div style={{ fontSize: '11px', color: '#2563eb', marginTop: '2px' }}>Start Dev In Progress ➔ Done</div>
                    </div>
                  </div>
                );
              })()}

              {/* Cycle Time Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11px', fontWeight: '700' }}>
                      <th style={{ padding: '10px 12px' }}>TIKET JIRA</th>
                      <th style={{ padding: '10px 12px' }}>STATUS</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>FASE 1 (CODING)<br/><span style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#64748b' }}>Dev In Progress ➔ Review</span></th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>REVIEW WAIT<br/><span style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#64748b' }}>Reviewer Time</span></th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>FASE 2 (PREP QA)<br/><span style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#64748b' }}>Review Done ➔ Ready QA</span></th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>QA ➔ DONE<br/><span style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#64748b' }}>QA Testing</span></th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>TOTAL DEV<br/><span style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#64748b' }}>Fase 1 + Fase 2</span></th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>TOTAL SELESAI<br/><span style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#64748b' }}>Lead Time</span></th>
                      <th style={{ padding: '10px 12px' }}>GIT COMMITS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jiraIssues.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                          Belum ada tiket Jira dimuat. Pastikan Jira API Token sudah terkoneksi dan klik tombol "Refresh Jira".
                        </td>
                      </tr>
                    ) : (
                      jiraIssues.map((issue) => {
                        const dev = issue.devPhases;
                        const matchingCommits = gitActivities.filter(g => 
                          (g.jiraKey && g.jiraKey.toUpperCase() === issue.key.toUpperCase()) ||
                          (g.branch && g.branch.toUpperCase().includes(issue.key.toUpperCase())) ||
                          g.subject.toUpperCase().includes(issue.key.toUpperCase())
                        );
                        const gitHours = matchingCommits.reduce((acc, c) => acc + (c.activeDurationHours || 0.5), 0);
                        const isDone = issue.status.toLowerCase().includes('done') || issue.statusCategory?.toLowerCase() === 'done';
                        const isInProgress = issue.status.toLowerCase().includes('progress') || issue.statusCategory?.toLowerCase() === 'in progress';
                        const isInReview = issue.status.toLowerCase().includes('review');
                        const isInQa = issue.status.toLowerCase().includes('qa');

                        // Intelligent Dev duration computation:
                        const f1Hours = (dev?.fase1Hours && dev.fase1Hours > 0)
                          ? dev.fase1Hours
                          : (isInProgress || gitHours > 0 ? (gitHours > 0 ? gitHours : 0.5) : 0);

                        const f2Hours = dev?.fase2Hours || 0;
                        const totalDev = (dev?.totalDevHours && dev.totalDevHours > 0)
                          ? dev.totalDevHours
                          : (f1Hours + f2Hours);
                        const totalLead = (dev?.totalLeadHours && dev.totalLeadHours > 0)
                          ? dev.totalLeadHours
                          : totalDev;

                        const isExpanded = expandedIssueKeys.includes(issue.key);

                        return (
                          <React.Fragment key={issue.id}>
                            <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9', background: isExpanded ? '#f8fafc' : 'transparent' }}>
                              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <a 
                                    href={issue.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    style={{ fontWeight: '700', color: '#0052CC', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    {issue.key} <ExternalLink size={10} />
                                  </a>
                                  <span style={{ fontWeight: '500', color: '#1e293b', maxWidth: '240px', lineHeight: '1.3' }}>
                                    {issue.summary}
                                  </span>
                                  <button
                                    onClick={() => toggleExpandIssue(issue.key)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '2px 0',
                                      color: '#0052CC',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      marginTop: '4px'
                                    }}
                                  >
                                    {isExpanded ? '▲ Sembunyikan Detail' : `▼ Detail & History (${dev?.timeline?.length || 0} transisi)`}
                                  </button>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                <span style={{ 
                                  fontSize: '10px', 
                                  fontWeight: '600', 
                                  padding: '2px 7px', 
                                  borderRadius: '10px', 
                                  background: isDone ? '#dcfce7' : isInProgress ? '#dbeafe' : isInReview ? '#faf5ff' : '#f1f5f9', 
                                  color: isDone ? '#15803d' : isInProgress ? '#1e40af' : isInReview ? '#7e22ce' : '#475569',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {issue.status}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                <span style={{ fontWeight: '700', color: '#0f766e' }}>
                                  {f1Hours}h
                                  {isInProgress && <span style={{ fontSize: '9.5px', color: '#0284c7', display: 'block' }}>⏳ In Progress</span>}
                                </span>
                                {dev?.fase1Start && (
                                  <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>{dev.fase1Start}</div>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                <span style={{ fontWeight: '600', color: '#6b21a8' }}>
                                  {dev?.reviewHours || 0}h
                                  {isInReview && <span style={{ fontSize: '9.5px', color: '#9333ea', display: 'block' }}>⏳ In Review</span>}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                <span style={{ fontWeight: '700', color: '#0f766e' }}>
                                  {f2Hours}h
                                </span>
                                {dev?.fase2Start && (
                                  <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>{dev.fase2Start}</div>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                <span style={{ fontWeight: '600', color: '#475569' }}>
                                  {dev?.qaHours || 0}h
                                  {isInQa && <span style={{ fontSize: '9.5px', color: '#ea580c', display: 'block' }}>⏳ In QA</span>}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top', background: '#f0fdf4' }}>
                                <span style={{ fontWeight: '800', color: '#15803d', fontSize: '13px' }}>{totalDev}h</span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'top', background: '#eff6ff' }}>
                                <span style={{ fontWeight: '800', color: '#1d4ed8', fontSize: '13px' }}>{totalLead}h</span>
                              </td>
                              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                {matchingCommits.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <span style={{ fontWeight: '600', color: '#4338ca', fontSize: '11px' }}>
                                      {matchingCommits.length} Commit(s) ({gitHours}h)
                                    </span>
                                    {matchingCommits.map((c, idx) => (
                                      <div key={idx} style={{ fontSize: '10px', color: '#475569', display: 'flex', gap: '4px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', color: '#4338ca' }}>{c.hash}</span>
                                        {c.workStartTime && <span>({c.workStartTime}→{c.workEndTime})</span>}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>-</span>
                                )}
                              </td>
                            </tr>

                            {/* Expandable History Drawer */}
                            {isExpanded && (
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <td colSpan={9} style={{ padding: '12px 16px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                                    {/* Status Change History Timeline */}
                                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={14} color="#0052CC" /> Riwayat Pergeseran Tiket (Jira Changelog)
                                      </div>
                                      {dev?.timeline && dev.timeline.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                          {dev.timeline.map((t: any, idx: number) => (
                                            <div key={idx} style={{ fontSize: '11px', display: 'flex', alignItems: 'flex-start', gap: '8px', paddingBottom: '6px', borderBottom: idx < dev.timeline.length - 1 ? '1px dashed #f1f5f9' : 'none' }}>
                                              <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)', minWidth: '110px' }}>{t.date}</span>
                                              <div style={{ flex: 1 }}>
                                                <span style={{ color: '#475569', textDecoration: 'line-through' }}>{t.from || 'Created'}</span>
                                                {' ➔ '}
                                                <span style={{ fontWeight: '700', color: '#0052CC' }}>{t.to}</span>
                                                {t.author && <span style={{ color: '#94a3b8', fontSize: '10px', marginLeft: '6px' }}>oleh {t.author}</span>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Belum ada riwayat transisi status tercatat pada tiket ini.</div>
                                      )}
                                    </div>

                                    {/* Associated Git Commits & Subtasks */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                      {issue.subtasks && issue.subtasks.length > 0 && (
                                        <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                                            📋 Sub-tasks ({issue.subtasks.length})
                                          </div>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {issue.subtasks.map(st => (
                                              <div key={st.id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ color: '#334155' }}><b>{st.key}</b> {st.summary}</span>
                                                <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '4px', background: '#f1f5f9', color: '#475569' }}>{st.status}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {matchingCommits.length > 0 && (
                                        <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
                                            💻 Commit Lokal Terkait ({matchingCommits.length})
                                          </div>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {matchingCommits.map((c, idx) => (
                                              <div key={idx} style={{ fontSize: '11px', color: '#334155' }}>
                                                <span style={{ fontFamily: 'var(--font-mono)', color: '#4338ca', fontWeight: '700' }}>{c.hash}</span>
                                                {c.workStartTime && <span style={{ color: '#0284c7', marginLeft: '4px' }}>({c.workStartTime}→{c.workEndTime})</span>}
                                                <div style={{ color: '#64748b', fontSize: '10.5px' }}>{c.subject}</div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Breakdown Per Day Cards */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} color="var(--text-main)" />
              Detail Breakdown Jam Kerja
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {loadingGit ? (
                // Shimmer Loading Skeleton Rows
                [1, 2, 3].map((n) => (
                  <div key={n} style={{
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    padding: '18px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="shimmer-block" style={{ width: '120px', height: '18px' }}></div>
                      <div className="shimmer-block" style={{ width: '80px', height: '16px' }}></div>
                    </div>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div className="shimmer-block" style={{ width: '100%', height: '32px' }}></div>
                      <div className="shimmer-block" style={{ width: '100%', height: '32px' }}></div>
                      <div className="shimmer-block" style={{ width: '80%', height: '32px' }}></div>
                    </div>
                  </div>
                ))
              ) : (
                reportBreakdown.map((day) => (
                <div key={day.date} style={{ 
                  background: 'var(--bg-input)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '18px',
                  border: day.isWeekend ? '1px dashed var(--border-color)' : '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '700', fontSize: '15px' }}>{day.date}</span>
                      {day.isWeekend && (
                        <span style={{ background: '#262626', color: '#a3a3a3', fontSize: '11px', padding: '2px 8px', borderRadius: '12px' }}>
                          Weekend
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>
                      Total: {day.totalLogged.toFixed(1)} Jam
                    </span>
                  </div>

                  {/* Tasks List (Satoshi Watanabe Editorial List) */}
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                    
                    {/* Standby Item */}
                    {day.standbyHours > 0 && (
                      <div className="work-row">
                        <span className="col-num">000</span>
                        <span className="col-cat">STANDBY</span>
                        <span className="col-title">Project Standby Waktu Kerja</span>
                        <span className="col-time"></span>
                        <span className="col-dur">{formatDuration(day.standbyHours)}h</span>
                        <span className="col-action"></span>
                      </div>
                    )}

                    {/* Git Auto Tasks */}
                    {day.gitTasks.map((git, idx) => (
                      <div key={idx} className="work-row">
                        <span className="col-num">00{idx + 1}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                          <span className="col-cat" title={git.repo}>{git.repo.toUpperCase()}</span>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {(git as any).jiraKey && (
                              <a
                                href={jiraHost ? `https://${jiraHost.replace(/^https?:\/\//, '')}/browse/${(git as any).jiraKey}` : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  background: '#eff6ff',
                                  color: '#0052CC',
                                  fontSize: '10.5px',
                                  fontWeight: '700',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #bfdbfe',
                                  textDecoration: 'none'
                                }}
                                title={(git as any).jiraIssue ? `Jira: ${(git as any).jiraIssue.summary} (${(git as any).jiraIssue.status})` : `Jira: ${(git as any).jiraKey}`}
                              >
                                <Briefcase size={10} color="#0052CC" />
                                {(git as any).jiraKey}
                              </a>
                            )}
                            {(git as any).jiraIssue && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: '600',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: (git as any).jiraIssue.status.toLowerCase().includes('done') || (git as any).jiraIssue.statusCategory?.toLowerCase() === 'done' ? '#dcfce7' : '#dbeafe',
                                color: (git as any).jiraIssue.status.toLowerCase().includes('done') || (git as any).jiraIssue.statusCategory?.toLowerCase() === 'done' ? '#15803d' : '#1e40af'
                              }}>
                                {(git as any).jiraIssue.status}
                              </span>
                            )}
                            {git.branch && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(99, 102, 241, 0.08)',
                                color: '#4f46e5',
                                fontSize: '11px',
                                fontWeight: '600',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontFamily: 'var(--font-mono)',
                                width: 'fit-content',
                                wordBreak: 'break-all',
                                border: '1px solid rgba(99, 102, 241, 0.2)'
                              }} title={`Branch: ${git.branch}`}>
                                <FolderGit2 size={11} />
                                {git.branch}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="col-title" title={git.title} style={{ whiteSpace: 'pre-line' }}>{git.title}</span>
                        <div className="col-time">
                          {git.timeRange ? (
                            git.timeRange.split(', ').map((rangeStr, rIdx) => (
                              <span key={rIdx} className="time-chip">{rangeStr}</span>
                            ))
                          ) : ''}
                        </div>
                        <span className="col-dur">{formatDuration(git.durationHours)}h</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleCopySingleItem(`git-${git.hash}`, git.repo ? `[${git.repo}] ${git.title}` : git.title)}
                            title="Copy judul task ini saja"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: copiedItemId === `git-${git.hash}` ? 'var(--accent-emerald, #10b981)' : 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.7,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                          >
                            {copiedItemId === `git-${git.hash}` ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={() => openEditModal(git.hash, 'git', git.title, git.durationHours, git.timeRange)}
                            title="Edit task ini"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteGitTask(git.hash)}
                            title="Hapus / Abaikan task ini"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Manual Added Tasks */}
                    {day.manualTasks.map((mt, idx) => (
                      <div key={mt.id} className="work-row">
                        <span className="col-num">01{idx + 1}</span>
                        <span className="col-cat" title={mt.repo}>{mt.repo.toUpperCase()}</span>
                        <span className="col-title" title={mt.title}>{mt.title}</span>
                        <span className="col-time"></span>
                        <span className="col-dur">{formatDuration(mt.durationHours)}h</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleCopySingleItem(`manual-${mt.id}`, mt.repo ? `[${mt.repo}] ${mt.title}` : mt.title)}
                            title="Copy judul task ini saja"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: copiedItemId === `manual-${mt.id}` ? 'var(--accent-emerald, #10b981)' : 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.7,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                          >
                            {copiedItemId === `manual-${mt.id}` ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={() => openEditModal(mt.id, 'manual', mt.title, mt.durationHours)}
                            title="Edit task ini"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteManualTask(mt.id)}
                            title="Hapus task ini"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Meetings */}
                    {day.meetings.map((m, idx) => (
                      <div key={m.id} className="work-row">
                        <span className="col-num">02{idx + 1}</span>
                        <span className="col-cat">MEETING</span>
                        <span className="col-title" title={m.title}>{m.title}</span>
                        <div className="col-time">
                          {m.timeRange ? (
                            m.timeRange.split(', ').map((rangeStr, rIdx) => (
                              <span key={rIdx} className="time-chip">{rangeStr}</span>
                            ))
                          ) : ''}
                        </div>
                        <span className="col-dur">{formatDuration(m.durationHours)}h</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleCopySingleItem(`meeting-${m.id}`, m.title)}
                            title="Copy judul meeting ini saja"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: copiedItemId === `meeting-${m.id}` ? 'var(--accent-emerald, #10b981)' : 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.7,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                          >
                            {copiedItemId === `meeting-${m.id}` ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={() => openEditModal(m.id, 'meeting', m.title, m.durationHours, m.timeRange)}
                            title="Edit meeting ini"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteMeeting(m.id)}
                            title="Hapus meeting ini"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              opacity: 0.6,
                              transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )))}
            </div>
          </div>

        </div>

        {/* Right Column: GitHub Repos & Add Tasks / Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Jira Integration Card */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Briefcase size={18} color="#0052CC" />
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
                  Jira Integration
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {jiraHost && (
                  <button 
                    onClick={() => fetchJiraIssues()} 
                    disabled={loadingJira}
                    className="btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Refresh Tiket Jira"
                  >
                    <RefreshCw size={11} className={loadingJira ? 'spin' : ''} />
                    <span>Refresh</span>
                  </button>
                )}
                <button 
                  className="btn-secondary" 
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => setShowJiraModal(true)}
                >
                  {jiraHost ? '⚙️ Pengaturan' : '🔑 Hubungkan Jira'}
                </button>
              </div>
            </div>

            {!jiraHost ? (
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Hubungkan akun Jira perusahaan untuk otomatis menarik tiket yang ditugaskan atau terkait dengan Anda.
                </p>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
                  onClick={() => setShowJiraModal(true)}
                >
                  Setup Jira API Token
                </button>
              </div>
            ) : (
              <div>
                {/* User & Domain status header */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  marginBottom: '10px', 
                  padding: '6px 10px', 
                  background: '#f8fafc', 
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '11px' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: '7px', 
                      height: '7px', 
                      borderRadius: '50%', 
                      background: '#10b981', 
                      flexShrink: 0 
                    }} />
                    <span style={{ fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {jiraUser?.displayName || 'Terkoneksi ke Jira'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ({jiraHost.replace(/^https?:\/\//, '')})
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', color: '#0052CC', fontWeight: '600' }}>
                      <input
                        type="checkbox"
                        checked={onlyActiveSprint}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setOnlyActiveSprint(val);
                          fetchJiraIssues(jiraScope, jiraSearchQuery, selectedJiraProject, val);
                        }}
                      />
                      <span>Sprint Aktif Saja</span>
                    </label>
                    <span style={{ color: '#475569', fontWeight: '600', fontSize: '11px' }}>
                      ({jiraIssues.length} Tiket)
                    </span>
                  </div>
                </div>

                {/* Scope Filter Tabs */}
                <div style={{ display: 'flex', gap: '3px', marginBottom: '10px', background: '#f1f5f9', padding: '3px', borderRadius: '6px', overflowX: 'auto' }}>
                  {[
                    { id: 'active_sprint', label: '🏃 Sprint Aktif' },
                    { id: 'my', label: '👥 Terkait Saya' },
                    { id: 'assigned', label: '📌 Ditugaskan' },
                    { id: 'active', label: '⚡ In Progress' },
                    { id: 'all_project', label: '🌐 Semua (Backlog)' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        const newScope = s.id as any;
                        setJiraScope(newScope);
                        fetchJiraIssues(newScope);
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '10.5px',
                        fontWeight: '600',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: jiraScope === s.id ? '#ffffff' : 'transparent',
                        color: jiraScope === s.id ? '#0052CC' : 'var(--text-muted)',
                        boxShadow: jiraScope === s.id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Filters Row: Project Selector + Search */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {jiraProjects.length > 0 && (
                    <div style={{ flex: '0 0 130px', position: 'relative' }}>
                      <select
                        value={selectedJiraProject}
                        onChange={(e) => {
                          const p = e.target.value;
                          setSelectedJiraProject(p);
                          fetchJiraIssues(jiraScope, jiraSearchQuery, p);
                        }}
                        style={{
                          width: '100%',
                          fontSize: '11px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#334155',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="ALL">Semua Project</option>
                        {jiraProjects.map(proj => (
                          <option key={proj.id} value={proj.key}>
                            {proj.key} - {proj.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Cari tiket (misal: BAK-123 atau kata kunci)..."
                      value={jiraSearchQuery}
                      onChange={(e) => setJiraSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          fetchJiraIssues(jiraScope, jiraSearchQuery);
                        }
                      }}
                      className="input-field"
                      style={{ width: '100%', fontSize: '11px', padding: '6px 28px 6px 26px' }}
                    />
                    <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    {jiraSearchQuery && (
                      <button
                        onClick={() => {
                          setJiraSearchQuery('');
                          fetchJiraIssues(jiraScope, '');
                        }}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-dim)',
                          fontSize: '11px',
                          padding: '2px'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Error Banner */}
                {jiraError && (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '11px',
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={13} style={{ flexShrink: 0 }} />
                      <span>{jiraError}</span>
                    </div>
                    <button
                      onClick={() => fetchJiraIssues('all_project')}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #fca5a5',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '10px',
                        color: '#b91c1c',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Coba Semua Tiket
                    </button>
                  </div>
                )}

                {/* Issues List or Empty States */}
                {(() => {
                  if (loadingJira) {
                    return (
                      <div style={{ 
                        fontSize: '12px', 
                        color: 'var(--text-dim)', 
                        textAlign: 'center', 
                        padding: '20px 10px', 
                        background: '#f8fafc', 
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <RefreshCw size={16} className="spin" color="#0052CC" />
                        <span>Mengambil tiket dari Jira...</span>
                      </div>
                    );
                  }

                  const filteredIssues = jiraIssues.filter(issue => {
                    if (!jiraSearchQuery.trim()) return true;
                    const q = jiraSearchQuery.toLowerCase();
                    return issue.key.toLowerCase().includes(q) || 
                           issue.summary.toLowerCase().includes(q) || 
                           (issue.projectName && issue.projectName.toLowerCase().includes(q)) ||
                           (issue.assigneeName && issue.assigneeName.toLowerCase().includes(q));
                  });

                  if (filteredIssues.length === 0) {
                    return (
                      <div style={{ 
                        fontSize: '12px', 
                        color: 'var(--text-muted)', 
                        textAlign: 'center', 
                        padding: '18px 12px', 
                        background: '#f8fafc', 
                        border: '1px dashed #cbd5e1',
                        borderRadius: '8px' 
                      }}>
                        <Briefcase size={22} color="#94a3b8" style={{ margin: '0 auto 8px', display: 'block' }} />
                        <div style={{ fontWeight: '600', color: '#334155', marginBottom: '4px' }}>
                          Tidak ada tiket ditemukan
                        </div>
                        <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                          {jiraScope === 'assigned' 
                            ? 'Belum ada tiket yang di-assign langsung ke Anda. Coba cek tab "Terkait Saya" atau "Semua Project".'
                            : jiraScope === 'my'
                            ? 'Belum ada tiket terkait akun Anda. Coba klik "Semua Project" untuk melihat seluruh tiket yang ada.'
                            : 'Coba ubah kata kunci pencarian atau pilih filter project yang berbeda.'}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {jiraScope !== 'my' && (
                            <button
                              onClick={() => {
                                setJiraScope('my');
                                fetchJiraIssues('my');
                              }}
                              className="btn-secondary"
                              style={{ fontSize: '10.5px', padding: '3px 8px' }}
                            >
                              👥 Tiket Terkait Saya
                            </button>
                          )}
                          {jiraScope !== 'all_project' && (
                            <button
                              onClick={() => {
                                setJiraScope('all_project');
                                fetchJiraIssues('all_project');
                              }}
                              className="btn-secondary"
                              style={{ fontSize: '10.5px', padding: '3px 8px' }}
                            >
                              🌐 Semua Project
                            </button>
                          )}
                          <button
                            onClick={() => fetchJiraIssues()}
                            className="btn-secondary"
                            style={{ fontSize: '10.5px', padding: '3px 8px' }}
                          >
                            🔄 Refresh
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '2px' }}>
                      {filteredIssues.map((issue) => {
                        const isDone = issue.status.toLowerCase().includes('done') || issue.statusCategory?.toLowerCase() === 'done';
                        const isInProgress = issue.status.toLowerCase().includes('progress') || issue.statusCategory?.toLowerCase() === 'in progress';

                        const matchingGitCommits = gitActivities.filter(g => 
                          (g.jiraKey && g.jiraKey.toUpperCase() === issue.key.toUpperCase()) || 
                          (g.branch && g.branch.toUpperCase().includes(issue.key.toUpperCase())) || 
                          g.subject.toUpperCase().includes(issue.key.toUpperCase())
                        );
                        const isExpanded = expandedIssueKeys.includes(issue.key);
                        const hasDetails = (issue.subtasks && issue.subtasks.length > 0) || 
                                           (issue.devPhases && (issue.devPhases.totalDevHours > 0 || (issue.devPhases.timeline && issue.devPhases.timeline.length > 0))) || 
                                           matchingGitCommits.length > 0;

                        return (
                          <div 
                            key={issue.id} 
                            style={{ 
                              padding: '10px 12px', 
                              borderRadius: '8px', 
                              background: '#ffffff', 
                              border: isExpanded ? '1px solid #93c5fd' : '1px solid #e2e8f0', 
                              boxShadow: isExpanded ? '0 2px 6px rgba(0,82,204,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '8px',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <a 
                                  href={issue.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ fontWeight: '700', fontSize: '12px', color: '#0052CC', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                                >
                                  {issue.key} <ExternalLink size={10} />
                                </a>
                                <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>
                                  {issue.issueType}
                                </span>
                              </div>
                              <span style={{ 
                                fontSize: '10px', 
                                fontWeight: '600', 
                                padding: '2px 7px', 
                                borderRadius: '10px', 
                                background: isDone ? '#dcfce7' : isInProgress ? '#dbeafe' : '#f1f5f9', 
                                color: isDone ? '#15803d' : isInProgress ? '#1e40af' : '#475569' 
                              }}>
                                {issue.status}
                              </span>
                            </div>

                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#1e293b', lineHeight: '1.4' }}>
                              {issue.summary}
                            </div>

                            {/* Summary Badges Row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {issue.devPhases && issue.devPhases.totalDevHours > 0 && (
                                <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#1d4ed8', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                  ⏱️ Dev Time: {issue.devPhases.totalDevHours}h
                                </span>
                              )}
                              {issue.subtasks && issue.subtasks.length > 0 && (
                                <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#6b21a8', background: '#faf5ff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e9d5ff' }}>
                                  📋 {issue.subtasks.length} Sub-task
                                </span>
                              )}
                              {matchingGitCommits.length > 0 && (
                                <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#4338ca', background: '#eef2ff', padding: '1px 6px', borderRadius: '4px', border: '1px solid #c7d2fe' }}>
                                  💻 {matchingGitCommits.length} Git Commit
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', fontSize: '11px', color: 'var(--text-dim)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                                  📁 {issue.projectName || issue.projectKey}
                                </span>
                                {issue.assigneeName && (
                                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }}>
                                    👤 {issue.assigneeName}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {hasDetails && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandIssue(issue.key)}
                                    style={{
                                      background: isExpanded ? '#e2e8f0' : '#f8fafc',
                                      border: '1px solid #cbd5e1',
                                      color: '#334155',
                                      borderRadius: '4px',
                                      padding: '3px 7px',
                                      fontSize: '10.5px',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}
                                  >
                                    {isExpanded ? '▲ Tutup' : '▼ Detail Breakdown'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleImportJiraToTask(issue)}
                                  style={{
                                    background: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    color: '#1d4ed8',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    fontSize: '10.5px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    flexShrink: 0
                                  }}
                                >
                                  <Plus size={11} /> Impor ke Log
                                </button>
                              </div>
                            </div>

                            {/* Expanded Breakdown Drawer */}
                            {isExpanded && (
                              <div style={{
                                marginTop: '6px',
                                paddingTop: '8px',
                                borderTop: '1px dashed #cbd5e1',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                fontSize: '11px'
                              }}>
                                {/* 1. Dev Phase Durations */}
                                {issue.devPhases && (
                                  <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span>⏱️ Rincian Waktu Dev (Cycle Time):</span>
                                      <span style={{ color: '#0052CC' }}>Total: {issue.devPhases.totalDevHours} Jam</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#334155' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>🔹 <strong>Fase 1 (Coding):</strong> Dev In Progress ➔ Ready To Code Review</span>
                                        <span style={{ fontWeight: '600', color: '#0f766e' }}>{issue.devPhases.fase1Hours} Jam</span>
                                      </div>
                                      {issue.devPhases.fase1Start && (
                                        <div style={{ fontSize: '10px', color: '#64748b', marginLeft: '14px' }}>
                                          Mulai: {issue.devPhases.fase1Start} {issue.devPhases.fase1End ? `→ Selesai: ${issue.devPhases.fase1End}` : '(Sedang berjalan)'}
                                        </div>
                                      )}

                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                        <span>🔹 <strong>Fase 2 (Prep QA):</strong> Code Review Done ➔ Ready To QA</span>
                                        <span style={{ fontWeight: '600', color: '#0f766e' }}>{issue.devPhases.fase2Hours} Jam</span>
                                      </div>
                                      {issue.devPhases.fase2Start && (
                                        <div style={{ fontSize: '10px', color: '#64748b', marginLeft: '14px' }}>
                                          Mulai: {issue.devPhases.fase2Start} {issue.devPhases.fase2End ? `→ Selesai: ${issue.devPhases.fase2End}` : '(Sedang berjalan)'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* 2. Subtasks List */}
                                {issue.subtasks && issue.subtasks.length > 0 && (
                                  <div style={{ background: '#fcfaf7', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                                    <div style={{ fontWeight: '700', color: '#9a3412', marginBottom: '6px' }}>
                                      📋 Sub-tasks Breakdown ({issue.subtasks.length}):
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {issue.subtasks.map(sub => (
                                        <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                                            <span style={{ fontWeight: '600', color: '#0052CC', flexShrink: 0 }}>{sub.key}</span>
                                            <span style={{ color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub.summary}</span>
                                          </div>
                                          <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', flexShrink: 0 }}>
                                            {sub.status}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 3. Matching Git Commits */}
                                {matchingGitCommits.length > 0 && (
                                  <div style={{ background: '#f5f3ff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd6fe' }}>
                                    <div style={{ fontWeight: '700', color: '#5b21b6', marginBottom: '6px' }}>
                                      💻 Sesi Git Commit Terkait ({matchingGitCommits.length}):
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {matchingGitCommits.map((c, cIdx) => (
                                        <div key={cIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '10.5px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                                            <span style={{ fontFamily: 'var(--font-mono)', color: '#4338ca', flexShrink: 0 }}>{c.hash}</span>
                                            <span style={{ color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject}</span>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                            {c.workStartTime && (
                                              <span style={{ color: '#64748b', fontSize: '10px' }}>{c.workStartTime}→{c.workEndTime}</span>
                                            )}
                                            <span style={{ fontWeight: '600', color: '#4338ca' }}>{c.activeDurationHours || 0.5}h</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          
          {/* GitHub Repositories Selector */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderGit2 size={18} color="var(--accent-primary)" />
                Detected GitHub Repos
              </h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const bakmiNames = repos.filter(r => r.name.toLowerCase().includes('bakmigm')).map(r => r.name);
                    setSelectedRepos(bakmiNames.length > 0 ? bakmiNames : repos.map(r => r.name));
                  }}
                  className="btn-secondary"
                  style={{ fontSize: '10.5px', padding: '3px 7px', background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', fontWeight: '600' }}
                  title="Pilih hanya repo BakmiGM"
                >
                  🍜 BakmiGM Saja
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRepos(repos.map(r => r.name))}
                  className="btn-secondary"
                  style={{ fontSize: '10.5px', padding: '3px 7px' }}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRepos([])}
                  className="btn-secondary"
                  style={{ fontSize: '10.5px', padding: '3px 7px' }}
                >
                  Reset
                </button>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Pilih repository lokal yang ingin di-track aktivitas git commitnya ({selectedRepos.length} dipilih):
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
              {repos.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-dim)', textAlign: 'center', padding: '12px' }}>
                  Scanning ~/documents repos...
                </div>
              ) : (
                repos.map((repo) => (
                  <label
                    key={repo.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: selectedRepos.includes(repo.name) ? 'var(--bg-card-hover)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '13px',
                      border: '1px solid',
                      borderColor: selectedRepos.includes(repo.name) ? 'var(--accent-primary)' : 'transparent'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRepos.includes(repo.name)}
                      onChange={() => toggleRepoSelection(repo.name)}
                    />
                    <span style={{ fontWeight: '500', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {repo.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Teams Calendar .ICS Importer & Live Subscription */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--accent-rose)" />
              Microsoft Teams / Outlook Live Sync
            </h3>
            
            {/* Live iCal Subscription Feed URL */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>
                🔗 Live iCal Feed URL (Fully Automated Sync):
              </label>
              <input
                type="url"
                placeholder="https://outlook.office365.com/.../calendar.ics"
                className="input-field"
                style={{ width: '100%', fontSize: '11px', padding: '8px' }}
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                Masukkan URL Publish iCal dari Outlook/Teams. Meeting baru akan otomatis ter-sync tanpa impor file!
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Atau upload file .ics manual:
              </p>
              <input
                type="file"
                accept=".ics"
                className="input-field"
                style={{ width: '100%', fontSize: '12px' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const text = event.target?.result as string;
                    if (text) {
                      const vevents = text.split(/BEGIN:VEVENT/i);
                      vevents.shift();
                      const parsedMeetings: Meeting[] = [];

                      vevents.forEach((vev, idx) => {
                        // Exclude canceled meetings
                        if (vev.match(/STATUS:CANCELLED/i) || vev.match(/METHOD:CANCEL/i)) return;

                        // Clean lines and handle line continuation
                        const cleanVev = vev.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
                        const rawLines = cleanVev.split(/\r?\n/);
                        
                        let summary = '';
                        let dtstartStr = '';
                        let dtendStr = '';

                        rawLines.forEach(line => {
                          const colonIdx = line.indexOf(':');
                          if (colonIdx !== -1) {
                            const key = line.substring(0, colonIdx).toUpperCase();
                            const val = line.substring(colonIdx + 1).trim();

                            if (key === 'SUMMARY' || key.startsWith('SUMMARY;')) {
                              summary = val;
                            } else if (key === 'DTSTART' || key.startsWith('DTSTART;')) {
                              dtstartStr = val;
                            } else if (key === 'DTEND' || key.startsWith('DTEND;')) {
                              dtendStr = val;
                            }
                          }
                        });

                        if (summary && dtstartStr) {
                          const lowerSum = summary.toLowerCase();
                          if (lowerSum.startsWith('canceled:') || lowerSum.startsWith('cancelled:')) return;

                          summary = summary.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
                          
                          const mStart = dtstartStr.match(/(\d{4})(\d{2})(\d{2})/);
                          if (mStart) {
                            // Use the exact date from the ICS file (no forced year shift)
                            const evDate = `${mStart[1]}-${mStart[2]}-${mStart[3]}`;

                            let duration = 0.5;
                            const mStartTime = dtstartStr.match(/T(\d{2})(\d{2})/);
                            const mEndTime = dtendStr.match(/T(\d{2})(\d{2})/);
                            if (mStartTime && mEndTime) {
                              const sh = parseInt(mStartTime[1], 10);
                              const sm = parseInt(mStartTime[2], 10);
                              const eh = parseInt(mEndTime[1], 10);
                              const em = parseInt(mEndTime[2], 10);
                              const diff = (eh * 60 + em) - (sh * 60 + sm);
                              if (diff > 0) {
                                duration = Math.max(0.25, Math.round((diff / 60) * 4) / 4);
                              }
                            }

                            parsedMeetings.push({
                              id: `teams-single-${idx}-${Date.now()}`,
                              title: summary,
                              startTime: '09:00',
                              endTime: '09:30',
                              durationHours: duration,
                              date: evDate
                            });
                          }
                      }
                    });

                      setCustomMeetings(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newEvs = parsedMeetings.filter(m => !existingIds.has(m.id));
                        return [...prev, ...newEvs];
                      });
                      const debugSummary = parsedMeetings.map(m => `${m.date}: ${m.title}`).slice(0, 10).join('\n');
                      alert(`Berhasil mengimpor ${parsedMeetings.length} event kalender!\n\nSampel event yang terbaca:\n${debugSummary}`);
                    }
                  };
                  reader.readAsText(file);
                }
              }}
            />
            </div>
          </div>

          {/* Quick Add Meeting & Manual Task */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} color="var(--accent-cyan)" />
              Tambah Meeting / Task Manual
            </h3>

            {/* Add Meeting Form */}
            <form onSubmit={handleAddMeeting} style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-rose)', marginBottom: '8px' }}>
                + Meeting Teams (Sync / Alignment)
              </div>
              <input
                type="text"
                placeholder="Judul Meeting Teams (misal: Bakmi GM Sync)"
                className="input-field"
                style={{ width: '100%', marginBottom: '8px' }}
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="date"
                  className="input-field"
                  value={newMeetingDate}
                  onChange={(e) => setNewMeetingDate(e.target.value)}
                />
                <select
                  className="input-field"
                  value={newMeetingDuration}
                  onChange={(e) => setNewMeetingDuration(e.target.value)}
                >
                  <option value="0.25">0.25 Jam (15m)</option>
                  <option value="0.5">0.5 Jam (30m)</option>
                  <option value="1">1.0 Jam (1h)</option>
                  <option value="1.5">1.5 Jam</option>
                  <option value="2">2.0 Jam</option>
                </select>
              </div>
              <button type="submit" className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                Simpan Meeting
              </button>
            </form>

            <hr style={{ borderColor: 'var(--border-color)', margin: '16px 0' }} />

            {/* Add Custom Task Form */}
            <form onSubmit={handleAddManualTask}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-emerald)', marginBottom: '8px' }}>
                + Task Pengerjaan Khusus
              </div>
              <input
                type="text"
                placeholder="Nama Repository / Project"
                className="input-field"
                style={{ width: '100%', marginBottom: '8px' }}
                value={newTaskRepo}
                onChange={(e) => setNewTaskRepo(e.target.value)}
              />
              <input
                type="text"
                placeholder="Judul Task (misal: Bugfix auth screen)"
                className="input-field"
                style={{ width: '100%', marginBottom: '8px' }}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="date"
                  className="input-field"
                  value={newTaskDate}
                  onChange={(e) => setNewTaskDate(e.target.value)}
                />
                <select
                  className="input-field"
                  value={newTaskDuration}
                  onChange={(e) => setNewTaskDuration(e.target.value)}
                >
                  <option value="0.25">0.25 Jam (15m)</option>
                  <option value="0.5">0.5 Jam (30m)</option>
                  <option value="1">1.0 Jam</option>
                  <option value="1.5">1.5 Jam</option>
                  <option value="2">2.0 Jam</option>
                  <option value="3">3.0 Jam</option>
                  <option value="4">4.0 Jam</option>
                </select>
              </div>
              <button type="submit" className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                Simpan Task Manual
              </button>
            </form>
          </div>

          {/* Live Preview Text Box */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="var(--accent-amber)" />
                Text Report Preview
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={handleCopyTasksOnly} title="Copy detail breakdown kerja saja">
                  {copiedTasks ? 'Copied!' : 'Copy Breakdown Only'}
                </button>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={handleCopyReport}>
                  Copy Full Report
                </button>
              </div>
            </div>

            <textarea
              readOnly
              value={generateTextReport()}
              style={{
                width: '100%',
                height: '180px',
                background: '#f8f9fa',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: '#111111',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                padding: '12px',
                resize: 'none',
                outline: 'none'
              }}
            />
          </div>

        </div>

      </div>

      {/* Edit Item Modal Overlay */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '90%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit size={18} />
              Edit Item Breakdown
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Judul Task / Meeting
                </label>
                <textarea
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="input-field"
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Jam Mulai
                  </label>
                  <input
                    type="time"
                    required
                    value={editStartTime}
                    onChange={(e) => {
                      setEditStartTime(e.target.value);
                      setEditTimeError('');
                    }}
                    className="input-field"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Jam Selesai
                  </label>
                  <input
                    type="time"
                    required
                    value={editEndTime}
                    onChange={(e) => {
                      setEditEndTime(e.target.value);
                      setEditTimeError('');
                    }}
                    className="input-field"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Dynamic computed duration preview & validation message */}
              <div style={{
                background: '#f8f9fa',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px'
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>Kalkulasi Durasi Jam:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--accent-primary)', fontSize: '14px' }}>
                  {calculateDurationFromTimes(editStartTime, editEndTime) !== null
                    ? `${calculateDurationFromTimes(editStartTime, editEndTime)} Jam`
                    : '--'}
                </span>
              </div>

              {editTimeError && (
                <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '600' }}>
                  {editTimeError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingItem(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveEdit}
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jira Configuration Modal Overlay */}
      {showJiraModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            width: '90%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Briefcase size={20} color="#0052CC" />
              Pengaturan Integrasi Jira REST API
            </h3>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Masukkan kredensial Jira Cloud/Server Anda. API Token dapat dibuat di{' '}
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
                id.atlassian.com <ExternalLink size={10} />
              </a>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  <Globe size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Jira Domain / Host
                </label>
                <input
                  type="text"
                  placeholder="misal: perusahaan.atlassian.net"
                  value={jiraHost}
                  onChange={(e) => setJiraHost(e.target.value)}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  <User size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Email Akun Atlassian / Jira
                </label>
                <input
                  type="email"
                  placeholder="misal: developer@company.com"
                  value={jiraEmail}
                  onChange={(e) => setJiraEmail(e.target.value)}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  <Key size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Jira API Token / Personal Access Token
                </label>
                <input
                  type="password"
                  placeholder="Paste Jira API Token di sini"
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  className="input-field"
                  style={{ width: '100%' }}
                />
              </div>

              {jiraTestResult && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  background: jiraTestResult.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${jiraTestResult.success ? '#bbf7d0' : '#fecaca'}`,
                  color: jiraTestResult.success ? '#15803d' : '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {jiraTestResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{jiraTestResult.message}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={testJiraConnection}
              >
                Test Koneksi
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowJiraModal(false)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setShowJiraModal(false);
                    fetchJiraIssues();
                  }}
                >
                  Simpan & Sync
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
