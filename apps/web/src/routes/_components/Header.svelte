<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import logo from '$lib/assets/favicon.png';
	import Button from '$lib/components/ui/Button.svelte';
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { getGenres } from '../browse/browse.remote';
	import { animeSeason } from '$lib/utils';

	const season = animeSeason(new Date());

	const links = [
		{ label: 'New', href: '/browse?status=RELEASING&sort=newest' },
		{ label: 'Popular', href: '/browse?sort=popular' },
		{ label: 'Simulcast', href: `/browse?season=${season.season}&season_year=${season.year}&sort=popular` }
	];

	const genres = getGenres();
	const here = $derived(`${page.url.pathname}${page.url.search}`);

	// Links in the menu navigate without a full load, which leaves it open.
	afterNavigate(() => document.getElementById('categories')?.hidePopover());

	const query = $derived(page.url.searchParams.get('q') ?? '');

	let searching = $derived(page.route.id === '/search');
	let input = $state<HTMLInputElement>();

	async function open() {
		searching = true;
		await tick();
		input?.focus();
	}

	function close(event: FocusEvent | KeyboardEvent) {
		const field = event.currentTarget as HTMLInputElement;
		if (event instanceof KeyboardEvent) {
			if (event.key !== 'Escape') return;
			field.blur();
		}
		if (!field.value && page.route.id !== '/search') {
			searching = false;
		}
	}
</script>

<header>
	<nav>
		{#if page.route.id !== '/'}
			<Button class="icon-button" aria-label="Back" title="Back" onclick={() => history.back()}>
				<Icon name="back" />
			</Button>
		{/if}

		<a class="brand" href="/" aria-label="Sora home" title="Home">
			<img src={logo} alt="" width="28" height="28" />
			<span>Sora</span>
		</a>

		<div class="links">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={here === link.href ? 'page' : undefined}>{link.label}</a>
			{/each}
		</div>

		<Dropdown id="categories" class="categories" alignment="left" aria-label="Categories">
			{#snippet trigger()}
				<span class="trigger">Categories</span>
				<Icon name="expand" size="md" />
			{/snippet}

			{#each links as link (link.href)}
				<a class="narrow" href={link.href}>{link.label}</a>
			{/each}
			<a href="/schedule">Release calendar</a>
			<a href="/browse?sort=score">Top rated</a>
			<hr />
			{#each genres.current ?? [] as genre (genre)}
				<a href="/browse?genre={encodeURIComponent(genre)}&sort=popular">{genre}</a>
			{/each}
		</Dropdown>
	</nav>

	<nav>
		{#if searching}
			<form action="/search" role="search">
				<Icon name="search" size="md" />
				<input
					bind:this={input}
					name="q"
					type="search"
					placeholder="Search"
					aria-label="Search"
					autocomplete="off"
					value={query}
					required
					onblur={close}
					onkeydown={close}
				/>
			</form>
		{:else}
			<Button class="icon-button" aria-label="Search" title="Search" onclick={open}>
				<Icon name="search" />
			</Button>
		{/if}

		<Button class="icon-button" aria-label="Profile" title="Profile">
			<Icon name="person" />
		</Button>
	</nav>
</header>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		box-sizing: border-box;
		height: 56px;
		padding: 0 clamp(8px, 1.5vw, 24px);
		background: rgb(40 40 40 / 0.85);
	}

	nav {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-right: 12px;
		padding: 4px 8px;
		color: #fff;
		font-size: 19px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-decoration: none;
	}

	.brand:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.links {
		display: flex;
		gap: 4px;
	}

	.links a {
		padding: 8px 12px;
		color: #bbb;
		font-size: 14px;
		text-decoration: none;
		transition:
			background 120ms,
			color 120ms;
	}

	.links a:hover,
	.links a[aria-current='page'] {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.links a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	nav :global(.dropdown-trigger) {
		gap: 2px;
		padding: 8px 8px 8px 12px;
		color: #bbb;
	}

	.trigger {
		font-size: 14px;
	}

	/* The genres run to two columns; the other links span both. */
	nav :global(.categories:popover-open) {
		display: grid;
		grid-template-columns: repeat(2, minmax(140px, 1fr));
		max-height: calc(100vh - 80px);
		overflow-y: auto;
	}

	nav :global(.categories > a) {
		color: #ccc;
		text-decoration: none;
	}

	nav :global(.categories > a:hover),
	nav :global(.categories > a:focus-visible) {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
		outline: none;
	}

	nav :global(.categories > a:not([href^='/browse?genre'])) {
		grid-column: 1 / -1;
	}

	nav :global(.categories > hr) {
		grid-column: 1 / -1;
		margin: 6px 0;
		padding: 0;
		border: none;
		border-top: 1px solid #333;
	}

	nav :global(.categories > .narrow) {
		display: none;
	}

	@media (max-width: 820px) {
		.links {
			display: none;
		}

		nav :global(.categories > .narrow) {
			display: block;
		}
	}

	@media (max-width: 1100px) {
		header:has(form) .links {
			display: none;
		}
	}

	@media (max-width: 560px) {
		.brand span {
			display: none;
		}
	}

	header :global(.icon-button) {
		display: inline-grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		color: #ddd;
		transition:
			background 120ms,
			color 120ms;
	}

	header :global(.icon-button:hover) {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	header :global(.icon-button:focus-visible) {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	form {
		display: flex;
		align-items: center;
		gap: 8px;
		width: min(320px, 50vw);
		height: 36px;
		padding: 0 12px;
		box-sizing: border-box;
		border-radius: 18px;
		background: rgb(255 255 255 / 0.1);
		color: #999;
	}

	form:focus-within {
		background: rgb(255 255 255 / 0.15);
		color: #ddd;
	}

	input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		color: #e6e6e6;
		font: inherit;
		font-size: 14px;
		outline: none;
	}

	input::placeholder {
		color: #888;
	}
</style>
