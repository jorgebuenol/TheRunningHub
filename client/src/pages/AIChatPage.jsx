import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { Send, Bot, User, Loader, Users, Zap } from 'lucide-react';

export default function AIChatPage() {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadAthletes();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset chat when athlete changes
  useEffect(() => {
    setMessages([]);
    setError('');
  }, [selectedAthleteId]);

  async function loadAthletes() {
    try {
      const data = await api.getAthletes();
      setAthletes(data || []);
      if (data?.length > 0) {
        setSelectedAthleteId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !selectedAthleteId || sending) return;

    const userMessage = input.trim();
    setInput('');
    setError('');

    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    setSending(true);
    try {
      // Send with history (exclude current message since it's in the message param)
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const reply = await api.sendChatMessage(selectedAthleteId, userMessage, history);
      setMessages(prev => [...prev, reply]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const selectedAthlete = athletes.find(a => a.id === selectedAthleteId);

  if (loading) return <div className="text-volt font-display text-xl animate-pulse">LOADING...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-volt">AI COACH CHAT</h1>
          <p className="text-smoke uppercase tracking-wider text-sm mt-1">
            Discuss athlete performance with AI
          </p>
        </div>
      </div>

      {/* Athlete Selector */}
      <div className="card mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-smoke text-sm">
            <Users size={16} />
            <span className="uppercase tracking-wider font-bold text-xs">Athlete Context:</span>
          </div>
          <select
            value={selectedAthleteId}
            onChange={e => setSelectedAthleteId(e.target.value)}
            className="input-field flex-1 py-2"
          >
            {athletes.map(a => (
              <option key={a.id} value={a.id}>
                {a.profiles?.full_name} — {a.goal_race || 'No race'} {a.vdot ? `(VO2max ${a.vdot})` : ''}
              </option>
            ))}
          </select>
          {selectedAthleteId && (
            <div className="flex items-center gap-1 text-green-400 text-xs">
              <Zap size={12} />
              <span className="uppercase tracking-wider">Context loaded</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <Bot size={48} className="text-volt mx-auto mb-4 opacity-50" />
            <p className="text-smoke text-lg">Start a conversation about {selectedAthlete?.profiles?.full_name || 'your athlete'}</p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {[
                'How is their training load looking?',
                'Should we adjust intensity this week?',
                'What are the key areas to focus on?',
                'Are they on track for their goal?',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-2 text-xs text-smoke border border-ash hover:border-volt hover:text-volt transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 bg-volt flex items-center justify-center flex-shrink-0 mt-1">
                <Bot size={16} className="text-carbon" />
              </div>
            )}
            <div
              className={`max-w-[70%] px-4 py-3 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-volt/20 border border-volt text-white'
                  : 'bg-steel border border-ash text-white'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 bg-smoke/20 flex items-center justify-center flex-shrink-0 mt-1">
                <User size={16} className="text-smoke" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-volt flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-carbon" />
            </div>
            <div className="bg-steel border border-ash px-4 py-3 flex items-center gap-2">
              <Loader size={14} className="animate-spin text-volt" />
              <span className="text-smoke text-sm">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-500 px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Ask about ${selectedAthlete?.profiles?.full_name || 'athlete'}...`}
          className="input-field flex-1 py-3"
          disabled={sending || !selectedAthleteId}
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || !selectedAthleteId}
          className="btn-primary px-6 flex items-center gap-2"
        >
          <Send size={16} />
          SEND
        </button>
      </form>
    </div>
  );
}
