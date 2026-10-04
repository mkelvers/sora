<script lang="ts">
	import Skeleton from "$lib/components/snippets/Skeleton.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { cn } from "$lib/utils";
	import { MagnifyingGlassIcon } from "phosphor-svelte";

	import { Search } from "./searchbox.svelte";
	import Suggestions from "./Suggestions.svelte";

	const search = new Search();
</script>

<svelte:window onkeydown={search.shortcut} />

<form
	bind:this={search.form}
	class="relative flex h-full max-sm:absolute max-sm:inset-x-0 max-sm:top-13.75 max-sm:h-12.25 max-sm:bg-header-hover"
	role="search"
	action="/search"
	onsubmit={search.submit}
	onfocusin={() => (search.focused = true)}
	onfocusout={search.leave}
>
	<div
		class={cn(
			"flex w-0 items-center overflow-hidden bg-header-hover transition-[width,flex-grow] duration-260 ease-out motion-reduce:transition-none",
			search.expanded && "max-sm:w-full sm:w-[min(22.5rem,calc(100vw-9rem))]",
		)}
		inert={!search.expanded}
	>
		<MagnifyingGlassIcon size="1.25rem" class="ml-4 shrink-0 text-muted sm:hidden" />
		<input
			bind:this={search.input}
			bind:value={search.text}
			name="q"
			type="text"
			placeholder="Search titles"
			autocomplete="off"
			spellcheck="false"
			role="combobox"
			aria-label="Search titles"
			aria-autocomplete="list"
			aria-controls="search-suggestions"
			aria-expanded={search.shown}
			aria-activedescendant={search.activeId}
			oninput={search.edit}
			onkeydown={search.keydown}
			class="h-full min-w-0 flex-1 bg-transparent pr-3 pl-5 text-sm text-foreground outline-none placeholder:text-subtle max-sm:pl-3 max-sm:text-base"
		/>
	</div>

	<Button
		variant="icon"
		class={cn(
			"h-full w-12 hover:bg-header-hover focus-visible:-outline-offset-2 active:scale-100 max-sm:hidden sm:w-14",
			search.open && "bg-header-hover text-foreground",
		)}
		aria-label="Search"
		aria-expanded={search.open}
		onclick={search.toggle}
	>
		<MagnifyingGlassIcon size="1.5rem" />
	</Button>

	{#if search.shown}
		<div
			bind:this={search.panel}
			id="search-suggestions"
			class="absolute top-full right-0 w-full overflow-hidden bg-header-hover pt-1.5 shadow-xl transition-[opacity,translate] duration-140 outline-none max-sm:h-[calc(100dvh-6.5rem)] max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:shadow-none starting:-translate-y-1 starting:opacity-0"
			role="listbox"
			aria-label="Suggestions"
			tabindex="-1"
			onpointerdown={(event) => event.preventDefault()}
		>
			<svelte:boundary onerror={(_, reset) => (search.retry = reset)}>
				<Suggestions
					term={search.term}
					text={search.text}
					active={search.active}
					typing={search.typing}
				/>

				{#snippet pending()}
					{#each { length: 4 }, index (index)}
						<div class="flex items-center gap-3.5 px-4 py-2" aria-hidden="true">
							<Skeleton class="aspect-2/3 w-10" />
							<div class="grid flex-1 gap-2">
								<Skeleton class="h-3.5 w-7/10" />
								<Skeleton class="h-3 w-3/10" />
							</div>
						</div>
					{/each}
				{/snippet}

				{#snippet failed()}
					<p class="px-4 py-5 text-sm text-muted">Search isn’t available right now.</p>
				{/snippet}
			</svelte:boundary>
		</div>
	{/if}
</form>
