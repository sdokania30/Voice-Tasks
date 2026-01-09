
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { MicIcon, StopIcon, TrashIcon, SpinnerIcon, CheckCircleIcon, EditIcon, UndoIcon, RedoIcon, CalendarIcon, ClockIcon, TagIcon, BellIcon, DownloadIcon, UploadIcon, CopyIcon, RefreshIcon, XCircleIcon, ChartBarIcon, SearchIcon, CreditCardIcon, MailIcon, ChevronDownIcon, PlusIcon, PaperAirplaneIcon } from './components/Icons';
import { Task, Priority, Subtask, ReminderOption, Trade, Tag, RecurringPayment, EmailLog } from './types';
import { processTranscriptToTasks, processTranscriptToTrades, processTranscriptToPayments } from './services/geminiService';
import { useSpeechRecognition, useResizablePanel, usePayments } from './hooks';

const RECORDING_DURATION_LIMIT = 30;
const TASKS_EXAMPLE = 'Pick up dry cleaning tomorrow at 6 pm and remind me 30 minutes before, prepare slides for Monday review, follow up with Abhay on budget EOD, and book dentist for next Friday morning.';
const TRADING_EXAMPLE = "Bought 100 shares of Tata Motors at 950 with 5% stop loss because of strong quarterly results";
const PAYMENTS_EXAMPLE = "Netflix subscription is 650 rupees due on the 5th, Gym fee 2000 due on 1st, and Rent 15000 due on the 10th.";

// --- Helper Functions ---

const formatDate = (isoString: string) => {
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        return `${day}${month}`; // Returns DDMMM (e.g., 07Dec)
    } catch {
        return isoString;
    }
};

const formatDateConcise = (whenString: string) => {
    try {
        // If it looks like an ISO date (YYYY-MM-DD), use formatDate
        if (whenString.match(/^\d{4}-\d{2}-\d{2}/)) {
            return formatDate(whenString);
        }

        // Try to extract date-like patterns (e.g., "Dec 7") and convert to DDMMM
        const dateMatch = whenString.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+\d{4})?/i);
        if (dateMatch) {
            const month = dateMatch[1].substring(0, 3);
            const day = String(dateMatch[2]).padStart(2, '0');
            return `${day}${month}`; // "Dec 7" -> "07Dec"
        }
        return whenString.replace('Tomorrow', 'Tmw').replace('Today', 'Today'); 
    } catch {
        return whenString;
    }
};

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDateTime = (isoString: string) => {
    try {
        return new Date(isoString).toLocaleString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit' 
        });
    } catch {
        return isoString;
    }
};

const formatCompactNumber = (num: number) => {
    if (num >= 100000) {
        return `₹${(num / 100000).toFixed(2)}L`;
    } else if (num >= 1000) {
        return `₹${(num / 1000).toFixed(1)}k`;
    }
    return `₹${num.toLocaleString()}`;
};

// --- Sub-Components ---

const TranscriptSection: React.FC<{
    title: string;
    transcript: string;
    setTranscript: (val: React.SetStateAction<string>) => void;
    isRecording: boolean;
    recordingTime: number;
    toggleRecording: () => void;
    isLoading: boolean;
    onProcess: () => void;
    onClear: () => void;
    placeholder: string;
}> = ({ title, transcript, setTranscript, isRecording, recordingTime, toggleRecording, isLoading, onProcess, onClear, placeholder }) => {
    const hasText = !!transcript.trim();

    return (
        <div className="flex flex-col flex-1 h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                    <MicIcon className="w-5 h-5 text-indigo-500" />
                    {title}
                </h2>
                <div className="text-xs font-mono text-slate-400">
                    {transcript.length} chars
                </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
                <textarea
                    className="flex-1 w-full h-full p-4 text-base sm:text-lg bg-white border-0 resize-none placeholder:text-slate-300 outline-none focus:ring-0"
                    placeholder={placeholder}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                />
            </div>
             {transcript && (
                <div className="px-4 pb-2 bg-white flex justify-end">
                     <button 
                        onClick={onClear}
                        className="text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
                        title="Clear transcript"
                    >
                        <XCircleIcon className="w-4 h-4" /> Clear
                    </button>
                </div>
            )}

            <div className="p-2 sm:p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2 flex-shrink-0">
                {!isRecording && !hasText && (
                    <button
                        onClick={toggleRecording}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold bg-white text-slate-800 border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
                    >
                        <MicIcon className="w-6 h-6 text-indigo-500" />
                        <span className="hidden sm:inline">Start Recording</span>
                    </button>
                )}

                {isRecording && (
                     <button
                        onClick={toggleRecording}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold bg-rose-500 text-white animate-pulse shadow-sm active:scale-95 transition-all"
                    >
                        <StopIcon className="w-6 h-6" />
                        <span className="hidden sm:inline">Stop Recording </span>
                        <span>({formatTime(recordingTime)})</span>
                    </button>
                )}

                {!isRecording && hasText && (
                    <>
                        <button
                            onClick={toggleRecording}
                            className="flex-none p-4 rounded-xl bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
                            title="Resume Recording"
                        >
                            <MicIcon className="w-6 h-6" />
                        </button>

                        <button
                            onClick={onProcess}
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <SpinnerIcon className="w-6 h-6 animate-spin" /> : <PaperAirplaneIcon className="w-6 h-6" />}
                            <span>{isLoading ? 'Processing...' : 'Process'}</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

const ReminderBanner: React.FC<{ payments: RecurringPayment[], status: string, recipientEmail: string, lastSentTo: string }> = ({ payments, status, recipientEmail, lastSentTo }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (status === 'sent' || status === 'already_sent') {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 5000);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(true);
        }
    }, [status]);

    if (!isVisible || payments.length === 0) return null;

    let bgColor = "bg-amber-100 border-amber-200 text-amber-900";
    let icon = <BellIcon className="w-5 h-5" />;
    
    const overdueCount = payments.filter(p => p.dueDay < new Date().getDate()).length;
    const tomorrowCount = payments.length - overdueCount;
    
    let message = `${payments.length} payment${payments.length > 1 ? 's' : ''} actionable.`;
    if (overdueCount > 0 && tomorrowCount > 0) message = `${overdueCount} overdue, ${tomorrowCount} due tomorrow.`;
    else if (overdueCount > 0) message = `${overdueCount} payment${overdueCount > 1 ? 's' : ''} OVERDUE.`;
    else message = `${tomorrowCount} payment${tomorrowCount > 1 ? 's' : ''} due tomorrow.`;

    let subMessage = "";

    if (status === 'sending') {
        bgColor = "bg-blue-100 border-blue-200 text-blue-900";
        icon = <SpinnerIcon className="w-5 h-5 animate-spin" />;
        subMessage = `Sending automatic emails to ${recipientEmail}...`;
    } else if (status === 'sent' || status === 'already_sent') {
        bgColor = "bg-green-100 border-green-200 text-green-900";
        icon = <CheckCircleIcon className="w-5 h-5" />;
        subMessage = `Reminders sent to ${lastSentTo || recipientEmail}`;
    } else if (status === 'missing_config') {
        bgColor = "bg-yellow-100 border-yellow-200 text-yellow-900";
        icon = <EditIcon className="w-5 h-5" />;
        subMessage = "Setup Required: Add EmailJS keys in services/emailService.ts";
    } else if (status === 'error') {
        bgColor = "bg-rose-100 border-rose-200 text-rose-900";
        icon = <XCircleIcon className="w-5 h-5" />;
        subMessage = "Failed to send auto-emails. Please check configuration.";
    }

    return (
        <div className={`${bgColor} border rounded-xl px-4 py-3 flex items-center justify-between gap-4 animate-fade-in relative z-20 mb-4 shadow-sm`}>
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-white/50 flex-shrink-0">
                    {icon}
                </div>
                <div>
                    <span className="font-bold block sm:inline mr-2">Payment Alert:</span>
                    <span>{message}</span>
                    <span className="block text-sm opacity-80">{subMessage}</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="hidden sm:block text-xs font-mono opacity-60">
                    {payments.map(p => p.serviceName).join(', ')}
                </div>
                <button 
                    onClick={() => setIsVisible(false)} 
                    className="p-1 hover:bg-black/10 rounded-full transition-colors"
                >
                    <XCircleIcon className="w-5 h-5 opacity-50" />
                </button>
            </div>
        </div>
    );
};

