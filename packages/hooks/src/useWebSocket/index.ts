import { useEffect, useRef, useState } from 'react';
import useLatest from '../useLatest';
import useMemoizedFn from '../useMemoizedFn';
import useUnmount from '../useUnmount';

export enum ReadyState {
  Connecting = 0,
  Open = 1,
  Closing = 2,
  Closed = 3,
}

export interface Options {
  reconnectLimit?: number;
  reconnectInterval?: number;
  manual?: boolean;
  binaryType?: 'blob' | 'arraybuffer';
  onOpen?: (event: WebSocketEventMap['open'], instance: WebSocket) => void;
  onClose?: (event: WebSocketEventMap['close'], instance: WebSocket) => void;
  onMessage?: (message: WebSocketEventMap['message'], instance: WebSocket) => void;
  onError?: (event: WebSocketEventMap['error'], instance: WebSocket) => void;

  protocols?: string | string[];
}

export interface Result {
  latestMessage?: WebSocketEventMap['message'];
  sendMessage?: WebSocket['send'];
  disconnect?: () => void;
  connect?: () => void;
  readyState: ReadyState;
  webSocketIns?: WebSocket;
}

export default function useWebSocket(socketUrl: string, options: Options = {}): Result {
  const {
    reconnectLimit = 3,
    reconnectInterval = 3 * 1000,
    manual = false,
    binaryType = 'blob',
  
    onOpen,
    onClose,
    onMessage,
    onError,
    protocols,
  } = options;

  const onOpenRef = useLatest(onOpen);
  const onCloseRef = useLatest(onClose);
  const onMessageRef = useLatest(onMessage);
  const onErrorRef = useLatest(onError);

  const reconnectTimesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const websocketRef = useRef<WebSocket>();

  const unmountedRef = useRef(false);

  const [latestMessage, setLatestMessage] = useState<WebSocketEventMap['message']>();
  const [readyState, setReadyState] = useState<ReadyState>(ReadyState.Closed);

  const reconnect = () => {
    if (
      reconnectTimesRef.current < reconnectLimit &&
      websocketRef.current?.readyState !== ReadyState.Open
    ) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        connectWs();
        reconnectTimesRef.current++;
      }, reconnectInterval);
    }
  };

  const connectWs = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    if (websocketRef.current) {
      websocketRef.current.close();
    }

    const ws = new WebSocket(socketUrl, protocols);
    ws.binaryType = binaryType;
    setReadyState(ReadyState.Connecting);

    ws.onerror = (event) => {
      if (unmountedRef.current) {
        return;
      }
      reconnect();
      onErrorRef.current?.(event, ws);
      setReadyState(ws.readyState || ReadyState.Closed);
    };
    ws.onopen = (event) => {
      if (unmountedRef.current) {
        return;
      }
      onOpenRef.current?.(event, ws);
      reconnectTimesRef.current = 0;
      setReadyState(ws.readyState || ReadyState.Open);
    };
    ws.onmessage = (message: WebSocketEventMap['message']) => {
      if (unmountedRef.current) {
        return;
      }
      onMessageRef.current?.(message, ws);
      setLatestMessage(message);
    };
    ws.onclose = (event) => {
      if (unmountedRef.current) {
        return;
      }
      reconnect();
      onCloseRef.current?.(event, ws);
      setReadyState(ws.readyState || ReadyState.Closed);
    };

    websocketRef.current = ws;
  };

  const sendMessage: WebSocket['send'] = (message) => {
    if (readyState === ReadyState.Open) {
      websocketRef.current?.send(message);
    } else {
      throw new Error('WebSocket disconnected');
    }
  };

  const connect = () => {
    reconnectTimesRef.current = 0;
    connectWs();
  };

  const disconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    reconnectTimesRef.current = reconnectLimit;
    websocketRef.current?.close();
  };

  useEffect(() => {
    if (!manual) {
      connect();
    }
  }, [socketUrl, manual]);

  useUnmount(() => {
    unmountedRef.current = true;
    disconnect();
  });

  return {
    latestMessage,
    sendMessage: useMemoizedFn(sendMessage),
    connect: useMemoizedFn(connect),
    disconnect: useMemoizedFn(disconnect),
    readyState,
    webSocketIns: websocketRef.current,
  };
}
