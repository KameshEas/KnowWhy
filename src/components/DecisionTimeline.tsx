/**
 * Decision Timeline Component
 * 
 * Displays a chronological timeline of decisions with filtering and search capabilities.
 * Provides quick access to decision briefs and related context.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { DecisionBrief } from '../models/DecisionBrief';
import { DecisionBriefService } from '../services/DecisionBriefService';
import { SearchViewModel } from '../viewmodels/SearchViewModel';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  Calendar, 
  Search, 
  Filter, 
  Clock, 
  Users, 
  Tag,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

interface DecisionTimelineProps {
  userId: string;
  onDecisionSelect?: (brief: DecisionBrief) => void;
  className?: string;
}

interface TimelineFilter {
  status: DecisionBrief['status'] | 'all';
  tags: string[];
  participants: string[];
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  search: string;
}

export const DecisionTimeline: React.FC<DecisionTimelineProps> = ({
  userId,
  onDecisionSelect,
  className = ''
}) => {
  const [briefs, setBriefs] = useState<DecisionBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [filters, setFilters] = useState<TimelineFilter>({
    status: 'all',
    tags: [],
    participants: [],
    dateRange: { start: null, end: null },
    search: ''
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // Search view model
  const searchViewModel = useMemo(() => new SearchViewModel(), []);

  // Load briefs
  useEffect(() => {
    loadBriefs();
  }, [userId, currentPage, filters]);

  const loadBriefs = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await DecisionBriefService.listBriefs({
        userId,
        status: filters.status === 'all' ? undefined : filters.status,
        tags: filters.tags.length > 0 ? filters.tags : undefined,
        participants: filters.participants.length > 0 ? filters.participants : undefined,
        dateRange: filters.dateRange.start && filters.dateRange.end ? filters.dateRange : undefined,
        search: filters.search || undefined
      }, currentPage, itemsPerPage);

      setBriefs(result.briefs);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to load decision briefs:', err);
      setError('Failed to load decision briefs');
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  const handleSearch = async (query: string) => {
    setFilters(prev => ({ ...prev, search: query }));
  };

  // Handle status filter
  const handleStatusFilter = (status: DecisionBrief['status'] | 'all') => {
    setFilters(prev => ({ ...prev, status }));
  };

  // Handle tag filter
  const handleTagFilter = (tag: string) => {
    setFilters(prev => {
      const newTags = prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag];
      return { ...prev, tags: newTags };
    });
  };

  // Get unique tags from all briefs
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    briefs.forEach(brief => {
      brief.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [briefs]);

  // Get unique participants from all briefs
  const allParticipants = useMemo(() => {
    const participantSet = new Set<string>();
    briefs.forEach(brief => {
      brief.participants.forEach(participant => participantSet.add(participant));
    });
    return Array.from(participantSet).sort();
  }, [briefs]);

  // Format date for display
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge variant
  const getStatusVariant = (status: DecisionBrief['status']) => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'archived': return 'secondary';
      default: return 'default';
    }
  };

  // Handle decision selection
  const handleDecisionSelect = (brief: DecisionBrief) => {
    onDecisionSelect?.(brief);
  };

  // Handle feedback
  const handleFeedback = async (briefId: string, rating: 1 | 2 | 3 | 4 | 5) => {
    try {
      // This would integrate with the FeedbackService
      console.log(`Feedback for ${briefId}: ${rating}`);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Decision Timeline</h2>
          <Badge variant="outline" className="ml-2">
            {briefs.length} decisions
          </Badge>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button variant="outline" size="sm">
            <Clock className="h-4 w-4 mr-2" />
            Timeline View
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search decisions..."
                value={filters.search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filters */}
            <div className="flex space-x-2">
              {(['all', 'pending', 'approved', 'archived'] as const).map(status => (
                <Button
                  key={status}
                  variant={filters.status === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusFilter(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center space-x-2 mb-2">
                <Tag className="h-4 w-4" />
                <span className="text-sm font-medium">Tags:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <Button
                    key={tag}
                    variant={filters.tags.includes(tag) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleTagFilter(tag)}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" size="sm" onClick={loadBriefs} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Decision Cards */}
          <div className="space-y-4">
            {briefs.map((brief) => (
              <Card key={brief.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Badge variant={getStatusVariant(brief.status)}>
                          {brief.status}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {formatDate(brief.createdAt)}
                        </span>
                      </div>
                      
                      <CardTitle 
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => handleDecisionSelect(brief)}
                      >
                        {brief.decisionSummary}
                      </CardTitle>

                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <div className="flex items-center space-x-1">
                          <Users className="h-4 w-4" />
                          <span>{brief.participants.join(', ')}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Tag className="h-4 w-4" />
                          <span>{brief.tags.join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        Confidence: {(brief.confidence * 100).toFixed(0)}%
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDecisionSelect(brief)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <p className="text-gray-700 mb-4 line-clamp-2">
                    {brief.problem}
                  </p>

                  {/* Options Considered */}
                  {brief.optionsConsidered.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-600 mb-2">Options Considered:</h4>
                      <div className="flex flex-wrap gap-2">
                        {brief.optionsConsidered.slice(0, 3).map((option, index) => (
                          <Badge key={index} variant="secondary">
                            {option}
                          </Badge>
                        ))}
                        {brief.optionsConsidered.length > 3 && (
                          <Badge variant="secondary">
                            +{brief.optionsConsidered.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Feedback Actions */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFeedback(brief.id, 5)}
                      >
                        <ThumbsUp className="h-4 w-4 mr-2" />
                        Helpful
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFeedback(brief.id, 1)}
                      >
                        <ThumbsDown className="h-4 w-4 mr-2" />
                        Not Helpful
                      </Button>
                    </div>

                    <div className="text-sm text-gray-500">
                      Last updated: {formatDate(brief.updatedAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>

              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>

              <Button
                variant="outline"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};