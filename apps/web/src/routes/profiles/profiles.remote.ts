import { form, query } from '$app/server';
import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { account, fromSora, profile, rememberProfile } from '$lib/server/sora';

const Color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const getProfiles = query(() => fromSora(() => account().profiles()));

/** The profile this browser is watching as. */
export const getCurrentProfile = query(async () => {
	const { profileId } = profile();
	const profiles = await getProfiles();
	const current = profiles.find((candidate) => candidate.id === profileId);
	if (!current) {
		redirect(303, '/profiles');
	}
	return current;
});

export const chooseProfile = form(z.object({ id: z.string() }), async ({ id }) => {
	const profiles = await fromSora(() => account().profiles());
	if (profiles.some((profile) => profile.id === id)) {
		rememberProfile(id);
		redirect(303, '/');
	}
	await getProfiles().refresh();
});

export const addProfile = form(
	z.object({
		name: z.string().trim().min(1, 'Enter a name').max(40)
	}),
	async ({ name }) => {
		await fromSora(() => account().createProfile({ name }));
		await getProfiles().refresh();
	}
);

export const editProfile = form(
	z.object({
		id: z.string(),
		name: z.string().trim().min(1, 'Enter a name').max(40),
		color: Color
	}),
	async ({ id, name, color }) => {
		await fromSora(() => account().updateProfile(id, { name, color }));
		await getProfiles().refresh();
	}
);

export const removeProfile = form(z.object({ id: z.string() }), async ({ id }) => {
	await fromSora(() => account().deleteProfile(id));
	await getProfiles().refresh();
});
