<script lang="ts">
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import Avatar from "$lib/components/ui/Avatar.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import type { PageProps } from "./$types";

	let { data, form }: PageProps = $props();

	let deleting = $state<string | null>(null);

	const managing = $derived(page.url.searchParams.has("manage"));

	const switchMode = $derived.by(() => {
		const params = new URLSearchParams(page.url.search);
		if (managing) {
			params.delete("manage");
		} else {
			params.set("manage", "1");
		}
		return params.size > 0 ? `/profiles?${params}` : "/profiles";
	});
</script>

<svelte:head>
	<title>{managing ? "Manage profiles" : "Who's watching?"}</title>
</svelte:head>

<main>
	<h1>{managing ? "Manage profiles" : "Who's watching?"}</h1>

	<form
		method="POST"
		action="?/{managing ? 'delete' : 'select'}{page.url.search.replace('?', '&')}"
		use:enhance={({ submitter }) => {
			if (managing && submitter instanceof HTMLButtonElement) {
				deleting = submitter.value;
			}
			return async ({ update }) => {
				await update();
				deleting = null;
			};
		}}
	>
		<ul>
			{#each data.profiles as profile (profile.id)}
				<li>
					{#if managing}
						<a
							class="profile"
							href="/profiles/{profile.id}{page.url.search}"
							aria-label="Edit {profile.name}"
						>
							<span class="tile editing">
								<Avatar seed={profile.avatar} />
								<span class="pencil">
									<Icon name="edit" />
								</span>
							</span>
							<span class="name">{profile.name}</span>
						</a>
						{#if data.profiles.length > 1}
							<button
								class="delete"
								name="profile"
								value={profile.id}
								disabled={deleting !== null}
								aria-label="Delete {profile.name}"
							>
								<Icon name="delete" size="sm" />
							</button>
						{/if}
					{:else}
						<button
							class="profile"
							name="profile"
							value={profile.id}
						>
							<Avatar seed={profile.avatar} class="tile" />
							<span class="name">{profile.name}</span>
						</button>
					{/if}
				</li>
			{/each}

			{#if !managing}
				<li>
					<a class="profile" href="/profiles/new{page.url.search}">
						<span class="tile add">
							<Icon name="add" />
						</span>
						<span class="name">Add profile</span>
					</a>
				</li>
			{/if}
		</ul>

		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}
	</form>

	<div class="footer">
		{#if managing}
			<a class="pill done" href={switchMode}>
				<Icon name="check" size="sm" />
				Done
			</a>
		{:else}
			<a class="pill" href={switchMode}>
				<Icon name="edit" size="sm" />
				Manage profiles
			</a>
		{/if}

		<form method="POST" action="/logout">
			<button class="sign-out">Sign out</button>
		</form>
	</div>
</main>

<style>
	main {
		--tile: clamp(96px, 12vw, 152px);
		--gap: clamp(16px, 2.5vw, 36px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 40px;
		box-sizing: border-box;
		min-height: 100vh;
		padding: 48px 16px;
		background: radial-gradient(ellipse at top, #1d1d1d, #101010 60%);
	}

	h1 {
		margin: 0;
		font-size: clamp(24px, 3vw, 34px);
		font-weight: 400;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 28px var(--gap);
		max-width: calc(5 * var(--tile) + 4 * var(--gap));
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.profile {
		display: grid;
		justify-items: center;
		gap: 14px;
		width: var(--tile);
		padding: 0;
		border: none;
		background: none;
		color: #999;
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.profile :global(.tile) {
		box-sizing: border-box;
		width: var(--tile);
		height: var(--tile);
		outline: 2px solid transparent;
		outline-offset: 3px;
		transition: outline-color 120ms;
	}

	.profile:hover :global(.tile),
	.profile:focus-visible :global(.tile) {
		outline-color: #fff;
	}

	.profile:focus-visible {
		outline: none;
	}

	.editing {
		display: grid;
		position: relative;
	}

	.editing :global(.avatar) {
		opacity: 0.35;
		transition: opacity 120ms;
	}

	.profile:hover .editing :global(.avatar),
	.profile:focus-visible .editing :global(.avatar) {
		opacity: 0.5;
	}

	.pencil {
		display: grid;
		position: absolute;
		inset: 0;
		place-items: center;
		color: #fff;
	}

	.pencil :global(svg) {
		width: 30%;
		height: 30%;
	}

	.add {
		display: grid;
		place-items: center;
		background: rgb(255 255 255 / 0.06);
		color: #999;
		transition:
			background 120ms,
			color 120ms,
			outline-color 120ms;
	}

	.profile:hover .add,
	.profile:focus-visible .add {
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.add :global(svg) {
		width: 40%;
		height: 40%;
	}

	.name {
		max-width: 100%;
		overflow: hidden;
		font-size: 15px;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color 120ms;
	}

	.profile:hover .name,
	.profile:focus-visible .name {
		color: #fff;
	}

	li {
		position: relative;
	}

	.delete {
		display: grid;
		position: absolute;
		top: 6px;
		right: 6px;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgb(16 16 16 / 0.75);
		color: #ff6b6b;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.delete:hover {
		background: #e5484d;
		color: #fff;
	}

	.delete:disabled {
		background: rgb(16 16 16 / 0.75);
		color: #ff6b6b;
		opacity: 0.5;
		cursor: default;
	}

	.delete:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.error {
		margin: 24px 0 0;
		color: #ff8a80;
		font-size: 14px;
		text-align: center;
	}

	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 18px;
		border: 1px solid rgb(255 255 255 / 0.3);
		border-radius: 999px;
		color: #e6e6e6;
		font-size: 14px;
		text-decoration: none;
		transition:
			background 120ms,
			border-color 120ms,
			color 120ms;
	}

	.pill:hover {
		border-color: #fff;
		color: #fff;
	}

	.done {
		border-color: #fff;
		background: #fff;
		color: #101010;
	}

	.done:hover {
		color: #101010;
		opacity: 0.9;
	}

	.pill:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.sign-out {
		padding: 9px 18px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: none;
		color: #777;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		transition:
			background 120ms,
			color 120ms;
	}

	.sign-out:hover {
		background: rgb(255 255 255 / 0.08);
		color: #fff;
	}

	.sign-out:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
</style>
