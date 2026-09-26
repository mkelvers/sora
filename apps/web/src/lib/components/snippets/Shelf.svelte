<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import Skeleton from './Skeleton.svelte';

	type Props = {
		title: string;
		/** A line under the title, such as why the row is there. */
		subtitle?: string;
		/** Skeleton cards stand in while this is undefined; an empty row is left out. */
		items: T[] | undefined;
		key: (item: T) => string;
		item: Snippet<[T]>;
		/** `wide` for 16:9 cards, such as episodes to resume. */
		shape?: 'poster' | 'wide';
	};

	let { title, subtitle, items, key, item, shape = 'poster' }: Props = $props();

	let list = $state<HTMLElement>();
	let start = $state(true);
	let end = $state(true);

	function update() {
		if (!list) return;
		start = list.scrollLeft <= 1;
		end = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
	}

	function scroll(direction: -1 | 1) {
		list?.scrollBy({ left: direction * (list.clientWidth - 120), behavior: 'smooth' });
	}

	$effect(() => {
		void items;
		update();
	});
</script>

<svelte:window onresize={update} />

{#if items === undefined || items.length > 0}
	<section class={shape}>
		<hgroup>
			<h2>{title}</h2>
			{#if subtitle}
				<p>{subtitle}</p>
			{/if}
		</hgroup>

		<div class="track">
			{#if items}
				<ul bind:this={list} onscroll={update}>
					{#each items as entry (key(entry))}
						<li>{@render item(entry)}</li>
					{/each}
				</ul>

				<button class="edge left" aria-label="Scroll left" hidden={start} onclick={() => scroll(-1)}>
					<Icon name="chevron-left" />
				</button>
				<button class="edge right" aria-label="Scroll right" hidden={end} onclick={() => scroll(1)}>
					<Icon name="chevron-right" />
				</button>
			{:else}
				<ul aria-busy="true" aria-label="Loading {title}">
					{#each { length: 8 }, index (index)}
						<li>
							<Skeleton ratio={shape === 'wide' ? '16 / 9' : '2 / 3'} />
							<Skeleton variant="text" width="70%" style="margin-top: 12px" />
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>
{/if}

<style>
	section {
		--gap: 14px;
		container-type: inline-size;
	}

	hgroup {
		margin: 0 var(--gutter) 16px;
	}

	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.015em;
	}

	hgroup p {
		margin: 4px 0 0;
		color: var(--text-3);
		font-size: 14px;
	}

	.track {
		position: relative;
	}

	ul {
		display: grid;
		/* Six and a bit posters across wide rows, so the row reads as scrollable. */
		grid-auto-columns: clamp(136px, calc((100cqi - 2 * var(--gutter) - 6 * var(--gap)) / 6.4), 240px);
		grid-auto-flow: column;
		gap: var(--gap);
		margin: 0;
		/* Room for the cards' hover lift and focus rings. */
		padding: 6px var(--gutter) 8px;
		overflow-x: auto;
		list-style: none;
		scroll-padding-inline: var(--gutter);
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	.wide ul {
		grid-auto-columns: clamp(248px, calc((100cqi - 2 * var(--gutter) - 3 * var(--gap)) / 3.4), 440px);
	}

	li {
		min-width: 0;
		scroll-snap-align: start;
	}

	.edge {
		position: absolute;
		top: 6px;
		bottom: 8px;
		z-index: 1;
		display: grid;
		place-items: center;
		width: calc(var(--gutter) + 8px);
		min-width: 44px;
		padding: 0;
		border: none;
		color: var(--text);
		cursor: pointer;
		opacity: 0;
		transition: opacity 200ms var(--ease);
	}

	.edge[hidden] {
		display: none;
	}

	.left {
		left: 0;
		background: linear-gradient(90deg, rgb(9 9 11 / 0.9), transparent);
	}

	.right {
		right: 0;
		background: linear-gradient(270deg, rgb(9 9 11 / 0.9), transparent);
	}

	.track:hover .edge,
	.edge:focus-visible {
		opacity: 1;
	}

	.edge:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: -4px;
	}

	@media (hover: none) {
		.edge {
			display: none;
		}
	}
</style>
