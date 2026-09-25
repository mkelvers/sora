<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import Icon from '../Icon.svelte';
	import { setDropdown } from './context';

	type Props = {
		value: T;
		/** Accessible name, since the trigger only shows the chosen option. */
		label: string;
		children: Snippet;
	};

	let { value = $bindable(), label, children }: Props = $props();

	const id = $props.id();
	const anchor = `--${id}`;

	let open = $state(false);
	let root = $state<HTMLElement>();
	let trigger = $state<HTMLButtonElement>();
	let list = $state<HTMLUListElement>();

	const labels = new SvelteMap<string, Snippet>();
	const selected = $derived(labels.get(value));

	setDropdown({
		get value() {
			return value;
		},
		select(next) {
			value = next as T;
			close();
		},
		register(key, snippet) {
			labels.set(key, snippet);
			return () => labels.delete(key);
		}
	});

	function options() {
		return [...(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
	}

	function show() {
		open = true;
		requestAnimationFrame(() => {
			(list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? options()[0])?.focus();
		});
	}

	function close() {
		open = false;
		trigger?.focus();
	}

	function move(event: KeyboardEvent) {
		const items = options();
		const index = items.indexOf(document.activeElement as HTMLElement);
		const next = {
			ArrowDown: Math.min(index + 1, items.length - 1),
			ArrowUp: Math.max(index - 1, 0),
			Home: 0,
			End: items.length - 1
		}[event.key];

		if (next !== undefined) {
			event.preventDefault();
			items[next]?.focus();
		} else if (event.key === 'Escape') {
			close();
		} else if (event.key === 'Tab') {
			open = false;
		}
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (open && !root?.contains(event.target as Node)) {
			open = false;
		}
	}}
/>

<div class="dropdown" bind:this={root}>
	<button
		bind:this={trigger}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		style:anchor-name={anchor}
		onclick={() => (open ? close() : show())}
		onkeydown={(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				show();
			}
		}}
	>
		{#if selected}
			{@render selected()}
		{/if}
		<Icon name="expand" size="sm" />
	</button>

	<ul
		bind:this={list}
		role="listbox"
		aria-label={label}
		hidden={!open}
		style:position-anchor={anchor}
		onkeydown={move}
	>
		{@render children()}
	</ul>
</div>

<style>
	.dropdown {
		display: inline-block;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 8px 7px 12px;
		border: none;
		border-radius: 4px;
		background: rgb(255 255 255 / 0.06);
		color: #e6e6e6;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		transition: background 120ms;
	}

	button:hover,
	button[aria-expanded='true'] {
		background: rgb(255 255 255 / 0.1);
	}

	button :global(svg) {
		color: #999;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	ul {
		position: fixed;
		position-area: block-end span-inline-end;
		position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
		z-index: 10;
		min-width: anchor-size(width);
		margin: 4px 0;
		padding: 6px 0;
		border-radius: 4px;
		background: #202020;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.5);
		list-style: none;
	}

	ul[hidden] {
		display: none;
	}
</style>
