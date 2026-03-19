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
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  voice_guidelines JSONB DEFAULT '{}',
  banned_phrases TEXT[] DEFAULT '{}',
  preferred_archetypes TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
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

**Example channel context injection:**
```typescript
// Before generation, prepend user-defined guidelines
const systemContext = channelConfig ? `
CHANNEL CONTEXT:
- Voice: ${channelConfig.voice_guidelines.tone}
- Style: ${channelConfig.voice_guidelines.style}
- Banned: ${channelConfig.banned_phrases.join(', ')}
- Preferred: ${channelConfig.preferred_archetypes.join(', ')}

Apply these guidelines to all title generation while maintaining archetype requirements.
` : '';

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
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES generation_runs(id),
  messages JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'active', -- active, closed
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**New Table: `conversation_actions`**
```sql
CREATE TABLE conversation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  action_type TEXT NOT NULL, -- 'regenerate', 'rescore', 'rerank', 'recontent'
  parameters JSONB,
  triggered_by_message_id TEXT,
  completed_at TIMESTAMP
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

**Chat System Prompt (`src/lib/prompts/chat-system.ts`):**
```typescript
export const chatSystemPrompt = (context: ChatContext) => `
You are a helpful assistant for refining YouTube and podcast titles.

CURRENT RUN CONTEXT:
- Podcast: ${context.episodeTitle}
- Guest Tier: ${context.guestTier}
- Hot Takes: ${context.hotTakes.map(t => t.text).join(', ')}
- Generated Titles: ${context.titles.map(t => t.title).join(', ')}
- Current Scores: ${JSON.stringify(context.scores)}

USER CHANNEL CONTEXT:
${context.channelConfig?.systemPrompt || 'None configured'}

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
`;
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
- New types for `ChannelConfig`, `Conversation`, `ChatMessage`
- Extend existing generation types with optional context

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

### Error Handling

**Existing retry logic:**
- Extend `isTransientError` function for chat-specific errors
- Add conversation state recovery on failures

### Security

**Authentication:**
- Ensure channel configs are user-scoped
- Validate conversation access (user can only chat about their own runs)
- Rate limiting on chat API to prevent abuse

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
- Use Supabase realtime subscriptions
- Implement optimistic updates with rollback
- Clear loading states and progress indicators

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
