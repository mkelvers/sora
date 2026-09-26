<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';

	type Props = {
		title: string;
		/** Skeleton cards stand in while this is undefined. */
		items: T[] | undefined;
		key: (item: T) => string;
		item: Snippet<[T]>;
		/** Where the heading leads, to everything in the row. */
		href?: string;
		/** `wide` for 16:9 cards, such as episodes to resume. */
		shape?: 'poster' | 'wide';
	};

	let { title, items, key, item, href, shape = 'poster' }: Props = $props();

	let list = $state<HTMLElement>();
	let start = $state(true);
	let end = $state(true);

	function update() {
		if (!list) return;
		start = list.scrollLeft <= 1;
		end = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
	}

	function scroll(direction: -1 | 1) {
		list?.scrollBy({ left: direction * list.clientWidth, behavior: 'smooth' });
	}

	$effect(() => {
		void items;
		update();
	});
</script>

<svelte:window onresize={update} />

{#if items === undefined || items.length > 0}
	<section class={shape}>
		<div class="top">
			<h2>
				{#if href}
					<a {href}>
						{title}
						<Icon name="chevron-right" />
					</a>
				{:else}
					{title}
				{/if}
			</h2>

			{#if !(start && end)}
				<div class="scroll">
					<Button variant="ghost" aria-label="Scroll left" disabled={start} onclick={() => scroll(-1)}>
						<Icon name="chevron-left" />
					</Button>
					<Button variant="ghost" aria-label="Scroll right" disabled={end} onclick={() => scroll(1)}>
						<Icon name="chevron-right" />
					</Button>
				</div>
			{/if}
		</div>

		{#if items}
			<ul bind:this={list} onscroll={update}>
				{#each items as entry (key(entry))}
					<li>{@render item(entry)}</li>
				{/each}
			</ul>
		{:else}
			<ul aria-busy="true" aria-label="Loading {title}">
				{#each { length: 8 }, index (index)}
					<li>
						<Skeleton ratio={shape === 'wide' ? '16 / 9' : '2 / 3'} />
						<Skeleton variant="text" width="70%" style="margin: 10px auto 0" />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	section {
		--side: clamp(16px, 3vw, 48px);
		--gap: 12px;
		container-type: inline-size;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin: 0 var(--side) 8px;
	}

	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 400;
	}

	h2 a {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: inherit;
		text-decoration: none;
	}

	h2 a :global(svg) {
		color: #888;
		transition: color 120ms;
	}

	h2 a:hover :global(svg) {
		color: #fff;
	}

	h2 a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.scroll {
		display: flex;
		gap: 4px;
	}

	.scroll :global(.button) {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: #ccc;
	}

	ul {
		display: grid;
		/* Seven and a bit cards across wide rows, so the row reads as scrollable. */
		grid-auto-columns: clamp(130px, calc((100cqi - 2 * var(--side) - 7 * var(--gap)) / 7.3), 220px);
		grid-auto-flow: column;
		gap: var(--gap);
		margin: 0;
		padding: 0 var(--side) 4px;
		overflow-x: auto;
		list-style: none;
		scroll-padding-inline: var(--side);
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	.wide ul {
		grid-auto-columns: clamp(220px, calc((100cqi - 2 * var(--side) - 4 * var(--gap)) / 4.3), 380px);
	}

	li {
		min-width: 0;
		scroll-snap-align: start;
	}
</style>
