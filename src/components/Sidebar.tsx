import React from 'react';
import { Badge } from './ui/badge';

interface SidebarProps {
  conversationsCount: number;
  decisionsCount: number;
  briefsCount: number;
  onSectionClick: (section: string) => void;
  activeSection: string;
  // Mobile controls
  isMobileOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversationsCount,
  decisionsCount,
  briefsCount,
  onSectionClick,
  activeSection,
  isMobileOpen,
  onClose
}) => {
  const sections = [
    {
      id: 'upload',
      name: 'Upload Conversations',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      )
    },
    {
      id: 'conversations',
      name: 'Conversations',
      count: conversationsCount,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      )
    },
    {
      id: 'decisions',
      name: 'Decisions',
      count: decisionsCount,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      id: 'briefs',
      name: 'Decision Briefs',
      count: briefsCount,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    },
    {
      id: 'ask',
      name: 'Ask KnowWhy',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 3.229-.557.216-1.116.408-1.673.577a19.948 19.948 0 001.092 2.287c.373-.257.716-.556 1.018-.89a7.471 7.471 0 00.552-8.68" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    }
  ];

  const sidebarBody = (
    <div className="p-4">
      <div className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg transition-colors ${
              activeSection === section.id
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <span className={`${
                activeSection === section.id ? 'text-blue-600' : 'text-gray-500'
              }`}>
                {section.icon}
              </span>
              <span className="font-medium">{section.name}</span>
            </div>
            {section.count !== undefined && (
              <Badge 
                variant={activeSection === section.id ? 'info' : 'default'}
                size="sm"
                className={activeSection === section.id ? 'bg-blue-100 text-blue-800' : ''}
              >
                {section.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-200 p-4 mt-4">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Model:</span>
            <span className="font-medium text-blue-600">Llama 3.3 70B</span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-green-600">Active</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobileOpen, onClose]);

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block w-64 bg-white border-r border-gray-200 shadow-sm" aria-hidden={isMobileOpen ? true : false}>
        {sidebarBody}
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Sidebar">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
          <div id="sidebar" className="relative w-64 bg-white border-r border-gray-200 shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="text-lg font-semibold">Menu</div>
              <button onClick={onClose} aria-label="Close sidebar" className="p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
};