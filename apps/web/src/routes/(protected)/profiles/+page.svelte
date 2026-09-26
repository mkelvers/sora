<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Managing is a mode of this page, kept in the URL so editing a profile
	// comes back to it.
	const managing = $derived(page.url.searchParams.has('manage'));

	/** A link to `path` that keeps where the viewer was headed, and optionally the mode. */
	function link(path: string, manage = managing) {
		const params = new URLSearchParams();
		const redirect = page.url.searchParams.get('redirect');
		if (manage) {
			params.set('manage', '1');
		}
		if (redirect) {
			params.set('redirect', redirect);
		}
		const query = params.toString();
		return query ? `${path}?${query}` : path;
	}
</script>

<svelte:head>
	<title>{managing ? 'Manage profiles' : "Who's watching?"}</title>
</svelte:head>

<main>
	<h1>{managing ? 'Manage profiles' : "Who's watching?"}</h1>

	<form method="POST" use:enhance>
		<ul>
			{#each data.profiles as profile (profile.id)}
				<li>
					{#if managing}
						<a class="profile" href={link(`/profiles/${profile.id}`, false)} aria-label="Edit {profile.name}">
							<span class="tile editing">
								<Avatar seed={profile.avatar} />
								<span class="pencil"><Icon name="edit" /></span>
							</span>
							<span class="name">{profile.name}</span>
						</a>
					{:else}
						<button class="profile" name="profile" value={profile.id}>
							<Avatar seed={profile.avatar} class="tile" />
							<span class="name">{profile.name}</span>
						</button>
					{/if}
				</li>
			{/each}

			{#if !managing}
				<li>
					<a class="profile" href={link('/profiles/new')}>
						<span class="tile add"><Icon name="add" /></span>
						<span class="name">Add profile</span>
					</a>
				</li>
			{/if}
		</ul>
	</form>

	<div class="footer">
		{#if managing}
				<a class="pill done" href={link('/profiles', false)}>
				<Icon name="check" size="sm" />
				Done
			</a>
		{:else}
			<a class="pill" href={link('/profiles', true)}>
				<Icon name="edit" size="sm" />
				Manage profiles
			</a>
		{/if}

		<form method="POST" action="/logout">
			<button class="sign-out">Sign out</button>
		</form>
	</div>
</main>

<style>
	main {
		--tile: clamp(96px, 12vw, 152px);
		--gap: clamp(16px, 2.5vw, 36px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 40px;
		box-sizing: border-box;
		min-height: 100vh;
		padding: 48px 16px;
		background: radial-gradient(ellipse at top, #1d1d1d, #101010 60%);
	}

	h1 {
		margin: 0;
		font-size: clamp(24px, 3vw, 34px);
		font-weight: 400;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 28px var(--gap);
		/* At most five to a row; narrower screens fit fewer. */
		max-width: calc(5 * var(--tile) + 4 * var(--gap));
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.profile {
		display: grid;
		justify-items: center;
		gap: 14px;
		width: var(--tile);
		padding: 0;
		border: none;
		background: none;
		color: #999;
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.profile :global(.tile) {
		box-sizing: border-box;
		width: var(--tile);
		height: var(--tile);
		outline: 2px solid transparent;
		outline-offset: 3px;
		transition: outline-color 120ms;
	}

	.profile:hover :global(.tile),
	.profile:focus-visible :global(.tile) {
		outline-color: #fff;
	}

	.profile:focus-visible {
		outline: none;
	}

	.editing {
		display: grid;
		position: relative;
	}

	.editing :global(.avatar) {
		opacity: 0.35;
		transition: opacity 120ms;
	}

	.profile:hover .editing :global(.avatar),
	.profile:focus-visible .editing :global(.avatar) {
		opacity: 0.5;
	}

	.pencil {
		display: grid;
		position: absolute;
		inset: 0;
		place-items: center;
		color: #fff;
	}

	.pencil :global(svg) {
		width: 30%;
		height: 30%;
	}

	.add {
		display: grid;
		place-items: center;
		background: rgb(255 255 255 / 0.06);
		color: #999;
		transition:
			background 120ms,
			color 120ms,
			outline-color 120ms;
	}

	.profile:hover .add,
	.profile:focus-visible .add {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.add :global(svg) {
		width: 40%;
		height: 40%;
	}

	.name {
		max-width: 100%;
		overflow: hidden;
		font-size: 15px;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color 120ms;
	}

	.profile:hover .name,
	.profile:focus-visible .name {
		color: #fff;
	}

	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 18px;
		border: 1px solid rgb(255 255 255 / 0.3);
		border-radius: 999px;
		color: #e6e6e6;
		font-size: 14px;
		text-decoration: none;
		transition:
			background 120ms,
			border-color 120ms,
			color 120ms;
	}

	.pill:hover {
		border-color: #fff;
		color: #fff;
	}

	.done {
		border-color: #fff;
		background: #fff;
		color: #101010;
	}

	.done:hover {
		color: #101010;
		opacity: 0.9;
	}

	.pill:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	/* The quieter of the two: signing out is rarer than managing profiles. */
	.sign-out {
		padding: 9px 18px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		color: #777;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.sign-out:hover {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
	}

	.sign-out:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
