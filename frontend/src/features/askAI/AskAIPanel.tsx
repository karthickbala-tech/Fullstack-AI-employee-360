import React, { useState } from 'react';
import { askAIService } from '../../services/askAIService';
import { AskAIResponse } from '../../types/employee360';
import { DataBadge } from '../../components/shared/DataBadge';
import { 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  Loader2,
  AlertCircle
} from 'lucide-react';

interface AskAIPanelProps {
  employeeId: string;
}

interface MessageHistoryItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  responseMeta?: AskAIResponse;
  isError?: boolean;
}

export const AskAIPanel: React.FC<AskAIPanelProps> = ({ employeeId }) => {
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState<MessageHistoryItem[]>([
    {
      id: 'init',
      sender: 'ai',
      text: `Ask questions regarding employee "${employeeId}". The backend Employee 360 AI engine answers strictly using verified canonical records and enforces zero-hallucination guardrails.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const promptSuggestions = [
    'Summarise this employee profile and tenure.',
    'What are the recorded performance ratings and review status?',
    'What are the documented attendance and leave metrics?',
    'What skills and courses are recorded for this employee?'
  ];

  const handleAsk = async (textToSend?: string) => {
    const query = (textToSend || question).trim();
    if (!query || isAsking) return;

    const userMsg: MessageHistoryItem = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setQuestion('');
    setIsAsking(true);

    try {
      // Dispatches directly to POST /v1/employees/{employeeId}/ask
      const res = await askAIService.askQuestion(employeeId, query);

      const aiMsg: MessageHistoryItem = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        responseMeta: res
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          text: `Backend Error: ${err?.message || 'Unable to process question.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true
        }
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[650px]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50/50 to-white">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Ask AI — Headless API Consumer</h3>
            <p className="text-xs text-slate-500">
              Dispatches queries directly to <code>POST /v1/employees/{employeeId}/ask</code>
            </p>
          </div>
        </div>

        <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-600 border border-slate-200">
          Target ID: <strong className="text-slate-800">{employeeId}</strong>
        </span>
      </div>

      {/* Suggested prompts bar */}
      <div className="px-6 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
        <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-sky-600" />
          Supported Queries:
        </span>
        {promptSuggestions.map((promptText, idx) => (
          <button
            key={idx}
            onClick={() => handleAsk(promptText)}
            disabled={isAsking}
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/30 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 text-xs shrink-0"
          >
            {promptText}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-white'
                  : msg.isError
                  ? 'bg-rose-600 text-white'
                  : 'bg-gradient-to-tr from-sky-600 to-indigo-600 text-white'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed shadow-2xs ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-white rounded-tr-none'
                  : msg.isError
                  ? 'bg-rose-50 border border-rose-200 text-rose-900 rounded-tl-none'
                  : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-line text-sm leading-relaxed">{msg.text}</div>

              {msg.responseMeta && (
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <DataBadge type={msg.responseMeta.type} size="sm" />
                      <span className="text-[10px] text-slate-500 capitalize">
                        Confidence: <strong className="text-slate-700">{msg.responseMeta.confidence}</strong>
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">{msg.timestamp}</span>
                  </div>

                  {msg.responseMeta.evidence && msg.responseMeta.evidence.length > 0 && (
                    <div className="p-2 rounded bg-white border border-slate-200/70 text-[11px] text-slate-600">
                      <strong className="text-slate-700 block text-[10px] uppercase font-semibold mb-0.5">
                        Grounded In Evidence:
                      </strong>
                      <ul className="list-disc list-inside space-y-0.5">
                        {msg.responseMeta.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.responseMeta.limitations && msg.responseMeta.limitations.length > 0 && (
                    <div className="p-2 rounded bg-amber-50/80 border border-amber-200 text-[11px] text-amber-800">
                      <strong className="block text-[10px] uppercase font-semibold mb-0.5 text-amber-900">
                        Limitations & Guardrails:
                      </strong>
                      <ul className="list-disc list-inside space-y-0.5">
                        {msg.responseMeta.limitations.map((lim, i) => (
                          <li key={i}>{lim}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isAsking && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 text-xs flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
              <span>Querying backend AI engine...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={isAsking}
            placeholder={`Ask about employee ${employeeId}...`}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm text-slate-900 bg-slate-50/50"
          />

          <button
            type="submit"
            disabled={!question.trim() || isAsking}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium text-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Ask AI</span>
          </button>
        </form>
        <p className="text-[10px] text-slate-400 mt-2 text-center">
          Backend AI engine enforces zero hallucination guardrails. No AI reasoning is performed in the browser.
        </p>
      </div>
    </div>
  );
};

export default AskAIPanel;
