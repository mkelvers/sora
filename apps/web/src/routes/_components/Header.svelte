<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

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

		<a class="icon-button" href="/" aria-label="Home" title="Home">
			<Icon name="home" />
		</a>
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
