import { useState, useEffect } from 'react';
import axios from 'axios';
import ChatWindow from './components/ChatWindow';
import LivePanel from './components/LivePanel';
import AuthModal from './components/AuthModal';

// Setup API Base URL handling development and production
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL;
    return url.endsWith('/chat') ? url.replace(/\/chat$/, '') : url;
  }
  return import.meta.env.PROD ? '/api' : 'http://localhost:8000/api';
};

const API_BASE = getApiBase();

function App() {
  // Authentication State
  const [token, setToken] = useState(localStorage.getItem('authToken') || '');
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('authUser');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(!localStorage.getItem('authToken'));

  // Chat and Trip State
  const [sessionId, setSessionId] = useState(localStorage.getItem('sessionId'));
  const [messages, setMessages] = useState([]);
  const [tripState, setTripState] = useState(null);
  const [extractedData, setExtractedData] = useState({
    customer: { name: null, phone: null, email: null },
    travel: {
      destination: null, departureCity: null, travelDate: null,
      travellers: null, budget: null, duration: null,
      tripType: null, specialRequirements: null
    },
    qualification: { leadScore: 0, confidence: "Low", reason: "" },
    budgetEstimate: null,
    consentGiven: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [offerConsent, setOfferConsent] = useState(false);
  const [isConsentSubmitted, setIsConsentSubmitted] = useState(false);

  // Setup Axios Authorization header helper
  const getAuthHeaders = (overrideToken) => {
    const activeToken = overrideToken || token;
    return activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
  };

  const initChat = async (activeToken) => {
    const currentToken = activeToken || token;
    if (!currentToken) return;

    try {
      const res = await axios.post(`${API_BASE}/chat/init`, {}, {
        headers: getAuthHeaders(currentToken)
      });
      const newSessionId = res.data.sessionId || res.data.conversationId;
      setSessionId(newSessionId);
      localStorage.setItem('sessionId', newSessionId);
      setMessages([]);
      setTripState(null);
      setOfferConsent(false);
      setIsConsentSubmitted(false);
      setExtractedData({
        customer: { name: user?.username || null, phone: null, email: user?.email || null },
        travel: {
          destination: null, departureCity: null, travelDate: null,
          travellers: null, budget: null, duration: null,
          tripType: null, specialRequirements: null
        },
        qualification: { leadScore: 0, confidence: "Low", reason: "" },
        budgetEstimate: null,
        consentGiven: false
      });
    } catch (err) {
      console.error("Failed to initialize session via /api/chat/init:", err);
      if (err.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const loadSession = async (id, currentToken) => {
    const activeToken = currentToken || token;
    if (!activeToken) return;

    try {
      const res = await axios.get(`${API_BASE}/chat/session/${id}`, {
        headers: getAuthHeaders(activeToken)
      });
      setMessages(res.data.messages || []);
      if (res.data.tripState) {
        setTripState(res.data.tripState);
        if (res.data.tripState.isComplete || res.data.tripState.dailyPlans?.length > 0) {
          setOfferConsent(true);
        }
      }
      if (res.data.extractedData) {
        setExtractedData(res.data.extractedData);
        if (res.data.extractedData.consentGiven) {
          setIsConsentSubmitted(true);
        }
      }
    } catch (err) {
      console.error("Failed to hydrate session:", err);
      if (err.response?.status === 401) {
        handleLogout();
      } else if (err.response?.status === 404) {
        localStorage.removeItem('sessionId');
        initChat(activeToken);
      }
    }
  };

  useEffect(() => {
    if (token) {
      if (sessionId) {
        loadSession(sessionId, token);
      } else {
        initChat(token);
      }
    } else {
      setIsAuthModalOpen(true);
    }
  }, [token]);

  const handleAuthSuccess = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('authUser', JSON.stringify(newUser));
    setIsAuthModalOpen(false);
    initChat(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    localStorage.removeItem('sessionId');
    setToken('');
    setUser(null);
    setSessionId(null);
    setMessages([]);
    setTripState(null);
    setOfferConsent(false);
    setIsConsentSubmitted(false);
    setIsAuthModalOpen(true);
  };

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isLoading) return;

    if (!token) {
      setIsAuthModalOpen(true);
      return;
    }

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      try {
        const initRes = await axios.post(`${API_BASE}/chat/init`, {}, {
          headers: getAuthHeaders(token)
        });
        activeSessionId = initRes.data.sessionId || initRes.data.conversationId;
        setSessionId(activeSessionId);
        localStorage.setItem('sessionId', activeSessionId);
      } catch (e) {
        console.error("Init error before sending message:", e);
        if (e.response?.status === 401) {
          handleLogout();
          return;
        }
      }
    }

    const newMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, newMessage]);
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/chat/message`, {
        sessionId: activeSessionId,
        message: messageText
      }, {
        headers: getAuthHeaders(token)
      });
      
      const aiReply = { role: 'assistant', content: res.data.reply };
      setMessages(prev => [...prev, aiReply]);
      
      if (res.data.tripState) {
        setTripState(res.data.tripState);
      }

      if (res.data.extractedData) {
        setExtractedData(res.data.extractedData);
      }

      if (res.data.offerConsent) {
        setOfferConsent(true);
      }
    } catch (err) {
      console.error("Failed to send message via /api/chat/message:", err);
      if (err.response?.status === 401) {
        handleLogout();
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "I encountered a momentary connection issue. Please try again." }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConsentSubmit = async (consent, contactInfo) => {
    if (!token) {
      setIsAuthModalOpen(true);
      return;
    }

    try {
      await axios.post(`${API_BASE}/leads/consent`, {
        sessionId,
        tripId: tripState?.tripId || `trip_${sessionId}`,
        consent,
        contactInfo
      }, {
        headers: getAuthHeaders(token)
      });

      setIsConsentSubmitted(true);
      setExtractedData(prev => ({
        ...prev,
        consentGiven: consent,
        customer: {
          ...prev.customer,
          name: user?.username || prev.customer?.name,
          email: user?.email || prev.customer?.email,
          ...(contactInfo || {})
        }
      }));
    } catch (err) {
      console.error("Failed to submit consent via /api/leads/consent:", err);
      if (err.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const resetChat = () => {
    localStorage.removeItem('sessionId');
    setSessionId(null);
    initChat(token);
  };

  return (
    <div className="h-screen w-full bg-white text-gemini-text font-sans flex overflow-hidden relative">
      
      {/* Authentication Modal - Gatekeeper for protected chat */}
      {isAuthModalOpen && (
        <AuthModal
          apiBase={API_BASE}
          onAuthSuccess={handleAuthSuccess}
        />
      )}

      {/* Live Multi-Agent & Extraction Sidebar */}
      <div className="hidden lg:flex w-[360px] bg-gemini-bg border-r border-gray-200 flex-col h-full flex-shrink-0">
        <LivePanel extractedData={extractedData} tripState={tripState} user={user} />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        <ChatWindow 
          messages={messages} 
          isLoading={isLoading} 
          sendMessage={sendMessage} 
          resetChat={resetChat}
          offerConsent={offerConsent}
          user={user}
          onLogout={handleLogout}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onSubmitConsent={handleConsentSubmit}
          isConsentSubmitted={isConsentSubmitted}
        />
      </div>

    </div>
  );
}

export default App;
