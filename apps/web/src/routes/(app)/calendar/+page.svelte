<script lang="ts" module>
	const shown = $state({
		weeks: 0,
	});
</script>

<script lang="ts">
	import EmptyState from "$lib/components/EmptyState.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import Image from "$lib/components/ui/Image.svelte";
	import Sheet from "$lib/components/ui/Sheet.svelte";
	import { mascots } from "$lib/mascots";
	import { cn, tmdbImage, tmdbSrcset } from "$lib/utils";
	import { Tabs } from "melt/builders";
	import {
		CaretDownIcon,
		CaretLeftIcon,
		CaretRightIcon,
		ClockIcon,
		InfoIcon,
	} from "phosphor-svelte";

	import type { PageProps } from "./$types";
	import { getCalendar } from "./calendar.remote";

	let { data }: PageProps = $props();

	const calendar = $derived(
		await getCalendar({
			timeZone: data.timeZone,
			weeks: shown.weeks,
		}),
	);

	let selected = $derived(calendar.days.find((day) => day.today)?.date ?? calendar.days[0].date);
	const current = $derived(calendar.days.find((day) => day.date === selected) ?? calendar.days[0]);

	// Whether the "Days" sheet is open.
	let days = $state(false);

	const tabs = new Tabs<string>({
		value: () => selected,
		onValueChange: (next) => (selected = next),
	});
</script>

<svelte:head>
	<title>Release calendar · Sora</title>
</svelte:head>

