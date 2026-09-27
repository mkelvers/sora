<script lang="ts">
	import type { Profile } from "@sora/sdk";
	import { page } from "$app/state";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Dropdown from "$lib/components/ui/Dropdown.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Search from "./Search.svelte";

	let {
		profile,
		profiles,
	}: {
		profile: Profile;
		profiles: Profile[];
	} = $props();

	const others = $derived(
		profiles.filter((other) => other.id !== profile.id),
	);
	const here = $derived(
		encodeURIComponent(page.url.pathname + page.url.search),
	);
</script>

<header>
	<Search />

	<Dropdown id="account" label="Account" class="account">
		{#snippet trigger()}
			<Avatar seed={profile.avatar} plain class="trigger-avatar" />
			<Icon name="expand" size="md" />
		{/snippet}

		<a class="current" href="/profiles/{profile.id}" title="Edit profile">
			<Avatar seed={profile.avatar} plain class="current-avatar" />
			<span class="name">{profile.name}</span>
			<span class="edit">
				<Icon name="edit" size="sm" />
			</span>
		</a>

		{#each others as other (other.id)}
			<Button
				class="item"
				type="submit"
				form="switch"
				name="profile"
				value={other.id}
			>
				<Avatar seed={other.avatar} plain class="item-avatar" />
				{other.name}
			</Button>
		{/each}

		<a class="item" href="/profiles?manage=1">
			<Icon name="settings" size="md" />
			Manage profiles
		</a>
		<Button class="item" type="submit" form="sign-out">
			<Icon name="logout" size="md" />
			Sign out
		</Button>
	</Dropdown>

	<form
		id="switch"
		method="POST"
		action="/profiles?/select&redirect={here}"
		hidden
	></form>
	<form id="sign-out" method="POST" action="/logout" hidden></form>
</header>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		justify-content: flex-end;
		height: 56px;
		background: rgb(40 40 40 / 0.85);
	}

	header :global(.dropdown-trigger) {
		height: 100%;
		color: #999;
	}

	header :global(.dropdown) {
		height: 100%;
	}

	header :global(.dropdown-trigger) {
		gap: 4px;
		padding: 0 12px 0 16px;
	}

	header :global(.dropdown-trigger:hover),
	header
		:global(.dropdown:has(.dropdown-menu:popover-open) .dropdown-trigger) {
		background: #151515;
		color: #fff;
	}

	header :global(.trigger-avatar) {
		width: 36px;
	}

	header :global(.account) {
		top: 56px;
		right: 0;
		width: 240px;
		margin: 0;
		padding: 0;
		background: #151515;
		box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
	}

	.current {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		text-decoration: none;
		transition: background 120ms;
	}

	.current:hover,
	.current:focus-visible {
		background: rgb(255 255 255 / 0.08);
		outline: none;
	}

	.current :global(.current-avatar) {
		width: 44px;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		color: #fff;
		font-size: 15px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.edit {
		display: grid;
		color: #888;
		transition: color 120ms;
	}

	.current:hover .edit,
	.current:focus-visible .edit {
		color: #fff;
	}

	header :global(.dropdown-menu > .item) {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 12px;
		width: 100%;
		box-sizing: border-box;
		height: 44px;
		padding: 0 16px;
		color: #bbb;
		font-size: 14px;
		text-decoration: none;
	}

	header :global(.dropdown-menu > .item:hover),
	header :global(.dropdown-menu > .item:focus-visible) {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
		outline: none;
	}

	header :global(.item-avatar) {
		width: 32px;
		margin: 0 -6px;
	}
</style>
