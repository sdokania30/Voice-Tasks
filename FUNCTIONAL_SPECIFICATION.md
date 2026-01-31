# Voice-Tasks: Functional Specification

## Overview

Voice-Tasks is a voice-driven productivity application that converts natural language speech input into structured actionable items across three domains: **Tasks**, **Trades**, and **Recurring Payments**. The app is designed for rapid capture and organization of financial and personal productivity data.

**Target User**: Indian users managing tasks, stock trades, and subscription payments in INR currency.

---

## Core Domains

### 1. TASKS Domain

**Purpose**: Capture and manage action items from voice input.

#### Data Structure

```
Task {
  id: string                    // unique identifier
  title: string                 // task name
  when: string                  // due date/time and ETA (e.g., "Nov 6, 2024 at 6:00 PM (ETA: 2h)")
  priority: Priority            // LOW | MEDIUM | HIGH | URGENT
  tag?: Tag                     // PERSONAL | WORK | OTHERS (optional)
  reminder?: ReminderOption     // 5m | 15m | 30m | 1h | 1d (optional, undefined if not set)
  isCompleted: boolean          // completion status
  completedAt?: string          // ISO timestamp when marked done
  rawText: string               // original transcript segment
  subtasks: Subtask[]           // max 2 per task
}

Subtask {
  id: string
  title: string
  isCompleted: boolean
}

Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
Tag = 'Personal' | 'Work' | 'Others'
ReminderOption = 'none' | '5m' | '15m' | '30m' | '1h' | '1d'
```

#### Features

- **Voice Recording**: 30-second maximum recording using Web Speech API
- **Manual Editing**: Edit transcript before processing
- **Automatic Parsing**: Convert transcript to structured tasks
- **Task Filtering**: By tag, priority, completion status
- **Task Search**: Full-text search across title and raw text
- **Sorting**: By newest, priority, or due date
- **Undo/Redo**: Full edit history with state snapshots
- **Subtasks**: Break complex tasks into 1-2 subtasks
- **Reminders**: Optional reminder timing (not yet integrated with notifications)
- **Completion Tracking**: Mark tasks done with timestamp

#### Workflow

1. User clicks "Start Recording" or resumes with mic button
2. Web Speech API captures up to 30 seconds of audio
3. Browser's speech recognition converts to transcript
4. User can edit transcript manually
5. Click "Process" to parse with AI
6. System adds new tasks to the top of list
7. User can view, edit, filter, search, and complete tasks
8. State persists in localStorage

---

### 2. TRADES Domain

**Purpose**: Log stock market trades with analysis context.

#### Data Structure

```
Trade {
  id: string
  stockName: string             // ticker or company name
  entryPrice: number            // price per share in INR
  quantity: number              // number of shares
  stopLoss: number              // percentage (e.g., 5 for 5%)
  entryDate: string             // ISO 8601 date (YYYY-MM-DD)
  reason: string                // trade thesis / analysis
}
```

#### Features

- **Voice to Trade Parsing**: Convert natural language to structured trades
- **Automatic Stop-Loss Calculation**: If user mentions "5% stop loss", system stores 5 (percentage)
- **Price-to-Percentage Conversion**: If user says "stop at 900" with entry at 950, calculate percentage
- **Trade History**: All trades stored chronologically
- **Reason Tracking**: Capture trading thesis for later reference
- **Currency Assumption**: All prices are in Indian Rupees (INR)

#### Workflow

1. User records: "Bought 100 shares of Tata Motors at 950 with 5% stop loss"
2. AI parses to: `{ stockName: "Tata Motors", quantity: 100, entryPrice: 950, stopLoss: 5, ... }`
3. Trades displayed in table format
4. User can edit or delete trades
5. Data persists in localStorage

---

### 3. RECURRING PAYMENTS Domain

**Purpose**: Track subscriptions, bills, and recurring expenses with automatic email reminders.

#### Data Structure

```
RecurringPayment {
  id: string
  serviceName: string           // e.g., "Netflix", "Gym", "Rent"
  amount: number                // in INR
  dueDay: number                // 1-31 (day of month)
  lastPaidDate?: string         // ISO timestamp (marked as paid this month)
}

EmailLog {
  id: string
  paymentId?: string            // links to the payment that triggered this log
  serviceName: string
  amount: number
  sentAt: string                // ISO timestamp
  status: 'success' | 'failed'
}
```