<div class="page overflow-x-clip">
	<section class="mx-auto w-full max-w-7xl" aria-labelledby="calendar-title">
		<div class="mb-6 flex items-center justify-between gap-2 sm:mb-8 sm:gap-4">
			<div class="flex flex-col items-start">
				<h1 id="calendar-title" class="text-2xl font-bold">Release calendar</h1>
				<p class="mt-1 text-sm text-muted tabular-nums">{calendar.week}</p>
			</div>

			<nav class="flex items-center gap-1" aria-label="Weeks">
				{#if shown.weeks !== 0}
					<Button onclick={() => (shown.weeks = 0)} variant="ghost" class="max-sm:hidden">
						This week
					</Button>
				{/if}
				<Button onclick={() => (shown.weeks -= 1)} variant="icon" aria-label="Previous week">
					<CaretLeftIcon size="1.25rem" weight="bold" />
				</Button>
				<Button onclick={() => (shown.weeks += 1)} variant="icon" aria-label="Next week">
					<CaretRightIcon size="1.25rem" weight="bold" />
				</Button>
			</nav>
		</div>

		<div class="mb-2 flex items-center justify-between gap-2 sm:hidden">
			<Button
				variant="text"
				aria-label="Choose day, {current.label} selected"
				aria-haspopup="dialog"
				aria-controls="day-list"
				onclick={() => (days = true)}
			>
				<CaretDownIcon size="0.875rem" weight="fill" />
				{current.weekday} · {current.monthDay}
			</Button>
			{#if shown.weeks !== 0}
				<Button onclick={() => (shown.weeks = 0)} variant="ghost">This week</Button>
			{/if}
		</div>

		<div {...tabs.triggerList} aria-label="Days" class="grid grid-cols-7 max-sm:hidden">
			{#each calendar.days as day (day.date)}
				<button
					{...tabs.getTrigger(day.date)}
					type="button"
					class="-mb-px flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 border-b-2 border-transparent py-2 text-muted transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:bg-hover aria-selected:border-accent aria-selected:text-foreground"
					aria-label="{day.label}, {day.count} {day.count === 1 ? 'episode' : 'episodes'}"
				>
					<span
						class={cn("text-xs font-medium tracking-wide uppercase", day.today && "text-accent")}
					>
						{day.weekday}
					</span>
					<span
						class={cn(
							"text-2xl font-bold tabular-nums",
							!day.count && "text-subtle",
							day.today && "text-accent",
						)}
					>
						{day.number}
					</span>
				</button>
			{/each}
		</div>

		{#each calendar.days as day (day.date)}
			<section {...tabs.getContent(day.date)} aria-label={day.label} class="outline-none">
				{#if day.date === selected}
					{#if day.slots.length}
						<ol class="flex flex-col gap-8 pt-6 pb-10 sm:gap-10 sm:pt-8">
							{#each day.slots as slot (slot.at)}
								{#if slot.now}
									<li class="text-sm font-semibold text-accent tabular-nums sm:pl-34">
										Now · {calendar.now}
									</li>
								{/if}
								<li class="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
									<time
										datetime={slot.at}
										class={cn(
											"text-lg font-bold tabular-nums sm:text-2xl",
											slot.aired && day.today && "text-muted",
										)}
									>
										{slot.time}
									</time>

									<ul class="grid gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-6 lg:grid-cols-3">
										{#each slot.releases as release (release.key)}
											{@const image = release.series.backdrop_url ?? release.series.poster_url}
											<li
												class="group relative isolate flex min-w-0 flex-col focus-within:z-10 hover:z-10"
											>
												<a
													href="/series/{release.series.id}"
													class="flex min-w-0 flex-1 flex-col focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
												>
													<div
														class="grid grid-cols-[40%_minmax(0,1fr)] content-start gap-x-3 transition-opacity duration-150 sm:flex sm:flex-col sm:group-hover:opacity-0 sm:group-has-focus-visible:opacity-0"
													>
														<div
															class="relative row-span-3 aspect-video w-full self-start overflow-hidden bg-surface"
														>
															{#if image}
																<Image
																	src={tmdbImage(image, "w780")}
																	srcset={tmdbSrcset(image, {
																		w300: 300,
																		w780: 780,
																	})}
																	sizes="(min-width: 64rem) 22vw, (min-width: 40rem) 40vw, 40vw"
																	alt="Backdrop of {release.series.title}"
																	class="brightness-75"
																/>
															{/if}
														</div>
														<h3 class="line-clamp-2 text-sm leading-snug font-semibold sm:mt-3">
															{release.series.title}
														</h3>
														<p class="mt-1 text-xs text-muted sm:text-sm">
															{release.episodes} · {release.language}
														</p>
													</div>

													<div
														aria-hidden="true"
														class="pointer-events-none absolute -inset-2 z-10 flex flex-col bg-surface px-4 pt-6 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-has-focus-visible:opacity-100 max-sm:hidden"
													>
														<p class="line-clamp-1 text-sm text-muted">
															{release.series.title}
														</p>
														<p class="mt-1 text-base leading-snug font-bold text-foreground">
															{release.episodes}
														</p>
														<p class="text-sm text-muted">{release.language}</p>
														<p class="mt-1 flex items-center gap-1.5 text-sm text-muted">
															<ClockIcon size="1rem" />
															{day.name} · {slot.time}
														</p>
														{#if release.series.overview}
															<p class="mt-2 line-clamp-4 text-sm leading-snug text-foreground">
																{release.series.overview}
															</p>
														{/if}
														<span
															class="mt-auto flex h-10 shrink-0 items-center gap-2 text-sm font-bold text-accent uppercase"
														>
															<InfoIcon size="1.25rem" weight="bold" />
															View series
														</span>
													</div>
												</a>
											</li>
										{/each}
									</ul>
								</li>
							{/each}
						</ol>
					{:else}
						<div class="pt-8">
							<EmptyState mascot={mascots.emptyCalendar} {...day.nothing} />
						</div>
					{/if}
				{/if}
			</section>
		{/each}
	</section>
</div>

<Sheet bind:open={days} id="day-list" title="Days">
	{#each calendar.days as day (day.date)}
		<Button
			variant="item"
			class="justify-between"
			aria-current={day.date === selected ? "true" : undefined}
			onclick={() => {
				days = false;
				selected = day.date;
			}}
		>
			{day.label}
			<span class="text-subtle tabular-nums">{day.count}</span>
		</Button>
	{/each}
</Sheet>
