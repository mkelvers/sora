<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let {
		form,
	}: PageProps = $props();

	let pending = $state(false);
</script>

<svelte:head>
	<title>Sign in</title>
</svelte:head>

<main>
	<form
		method="POST"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update({
					reset: false,
				});
				pending = false;
			};
		}}
	>
		<h1>Sign in</h1>

		<label>
			<span>E-mail</span>
			<input
				name="email"
				type="email"
				autocomplete="username"
				value={form?.email ?? ''}
				required
			/>
		</label>

		<label>
			<span>Password</span>
			<input name="password" type="password" autocomplete="current-password" required />
		</label>

		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}

		<button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
	</form>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		min-height: 100vh;
		padding: 24px 16px;
	}

	form {
		display: grid;
		gap: 20px;
		width: min(100%, 360px);
	}

	h1 {
		margin: 0 0 8px;
		font-size: 28px;
		font-weight: 400;
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

	button {
		margin-top: 8px;
		padding: 12px;
		border: none;
		background: #fff;
		color: #101010;
		font: inherit;
		font-size: 15px;
		cursor: pointer;
		transition: opacity 120ms;
	}

	button:hover {
		opacity: 0.9;
	}

	button:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
