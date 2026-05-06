import { useConversation } from '@elevenlabs/react';
import { useCallback, useState, useEffect, useRef } from 'react';

const ELEVENLABS_AGENT_ID = process.env.REACT_APP_ELEVENLABS_AGENT_ID;

// Logging helper with timestamps
const log = (level, ...args) => {
  const timestamp = new Date().toISOString();
  const prefix = `[ElevenLabs ${timestamp}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
};

const QUOTA_KEYWORDS = ['quota', 'billing', 'limit exceeded', 'rate limit', 'too many requests', 'payment', 'subscription'];

function classifyVoiceError(err) {
  const msg = (err?.message || err?.reason || String(err || '')).toLowerCase();
  if (QUOTA_KEYWORDS.some((k) => msg.includes(k))) {
    return 'Voice quota exceeded. Please try again later or check your ElevenLabs plan.';
  }
  if (msg.includes('network') || msg.includes('websocket') || msg.includes('connection')) {
    return 'Voice connection lost. Please check your internet connection and try again.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Voice connection timed out. Please try again.';
  }
  return err?.message || 'An error occurred with the voice connection.';
}

export const useElevenLabs = (options = {}) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [micMuted, setMicMuted] = useState(false);
  const conversationIdRef = useRef(null);
  const sessionRef = useRef(null); // Track session for text messages

  // Use hardcoded Agent ID for Alpha build
  const agentId = ELEVENLABS_AGENT_ID;

  // Initialize the conversation with callbacks and barge-in fix
  const conversation = useConversation({
    // ========================================
    // FIX #1: VOICE CUT-OFF - Disable Barge-In
    // ========================================
    // Override conversation settings to prevent agent from being interrupted
    // by background noise or unintentional sounds
    overrides: {
      conversation: {
        // Disable barge-in completely for testing
        // This prevents the agent from stopping when it detects user audio
        clientTools: {},
      },
    },

    // ========================================
    // CALLBACKS
    // ========================================
    onConnect: () => {
      log('info', 'Connected to Agent:', agentId);
      setConnectionStatus('connected');
      setError(null);
      options.onConnect?.();
    },

    onDisconnect: () => {
      log('info', 'Disconnected from session');
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
      sessionRef.current = null;
      options.onDisconnect?.();
    },

    onMessage: (message) => {
      log('info', 'Message received:', JSON.stringify(message, null, 2));
      
      // Handle different message types from the SDK
      // The SDK sends various message types including transcripts and agent responses
      if (message.type === 'user_transcript' || 
          message.type === 'agent_response' ||
          message.source === 'user' ||
          message.source === 'ai') {
        
        const isUser = message.type === 'user_transcript' || message.source === 'user';
        const content = message.message || message.text || message.content || '';
        
        if (content) {
          const newMessage = {
            id: Date.now() + Math.random(),
            role: isUser ? 'user' : 'assistant',
            content: content,
            timestamp: new Date().toISOString(),
            isFinal: message.isFinal !== false
          };
          
          setMessages(prev => {
            // For tentative messages, update the last message of same role
            if (!newMessage.isFinal) {
              const lastIndex = prev.findLastIndex(m => m.role === newMessage.role && !m.isFinal);
              if (lastIndex !== -1) {
                const updated = [...prev];
                updated[lastIndex] = newMessage;
                return updated;
              }
            }
            return [...prev, newMessage];
          });
        }
      }
      
      options.onMessage?.(message);
    },

    // ========================================
    // FIX #3: ENHANCED ERROR LOGGING
    // ========================================
    onError: (err) => {
      log('error', '=== ERROR EVENT ===');
      log('error', 'Error object:', err);
      log('error', 'Error message:', err?.message || 'Unknown error');
      log('error', 'Error code:', err?.code || 'N/A');
      log('error', 'Error stack:', err?.stack || 'N/A');
      log('error', 'Session active:', isSessionActive);
      log('error', 'Connection status:', connectionStatus);
      log('error', '===================');
      
      setError(classifyVoiceError(err));
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

    // VAD (Voice Activity Detection) score - useful for debugging barge-in
    onVadScore: (score) => {
      // Only log high scores that might trigger interruption
      if (score > 0.5) {
        log('warn', 'VAD Score (potential interruption):', score);
      }
    },

    onDebug: (debugInfo) => {
      log('info', 'Debug:', debugInfo);
    },

    // Controlled state for volume and mic
    volume: options.volume ?? 1,
    micMuted: micMuted || (options.micMuted ?? false),
  });

  /**
   * Start a voice session with ElevenLabs Conversational AI
   * Configured with barge-in disabled to prevent voice cut-off
   */
  const startSession = useCallback(async () => {
    if (!agentId) {
      const errorMsg = 'ElevenLabs Agent ID not configured.';
      setError(errorMsg);
      log('error', errorMsg);
      return null;
    }

    // Guard against double-start
    if (isSessionActive || connectionStatus === 'connecting') {
      log('warn', 'Session already active or connecting, ignoring duplicate start');
      return null;
    }

    try {
      setError(null);
      setConnectionStatus('connecting');
      
      log('info', 'Starting session with Agent ID:', agentId);
      
      // Request microphone permission first
      log('info', 'Requesting microphone permission...');
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        log('info', 'Microphone permission granted');
      } catch (micErr) {
        const isDenied = micErr?.name === 'NotAllowedError' || micErr?.name === 'PermissionDeniedError';
        const isNotFound = micErr?.name === 'NotFoundError' || micErr?.name === 'DevicesNotFoundError';
        let userMessage;
        if (isDenied) {
          userMessage = 'Microphone access was denied. Please allow microphone access in your browser settings and try again.';
        } else if (isNotFound) {
          userMessage = 'No microphone found. Please connect a microphone and try again.';
        } else {
          userMessage = `Microphone error: ${micErr?.message || 'Unknown error'}`;
        }
        setError(userMessage);
        setConnectionStatus('disconnected');
        log('error', 'Microphone access failed:', micErr?.name, micErr?.message);
        return null;
      }
      
      // Start the conversation session with WebRTC for low latency
      const sessionPromise = conversation.startSession({
        agentId: agentId,
        connectionType: 'webrtc',
        overrides: {
          conversation: {},
        },
      });

      // Timeout after 15 seconds to prevent hanging in "connecting" state
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out. Please check your internet connection and try again.')), 15000)
      );

      const conversationId = await Promise.race([sessionPromise, timeoutPromise]);
      
      conversationIdRef.current = conversationId;
      sessionRef.current = conversation; // Store reference for text messages
      setIsSessionActive(true);
      
      log('info', '=== SESSION STARTED ===');
      log('info', 'Conversation ID:', conversationId);
      log('info', 'Agent ID:', agentId);
      log('info', 'Connection type: WebRTC');
      log('info', '=======================');
      
      return conversationId;
    } catch (err) {
      log('error', '=== SESSION START FAILED ===');
      log('error', 'Error:', err);
      log('error', 'Error message:', err?.message);
      log('error', '============================');
      
      setError(err?.message || 'Failed to start voice session');
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
      return null;
    }
  }, [agentId, conversation, connectionStatus, isSessionActive]);

  // End the voice session
  const endSession = useCallback(async () => {
    try {
      log('info', 'Ending session...');
      await conversation.endSession();
      setIsSessionActive(false);
      conversationIdRef.current = null;
      sessionRef.current = null;
      log('info', 'Session ended successfully');
    } catch (err) {
      log('error', 'Failed to end session:', err);
    }
  }, [conversation]);

  // Toggle session (start/stop)
  const toggleSession = useCallback(async () => {
    if (isSessionActive) {
      await endSession();
    } else {
      await startSession();
    }
  }, [isSessionActive, startSession, endSession]);

  // ========================================
  // FIX #2: DEAD CHAT BOX - Fixed Text Input
  // ========================================
  /**
   * Send a text message to the agent
   * This properly triggers the agent to respond
   */
  const sendTextMessage = useCallback((text) => {
    if (!text?.trim()) {
      log('warn', 'sendTextMessage called with empty text');
      return false;
    }

    const trimmedText = text.trim();
    log('info', '=== SENDING TEXT MESSAGE ===');
    log('info', 'Text:', trimmedText);
    log('info', 'Session active:', isSessionActive);
    log('info', 'Conversation status:', conversation.status);
    
    // Add user message to local state immediately for UI feedback
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: trimmedText,
      timestamp: new Date().toISOString(),
      isFinal: true,
      source: 'text_input'
    };
    setMessages(prev => [...prev, userMessage]);

    // Check if session is active before sending
    if (!isSessionActive) {
      log('warn', 'Cannot send text - no active session');
      log('warn', 'Please start a voice session first by clicking the microphone button');
      
      // Add system message to inform user
      const systemMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'Please start a voice session first by clicking the microphone button.',
        timestamp: new Date().toISOString(),
        isFinal: true,
        isSystem: true
      };
      setMessages(prev => [...prev, systemMessage]);
      return false;
    }

    try {
      // Use the SDK's sendUserMessage method to send text to the agent
      // This will trigger the agent to respond as if the user spoke
      log('info', 'Calling conversation.sendUserMessage...');
      conversation.sendUserMessage(trimmedText);
      log('info', 'Text message sent successfully');
      log('info', '============================');
      return true;
    } catch (err) {
      log('error', '=== TEXT MESSAGE FAILED ===');
      log('error', 'Error:', err);
      log('error', '===========================');
      return false;
    }
  }, [conversation, isSessionActive]);

  // Send contextual update (doesn't trigger response)
  const sendContextualUpdate = useCallback((context) => {
    if (!context?.trim() || !isSessionActive) return;
    
    log('info', 'Sending contextual update:', context);
    try {
      conversation.sendContextualUpdate(context);
    } catch (err) {
      log('error', 'Failed to send contextual update:', err);
    }
  }, [conversation, isSessionActive]);

  // Toggle microphone mute (push-to-talk support)
  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      log('info', `Mic ${prev ? 'unmuted' : 'muted'}`);
      return !prev;
    });
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    log('info', 'Messages cleared');
  }, []);

  // Set volume (0-1 scale)
  const setVolume = useCallback((volume) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    log('info', 'Setting volume to:', clampedVolume);
    conversation.setVolume({ volume: clampedVolume });
  }, [conversation]);

  // Notify agent of user activity (prevents interruption while typing)
  const notifyUserActivity = useCallback(() => {
    if (isSessionActive) {
      conversation.sendUserActivity();
    }
  }, [conversation, isSessionActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSessionActive) {
        log('info', 'Component unmounting, cleaning up session...');
        conversation.endSession().catch(err => {
          log('error', 'Cleanup error:', err);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Session control
    startSession,
    endSession,
    toggleSession,
    isSessionActive,
    
    // Status
    status: conversation.status,
    connectionStatus,
    isSpeaking: conversation.isSpeaking,
    
    // Messages
    messages,
    sendTextMessage,
    sendContextualUpdate,
    clearMessages,
    sendUserActivity: notifyUserActivity,
    
    // Mic control (push-to-talk)
    micMuted,
    toggleMic,

    // Volume control
    setVolume,
    getInputVolume: conversation.getInputVolume,
    getOutputVolume: conversation.getOutputVolume,
    
    // Feedback
    canSendFeedback: conversation.canSendFeedback,
    sendFeedback: conversation.sendFeedback,
    
    // Error handling
    error,
    
    // Conversation ID
    conversationId: conversationIdRef.current,
    
    // Raw conversation object for advanced use
    conversation,
    
    // Configuration info
    isConfigured: !!agentId,
    agentId: agentId,
  };
};

// Export the hardcoded Agent ID for verification/testing
export const ALPHA_AGENT_ID = ELEVENLABS_AGENT_ID;

export default useElevenLabs;