const ConfirmDialog: React.FC<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ isOpen, title, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full border border-slate-100 transform transition-all scale-100">
                <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
                <p className="text-sm text-slate-600 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm font-medium bg-rose-500 text-white rounded-lg hover:bg-rose-600 shadow-sm transition-all active:scale-95"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

const MobileTagIndicator: React.FC<{ tag?: Tag }> = ({ tag }) => {
    if (!tag) return null;
    let colorClass = "bg-slate-300"; 
    if (tag === Tag.WORK) colorClass = "bg-blue-500";
    else if (tag === Tag.PERSONAL) colorClass = "bg-green-500";
    else if (tag === Tag.OTHERS) colorClass = "bg-slate-400";

    return (
        <div className={`w-3 h-3 rounded-full ${colorClass}`} title={tag} />
    );
};

const MobilePriorityIndicator: React.FC<{ priority: Priority }> = ({ priority }) => {
    const letter = priority.charAt(0).toUpperCase();
    let colorClass = 'text-slate-600 bg-slate-100 border-slate-200';
    if (priority === Priority.URGENT) colorClass = 'text-rose-600 bg-rose-50 border-rose-200';
    else if (priority === Priority.HIGH) colorClass = 'text-orange-600 bg-orange-50 border-orange-200';
    else if (priority === Priority.MEDIUM) colorClass = 'text-blue-600 bg-blue-50 border-blue-200';

    return (
        <span className={`flex items-center justify-center w-6 h-6 text-xs font-bold rounded border ${colorClass}`}>
            {letter}
        </span>
    );
};

// --- Pages ---

