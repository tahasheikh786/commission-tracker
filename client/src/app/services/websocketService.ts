/**
 * WebSocket service for real-time progress tracking during document extraction.
 */

export interface ProgressUpdate {
  type: 'progress_update' | 'error' | 'completion' | 'connection_established' | 'pong' | 'status';
  upload_id: string;
  progress?: {
    stage: string;
    progress_percentage: number;
    message?: string;
    stage_details?: {
      name: string;
      description: string;
      icon: string;
      estimated_duration: string;
    };
  };
  error?: {
    message: string;
    code?: string;
    timestamp: string;
  };
  result?: {
    tables: any[];
    extraction_method: string;
    file_type: string;
    processing_time: number;
    quality_summary?: any;
    metadata?: any;
    gcs_url?: string;
    gcs_key?: string;
  };
  timestamp: string;
}

export interface WebSocketConfig {
  uploadId: string;
  sessionId?: string;
  token?: string;
  onProgress?: (progress: ProgressUpdate) => void;
  onError?: (error: ProgressUpdate) => void;
  onCompletion?: (result: ProgressUpdate) => void;
  onConnectionEstablished?: () => void;
  onDisconnect?: () => void;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private isConnecting = false;

  constructor(config: WebSocketConfig) {
    this.config = config;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      // Get the base URL from environment or current location
      let baseUrl: string;
      if (process.env.NEXT_PUBLIC_API_URL) {
        baseUrl = process.env.NEXT_PUBLIC_API_URL.replace(/^https?:\/\//, '');
      } else {
        // For development, connect to the backend server (port 8000)
        const host = window.location.hostname;
        baseUrl = `${host}:8000`;
      }
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const sessionId = this.config.sessionId || this.generateSessionId();
      
      // Get access token from cookies for authentication
      const getCookie = (name: string): string | null => {
        if (typeof document === 'undefined') return null;
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
        return null;
      };
      
      const accessToken = getCookie('access_token');
      
      console.log('WebSocket Debug:', {
        uploadId: this.config.uploadId,
        sessionId,
        accessToken: accessToken ? 'Present' : 'Not found',
        baseUrl,
        protocol
      });
      
      // Construct WebSocket URL with token from cookies
      // FIXED: Added /api prefix to match backend APIRouter configuration
      const wsUrl = `${protocol}//${baseUrl}/api/ws/progress/${this.config.uploadId}?session_id=${sessionId}${accessToken ? `&token=${accessToken}` : ''}`;
      
      console.log('Connecting to WebSocket URL:', wsUrl);
      console.log('Upload ID being used for WebSocket:', this.config.uploadId);
      this.ws = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        const connectionTimeout = setTimeout(() => {
          this.disconnect();
          reject(new Error('WebSocket connection timeout'));
        }, 10000);

        this.ws!.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('✅ WebSocket connected successfully!');
          console.log('WebSocket connection details:', {
            uploadId: this.config.uploadId,
            sessionId,
            url: wsUrl,
            readyState: this.ws?.readyState
          });
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startPingInterval();
          
          // Send authentication if token available
          if (accessToken) {
            this.send({
              type: 'auth',
              token: accessToken,
              session_id: sessionId
            });
          }
          
          this.config.onConnectionEstablished?.();
          resolve();
        };

        this.ws!.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', error);
          console.error('WebSocket error details:', {
            type: error.type,
            target: error.target,
            currentTarget: error.currentTarget
          });
          this.isConnecting = false;
          // Don't reject immediately - let onclose handle it
          console.log('WebSocket error occurred, waiting for close event');
        };

