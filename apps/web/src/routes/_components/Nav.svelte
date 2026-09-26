<script lang="ts">
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { signOut } from '../login/login.remote';
	import { getCurrentProfile } from '../profiles/profiles.remote';

	const profile = getCurrentProfile();

	let scrollY = $state(0);
</script>

<svelte:window bind:scrollY />

<header class:scrolled={scrollY > 8}>
	<nav aria-label="Main">
		{#if page.route.id !== '/'}
			<a class="round" href="/" aria-label="Home" title="Home">
				<Icon name="home" size="md" />
			</a>
		{/if}
	</nav>

	<Dropdown id="profile-menu" class="profile-menu" label="Profile">
		{#snippet trigger()}
			{#if profile.current}
				<span class="avatar" style:--color={profile.current.color}>
					{profile.current.name.slice(0, 1).toUpperCase()}
				</span>
			{:else}
				<span class="avatar"></span>
			{/if}
		{/snippet}

		{#if profile.current}
			<div class="who">
				<span class="avatar" style:--color={profile.current.color}>
					{profile.current.name.slice(0, 1).toUpperCase()}
				</span>
				{profile.current.name}
			</div>
		{/if}
		<a href="/profiles">Switch profile</a>
		<form {...signOut}>
			<Button type="submit">Sign out</Button>
		</form>
	</Dropdown>
</header>

<style>
	header {
		position: fixed;
		inset: 0 0 auto;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		box-sizing: border-box;
		height: var(--nav);
		padding: 0 var(--gutter);
		transition:
			background-color 240ms var(--ease),
			backdrop-filter 240ms var(--ease),
			box-shadow 240ms var(--ease);
	}

	header::before {
		content: '';
		position: absolute;
		inset: 0 0 -24px;
		z-index: -1;
		background: linear-gradient(rgb(0 0 0 / 0.55), transparent);
		pointer-events: none;
		transition: opacity 240ms var(--ease);
	}

	.scrolled {
		background: rgb(9 9 11 / 0.72);
		backdrop-filter: blur(20px) saturate(1.4);
		box-shadow: 0 1px 0 var(--line);
	}

	.scrolled::before {
		opacity: 0;
	}

	nav {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.round {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.08);
		color: var(--text);
		backdrop-filter: blur(12px);
		transition: background-color 160ms var(--ease);
	}

	.round:hover {
		background: rgb(255 255 255 / 0.16);
	}

	.round:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: 2px;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color, var(--surface-3));
		color: #fff;
		font-size: 14px;
		font-weight: 600;
	}

	header :global(.dropdown-trigger) {
		padding: 4px;
		border-radius: 50%;
	}

	header :global(.dropdown-trigger:hover) {
		background: rgb(255 255 255 / 0.12);
	}

	header :global(.profile-menu) {
		min-width: 220px;
		margin-top: 8px;
		padding: 6px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: rgb(27 27 31 / 0.92);
		backdrop-filter: blur(20px);
	}

	header :global(.profile-menu > :not(.who)) {
		padding: 0;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 6px;
		padding: 8px 10px 12px;
		border-bottom: 1px solid var(--line);
		color: var(--text);
		font-size: 14px;
		font-weight: 500;
	}

	.who .avatar {
		width: 28px;
		height: 28px;
		font-size: 13px;
	}

	header :global(.profile-menu a),
	header :global(.profile-menu .button) {
		display: flex;
		justify-content: flex-start;
		width: 100%;
		box-sizing: border-box;
		padding: 9px 10px;
		border-radius: 8px;
		color: var(--text-2);
		font-size: 14px;
		text-decoration: none;
	}

	header :global(.profile-menu a:hover),
	header :global(.profile-menu .button:hover) {
		background: rgb(255 255 255 / 0.06);
		color: var(--text);
	}
</style>