#### Features

- **Voice to Payment Parsing**: Convert "Netflix is 650 rupees due on the 5th" to structure
- **Payment Status Tracking**: Mark payments as "Paid" (toggles lastPaidDate)
- **Actionable Payments**: System automatically identifies payments that are:
  - Due today
  - Due tomorrow
  - Overdue (past due date in current month, not yet paid)
- **Automatic Email Reminders**:
  - Scheduled to send at 6:00 AM daily
  - Only sends if there are actionable payments
  - Catch-up logic: if app missed the 6 AM slot, sends on next load
  - Only sends once per day (tracks with lastEmailSentDate in localStorage)
  - Handles month boundaries (e.g., due day 31 in a 30-day month)
- **Email Status Indicators**: Shows sending/sent/error/missing_config states
- **Email Log**: Keeps history of all sent payment reminders
- **Recipient Configuration**: User can set custom email recipient (default: doks23@gmail.com)

#### Workflow

1. User records: "Netflix 650 rupees due on 5th, Gym 2000 on 1st, Rent 15000 on 10th"
2. AI parses to 3 RecurringPayment objects
3. System displays payment reminders banner if any are actionable
4. Every day at 6 AM (or on app load if missed), system:
   - Filters actionable payments
   - Checks if already sent today
   - Sends email via EmailJS for each (with 2.5s delay between emails)
   - Logs results to emailLogs array
5. User can mark payment as paid (toggle lastPaidDate)
6. All data persists in localStorage

---

## UI Layout

### Three-Tab Interface

```
Header
├── Logo / Theme Toggle
└── [Tasks Tab] [Trades Tab] [Payments Tab]

Main Content (Single Tab Visible)
├── Left Panel (Resizable, 30-80% width)
│   └── TranscriptSection (Record → Edit → Process)
│
├── Divider (Draggable to resize)
│
└── Right Panel (Results)
    ├── Results Header (Title + Action Buttons)
    │   ├── Search Bar
    │   ├── Filters (Tag, Priority, Sort)
    │   └── Undo/Redo Controls
    │
    └── Results List
        ├── Active Items
        └── Completed Items (collapsible)
```

### Responsive Design

- **Desktop (sm breakpoint)**: Two-panel layout with divider
- **Mobile**: Stacked layout, tabs visible, panels collapse
- **Responsive Typography**: Hidden labels on mobile, icons visible, text on desktop
- **Colors**: Tailwind palette (slate neutrals, indigo primary, rose/amber for status)

---

## Data Persistence

### LocalStorage Keys

```
voice-to-tasks           // Task[] JSON
voice-to-trades          // Trade[] JSON
voice-to-payments        // RecurringPayment[] JSON
email-logs               // EmailLog[] JSON
recipient-email          // email address for payment reminders
lastEmailSentDate        // date string (prevents duplicate daily sends)
lastEmailSentTo          // tracks which email the last batch was sent to
hasVisitedTasks          // flag to show/hide task example on first load
```

### No Server/Backend

- All data is client-side in localStorage
- Page refresh clears in-memory state (but localStorage persists)
- Export/Import functionality not yet implemented

---

## Voice Input Specifications

### Speech Recognition

- **API**: Web Speech API (browser native)
- **Language**: English (en-US) only
- **Duration**: Maximum 30 seconds per recording
- **Continuous Mode**: Enabled (captures multiple utterances in one recording)
- **Interim Results**: Shown as user speaks (for UX feedback)
- **Error Handling**: Displays error messages if recognition fails

### Transcript Processing

- **Text Cleaning**: Remove filler words and transcription artifacts
- **Multi-item Parsing**: Each recording can contain multiple tasks/trades/payments
- **Raw Text Preservation**: Original transcript segment stored with each item for context

---

## AI Processing (Currently: Gemini 2.5 Flash)

### Task Processing

**Input**: Transcript string + current date
**Logic**:

1. Parse each distinct task from transcript
2. Extract: title, when (due date/time + ETA), priority (inferred from urgency keywords), tag, reminder, subtasks
3. When field: Consolidate date, time, and ETA into single string (e.g., "Nov 6, 2024 at 6:00 PM (ETA: 2h)")
4. Priority inference: URGENT (urgent/asap), HIGH (important/soon), MEDIUM (default), LOW (explicit)
5. Subtasks: Create max 2 subtasks if task implies multiple steps
6. Reminder: Only include if explicitly mentioned (no defaults)
7. Return JSON array with strict schema validation

