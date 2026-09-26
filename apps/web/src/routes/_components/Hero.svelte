<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Skeleton from '$lib/components/snippets/Skeleton.svelte';
	import type { SeriesCard } from '@sora/sdk';

	type Props = {
		/** A skeleton stands in while this is undefined. */
		series: SeriesCard[] | undefined;
	};

	let { series }: Props = $props();

	const slides = $derived((series ?? []).filter((item) => item.backdrop_url).slice(0, 5));

	let index = $state(0);
	let paused = $state(false);

	const current = $derived(slides[index % Math.max(slides.length, 1)]);

	$effect(() => {
		if (paused || slides.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		const timer = setTimeout(() => (index = (index + 1) % slides.length), 8_000);
		return () => clearTimeout(timer);
	});
</script>

{#if !series}
	<div class="hero">
		<Skeleton width="100%" height="100%" />
	</div>
{:else if current}
	<section
		class="hero"
		aria-roledescription="carousel"
		aria-label="Trending"
		onpointerenter={() => (paused = true)}
		onpointerleave={() => (paused = false)}
		onfocusin={() => (paused = true)}
		onfocusout={() => (paused = false)}
	>
		{#each slides as slide, position (slide.id)}
			<img
				class="backdrop"
				class:shown={position === index}
				src={slide.backdrop_url}
				alt=""
				loading={position === 0 ? 'eager' : 'lazy'}
				decoding="async"
			/>
		{/each}

		<div class="content">
			<p class="eyebrow">#{index + 1} trending</p>

			{#key current.id}
				<div class="details">
					{#if current.logo_url}
						<img class="logo" src={current.logo_url} alt={current.title} />
					{:else}
						<h1>{current.title}</h1>
					{/if}

					{#if current.year}
						<p class="meta">
							{current.year}
							{#if current.status === 'RELEASING'}
								<span class="live">Airing</span>
							{/if}
						</p>
					{/if}

					<a class="view" href="/series/{current.id}">View series</a>
				</div>
			{/key}

			{#if slides.length > 1}
				<div class="dots" role="tablist" aria-label="Choose a title">
					{#each slides as slide, position (slide.id)}
						<Button
							role="tab"
							aria-label={slide.title}
							aria-selected={position === index}
							onclick={() => (index = position)}
						/>
					{/each}
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	.hero {
		--side: clamp(16px, 3.3vw, 64px);
		position: relative;
		height: clamp(380px, 62vh, 680px);
		overflow: hidden;
		background: #1c1c1c;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		transition: opacity 800ms;
	}

	.backdrop.shown {
		opacity: 1;
	}

	.hero::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(to top, #101010 0%, rgb(16 16 16 / 0) 45%),
			linear-gradient(to right, rgb(16 16 16 / 0.85) 0%, rgb(16 16 16 / 0) 60%);
		pointer-events: none;
	}

	.content {
		position: absolute;
		inset: auto var(--side) 40px;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 16px;
	}

	.eyebrow {
		margin: 0;
		color: #ccc;
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.details {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 16px;
		animation: enter 500ms ease-out;
	}

	.logo {
		display: block;
		max-width: min(420px, 70vw);
		max-height: 160px;
		object-fit: contain;
		object-position: left bottom;
		filter: drop-shadow(0 2px 12px rgb(0 0 0 / 0.5));
	}

	h1 {
		max-width: 16ch;
		margin: 0;
		font-size: clamp(32px, 5vw, 56px);
		font-weight: 500;
		line-height: 1.05;
		text-shadow: 0 2px 12px rgb(0 0 0 / 0.5);
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0;
		color: #ddd;
		font-size: 15px;
	}

	.live {
		padding: 2px 8px;
		background: rgb(255 255 255 / 0.15);
		font-size: 12px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.view {
		padding: 12px 24px;
		background: #e6e6e6;
		color: #101010;
		font-size: 15px;
		font-weight: 500;
		text-decoration: none;
		transition: background 120ms;
	}

	.view:hover {
		background: #fff;
	}

	.view:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 3px;
	}

	.dots {
		display: flex;
		gap: 8px;
	}

	.dots :global(.button) {
		/* A 4px bar, with room around it to hit. */
		width: 28px;
		height: 20px;
		padding: 8px 0;
		background: rgb(255 255 255 / 0.3);
		background-clip: content-box;
	}

	.dots :global(.button:hover) {
		background: rgb(255 255 255 / 0.6);
	}

	.dots :global(.button[aria-selected='true']) {
		background: #fff;
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.backdrop {
			transition: none;
		}

		.details {
			animation: none;
		}
	}
</style>
