# Feature Implementation Plan: System Prompt & Chat Bot

**Date:** March 19, 2026  
**Status:** Planning Phase  
**Estimated Timeline:** 2-3 weeks

---

## Overview

This document outlines the implementation plan for two new features:
1. **System Prompt with Channel Context** - Allow users to customize generation with channel-specific voice/tone guidelines
2. **Interactive Chat Bot** - Enable conversational refinement of generated content

These features extend the existing multi-stage LLM pipeline while maintaining backward compatibility.

---

## Feature 1: System Prompt with Channel Context

### Concept

The current generation pipeline uses hardcoded prompt templates (`src/lib/prompts/generation-system.ts`). This feature introduces a **configurable channel context layer** that gets prepended to all generation prompts, allowing users to:

- Define channel voice/tone (e.g., "conversational but authoritative", "edgy millennial humor")
- Specify stylistic preferences (e.g., "avoid exclamation marks", "prefer data-driven hooks")
- Set content guardrails (e.g., "never use clickbait patterns", "prioritize educational value")
- Include brand-specific terminology or banned phrases

### Implementation Details

#### Database Changes

**New Table: `channel_configs`**
```sql
CREATE TABLE channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  voice_guidelines JSONB DEFAULT '{}',
  banned_phrases TEXT[] DEFAULT '{}',
  preferred_archetypes TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT unique_user_config_name UNIQUE(user_id, name)
);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER channel_configs_updated_at_trigger
  BEFORE UPDATE ON channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Performance indexes
CREATE INDEX idx_channel_configs_user_id ON channel_configs(user_id);
CREATE INDEX idx_channel_configs_voice_guidelines ON channel_configs USING GIN(voice_guidelines);
CREATE INDEX idx_channel_configs_banned_phrases ON channel_configs USING GIN(banned_phrases);
CREATE INDEX idx_channel_configs_preferred_archetypes ON channel_configs USING GIN(preferred_archetypes);

-- Row Level Security
ALTER TABLE channel_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY channel_configs_select_policy ON channel_configs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY channel_configs_insert_policy ON channel_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY channel_configs_update_policy ON channel_configs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY channel_configs_delete_policy ON channel_configs
  FOR DELETE USING (auth.uid() = user_id);
```

#### Prompt Architecture Changes

**Current Flow:**
```
Research Data → Generation Prompt → LLM → Generated Titles
```

**New Flow:**
```
Research Data + Channel Context → [System Prompt + Base Generation Prompt] → LLM → Generated Titles
```

**Implementation in `src/lib/prompts/generation-system.ts`:**
- Add optional `channelContext` parameter to prompt builder functions
- Prepend channel context as a "system instruction" section
- Maintain backward compatibility (null = use defaults)

**Example channel context injection with validation and sanitization:**
```typescript
// Validation and sanitization helpers
function sanitizeForPrompt(text: string, maxLength: number = 1000): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/```/g, '') // Remove triple backticks (prompt injection prevention)
    .replace(/\n{3,}/g, '\n\n') // Normalize excessive newlines
    .trim()
    .slice(0, maxLength);
}

function validateArray(value: unknown, defaultValue: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string' && item.length > 0);
  }
  return defaultValue;
}

function validateVoiceGuidelines(guidelines: unknown): { tone?: string; style?: string } {
  if (!guidelines || typeof guidelines !== 'object') {
    return { tone: 'conversational', style: 'engaging' };
  }
  const g = guidelines as Record<string, unknown>;
  return {
    tone: typeof g.tone === 'string' ? g.tone : 'conversational',
    style: typeof g.style === 'string' ? g.style : 'engaging'
  };
}

// Before generation, prepend user-defined guidelines with validation
function buildSystemContext(channelConfig: ChannelConfig | null): string {
  if (!channelConfig) return '';

  // Validate and sanitize all user-provided strings
  const voice = validateVoiceGuidelines(channelConfig.voice_guidelines);
  const banned = validateArray(channelConfig.banned_phrases, []);
  const preferred = validateArray(channelConfig.preferred_archetypes, []);

  // Apply length limits and sanitization
  const systemContext = `
CHANNEL CONTEXT:
- Voice: ${sanitizeForPrompt(voice.tone || '', 200)}
- Style: ${sanitizeForPrompt(voice.style || '', 200)}
- Banned: ${banned.map(p => sanitizeForPrompt(p, 100)).join(', ')}
- Preferred: ${preferred.map(a => sanitizeForPrompt(a, 100)).join(', ')}

Apply these guidelines to all title generation while maintaining archetype requirements.
`;

  return systemContext;
}

