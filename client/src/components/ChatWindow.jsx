import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, Compass, LogOut, User, LogIn } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ConsentBanner from './ConsentBanner';

export default function ChatWindow({ 
  messages, 
  isLoading, 
  sendMessage, 
  resetChat, 
  offerConsent, 
  user,
  onLogout,
  onOpenAuth,
  onSubmitConsent, 
  isConsentSubmitted 
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, offerConsent]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white relative">
      {/* Header */}
      <div className="flex justify-between items-center px-4 md:px-6 py-3.5 sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gemini-text leading-tight">
              Multi-Agent Travel Orchestrator
            </h1>
            <p className="text-[11px] text-gray-500">LangGraph Supervisor & Qdrant Grounded</p>
          </div>
        </div>
        
        {/* User Account Controls */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-900 font-medium">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span className="max-w-[120px] truncate">{user.username}</span>
              </div>
              <button
                onClick={resetChat}
                className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
                title="New session"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={onLogout}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 pb-48 pt-4 hide-scrollbar relative">
        {messages.length === 0 && (
          <div className="flex flex-col justify-center h-[70%] space-y-4 max-w-3xl mx-auto pl-2 md:pl-6">
            <h2 className="text-4xl md:text-5xl font-semibold bg-gradient-to-r from-[#1a73e8] via-[#8ab4f8] to-[#12b5cb] bg-clip-text text-transparent pb-1">
              Where would you like to travel?
            </h2>
            <p className="text-2xl md:text-3xl text-gray-400 font-normal">
              Ask for a multi-day itinerary. Our agents fact-check real transit times and coordinates.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {['Plan a 3-day trip to Tokyo', 'Explore Paris in 4 days', 'Rome cultural weekend', 'Bali 5-day adventure'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            
            if (isUser) {
              return (
                <div key={idx} className="flex justify-end w-full">
                  <div className="max-w-[85%] md:max-w-[75%] bg-[#e8f0fe] text-gray-900 px-5 py-3 rounded-2xl text-[15px] leading-relaxed font-sans shadow-sm">
                    {msg.content}
                  </div>
                </div>
              );
            } else {
              return (
                <div key={idx} className="flex gap-3 w-full">
                  <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-1 border border-blue-100">
                     <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-gemini-text text-[15px] leading-relaxed pt-0.5 font-sans markdown-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            }
          })}

          {/* Value-First Consent Banner (No manual personal info inputs required!) */}
          {offerConsent && (
            <div className="pt-2">
              <ConsentBanner 
                user={user}
                onSubmitConsent={onSubmitConsent}
                isSubmitted={isConsentSubmitted}
              />
            </div>
          )}

          {isLoading && (
            <div className="flex gap-3 w-full">
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-1 border border-blue-100 animate-pulse">
                 <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 pt-2">
                <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                  <span className="ml-2 text-gray-500 font-normal">Supervising workers & fact-checking Qdrant coordinates...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-white via-white/95 to-transparent pt-8 pb-4 px-4 md:px-8 lg:px-16 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto relative">
          <form 
            onSubmit={handleSubmit} 
            className="flex items-end gap-2 bg-[#f0f4f9] rounded-2xl p-1.5 pr-3 shadow-sm border border-gray-200/80 focus-within:border-blue-400 focus-within:shadow-md transition-all"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder={user ? "Tell me your destination, duration, or budget..." : "Please sign in to chat with the travel planner..."}
              rows={1}
              className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 placeholder-gray-500 px-4 py-3 resize-none max-h-32 text-[15px]"
              style={{ minHeight: '48px' }}
            />
            <div className="flex items-center gap-1.5 pb-1">
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:bg-gray-300 disabled:text-gray-500 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            Multi-agent architecture validates travel times via Qdrant to eliminate hallucinations.
          </p>
        </div>
      </div>
    </div>
  );
}
