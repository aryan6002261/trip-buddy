import React, { useState, useEffect, useRef } from 'react';
import { Send, Plane, Compass, Sparkles, AlertCircle, RefreshCw, Mic, MicOff } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ProgressIndicator } from './components/ProgressIndicator';
import { PlanCard } from './components/PlanCard';
import { ChatMessage, AgentNode, ParsedTripDetails } from './types';

const INITIAL_WELCOME_CONTENT = `### 👋 Let's plan a trip.

Try something like:

> **I want to spend 5 days in Manali, starting from Delhi. My budget is ₹15,000. I love photography, nature and cafes. I prefer relaxed trips and absolutely hate waking up early.**

You don't need to know exactly what you want.

**Just tell me what kind of trip you want.**`;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState('gemini-3.8-flash');
  const [serviceStatus, setServiceStatus] = useState({
    ai_model: true,
    web_search: false,
    provider: 'Google Gemini 3.8 Flash',
  });

  // Voice to text Web Speech API state
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Active planning state
  const [currentNode, setCurrentNode] = useState<AgentNode | null>(null);
  const [completedNodes, setCompletedNodes] = useState<AgentNode[]>([]);
  const [currentStatusText, setCurrentStatusText] = useState<string>('');
  const [activeParsedDetails, setActiveParsedDetails] = useState<ParsedTripDetails | null>(null);
  const [activeFlightInfo, setActiveFlightInfo] = useState<string>('');
  const [activeHotelInfo, setActiveHotelInfo] = useState<string>('');
  const [activeItineraryInfo, setActiveItineraryInfo] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check service status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        setServiceStatus(data);
      })
      .catch((err) => console.warn('Could not fetch status:', err));
  }, []);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Toggle voice-to-text input via Web Speech API
  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError('Speech recognition is not supported in this browser.');
      setTimeout(() => setSpeechError(null), 4000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setSpeechError('Microphone access was denied. Please allow microphone permissions.');
        } else if (event.error !== 'no-speech') {
          setSpeechError(`Speech recognition: ${event.error}`);
        }
        setTimeout(() => setSpeechError(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
      setSpeechError('Could not start microphone voice input.');
      setTimeout(() => setSpeechError(null), 4000);
    }
  };

  // Scroll to bottom when messages or progress changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, currentStatusText]);

  const handleClearTrip = () => {
    setMessages([]);
    setActiveParsedDetails(null);
    setActiveFlightInfo('');
    setActiveHotelInfo('');
    setActiveItineraryInfo('');
    setCurrentNode(null);
    setCompletedNodes([]);
    setCurrentStatusText('');
  };

  const handleSendPrompt = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || isLoading) return;

    setInput('');

    // Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setCurrentNode('orchestrator');
    setCompletedNodes([]);
    setCurrentStatusText('🚀 TripBuddy is initializing planner agents...');

    let parsedAcc: ParsedTripDetails | undefined;
    let flightAcc = '';
    let hotelAcc = '';
    let itineraryAcc = '';

    try {
      const response = await fetch('/api/plan/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_request: prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No readable stream available.');

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === 'status') {
                setCurrentNode(data.node);
                setCurrentStatusText(data.title || data.description);
                if (data.node === 'flight_agent') {
                  setCompletedNodes((prev) => Array.from(new Set([...prev, 'orchestrator'])));
                } else if (data.node === 'hotel_agent') {
                  setCompletedNodes((prev) => Array.from(new Set([...prev, 'orchestrator', 'flight_agent'])));
                } else if (data.node === 'itinerary_agent') {
                  setCompletedNodes((prev) => Array.from(new Set([...prev, 'orchestrator', 'flight_agent', 'hotel_agent'])));
                } else if (data.node === 'synthesizer') {
                  setCompletedNodes((prev) => Array.from(new Set([...prev, 'orchestrator', 'flight_agent', 'hotel_agent', 'itinerary_agent'])));
                }
              } else if (currentEvent === 'orchestrator_complete') {
                parsedAcc = data.parsed;
                setActiveParsedDetails(data.parsed);
              } else if (currentEvent === 'flight_complete') {
                flightAcc = data.flight_info;
                setActiveFlightInfo(data.flight_info);
              } else if (currentEvent === 'hotel_complete') {
                hotelAcc = data.hotel_info;
                setActiveHotelInfo(data.hotel_info);
              } else if (currentEvent === 'itinerary_complete') {
                itineraryAcc = data.itinerary_info;
                setActiveItineraryInfo(data.itinerary_info);
              } else if (currentEvent === 'complete') {
                setCompletedNodes(['orchestrator', 'flight_agent', 'hotel_agent', 'itinerary_agent', 'synthesizer']);
                const assistantMsg: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: data.final_plan,
                  timestamp: Date.now(),
                  parsed: data.parsed || parsedAcc,
                  flight_info: data.flight_info || flightAcc,
                  hotel_info: data.hotel_info || hotelAcc,
                  itinerary_info: data.itinerary_info || itineraryAcc,
                };
                setMessages((prev) => [...prev, assistantMsg]);
                setIsLoading(false);
                setCurrentNode(null);
                setCurrentStatusText('');
              } else if (currentEvent === 'error') {
                throw new Error(data.message || 'Error occurred during trip generation.');
              }
            } catch (jsonErr) {
              console.warn('Error parsing SSE event data:', jsonErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Trip planning failed:', err);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Something went wrong while planning the trip:\n\n\`${err.message || 'Unknown error'}\`\n\nPlease verify that your server has an active connection and retry.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setCurrentNode(null);
      setCurrentStatusText('');
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <Sidebar
        currentModel={currentModel}
        onModelChange={setCurrentModel}
        onClearTrip={handleClearTrip}
        serviceStatus={serviceStatus}
        onSelectPrompt={(p) => handleSendPrompt(p)}
        tripDetails={activeParsedDetails}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        {/* Top Header */}
        <header className="px-8 py-5 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              ✈️ TripBuddy
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Your friend who actually plans the trip.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
              v1.0.0 (Node.js)
            </span>
          </div>
        </header>

        {/* Chat / Messages Container */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-5xl mx-auto w-full">
          {/* Welcome Message if no user messages yet */}
          {messages.length === 0 && (
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xl">
                  ✈️
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Let's plan your dream getaway</h2>
                  <p className="text-xs text-slate-400">Tell me where you want to go, budget, and your travel vibe</p>
                </div>
              </div>

              <div className="prose prose-invert prose-indigo text-sm leading-relaxed max-w-none text-slate-300">
                <p>
                  Planning a trip usually means jumping between flight websites, hotel booking platforms, map tabs, blogs, and chaotic group chats.
                  <strong> TripBuddy coordinates specialized AI agents</strong> to build a realistic, personalized trip for you.
                </p>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 font-medium text-slate-200 text-xs">
                  <span className="text-indigo-400 font-semibold block mb-1">Example request:</span>
                  "I want to spend 5 days in Manali, starting from Delhi. My budget is ₹15,000. I love photography, nature and cafes. I prefer relaxed trips and absolutely hate waking up early."
                </div>
              </div>

              {/* Quick suggestion buttons */}
              <div className="pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                  Try one of these:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSendPrompt('I want to spend 5 days in Manali, starting from Delhi. My budget is ₹15,000. I love photography, nature and cafes. I prefer relaxed trips and absolutely hate waking up early.')}
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/60 text-left transition cursor-pointer group"
                  >
                    <div className="text-xs font-semibold text-white group-hover:text-indigo-300">
                      🏔️ 5 Days in Manali from Delhi (₹15,000)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      Photography, nature, cafes, relaxed mornings
                    </div>
                  </button>

                  <button
                    onClick={() => handleSendPrompt('Plan a weekend trip to Rishikesh from Delhi. My budget is ₹8,000. I want nature, adventure and good cafes.')}
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/60 text-left transition cursor-pointer group"
                  >
                    <div className="text-xs font-semibold text-white group-hover:text-indigo-300">
                      🌊 Weekend Adventure in Rishikesh (₹8,000)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      River rafting, riverside cafes, budget adventure
                    </div>
                  </button>

                  <button
                    onClick={() => handleSendPrompt('Plan a 5-day trip to Bali for around $1,500. I prefer beaches, cafes and relaxed days. I don\'t want a packed schedule.')}
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/60 text-left transition cursor-pointer group"
                  >
                    <div className="text-xs font-semibold text-white group-hover:text-indigo-300">
                      🏖️ 5 Days in Bali ($1,500)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      Beaches, sunset cafes, unhurried schedule
                    </div>
                  </button>

                  <button
                    onClick={() => handleSendPrompt('I\'m going to Rome for 6 days with a $2,000 budget. I\'m interested in history, architecture and Italian food.')}
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/60 text-left transition cursor-pointer group"
                  >
                    <div className="text-xs font-semibold text-white group-hover:text-indigo-300">
                      🏛️ 6 Days in Rome ($2,000)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      Colosseum, historic trattorias, art & architecture
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Conversation history */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0 text-sm mt-1">
                  ✈️
                </div>
              )}

              <div
                className={`max-w-3xl ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md text-sm leading-relaxed'
                    : 'w-full'
                }`}
              >
                {msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : (
                  <PlanCard
                    content={msg.content}
                    parsed={msg.parsed}
                    flight_info={msg.flight_info}
                    hotel_info={msg.hotel_info}
                    itinerary_info={msg.itinerary_info}
                  />
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-sm mt-1 text-slate-300">
                  👤
                </div>
              )}
            </div>
          ))}

          {/* Loading Progress Indicator */}
          {isLoading && (
            <div className="w-full">
              <ProgressIndicator
                currentNode={currentNode}
                completedNodes={completedNodes}
                currentStatusText={currentStatusText}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur shrink-0">
          {/* Speech error or active listening banner */}
          {speechError && (
            <div className="max-w-4xl mx-auto mb-2 px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>{speechError}</span>
              </div>
              <button
                onClick={() => setSpeechError(null)}
                className="text-rose-400 hover:text-white text-xs font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}

          {isListening && (
            <div className="max-w-4xl mx-auto mb-2 px-3 py-1 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-indigo-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="font-medium text-white">Listening... Speak now</span>
                <span className="text-[11px] text-indigo-300">(Click microphone button again when done)</span>
              </div>
              <div className="flex items-center gap-0.5">
                <span className="w-1 h-3 bg-rose-500 rounded-full animate-bounce [animation-delay:0ms]"></span>
                <span className="w-1 h-4 bg-rose-400 rounded-full animate-bounce [animation-delay:150ms]"></span>
                <span className="w-1 h-2 bg-rose-500 rounded-full animate-bounce [animation-delay:300ms]"></span>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendPrompt();
                }
              }}
              placeholder={isListening ? "Listening... (e.g. 5 days in Manali from Delhi...)" : "Tell TripBuddy about your trip... (e.g. 5 days in Manali from Delhi, ₹15,000 budget, relaxed mornings)"}
              disabled={isLoading}
              className={`w-full bg-slate-800/90 border rounded-xl pl-4 pr-24 py-3 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 disabled:opacity-50 transition shadow-inner font-medium ${
                isListening
                  ? 'border-rose-500/80 focus:ring-rose-500/40 ring-1 ring-rose-500/30'
                  : 'border-slate-700 focus:ring-indigo-500/50 focus:border-indigo-500'
              }`}
            />

            <div className="absolute right-2 flex items-center gap-1.5">
              {/* Microphone Voice-to-Text Button */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={isLoading}
                title={isListening ? "Stop listening" : "Voice-to-text input (Speak to TripBuddy)"}
                className={`p-2 rounded-lg transition cursor-pointer flex items-center justify-center ${
                  isListening
                    ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400/60 shadow-lg animate-pulse'
                    : 'bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/60'
                }`}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4 text-white" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSendPrompt()}
                disabled={isLoading || !input.trim()}
                title="Send message"
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 text-white transition cursor-pointer flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-center text-slate-500 mt-2">
            TripBuddy provides realistic estimates. Always verify actual airline and accommodation availability before booking.
          </p>
        </div>
      </main>
    </div>
  );
}
