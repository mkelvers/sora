import { describe, expect, test } from 'bun:test';
import { createArcClient, ArcApiError } from '../src/client';

describe('Arc client', () => {
    test('serializes requests and validates responses', async () => {
        const calls: Request[] = [];
        const client = createArcClient({
            baseUrl: 'https://arc.example/v1',
            fetch: async (input, init) => {
                calls.push(new Request(input, init));
                return Response.json({ count: 2 });
            },
        });

        await expect(client.notifications.unreadCount()).resolves.toEqual({ count: 2 });
        expect(calls[0]?.url).toBe('https://arc.example/v1/notifications/unread-count');
        expect(calls[0]?.credentials).toBe('include');
    });

    test('turns API errors into ArcApiError', async () => {
        const client = createArcClient({
            fetch: async () =>
                Response.json(
                    { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in first' } },
                    { status: 401 }
                ),
        });

        await expect(client.home()).rejects.toEqual(
            new ArcApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in first')
        );
    });
});
