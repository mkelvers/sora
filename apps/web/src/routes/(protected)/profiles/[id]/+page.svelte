<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import type { PageProps } from "./$types";

	let { data, form }: PageProps = $props();

	let avatar = $derived(data.profile.avatar);
	let choices = $derived(data.choices);
	let pending = $state(false);

	const shown = $derived([...new Set([data.profile.avatar, ...choices])]);

	function shuffle() {
		choices = choices.map((seed) =>
			seed === avatar ? seed : crypto.randomUUID().slice(0, 8),
		);
	}
</script>

<svelte:head>
	<title>Edit profile</title>
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
		<h1>Edit profile</h1>

		<div class="identity">
			<Avatar seed={avatar} class="preview" />

			<label>
				<span>Name</span>
				<input
					name="name"
					value={form?.name ?? data.profile.name}
					maxlength="40"
					autocomplete="off"
					required
				/>
			</label>
		</div>

		<fieldset>
			<legend>Avatar</legend>
			<button type="button" class="shuffle" onclick={shuffle}>
				<Icon name="shuffle" size="sm" />
				More avatars
			</button>

			<div class="choices">
				{#each shown as seed (seed)}
					<label class="choice">
						<input
							type="radio"
							name="avatar"
							value={seed}
							bind:group={avatar}
						/>
						<Avatar {seed} />
					</label>
				{/each}
			</div>
		</fieldset>

		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}

		<div class="buttons">
			<button class="primary" type="submit" disabled={pending}
				>{pending ? "Saving…" : "Save"}</button
			>
			<a class="secondary" href="/profiles{page.url.search}">Cancel</a>
		</div>
	</form>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		min-height: 100vh;
		padding: 48px 16px;
		background: radial-gradient(ellipse at top, #1d1d1d, #101010 60%);
	}

	form {
		display: grid;
		gap: 32px;
		width: min(100%, 520px);
	}

	h1 {
		margin: 0;
		font-size: 28px;
		font-weight: 400;
	}

	.identity {
		display: grid;
		grid-template-columns: 112px minmax(0, 1fr);
		align-items: center;
		gap: 24px;
	}

	.identity :global(.preview) {
		width: 112px;
	}

	label {
		display: grid;
		gap: 8px;
	}

	label span,
	legend {
		color: #999;
		font-size: 13px;
	}

	input:not([type="radio"]) {
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

	input:not([type="radio"]):hover {
		background: rgb(255 255 255 / 0.09);
	}

	input:not([type="radio"]):focus {
		border-color: #fff;
		outline: none;
	}

	fieldset {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		float: left;
		padding: 0;
	}

	.shuffle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: none;
		background: none;
		color: #999;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.shuffle:hover {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
	}

	.shuffle:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.choices {
		display: grid;
		grid-column: 1 / -1;
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
		gap: 12px;
	}

	.choice {
		position: relative;
		cursor: pointer;
	}

	.choice input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.choice :global(.avatar) {
		outline: 2px solid transparent;
		outline-offset: 3px;
		opacity: 0.7;
		transition:
			outline-color 120ms,
			opacity 120ms;
	}

	.choice:hover :global(.avatar) {
		opacity: 1;
	}

	.choice:has(input:checked) :global(.avatar) {
		outline-color: #fff;
		opacity: 1;
	}

	.choice:has(input:focus-visible) :global(.avatar) {
		outline-color: #fff;
		outline-style: dashed;
	}

	.error {
		margin: 0;
		color: #ff8a80;
		font-size: 14px;
	}

	.buttons {
		display: flex;
		gap: 12px;
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
