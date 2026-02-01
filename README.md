# KnowWhy - Decision Detection and Chat Application

A Next.js application that helps users detect decision points in conversations and provides structured decision briefs to support better decision-making.

## Features

- **Decision Detection**: Automatically identifies decision points in conversations using AI
- **Decision Briefs**: Generate structured briefs for important decisions with context and options
- **Multi-Model Support**: Supports both Groq and OpenRouter AI providers
- **Chat Interface**: Interactive chat interface for conversations and decision discussions
- **Conversation Management**: Organize and manage multiple conversations with decision tracking

## Tech Stack

- **Frontend**: Next.js 15 with React Server Components
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **AI Providers**: Groq (Llama 3.1) and OpenRouter (multiple models)
- **Storage**: Browser localStorage with fallback
- **Type Safety**: TypeScript

## Architecture

The application follows a clean architecture pattern with the following layers:

### Models
- `DecisionBrief`: Structured representation of decisions with context, options, and outcomes
- `DecisionCandidate`: Raw decision points detected in conversations
- `ConversationBlock`: Chat messages with decision context

### Services
- `DecisionDetectionService`: AI-powered decision point detection
- `DecisionContextService`: Context extraction and management
- `LLMService`: Unified interface for AI providers
- `StorageService`: Local storage management with fallback

### ViewModels
- `DecisionDetectionViewModel`: Decision detection UI state
- `DecisionBriefViewModel`: Decision brief management
- `IngestionViewModel`: Document processing
- `SearchViewModel`: Decision search and filtering

### Components
- Modern React components with TypeScript
- Responsive design with Tailwind CSS
- Accessible UI patterns

## Installation

1. Clone the repository:
```bash
git clone https://github.com/KameshEas/KnowWhy.git
cd KnowWhy
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
# Groq API
GROQ_API_KEY=your_groq_api_key

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional: Custom model IDs
GROQ_MODEL_ID=llama-3.1-70b-versatile
OPENROUTER_MODEL_ID=anthropic/claude-sonnet-4-20250514
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Usage

### Decision Detection
1. Start a conversation in the chat interface
2. The system will automatically detect decision points
3. Review detected decisions in the sidebar
4. Click on decisions to view detailed briefs

### Decision Briefs
1. Create structured decision briefs with:
   - Decision context and background
   - Available options with pros/cons
   - Potential outcomes and impacts
   - Implementation considerations

### Multi-Model Support
The application supports switching between AI providers:
- **Groq**: Fast inference with Llama 3.1 models
- **OpenRouter**: Access to multiple AI models from different providers

## API Endpoints

The application provides API routes for:

- `/api/groq/decision-detection`: Decision detection using Groq
- `/api/groq/brief-generation`: Decision brief generation using Groq
- `/api/groq/chat`: Chat interface using Groq
- `/api/openrouter/decision-detection`: Decision detection using OpenRouter
- `/api/openrouter/brief-generation`: Decision brief generation using OpenRouter
- `/api/openrouter/chat`: Chat interface using OpenRouter

## Configuration

### AI Provider Configuration

Configure your preferred AI provider in the settings:

```typescript
// src/config/groq.ts
export const GROQ_CONFIG = {
  apiKey: process.env.GROQ_API_KEY || '',
  modelId: process.env.GROQ_MODEL_ID || 'llama-3.1-70b-versatile',
  maxTokens: 4096,
  temperature: 0.7,
};

// src/config/openrouter.ts
export const OPENROUTER_CONFIG = {
  apiKey: process.env.OPENROUTER_API_KEY || '',
  modelId: process.env.OPENROUTER_MODEL_ID || 'anthropic/claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
};
```

### Rate Limiting

The application includes built-in rate limiting to prevent API abuse:

```typescript
// src/utils/rate-limiter.ts
const rateLimiter = new RateLimiter({
  tokensPerInterval: 60,
  interval: 'minute',
  fireImmediately: true,
});
```

## Development

### Project Structure

```
src/
├── app/                    # Next.js app directory
├── components/             # React components
├── config/                 # Configuration files
├── models/                 # TypeScript models
├── services/               # Business logic services
├── utils/                  # Utility functions
└── viewmodels/             # View model classes
```

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation in the `docs/` directory
- Review the implementation guide in `PHASE_2_3_IMPLEMENTATION_GUIDE.md`

## Acknowledgments

- Built with [Next.js](https://nextjs.org)
- Styled with [Tailwind CSS](https://tailwindcss.com)
- AI integration with [Groq](https://groq.com) and [OpenRouter](https://openrouter.ai)