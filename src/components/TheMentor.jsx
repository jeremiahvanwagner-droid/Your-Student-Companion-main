import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  Send,
  Bot,
  ExternalLink,
  Lock,
  RefreshCw,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  User,
  Phone,
  PhoneOff,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { getUnlockedPacks } from "@/components/Store";
import { useElevenLabs } from "@/hooks/useElevenLabs";
import { sendMentorChat, persistVoiceTranscript } from "@/lib/aiMentorApi";

const STORAGE_KEY = "studentCompanion_chatHistory";

// Get chat history from localStorage
const getChatHistory = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

// Save chat history to localStorage
const saveChatHistory = (messages) => {
  // Only keep last 50 messages
  const trimmed = messages.slice(-50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
};

const TheMentor = ({ userId = null, unlockedPacks = [], unlockedPackNames = [], isMinor = false }) => {
  const navigate = useNavigate();
  const [localMessages, setLocalMessages] = useState(getChatHistory());
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [volume, setVolumeState] = useState(0.8);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const currentUnlocked = unlockedPacks.length > 0 ? unlockedPacks : getUnlockedPacks();
  const hasUnlockedPacks = currentUnlocked.length > 0;

  const resolvedPackNames =
    unlockedPackNames.length > 0
      ? unlockedPackNames
      : currentUnlocked.map((packId) => `Pack ${packId}`);

  // ElevenLabs Conversational AI hook
  const {
    startSession,
    endSession,
    toggleSession,
    isSessionActive,
    status,
    connectionStatus,
    isSpeaking,
    messages: elevenLabsMessages,
    sendTextMessage,
    sendUserActivity,
    setVolume,
    micMuted,
    toggleMic,
    conversationId,
    errorState,
    errorMessage: elevenLabsError,
    isConfigured,
    agentId,
    clearError,
  } = useElevenLabs({ volume });

  // Combine local messages with ElevenLabs messages
  const allMessages = isSessionActive ? elevenLabsMessages : localMessages;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allMessages]);

  // Save local messages to localStorage when they change
  useEffect(() => {
    if (localMessages.length > 0 && !isSessionActive) {
      saveChatHistory(localMessages);
    }
  }, [localMessages, isSessionActive]);

  // Update volume when changed
  useEffect(() => {
    if (isSessionActive) {
      setVolume(volume);
    }
  }, [volume, isSessionActive, setVolume]);

  const handleSendMessage = async () => {
    const messageText = inputValue.trim();
    if (!messageText) return;

    if (isSessionActive) {
      // Send via ElevenLabs
      sendTextMessage(messageText);
      setInputValue("");
      return;
    }

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: messageText,
      timestamp: new Date().toISOString(),
      isFinal: true,
    };

    setLocalMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    try {
      const historyPayload = localMessages
        .filter((message) => message?.role === "user" || message?.role === "assistant")
        .slice(-12)
        .map((message) => ({ role: message.role, content: message.content }));

      const result = await sendMentorChat({
        message: messageText,
        conversation_history: historyPayload,
        unlocked_packs: currentUnlocked,
        user_id: userId,
        voice_enabled: false,
        is_minor: isMinor,
      });

      const aiResponse = {
        id: Date.now() + 1,
        role: "assistant",
        content: result?.message || "I could not generate a response right now.",
        timestamp: new Date().toISOString(),
        isFinal: true,
      };

      setLocalMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      const aiErrorResponse = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          error?.message ||
          "I ran into a connection issue. Please try again in a moment.",
        timestamp: new Date().toISOString(),
        isFinal: true,
      };

      setLocalMessages((prev) => [...prev, aiErrorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    // Notify ElevenLabs of user activity (prevents interruption)
    if (isSessionActive) {
      sendUserActivity();
    }
  };

  const clearChat = () => {
    setLocalMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleEndSession = async () => {
    if (elevenLabsMessages.length > 0) {
      persistVoiceTranscript({
        messages: elevenLabsMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        conversationId,
      });
    }
    await endSession();
  };

  const handleVoiceToggle = async () => {
    if (!isConfigured) {
      return;
    }
    if (isSessionActive) {
      await handleEndSession();
    } else {
      await startSession();
    }
  };

  const handleVolumeToggle = () => {
    const newVolume = volume > 0 ? 0 : 0.8;
    setVolumeState(newVolume);
    if (isSessionActive) {
      setVolume(newVolume);
    }
  };

  return (
    <div className="flex flex-col h-[500px] sm:h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            {/* Animated Orb - pulses when speaking */}
            <div 
              className={`
                p-2 rounded-xl border transition-all duration-300
                ${isSessionActive 
                  ? isSpeaking 
                    ? 'bg-accent/30 border-accent shadow-[0_0_20px_hsl(166,100%,70%,0.5)] animate-pulse' 
                    : 'bg-accent/20 border-accent/50 shadow-[0_0_10px_hsl(166,100%,70%,0.3)]'
                  : 'bg-accent/10 border-accent/20'
                }
              `}
            >
              <Bot className={`w-5 h-5 ${isSessionActive ? 'text-accent' : 'text-accent/70'}`} />
            </div>
            {/* Status indicator */}
            <div 
              className={`
                absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background
                ${isSessionActive 
                  ? isSpeaking 
                    ? 'bg-accent animate-pulse' 
                    : 'bg-green-500' 
                  : hasUnlockedPacks 
                    ? 'bg-yellow-500' 
                    : 'bg-muted-foreground/50'
                }
              `} 
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">The Mentor</h2>
            <p className="text-xs text-muted-foreground">
              {isSessionActive 
                ? isSpeaking 
                  ? "Speaking..." 
                  : "Listening..."
                : hasUnlockedPacks 
                  ? `Specialized in ${resolvedPackNames.length} subject${resolvedPackNames.length > 1 ? 's' : ''}` 
                  : "Unlock a pack to activate"
              }
            </p>
          </div>
        </div>

        {/* Voice Controls */}
        <div className="flex items-center gap-2">
          {/* Mic Mute (push-to-talk) — only shown during active session */}
          {isSessionActive && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMic}
              title={micMuted ? "Unmute mic" : "Mute mic"}
              className={`h-8 w-8 transition-all ${micMuted ? 'text-red-400 hover:text-red-300' : 'text-accent hover:text-accent/80'}`}
              data-testid="mic-mute-toggle"
            >
              {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}

          {/* Start/End Session Button */}
          <Button
            variant={isSessionActive ? "destructive" : "default"}
            size="icon"
            onClick={handleVoiceToggle}
            disabled={!hasUnlockedPacks || !isConfigured}
            className={`h-8 w-8 transition-all ${
              isSessionActive
                ? 'bg-red-500/80 hover:bg-red-500'
                : 'bg-accent/80 hover:bg-accent text-accent-foreground'
            }`}
            data-testid="voice-session-toggle"
          >
            {connectionStatus === 'connecting' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSessionActive ? (
              <PhoneOff className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
          </Button>

          {/* Volume Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleVolumeToggle}
            disabled={!hasUnlockedPacks}
            className={`h-8 w-8 ${volume > 0 ? 'text-accent' : 'text-muted-foreground'}`}
            data-testid="volume-toggle"
          >
            {volume > 0 ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Contextual error banners */}
      {errorState === 'mic_permission_denied' && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2" data-testid="error-banner-mic">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-300 font-medium">Microphone access denied</p>
            <p className="text-xs text-muted-foreground mt-0.5">{elevenLabsError}</p>
          </div>
          <a
            href="https://support.google.com/chrome/answer/2693767"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 flex-shrink-0"
            onClick={clearError}
          >
            Open settings <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {errorState === 'quota_exceeded' && (
        <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2" data-testid="error-banner-quota">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-destructive font-medium">Voice quota exceeded</p>
            <p className="text-xs text-muted-foreground mt-0.5">{elevenLabsError}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-accent hover:text-accent/80 flex-shrink-0"
            onClick={() => { clearError(); navigate('/store'); }}
          >
            Upgrade plan
          </Button>
        </div>
      )}

      {(errorState === 'network_error' || errorState === 'agent_timeout') && (
        <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2" data-testid="error-banner-retry">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-destructive font-medium">
              {errorState === 'agent_timeout' ? 'Voice session timed out' : 'Voice connection error'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{elevenLabsError}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-accent hover:text-accent/80 flex-shrink-0"
            onClick={() => { clearError(); startSession(); }}
            data-testid="error-retry-btn"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {errorState === 'unknown_error' && elevenLabsError && (
        <div className="mb-3 p-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2" data-testid="error-banner-unknown">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <p className="text-xs text-destructive flex-1">{elevenLabsError}</p>
        </div>
      )}

      {/* Agent ID Verification (Alpha Build - for testing) */}
      {process.env.NODE_ENV === 'development' && agentId && (
        <div className="mb-3 p-2 rounded-lg bg-accent/5 border border-accent/20">
          <p className="text-xs text-muted-foreground font-mono">
            🔗 Agent: {agentId.substring(0, 20)}...
          </p>
        </div>
      )}

      {/* Unlocked Packs Badges */}
      {hasUnlockedPacks && (
        <div className="flex flex-wrap gap-2 mb-3">
          {resolvedPackNames.map((name, idx) => (
            <Badge 
              key={idx} 
              variant="outline" 
              className="text-xs border-accent/30 text-accent bg-accent/5"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {name}
            </Badge>
          ))}
        </div>
      )}

      {/* Voice Session Active Indicator */}
      {isSessionActive && (
        <div className="mb-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-accent animate-pulse' : 'bg-green-500'}`} />
              <span className="text-xs text-accent font-medium">
                {isSpeaking ? 'AI is speaking...' : 'Voice session active - speak or type'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEndSession}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              End
            </Button>
          </div>
        </div>
      )}

      {/* Chat Messages Area */}
      <Card className="flex-1 bg-card/50 border-border/30 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="space-y-4">
            {/* Welcome message */}
            {allMessages.length === 0 && (
              <div className="text-center py-8">
                {/* Animated Blue Orb */}
                <div className={`
                  w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4
                  transition-all duration-500
                  ${isSessionActive 
                    ? isSpeaking
                      ? 'bg-accent/30 shadow-[0_0_30px_hsl(166,100%,70%,0.5)] animate-pulse'
                      : 'bg-accent/20 shadow-[0_0_20px_hsl(166,100%,70%,0.3)]'
                    : 'bg-accent/10'
                  }
                `}>
                  <Bot className={`w-8 h-8 ${isSessionActive ? 'text-accent' : 'text-accent/70'}`} />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Welcome to The Mentor
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {isSessionActive 
                    ? "Voice session is active! Speak naturally or type your message."
                    : hasUnlockedPacks 
                      ? "I'm your AI-powered study companion. Click the microphone to start a voice conversation, or type below!"
                      : "Unlock a Course Pack from the Store to activate personalized AI tutoring."
                  }
                </p>
                {!hasUnlockedPacks && (
                  <div className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border/30 max-w-xs mx-auto">
                    <Lock className="w-4 h-4 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Voice features powered by ElevenLabs Conversational AI
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {allMessages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className={`
                    p-1.5 rounded-lg h-fit transition-all
                    ${isSpeaking && isSessionActive 
                      ? 'bg-accent/30 shadow-[0_0_10px_hsl(166,100%,70%,0.3)]' 
                      : 'bg-accent/10'
                    }
                  `}>
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                )}
                
                <div
                  className={`
                    max-w-[80%] px-4 py-2.5 rounded-2xl text-sm
                    ${message.role === 'user'
                      ? 'bg-accent text-accent-foreground rounded-br-md'
                      : 'bg-secondary/50 text-foreground rounded-bl-md'
                    }
                    ${!message.isFinal ? 'opacity-70' : ''}
                  `}
                >
                  {message.content}
                  {!message.isFinal && (
                    <span className="ml-1 text-xs opacity-50">...</span>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="p-1.5 rounded-lg bg-secondary/50 h-fit">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && !isSessionActive && (
              <div className="flex gap-3">
                <div className="p-1.5 rounded-lg bg-accent/10">
                  <Bot className="w-4 h-4 text-accent" />
                </div>
                <div className="bg-secondary/50 px-4 py-2.5 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Speaking indicator during voice session */}
            {isSessionActive && isSpeaking && (
              <div className="flex gap-3">
                <div className="p-1.5 rounded-lg bg-accent/30 shadow-[0_0_10px_hsl(166,100%,70%,0.3)] animate-pulse">
                  <Bot className="w-4 h-4 text-accent" />
                </div>
                <div className="bg-accent/10 px-4 py-2.5 rounded-2xl rounded-bl-md border border-accent/20">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <div 
                          key={i}
                          className="w-1 bg-accent rounded-full animate-pulse"
                          style={{ 
                            height: `${8 + Math.random() * 12}px`,
                            animationDelay: `${i * 100}ms`,
                            animationDuration: '0.5s'
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-accent">Speaking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Input Area */}
      <div className="mt-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={
                isSessionActive 
                  ? "Type or speak your message..." 
                  : hasUnlockedPacks 
                    ? "Ask The Mentor anything..." 
                    : "Ask a general study question..."
              }
              disabled={isTyping}
              className="pr-12 bg-card border-border/50 focus:border-accent/50 text-foreground placeholder:text-muted-foreground/50"
              data-testid="mentor-input"
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="bg-accent text-accent-foreground hover:bg-accent/90 px-4"
            data-testid="mentor-send-button"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Helper text */}
        <p className="text-xs text-muted-foreground/50 text-center mt-2">
          {isSessionActive 
            ? "Voice session active • Speak naturally or type"
            : hasUnlockedPacks
              ? "Click the microphone to start a voice conversation"
              : "General chat is available; unlock a pack for specialized mentoring"
          }
        </p>
      </div>
    </div>
  );
};

export default TheMentor;

