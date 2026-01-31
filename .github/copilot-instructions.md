# Voice-Tasks AI Coding Agent Instructions

## Project Overview

Voice-Tasks is a React+TypeScript voice-to-productivity app that converts spoken input into tasks, trades, and recurring payments. It uses Google Gemini AI for intelligent text processing and supports email reminders via EmailJS.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Google GenAI SDK, EmailJS

## Core Architecture

### Data Flow

1. **Speech → Transcript** (`useSpeechRecognition` hook in [hooks.ts](hooks.ts))
   - Browser's Web Speech API captures audio (30s max duration)
   - Continuous recognition with interim results
   - Language: English (en-US)

2. **Transcript → Structured Data** ([services/geminiService.ts](services/geminiService.ts))
   - Gemini 2.5 Flash model processes transcript
   - Three parallel processing functions:
     - `processTranscriptToTasks` → [Task](types.ts#L21) objects
     - `processTranscriptToTrades` → [Trade](types.ts#L61) objects
     - `processTranscriptToPayments` → [RecurringPayment](types.ts#L79) objects
   - Uses **JSON schema validation** for strict output structure

3. **Data → UI Rendering** ([App.tsx](App.tsx))
   - Three-panel layout with resizable dividers (`useResizablePanel` hook)
   - Real-time updates to task lists with undo/redo support

### Key Components

- **[App.tsx](App.tsx)** (1481 lines): Main app logic, 3 tabbed views (Tasks/Trades/Payments), state management
- **[Header.tsx](components/Header.tsx)**: Top navigation bar with theme toggle
- **[Icons.tsx](components/Icons.tsx)**: SVG icon library used throughout
- **[types.ts](types.ts)**: TypeScript interfaces (Task, Trade, RecurringPayment, etc.)
- **[hooks.ts](hooks.ts)**: Custom hooks (useSpeechRecognition, useResizablePanel, usePayments)

## Critical Patterns & Conventions

### Gemini Prompt Design

- **Current date context** is always passed to Gemini (`new Date().toISOString()`)
- **Date formatting** in responses: Explicit format (e.g., "Nov 6, 2024 at 6:00 PM"), NOT relative terms
- **Time consolidation**: Due date, time, and ETA all go into single `when` field
- **Subtasks**: Limited to max 2 per task (enforced in schema)
- **Default behavior**: Only include fields explicitly mentioned; no inferred defaults for reminders/times

**Example Gemini request**: See [geminiService.ts](services/geminiService.ts#L76-L93)

### State Management (App.tsx)

- **Three independent data domains**: tasks, trades, payments (separate useState hooks for each)
- **Undo/Redo**: Managed via stateHistory arrays and currentIndex pointers
- **Tab system**: Single `activeTab` state controls visible panel
- **Concurrent API calls**: All three transcript types processed in parallel via Promise.all

### Date & Number Formatting

- `formatDate()` → ISO to DDMMM (e.g., "07Dec")
- `formatCompactNumber()` → Rupee currency formatting (₹)
- `formatConcise()` → Handles relative + absolute date patterns
- **Currency**: Indian Rupee (₹) is hardcoded throughout; assumes INR context

### Email Service Integration

- [services/emailService.ts](services/emailService.ts): EmailJS-based reminders
- **Configuration required**: SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY must be set (currently placeholders)
- **Payment reminders**: Triggered by `usePayments` hook; checks if payment is overdue (dueDay < current date)
- **Template variables**: Support multiple aliases (to_email, recipient, email, etc.) for compatibility

### UI Conventions

- **Tailwind CSS** for all styling (no CSS modules)
- **Color scheme**: Slate neutrals, indigo primary, rose/amber for status
- **Responsive**: Hidden labels on mobile (sm: breakpoint), icons + text on desktop
- **Icons**: All custom SVGs from [Icons.tsx](components/Icons.tsx), imported individually
- **Loading states**: SpinnerIcon with animate-spin class

## Build & Environment

**Project Type**: AI Studio app with CDN imports (not a traditional Vite build)

- Uses `<script type="importmap">` in [index.html](index.html) to load React and dependencies from CDN
- No build step needed for production - files deploy directly to GitHub Pages
- Vite config is for local dev server only

**Commands**:

```bash
npm install      # Install dependencies (local dev only)
npm run dev      # Start Vite dev server (port 3000)
```

**Environment Variables** (.env.local):

- `VITE_GEMINI_API_KEY`: Required for Gemini API calls (used in local dev with Vite)
- Vite loads via `import.meta.env`
- **For GitHub Pages**: Set `VITE_GEMINI_API_KEY` as a repository secret (currently unused in production since CDN loads the API key directly in services)

**App Initialization**:

- Entry point: [index.tsx](index.tsx) - React root mounted to `#root` div
- Main component: [App.tsx](App.tsx) - handles all UI and state

## Deployment

**GitHub Pages Setup**:

- Workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) (auto-triggered on push to main)
- Deploys source files directly (no build step)
- Script path: Updated in [index.html](index.html) to `/Voice-Tasks/index.tsx` for subdirectory deployment
- URL: `https://sdokania30.github.io/Voice-Tasks/`

**To deploy**: Push to `main` branch. GitHub Actions will automatically deploy raw files to GitHub Pages.

**Important**: After deployment, verify that CDN imports work by checking browser network tab for:

- `https://aistudiocdn.com/react@^19.2.0`
- `https://aistudiocdn.com/@google/genai@^1.28.0`
- `https://esm.sh/@emailjs/browser@4.4.1`

## Common Tasks & Code Examples

### Adding a New Task Field

1. Update [types.ts](types.ts) - add to Task interface
2. Add to Gemini schema in [services/geminiService.ts](services/geminiService.ts#L13-L55)
3. Update `processTranscriptToTasks` return mapping
4. Update [App.tsx](App.tsx) - add UI rendering + any edit handlers

### Modifying Gemini Behavior

- Edit the prompt string (lines 76-93 in [services/geminiService.ts](services/geminiService.ts))
- Update the responseSchema if changing output structure
- Test with `TASKS_EXAMPLE` constant in [App.tsx](App.tsx#L12) for quick iteration

### Extending to New Data Type

1. Create new interface in [types.ts](types.ts)
2. Create `processTranscriptTo[Type]` function in [services/geminiService.ts](services/geminiService.ts)
3. Add tab + useState in [App.tsx](App.tsx)
4. Add processing to Promise.all chain (App.tsx line ~400)

## External Dependencies

- **@google/genai**: Gemini API client; uses `GoogleGenAI` class + schemas
- **@emailjs/browser**: Email sending; requires SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY
- **react**, **react-dom**: Core framework
- **vite**, **typescript**, **@vitejs/plugin-react**: Build tooling

## Gotchas & Known Constraints

1. **Speech Recognition**: Only supports en-US language; no fallback detection
2. **Gemini Rate Limits**: 3 concurrent API calls (one per data type) - monitor quota
3. **Email Service**: Credentials are hardcoded (not ideal for production); requires template config
4. **30-second recording limit**: Enforced in [hooks.ts](hooks.ts#L14); change RECORDING_DURATION_LIMIT in [App.tsx](App.tsx#L11)
5. **No data persistence**: All state is in-memory; page refresh clears everything
6. **Subtask IDs**: Generated with `crypto.randomUUID()` - ensure browser supports it