**Schema**:

```
{
  title: string (required)
  when: string (required)
  priority: enum(LOW|MEDIUM|HIGH|URGENT) (required)
  rawText: string (required)
  tag: enum(PERSONAL|WORK|OTHERS)
  reminder: enum(none|5m|15m|30m|1h|1d)
  subtasks: [{ title: string }] (max 2)
}
```

### Trade Processing

**Input**: Transcript string + current date
**Logic**:

1. Identify trades from text (keywords: bought, sold, entered, exited)
2. Extract: stockName, entryPrice, quantity, stopLoss (as %), entryDate, reason
3. Currency: Assume INR unless stated otherwise
4. Stop-Loss calculation: If user provides price, calculate percentage from entry price
5. Reason: Capture trading thesis or explanation

**Schema**:

```
{
  stockName: string (required)
  entryPrice: number (required)
  quantity: integer (required)
  stopLoss: number (required, as percentage)
  entryDate: string ISO 8601 (required)
  reason: string (required, may be empty)
}
```

### Payment Processing

**Input**: Transcript string + current date
**Logic**:

1. Identify recurring payments (keywords: subscription, due, monthly, rupees, INR)
2. Extract: serviceName, amount (in INR), dueDay (1-31)
3. Date: If "5th" mentioned, extract 5; if "due on the 10th", extract 10
4. Amount: Parse numeric value, assume INR

**Schema**:

```
{
  serviceName: string (required)
  amount: number (required, in INR)
  dueDay: number (required, 1-31)
}
```

---

## Email Reminder System

### Configuration

- **Service**: EmailJS (requires SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY)
- **Status**: Currently has placeholder credentials in services/emailService.ts
- **Template Support**: Accepts multiple variable aliases for compatibility
  - `to_email`, `recipient`, `email` for address
  - `subject`, `message`, `content` for body
  - `service_name`, `serviceName` for payment name
  - `amount`, `due_date` for details

### Timing Logic

```
On app load:
  - Calculate actionable payments (overdue, today, tomorrow)
  - Check if already sent today (localStorage.lastEmailSentDate)

  If sent today:
    - Sleep until tomorrow 6:00 AM
  Else if now >= 6:00 AM:
    - Send immediately (catch-up for missed schedule)
  Else if now < 6:00 AM:
    - Wait until 6:00 AM

  When sending:
    - Filter out payments already emailed today
    - Send one email per actionable payment
    - Wait 2.5 seconds between emails (avoid rate limits)
    - Log each result (success/error)
    - Update lastEmailSentDate and lastEmailSentTo
```

### Overdue Detection

- Payment is overdue if `dueDay < currentDate` AND not paid this month
- Overdue reminders have different email template (URGENT messaging)

### Edge Cases Handled

- **Month boundaries**: If due day 31 and month has 30 days, payment due tomorrow is correctly identified
- **Already paid this month**: Tracked via `lastPaidDate` month/year comparison
- **Email address change**: If user changes recipient email, resets "already sent today" logic
- **App closed at 6 AM**: Catch-up sends immediately on next app load
- **No actionable payments**: System skips email sending, returns to idle state

---

## UI Components

### Transcript Section

- Title with mic icon
- Textarea for input/editing (character count displayed)
- Clear button (appears when text present)
- Recording controls:
  - Start Recording button (initial state)
  - Stop button with timer (while recording, animated)
  - Resume mic + Process button (after recording)
- Processing state: Spinner icon + "Processing..." text

### Results Sections (Tasks/Trades/Payments)

Each section has:

- Header with count badge and undo/redo buttons
- Search bar with icon
- Filter dropdowns (Tag, Priority, Sort dropdown)
- Show/hide completed toggle
- List of items (active + completed sections)

### Item Cards

- **Task Card**: Title, when, priority badge, tag dot, subtasks list, edit/delete buttons
- **Trade Card**: Stock name, entry price, quantity, stop loss, reason, edit/delete
- **Payment Card**: Service name, amount, due day, paid status toggle, edit/delete

### Dialogs

- **Confirm Delete**: Modal with title, message, Cancel/Delete buttons
- **Edit Form**: Inline or modal form for editing items

### Status Indicators