// Build final prompt with validated context
const systemContext = buildSystemContext(channelConfig);
const finalPrompt = systemContext + baseGenerationPrompt;
```

#### Files to Modify

1. **`src/lib/prompts/generation-system.ts`**
   - Add `channelContext` parameter to main generation function
   - Inject context at the top of prompts before archetype instructions

2. **`src/app/api/generate/route.ts`**
   - Accept optional `channelConfigId` in request body
   - Fetch channel config from database before generation
   - Pass context to generation pipeline

3. **`src/hooks/use-generation-pipeline.ts`**
   - Add `channelConfig` to state
   - Include in API call payload

4. **`src/lib/schemas/generation-output.ts`**
   - Add `channel_context_applied` flag to track usage

#### UI Components Needed

1. **Channel Config Management Page**
   - Form to create/edit channel configs
   - Live preview of prompt injection
   - Test generation with custom context

2. **Generation Interface Enhancement**
   - Dropdown to select channel config (optional)
   - Visual indicator when custom context is active

### Testing Strategy

- Unit tests for prompt injection logic
- Integration tests verifying context affects output
- Regression tests ensuring default behavior unchanged

---

## Feature 2: Interactive Chat Bot

### Concept

Add a conversational interface that allows users to:
- Ask questions about generated titles
- Request specific modifications ("make it more urgent")
- Compare options conversationally
- Get explanations for scoring
- Trigger reworks with natural language feedback

The chat bot operates in the context of a specific generation run, having access to:
- All generated titles and scores
- Research data (hot takes, guest tier, trending keywords)
- Current channel context (if any)
- Generation history and previous reworks

### Implementation Details

#### Database Changes

**New Table: `conversations`**
```sql
-- Create enum for conversation status
CREATE TYPE conversation_status AS ENUM ('active', 'closed');

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  status conversation_status DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  CONSTRAINT chk_conversations_status CHECK (status IN ('active', 'closed')),
  CONSTRAINT chk_conversations_messages_is_array CHECK (jsonb_typeof(messages) = 'array')
);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER conversations_updated_at_trigger
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION conversations_updated_at();

-- Performance indexes
CREATE INDEX idx_conversations_run_id ON conversations(run_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access conversations for runs they own
CREATE POLICY conversations_select_policy ON conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM generation_runs gr
      JOIN episodes e ON gr.episode_id = e.id
      WHERE gr.id = conversations.run_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY conversations_insert_policy ON conversations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM generation_runs gr
      JOIN episodes e ON gr.episode_id = e.id
      WHERE gr.id = conversations.run_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY conversations_update_policy ON conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM generation_runs gr
      JOIN episodes e ON gr.episode_id = e.id
      WHERE gr.id = conversations.run_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY conversations_delete_policy ON conversations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM generation_runs gr
      JOIN episodes e ON gr.episode_id = e.id
      WHERE gr.id = conversations.run_id AND e.user_id = auth.uid()
    )
  );
```

**New Table: `conversation_actions`**
```sql
-- Create enum for action types
CREATE TYPE action_type_enum AS ENUM ('regenerate', 'rescore', 'rerank', 'recontent');

CREATE TABLE conversation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  action_type action_type_enum NOT NULL,
  parameters JSONB,
  triggered_by_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP
);

-- Performance indexes
CREATE INDEX idx_conversation_actions_conversation_id ON conversation_actions(conversation_id);
CREATE INDEX idx_conversation_actions_status ON conversation_actions(status);
CREATE INDEX idx_conversation_actions_created_at ON conversation_actions(created_at);

-- Row Level Security
ALTER TABLE conversation_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access actions for conversations they own
CREATE POLICY conversation_actions_select_policy ON conversation_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN generation_runs gr ON c.run_id = gr.id
      JOIN episodes e ON gr.episode_id = e.id
      WHERE c.id = conversation_actions.conversation_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_actions_insert_policy ON conversation_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN generation_runs gr ON c.run_id = gr.id
      JOIN episodes e ON gr.episode_id = e.id
      WHERE c.id = conversation_actions.conversation_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_actions_update_policy ON conversation_actions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN generation_runs gr ON c.run_id = gr.id
      JOIN episodes e ON gr.episode_id = e.id
      WHERE c.id = conversation_actions.conversation_id AND e.user_id = auth.uid()
    )
  );
