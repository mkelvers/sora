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
		/** Where "See all" leads. */
		href?: string;
		subtitle?: string;
	};

	let { title, items, key, item, href, subtitle }: Props = $props();

	let list = $state<HTMLElement>();
	let start = $state(true);
	let end = $state(false);

	function update() {
		if (!list) return;
		start = list.scrollLeft <= 1;
		end = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
	}

	function scroll(direction: -1 | 1) {
		list?.scrollBy({ left: direction * list.clientWidth * 0.9, behavior: 'smooth' });
	}

	$effect(() => {
		void items;
		update();
	});
</script>

{#if items === undefined || items.length > 0}
	<section>
		<div class="top">
			<h2>
				{#if href}
					<a {href}>{title}</a>
				{:else}
					{title}
				{/if}
				{#if subtitle}
					<span>{subtitle}</span>
				{/if}
			</h2>

			{#if href}
				<a class="all" {href}>See all</a>
			{/if}
		</div>

		<div class="track">
			{#if items}
				<ul bind:this={list} onscroll={update}>
					{#each items as entry (key(entry))}
						<li>{@render item(entry)}</li>
					{/each}
				</ul>

				<Button class="arrow previous" aria-label="Scroll left" hidden={start} onclick={() => scroll(-1)}>
					<Icon name="chevron-left" />
				</Button>
				<Button class="arrow next" aria-label="Scroll right" hidden={end} onclick={() => scroll(1)}>
					<Icon name="chevron-right" />
				</Button>
			{:else}
				<ul aria-busy="true" aria-label="Loading {title}">
					{#each { length: 8 }, index (index)}
						<li>
							<Skeleton ratio="2 / 3" />
							<Skeleton variant="text" width="70%" style="margin-top: 8px" />
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
{/if}

<style>
	section {
		--side: clamp(16px, 3.3vw, 64px);
		--gap: 16px;
		/* Six and a bit cards on wide screens, so the row reads as scrollable. */
		--card: clamp(140px, calc((100vw - 2 * var(--side) - 6 * var(--gap)) / 6.4), 260px);
	}

	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		margin: 0 var(--side) 12px;
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin: 0;
		font-size: 21px;
		font-weight: 400;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	h2 a:hover {
		text-decoration: underline;
	}

	h2 span {
		color: #888;
		font-size: 14px;
	}

	.all {
		flex: none;
		color: #999;
		font-size: 14px;
		text-decoration: none;
	}

	.all:hover {
		color: #fff;
	}

	.track {
		position: relative;
	}

	ul {
		display: grid;
		grid-auto-columns: var(--card);
		grid-auto-flow: column;
		gap: var(--gap);
		margin: 0;
		padding: 0 var(--side) 8px;
		overflow-x: auto;
		list-style: none;
		scroll-padding-inline: var(--side);
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	li {
		min-width: 0;
		scroll-snap-align: start;
	}

	.track :global(.arrow) {
		position: absolute;
		top: 0;
		bottom: 48px;
		width: var(--side);
		min-width: 40px;
		background: rgb(16 16 16 / 0.7);
		color: #fff;
		opacity: 0;
		transition: opacity 150ms;
	}

	.track :global(.arrow[hidden]) {
		display: none;
	}

	.track:hover :global(.arrow),
	.track :global(.arrow:focus-visible) {
		opacity: 1;
	}

	.track :global(.previous) {
		left: 0;
	}

	.track :global(.next) {
		right: 0;
	}

	@media (hover: none) {
		.track :global(.arrow) {
			display: none;
		}
	}
</style>
