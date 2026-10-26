# Voice and AI Features

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [laris-app.tsx](file://src/components/laris-app.tsx)
- [route.ts (parse-order)](file://src/app/api/ai/parse-order/route.ts)
- [route.ts (scan-receipt)](file://src/app/api/ai/scan-receipt/route.ts)
- [route.ts (ask)](file://src/app/api/ai/ask/route.ts)
- [ai.ts](file://src/lib/ai.ts)
- [laris-data.ts](file://src/lib/laris-data.ts)
- [eval-voice.ts](file://scripts/eval-voice.ts)
- [voice.jsonl](file://evals/voice.jsonl)
</cite>

## Update Summary
**Changes Made**
- Updated Tanya Laris copilot section to reflect complete architecture overhaul with context-aware approach
- Enhanced tools documentation for revenue analysis, profit calculations, product ranking, stock alerts, customer segmentation, and expense breakdowns
- Added detailed explanation of local fallback mode implementation
- Updated workspace context loading and multi-workspace support details
- Enhanced confidence scoring and result reliability sections

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
Laris provides AI-powered operational features for Indonesian F&B small businesses. The voice and AI layer supports:
- Voice-to-cart ordering using the Web Speech API with Indonesian language support.
- A deterministic local parser for text orders, with Google Gemini as a fallback for complex or audio-based orders.
- Receipt scanning through multimodal OCR with inventory mapping, unit normalization, and price-hike detection.
- **Enhanced Tanya Laris copilot** with context-aware architecture supporting multi-workspace environments, featuring advanced business intelligence tools for revenue analysis, profit calculations, product ranking, stock alerts, customer segmentation, and expense breakdowns with robust local fallback mode.

The system is designed to remain usable when external AI services are unavailable by falling back to deterministic logic, mock data in demo mode, or rule-based summaries.

## Project Structure
The AI features span three layers:
- Frontend UI: voice capture, receipt upload, assistant chat, and confirmation flows.
- Server API routes: request validation, workspace context loading, AI calls, and fallback handling.
- Domain library: deterministic parsing, inventory and sales models, cost calculations, and telemetry helpers.

```mermaid
graph TB
subgraph "Frontend"
UI["LarisApp<br/>Voice, Scan, Assistant"]
end
subgraph "Next.js API Routes"
ParseOrder["/api/ai/parse-order"]
ScanReceipt["/api/ai/scan-receipt"]
Ask["/api/ai/ask"]
end
subgraph "AI Services"
Gemini["Google Gemini"]
end
subgraph "Domain Library"
LarisData["laris-data.ts<br/>Parser, Models, Ledger"]
AiLib["ai.ts<br/>Context, Telemetry, Catalog Context"]
end
UI --> ParseOrder
UI --> ScanReceipt
UI --> Ask
ParseOrder --> Gemini
ScanReceipt --> Gemini
Ask --> Gemini
ParseOrder --> LarisData
ScanReceipt --> LarisData
Ask --> LarisData
ParseOrder --> AiLib
ScanReceipt --> AiLib
Ask --> AiLib
```

**Diagram sources**
- [laris-app.tsx:311-390](file://src/components/laris-app.tsx#L311-L390)
- [route.ts (parse-order):31-127](file://src/app/api/ai/parse-order/route.ts#L31-L127)
- [route.ts (scan-receipt):54-214](file://src/app/api/ai/scan-receipt/route.ts#L54-L214)
- [route.ts (ask):77-216](file://src/app/api/ai/ask/route.ts#L77-L216)
- [ai.ts:9-125](file://src/lib/ai.ts#L9-L125)
- [laris-data.ts:421-474](file://src/lib/laris-data.ts#L421-L474)

**Section sources**
- [README.md:24-57](file://README.md#L24-L57)
- [README.md:97-110](file://README.md#L97-L110)

## Core Components
- Voice recognition: Browser-side speech recognition targeting Indonesian (`id-ID`), with graceful error messages when unsupported or permission denied.
- Order parsing pipeline: Local deterministic parser first; Gemini used when configured and available, especially for audio input.
- Receipt scanning: Multimodal OCR via Gemini, followed by inventory matching, unit normalization, and price-hike alerts.
- **Enhanced Tanya Laris copilot**: Context-aware architecture with typed tools for business intelligence, including revenue analysis, profit calculations, product ranking, stock alerts, customer segmentation, and expense breakdowns with comprehensive local fallback mode.
- Shared infrastructure: Workspace context loading, catalog injection into prompts, Zod schemas, and telemetry logging.

**Section sources**
- [laris-app.tsx:342-359](file://src/components/laris-app.tsx#L342-L359)
- [route.ts (parse-order):14-68](file://src/app/api/ai/parse-order/route.ts#L14-L68)
- [route.ts (scan-receipt):14-107](file://src/app/api/ai/scan-receipt/route.ts#L14-L107)
- [route.ts (ask):46-94](file://src/app/api/ai/ask/route.ts#L46-L94)
- [ai.ts:23-69](file://src/lib/ai.ts#L23-L69)

## Architecture Overview
The AI architecture follows a layered fallback pattern:
1. Frontend validates inputs and captures voice or images.
2. API route validates payloads with Zod and loads workspace context.
3. If Gemini is configured, the route calls Gemini with structured output schemas.
4. On failure or missing configuration, routes fall back to deterministic parsers, mock OCR, or rule-based answers.
5. All successful or failed AI calls log telemetry without crashing user requests.

```mermaid
sequenceDiagram
participant Client as "LarisApp Frontend"
participant Route as "Next.js API Route"
participant Context as "requireAiContext"
participant Gemini as "Google Gemini"
participant Parser as "Local Parser / Rules"
Client->>Route : POST parse-order / scan-receipt / ask
Route->>Route : Validate payload with Zod
Route->>Context : Load workspace context
Context-->>Route : BusinessState + catalog
alt Gemini configured
Route->>Gemini : Structured multimodal/text call
Gemini-->>Route : Parsed result
Route->>Route : Post-process, verify, normalize
Route-->>Client : Success response with source
else Gemini unavailable or fails
Route->>Parser : Deterministic parser or rules
Parser-->>Route : Local result
Route-->>Client : Fallback response with warning or notice
end
```

**Diagram sources**
- [route.ts (parse-order):52-127](file://src/app/api/ai/parse-order/route.ts#L52-L127)
- [route.ts (scan-receipt):98-214](file://src/app/api/ai/scan-receipt/route.ts#L98-L214)
- [route.ts (ask):86-216](file://src/app/api/ai/ask/route.ts#L86-L216)
- [ai.ts:30-69](file://src/lib/ai.ts#L30-L69)

## Detailed Component Analysis

### Voice Recognition System
The frontend implements voice input using the Web Speech API:
- Detects `SpeechRecognition` or `webkitSpeechRecognition`.
- Sets language to Indonesian (`id-ID`).
- Captures transcript and immediately sends it to the order parsing flow.
- Handles browser incompatibility, microphone permission errors, and recording lifecycle.

```mermaid
flowchart TD
Start(["Start Voice"]) --> CheckBrowser["Check SpeechRecognition support"]
CheckBrowser --> |No| ShowError["Show unsupported message"]
CheckBrowser --> |Yes| CreateRecognition["Create recognition instance"]
CreateRecognition --> SetLang["Set lang = id-ID"]
SetLang --> StartListening["Start listening"]
StartListening --> OnResult["Transcript received"]
OnResult --> SendToParse["Send transcript to handleVoiceParse"]
StartListening --> OnError["Microphone error or permission denied"]
OnError --> StopRecording["Stop recording and show error"]
StartListening --> OnEnd["Recognition ended"]
OnEnd --> StopRecording
```

**Diagram sources**
- [laris-app.tsx:342-359](file://src/components/laris-app.tsx#L342-L359)

**Section sources**
- [laris-app.tsx:342-359](file://src/components/laris-app.tsx#L342-L359)

### AI Order Parsing Pipeline
The order parsing pipeline supports both text and audio:
- Request schema enforces mode, optional text, optional base64 audio, MIME type, and size limits.
- Workspace context is loaded; active product catalog is required.
- If Gemini is not configured:
  - Audio-only requests return a service unavailable error.
  - Text-only requests use the deterministic parser.
- If Gemini is configured:
  - Audio and text are sent as multimodal content.
  - Output is validated against a strict Zod schema.
  - Product IDs are verified against the active catalog; unknown items are moved to an `unknown` array.
  - On Gemini failure, text input falls back to the local parser with a warning.

```mermaid
flowchart TD
Input(["POST /api/ai/parse-order"]) --> Validate["Validate request schema"]
Validate --> LoadContext["Load workspace context"]
LoadContext --> HasCatalog{"Active catalog exists?"}
HasCatalog --> |No| Error422["Return 422: add menu"]
HasCatalog --> |Yes| CheckGemini{"Gemini configured?"}
CheckGemini --> |No| AudioOnly{"Audio provided?"}
AudioOnly --> |Yes| Error503["Return 503: Gemini required"]
AudioOnly --> |No| LocalParser["Use deterministic parser"]
LocalParser --> ReturnLocal["Return source=local-parser"]
CheckGemini --> |Yes| CallGemini["Call Gemini with audio+text"]
CallGemini --> VerifyItems["Verify productId against catalog"]
VerifyItems --> LogSuccess["Log telemetry ok=true"]
LogSuccess --> ReturnGemini["Return source=gemini"]
CallGemini --> CatchError["Catch Gemini error"]
CatchError --> LogFail["Log telemetry ok=false"]
LogFail --> FallbackText{"Text provided?"}
FallbackText --> |No| Error502["Return 502: audio processing failed"]
FallbackText --> |Yes| FallbackParser["Use deterministic parser"]
FallbackParser --> ReturnFallback["Return source=fallback-parser with warning"]
```

**Diagram sources**
- [route.ts (parse-order):14-127](file://src/app/api/ai/parse-order/route.ts#L14-L127)

#### Request and Response Schemas
- Request fields:
  - `mode`: `"local"` or `"cloud"`.
  - `text`: optional trimmed string up to 2000 characters.
  - `audio`: optional base64-encoded audio up to 8 MB.
  - `mimeType`: allowed audio MIME types.
- Response fields:
  - `items`: parsed cart items with `productId`, `quantity`, optional `note`.
  - `payment`: `"Tunai"`, `"QRIS"`, or `"Transfer"`.
  - `unknown`: unrecognized phrases or invalid product references.
  - `source`: `"local-parser"`, `"gemini"`, or `"fallback-parser"`.
  - Optional `warning` on fallback.

**Section sources**
- [route.ts (parse-order):14-29](file://src/app/api/ai/parse-order/route.ts#L14-L29)
- [route.ts (parse-order):31-68](file://src/app/api/ai/parse-order/route.ts#L31-L68)
- [route.ts (parse-order):95-127](file://src/app/api/ai/parse-order/route.ts#L95-L127)

### Local Deterministic Parser
The deterministic parser handles realistic Indonesian ordering patterns:
- Supports slang aliases such as `kopsu`, `amer`, `cokelat`, `teh manis`.
- Parses quantities from digits and Indonesian number words.
- Extracts modifiers like less sugar, no sugar, less ice, no ice.
- Detects payment methods and defaults to cash if unspecified.
- Moves unmatched clauses to `unknown` rather than failing the entire request.

```mermaid
flowchart TD
Start(["parseOrder(text, catalog)"]) --> Normalize["Normalize text: lowercase, punctuation split"]
Normalize --> SplitClauses["Split by comma, semicolon, newline, dan/&/+"]
SplitClauses --> ForEachClause["Process each clause"]
ForEachClause --> PaymentCheck{"Payment keyword found?"}
PaymentCheck --> |Yes| UpdatePayment["Update payment method"]
PaymentCheck --> |No| MatchPattern["Match item pattern"]
UpdatePayment --> RemovePayment["Remove payment part from clause"]
RemovePayment --> MatchPattern
MatchPattern --> ValidMatch{"Valid alias and quantity?"}
ValidMatch --> |No| AddUnknown["Add original clause to unknown"]
ValidMatch --> |Yes| BuildItem["Build CartItem with productId, quantity, note"]
AddUnknown --> NextClause["Next clause"]
BuildItem --> NextClause
NextClause --> End(["Return items, payment, unknown"])
```

**Diagram sources**
- [laris-data.ts:421-474](file://src/lib/laris-data.ts#L421-L474)

**Section sources**
- [laris-data.ts:406-474](file://src/lib/laris-data.ts#L406-L474)

### Receipt Scanning with Multimodal OCR
Receipt scanning supports image uploads via form data or JSON:
- Validates MIME type and size.
- Loads workspace inventory context.
- Without Gemini:
  - Cloud mode returns a service unavailable error.
  - Local demo mode returns mock OCR data with a simulated price increase.
- With Gemini:
  - Sends image and instruction prompt.
  - Normalizes units such as grams to kilograms, milliliters to liters, pieces to dozens.
  - Computes unit cost, compares with current inventory cost, and flags price hikes above 3%.
  - Skips lines with unconvertible units and reports them separately.

```mermaid
flowchart TD
Upload(["POST /api/ai/scan-receipt"]) --> ValidateImage["Validate image format and size"]
ValidateImage --> LoadContext["Load workspace context"]
LoadContext --> HasInventory{"Inventory exists?"}
HasInventory --> |No| Error422["Return 422: add ingredients"]
HasInventory --> |Yes| CheckGemini{"Gemini configured?"}
CheckGemini --> |No| DemoMode{"Cloud mode?"}
DemoMode --> |Yes| Error503["Return 503: Gemini required"]
DemoMode --> |No| MockOcr["Return mock OCR with simulated price hike"]
CheckGemini --> |Yes| CallGeminiOCR["Call Gemini multimodal OCR"]
CallGeminiOCR --> ParseLines["Parse receipt lines"]
ParseLines --> NormalizeUnit["Normalize quantity and unit"]
NormalizeUnit --> ComputeCost["Compute unit cost and diff percent"]
ComputeCost --> FlagHike{"Price hike > 3%?"}
FlagHike --> |Yes| MarkHike["Mark priceHike object"]
FlagHike --> |No| SkipHike["No hike flag"]
MarkHike --> ReturnOcr["Return processed lines"]
SkipHike --> ReturnOcr
CallGeminiOCR --> CatchError["Catch OCR error"]
CatchError --> ReturnError["Return 502 with guidance"]
```

**Diagram sources**
- [route.ts (scan-receipt):54-214](file://src/app/api/ai/scan-receipt/route.ts#L54-L214)

#### Receipt Schema and Processing Details
- Receipt schema includes supplier name, date, line items, and total.
- Each line includes raw name, matched inventory code, quantity, unit, unit price, and total price.
- Unit normalization maps common Indonesian and international units to base units.
- Price-hike detection uses percentage difference between new unit cost and existing inventory cost.

**Section sources**
- [route.ts (scan-receipt):14-52](file://src/app/api/ai/scan-receipt/route.ts#L14-L52)
- [route.ts (scan-receipt):109-134](file://src/app/api/ai/scan-receipt/route.ts#L109-L134)
- [route.ts (scan-receipt):157-202](file://src/app/api/ai/scan-receipt/route.ts#L157-L202)

### Enhanced Tanya Laris Copilot with Context-Aware Architecture
**Updated** Complete architecture overhaul with context-aware approach supporting multi-workspace environments and enhanced business intelligence tools.

Tanya Laris now features a sophisticated context-aware architecture that provides comprehensive business intelligence through typed tools:

#### Context-Aware Workspace Support
- Multi-workspace environment support with proper authentication and authorization
- Dynamic workspace context loading with business state isolation
- Secure workspace boundary enforcement through Supabase RLS policies
- Automatic workspace switching based on user membership

#### Advanced Business Intelligence Tools
The enhanced copilot exposes six specialized tools for business analysis:

1. **Revenue Analysis Tool** (`getRevenueSummary`)
   - Calculates revenue, transaction count, and average order value over configurable periods
   - Supports 1-90 day ranges with formatted currency output
   - Provides start/end dates for analytical periods

2. **Profit Calculation Tool** (`getProfitSummary`)
   - Estimates gross profit based on recipe costs and current pricing
   - Calculates margin percentages with clear disclaimers about operational costs
   - Uses real-time recipe cost data for accurate COGS estimation

3. **Product Ranking Tool** (`getTopSellingProducts`)
   - Ranks products by sales volume across all recorded transactions
   - Supports configurable limits (1-10 products)
   - Returns product names and quantities sold

4. **Stock Alert Tool** (`getLowStockAlerts`)
   - Identifies ingredients below reorder points
   - Includes supplier information and current stock levels
   - Prioritizes low-stock items for procurement planning

5. **Customer Segmentation Tool** (`getCustomerSegmentsSummary`)
   - Analyzes RFM (Recency, Frequency, Monetary) customer segments
   - Categorizes customers into: Juara, Setia, Potensial, Berisiko, Hilang
   - Provides segment counts for targeted marketing strategies

6. **Expense Breakdown Tool** (`getExpensesBreakdown`)
   - Aggregates operational expenses by category
   - Calculates total expenses with formatted currency display
   - Enables financial analysis and budgeting decisions

#### Local Fallback Mode Implementation
When Gemini is unavailable, the system provides comprehensive local fallback functionality:

- **Rule-based Answer Engine**: Sophisticated pattern matching for common business queries
- **Real-time Data Access**: Direct access to workspace business state without AI dependency
- **Intelligent Query Routing**: Automatic detection of query types and appropriate local responses
- **Graceful Degradation**: Maintains core functionality while clearly indicating local mode operation

```mermaid
sequenceDiagram
participant Client as "LarisApp Frontend"
participant AskRoute as "/api/ai/ask"
participant Tools as "Workspace Data Tools"
participant Gemini as "Google Gemini"
participant LocalRules as "Local Rule Engine"
Client->>AskRoute : POST question + history
AskRoute->>AskRoute : Validate request schema
AskRoute->>AskRoute : Load workspace context
alt Gemini unavailable
AskRoute->>LocalRules : Process with local rules
LocalRules->>LocalRules : Pattern match query type
LocalRules-->>AskRoute : Rule-based answer
AskRoute-->>Client : Local answer with source="local-rules"
else Gemini available
AskRoute->>Gemini : generateText with tools
Gemini->>Tools : Call specific business intelligence tool
Tools-->>Gemini : Structured business data
Gemini-->>AskRoute : Natural language answer
AskRoute-->>Client : Answer with source="gemini"
end
```

**Diagram sources**
- [route.ts (ask):77-216](file://src/app/api/ai/ask/route.ts#L77-L216)

#### Enhanced Confidence Scoring and Reliability
The updated system provides improved confidence indicators:
- **Source Attribution**: Clear indication of whether responses come from Gemini, local rules, or fallback systems
- **Tool Usage Tracking**: Monitoring which business intelligence tools were invoked
- **Data Freshness Indicators**: Timestamps and period specifications for analytical queries
- **Limitation Transparency**: Clear communication about data availability and calculation limitations

**Section sources**
- [route.ts (ask):9-16](file://src/app/api/ai/ask/route.ts#L9-L16)
- [route.ts (ask):46-94](file://src/app/api/ai/ask/route.ts#L46-L94)
- [route.ts (ask):96-174](file://src/app/api/ai/ask/route.ts#L96-L174)
- [route.ts (ask):176-216](file://src/app/api/ai/ask/route.ts#L176-L216)

### Confidence Scoring and Result Reliability
The implementation does not expose numeric confidence scores. Instead, reliability is communicated through:
- `source` field indicating whether results came from Gemini, local parser, fallback parser, mock OCR, or local rules.
- `unknown` arrays for unrecognized order items.
- `skippedLines` for receipt lines that could not be safely normalized.
- `notice` fields for mock OCR and skipped-line warnings.
- `priceHike` objects for significant cost increases.
- Telemetry logs capturing success/failure, latency, and basic input/output metadata.

For future enhancements, confidence scoring could be added by:
- Returning Gemini model confidence or token usage metrics.
- Computing parser match quality based on alias length, modifier coverage, and clause ambiguity.
- Tracking OCR line-level uncertainty through repeated extraction or multi-image prompts.
- Implementing tool invocation confidence scores for business intelligence queries.

**Section sources**
- [route.ts (parse-order):95-127](file://src/app/api/ai/parse-order/route.ts#L95-L127)
- [route.ts (scan-receipt):157-202](file://src/app/api/ai/scan-receipt/route.ts#L157-L202)
- [ai.ts:97-125](file://src/lib/ai.ts#L97-L125)

## Dependency Analysis
The AI features depend on shared infrastructure:
- `ai.ts` provides Gemini initialization, workspace context loading, catalog context injection, error response formatting, and telemetry logging.
- `laris-data.ts` provides domain models, deterministic parsing, ledger operations, and currency formatting.
- Frontend components orchestrate user interactions and call API routes.

```mermaid
graph LR
Frontend["laris-app.tsx"] --> ParseRoute["parse-order/route.ts"]
Frontend --> ScanRoute["scan-receipt/route.ts"]
Frontend --> AskRoute["ask/route.ts"]
ParseRoute --> AiLib["ai.ts"]
ScanRoute --> AiLib
AskRoute --> AiLib
ParseRoute --> LarisData["laris-data.ts"]
ScanRoute --> LarisData
AskRoute --> LarisData
```

**Diagram sources**
- [laris-app.tsx:311-390](file://src/components/laris-app.tsx#L311-L390)
- [route.ts (parse-order):1-127](file://src/app/api/ai/parse-order/route.ts#L1-L127)
- [route.ts (scan-receipt):1-214](file://src/app/api/ai/scan-receipt/route.ts#L1-L214)
- [route.ts (ask):1-216](file://src/app/api/ai/ask/route.ts#L1-L216)
- [ai.ts:1-125](file://src/lib/ai.ts#L1-L125)
- [laris-data.ts:1-494](file://src/lib/laris-data.ts#L1-L494)

**Section sources**
- [ai.ts:9-125](file://src/lib/ai.ts#L9-L125)
- [laris-data.ts:421-474](file://src/lib/laris-data.ts#L421-L474)

## Performance Considerations
- Payload limits prevent large audio and image uploads:
  - Parse order: 12 MB body, 8 MB audio.
  - Scan receipt: 12 MB body, 8 MB image.
- Gemini model selection uses environment variables with a default fast model.
- Tanya Laris limits tool-use steps to reduce latency.
- Telemetry is logged asynchronously and must not crash primary requests.
- Local fallback ensures responsiveness when AI services are slow or unavailable.

Recommendations:
- Add rate limiting per business or IP at the API layer.
- Cache frequent catalog context responses where appropriate.
- Introduce retry budgets and circuit breakers for Gemini calls.
- Surface latency and token usage in telemetry dashboards.
- Consider streaming responses for long-running AI queries.
- Implement caching for frequently accessed business intelligence data.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and their handling:
- Unsupported browser or microphone permission denied:
  - Frontend shows clear Indonesian error messages and falls back to text input.
- Missing Gemini configuration:
  - Parse order returns 503 for audio-only requests; text falls back to local parser.
  - Scan receipt returns 503 in cloud mode; local demo returns mock OCR.
  - Tanya Laris returns local rule-based answers with clear source attribution.
- Invalid workspace or authentication:
  - Context loading throws structured errors with 401 or 403 status codes.
- Empty or incomplete catalog/inventory:
  - Parse order returns 422 if no active menu exists.
  - Scan receipt returns 422 if no ingredients exist.
- Gemini failures:
  - Parse order falls back to local parser for text input.
  - Scan receipt returns 502 with guidance to check image clarity.
  - Tanya Laris returns 502 after telemetry logging.

Operational checks:
- Verify `.env` contains `GOOGLE_GENERATIVE_AI_API_KEY` for full AI features.
- Ensure Supabase is configured for cloud mode workspace data.
- Run voice evaluation benchmark to validate deterministic parser accuracy.
- Monitor workspace context loading for multi-workspace deployments.

**Section sources**
- [laris-app.tsx:342-359](file://src/components/laris-app.tsx#L342-L359)
- [route.ts (parse-order):52-68](file://src/app/api/ai/parse-order/route.ts#L52-L68)
- [route.ts (scan-receipt):98-134](file://src/app/api/ai/scan-receipt/route.ts#L98-L134)
- [route.ts (ask):86-94](file://src/app/api/ai/ask/route.ts#L86-L94)
- [ai.ts:30-74](file://src/lib/ai.ts#L30-L74)
- [README.md:51-57](file://README.md#L51-L57)

## Conclusion
Laris's voice and AI features combine robust frontend UX, strict server-side validation, deterministic fallbacks, and structured AI integration. The system prioritizes reliability:
- Voice input works locally even without AI services.
- Orders are parsed deterministically and only enhanced by Gemini when safe.
- Receipt scanning normalizes units and highlights price changes.
- **Enhanced Tanya Laris provides comprehensive business intelligence** through context-aware architecture with advanced tools for revenue analysis, profit calculations, product ranking, stock alerts, customer segmentation, and expense breakdowns, all supported by robust local fallback mechanisms.
- Telemetry and clear error responses help operators diagnose issues without compromising core operations.

Future improvements should focus on confidence scoring, rate limiting, observability, controlled retries, and enhanced business intelligence capabilities while preserving the offline-first design philosophy.