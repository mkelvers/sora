/* @name FranchiseRelations */
-- Every stored relation `FranchiseWalk` may look at, starting from one AniList
-- entry, in one round trip. `source` is the entry whose relations a row is one
-- of, so a relation between two reached entries comes once from each.
--
-- `story` reaches an entry across every relation the walk can follow: not a
-- crossover (OTHER, or listed back as OTHER by an entry with no sequels of its
-- own), not a spin-off either way round, not a remake (see `remake`). It has
-- no limit on how many entries it reaches, so it reaches every entry the walk
-- can; the walk applies its own limit.
--
-- Both halves look up an entry's relations the same way, and that lookup is
-- written out twice: `story` keeps only entry IDs, so each entry is looked up
-- once; carrying the rows through it instead looks an entry up again for every
-- relation that reaches it, which made Gundam take 50 ms instead of 4.
with recursive story (id) as (
	select cast(:start! as integer)
	union
	select relation.next
	from story
	join lateral (
		select
			case when lister.anilist_id = story.id then related.anilist_id else lister.anilist_id end as next,
			related.relation not in ('OTHER', 'SPIN_OFF')
				and reverse.relation is distinct from 'SPIN_OFF'
				and not (
					coalesce(reverse.relation = 'OTHER', false)
					and (
						select true
						from series_related own
						where own.series_id = target.id and own.relation in ('SEQUEL', 'PREQUEL')
						limit 1
					) is null
				)
				and not coalesce(
					related.relation = 'ALTERNATIVE'
						and target.key <> lister.key
						and (
							select format
							from anime_search
							where anime_search.anilist_id = lister.anilist_id
						) in ('TV', 'TV_SHORT', 'ONA')
						and (
							select format
							from anime_search
							where anime_search.anilist_id = related.anilist_id
						) in ('TV', 'TV_SHORT', 'ONA'),
					false
				) as follows
		from (
			select listed.series_id, listed.anilist_id, listed.relation
			from series_related listed
			join series own on own.id = listed.series_id
			where own.anilist_id = story.id
			union all
			select listing.series_id, listing.anilist_id, listing.relation
			from series_related listing
			where listing.anilist_id = story.id
		) related
		join series lister on lister.id = related.series_id
		left join series target on target.anilist_id = related.anilist_id
		left join series_related reverse
			on reverse.series_id = target.id and reverse.anilist_id = lister.anilist_id
	) relation on true
	where relation.follows
)
select
	story.id as "source!",
	lister.anilist_id as "from!",
	related.relation as "relation!",
	related.anilist_id as "to!",
	lister.start_date as "fromStartDate",
	target.start_date as "toStartDate",
	-- Whether the entry listing the other as OTHER has sequels of its own: if
	-- so, it is part of a story, not a crossover.
	related.relation = 'OTHER' and (
		select true
		from series_related own
		where own.series_id = lister.id and own.relation in ('SEQUEL', 'PREQUEL')
		limit 1
	) is not null as "fromChained!",
	-- Two TV or web series of two TMDB shows listed as alternatives, such as
	-- Ranma ½ (2024) and Ranma ½ (1989): each is a story of its own.
	coalesce(
		related.relation = 'ALTERNATIVE'
			and target.key <> lister.key
			and (
				select format
				from anime_search
				where anime_search.anilist_id = lister.anilist_id
			) in ('TV', 'TV_SHORT', 'ONA')
			and (
				select format
				from anime_search
				where anime_search.anilist_id = related.anilist_id
			) in ('TV', 'TV_SHORT', 'ONA'),
		false
	) as "remake!"
from story
join lateral (
	select listed.series_id, listed.anilist_id, listed.relation
	from series_related listed
	join series own on own.id = listed.series_id
	where own.anilist_id = story.id
	union all
	select listing.series_id, listing.anilist_id, listing.relation
	from series_related listing
	where listing.anilist_id = story.id
) related on true
join series lister on lister.id = related.series_id
left join series target on target.anilist_id = related.anilist_id;