```

#### API Endpoint Architecture

**New Endpoint: `POST /api/chat`**

Handles streaming chat responses using Vercel AI SDK's `streamText`.

**Request:**
```json
{
  "runId": "uuid",
  "message": "Can you make the titles more urgent?",
  "conversationId": "uuid" // optional - creates new if null
}
```

**TypeScript Interfaces and Sanitization Helpers:**
```typescript
// Interface for chat context with proper typing
interface ChatContext {
  episodeTitle?: string;
  guestTier?: string;
  hotTakes?: Array<{ text?: string; relevance?: number }>;
  titles?: Array<{ title?: string; archetype?: string; score?: unknown }>;
  scores?: Record<string, unknown>;
  channelConfig?: {
    systemPrompt?: string;
    voice_guidelines?: { tone?: string; style?: string };
    banned_phrases?: string[];
    preferred_archetypes?: string[];
  };
}

// Sanitization helper for prompt injection prevention
function sanitizeForPrompt(text: string, maxLength: number = 500): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/```/g, '') // Remove triple backticks (prompt injection)
    .replace(/\n{3,}/g, '\n\n') // Normalize excessive newlines
    .trim()
    .slice(0, maxLength);
}

// Safe array access with null checks
function safeMap<T, R>(arr: T[] | undefined | null, mapper: (item: T) => R, limit: number = 10): R[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, limit).map(mapper);
}

// Truncate large JSON strings for context window management
function truncateJson(obj: unknown, maxLength: number = 1000): string {
  const json = JSON.stringify(obj);
  return json.length > maxLength ? json.slice(0, maxLength) + '... [truncated]' : json;
}
```

**Chat System Prompt (`src/lib/prompts/chat-system.ts`):**
```typescript
export const chatSystemPrompt = (context: ChatContext): string => {
  // Validate defaults with null-safety
  const episodeTitle = sanitizeForPrompt(context.episodeTitle ?? 'Unknown', 200);
  const guestTier = sanitizeForPrompt(context.guestTier ?? 'Unknown', 50);
  
  // Safe array access with size limits and validation
  const hotTakes = safeMap(
    context.hotTakes,
    t => sanitizeForPrompt(t?.text ?? '', 150),
    5
  ).join(', ');
  
  const titles = safeMap(
    context.titles,
    t => sanitizeForPrompt(t?.title ?? '', 100),
    8
  ).join(', ');
  
  // Truncate scores to prevent context window exhaustion
  const scores = truncateJson(context.scores, 800);
  
  // Safe channel config access with default
  const channelPrompt = sanitizeForPrompt(
    context.channelConfig?.systemPrompt ?? 'None configured',
    1000
  );

  return `
You are a helpful assistant for refining YouTube and podcast titles.

CURRENT RUN CONTEXT:
- Podcast: ${episodeTitle}
- Guest Tier: ${guestTier}
- Hot Takes: ${hotTakes || 'None provided'}
- Generated Titles: ${titles || 'None generated'}
- Current Scores: ${scores}

USER CHANNEL CONTEXT:
${channelPrompt}

You can help users:
1. Explain why certain titles scored higher
2. Suggest improvements based on their feedback
3. Trigger reworks: regeneration, rescoring, or reranking
4. Compare titles and explain trade-offs

When suggesting changes, be specific about which archetype to target.
If the user wants to modify a title, ask clarifying questions about what aspect to change.

Available Actions:
- regenerate: Create new titles for specific archetypes
- rescore: Re-run the scoring panel
- rerank: Re-run pairwise tournament
- recontent: Regenerate descriptions/chapters only

Always maintain the existing guardrails and formatting rules.
`.trim();
};
```

**Action Triggering:**
The chat bot can suggest actions, but actions require explicit user confirmation:

```typescript
// Chat response includes action suggestions
interface ChatResponse {
  content: string;
  suggestedActions?: Array<{
    type: 'regenerate' | 'rescore' | 'rerank' | 'recontent';
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

// User confirms via UI button
// Action is queued and executed via existing pipeline
```

#### Integration with Existing Pipeline

**Modified Flow:**
```
Generation Complete → Chat Available → User Asks Question → 
AI Responds with Context → User Requests Change → 
Action Queued → Pipeline Executes → Chat Updated
```

**Key Integration Points:**

1. **Conversation-aware Generation** (`src/app/api/generate/route.ts`)
   - Check for active conversations before regeneration
   - Include conversation context in generation prompts
   - Log actions to `conversation_actions` table

2. **Chat-aware Scoring** (`src/lib/prompts/scoring-system.ts`)
   - If chat suggested modifications, apply to scoring criteria
   - Track which titles resulted from chat feedback

