import { useState, useEffect } from 'react'
import axios from 'axios'
import ChatWindow from './components/ChatWindow'
import LivePanel from './components/LivePanel'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api/chat' : 'http://localhost:8000/api/chat');

function App() {
  const [conversationId, setConversationId] = useState(localStorage.getItem('conversationId'))
  const [messages, setMessages] = useState([])
  const [extractedData, setExtractedData] = useState({
    customer: { name: null, phone: null, email: null },
    travel: {
      destination: null, departureCity: null, travelDate: null,
      travellers: null, budget: null, duration: null,
      tripType: null, specialRequirements: null
    },
    qualification: { leadScore: 0, confidence: "Low", reason: "" }
  })
  const [isLoading, setIsLoading] = useState(false)

  const initiateChat = async () => {
    try {
      const res = await axios.post(`${API_URL}/initiate-chat`)
      const newId = res.data.conversationId
      setConversationId(newId)
      localStorage.setItem('conversationId', newId)
      setMessages([])
      setExtractedData({
        customer: { name: null, phone: null, email: null },
        travel: {
          destination: null, departureCity: null, travelDate: null,
          travellers: null, budget: null, duration: null,
          tripType: null, specialRequirements: null
        },
        qualification: { leadScore: 0, confidence: "Low", reason: "" }
      })
    } catch (err) {
      console.error("Failed to initiate chat", err)
    }
  }

  const loadConversation = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/conversation/${id}`)
      setMessages(res.data.messages)
      if (res.data.extractedData) {
        setExtractedData(res.data.extractedData)
      }
    } catch (err) {
      console.error("Failed to load conversation", err)
      if (err.response && err.response.status === 404) {
        localStorage.removeItem('conversationId')
        initiateChat()
      }
    }
  }

  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId)
    } else {
      initiateChat()
    }
  }, [])

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || isLoading) return;

    const newMessage = { role: 'user', content: messageText }
    setMessages(prev => [...prev, newMessage])
    setIsLoading(true)

    try {
      const res = await axios.post(`${API_URL}/chat`, {
        conversationId,
        message: messageText
      })
      
      const aiReply = { role: 'assistant', content: res.data.reply }
      setMessages(prev => [...prev, aiReply])
      
      if (res.data.extractedData) {
        setExtractedData(res.data.extractedData)
      }
    } catch (err) {
      console.error("Failed to send message", err)
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again." }])
    } finally {
      setIsLoading(false)
    }
  }

  const resetChat = () => {
    localStorage.removeItem('conversationId')
    setConversationId(null)
    initiateChat()
  }

  return (
    <div className="h-screen w-full bg-white text-gemini-text font-sans flex overflow-hidden">
      
      {/* Live Panel Sidebar */}
      <div className="hidden lg:flex w-[350px] bg-gemini-bg border-r border-gray-200 flex-col h-full flex-shrink-0">
        <LivePanel extractedData={extractedData} />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        <ChatWindow 
          messages={messages} 
          isLoading={isLoading} 
          sendMessage={sendMessage} 
          resetChat={resetChat} 
        />
      </div>

    </div>
  )
}

export default App
