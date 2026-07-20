import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, RotateCcw, Mic } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatWindow({ messages, isLoading, sendMessage, resetChat }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
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
    <div className="flex flex-col h-full w-full bg-white">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 sticky top-0 z-10 bg-white">
        <h1 className="text-xl font-medium text-gemini-text flex items-center gap-2">
          Vitraga AI
        </h1>
        <button 
          onClick={resetChat}
          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
          title="New chat"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-10 lg:px-20 pb-40 pt-4 hide-scrollbar relative">
        {messages.length === 0 && (
          <div className="flex flex-col justify-center h-[70%] space-y-4 max-w-4xl mx-auto pl-4 md:pl-10">
            <h2 className="text-4xl md:text-5xl font-medium bg-gradient-to-r from-[#4285f4] via-[#ea4335] to-[#fbbc05] bg-clip-text text-transparent pb-2">
              Hello again
            </h2>
            <p className="text-3xl md:text-4xl text-gray-400 font-medium">Tell me where you want to travel.</p>
          </div>
        )}
        
        <div className="max-w-4xl mx-auto space-y-8">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            
            if (isUser) {
              return (
                <div key={idx} className="flex justify-end w-full">
                  <div className="max-w-[85%] md:max-w-[70%] bg-gemini-user text-gemini-text px-6 py-3.5 rounded-3xl text-[16px] leading-relaxed font-sans">
                    {msg.content}
                  </div>
                </div>
              );
            } else {
              return (
                <div key={idx} className="flex gap-4 w-full">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                     <Sparkles className="w-6 h-6 text-gemini-blue" />
                  </div>
                  <div className="flex-1 text-gemini-text text-[16px] leading-relaxed pt-1 font-sans markdown-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              );
            }
          })}

          {isLoading && (
            <div className="flex gap-4 w-full">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                 <Sparkles className="w-6 h-6 text-gemini-blue animate-pulse" />
              </div>
              <div className="flex-1 pt-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-white via-white to-transparent pt-10 pb-6 px-4 md:px-10 lg:px-20 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto relative">
          <form 
            onSubmit={handleSubmit} 
            className="flex items-end gap-2 bg-gemini-user rounded-[32px] p-2 pr-4 shadow-sm border border-gray-100 focus-within:border-gray-300 focus-within:shadow-md transition-all"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Ask me anything..."
              rows={1}
              className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-gemini-text placeholder-gray-500 px-5 py-4 resize-none max-h-32 text-[16px]"
              style={{ minHeight: '56px' }}
            />
            <div className="flex items-center gap-2 pb-2">
              <button
                type="button"
                className="p-3 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
              >
                <Mic className="w-5 h-5" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-3 bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300 disabled:opacity-50 disabled:bg-transparent transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
          <p className="text-center text-xs text-gray-400 mt-4">Vitraga AI may display inaccurate info, so double-check its travel suggestions.</p>
        </div>
      </div>
    </div>
  );
}
