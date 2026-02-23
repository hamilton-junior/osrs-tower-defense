'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Settings, Send } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// Dynamically import the game component to avoid SSR issues with canvas
const GameCanvas = dynamic(() => import('@/components/GameCanvas'), { ssr: false });

export default function Page() {
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{sender: string, text: string, color: string}[]>([
    { sender: 'System', text: 'Welcome to Gielinor Defense!', color: '#ffff00' },
    { sender: 'Wise Old Man', text: 'Protect the path from the enemies!', color: '#00ff00' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  const handleSaveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setShowSettings(false);
  };

  const addToChat = (sender: string, text: string, color: string) => {
    setChatHistory(prev => [...prev, { sender, text, color }]);
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatInput('');
    addToChat('You', userMessage, '#ffffff');

    if (!apiKey) {
      addToChat('System', 'Please enter your Gemini API Key in settings to chat with the Wise Old Man.', '#ff0000');
      return;
    }

    setIsTyping(true);
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are the Wise Old Man from Old School RuneScape. You are helpful, slightly eccentric, and very knowledgeable about Gielinor. 
                You are currently watching the player defend a path from monsters. 
                Provide useful advice about tower defense, OSRS lore, or game mechanics.
                Keep your response short (under 2 sentences). 
                The player asks: "${userMessage}"`
              }
            ]
          }
        ]
      });

      const reply = response.text;
      if (reply) {
        addToChat('Wise Old Man', reply, '#00ff00');
      }
    } catch (error) {
      console.error('Gemini Error:', error);
      addToChat('System', 'The Wise Old Man is currently meditating (API Error).', '#ff0000');
    } finally {
      setIsTyping(false);
    }
  };

  const handleExamine = async (entityName: string) => {
    addToChat('You', `Examine ${entityName}`, '#ffffff');
    
    if (!apiKey) {
      addToChat('System', `It's a ${entityName}. (Enter API Key for more info)`, '#c0c0c0');
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Write a short, witty "Examine" text for a ${entityName} in Old School RuneScape style. max 1 sentence.`
              }
            ]
          }
        ]
      });
      
      const text = response.text;
      if (text) {
        addToChat('Game', text, '#c0c0c0');
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#ffff00] font-mono flex flex-col overflow-hidden">
      <header className="w-full bg-[#3d3d3d] border-b-4 border-[#5d5d5d] p-4 flex justify-between items-center shadow-lg z-20">
        <h1 className="text-2xl font-bold text-[#ffff00] drop-shadow-md" style={{ textShadow: '2px 2px 0 #000' }}>
          OSRS Tower Defense
        </h1>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 bg-[#5d5d5d] hover:bg-[#6d6d6d] px-3 py-1 border-2 border-[#2d2d2d] rounded shadow-sm transition-colors"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col md:flex-row h-[calc(100vh-80px)] overflow-hidden">
        <div className="flex-1 bg-[#000] relative overflow-hidden">
           <GameCanvas apiKey={apiKey} onExamine={handleExamine} />
        </div>
        
        {/* Sidebar for game info/chat */}
        <div className="w-full md:w-96 bg-[#3d3d3d] border-l-4 border-[#2d2d2d] p-4 flex flex-col gap-4 shadow-xl h-full overflow-hidden">
          <div className="bg-[#1e1e1e] p-3 border-2 border-[#5d5d5d] rounded flex-1 overflow-hidden flex flex-col">
            <h2 className="text-[#ff981f] font-bold mb-2 border-b border-[#5d5d5d] pb-1 bg-[#1e1e1e]">Wise Old Man&apos;s Chat</h2>
            <div className="text-sm space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {chatHistory.map((msg, idx) => (
                <p key={idx}>
                  <span style={{ color: msg.color }} className="font-bold">{msg.sender}:</span> <span className="text-[#c0c0c0]">{msg.text}</span>
                </p>
              ))}
              {isTyping && <p className="text-[#00ff00] italic">Wise Old Man is thinking...</p>}
            </div>
          </div>
          
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-[#1e1e1e] border border-[#5d5d5d] text-[#ffff00] px-2 py-1 text-sm rounded focus:outline-none focus:border-[#ffff00]"
              placeholder="Ask the Wise Old Man..."
            />
            <button type="submit" className="bg-[#5d5d5d] hover:bg-[#6d6d6d] p-2 border border-[#2d2d2d] rounded text-[#ffff00]">
              <Send size={16} />
            </button>
          </form>

          <div className="mt-2 pt-2 border-t border-[#5d5d5d]">
            <label className="block text-xs text-[#c0c0c0] mb-1">Gemini API Key (Required)</label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => handleSaveKey(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-[#5d5d5d] text-[#ffff00] px-2 py-1 text-sm rounded focus:outline-none focus:border-[#ffff00]"
              placeholder="Enter API Key..."
            />
          </div>
        </div>
      </main>

      {/* OSRS Style Modal for Settings if needed */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#3d3d3d] border-4 border-[#5d5d5d] p-6 max-w-md w-full shadow-2xl rounded-lg">
            <h2 className="text-xl font-bold text-[#ffff00] mb-4 text-center" style={{ textShadow: '1px 1px 0 #000' }}>Game Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Gemini API Key</label>
                <input 
                  type="text" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#5d5d5d] p-2 text-[#ffff00]"
                />
                <p className="text-xs text-gray-400 mt-1">Required for dynamic game events.</p>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button 
                  onClick={() => handleSaveKey(apiKey)}
                  className="bg-[#5d5d5d] hover:bg-[#6d6d6d] px-4 py-2 border-2 border-[#2d2d2d] text-[#ffff00] font-bold"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
