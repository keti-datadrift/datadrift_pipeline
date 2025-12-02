# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Development server:**
```bash
npm run dev
```
Runs Next.js development server with Turbopack for fast hot reloading.

**Build and production:**
```bash
npm run build     # Build for production
npm start         # Start production server
```

**Code quality:**
```bash
npm run lint           # Run ESLint
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Format code with Prettier
npm run format:check   # Check code formatting
```

**Testing:**
```bash
npx jest              # Run all tests
npx jest --watch      # Run tests in watch mode
npx jest <test-file>  # Run specific test file
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
  TABREC = 'tabrec'
}
```

### Training Flow
1. Model selection via `TrainingSelectionPanel`
2. Real-time progress tracking with `TrainingStatusPanel`
3. SSE-based progress updates through `useTrain` hook
4. Training state management with metrics persistence

### External Integrations
- **Label Studio**: Project and task management
- **Gradio**: Model inference interface  
- **Swagger**: API documentation interface

When modifying training functionality, ensure SSE connections are properly handled and training state is correctly synchronized across components.