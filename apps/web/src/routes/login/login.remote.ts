import { form } from '$app/server';
import { invalid, redirect } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { account, rememberSession, sora } from '$lib/server/sora';

export const signIn = form(
	z.object({
		email: z.email('Enter your e-mail'),
		_password: z.string().min(1, 'Enter your password')
	}),
	async ({ email, _password }) => {
		try {
			const session = await sora.signIn({ email, password: _password });
			rememberSession(session.token);
		} catch (cause) {
			if (cause instanceof SoraError && cause.status < 500) {
				invalid('Wrong e-mail or password.');
			}
			throw cause;
		}

		redirect(303, '/profiles');
	}
);

export const signUp = form(
	z.object({
		name: z.string().trim().min(1, 'Enter your name').max(40),
		email: z.email('Enter your e-mail'),
		_password: z.string().min(8, 'Use at least 8 characters')
	}),
	async ({ name, email, _password }) => {
		try {
			const session = await sora.signUp({ name, email, password: _password });
			rememberSession(session.token);
		} catch (cause) {
			if (cause instanceof SoraError && cause.status < 500) {
				invalid(cause.code.startsWith('USER_ALREADY_EXISTS') ? 'That e-mail already has an account.' : cause.message);
			}
			throw cause;
		}

		redirect(303, '/profiles');
	}
);

export const signOut = form(async () => {
	// Signed out here either way, even if the API has already ended the session.
	await account()
		.signOut()
		.catch(() => {});
	rememberSession(undefined);
	redirect(303, '/login');
});
