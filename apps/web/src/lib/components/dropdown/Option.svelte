<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';
	import { getDropdown } from './context';

	type Props = {
		value: string;
		children: Snippet;
	};

	let { value, children }: Props = $props();

	const dropdown = getDropdown();
	const selected = $derived(dropdown.value === value);

	$effect.pre(() => dropdown.register(value, children));
</script>

<li
	role="option"
	aria-selected={selected}
	tabindex="-1"
	onclick={() => dropdown.select(value)}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			dropdown.select(value);
		}
	}}
>
	<span class="check">
		{#if selected}
			<Icon name="check" size="sm" />
		{/if}
	</span>
	{@render children()}
</li>

<style>
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px 8px 10px;
		color: #ccc;
		font-size: 14px;
		white-space: nowrap;
		cursor: pointer;
		outline: none;
	}

	li:hover,
	li:focus-visible {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
	}

	li[aria-selected='true'] {
		color: #fff;
	}

	.check {
		display: inline-grid;
		place-items: center;
		width: 16px;
		height: 16px;
	}
</style>
