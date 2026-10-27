# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Development server:**

```bash
bun run dev
```

Runs Next.js development server with Turbopack for fast hot reloading.

**Build and production:**

```bash
bun run build     # Build for production
bun start         # Start production server
```

**Code quality:**

```bash
bun run lint           # Run ESLint
bun run lint:fix       # Auto-fix ESLint issues
bun run format         # Format code with Prettier
bun run format:check   # Check code formatting
```

**Testing:**

```bash
bunx jest              # Run all tests
bunx jest --watch      # Run tests in watch mode
bunx jest <test-file>  # Run specific test file
```

**Type checking:**

```bash
bunx tsc --noEmit      # Type check without emitting files
```

## Architecture Overview

This is a Next.js 15 dashboard application for OCR model management and training with the following key architectural components:

### Core Structure

- **App Router**: Uses Next.js App Router with route groups `(protected)` for authenticated pages
- **Protected Layout**: All authenticated pages use a sidebar layout with navigation (`src/app/(protected)/layout.tsx`)
- **API Proxy**: External API calls are proxied through `/next-api/external/[...path]/route.ts`

### Key Domains

- **ML Models**: OCR model management with 5 types (Layout, OCR Classification/Recognition/Detection, Table Recognition)
- **Training**: Real-time ML model training with SSE (Server-Sent Events) progress tracking
- **Projects**: Label Studio project integration for data management
- **Monitoring**: System health and logging dashboards

### State Management

- **Custom Hooks**: Domain-specific hooks in `src/hooks/` for API data fetching and training state
- **SSE Integration**: Real-time training progress via Server-Sent Events using custom `ApiClient`
- **Training State**: Centralized training state management with `useTrainingState` hook

### API Layer

- **ApiClient**: Custom HTTP client (`src/lib/api/client.ts`) with SSE support, CSRF protection, and automatic error handling
- **API Proxy**: External API calls are automatically proxied through `/next-api/external/[...path]/route.ts` with JWT token refresh handling
- **Endpoints**: Organized API endpoints in `src/lib/api/endpoints/` by domain
- **Types**: Comprehensive TypeScript types for API responses in `src/lib/api/models/`

### UI Components

- **Shadcn/ui**: Base UI components in `src/components/ui/`
- **Custom Components**: Domain-specific components organized by feature
- **Sidebar Navigation**: App sidebar with project navigation and user management

### Key Model Types

```typescript
enum ModelType {
  LAYOUT = 'layout',
  OCRCLS = 'ocrcls',
  OCRREC = 'ocrrec',
  OCRDET = 'ocrdet',
  TABREC = 'tabrec',
}
```

### Training Flow

1. Model selection via `TrainingSelectionPanel`
2. Real-time progress tracking with `TrainingStatusPanel`
3. SSE-based progress updates through `useTrain` hook
4. Training state management with metrics persistence

### Background Tasks

- **Task Management**: Generic background task system (`src/lib/background-tasks/`) supporting numeric, stage-based, and indeterminate progress
- **Training Executor**: SSE-based streaming executor for real-time training progress tracking
- **Training History**: Persistent training history storage (`src/lib/training-history.ts`) with localStorage

### External Integrations

- **Label Studio**: Project and task management with JWT token authentication
- **Gradio**: Model inference interface
- **Swagger**: API documentation interface

### Development Patterns

- **Entity Layer**: Domain entities in `src/entities/` with type-safe enum handling
- **Response Mapping**: API responses are mapped to internal entities via namespace functions
- **SSE Streaming**: Custom ApiClient supports Server-Sent Events for real-time progress tracking
- **Protected Routes**: All dashboard routes are wrapped in `(protected)` route group with authentication

When modifying training functionality, ensure SSE connections are properly handled and training state is correctly synchronized across components. The background task system handles task lifecycle and progress reporting automatically.