3. **State Synchronization** (`src/hooks/use-generation-pipeline.ts`)
   - Subscribe to conversation updates via SSE
   - Update UI when new chat messages arrive
   - Reflect action results in chat thread

#### Files to Modify

1. **`src/app/api/generate/route.ts`**
   - Add conversation context lookup
   - Modify prompts to include chat history
   - Log actions with conversation references

2. **`src/hooks/use-generation-pipeline.ts`**
   - Add chat state management
   - Integrate chat stream with existing SSE
   - Handle action confirmation flow

3. **`src/lib/prompts/scoring-system.ts`**
   - Accept `feedbackContext` parameter
   - Adjust scoring weights based on chat feedback

4. **`src/lib/prompts/pairwise-system.ts`**
   - Accept conversation preferences
   - Consider chat history in comparisons

#### UI Components Needed

1. **Chat Panel Component**
   - Collapsible sidebar or floating panel
   - Message thread with user/AI differentiation
   - Action suggestion buttons
   - Context-aware suggestions ("Explain scores", "Make more urgent", etc.)

2. **Action Confirmation Modal**
   - Preview suggested changes
   - Confirm/cancel action execution
   - Show estimated time/compute cost

3. **Chat Integration in Results View**
   - Quick actions per title ("Chat about this title")
   - Inline feedback buttons

### Testing Strategy

- Unit tests for chat response generation
- Integration tests for action triggering flow
- E2E tests for full conversation → action → result cycle
- Load testing for concurrent chat sessions

---

## Additional Files to Review

Beyond the core implementation files, these files may need updates:

### Type Definitions

**`src/types/`**

Add concrete TypeScript interfaces under `src/types/`:

```typescript
// channel-config.ts
export interface ChannelConfig {
  id: string; // UUID
  user_id: string; // UUID - references auth.users(id)
  name: string;
  system_prompt: string;
  voice_guidelines: {
    tone?: string;
    style?: string;
    personality?: string;
  };
  banned_phrases: string[];
  preferred_archetypes: string[];
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

// chat.ts
export interface ChatMessage {
  id: string; // UUID
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    action_suggestions?: ConversationAction[];
    tokens_used?: number;
    latency_ms?: number;
  };
  created_at: string;
}

export interface Conversation {
  id: string; // UUID
  run_id: string; // UUID - references generation_runs(id)
  messages: ChatMessage[];
  status: 'active' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface ConversationAction {
  id: string; // UUID
  conversation_id: string; // UUID - references conversations(id)
  action_type: 'regenerate' | 'rescore' | 'rerank' | 'recontent';
  parameters?: Record<string, unknown>;
  triggered_by_message_id?: string; // UUID - references messages(id)
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// Extend existing types
export interface GenerationRequest {
  // ... existing fields
  channelConfigId?: string; // UUID - references channel_configs(id)
  conversationId?: string; // UUID - references conversations(id)
}

export interface ChatContext {
  episodeTitle?: string;
  guestTier?: string;
  hotTakes?: Array<{ text?: string; relevance?: number }>;
  titles?: Array<{ title?: string; archetype?: string; score?: unknown }>;
  scores?: Record<string, unknown>;
  channelConfig?: ChannelConfig;
  conversationHistory?: ChatMessage[];
}
```

### Database Schema

**Supabase migrations:**
- Create migration files for new tables
- Add RLS policies for `channel_configs` and `conversations`
- Add indexes for performance (run_id on conversations)

### Configuration

**Environment Variables:**
- Review if any new API keys needed for chat models
- Consider rate limiting for chat endpoint

### State Management

**`src/lib/supabase/client.ts`**
- Add helper functions for conversation CRUD
- Add realtime subscriptions for chat updates

### Error Scenarios & Handling

**Detailed Error Handling Strategy:**

#### Chat-Specific Errors
- **LLM Timeout/Stream Interruption:**
  - Extend `isTransientError` to detect timeout errors (e.g., network timeouts, stream aborts)
  - Implement exponential backoff retry (max 3 attempts)
  - Return graceful "Please try again" message to user
  
- **Invalid Action Parameters:**
  - Add Zod validation schemas for action parameters before execution
  - Return structured error with field-level validation messages
  - Prevent action execution if parameters fail validation
  
- **Message Too Long:**
  - Implement validation and truncation: reject messages > 4000 chars
  - Return clear error with character count and suggestion to shorten

#### Action Execution Errors
- **Conversation Not Found:**
  - Add conversation state checks before any action
  - Return 404 with "Conversation expired or invalid"
  - Offer to create new conversation
  
