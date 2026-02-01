# KnowWhy - Decision Intelligence Platform

An AI-powered platform that automatically detects, documents, and retrieves decisions from team conversations across Slack, meetings, and other communication channels.

## 🎯 Overview

KnowWhy solves the critical problem of decision visibility and context in modern software teams. It automatically:

- **Detects decisions** in real-time from conversations
- **Generates structured decision briefs** with rationale and context
- **Provides semantic search** for finding decisions and their context
- **Maintains decision lineage** with source citations
- **Integrates seamlessly** with existing team workflows

## 🏗️ Architecture

### Core Components

#### 1. **Ingestion Layer**
- **Slack Integration** (`src/integrations/slack/`) - Real-time message ingestion with thread support
- **Meeting Transcripts** (`src/integrations/meeting-transcripts/`) - Zoom/Google Meet transcript processing
- **Unified Data Model** (`src/models/ConversationEvent.ts`) - Consistent structure for all conversation sources

#### 2. **Storage Layer**
- **Encrypted Raw Storage** (`src/services/EncryptedStorageService.ts`) - Secure conversation storage with retention policies
- **Decision Brief Store** (`src/services/DecisionBriefService.ts`) - Structured decision documentation
- **Semantic Indexing** (`src/services/SemanticIndexingService.ts`) - Vector embeddings for semantic search

#### 3. **AI Processing Layer**
- **Decision Detection Agent** (`src/agents/DecisionDetectionAgent.ts`) - Sliding window analysis with confidence scoring
- **Context Extraction Agent** (`src/agents/ContextExtractionAgent.ts`) - Evidence gathering and context building
- **Rationale Generation Agent** (`src/agents/RationaleGenerationAgent.ts`) - Structured decision briefs with citations

#### 4. **Query & Retrieval Layer**
- **Natural Language Query Service** (`src/services/NaturalLanguageQueryService.ts`) - Intent classification and query optimization
- **Semantic Search** - Decision-first, conversation fallback retrieval
- **Answer Generation** - Inline citations and source references

#### 5. **Web Dashboard**
- **Decision Timeline** - Chronological view of all decisions
- **"Ask KnowWhy" Chat** - Natural language Q&A interface
- **Feedback Loops** - User feedback for continuous improvement

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- OpenAI API key (for LLM features)
- Slack workspace (for Slack integration)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/your-org/knowwhy.git
cd knowwhy
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up database:**
```bash
npx prisma migrate dev
npx prisma generate
```

5. **Start the development server:**
```bash
npm run dev
```

### Environment Configuration

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/knowwhy"

# Authentication
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"

# LLM Providers
OPENAI_API_KEY="your-openai-key"
GROQ_API_KEY="your-groq-key"

# Slack Integration
SLACK_BOT_TOKEN="xoxb-your-token"
SLACK_SIGNING_SECRET="your-signing-secret"
SLACK_CLIENT_ID="your-client-id"
SLACK_CLIENT_SECRET="your-client-secret"

# Feature Flags
ENABLE_DECISION_DETECTION=true
ENABLE_SEMANTIC_SEARCH=true
ENABLE_QUERY_OPTIMIZATION=true
```

## 📖 Usage

### Slack Integration

1. **Install the Slack app** in your workspace
2. **Authorize the app** to access your channels
3. **Configure channels** to monitor for decisions
4. **Start conversing** - decisions are detected automatically

### Web Dashboard

1. **Visit the dashboard** at `http://localhost:3000`
2. **Sign in** with your Slack account
3. **View decisions** in the timeline view
4. **Ask questions** using the "Ask KnowWhy" chat interface

### API Usage

```javascript
// Detect decisions in a conversation
const decisions = await DecisionDetectionService.detectDecisions(conversation);

// Generate decision brief
const brief = await DecisionBriefService.generateBrief(decision, context);

// Search for decisions
const results = await NaturalLanguageQueryService.processQuery(
  "What decisions were made about the API design last week?",
  userId
);
```

## 🔧 Configuration

### Decision Detection

```typescript
// Configure detection sensitivity
const config = {
  confidenceThreshold: 0.7,        // Minimum confidence to consider a decision
  slidingWindowSize: 10,           // Number of messages per analysis window
  deduplicationWindow: 300,        // Seconds to deduplicate similar decisions
  enableRepair: true,              // Enable decision repair for low confidence
};
```

### Semantic Search

```typescript
// Configure search behavior
const searchConfig = {
  model: 'text-embedding-3-small', // Embedding model
  topK: 20,                        // Number of results to return
  relevanceThreshold: 0.3,         // Minimum similarity score
  enableQueryOptimization: true,   // Optimize user queries
};
```

### Retention Policies

```typescript
// Configure data retention
const retentionConfig = {
  slack: 365,        // Keep Slack data for 1 year
  zoom: 730,         // Keep Zoom transcripts for 2 years
  jira: 1095,        // Keep Jira data for 3 years
  upload: 365,       // Keep uploaded data for 1 year
};
```

## 🛡️ Security & Privacy

### Data Encryption
- **At Rest**: AES-256 encryption for all stored data
- **In Transit**: TLS 1.3 for all API communications
- **Key Management**: Secure key storage with rotation

### Access Control
- **OAuth 2.0**: Secure authentication via Slack
- **Role-Based Access**: Organization-level permissions
- **Audit Logging**: Complete audit trail of all operations

### Data Retention
- **Automatic Cleanup**: Configurable retention policies
- **GDPR Compliance**: Right to be forgotten implementation
- **Data Export**: Full data export capabilities

## 📊 Monitoring & Observability

### Metrics
- Decision detection rate and accuracy
- Query response times and success rates
- Storage usage and retention compliance
- User engagement and satisfaction

### Logging
- Structured logging with correlation IDs
- Performance monitoring and alerting
- Error tracking and debugging

### Health Checks
- Service availability monitoring
- Database connection health
- External API integration status

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm run test -- DecisionDetectionAgent.test.ts

# Run integration tests
npm run test:integration
```

## 🚀 Deployment

### Docker

```bash
# Build the image
docker build -t knowwhy .

# Run the container
docker run -p 3000:3000 knowwhy
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/

# Scale the application
kubectl scale deployment knowwhy --replicas=3
```

### Cloud Platforms

- **AWS**: ECS, RDS, S3, Lambda
- **GCP**: Cloud Run, Cloud SQL, Cloud Storage
- **Azure**: Container Instances, Azure SQL, Blob Storage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Slack API Team** for their excellent platform and documentation
- **OpenAI** for powerful LLM capabilities
- **Prisma** for their fantastic ORM
- **Next.js** for the amazing React framework

## 📞 Support

For support and questions:
- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For general questions and community support
- **Email**: support@knowwhy.ai

---

**Built with ❤️ for teams that want to remember their decisions**