- **Priority Badge**: Single letter (U/H/M/L) with color coding
- **Tag Dot**: Small colored circle for category
- **Completion Badge**: Checkmark icon for completed items
- **Email Status Banner**: Shows payment reminder status (idle/sending/sent/error/config missing)

---

## Keyboard & Mouse Interactions

### Recording

- Click mic icon to start/stop recording
- Max 30 seconds enforced with timer
- Recording stops automatically at 30 seconds

### Editing

- Click edit icon on item to enter edit mode
- Click save to persist changes to localStorage and history
- Click cancel or click item again to exit edit mode

### Deletion

- Click delete icon
- Confirmation dialog appears
- Confirm to remove from list and localStorage
- Undo available if within session

### Resizing Panels

- Drag divider between panels left/right to resize
- Min 30%, max 80% width enforced
- Cursor changes to col-resize on divider hover

### Filtering & Sorting

- Dropdown filters update results in real-time
- Search box filters by title, rawText, and tag
- Sort options: Newest First, By Priority, By Due Date

---

## Features Not Yet Implemented

1. **Notification System**: Reminders are logged but no browser/system notifications triggered
2. **Email Service Setup**: EmailJS credentials are placeholders; user must configure
3. **Data Export/Import**: No CSV or JSON export functionality
4. **Cloud Sync**: No backend storage; data is local-only
5. **Recurring Task Automation**: Payment reminders are handled, but task reminders not actionable
6. **Task Delegation**: No sharing or team features
7. **Analytics**: No insights into task completion rates or trading performance
8. **Calendar View**: Tasks shown in list only, not calendar grid
9. **Collaboration**: Single-user only
10. **Offline Mode**: Requires internet for speech recognition and Gemini API

---

## Error Handling

### Speech Recognition

- Browser unsupported: Display error message
- Microphone permission denied: Show permission error
- Network error during recognition: Display error with retry option
- Timeout (no speech detected): Auto-stop and clear state

### AI Processing

- API rate limit hit: Return error task with details
- Malformed response: Parse error task with fallback structure
- Network error: Show spinner, allow retry

### Email Service

- Missing credentials: Display banner "Setup Required"
- Email send failure: Log error, display status, allow retry
- Invalid recipient address: Show error banner

---

## Performance Considerations

- **undo/redo**: Implemented via state history snapshots (each new action creates full copy)
- **Filtering**: Memoized with useMemo to avoid recalculation on every render
- **Search**: Case-insensitive substring matching
- **Email debouncing**: 2.5s delay between sends to avoid rate limits
- **Recording**: 30s limit prevents long processing times
- **localStorage**: Limited to ~5-10MB depending on browser (should be sufficient for typical usage)

---

## Assumptions & Defaults

- **Currency**: All amounts in Indian Rupees (₹)
- **Language**: English (en-US) only
- **Timezone**: Uses browser's local timezone
- **Default Task Priority**: MEDIUM
- **Default Task Tag**: OTHERS
- **Default Reminder**: None (undefined)
- **Email Recipient**: doks23@gmail.com (can be changed)
- **Payment Due Day Range**: 1-31 (user responsible for valid input)
- **Stock Currency**: INR unless stated otherwise

---

## Rebuild Considerations for New Tech Stack

If rebuilding from scratch without Gemini AI dependency:

1. **Replace Gemini API**:
   - Use alternative LLM (Claude, OpenAI, local model)
   - Or implement rule-based parsing with regex/NLP libraries
   - Or hybrid: simple rules + fallback to LLM

2. **Keep All Data Structures**: Task, Trade, RecurringPayment, etc. remain the same

3. **Keep UI/UX**: The three-tab layout, resizable panels, filters, and controls are solid

4. **Email Service**: Keep EmailJS or switch to another service (Nodemailer, SendGrid, etc.)

5. **Speech Recognition**: Keep Web Speech API (browser-native, no dependency)

6. **State Management**: Keep localStorage for persistence; consider IndexedDB if more capacity needed

7. **Styling**: Keep Tailwind CSS and current design system

---

## Next Steps for Rebuilding

1. Set up new project (React + TypeScript + Vite)
2. Implement data structures and types
3. Implement speech recognition and transcript handling
4. Choose AI replacement and implement parsing service
5. Build UI components and layout
6. Implement filtering, sorting, search
7. Implement undo/redo history
8. Implement email reminder system
9. Add localStorage persistence
10. Test all three domains (tasks, trades, payments)
11. Deploy and verify