- **Invalid Conversation State:**
  - Implement state checkpoints: track `last_valid_state` in conversation metadata
  - If state becomes corrupted, rollback to last checkpoint
  - Log state transitions for debugging
  
- **Generation Pipeline Failure Mid-Action:**
  - Use idempotency keys for all action requests (unique per action attempt)
  - Store action status as `in_progress` immediately upon trigger
  - On failure, mark action as `failed` with error details
  - Allow user to retry with same parameters (idempotency key prevents duplicate)
  
- **Action Already In Progress:**
  - Implement action locking/queueing: check for existing `in_progress` actions
  - Return "Action in progress" with estimated completion time
  - Queue new actions if pipeline supports concurrent operations

#### Context Construction Errors
- **Malformed JSONB in Context:**
  - Add context sanitization: validate JSON structure before injecting into prompts
  - Use safe JSON parsing with fallback to empty object
  - Log malformed data for debugging
  
- **Oversized Context:**
  - Implement truncation routines: limit `channelConfig.systemPrompt` to 2000 chars
  - Truncate `conversationHistory` to last 10 messages
  - Truncate large `scores` objects to essential fields only

#### Database Errors
- **Foreign Key Violations:**
  - Validate all FK references before INSERT (e.g., conversation_id exists)
  - Return 400 with specific field that failed validation
  
- **Unique Constraint Violations:**
  - Handle `unique_user_config_name` conflicts gracefully
  - Return "Config with this name already exists" with suggestion to rename
  
- **Connection Timeouts:**
  - Implement retry with exponential backoff + circuit breaker pattern
  - After 3 retries, return "Service temporarily unavailable"
  - Alert admin if circuit breaker opens
  
