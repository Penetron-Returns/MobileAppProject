import * as React from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { companionOrigin } from '@/lib/env';

import {
  buildEmbedHtml,
  draftScript,
  isDraftSentMessage,
  parseWidgetMessage,
  type WidgetEvent,
} from '../logic';

/**
 * Nerova's owner chat. The widget only runs inside a page whose origin is on
 * Nerova's allowlist, so the WebView loads our own one-frame page with
 * `baseUrl` set to that origin. The session URL goes only into that page.
 *
 * `draftText` is handed to the page, which queues it until the frame is ready
 * and then posts it into the frame (filling the input, never sending). It is
 * re-handed after a reload until the page confirms delivery.
 */
export function CompanionWebView({
  sessionUrl,
  onEvent,
  draftText,
}: {
  sessionUrl: string;
  onEvent: (event: WidgetEvent) => void;
  draftText?: string;
}) {
  const webViewRef = React.useRef<WebView>(null);
  const isDelivered = React.useRef(false);
  const source = React.useMemo(
    () => ({ html: buildEmbedHtml(sessionUrl), baseUrl: companionOrigin }),
    [sessionUrl],
  );

  const sendDraft = React.useCallback(() => {
    if (draftText === undefined || isDelivered.current) return;
    webViewRef.current?.injectJavaScript(draftScript(draftText));
  }, [draftText]);

  React.useEffect(() => {
    isDelivered.current = false;
    sendDraft();
  }, [sendDraft]);

  const onMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    if (isDraftSentMessage(raw)) {
      isDelivered.current = true;
      return;
    }
    const parsed = parseWidgetMessage(raw);
    if (parsed) onEvent(parsed);
  };
  return (
    <WebView
      ref={webViewRef}
      source={source}
      originWhitelist={['*']}
      onMessage={onMessage}
      onLoadEnd={sendDraft}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      containerStyle={{ backgroundColor: 'transparent' }}
      javaScriptEnabled
      domStorageEnabled
      // The chat scrolls itself; the sheet's own drag lives on the grabber.
      bounces={false}
      automaticallyAdjustContentInsets={false}
      setSupportMultipleWindows={false}
    />
  );
}