        this.ws!.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('WebSocket disconnected:', event.code, event.reason);
          console.log('WebSocket close details:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            uploadId: this.config.uploadId,
            url: wsUrl
          });
          
          this.isConnected = false;
          this.isConnecting = false;
          this.stopPingInterval();
          this.config.onDisconnect?.();
          
          // If this is the initial connection attempt and it failed, reject the promise
          if (this.reconnectAttempts === 0) {
            console.log('❌ Initial WebSocket connection failed');
            console.log('Connection failure analysis:', {
              code: event.code,
              reason: event.reason,
              possibleCauses: {
                1006: 'Abnormal closure - usually 404 (route not found) or server error',
                1000: 'Normal closure',
                1001: 'Going away',
                1002: 'Protocol error',
                1003: 'Unsupported data',
                1007: 'Invalid frame payload data',
                1008: 'Policy violation',
                1009: 'Message too big',
                1010: 'Missing extension',
                1011: 'Internal error'
              }[event.code] || 'Unknown error code'
            });
            reject(new Error(`WebSocket connection failed: ${event.code} ${event.reason}`));
            return;
          }
          
          // Attempt to reconnect if not a normal closure and we haven't exceeded max attempts
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log(`WebSocket closed unexpectedly (code: ${event.code}), attempting to reconnect...`);
            this.scheduleReconnect();
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached, giving up');
            this.config.onError?.({
              type: 'error',
              upload_id: this.config.uploadId,
              error: {
                message: 'WebSocket connection failed after maximum retry attempts',
                code: 'CONNECTION_FAILED',
                timestamp: new Date().toISOString()
              },
              timestamp: new Date().toISOString()
            });
          }
        };

        this.ws!.onmessage = (event) => {
          this.handleMessage(event);
        };
      });

    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Send a message to the server
   */
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  /**
   * Send a ping to keep the connection alive
   */
  ping(): void {
    this.send({
      type: 'ping',
      upload_id: this.config.uploadId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Request current status
   */
  getStatus(): void {
    this.send({
      type: 'get_status'
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data: ProgressUpdate = JSON.parse(event.data);
      
      console.log('📨 WebSocket message received for upload_id:', this.config.uploadId);
      console.log('Message details:', {
        type: data.type,
        upload_id: data.upload_id,
        timestamp: data.timestamp,
        progress: data.progress ? {
          stage: data.progress.stage,
          percentage: data.progress.progress_percentage,
          message: data.progress.message
        } : null
      });
      
      switch (data.type) {
        case 'progress_update':
          console.log('🔄 Processing progress update:', {
            stage: data.progress?.stage,
            percentage: data.progress?.progress_percentage,
            message: data.progress?.message
          });
          this.config.onProgress?.(data);
          break;
          
        case 'completion':
          console.log('✅ Processing completion message:', {
            tablesCount: data.result?.tables?.length || 0,
            extractionMethod: data.result?.extraction_method,
            processingTime: data.result?.processing_time
          });
          this.config.onCompletion?.(data);
          // Don't auto-disconnect on completion to allow for final messages
          setTimeout(() => this.disconnect(), 2000);
          break;
          
        case 'error':
          console.log('❌ Processing error message:', data.error);
          this.config.onError?.(data);
          break;
          
        case 'connection_established':
          console.log('🔗 WebSocket connection confirmed by server for upload_id:', this.config.uploadId);
          break;
          
        case 'pong':
          console.log('💓 Heartbeat response received');
          break;
          
        default:
          console.warn('⚠️ Unknown WebSocket message type:', data.type, 'for upload_id:', this.config.uploadId);
      }
    } catch (error) {
      console.error('❌ Failed to parse WebSocket message for upload_id:', this.config.uploadId, 'Error:', error, 'Raw data:', event.data);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.ping();
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (!this.isConnected && !this.isConnecting) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    isConnected: boolean;
    isConnecting: boolean;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Test WebSocket connection (for debugging)
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Testing WebSocket connection...');
      const status = this.getConnectionStatus();
      console.log('Current connection status:', status);
      
      if (this.ws) {
        console.log('WebSocket ready state:', this.ws.readyState);
        console.log('WebSocket URL:', this.ws.url);
      }
      
      return this.isConnected;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

/**
 * Hook for using WebSocket service in React components
 */
export function useWebSocketProgress(config: WebSocketConfig) {
  const [wsService, setWsService] = React.useState<WebSocketService | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState({
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0
  });

  React.useEffect(() => {
    if (config.uploadId) {
      const service = new WebSocketService(config);
      setWsService(service);
      
      // Connect when component mounts
      service.connect().catch(console.error);
      
      // Update connection status periodically
      const statusInterval = setInterval(() => {
        setConnectionStatus(service.getConnectionStatus());
      }, 1000);

      return () => {
        clearInterval(statusInterval);
        service.disconnect();
      };
    }
  }, [config.uploadId]);

  return {
    wsService,
    connectionStatus,
    connect: () => wsService?.connect(),
    disconnect: () => wsService?.disconnect(),
    send: (message: any) => wsService?.send(message)
  };
}

// Import React for the hook
import React from 'react';