- **RLS Violations:**
  - Ensure all queries include proper auth context
  - Return 403 with "Access denied" (don't leak RLS details)
  - Log attempted access for security review

#### Recovery Strategies
```typescript
// Enhanced isTransientError function
function isTransientError(error: Error): boolean {
  const transientPatterns = [
    /timeout/i,
    /connection reset/i,
    /stream aborted/i,
    /llm.*timeout/i,
    /transient.*db.*error/i,
    /circuit breaker open/i,
  ];
  return transientPatterns.some(pattern => pattern.test(error.message));
}

// Action execution with idempotency and checkpointing
async function executeAction(action: ConversationAction) {
  // Check for existing action with same idempotency key
  const existing = await getActionByIdempotencyKey(action.idempotency_key);
  if (existing) {
    return existing; // Return cached result
  }
  
  // Save checkpoint before execution
  await saveConversationCheckpoint(action.conversation_id);
  
  try {
    await markActionInProgress(action.id);
    const result = await runPipeline(action.parameters);
    await completeAction(action.id, result);
    return result;
  } catch (error) {
    await failAction(action.id, error);
    if (isTransientError(error)) {
      await scheduleRetry(action);
    }
    throw error;
  }
}
```

### Security

**Authentication:**
- Ensure channel configs are user-scoped via RLS policies
- Validate conversation access (user can only chat about their own runs)

#### Input Validation & Sanitization
- **Prompt Injection Prevention:**
  - Sanitize all user inputs before injecting into prompts (see `sanitizeForPrompt` helper)
  - Strip triple backticks, excessive newlines, and injection patterns
  - Use parameterized prompts with validated placeholders
  - Never concatenate raw user input directly into system prompts

- **Output Validation & Content Filtering:**
  - Validate LLM responses for harmful content using moderation APIs
  - Sanitize markdown/HTML in responses before rendering in UI
  - Implement rate limiting on output generation to prevent abuse

#### Data Privacy & Retention
- **PII Handling and Redaction:**
  - Scan inputs for PII patterns (emails, phone numbers, SSNs)
  - Redact or reject inputs containing sensitive PII
  - Implement data minimization: don't store conversation data longer than necessary
  
- **Data Retention & Automated Cleanup:**
  - Implement 90-day retention policy for conversations and chat messages
  - Create scheduled cleanup jobs (e.g., daily cron) to delete expired data
  - Archive conversation summaries (not full messages) for analytics
  
- **GDPR/CCPA Compliance:**
  - Support "right to delete" - users can request full conversation deletion
  - Support "data export" - users can download their conversation history
  - Provide clear consent for chat data processing

#### Rate Limiting Strategy
- **Per-User Limits:**
  - Chat messages: 30 requests per minute per user
  - Expensive actions (regenerate/rescore): 5 per hour per user
  - Channel config updates: 10 per minute per user
  
- **Cost-Based Throttling:**
  - Track token usage per user
  - Implement tiered limits: free tier 1000 tokens/day, paid tier 10000 tokens/day
  - Alert users when approaching limits
  - Circuit breaker: pause chat if costs exceed thresholds

- **Action Abuse Prevention:**
  - Throttle expensive operations (regenerate/rescore) with progressive delays
  - Require confirmation for actions costing >$0.01
  - Implement cooldown periods between regeneration attempts

#### Encryption & Storage
- **Encryption at Rest:**
  - Encrypt sensitive channel config fields (system_prompt, banned_phrases)
  - Use column-level encryption for PII in database
  - Store encryption keys separately from data

#### Audit & Monitoring
- **Audit Logging:**
  - Log security events: failed auth attempts, action triggers, suspicious patterns
  - Log data access: who viewed/exported/deleted conversations
  - Retain audit logs for 1 year
  
- **Suspicious Pattern Detection:**
  - Alert on rapid message bursts (potential spam)
  - Alert on repeated failed actions (potential abuse)
  - Alert on unusual token consumption patterns

- **CSRF Protection:**
  - Implement CSRF tokens for chat and action endpoints
  - Validate Origin/Referer headers
  - Use SameSite=Strict cookies for session management

#### Access Control Summary
| Resource | Policy | Notes |
|----------|--------|-------|
| channel_configs | User-scoped RLS | Users can only access their own configs |
| conversations | Run-owner access | Via JOIN through generation_runs → episodes |
| conversation_actions | Conversation-owner access | Via JOIN through conversations |
| messages | Conversation-owner access | Embedded in conversations table |

**Rate Limits:**
- Chat: 30 req/min per user, burst 60
- Actions: 5/hour per user for expensive ops
- Config CRUD: 10 req/min per user

---

## Phased Implementation Plan

### Phase 1: System Prompt (Week 1)
- [ ] Database migration for `channel_configs` table
- [ ] Modify `generation-system.ts` to accept context
- [ ] Update API route to fetch and inject context
- [ ] Build channel config UI (CRUD operations)
- [ ] Add tests and validation

### Phase 2: Chat Infrastructure (Week 1-2)
- [ ] Database migration for `conversations` and `conversation_actions`
- [ ] Create `chat-system.ts` prompt template
- [ ] Build `POST /api/chat` streaming endpoint
- [ ] Add chat state to `use-generation-pipeline` hook

### Phase 3: Chat UI & Integration (Week 2-3)
- [ ] Build chat panel component
- [ ] Implement action suggestion and confirmation flow
- [ ] Integrate chat with existing rework mechanisms
- [ ] Add action execution logging
- [ ] Comprehensive testing

### Phase 4: Polish & Documentation (Week 3)
- [ ] Performance optimization
- [ ] User documentation
- [ ] Admin tooling for monitoring conversations
- [ ] Analytics for feature usage

---

## Potential Challenges & Mitigations

### Challenge 1: Token Limits
**Issue:** Adding channel context + chat history may exceed model context windows  
**Mitigation:** 
- Truncate chat history to last N messages
- Summarize older context
- Use smaller models for chat, larger for generation

### Challenge 2: State Synchronization
**Issue:** Chat and generation pipeline run asynchronously
**Mitigation:**

#### Concrete Implementation: Realtime Subscriptions and Optimistic Updates

**1. Supabase Realtime Subscription Setup:**

```typescript
// src/lib/supabase/realtime.ts
import { createClient } from '@supabase/supabase-js';

interface RealtimeSubscriptions {
  conversation: ReturnType<typeof supabase.channel> | null;
  action: ReturnType<typeof supabase.channel> | null;
}

const subscriptions: RealtimeSubscriptions = {
  conversation: null,
  action: null,
};

export function subscribeToConversation(
  conversationId: string,
  handlers: {
    onMessage: (payload: { new: ChatMessage; old: ChatMessage | null }) => void;
    onError: (error: Error) => void;
  }
): () => void {
  // Unsubscribe from existing subscription
  if (subscriptions.conversation) {
    subscriptions.conversation.unsubscribe();
  }

  // Create new subscription with error handling
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        handleConversationUpdate(payload, handlers.onMessage);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      },
      (payload) => {
        handleConversationUpdate(payload, handlers.onMessage);
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        handlers.onError(new Error('Failed to subscribe to conversation updates'));
      }
    });

  subscriptions.conversation = channel;

  // Return cleanup function
  return () => {
    channel.unsubscribe();
    subscriptions.conversation = null;
  };
}

export function subscribeToActions(
  conversationId: string,
  handlers: {
    onActionComplete: (action: ConversationAction) => void;
    onActionFailed: (action: ConversationAction, error: string) => void;
    onError: (error: Error) => void;
  }
): () => void {
  // Unsubscribe from existing subscription
  if (subscriptions.action) {
    subscriptions.action.unsubscribe();
  }

  const channel = supabase
    .channel(`actions:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_actions',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        handleActionComplete(payload, handlers);
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        handlers.onError(new Error('Failed to subscribe to action updates'));
      }
    });

  subscriptions.action = channel;

  return () => {
    channel.unsubscribe();
    subscriptions.action = null;
  };
}