const TasksPage: React.FC<{ panelWidth: number, handleMouseDown: () => void }> = ({ panelWidth, handleMouseDown }) => {
    const [transcript, setTranscript] = useState<string>(() => {
        // Only show example on first ever load
        const hasVisited = typeof localStorage !== 'undefined' && localStorage.getItem('hasVisitedTasks');
        return hasVisited ? '' : TASKS_EXAMPLE;
    });

    useEffect(() => {
        // Mark as visited so subsequent loads show placeholder instead of value
        localStorage.setItem('hasVisitedTasks', 'true');
    }, []);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTag, setFilterTag] = useState<Tag | 'All'>('All');
    const [filterPriority, setFilterPriority] = useState<Priority | 'All'>('All');
    const [showCompleted, setShowCompleted] = useState(true);
    const [sortBy, setSortBy] = useState<'Date' | 'Priority' | 'Newest'>('Newest');
    
    const [tasks, setTasks] = useState<Task[]>(() => {
        try { return JSON.parse(localStorage.getItem('voice-to-tasks') || '[]'); } catch { return []; }
    });
    const [history, setHistory] = useState<Task[][]>([tasks]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Task>>({});
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

    const handleSetTranscript = useCallback((valOrUpdater: React.SetStateAction<string>) => {
        setTranscript(prev => {
             const newVal = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
             if (prev === TASKS_EXAMPLE) {
                 return newVal.replace(TASKS_EXAMPLE, '').trim();
             }
             return newVal;
        });
    }, []);
    
    const { isRecording, recordingTime, toggleRecording } = useSpeechRecognition(handleSetTranscript, RECORDING_DURATION_LIMIT);

    useEffect(() => {
        localStorage.setItem('voice-to-tasks', JSON.stringify(tasks));
    }, [tasks]);

    const updateTasksWithHistory = (newTasks: Task[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newTasks);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setTasks(newTasks);
    };

    const undo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setTasks(history[historyIndex - 1]);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setTasks(history[historyIndex + 1]);
        }
    };

    const handleProcess = async () => {
        setIsLoading(true);
        const newRawTasks = await processTranscriptToTasks(transcript);
        
        const newTasks: Task[] = newRawTasks.map(t => ({
            id: t.id || Math.random().toString(36),
            title: t.title || 'Untitled',
            when: t.when || 'Unscheduled',
            priority: t.priority || Priority.MEDIUM,
            tag: t.tag,
            isCompleted: false,
            rawText: t.rawText || '',
            subtasks: t.subtasks?.map((st: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                title: st.title,
                isCompleted: false
            })) || [],
            reminder: t.reminder
        }));

        updateTasksWithHistory([...newTasks, ...tasks]);
        setTranscript('');
        setIsLoading(false);
    };

    const toggleComplete = (id: string) => {
        updateTasksWithHistory(tasks.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? new Date().toISOString() : undefined } : t));
    };

    const toggleSubtask = (taskId: string, subtaskId: string) => {
        updateTasksWithHistory(tasks.map(t => {
            if (t.id === taskId) {
                return {
                    ...t,
                    subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st)
                };
            }
            return t;
        }));
    };

    const toggleSubtaskExpand = (taskId: string) => {
        setExpandedTaskIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    const confirmDelete = () => {
        if (deleteConfirmation) {
            updateTasksWithHistory(tasks.filter(t => t.id !== deleteConfirmation));
            setDeleteConfirmation(null);
        }
    };

    const startEdit = (task: Task) => {
        setEditingId(task.id);
        setEditForm(JSON.parse(JSON.stringify(task))); 
    };

    const saveEdit = () => {
        if (!editingId || !editForm) return;
        updateTasksWithHistory(tasks.map(t => t.id === editingId ? { ...t, ...editForm } as Task : t));
        setEditingId(null);
    };

    const handleAddSubtaskToEdit = () => {
        const newSubtask: Subtask = { id: Math.random().toString(36).substr(2, 9), title: '', isCompleted: false };
        setEditForm(prev => ({ ...prev, subtasks: [...(prev.subtasks || []), newSubtask] }));
    };

    const handleUpdateSubtaskInEdit = (index: number, title: string) => {
        const newSubtasks = [...(editForm.subtasks || [])];
        newSubtasks[index] = { ...newSubtasks[index], title };
        setEditForm(prev => ({ ...prev, subtasks: newSubtasks }));
    };

    const handleRemoveSubtaskFromEdit = (index: number) => {
        const newSubtasks = [...(editForm.subtasks || [])];
        newSubtasks.splice(index, 1);
        setEditForm(prev => ({ ...prev, subtasks: newSubtasks }));
    };

    const getPriorityColor = (p: Priority) => {
        switch (p) {
            case Priority.URGENT: return 'text-rose-600 bg-rose-50 border-rose-200';
            case Priority.HIGH: return 'text-orange-600 bg-orange-50 border-orange-200';
            case Priority.MEDIUM: return 'text-blue-600 bg-blue-50 border-blue-200';
            default: return 'text-slate-600 bg-slate-50 border-slate-200';
        }
    };

    const filteredTasks = useMemo(() => {
        let result = tasks;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(task => 
                task.title.toLowerCase().includes(query) ||
                (task.rawText && task.rawText.toLowerCase().includes(query)) ||
                (task.tag && task.tag.toLowerCase().includes(query))
            );
        }

        if (filterTag !== 'All') {
            result = result.filter(t => t.tag === filterTag);
        }
        if (filterPriority !== 'All') {
            result = result.filter(t => t.priority === filterPriority);
        }
        
        return result.sort((a, b) => {
            if (sortBy === 'Priority') {
                const priorityWeight = { [Priority.URGENT]: 4, [Priority.HIGH]: 3, [Priority.MEDIUM]: 2, [Priority.LOW]: 1 };
                return priorityWeight[b.priority] - priorityWeight[a.priority];
            } else if (sortBy === 'Date') {
                return (a.when || 'z').localeCompare(b.when || 'z');
            } else {
                return 0; 
            }
        });
    }, [tasks, searchQuery, filterTag, filterPriority, sortBy]);

    const activeTasks = useMemo(() => filteredTasks.filter(t => !t.isCompleted), [filteredTasks]);
    const completedTasks = useMemo(() => filteredTasks.filter(t => t.isCompleted), [filteredTasks]);

    return (
        <div className="flex flex-col sm:flex-row h-auto sm:h-full overflow-visible sm:overflow-hidden bg-slate-50">
            <ConfirmDialog 
                isOpen={!!deleteConfirmation} 
                title="Delete Task" 
                message="Are you sure you want to delete this task? This action cannot be undone."
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmation(null)}
            />

            <div style={{ '--panel-width': `${panelWidth}%` } as React.CSSProperties} className="w-full sm:w-[var(--panel-width)] flex-none sm:flex-col p-2 sm:p-4 z-10">
                <TranscriptSection 
                    title="Task Transcript"
                    transcript={transcript}
                    setTranscript={setTranscript}
                    isRecording={isRecording}
                    recordingTime={recordingTime}
                    toggleRecording={toggleRecording}
                    isLoading={isLoading}
                    onProcess={handleProcess}
                    onClear={() => setTranscript('')}
                    placeholder={TASKS_EXAMPLE}
                />
            </div>

            <div 
                className="hidden sm:flex w-4 items-center justify-center cursor-col-resize group z-10 hover:bg-indigo-50/50 transition-colors"
                onMouseDown={handleMouseDown}
            >
                <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition-colors" />
            </div>

            <div style={{ '--panel-width': `${100 - panelWidth}%` } as React.CSSProperties} className="flex-1 relative overflow-hidden bg-slate-50 h-auto sm:h-full">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-auto sm:h-full overflow-visible sm:overflow-hidden m-2 sm:m-4 mt-0 sm:mt-4">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-slate-700">Inbox</h2>
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">{activeTasks.length}</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={undo} disabled={historyIndex <= 0} className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-30"><UndoIcon className="w-5 h-5"/></button>
                            <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-30"><RedoIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 p-4 border-b border-slate-100 bg-white">
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search tasks..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder:text-slate-400 bg-slate-50 focus:bg-white"
                            />
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 hover:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-slate-600 cursor-pointer"
                                    value={filterTag}
                                    onChange={(e) => setFilterTag(e.target.value as Tag | 'All')}
                                >
                                    <option value="All">All Tags</option>
                                    {Object.values(Tag).map(tag => <option key={tag} value={tag}>{tag}</option>)}
                                </select>
                                <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>

                            <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 hover:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-slate-600 cursor-pointer"
                                    value={filterPriority}
                                    onChange={(e) => setFilterPriority(e.target.value as Priority | 'All')}
                                >
                                    <option value="All">All Priorities</option>
                                    {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>

                            <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 hover:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-slate-600 cursor-pointer"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                >
                                    <option value="Newest">Newest First</option>
                                    <option value="Priority">By Priority</option>
                                    <option value="Date">By Due Date</option>
                                </select>
                                <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                            </div>

                            <div className="ml-auto flex items-center">
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-500 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={showCompleted} 
                                        onChange={(e) => setShowCompleted(e.target.checked)}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                    />
                                    Show Completed
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-visible sm:overflow-y-auto p-2 space-y-3 custom-scrollbar h-auto sm:h-full">
                        {tasks.length === 0 ? (
                            <div className="h-32 sm:h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <CheckCircleIcon className="w-8 h-8 opacity-20" />
                                </div>
                                <p>No tasks yet. Start speaking or typing!</p>
                            </div>
                        ) : filteredTasks.length === 0 ? (
                            <div className="h-32 sm:h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                <p>No tasks found matching filters.</p>
                            </div>
                        ) : (
                            <>
                                {activeTasks.map(task => (
                                    <div key={task.id} className="group bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md transition-all">
                                        {editingId === task.id ? (
                                            <div className="space-y-3">
                                                <input 
                                                    className="w-full font-semibold p-2 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none" 
                                                    value={editForm.title || ''} 
                                                    onChange={e => setEditForm({...editForm, title: e.target.value})} 
                                                    placeholder="Task Title"
                                                />
                                                <div className="flex gap-2">
                                                    <input 
                                                        className="flex-1 text-sm p-2 border rounded-lg"
                                                        value={editForm.when || ''}
                                                        onChange={e => setEditForm({...editForm, when: e.target.value})}
                                                        placeholder="When (e.g. Tomorrow 5pm)"
                                                    />
                                                     <select 
                                                        className="text-sm p-2 border rounded-lg"
                                                        value={editForm.priority}
                                                        onChange={e => setEditForm({...editForm, priority: e.target.value as Priority})}
                                                    >
                                                        {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                                                    </select>
                                                </div>

                                                <div className="mt-3 space-y-2 bg-slate-50 p-2 rounded-lg">
                                                    <label className="text-xs font-bold text-slate-400 uppercase">Subtasks</label>
                                                    {editForm.subtasks?.map((st, index) => (
                                                        <div key={st.id || index} className="flex items-center gap-2">
                                                            <input 
                                                                className="flex-1 text-sm p-1.5 border rounded bg-white focus:ring-1 focus:ring-indigo-100 outline-none"
                                                                value={st.title}
                                                                onChange={(e) => handleUpdateSubtaskInEdit(index, e.target.value)}
                                                                placeholder="Subtask..."
                                                            />
                                                            <button onClick={() => handleRemoveSubtaskFromEdit(index)} className="text-slate-400 hover:text-rose-500">
                                                                <XCircleIcon className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button onClick={handleAddSubtaskToEdit} className="text-xs flex items-center gap-1 text-indigo-600 font-medium hover:bg-indigo-100 px-2 py-1 rounded transition-colors w-full justify-center">
                                                        <PlusIcon className="w-3 h-3" /> Add Subtask
                                                    </button>
                                                </div>

                                                <div className="flex justify-end gap-2 mt-2">
                                                    <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded">Cancel</button>
                                                    <button onClick={saveEdit} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start gap-3">
                                                <button 
                                                    onClick={() => toggleComplete(task.id)}
                                                    className="mt-1 w-5 h-5 rounded-full border-2 border-slate-300 hover:border-indigo-400 flex items-center justify-center transition-colors flex-shrink-0"
                                                />
                                                
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between">
                                                        <h3 className="font-medium text-slate-800 break-words leading-tight">
                                                            {task.title}
                                                        </h3>
                                                        <div className="flex items-center gap-2 sm:hidden ml-2 flex-shrink-0">
                                                            <MobileTagIndicator tag={task.tag} />
                                                            <MobilePriorityIndicator priority={task.priority} />
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                                                        {task.when && (
                                                            <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md whitespace-nowrap">
                                                                <CalendarIcon className="w-3 h-3" />
                                                                <span className="sm:hidden">{formatDateConcise(task.when)}</span>
                                                                <span className="hidden sm:inline">{task.when}</span>
                                                            </span>
                                                        )}
                                                        <span className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-md border ${getPriorityColor(task.priority)}`}>
                                                            <ClockIcon className="w-3 h-3" />
                                                            {task.priority}
                                                        </span>
                                                        {task.tag && (
                                                            <span className="hidden sm:flex items-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md">
                                                                <TagIcon className="w-3 h-3" />
                                                                {task.tag}
                                                            </span>
                                                        )}
                                                        {task.reminder && (
                                                            <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                                                                <BellIcon className="w-3 h-3" />
                                                                {task.reminder}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {task.subtasks && task.subtasks.length > 0 && (
                                                        <div className="mt-2">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); toggleSubtaskExpand(task.id); }}
                                                                className="flex items-center gap-1 text-xs text-indigo-600 font-medium hover:underline focus:outline-none"
                                                            >
                                                                <ChevronDownIcon className={`w-3 h-3 transition-transform ${expandedTaskIds.has(task.id) ? 'rotate-180' : ''}`} />
                                                                {expandedTaskIds.has(task.id) ? 'Hide Subtasks' : `${task.subtasks.length} Subtasks`}
                                                            </button>
                                                            
                                                            {expandedTaskIds.has(task.id) && (
                                                                <div className="mt-2 pl-1 space-y-1 animate-fade-in">
                                                                    {task.subtasks.map(st => (
                                                                        <div 
                                                                            key={st.id} 
                                                                            className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer group/sub"
                                                                            onClick={() => toggleSubtask(task.id, st.id)}
                                                                        >
                                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${st.isCompleted ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 group-hover/sub:border-indigo-400'} flex-shrink-0`}>
                                                                                {st.isCompleted && <CheckCircleIcon className="w-3 h-3 text-white" />}
                                                                            </div>
                                                                            <span className={`transition-all ${st.isCompleted ? 'line-through opacity-50' : ''}`}>{st.title}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => startEdit(task)} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><EditIcon className="w-4 h-4" /></button>
                                                    <button onClick={() => setDeleteConfirmation(task.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {showCompleted && completedTasks.length > 0 && (
                                    <div className="mt-8">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="h-px bg-slate-200 flex-1"></div>
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Tasks ({completedTasks.length})</h3>
                                            <div className="h-px bg-slate-200 flex-1"></div>
                                        </div>
                                        <div className="space-y-3 opacity-70">
                                            {completedTasks.map(task => (
                                                <div key={task.id} className="group bg-slate-50 border border-slate-100 rounded-xl p-4 transition-all hover:bg-white hover:shadow-sm">
                                                    <div className="flex items-start gap-3">
                                                        <button 
                                                            onClick={() => toggleComplete(task.id)}
                                                            className="mt-1 w-5 h-5 rounded-full bg-green-500 border-2 border-green-500 text-white flex items-center justify-center transition-colors flex-shrink-0"
                                                        >
                                                            <CheckCircleIcon className="w-3 h-3" />
                                                        </button>
                                                        
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-medium text-slate-500 line-through break-words">
                                                                {task.title}
                                                            </h3>
                                                            {task.completedAt && (
                                                                <p className="text-xs text-slate-400 mt-1">Completed on {formatDateTime(task.completedAt)}</p>
                                                            )}
                                                        </div>

                                                        <button onClick={() => setDeleteConfirmation(task.id)} className="p-1 text-slate-300 hover:text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"><TrashIcon className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const PaymentsPage: React.FC<{ 
    panelWidth: number, 
    handleMouseDown: () => void,
    paymentsData: ReturnType<typeof usePayments>
}> = ({ panelWidth, handleMouseDown, paymentsData }) => {
    const { payments, addPayment, deletePayment, editPayment, togglePaymentStatus, recipientEmail, setRecipientEmail, emailLogs } = paymentsData;
    
    // Updated: Initialize transcript with example only on first visit
    const [transcript, setTranscript] = useState(() => {
        const hasVisited = typeof localStorage !== 'undefined' && localStorage.getItem('hasVisitedPayments');
        return hasVisited ? '' : PAYMENTS_EXAMPLE;
    });

    useEffect(() => {
        localStorage.setItem('hasVisitedPayments', 'true');
    }, []);

    const [isLoading, setIsLoading] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<RecurringPayment>>({});

    // Updated: Handle transcript changes to clear example text when user starts inputting
    const handleSetTranscript = useCallback((valOrUpdater: React.SetStateAction<string>) => {
        setTranscript(prev => {
             const newVal = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
             if (prev === PAYMENTS_EXAMPLE) {
                 return newVal.replace(PAYMENTS_EXAMPLE, '').trim();
             }
             return newVal;
        });
    }, []);

    const { isRecording, recordingTime, toggleRecording } = useSpeechRecognition(handleSetTranscript, RECORDING_DURATION_LIMIT);

    const handleProcess = async () => {
        setIsLoading(true);
        const extracted = await processTranscriptToPayments(transcript);
        extracted.forEach(p => {
            if (p.serviceName && p.amount && p.dueDay) {
                addPayment({
                    ...p,
                    id: p.id || Math.random().toString(36),
                    serviceName: p.serviceName,
                    amount: p.amount,
                    dueDay: p.dueDay
                } as RecurringPayment);
            }
        });
        setTranscript('');
        setIsLoading(false);
    };

    const confirmDelete = () => {
        if (deleteConfirmation) {
            deletePayment(deleteConfirmation);
            setDeleteConfirmation(null);
        }
    };

    const startEdit = (payment: RecurringPayment) => {
        setEditingId(payment.id);
        setEditForm({ ...payment });
    };

    const saveEdit = () => {
        if (editingId && editForm) {
            editPayment(editingId, editForm);
            setEditingId(null);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const sortedPayments = useMemo(() => {
        return [...payments].sort((a, b) => a.dueDay - b.dueDay);
    }, [payments]);

    const getDueInString = (dueDay: number, lastPaidDate?: string) => {
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        const isPaidThisMonth = lastPaidDate && 
                                new Date(lastPaidDate).getMonth() === currentMonth && 
                                new Date(lastPaidDate).getFullYear() === currentYear;

        if (isPaidThisMonth) return <span className="text-green-600 font-medium">Paid</span>;

        if (dueDay === currentDay) return <span className="text-amber-600 font-bold">Today</span>;
        
        let diff = dueDay - currentDay;
        
        if (diff < 0) {
             return <span className="text-rose-600 font-bold">Overdue-{Math.abs(diff)}D</span>;
        } else if (diff === 1) {
             return <span className="text-indigo-600 font-bold">Tomorrow</span>;
        } else {
             return <span className="text-slate-500">{diff} days</span>;
        }
    };

    return (
        <div className="flex flex-col sm:flex-row h-auto sm:h-full overflow-visible sm:overflow-hidden bg-slate-50">
             <ConfirmDialog 
                isOpen={!!deleteConfirmation} 
                title="Delete Payment" 
                message="Are you sure you want to delete this payment?"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmation(null)}
            />

             <div style={{ '--panel-width': `${panelWidth}%` } as React.CSSProperties} className="w-full sm:w-[var(--panel-width)] flex-none sm:flex-col p-2 sm:p-4 z-10">
                <TranscriptSection 
                    title="Payment Transcript"
                    transcript={transcript}
                    setTranscript={setTranscript}
                    isRecording={isRecording}
                    recordingTime={recordingTime}
                    toggleRecording={toggleRecording}
                    isLoading={isLoading}
                    onProcess={handleProcess}
                    onClear={() => setTranscript('')}
                    placeholder={PAYMENTS_EXAMPLE}
                />
            </div>
             <div 
                className="hidden sm:flex w-4 items-center justify-center cursor-col-resize group z-10 hover:bg-indigo-50/50 transition-colors"
                onMouseDown={handleMouseDown}
            >
                <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition-colors" />
            </div>

            <div style={{ '--panel-width': `${100 - panelWidth}%` } as React.CSSProperties} className="flex-1 relative overflow-hidden bg-slate-50 h-auto sm:h-full">
                 <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-auto sm:h-full overflow-visible sm:overflow-hidden m-2 sm:m-4 mt-0 sm:mt-4">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
                         <div className="flex justify-between items-center">
                            <h2 className="font-semibold text-slate-700">Recurring Payments</h2>
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">{payments.length}</span>
                         </div>
                         <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                            <MailIcon className="w-4 h-4 text-slate-400" />
                            <input 
                                className="flex-1 text-sm outline-none text-slate-600 placeholder:text-slate-300"
                                placeholder="Recipient Email for Reminders"
                                value={recipientEmail}
                                onChange={(e) => setRecipientEmail(e.target.value)}
                            />
                         </div>
                    </div>
                    
                    <div className="flex-1 overflow-visible sm:overflow-y-auto p-0 sm:p-4 space-y-3 custom-scrollbar h-auto sm:h-full">
                         {payments.length === 0 ? (
                             <div className="h-32 sm:h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                <p>No payments configured.</p>
                            </div>
                        ) : (
                            // Updated: Cleaner scroll container structure
                            <div className="w-full overflow-x-auto shadow-sm rounded-lg border border-slate-200">
                                <div className="min-w-[600px]">
                                    <table className="min-w-full divide-y divide-slate-200">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-16">Day</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Service</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Due In</th>
                                                <th scope="col" className="px-3 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-20">Status</th>
                                                <th scope="col" className="px-3 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider w-16">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-200">
                                            {sortedPayments.map((payment) => (
                                                <tr key={payment.id} className="hover:bg-slate-50 transition-colors">
                                                    {editingId === payment.id ? (
                                                        <>
                                                            <td className="px-3 py-3 whitespace-nowrap">
                                                                <input 
                                                                    type="number" 
                                                                    min="1" max="31"
                                                                    className="w-12 p-1 border rounded text-sm text-center"
                                                                    value={editForm.dueDay} 
                                                                    onChange={(e) => setEditForm({...editForm, dueDay: parseInt(e.target.value)})}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap">
                                                                <input 
                                                                    className="w-full p-1 border rounded text-sm"
                                                                    value={editForm.serviceName} 
                                                                    onChange={(e) => setEditForm({...editForm, serviceName: e.target.value})}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap">
                                                                <input 
                                                                    type="number"
                                                                    className="w-20 p-1 border rounded text-sm"
                                                                    value={editForm.amount} 
                                                                    onChange={(e) => setEditForm({...editForm, amount: parseFloat(e.target.value)})}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-400">
                                                                -
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-center">
                                                                -
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={saveEdit} className="text-green-600 hover:text-green-800"><CheckCircleIcon className="w-5 h-5" /></button>
                                                                    <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600"><XCircleIcon className="w-5 h-5" /></button>
                                                                </div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="px-3 py-3 whitespace-nowrap">
                                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                                                                    {payment.dueDay}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap">
                                                                <div className="text-sm font-medium text-slate-900">{payment.serviceName}</div>
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap">
                                                                <div className="text-sm font-mono font-bold text-slate-700">₹{payment.amount}</div>
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-xs">
                                                                {getDueInString(payment.dueDay, payment.lastPaidDate)}
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-center">
                                                                <button 
                                                                    onClick={() => togglePaymentStatus(payment.id)}
                                                                    className={`px-2 py-1 rounded text-xs font-bold border ${
                                                                        payment.lastPaidDate && 
                                                                        new Date(payment.lastPaidDate).getMonth() === new Date().getMonth()
                                                                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                                        : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                                    }`}
                                                                >
                                                                    <span className="sm:hidden">
                                                                        {payment.lastPaidDate && new Date(payment.lastPaidDate).getMonth() === new Date().getMonth() ? 'D' : 'P'}
                                                                    </span>
                                                                    <span className="hidden sm:inline">
                                                                        {payment.lastPaidDate && new Date(payment.lastPaidDate).getMonth() === new Date().getMonth() ? 'Done' : 'Pending'}
                                                                    </span>
                                                                </button>
                                                            </td>
                                                            <td className="px-3 py-3 whitespace-nowrap text-right">
                                                                <div className="flex justify-end gap-2">
                                                                    <button onClick={() => startEdit(payment)} className="text-slate-400 hover:text-indigo-600"><EditIcon className="w-4 h-4" /></button>
                                                                    <button onClick={() => setDeleteConfirmation(payment.id)} className="text-slate-400 hover:text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                                                </div>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="h-auto sm:h-1/3 border-t border-slate-200 bg-slate-50 flex flex-col">
                        <div className="p-2 px-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">Email Log</div>
                        <div className="flex-1 overflow-visible sm:overflow-y-auto p-2 space-y-1 h-auto sm:h-full">
                            {emailLogs.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No emails sent yet.</p>}
                            {emailLogs.map(log => (
                                <div key={log.id} className="text-xs flex justify-between items-center p-2 bg-white rounded border border-slate-100">
                                    <span className={log.status === 'success' ? 'text-green-600' : 'text-rose-600'}>
                                        {log.status === 'success' ? 'Sent' : 'Failed'} to {log.serviceName}
                                    </span>
                                    <span className="text-slate-400">{formatDateTime(log.sentAt)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                 </div>
            </div>
        </div>
    );
};

const TradingPage: React.FC<{ panelWidth: number, handleMouseDown: () => void }> = ({ panelWidth, handleMouseDown }) => {
    const [trades, setTrades] = useState<Trade[]>(() => {
        try { return JSON.parse(localStorage.getItem('voice-to-trades') || '[]'); } catch { return []; }
    });
    
    // Only show example on first ever load
    const [transcript, setTranscript] = useState(() => {
        const hasVisited = typeof localStorage !== 'undefined' && localStorage.getItem('hasVisitedTrading');
        return hasVisited ? '' : TRADING_EXAMPLE;
    });

    useEffect(() => {
        localStorage.setItem('hasVisitedTrading', 'true');
    }, []);

    const [isLoading, setIsLoading] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Trade>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTradeIds, setSelectedTradeIds] = useState<Set<string>>(new Set());
    
    useEffect(() => {
        localStorage.setItem('voice-to-trades', JSON.stringify(trades));
    }, [trades]);

    const handleSetTranscript = useCallback((valOrUpdater: React.SetStateAction<string>) => {
        setTranscript(prev => {
             const newVal = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
             if (prev === TRADING_EXAMPLE) {
                 return newVal.replace(TRADING_EXAMPLE, '').trim();
             }
             return newVal;
        });
    }, []);

    const { isRecording, recordingTime, toggleRecording } = useSpeechRecognition(handleSetTranscript, RECORDING_DURATION_LIMIT);

    const handleProcess = async () => {
        setIsLoading(true);
        const processedTrades = await processTranscriptToTrades(transcript);
        const newTrades = processedTrades.map(t => ({
             ...t,
             id: t.id || Math.random().toString(36),
             stockName: t.stockName || 'Unknown',
             entryPrice: t.entryPrice || 0,
             quantity: t.quantity || 0,
             stopLoss: t.stopLoss || 0,
             entryDate: t.entryDate || new Date().toISOString(),
             reason: t.reason || ''
        })) as Trade[];
        
        setTrades(prev => [...newTrades, ...prev]);
        setTranscript('');
        setIsLoading(false);
    };

    const confirmDelete = () => {
        if (deleteConfirmation) {
            setTrades(prev => prev.filter(t => t.id !== deleteConfirmation));
            setSelectedTradeIds(prev => {
                const next = new Set(prev);
                next.delete(deleteConfirmation);
                return next;
            });
            setDeleteConfirmation(null);
        }
    };

    const startEdit = (trade: Trade) => {
        if (editingId) return; // Already editing something
        setEditingId(trade.id);
        setEditForm({ ...trade });
    };

    const saveEdit = () => {
        if (!editingId || !editForm) return;
        setTrades(prev => prev.map(t => t.id === editingId ? { ...t, ...editForm } as Trade : t));
        setEditingId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const filteredTrades = useMemo(() => {
        return trades.filter(t => 
            t.stockName.toLowerCase().includes(searchQuery.toLowerCase()) || 
            t.reason.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [trades, searchQuery]);

    const toggleSelectAll = () => {
        if (selectedTradeIds.size === filteredTrades.length && filteredTrades.length > 0) {
            setSelectedTradeIds(new Set());
        } else {
            setSelectedTradeIds(new Set(filteredTrades.map(t => t.id)));
        }
    };

    const toggleSelectRow = (id: string) => {
        setSelectedTradeIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Use selected trades if any, otherwise use all filtered trades
    const tradesToCopy = useMemo(() => {
        if (selectedTradeIds.size > 0) {
            return filteredTrades.filter(t => selectedTradeIds.has(t.id));
        }
        return filteredTrades;
    }, [filteredTrades, selectedTradeIds]);

    const handleCopyAllExcel = () => {
        if (tradesToCopy.length === 0) return;
        const headers = "Date\tStock\tPrice\tQty\tSL\tTotal\tReason";
        const rows = tradesToCopy.map(t => 
            `${new Date(t.entryDate).toISOString().split('T')[0]}\t${t.stockName}\t${t.entryPrice}\t${t.quantity}\t${t.stopLoss}\t${t.entryPrice * t.quantity}\t${t.reason}`
        ).join('\n');
        navigator.clipboard.writeText(`${headers}\n${rows}`);
        alert(`${tradesToCopy.length} trades copied for Excel!`);
    };

    const handleCopyAllWhatsApp = () => {
        if (tradesToCopy.length === 0) return;
        const text = tradesToCopy.map(t => 
            `*${t.stockName}* (${formatDate(t.entryDate)})\nEntry: ₹${t.entryPrice} x ${t.quantity} | SL: ${t.stopLoss}%\nReason: ${t.reason}`
        ).join('\n\n');
        navigator.clipboard.writeText(`*Trade Journal Summary*\n\n${text}`);
        alert(`${tradesToCopy.length} trades copied for WhatsApp!`);
    };

    return (
        <div className="flex flex-col sm:flex-row h-auto sm:h-full overflow-visible sm:overflow-hidden bg-slate-50">
            <ConfirmDialog 
                isOpen={!!deleteConfirmation} 
                title="Delete Trade" 
                message="Are you sure you want to delete this trade?"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmation(null)}
            />

             <div style={{ '--panel-width': `${panelWidth}%` } as React.CSSProperties} className="w-full sm:w-[var(--panel-width)] flex-none sm:flex-col p-2 sm:p-4 z-10">
                <TranscriptSection 
                    title="Trade Transcript"
                    transcript={transcript}
                    setTranscript={setTranscript}
                    isRecording={isRecording}
                    recordingTime={recordingTime}
                    toggleRecording={toggleRecording}
                    isLoading={isLoading}
                    onProcess={handleProcess}
                    onClear={() => setTranscript('')}
                    placeholder={TRADING_EXAMPLE}
                />
            </div>
            
            <div 
                className="hidden sm:flex w-4 items-center justify-center cursor-col-resize group z-10 hover:bg-indigo-50/50 transition-colors"
                onMouseDown={handleMouseDown}
            >
                <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-indigo-400 transition-colors" />
            </div>

            <div style={{ '--panel-width': `${100 - panelWidth}%` } as React.CSSProperties} className="flex-1 relative overflow-hidden bg-slate-50 h-auto sm:h-full">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-auto sm:h-full overflow-visible sm:overflow-hidden m-2 sm:m-4 mt-0 sm:mt-4">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                         <h2 className="font-semibold text-slate-700">Trade Journal</h2>
                         <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">{filteredTrades.length}</span>
                    </div>

                    <div className="p-2 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3">
                         <div className="relative flex-1">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search trades..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all placeholder:text-slate-400 bg-white"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleCopyAllExcel} 
                                title="Copy in Excel format (Tab separated)"
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors"
                            >
                                <CopyIcon className="w-4 h-4" /> <span className="hidden sm:inline">{selectedTradeIds.size > 0 ? 'Copy Selected' : 'Copy All'}</span>
                            </button>
                             <button 
                                onClick={handleCopyAllWhatsApp} 
                                title="Copy in WhatsApp format (Bold/Formatted)"
                                className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors"
                            >
                                <PaperAirplaneIcon className="w-4 h-4" /> <span className="hidden sm:inline">{selectedTradeIds.size > 0 ? 'Copy Selected' : 'Copy All'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-visible sm:overflow-y-auto p-0 sm:p-2 space-y-3 custom-scrollbar h-auto sm:h-full">
                        {trades.length === 0 ? (
                             <div className="h-32 sm:h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                <p>No trades recorded yet.</p>
                            </div>
                        ) : (
                            <div className="w-full overflow-x-auto shadow-sm rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th scope="col" className="px-1 py-2 text-center w-8 whitespace-nowrap">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                                    checked={filteredTrades.length > 0 && selectedTradeIds.size === filteredTrades.length}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th scope="col" className="px-1 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                                            <th scope="col" className="px-1 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Stock</th>
                                            <th scope="col" className="px-1 py-2 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Price</th>
                                            <th scope="col" className="px-1 py-2 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Qty</th>
                                            <th scope="col" className="px-1 py-2 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">SL</th>
                                            <th scope="col" className="px-1 py-2 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                                            <th scope="col" className="px-1 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Reason</th>
                                            <th scope="col" className="px-1 py-2 w-8 whitespace-nowrap"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {filteredTrades.map((trade) => (
                                            <tr 
                                                key={trade.id} 
                                                className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                                                onClick={() => startEdit(trade)}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                tabIndex={0}
                                            >
                                                <td className="px-1 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                                        checked={selectedTradeIds.has(trade.id)}
                                                        onChange={() => toggleSelectRow(trade.id)}
                                                    />
                                                </td>
                                                {editingId === trade.id ? (
                                                    <>
                                                        <td className="px-1 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="date" className="w-24 p-1 border rounded text-xs"
                                                                value={editForm.entryDate ? editForm.entryDate.split('T')[0] : ''}
                                                                onChange={e => setEditForm({...editForm, entryDate: new Date(e.target.value).toISOString()})}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                className="w-20 p-1 border rounded text-xs font-bold"
                                                                value={editForm.stockName}
                                                                onChange={e => setEditForm({...editForm, stockName: e.target.value})}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="number" className="w-16 p-1 border rounded text-xs text-right"
                                                                value={editForm.entryPrice}
                                                                onChange={e => setEditForm({...editForm, entryPrice: parseFloat(e.target.value)})}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="number" className="w-12 p-1 border rounded text-xs text-right"
                                                                value={editForm.quantity}
                                                                onChange={e => setEditForm({...editForm, quantity: parseInt(e.target.value)})}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                type="number" className="w-12 p-1 border rounded text-xs text-right"
                                                                value={editForm.stopLoss}
                                                                onChange={e => setEditForm({...editForm, stopLoss: parseFloat(e.target.value)})}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right text-xs text-slate-400">
                                                            -
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                            <input 
                                                                className="w-full p-1 border rounded text-[11px]"
                                                                value={editForm.reason}
                                                                onChange={e => setEditForm({...editForm, reason: e.target.value})}
                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                            />
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex justify-end gap-2">
                                                                <button onClick={saveEdit} className="text-green-600 hover:text-green-800"><CheckCircleIcon className="w-4 h-4" /></button>
                                                                <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600"><XCircleIcon className="w-4 h-4" /></button>
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-1 py-2 whitespace-nowrap text-xs text-slate-500">
                                                            <span className="sm:hidden">{formatDateConcise(trade.entryDate)}</span>
                                                            <span className="hidden sm:inline">{formatDate(trade.entryDate)}</span>
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap pr-0" title={trade.stockName}>
                                                            <div className="text-xs font-bold text-slate-800">
                                                                {trade.stockName}
                                                            </div>
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right font-mono text-xs pl-1">
                                                            ₹{trade.entryPrice}
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right font-mono text-xs">
                                                            {trade.quantity}
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right font-mono text-xs text-rose-600">
                                                            {trade.stopLoss}%
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right font-mono text-xs font-bold text-slate-700">
                                                            {formatCompactNumber(trade.entryPrice * trade.quantity)}
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-[11px] text-slate-500 italic max-w-xs truncate" title={trade.reason}>
                                                            {trade.reason}
                                                        </td>
                                                        <td className="px-1 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                                            <button onClick={() => setDeleteConfirmation(trade.id)} className="p-1 text-slate-300 hover:text-rose-500"><TrashIcon className="w-4 h-4" /></button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [currentPage, setCurrentPage] = useState<'tasks' | 'trading' | 'payments'>('tasks');
    const [tradingEnabled, setTradingEnabled] = useState(false);
    const { panelWidth, handleMouseDown } = useResizablePanel(60);
    const paymentsData = usePayments();

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
            <Header 
                currentPage={currentPage} 
                onNavigate={setCurrentPage} 
                tradingEnabled={tradingEnabled} 
                onToggleTrading={() => setTradingEnabled(!tradingEnabled)} 
            />
            {/* Main Content Area - Updated for robust scrolling */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                <div className="px-4 pt-4 sm:px-6">
                    <ReminderBanner 
                        payments={paymentsData.duePayments} 
                        status={paymentsData.emailStatus}
                        recipientEmail={paymentsData.recipientEmail}
                        lastSentTo={paymentsData.lastSentTo}
                    />
                </div>
                
                {/* Content wrapper with scroll management */}
                <div className="flex-1 relative h-full overflow-y-auto sm:overflow-hidden">
                    {currentPage === 'tasks' && <TasksPage panelWidth={panelWidth} handleMouseDown={handleMouseDown} />}
                    {currentPage === 'payments' && <PaymentsPage panelWidth={panelWidth} handleMouseDown={handleMouseDown} paymentsData={paymentsData} />}
                    {currentPage === 'trading' && tradingEnabled && <TradingPage panelWidth={panelWidth} handleMouseDown={handleMouseDown} />}
                </div>
            </div>
        </div>
    );
};

export default App;
