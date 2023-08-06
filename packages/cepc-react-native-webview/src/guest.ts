import { CEPC_ERROR_CODE_UNINITIALIZED, CepcError, NAME, call, handle } from 'cepc';

import { CEPC_KEY_CALL_HOST, CEPC_KEY_HANDLE_GUEST } from './common';

import type { CepcPacket, CepcProcedureCallOptions, Jsonized } from 'cepc';

/**
 * WebView Hostの手続きを呼び出す。
 * @param name 手続きの名前
 * @param requestData リクエストデータ
 * @param options オプション
 * @returns レスポンスデータ
 */
export async function callHost<RequestData, ResponseData>(
  name: string,
  requestData: RequestData,
  options?: CepcProcedureCallOptions,
): Promise<Jsonized<Awaited<ResponseData>, object>> {
  if (
    typeof window === 'object' &&
    window !== null &&
    typeof window.ReactNativeWebView === 'object' &&
    window.ReactNativeWebView !== null &&
    typeof window.ReactNativeWebView.postMessage === 'function'
  ) {
    /** 送信関数 */
    const post = window.ReactNativeWebView.postMessage.bind(window.ReactNativeWebView);
    return call(name, requestData, post, options);
  } else {
    console.error(
      `[${NAME}] \`window.ReactNativeWebView.postMessage()\`が初期化されていないため、` +
        `手続き\`${name}\`のリクエストを送信できません。`,
    );
    throw new CepcError(CEPC_ERROR_CODE_UNINITIALIZED);
  }
}

/** WebViewである場合、`true`を返す。 */
export function isWebView() {
  return Boolean(
    typeof window === 'object' && window !== null && window.ReactNativeWebView !== undefined,
  );
}

/**
 * WebView Guestの処理関数
 * @param payloadString ペイロード文字列
 */
export async function handleGuest(payloadString: string) {
  /** 送信関数 */
  const post = function (message: string, payload: CepcPacket<'req'>) {
    if (
      typeof window === 'object' &&
      window !== null &&
      typeof window.ReactNativeWebView === 'object' &&
      window.ReactNativeWebView !== null &&
      typeof window.ReactNativeWebView.postMessage === 'function'
    ) {
      window.ReactNativeWebView.postMessage(message);
    } else {
      console.error(
        `[${NAME}] \`window.ReactNativeWebView.postMessage()\`が初期化されていないため、` +
          `手続き\`${payload.name}\`のレスポンスを送信できません。`,
      );
    }
  };

  await handle(payloadString, post);
}

export function startGuestHandler() {
  if (typeof window === 'object' && window !== null) {
    // `window`に公開する。
    window[CEPC_KEY_CALL_HOST] = callHost;
    window[CEPC_KEY_HANDLE_GUEST] = handleGuest;
  } else {
    console.warn(`[${NAME}] \`window\`が存在しません。`);
  }
  return stopGuestHandler;
}

export function stopGuestHandler() {
  if (typeof window === 'object' && window !== null) {
    window[CEPC_KEY_CALL_HOST] = undefined;
    window[CEPC_KEY_HANDLE_GUEST] = undefined;
  } else {
    console.warn(`[${NAME}] \`window\`が存在しません。`);
  }
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: { (message: string): void };
    };
    [CEPC_KEY_CALL_HOST]?: {
      (name: string, requestData: unknown, options?: CepcProcedureCallOptions): Promise<unknown>;
    };
    [CEPC_KEY_HANDLE_GUEST]?: { (payloadString: string): void };
  }

  let window: Window;
}
