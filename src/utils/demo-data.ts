import { ConversationBlock } from '@/models/ConversationBlock';
import { DecisionCandidate } from '@/models/DecisionCandidate';
import { DecisionBrief } from '@/models/DecisionBrief';

/**
 * Demo data for showcasing the decision detection and context reconstruction features
 */

export const demoConversations: ConversationBlock[] = [
  {
    id: 'conv-1',
    author: 'Sarah Chen',
    source: 'slack',
    timestamp: '2024-01-15T10:30:00Z',
    text: 'After reviewing the performance metrics, I think we should go with Redis for our caching layer. It has better performance than Memcached and more features than in-memory caching.'
  },
  {
    id: 'conv-2', 
    author: 'Mike Rodriguez',
    source: 'meeting',
    timestamp: '2024-01-16T14:15:00Z',
    text: 'We need to choose a frontend framework for the new dashboard. React has the largest ecosystem, but Vue might be easier for our team to learn.'
  },
  {
    id: 'conv-3',
    author: 'Alex Thompson',
    source: 'slack',
    timestamp: '2024-01-17T09:45:00Z',
    text: 'Let\'s use TypeScript for the new microservice. The type safety will help us catch bugs early and make the code more maintainable.'
  },
  {
    id: 'conv-4',
    author: 'Jessica Park',
    source: 'meeting',
    timestamp: '2024-01-18T11:20:00Z',
    text: 'For the database, PostgreSQL is our best option. It has better ACID compliance than MySQL and more advanced features than SQLite.'
  },
  {
    id: 'conv-5',
    author: 'David Kim',
    source: 'slack',
    timestamp: '2024-01-19T16:30:00Z',
    text: 'We should deploy to AWS instead of Azure. Their services are more mature and we already have experience with their infrastructure.'
  }
];

export const demoDecisions: DecisionCandidate[] = [
  {
    id: 'dec-1',
    conversationId: 'conv-1',
    isDecision: true,
    summary: 'Chose Redis over Memcached and in-memory caching for the caching layer',
    confidence: 0.92
  },
  {
    id: 'dec-2',
    conversationId: 'conv-2',
    isDecision: true,
    summary: 'Selected React over Vue for the new dashboard frontend framework',
    confidence: 0.85
  },
  {
    id: 'dec-3',
    conversationId: 'conv-3',
    isDecision: true,
    summary: 'Decided to use TypeScript for the new microservice development',
    confidence: 0.88
  },
  {
    id: 'dec-4',
    conversationId: 'conv-4',
    isDecision: true,
    summary: 'Chose PostgreSQL over MySQL and SQLite for the database solution',
    confidence: 0.91
  },
  {
    id: 'dec-5',
    conversationId: 'conv-5',
    isDecision: true,
    summary: 'Selected AWS over Azure for deployment due to service maturity and team experience',
    confidence: 0.87
  }
];