// Handler for conversation updates
function handleConversationUpdate(
  payload: { new: ChatMessage; old: ChatMessage | null },
  onMessage: (payload: { new: ChatMessage; old: ChatMessage | null }) => void
): void {
  try {
    // Validate payload structure
    if (!payload.new) {
      console.warn('Received empty conversation update payload');
      return;
    }
    onMessage(payload);
  } catch (error) {
    console.error('Error handling conversation update:', error);
  }
}

// Handler for action completion
function handleActionComplete(
  payload: { new: ConversationAction; old: ConversationAction },
  handlers: {
    onActionComplete: (action: ConversationAction) => void;
    onActionFailed: (action: ConversationAction, error: string) => void;
  }
): void {
  try {
    const action = payload.new;
    
    if (action.status === 'completed') {
      handlers.onActionComplete(action);
    } else if (action.status === 'failed') {
      handlers.onActionFailed(action, action.error_message || 'Unknown error');
    }
  } catch (error) {
    console.error('Error handling action completion:', error);
  }
}

// Cleanup function for all subscriptions
export function unsubscribeAll(): void {
  if (subscriptions.conversation) {
    subscriptions.conversation.unsubscribe();
    subscriptions.conversation = null;
  }
  if (subscriptions.action) {
    subscriptions.action.unsubscribe();
    subscriptions.action = null;
  }
}
```

**2. Optimistic UI Flow with Rollback:**

```typescript
// src/hooks/use-optimistic-chat.ts
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface OptimisticMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  isPending: boolean;
  error?: string;
}

export function useOptimisticChat(conversationId: string) {
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  // Send message with optimistic update
  const sendChatMessage = useCallback(async (content: string) => {
    // Generate temporary ID for optimistic update
    const tempId = `temp-${uuidv4()}`;
    const tempMessage: OptimisticMessage = {
      id: tempId,
      content,
      role: 'user',
      isPending: true,
    };

    // Optimistic update: add message immediately
    updateLocalState((prev) => [...prev, tempMessage]);

    try {
      // Send to server
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: content,
          tempId, // Send temp ID to map server response
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Replace temp message with confirmed message
      replaceLocalMessage(tempId, {
        id: data.messageId, // Server-generated ID
        content,
        role: 'user',
        isPending: false,
      });

      // Add assistant response (may come via realtime instead)
      if (data.assistantMessage) {
        updateLocalState((prev) => [
          ...prev,
          {
            id: data.assistantMessage.id,
            content: data.assistantMessage.content,
            role: 'assistant',
            isPending: false,
          },
        ]);
      }

      return data;
    } catch (error) {
      // Rollback on failure
      removeLocalMessage(tempId);
      throw error;
    }
  }, [conversationId]);

  // Update local state with new message
  const updateLocalState = useCallback(
    (updater: (prev: OptimisticMessage[]) => OptimisticMessage[]) => {
      setMessages((prev) => updater(prev));
    },
    []
  );

  // Replace a temporary message with confirmed one
  const replaceLocalMessage = useCallback(
    (tempId: string, confirmedMessage: OptimisticMessage) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? confirmedMessage : msg
        )
      );
    },
    []
  );

  // Remove a message (for rollback)
  const removeLocalMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  // Handle action triggering with optimistic updates
  const triggerAction = useCallback(
    async (actionType: string, parameters: Record<string, unknown>) => {
      const actionId = uuidv4();
      
      // Add to pending actions
      setPendingActions((prev) => new Set(prev).add(actionId));

      try {
        const response = await fetch('/api/chat/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            actionType,
            parameters,
            actionId,
          }),
        });

        if (!response.ok) {
          throw new Error('Action failed to trigger');
        }

        // Action will complete via realtime subscription
      } catch (error) {
        // Remove from pending on failure
        setPendingActions((prev) => {
          const next = new Set(prev);
          next.delete(actionId);
          return next;
        });
        throw error;
      }
    },
    [conversationId]
  );

  return {
    messages,
    pendingActions,
    sendChatMessage,
    triggerAction,
  };
}
```

**3. Conflict Resolution and Concurrency Control:**

```typescript
// Conflict resolution: last-write-wins with versioning
interface VersionedEntity {
  id: string;
  version: number; // Increment on every update
  updated_at: string;
}

