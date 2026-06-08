import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSuccess } from '../../../src/gateway/lib/http-response';
import type { Response } from 'express';

function makeMockRes() {
  const json = vi.fn();
  const end = vi.fn();
  const status = vi.fn().mockReturnValue({ json, end });
  return { res: { status } as unknown as Response, status, json, end };
}

describe('sendSuccess', () => {
  let mock: ReturnType<typeof makeMockRes>;

  beforeEach(() => {
    mock = makeMockRes();
  });

  it('200 with object body — byte-identical pass-through (no envelope)', () => {
    const body = { id: 'abc', name: 'test' };
    sendSuccess(mock.res, 200, body);
    expect(mock.status).toHaveBeenCalledWith(200);
    expect(mock.json).toHaveBeenCalledWith(body);
    expect(mock.json).toHaveBeenCalledTimes(1);
    expect(mock.end).not.toHaveBeenCalled();
  });

  it('200 with array body — byte-identical pass-through (no envelope)', () => {
    const body = [{ id: 1 }, { id: 2 }];
    sendSuccess(mock.res, 200, body);
    expect(mock.status).toHaveBeenCalledWith(200);
    expect(mock.json).toHaveBeenCalledWith(body);
    expect(mock.json).toHaveBeenCalledTimes(1);
    expect(mock.end).not.toHaveBeenCalled();
  });

  it('201 created — byte-identical pass-through (no envelope)', () => {
    const body = { id: 'new-resource-id', created: true };
    sendSuccess(mock.res, 201, body);
    expect(mock.status).toHaveBeenCalledWith(201);
    expect(mock.json).toHaveBeenCalledWith(body);
    expect(mock.json).toHaveBeenCalledTimes(1);
    expect(mock.end).not.toHaveBeenCalled();
  });

  it('204 no body — calls end() not json()', () => {
    sendSuccess(mock.res, 204);
    expect(mock.status).toHaveBeenCalledWith(204);
    expect(mock.end).toHaveBeenCalledTimes(1);
    expect(mock.json).not.toHaveBeenCalled();
  });

  it('does NOT wrap body in any envelope ({ data }, { success }, etc.)', () => {
    const body = { value: 42 };
    sendSuccess(mock.res, 200, body);
    const passedBody = mock.json.mock.calls[0][0];
    expect(passedBody).toStrictEqual(body);
    expect(passedBody).not.toHaveProperty('data');
    expect(passedBody).not.toHaveProperty('success');
    expect(passedBody).not.toHaveProperty('result');
  });
});
