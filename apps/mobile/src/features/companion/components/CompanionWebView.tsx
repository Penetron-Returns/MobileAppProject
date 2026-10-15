import * as React from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { companionOrigin } from '@/lib/env';

import { buildEmbedHtml, parseWidgetMessage, type WidgetEvent } from '../logic';

/**
 * Nerova's owner chat. The widget only runs inside a page whose origin is on
 * Nerova's allowlist, so the WebView loads our own one-frame page with
 * `baseUrl` set to that origin. The session URL goes only into that page.
 */
export function CompanionWebView({
  sessionUrl,
  onEvent,
}: {
  sessionUrl: string;
  onEvent: (event: WidgetEvent) => void;
}) {
  const source = React.useMemo(
    () => ({ html: buildEmbedHtml(sessionUrl), baseUrl: companionOrigin }),
    [sessionUrl],
  );
  const onMessage = (event: WebViewMessageEvent) => {
    const parsed = parseWidgetMessage(event.nativeEvent.data);
    if (parsed) onEvent(parsed);
  };
  return (
    <WebView
      source={source}
      originWhitelist={['*']}
      onMessage={onMessage}
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
