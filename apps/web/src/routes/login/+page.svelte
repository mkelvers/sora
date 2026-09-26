<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { signIn, signUp } from './login.remote';

	let creating = $state(false);
</script>

<svelte:head>
	<title>{creating ? 'Create account' : 'Sign in'} · Sora</title>
</svelte:head>

<main>
	<h1>{creating ? 'Create account' : 'Sign in'}</h1>

	{#if creating}
		<form {...signUp}>
			<label>
				Name
				<input {...signUp.fields.name.as('text')} autocomplete="name" required />
				{#each signUp.fields.name.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
			</label>

			<label>
				E-mail
				<input {...signUp.fields.email.as('email')} autocomplete="email" required />
				{#each signUp.fields.email.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
			</label>

			<label>
				Password
				<input {...signUp.fields._password.as('password')} autocomplete="new-password" minlength="8" required />
				{#each signUp.fields._password.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
			</label>

			{#each signUp.fields.allIssues()?.filter((issue) => issue.path.length === 0) ?? [] as issue (issue.message)}
				<p class="issue" role="alert">{issue.message}</p>
			{/each}

			<Button class="submit" type="submit" disabled={signUp.pending > 0}>Create account</Button>
		</form>

		<p class="switch">
			Already have an account?
			<Button onclick={() => (creating = false)}>Sign in</Button>
		</p>
	{:else}
		<form {...signIn}>
			<label>
				E-mail
				<input {...signIn.fields.email.as('email')} autocomplete="email" required />
				{#each signIn.fields.email.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
			</label>

			<label>
				Password
				<input {...signIn.fields._password.as('password')} autocomplete="current-password" required />
				{#each signIn.fields._password.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
			</label>

			{#each signIn.fields.allIssues()?.filter((issue) => issue.path.length === 0) ?? [] as issue (issue.message)}
				<p class="issue" role="alert">{issue.message}</p>
			{/each}

			<Button class="submit" type="submit" disabled={signIn.pending > 0}>Sign in</Button>
		</form>

		<p class="switch">
			New here?
			<Button onclick={() => (creating = true)}>Create an account</Button>
		</p>
	{/if}
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		width: min(360px, 100% - 32px);
		margin: 0 auto;
		padding: 18vh 0 64px;
	}

	h1 {
		margin: 0 0 32px;
		font-size: 28px;
		font-weight: 400;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: #bbb;
		font-size: 14px;
	}

	input {
		height: 44px;
		padding: 0 12px;
		border: 1px solid transparent;
		background: rgb(255 255 255 / 0.08);
		color: #e6e6e6;
		font: inherit;
		font-size: 16px;
		outline: none;
		transition:
			background 120ms,
			border-color 120ms;
	}

	input:focus {
		border-color: rgb(255 255 255 / 0.4);
		background: rgb(255 255 255 / 0.12);
	}

	input[aria-invalid='true'] {
		border-color: #e5484d;
	}

	.issue {
		margin: 0;
		color: #ff6b6f;
		font-size: 13px;
	}

	form :global(.submit) {
		height: 44px;
		margin-top: 8px;
		background: #e6e6e6;
		color: #101010;
		font-size: 15px;
		font-weight: 500;
	}

	form :global(.submit:hover) {
		background: #fff;
	}

	.switch {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 24px 0 0;
		color: #999;
		font-size: 14px;
	}

	.switch :global(.button) {
		color: #e6e6e6;
		text-decoration: underline;
	}
</style>
