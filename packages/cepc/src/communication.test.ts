import { afterEach } from 'node:test';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { CepcError, call, callProcedure, handle, registerProcedure, reset } from './index';

/**
 * 送信関数
 * @param payloadString ペイロード文字列
 *
 * @description 自分自身に送信する。
 */
function post(payloadString: string) {
  handle(payloadString, function (payloadString) {
    handle(payloadString, function () {});
  });
}

beforeEach(function () {
  reset();
});

test(`PING(${call.name})`, async function () {
  expect.assertions(1);

  registerProcedure('ping', async function () {
    return 'pong';
  });

  await call<void, string>('ping', undefined, post).then(function (pong) {
    expect(pong).toBe('pong');
  });
});

describe(`${callProcedure.name}`, function () {
  beforeEach(function () {
    registerProcedure('ping', async function () {
      return 'pong';
    });
  });

  afterEach(function () {
    reset();
  });

  test(`PING`, async function () {
    expect.assertions(1);

    /** 対象 */
    const target = {
      postMessage(payloadString: string) {
        post(payloadString);
      },
    };
    await callProcedure(target, 'ping', undefined).then(function (pong) {
      expect(pong).toBe('pong');
    });
  });

  test(`対象が\`null\``, async function () {
    expect.assertions(2);
    await callProcedure(null, 'ping', undefined).catch(function (error) {
      expect(error).toBeInstanceOf(CepcError);
      expect(error.code).toBe('CEPC_UNINITIALIZED');
    });
  });

  test(`対象が\`undefined\``, async function () {
    expect.assertions(2);
    await callProcedure(undefined, 'ping', undefined).catch(function (error) {
      expect(error).toBeInstanceOf(CepcError);
      expect(error.code).toBe('CEPC_UNINITIALIZED');
    });
  });
});

test('タイムアウト', async function () {
  expect.assertions(2);

  registerProcedure('10seconds', async function () {
    return new Promise(function (resolve) {
      setTimeout(resolve, 10000);
    });
  });

  await call('10seconds', undefined, post, { timeout: 100 }).catch(function (error) {
    expect(error).toBeInstanceOf(CepcError);
    expect(error.code).toBe('CEPC_TIMEOUT');
  });
});

test(`${CepcError.name}をそのまま返信する`, async function () {
  expect.assertions(2);

  /** `console.debug` */
  const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(function () {});

  registerProcedure('throw', async function () {
    throw new CepcError('1234', 'Visible Message');
  });

  await call('throw', undefined, post).catch(function (error) {
    expect(error).toEqual(expect.objectContaining({ code: '1234', message: 'Visible Message' }));
  });

  expect(consoleDebugSpy).toHaveBeenCalledOnce();

  consoleDebugSpy.mockRestore();
});

test(`${CepcError.name}のエラーコードが空の場合に上書きする`, async function () {
  expect.assertions(3);

  /** `console.debug` */
  const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(function () {});

  registerProcedure('throw', async function () {
    throw new CepcError();
  });

  await call('throw', undefined, post).catch(function (error) {
    expect(error).toBeInstanceOf(CepcError);
    expect(error.code).toBe('CEPC_INTERNAL');
  });

  expect(consoleDebugSpy).toHaveBeenCalledOnce();

  consoleDebugSpy.mockRestore();
});

describe(`${CepcError.name}以外のエラーを変換する`, function () {
  /** カスタムエラー */
  class CustomError extends Error {}

  test.each([
    CustomError,
    Error,
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError,
  ])(`%s`, async function (ErrorConstructor) {
    expect.assertions(4);

    /** `console.error` */
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(function () {});

    registerProcedure('throw', async function () {
      throw new ErrorConstructor('Invisible Message');
    });

    await call('throw', undefined, post).catch(function (error) {
      expect(error).toBeInstanceOf(CepcError);
      expect(error.code).toBe('CEPC_INTERNAL');
      expect(error.message).toBe('');
    });

    expect(consoleErrorSpy).toHaveBeenCalledOnce();

    consoleErrorSpy.mockRestore();
  });
});

test('補助関数', async function () {
  expect.assertions(2);

  /** 補助関数 */
  const assist = vi.fn();
  /** 送信関数 */
  const post = vi.fn();

  /** ペイロード文字列 */
  const payloadString = 'INVALID_PAYLOAD_STRING';
  await handle(payloadString, post, assist);

  expect(assist).toBeCalledWith(payloadString);
  expect(post).not.toHaveBeenCalled();
});

test('手続きが登録されていない', async function () {
  expect.assertions(2);

  /** `console.error` */
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(function () {});

  await call('unknownProcedure', undefined, post).catch(function (error) {
    expect(error).toEqual(
      expect.objectContaining({
        code: 'CEPC_UNDEFINED',
      }),
    );
  });

  expect(consoleErrorSpy).toHaveBeenCalledWith(
    '[CEPC] 手続き`unknownProcedure`が登録されていません。',
  );

  consoleErrorSpy.mockRestore();
});

test('無効なペイロード文字列を受信した', async function () {
  expect.assertions(1);

  /** `console.error` */
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(function () {});

  await handle('', function () {});
  expect(consoleErrorSpy).toHaveBeenCalledWith('[CEPC] ペイロード文字列``が無効な形式です。');

  consoleErrorSpy.mockRestore();
});

test('コールバックが存在しない場合のレスポンス受信', async function () {
  expect.assertions(1);

  /** `console.error` */
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(function () {});

  await handle(
    'cepc::{"index":1,"key":"KEY","name":"NAME","p":"cepc","timestamp":0,"t":"res","v":0}',
    function () {},
  );
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    '[CEPC] リクエスト`NAME:KEY`のコールバックが存在しないため、レスポンスを受信できません。',
  );

  consoleErrorSpy.mockRestore();
});

test('コールバックが存在しない場合のエラー受信', async function () {
  expect.assertions(1);

  /** `console.error` */
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(function () {});

  await handle(
    'cepc::{"code":"CEPC_INTERNAL","index":1,"key":"KEY","name":"NAME","p":"cepc","timestamp":0,"t":"err","v":0}',
    function () {},
  );
  expect(consoleErrorSpy).toHaveBeenCalledWith(
    '[CEPC] リクエスト`NAME:KEY`のコールバックが存在しないため、エラーを受信できません。',
  );

  consoleErrorSpy.mockRestore();
});
