<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { signOut } from '../login/login.remote';
	import { addProfile, chooseProfile, editProfile, getProfiles, removeProfile } from './profiles.remote';

	const palette = ['#4f7cff', '#e5484d', '#30a46c', '#f5a524', '#8e4ec6', '#12a594', '#e54666', '#3e63dd'];

	const profiles = $derived(await getProfiles());

	let managing = $state(false);
	let adding = $state(false);
	/** The profile being edited, while managing. */
	let editing = $state<string>();
</script>

<svelte:head>
	<title>Who's watching? · Sora</title>
</svelte:head>

<main>
	<h1>{managing ? 'Manage profiles' : "Who's watching?"}</h1>

	<ul>
		{#each profiles as profile (profile.id)}
			{@const choose = chooseProfile.for(profile.id)}
			{@const edit = editProfile.for(profile.id)}
			{@const remove = removeProfile.for(profile.id)}
			<li>
				{#if editing === profile.id}
					<form class="editor" {...edit.enhance(async ({ submit }) => {
						if (await submit()) {
							editing = undefined;
						}
					})}>
						<input {...edit.fields.id.as('hidden', profile.id)} />
						<input
							class="name"
							{...edit.fields.name.as('text')}
							value={profile.name}
							aria-label="Name"
							maxlength="40"
							required
						/>
						<div class="swatches" role="radiogroup" aria-label="Color">
							{#each palette as color (color)}
								<label class="swatch" style:background={color}>
									<input
										type="radio"
										name="color"
										value={color}
										checked={color === profile.color}
										aria-label={color}
									/>
								</label>
							{/each}
						</div>
						<div class="actions">
							<Button class="primary" type="submit">Save</Button>
							<Button onclick={() => (editing = undefined)}>Cancel</Button>
						</div>
					</form>

					<form {...remove}>
						<input {...remove.fields.id.as('hidden', profile.id)} />
						<Button class="delete" type="submit" disabled={profiles.length === 1}>Delete profile</Button>
					</form>
				{:else if managing}
					<Button class="tile" onclick={() => (editing = profile.id)} aria-label="Edit {profile.name}">
						<span class="avatar" style:background={profile.color}>
							{profile.name.slice(0, 1).toUpperCase()}
							<span class="overlay"><Icon name="edit" /></span>
						</span>
						<span class="label">{profile.name}</span>
					</Button>
				{:else}
					<form {...choose}>
						<input {...choose.fields.id.as('hidden', profile.id)} />
						<Button class="tile" type="submit">
							<span class="avatar" style:background={profile.color}>{profile.name.slice(0, 1).toUpperCase()}</span>
							<span class="label">{profile.name}</span>
						</Button>
					</form>
				{/if}
			</li>
		{/each}

		{#if !managing}
			<li>
				{#if adding}
					<form class="editor" {...addProfile.enhance(async ({ element, submit }) => {
						if (await submit()) {
							element.reset();
							adding = false;
						}
					})}>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="name"
							{...addProfile.fields.name.as('text')}
							placeholder="Name"
							aria-label="Name"
							maxlength="40"
							autofocus
							required
						/>
						<div class="actions">
							<Button class="primary" type="submit">Add</Button>
							<Button onclick={() => (adding = false)}>Cancel</Button>
						</div>
					</form>
				{:else}
					<Button class="tile" onclick={() => (adding = true)}>
						<span class="avatar add">+</span>
						<span class="label">Add profile</span>
					</Button>
				{/if}
			</li>
		{/if}
	</ul>

	<div class="footer">
		<Button
			class="outline"
			onclick={() => {
				managing = !managing;
				editing = undefined;
				adding = false;
			}}
		>
			{managing ? 'Done' : 'Manage profiles'}
		</Button>

		<form {...signOut}>
			<Button class="quiet" type="submit">Sign out</Button>
		</form>
	</div>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 100vh;
		box-sizing: border-box;
		padding: 16vh 16px 64px;
	}

	h1 {
		margin: 0 0 40px;
		font-size: clamp(28px, 4vw, 40px);
		font-weight: 400;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 32px;
		max-width: 960px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 140px;
	}

	li :global(.tile) {
		flex-direction: column;
		gap: 12px;
		width: 100%;
		color: #999;
	}

	li :global(.tile:hover),
	li :global(.tile:focus-visible) {
		color: #fff;
	}

	li :global(.tile:focus-visible) {
		outline: none;
	}

	.avatar {
		position: relative;
		display: grid;
		place-items: center;
		width: 140px;
		aspect-ratio: 1;
		color: rgb(255 255 255 / 0.9);
		font-size: 56px;
		font-weight: 500;
		outline: 3px solid transparent;
		outline-offset: 0;
		transition: outline-color 120ms;
	}

	li:hover .avatar,
	li:has(:focus-visible) .avatar {
		outline-color: #fff;
	}

	.avatar.add {
		background: rgb(255 255 255 / 0.06);
		color: #888;
		font-size: 64px;
		font-weight: 300;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.5);
		color: #fff;
	}

	.label {
		overflow: hidden;
		max-width: 100%;
		font-size: 16px;
		text-overflow: ellipsis;
	}

	.editor {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.name {
		height: 40px;
		padding: 0 10px;
		border: 1px solid rgb(255 255 255 / 0.3);
		background: rgb(255 255 255 / 0.08);
		color: #e6e6e6;
		font: inherit;
		font-size: 15px;
		outline: none;
	}

	.name:focus {
		border-color: #fff;
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}

	.swatch {
		aspect-ratio: 1;
		cursor: pointer;
	}

	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.swatch:has(input:checked) {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}

	.swatch:has(input:focus-visible) {
		outline: 2px dashed #fff;
		outline-offset: 2px;
	}

	.actions {
		display: flex;
		gap: 8px;
	}

	.actions :global(.button) {
		flex: 1;
		height: 34px;
		background: rgb(255 255 255 / 0.08);
	}

	.actions :global(.primary) {
		background: #e6e6e6;
		color: #101010;
	}

	li :global(.delete) {
		width: 100%;
		height: 34px;
		color: #ff6b6f;
	}

	li :global(.delete:hover) {
		background: rgb(229 72 77 / 0.15);
	}

	.footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		margin-top: 56px;
	}

	.footer :global(.outline) {
		padding: 10px 24px;
		border: 1px solid #666;
		color: #999;
		font-size: 15px;
		letter-spacing: 0.04em;
	}

	.footer :global(.outline:hover) {
		border-color: #fff;
		color: #fff;
	}

	.footer :global(.quiet) {
		color: #777;
		font-size: 14px;
	}

	.footer :global(.quiet:hover) {
		color: #ddd;
	}
</style>
