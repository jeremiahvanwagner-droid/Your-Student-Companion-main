import { useConversation } from '@elevenlabs/react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { postVoiceTranscript } from '@/lib/aiMentorApi';

const ELEVENLABS_AGENT_ID = process.env.REACT_APP_ELEVENLABS_AGENT_ID;

const log = (level, ...args) => {
  if (process.env.NODE_ENV !== 'production') {
    const prefix = `[ElevenLabs ${new Date().toISOString()}]`;
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
  }
};

// ── Error classification ──────────────────────────────────────────────────

const QUOTA_KEYWORDS = ['quota', 'billing', 'limit exceeded', 'rate limit', 'too many requests', 'payment', 'subscription', '429'];

function classifyError(err) {
  const msg = (err?.message || err?.reason || String(err || '')).toLowerCase();

  if (QUOTA_KEYWORDS.some((k) => msg.includes(k))) {
    return {
      errorState: 'quota_exceeded',
      errorMessage: 'Voice quota exceeded. Please check your plan or try again later.',
    };
  }
  if (msg.includes('network') || msg.includes('websocket') || msg.includes('connection')) {
    return {
      errorState: 'network_error',
      errorMessage: 'Voice connection lost. Check your internet connection.',
    };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      errorState: 'agent_timeout',
      errorMessage: 'Voice connection timed out. Please try again.',
    };
  }
  return {
    errorState: 'unknown_error',
    errorMessage: err?.message || 'An unexpected error occurred with the voice connection.',
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────

export const useElevenLabs = (options = {}) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [errorState, setErrorState] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [micMuted, setMicMuted] = useState(false);

  const conversationIdRef = useRef(null);
  const sessionRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMessageTimeRef = useRef(null);
  const agentTimeoutRef = useRef(null);

  const RECONNECT_DELAYS = [1000, 3000];

  const agentId = ELEVENLABS_AGENT_ID;

  const clearError = useCallback(() => {
    setErrorState(null);
    setErrorMessage(null);
  }, []);

  const setError = useCallback((err) => {
    const classified = classifyError(err);
    setErrorState(classified.errorState);
    setErrorMessage(classified.errorMessage);
  }, []);

  // ── Agent timeout watchdog ──────────────────────────────────────────
  const resetAgentTimeout = useCallback(() => {
    lastMessageTimeRef.current = Date.now();
    if (agentTimeoutRef.current) clearTimeout(agentTimeoutRef.current);
    agentTimeoutRef.current = setTimeout(() => {
      log('warn', 'Agent timeout: no message for 30s');
      setErrorState('agent_timeout');
      setErrorMessage('The AI mentor stopped responding. Session ended.');
      toast.error('Voice session timed out', {
        description: 'No response from the AI mentor for 30 seconds.',
      });
    }, 30000);
  }, []);

  const clearAgentTimeout = useCallback(() => {
    if (agentTimeoutRef.current) {
      clearTimeout(agentTimeoutRef.current);
      agentTimeoutRef.current = null;
    }
  }, []);

  const conversation = useConversation({
    overrides: {
      conversation: { clientTools: {} },
    },

    onConnect: () => {
      log('info', 'Connected to Agent:', agentId);
      setConnectionStatus('connected');
      clearError();
      reconnectAttemptsRef.current = 0;
      resetAgentTimeout();
      options.onConnect?.();
    },

    onDisconnect: () => {
      log('info', 'Disconnected from session');
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
      sessionRef.current = null;
      clearAgentTimeout();
      options.onDisconnect?.();
    },

    onMessage: (message) => {
      log('info', 'Message received:', JSON.stringify(message, null, 2));
      resetAgentTimeout();

      if (
        message.type === 'user_transcript' ||
        message.type === 'agent_response' ||
        message.source === 'user' ||
        message.source === 'ai'
      ) {
        const isUser = message.type === 'user_transcript' || message.source === 'user';
        const content = message.message || message.text || message.content || '';

        if (content) {
          const newMessage = {
            id: Date.now() + Math.random(),
            role: isUser ? 'user' : 'assistant',
            content,
            timestamp: new Date().toISOString(),
            isFinal: message.isFinal !== false,
          };

          setMessages((prev) => {
            if (!newMessage.isFinal) {
              const lastIndex = prev.findLastIndex(
                (m) => m.role === newMessage.role && !m.isFinal
              );
              if (lastIndex !== -1) {
                const updated = [...prev];
                updated[lastIndex] = newMessage;
                return updated;
              }
            }
            return [...prev, newMessage];
          });

          // Best-effort per-message transcript persistence
          if (newMessage.isFinal) {
            postVoiceTranscript({
              role: newMessage.role,
              content: newMessage.content,
              timestamp: newMessage.timestamp,
              sessionId: conversationIdRef.current,
            }).catch(() => {});
          }
        }
      }

      options.onMessage?.(message);
    },

    onError: (err) => {
      log('error', 'Voice error:', err);
      const classified = classifyError(err);
      setErrorState(classified.errorState);
      setErrorMessage(classified.errorMessage);

      // Attempt reconnect on transient network errors
      if (
        classified.errorState === 'network_error' &&
        reconnectAttemptsRef.current < RECONNECT_DELAYS.length
      ) {
        const delay = RECONNECT_DELAYS[reconnectAttemptsRef.current];
        reconnectAttemptsRef.current += 1;
        log('info', `Reconnect attempt ${reconnectAttemptsRef.current} in ${delay}ms`);
        setTimeout(() => {
          if (agentId) {
            toast.info('Reconnecting voice session...');
            conversation.startSession({ agentId, connectionType: 'webrtc', overrides: { conversation: {} } })
              .then((id) => {
                conversationIdRef.current = id;
                sessionRef.current = conversation;
                setIsSessionActive(true);
                clearError();
              })
              .catch(() => {
                log('warn', 'Reconnect failed');
              });
          }
        }, delay);
      } else {
        toast.error('Voice connection error', { description: classified.errorMessage });
      }

      options.onError?.(err);
    },

    onModeChange: (mode) => {
      log('info', 'Mode change:', mode);
      options.onModeChange?.(mode);
    },

    onStatusChange: (status) => {
      log('info', 'Status change:', status);
      setConnectionStatus(status);
      options.onStatusChange?.(status);
    },

    onVadScore: (score) => {
      if (score > 0.5) log('warn', 'VAD Score (potential interruption):', score);
    },

    onDebug: (debugInfo) => {
      log('info', 'Debug:', debugInfo);
    },

    volume: options.volume ?? 1,
    micMuted: micMuted || (options.micMuted ?? false),
  });

  // ── Session control ──────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    if (!agentId) {
      setErrorState('agent_not_configured');
      setErrorMessage('ElevenLabs Agent ID not configured. Set REACT_APP_ELEVENLABS_AGENT_ID.');
      return null;
    }
    if (isSessionActive || connectionStatus === 'connecting') {
      log('warn', 'Session already active or connecting, ignoring duplicate start');
      return null;
    }

    try {
      clearError();
      setConnectionStatus('connecting');
      reconnectAttemptsRef.current = 0;

      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        const isDenied =
          micErr?.name === 'NotAllowedError' || micErr?.name === 'PermissionDeniedError';
        const isNotFound =
          micErr?.name === 'NotFoundError' || micErr?.name === 'DevicesNotFoundError';

        setConnectionStatus('disconnected');
        if (isDenied) {
          setErrorState('mic_permission_denied');
          setErrorMessage(
            'Microphone access was denied. Please allow mic access in your browser settings.'
          );
        } else if (isNotFound) {
          setErrorState('unknown_error');
          setErrorMessage('No microphone found. Please connect a microphone and try again.');
        } else {
          setErrorState('unknown_error');
          setErrorMessage(`Microphone error: ${micErr?.message || 'Unknown error'}`);
        }
        return null;
      }

      const sessionPromise = conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        overrides: { conversation: {} },
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Connection timed out. Check your internet connection.')),
          15000
        )
      );

      const conversationId = await Promise.race([sessionPromise, timeoutPromise]);

      conversationIdRef.current = conversationId;
      sessionRef.current = conversation;
      setIsSessionActive(true);
      log('info', 'Session started. ID:', conversationId);

      return conversationId;
    } catch (err) {
      log('error', 'Session start failed:', err);
      const classified = classifyError(err);
      setErrorState(classified.errorState);
      setErrorMessage(classified.errorMessage);
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
      return null;
    }
  }, [agentId, conversation, connectionStatus, isSessionActive, clearError]);

  const endSession = useCallback(async () => {
    try {
      clearAgentTimeout();
      await conversation.endSession();
      setIsSessionActive(false);
      conversationIdRef.current = null;
      sessionRef.current = null;
    } catch (err) {
      log('error', 'Failed to end session:', err);
    }
  }, [conversation, clearAgentTimeout]);

  const toggleSession = useCallback(async () => {
    if (isSessionActive) {
      await endSession();
    } else {
      await startSession();
    }
  }, [isSessionActive, startSession, endSession]);

  // ── Text / context messages ──────────────────────────────────────────

  const sendTextMessage = useCallback(
    (text) => {
      if (!text?.trim()) return false;
      const trimmed = text.trim();

      const userMessage = {
        id: Date.now(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
        isFinal: true,
        source: 'text_input',
      };
      setMessages((prev) => [...prev, userMessage]);

      if (!isSessionActive) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: 'Please start a voice session first by clicking the microphone button.',
            timestamp: new Date().toISOString(),
            isFinal: true,
            isSystem: true,
          },
        ]);
        return false;
      }

      try {
        conversation.sendUserMessage(trimmed);
        return true;
      } catch {
        return false;
      }
    },
    [conversation, isSessionActive]
  );

  const sendContextualUpdate = useCallback(
    (context) => {
      if (!context?.trim() || !isSessionActive) return;
      try {
        conversation.sendContextualUpdate(context);
      } catch (err) {
        log('error', 'Failed to send contextual update:', err);
      }
    },
    [conversation, isSessionActive]
  );

  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      log('info', `Mic ${prev ? 'unmuted' : 'muted'}`);
      return !prev;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const setVolume = useCallback(
    (volume) => {
      conversation.setVolume({ volume: Math.max(0, Math.min(1, volume)) });
    },
    [conversation]
  );

  const notifyUserActivity = useCallback(() => {
    if (isSessionActive) conversation.sendUserActivity();
  }, [conversation, isSessionActive]);

  // ── Cleanup on unmount ───────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearAgentTimeout();
      if (isSessionActive) {
        conversation.endSession().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    startSession,
    endSession,
    toggleSession,
    isSessionActive,

    status: conversation.status,
    connectionStatus,
    isSpeaking: conversation.isSpeaking,

    messages,
    sendTextMessage,
    sendContextualUpdate,
    clearMessages,
    sendUserActivity: notifyUserActivity,

    micMuted,
    toggleMic,

    setVolume,
    getInputVolume: conversation.getInputVolume,
    getOutputVolume: conversation.getOutputVolume,

    canSendFeedback: conversation.canSendFeedback,
    sendFeedback: conversation.sendFeedback,

    // Error state
    errorState,
    errorMessage,
    error: errorMessage, // backwards compat
    clearError,

    conversationId: conversationIdRef.current,
    conversation,
    isConfigured: !!agentId,
    agentId,
  };
};

export const ALPHA_AGENT_ID = ELEVENLABS_AGENT_ID;
export default useElevenLabs;
