
export enum Priority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  URGENT = 'Urgent',
}

export enum ReminderOption {
  NONE = 'none',
  FIVE_MIN = '5m',
  FIFTEEN_MIN = '15m',
  THIRTY_MIN = '30m',
  ONE_HOUR = '1h',
  ONE_DAY = '1d',
}

export enum Tag {
  PERSONAL = 'Personal',
  WORK = 'Work',
  OTHERS = 'Others',
}

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id:string;
  title: string;
  when: string;
  priority: Priority;
  tag?: Tag;
  isCompleted: boolean;
  rawText: string;
  completedAt?: string;
  subtasks: Subtask[];
  reminder?: ReminderOption;
}

export interface ExtractedTaskData {
  title: string;
  when: string;
  eta: string;
  priority: Priority;
  tag?: string;
  reminder: ReminderOption;
}

export interface Trade {
  id: string;
  stockName: string;
  entryPrice: number;
  quantity: number;
  stopLoss: number; // This is now a percentage
  entryDate: string; // ISO String
  reason: string;
}

export interface RecurringPayment {
  id: string;
  serviceName: string;
  amount: number;
  dueDay: number; // 1-31
  lastPaidDate?: string; // ISO String to track when it was last marked as done
}

export interface EmailLog {
  id: string;
  // Added optional paymentId to allow tracking which payment generated this log
  paymentId?: string;
  serviceName: string;
  amount: number;
  sentAt: string; // ISO string
  status: 'success' | 'failed';
}

// Web Speech API Types
export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
  item(index: number): SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
