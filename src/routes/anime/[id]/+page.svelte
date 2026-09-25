<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let { series, season } = $derived(data);
</script>

<svelte:head>
	<title>{series.title}</title>
</svelte:head>

<div class="page">
	<header>
		{#if series.backdrop_url}
			<img class="backdrop" src={series.backdrop_url} alt="" />
		{/if}

		<div class="bar">
			<div class="heading">
				<h1>{series.title}</h1>
				{#if season}
					<span>{season.title}</span>
				{/if}
			</div>
		</div>
	</header>

	<div class="body">
		{#if series.poster_url}
			<img class="poster" src={series.poster_url} alt="" />
		{:else}
			<div class="poster"></div>
		{/if}

		<section>
			<details>
				<summary>Edit artwork</summary>
				<form
					method="POST"
					use:enhance={() =>
						({ update }) =>
							update({ reset: false })}
				>
					<label>
						Poster
						<input name="poster_url" type="url" value={series.poster_url ?? ''} />
					</label>
					<label>
						Backdrop
						<input name="backdrop_url" type="url" value={series.backdrop_url ?? ''} />
					</label>
					<label>
						Logo
						<input name="logo_url" type="url" value={series.logo_url ?? ''} />
					</label>
					{#if form?.error}
						<p class="error">{form.error}</p>
					{/if}
					<div class="actions">
						<button>Save</button>
						<small>Changes apply for everyone. Empty a field to go back to the default.</small>
					</div>
				</form>
			</details>

			{#if series.seasons.length > 1}
				<nav aria-label="Seasons">
					{#each series.seasons as other (other.id)}
						<a
							href="?season={other.id}"
							aria-current={other.id === season?.id ? 'page' : undefined}
							data-sveltekit-noscroll
						>
							{other.title}
						</a>
					{/each}
				</nav>
			{/if}

			<ol>
				{#each season?.episodes ?? [] as episode (episode.number)}
					<li>
						{#if episode.still_url}
							<img src={episode.still_url} alt="" loading="lazy" />
						{:else}
							<div class="still"></div>
						{/if}
						<div>
							<h2>{episode.number}. {episode.title ?? `Episode ${episode.number}`}</h2>
							{#if episode.runtime_minutes}
								<small>{episode.runtime_minutes}m</small>
							{/if}
							{#if episode.overview}
								<p>{episode.overview}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		</section>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	.page {
		--poster: clamp(120px, 25vw, 480px);
		--gap: clamp(16px, 4vw, 80px);
		--side: clamp(16px, 3.3vw, 64px);
		min-height: 100vh;
		background: #101010;
		color: #e6e6e6;
		font-family: system-ui, sans-serif;
	}

	header {
		position: relative;
		height: 432px;
		background: #1c1c1c;
	}

	.backdrop {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Across the backdrop's foot, its text clear of the poster below it. */
	.bar {
		position: absolute;
		inset: auto 0 0;
		display: flex;
		align-items: center;
		gap: 16px;
		box-sizing: border-box;
		min-height: 108px;
		padding: 16px var(--side) 16px calc(var(--side) + var(--poster) + var(--gap));
		background: rgb(40 40 40 / 0.85);
	}

	.heading {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.heading span {
		color: #bbb;
		font-size: 17px;
	}

	section {
		padding-top: 48px;
	}

	details {
		margin-bottom: 24px;
		font-size: 14px;
	}

	summary {
		color: #999;
		cursor: pointer;
	}

	details form {
		display: grid;
		gap: 12px;
		max-width: 640px;
		margin-top: 16px;
	}

	label {
		display: grid;
		gap: 4px;
		color: #999;
	}

	details input {
		padding: 8px 10px;
		border: 1px solid #333;
		background: #1a1a1a;
		color: inherit;
		font: inherit;
		outline: none;
	}

	details input:focus {
		border-color: #666;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.actions small {
		margin: 0;
	}

	button {
		padding: 8px 16px;
		border: none;
		background: #e6e6e6;
		color: #101010;
		font: inherit;
		cursor: pointer;
	}

	.error {
		margin: 0;
		color: #f28b82;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 24px;
	}

	nav a {
		padding: 8px 16px;
		background: #1f1f1f;
		color: #aaa;
		font-size: 14px;
		text-decoration: none;
	}

	nav a:hover {
		background: #2a2a2a;
	}

	nav a[aria-current='page'] {
		background: #e6e6e6;
		color: #101010;
	}

	.body {
		display: grid;
		grid-template-columns: var(--poster) 1fr;
		gap: var(--gap);
		align-items: start;
		padding: 0 var(--side) 64px;
	}

	/* Starts up in the backdrop, above the bar. */
	.poster {
		display: block;
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		margin-top: -192px;
		background: #2a2a2a;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: minmax(160px, 375px) 1fr;
		align-items: center;
		gap: 24px;
		margin-bottom: 8px;
	}

	li img,
	.still {
		display: block;
		width: 100%;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		background: #2a2a2a;
	}

	h2 {
		margin: 0 0 8px;
		font-size: 15px;
		font-weight: 400;
	}

	small {
		display: block;
		margin-bottom: 8px;
		color: #999;
		font-size: 14px;
	}

	li p {
		margin: 0;
		color: #999;
		font-size: 14px;
		line-height: 1.45;
	}

	@media (max-width: 720px) {
		header {
			height: 240px;
		}

		.bar {
			min-height: 80px;
		}

		h1 {
			font-size: 20px;
		}

		.heading span {
			font-size: 14px;
		}

		.poster {
			margin-top: -120px;
		}

		section {
			grid-column: 1 / -1;
			padding-top: 0;
		}

		li {
			grid-template-columns: 140px 1fr;
			gap: 12px;
		}
	}
</style>
