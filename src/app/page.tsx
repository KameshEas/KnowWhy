'use client';
import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { DecisionCard } from '../components/DecisionCard';
import { BriefCard } from '../components/BriefCard';
import { ConversationList } from '../components/ConversationList';
import { ChatInterface } from '../components/ChatInterface';
import { DecisionDetectionViewModel } from '../viewmodels/DecisionDetectionViewModel';
import { DecisionBriefViewModel } from '../viewmodels/DecisionBriefViewModel';
import { IngestionViewModel } from '../viewmodels/IngestionViewModel';
import { SearchViewModel } from '../viewmodels/SearchViewModel';
import { LLMService } from '../services/LLMService';
import { ConversationBlock } from '../models/ConversationBlock';
import { DecisionCandidate } from '../models/DecisionCandidate';
import { DecisionBrief } from '../models/DecisionBrief';

export default function Home() {
  // State
  const [activeSection, setActiveSection] = useState('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // ViewModels (using static methods)
  const decisionDetectionVM = DecisionDetectionViewModel;
  const decisionBriefVM = DecisionBriefViewModel;
  const ingestionVM = IngestionViewModel;
  const searchVM = SearchViewModel;

  // Data State
  const [conversations, setConversations] = useState<ConversationBlock[]>([]);
  const [decisions, setDecisions] = useState<DecisionCandidate[]>([]);
  const [briefs, setBriefs] = useState<DecisionBrief[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null);
  const [selectedBrief, setSelectedBrief] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Chat State
  const [chatMessages, setChatMessages] = useState<Array<{ text: string; sender: 'user' | 'ai'; timestamp: Date }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');

  // Effects
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Data Loading
  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const convData = ingestionVM.getConversations();
      const decData = decisionDetectionVM.getDecisionCandidates();
      const briefData = decisionBriefVM.getDecisionBriefs();
      
      setConversations(convData);
      setDecisions(decData);
      setBriefs(briefData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  // File Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      const text = await file.text();
      
      // Parse file content based on type
      let newConversations: ConversationBlock[] = [];
      if (file.name.endsWith('.json')) {
        try {
          const jsonData = JSON.parse(text);
          newConversations = IngestionViewModel.parseSlack(jsonData);
        } catch (parseError) {
          setError('Invalid JSON file format');
          return;
        }
      } else {
        newConversations = IngestionViewModel.parseTranscript(text);
      }
      
      // Save conversations
      IngestionViewModel.saveConversations([...conversations, ...newConversations]);
      setSuccess(`Successfully processed ${file.name} (${newConversations.length} messages)`);
      await loadInitialData();
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload file');
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  // Decision Detection
  const handleDetectDecisions = async () => {
    if (conversations.length === 0) {
      setError('No conversations available. Please upload files first.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      const newDecisions = await decisionDetectionVM.detectDecisions(conversations);
      setDecisions(newDecisions);
      setSuccess(`Detected ${newDecisions.length} decisions`);
    } catch (err) {
      console.error('Detection error:', err);
      setError('Failed to detect decisions');
    } finally {
      setIsLoading(false);
    }
  };

  // Brief Generation
  const handleGenerateBrief = async (decisionId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const decision = decisions.find(d => d.id === decisionId);
      if (!decision) {
        setError('Decision not found');
        return;
      }

      const brief = await LLMService.generateBrief(decision, conversations);
      setBriefs(prev => [...prev, brief]);
      setSuccess('Decision brief generated successfully');
    } catch (err) {
      console.error('Brief generation error:', err);
      setError('Failed to generate brief');
    } finally {
      setIsLoading(false);
    }
  };

  // Search (placeholder - not implemented in viewmodels)
  const performSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      // Simple client-side search for now
      const allText = [...conversations, ...decisions, ...briefs]
        .map(item => {
          if ('text' in item) return item.text;
          if ('summary' in item) return item.summary;
          if ('decisionSummary' in item) return item.decisionSummary;
          return '';
        })
        .join(' ');
      
      const found = allText.toLowerCase().includes(searchQuery.toLowerCase());
      setSearchResults(found ? [{ type: 'Search Result', content: 'Found matching content', score: 1.0 }] : []);
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed');
    }
  };

  // Chat
  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    const userMessage = {
      text: message,
      sender: 'user' as const,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatLoading(true);

    try {
      const response = await LLMService.askQuestion(message, selectedModel);
      
      const aiMessage = {
        text: response,
        sender: 'ai' as const,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMessage = {
        text: "I'm having trouble connecting right now. Please try again.",
        sender: 'ai' as const,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  // UI Handlers
  const handleSectionClick = (section: string) => {
    setActiveSection(section);
    setError(null);
    setSuccess(null);
  };

  const handleConversationSelect = (id: string) => {
    setSelectedConversation(id);
    setSelectedDecision(null);
    setSelectedBrief(null);
  };

  const handleDecisionSelect = (id: string) => {
    setSelectedDecision(id);
    setSelectedConversation(null);
    setSelectedBrief(null);
  };

  const handleBriefSelect = (id: string) => {
    setSelectedBrief(id);
    setSelectedConversation(null);
    setSelectedDecision(null);
  };

  const handleAskQuestion = (question: string) => {
    setActiveSection('ask');
    setTimeout(() => handleSendMessage(question), 100);
  };

  // Render Functions
  const renderUploadSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Upload Conversations</h2>
          <p className="text-gray-600">Upload text files containing conversation data for analysis</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex space-x-4">
              <Input
                type="file"
                accept=".txt,.md,.json"
                onChange={handleFileUpload}
                label="Select File"
                disabled={isLoading}
              />
              <Button
                onClick={handleDetectDecisions}
                variant="primary"
                disabled={conversations.length === 0 || isLoading}
                isLoading={isLoading}
              >
                Detect Decisions
              </Button>
            </div>
            
            {conversations.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Uploaded conversations:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {conversations.map((conv) => (
                    <div key={conv.id} className="bg-white p-3 rounded border border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{conv.author}</p>
                          <p className="text-xs text-gray-500">{conv.source}</p>
                        </div>
                        <Badge variant="info" size="sm">
                          {new Date(conv.timestamp).toLocaleDateString()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {decisions.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Detected Decisions</h3>
            <p className="text-gray-600">Decisions found in your conversations</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {decisions.map((decision) => (
                <DecisionCard
                  key={decision.id}
                  decision={{
                    id: decision.id,
                    summary: decision.summary,
                    confidence: decision.confidence,
                    timestamp: decision.confidence > 0.8 ? 'High' : decision.confidence > 0.6 ? 'Medium' : 'Low',
                    context: `Decision in ${decision.conversationId}`
                  }}
                  onAskQuestion={handleAskQuestion}
                  onViewBrief={() => handleGenerateBrief(decision.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderConversationsSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Conversation History</h2>
          <p className="text-gray-600">Browse and analyze your conversation data</p>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No conversations available. Please upload files first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <ConversationList
                  conversations={conversations.map(c => ({
                    id: c.id,
                    text: c.text,
                    author: c.author,
                    timestamp: c.timestamp
                  }))}
                  selectedConversation={selectedConversation}
                  onConversationSelect={handleConversationSelect}
                />
              </div>
              <div className="lg:col-span-2">
                {selectedConversation && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold">Conversation Details</h3>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {conversations
                          .find(c => c.id === selectedConversation)
                          ?.blocks.map((block, index) => (
                            <div key={index} className="bg-gray-50 p-4 rounded-lg">
                              <div className="flex justify-between items-start mb-2">
                                <span className="font-medium text-gray-900">{block.author}</span>
                                <span className="text-xs text-gray-500">
                                  {new Date(block.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-gray-700">{block.text}</p>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderDecisionsSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Decision Analysis</h2>
          <p className="text-gray-600">Review and analyze detected decisions</p>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No decisions detected yet. Please upload conversations and run decision detection.</p>
              <Button
                onClick={() => handleSectionClick('upload')}
                variant="secondary"
                className="mt-4"
              >
                Go to Upload
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {decisions.map((decision) => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  onAskQuestion={handleAskQuestion}
                  onViewBrief={() => handleGenerateBrief(decision.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderBriefsSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Decision Briefs</h2>
          <p className="text-gray-600">Detailed analysis and documentation of decisions</p>
        </CardHeader>
        <CardContent>
          {briefs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No decision briefs available. Generate briefs from detected decisions.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {briefs.map((brief) => (
                <BriefCard
                  key={brief.id}
                  brief={brief}
                  onAskQuestion={handleAskQuestion}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderAskSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Ask KnowWhy</h2>
          <div className="flex items-center space-x-4">
            <Select
              label="Model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B (Free)</option>
              <option value="llama-3.1-70b-versatile">Llama 3.1 70B (Free)</option>
              <option value="llama-3.1-8b-instant">Llama 3.1 8B (Free)</option>
            </Select>
            <Badge variant="success" size="sm">
              Connected to Groq
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-96 border border-gray-200 rounded-lg overflow-hidden">
            <ChatInterface
              onSendMessage={handleSendMessage}
              isLoading={chatLoading}
              model={selectedModel}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSearchSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Search Conversations</h2>
          <p className="text-gray-600">Find specific information across all conversations</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input
              type="text"
              placeholder="Search conversations, decisions, or briefs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              label="Search Query"
            />
            
            {searchResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Results</h3>
                {searchResults.map((result, index) => (
                  <Card key={index} variant="outlined">
                    <CardContent>
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-gray-900">{result.type}</span>
                        <Badge variant="info" size="sm">
                          {result.score?.toFixed(2)}
                        </Badge>
                      </div>
                      <p className="text-gray-700 text-sm">{result.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="flex">
        <Sidebar
          conversationsCount={conversations.length}
          decisionsCount={decisions.length}
          briefsCount={briefs.length}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
        />
        
        <main className="flex-1 p-6">
          {/* Status Messages */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
                ×
              </button>
            </div>
          )}
          
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <span>{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-2 text-green-500 hover:text-green-700">
                ×
              </button>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl">
                <LoadingSpinner />
                <p className="mt-4 text-gray-600">Processing...</p>
              </div>
            </div>
          )}

          {/* Content */}
          {activeSection === 'upload' && renderUploadSection()}
          {activeSection === 'conversations' && renderConversationsSection()}
          {activeSection === 'decisions' && renderDecisionsSection()}
          {activeSection === 'briefs' && renderBriefsSection()}
          {activeSection === 'ask' && renderAskSection()}
          {activeSection === 'search' && renderSearchSection()}
        </main>
      </div>
    </div>
  );
}