export const demoBriefs: DecisionBrief[] = [
  {
    id: 'brief-1',
    decisionSummary: 'Selected Redis as the caching layer solution',
    problem: 'Need a high-performance caching solution to improve application response times and reduce database load',
    optionsConsidered: [
      'Redis',
      'Memcached', 
      'In-memory caching'
    ],
    rationale: 'Redis was chosen because it offers superior performance compared to Memcached while providing more advanced features than simple in-memory caching. It supports data persistence, complex data structures, and has excellent community support.',
    participants: ['Sarah Chen'],
    sourceReferences: [
      {
        conversationId: 'conv-1',
        text: 'After reviewing the performance metrics, I think we should go with Redis for our caching layer. It has better performance than Memcached and more features than in-memory caching.'
      }
    ]
  },
  {
    id: 'brief-2',
    decisionSummary: 'Chose React for the new dashboard frontend framework',
    problem: 'Need to select a frontend framework that balances ecosystem maturity with team learning curve',
    optionsConsidered: [
      'React',
      'Vue'
    ],
    rationale: 'React was selected due to its larger ecosystem, extensive library support, and better long-term viability. While Vue might be easier to learn initially, React\'s widespread adoption ensures better job market prospects and more community resources.',
    participants: ['Mike Rodriguez'],
    sourceReferences: [
      {
        conversationId: 'conv-2',
        text: 'We need to choose a frontend framework for the new dashboard. React has the largest ecosystem, but Vue might be easier for our team to learn.'
      }
    ]
  },
  {
    id: 'brief-3',
    decisionSummary: 'Adopted TypeScript for the new microservice development',
    problem: 'Need to improve code quality and maintainability for the new microservice',
    optionsConsidered: [
      'TypeScript',
      'JavaScript'
    ],
    rationale: 'TypeScript was chosen to provide type safety that helps catch bugs early in development, improves code maintainability, and enhances developer productivity through better IDE support and autocompletion.',
    participants: ['Alex Thompson'],
    sourceReferences: [
      {
        conversationId: 'conv-3',
        text: 'Let\'s use TypeScript for the new microservice. The type safety will help us catch bugs early and make the code more maintainable.'
      }
    ]
  },
  {
    id: 'brief-4',
    decisionSummary: 'Selected PostgreSQL as the primary database solution',
    problem: 'Need a robust database system with strong ACID compliance and advanced features',
    optionsConsidered: [
      'PostgreSQL',
      'MySQL',
      'SQLite'
    ],
    rationale: 'PostgreSQL was chosen for its superior ACID compliance compared to MySQL and more advanced features than SQLite. It provides better scalability, complex query support, and enterprise-grade reliability.',
    participants: ['Jessica Park'],
    sourceReferences: [
      {
        conversationId: 'conv-4',
        text: 'For the database, PostgreSQL is our best option. It has better ACID compliance than MySQL and more advanced features than SQLite.'
      }
    ]
  },
  {
    id: 'brief-5',
    decisionSummary: 'Chose AWS for cloud deployment over Azure',
    problem: 'Need to select a cloud provider that offers mature services and aligns with team expertise',
    optionsConsidered: [
      'AWS',
      'Azure'
    ],
    rationale: 'AWS was selected because their cloud services are more mature and feature-complete compared to Azure. Additionally, the team already has experience with AWS infrastructure, which reduces the learning curve and deployment risks.',
    participants: ['David Kim'],
    sourceReferences: [
      {
        conversationId: 'conv-5',
        text: 'We should deploy to AWS instead of Azure. Their services are more mature and we already have experience with their infrastructure.'
      }
    ]
  }
];

/**
 * Demo script showing the complete decision detection and context reconstruction workflow
 */
export const demoWorkflow = {
  step1: {
    title: 'Phase 1: Data Ingestion',
    description: 'Upload conversations from Slack exports or meeting transcripts',
    data: demoConversations
  },
  
  step2: {
    title: 'Phase 2: Decision Detection',
    description: 'AI analyzes conversations to identify decision moments with confidence scoring',
    data: demoDecisions
  },
  
  step3: {
    title: 'Phase 3: Context Reconstruction',
    description: 'AI reconstructs decision context including rationale, options, and participants',
    data: demoBriefs
  },
  
  step4: {
    title: 'Phase 4: Decision Memory',
    description: 'Structured decision briefs are stored and made searchable',
    data: demoBriefs
  },
  
  step5: {
    title: 'Phase 5: Ask KnowWhy',
    description: 'Natural language queries against decision memory with source citations',
    exampleQuestions: [
      'Why did we choose Redis for caching?',
      'What were the alternatives considered for the database?',
      'Who was involved in the TypeScript decision?'
    ]
  }
};

/**
 * Utility function to seed demo data into storage
 */
export function seedDemoData() {
  // This would typically be called during development or demo setup
  localStorage.setItem('knowwhy_conversations', JSON.stringify(demoConversations));
  localStorage.setItem('knowwhy_decisions', JSON.stringify(demoDecisions));
  localStorage.setItem('knowwhy_briefs', JSON.stringify(demoBriefs));
}

/**
 * Utility function to clear demo data
 */
export function clearDemoData() {
  localStorage.removeItem('knowwhy_conversations');
  localStorage.removeItem('knowwhy_decisions');
  localStorage.removeItem('knowwhy_briefs');
}