// Optimistic concurrency control for messages
async function updateMessageWithOCC(
  messageId: string,
  updates: Partial<ChatMessage>,
  expectedVersion: number
): Promise<void> {
  const { data, error } = await supabase
    .from('messages')
    .update({
      ...updates,
      version: expectedVersion + 1,
    })
    .eq('id', messageId)
    .eq('version', expectedVersion) // OCC check
    .select();

  if (error || !data || data.length === 0) {
    // Version conflict - fetch latest and retry
    const latest = await fetchMessage(messageId);
    throw new Error(
      `Version conflict: expected ${expectedVersion}, got ${latest.version}`
    );
  }
}

// Action queue serialization to prevent concurrent actions
const actionQueue: Map<string, Promise<void>> = new Map();

export async function queueAction(
  conversationId: string,
  action: () => Promise<void>
): Promise<void> {
  // Wait for existing action on this conversation
  const existing = actionQueue.get(conversationId);
  if (existing) {
    await existing;
  }

  // Queue new action
  const promise = action().finally(() => {
    actionQueue.delete(conversationId);
  });

  actionQueue.set(conversationId, promise);
  return promise;
}

// Usage in components
async function handleRegenerateRequest() {
  await queueAction(conversationId, async () => {
    // This action will be serialized per conversation
    await triggerAction('regenerate', { archetype: 'curiosity_gap' });
  });
}
```

**4. Version Tracking and State Synchronization:**

```typescript
// src/lib/state-sync.ts
interface SyncState {
  lastSyncTime: string;
  pendingChanges: Map<string, unknown>;
  conflictLog: Array<{ entity: string; expectedVersion: number; actualVersion: number }>;
}

export function createSyncManager() {
  const state: SyncState = {
    lastSyncTime: new Date().toISOString(),
    pendingChanges: new Map(),
    conflictLog: [],
  };

  return {
    // Track pending local changes
    trackPendingChange: (entityId: string, change: unknown) => {
      state.pendingChanges.set(entityId, change);
    },

    // Resolve conflict with last-write-wins strategy
    resolveConflict: (
      entityId: string,
      localVersion: number,
      serverVersion: number,
      localData: unknown,
      serverData: unknown
    ): unknown => {
      state.conflictLog.push({
        entity: entityId,
        expectedVersion: localVersion,
        actualVersion: serverVersion,
      });

      // Last-write-wins: prefer server version if newer
      if (serverVersion > localVersion) {
        state.pendingChanges.delete(entityId);
        return serverData;
      }

      // Local is newer, keep local
      return localData;
    },

    // Full state sync for recovery
    syncFullState: async (conversationId: string): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to sync: ${error.message}`);
      }

      state.lastSyncTime = new Date().toISOString();
      state.pendingChanges.clear();

      return data || [];
    },
  };
}
```

### Challenge 3: Cost Management
**Issue:** Chat adds additional LLM calls  
**Mitigation:**
- Implement rate limiting
- Cache common responses
- Use cheaper models for chat (e.g., Gemini Flash vs Pro)

### Challenge 4: Prompt Complexity
**Issue:** Multiple prompt layers (base + channel + chat) may conflict  
**Mitigation:**
- Clear priority hierarchy: Guardrails > Channel Context > Chat Feedback > Base Prompt
- Extensive testing with edge cases
- Version prompts to track changes

---

## Success Metrics

1. **Adoption:** % of users creating channel configs
2. **Engagement:** Avg messages per conversation
3. **Quality:** User ratings of chat-assisted vs manual reworks
4. **Efficiency:** Time to satisfactory titles (with vs without chat)
5. **Cost:** Additional API costs per run with chat enabled

---

## Notes

- Both features are **additive** - existing functionality remains unchanged
- Start with channel context as it provides immediate value with minimal risk
- Chat feature requires more UX consideration for workflow integration
- Consider A/B testing chat suggestions vs manual controls

---

**Document Version:** 1.0  
**Next Review:** After Phase 1 completion
