<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import type { PageProps } from "./$types";

	let { form }: PageProps = $props();

	let pending = $state(false);

	const back = $derived.by(() => {
		const redirect = page.url.searchParams.get("redirect");
		return redirect
			? `/profiles?redirect=${encodeURIComponent(redirect)}`
			: "/profiles";
	});
</script>

<svelte:head>
	<title>Add profile</title>
</svelte:head>

<main>
	<form
		method="POST"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update({ reset: false });
				pending = false;
			};
		}}
	>
		<h1>Add profile</h1>
		<p class="lead">
			Each profile keeps its own watchlist, progress, and recommendations.
		</p>

		<label>
			<span>Name</span>
			<input
				name="name"
				value={form?.name ?? ""}
				maxlength="40"
				autocomplete="off"
				required
			/>
		</label>

		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}

		<div class="buttons">
			<button class="primary" type="submit" disabled={pending}>
				{pending ? "Adding…" : "Add profile"}
			</button>
			<a class="secondary" href={back}>Cancel</a>
		</div>
	</form>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		min-height: 100vh;
		padding: 24px 16px;
		background: radial-gradient(ellipse at top, #1d1d1d, #101010 60%);
	}

	form {
		display: grid;
		gap: 20px;
		width: min(100%, 400px);
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.lead {
		margin: -8px 0 8px;
		color: #999;
		font-size: 15px;
		line-height: 1.5;
	}

	label {
		display: grid;
		gap: 8px;
	}

	label span {
		color: #999;
		font-size: 13px;
	}

	input {
		box-sizing: border-box;
		width: 100%;
		padding: 11px 12px;
		border: 1px solid transparent;
		background: rgb(255 255 255 / 0.06);
		color: #e6e6e6;
		font: inherit;
		font-size: 15px;
		transition:
			background 120ms,
			border-color 120ms;
	}

	input:hover {
		background: rgb(255 255 255 / 0.09);
	}

	input:focus {
		border-color: #fff;
		outline: none;
	}

	.error {
		margin: 0;
		color: #ff8a80;
		font-size: 14px;
	}

	.buttons {
		display: flex;
		gap: 12px;
		margin-top: 8px;
	}

	.primary,
	.secondary {
		flex: 1;
		padding: 12px;
		border: none;
		font: inherit;
		font-size: 15px;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
		transition:
			opacity 120ms,
			background 120ms,
			color 120ms;
	}

	.primary {
		background: #fff;
		color: #101010;
	}

	.primary:hover {
		opacity: 0.9;
	}

	.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.secondary {
		background: rgb(255 255 255 / 0.06);
		color: #ccc;
	}

	.secondary:hover {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.primary:focus-visible,
	.secondary:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
