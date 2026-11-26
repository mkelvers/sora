/** Types generated for queries found in "src/series/franchise-relations.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'FranchiseRelations' parameters type */
export interface IFranchiseRelationsParams {
  start: number;
}

/** 'FranchiseRelations' return type */
export interface IFranchiseRelationsResult {
  from: number;
  fromChained: boolean;
  fromStartDate: string | null;
  relation: string;
  remake: boolean;
  source: number;
  to: number;
  toStartDate: string | null;
}

/** 'FranchiseRelations' query type */
export interface IFranchiseRelationsQuery {
  params: IFranchiseRelationsParams;
  result: IFranchiseRelationsResult;
}

const franchiseRelationsIR: any = {"usedParamSet":{"start":true},"params":[{"name":"start","required":true,"transform":{"type":"scalar"},"locs":[{"a":943,"b":949}]}],"statement":"-- Every stored relation `FranchiseWalk` may look at, starting from one AniList\n-- entry, in one round trip. `source` is the entry whose relations a row is one\n-- of, so a relation between two reached entries comes once from each.\n--\n-- `story` reaches an entry across every relation the walk can follow: not a\n-- crossover (OTHER, or listed back as OTHER by an entry with no sequels of its\n-- own), not a spin-off either way round, not a remake (see `remake`). It has\n-- no limit on how many entries it reaches, so it reaches every entry the walk\n-- can; the walk applies its own limit.\n--\n-- Both halves look up an entry's relations the same way, and that lookup is\n-- written out twice: `story` keeps only entry IDs, so each entry is looked up\n-- once; carrying the rows through it instead looks an entry up again for every\n-- relation that reaches it, which made Gundam take 50 ms instead of 4.\nwith recursive story (id) as (\n\tselect cast(:start! as integer)\n\tunion\n\tselect relation.next\n\tfrom story\n\tjoin lateral (\n\t\tselect\n\t\t\tcase when lister.anilist_id = story.id then related.anilist_id else lister.anilist_id end as next,\n\t\t\trelated.relation not in ('OTHER', 'SPIN_OFF')\n\t\t\t\tand reverse.relation is distinct from 'SPIN_OFF'\n\t\t\t\tand not (\n\t\t\t\t\tcoalesce(reverse.relation = 'OTHER', false)\n\t\t\t\t\tand (\n\t\t\t\t\t\tselect true\n\t\t\t\t\t\tfrom series_related own\n\t\t\t\t\t\twhere own.series_id = target.id and own.relation in ('SEQUEL', 'PREQUEL')\n\t\t\t\t\t\tlimit 1\n\t\t\t\t\t) is null\n\t\t\t\t)\n\t\t\t\tand not coalesce(\n\t\t\t\t\trelated.relation = 'ALTERNATIVE'\n\t\t\t\t\t\tand target.key <> lister.key\n\t\t\t\t\t\tand (\n\t\t\t\t\t\t\tselect format\n\t\t\t\t\t\t\tfrom anime_search\n\t\t\t\t\t\t\twhere anime_search.anilist_id = lister.anilist_id\n\t\t\t\t\t\t) in ('TV', 'TV_SHORT', 'ONA')\n\t\t\t\t\t\tand (\n\t\t\t\t\t\t\tselect format\n\t\t\t\t\t\t\tfrom anime_search\n\t\t\t\t\t\t\twhere anime_search.anilist_id = related.anilist_id\n\t\t\t\t\t\t) in ('TV', 'TV_SHORT', 'ONA'),\n\t\t\t\t\tfalse\n\t\t\t\t) as follows\n\t\tfrom (\n\t\t\tselect listed.series_id, listed.anilist_id, listed.relation\n\t\t\tfrom series_related listed\n\t\t\tjoin series own on own.id = listed.series_id\n\t\t\twhere own.anilist_id = story.id\n\t\t\tunion all\n\t\t\tselect listing.series_id, listing.anilist_id, listing.relation\n\t\t\tfrom series_related listing\n\t\t\twhere listing.anilist_id = story.id\n\t\t) related\n\t\tjoin series lister on lister.id = related.series_id\n\t\tleft join series target on target.anilist_id = related.anilist_id\n\t\tleft join series_related reverse\n\t\t\ton reverse.series_id = target.id and reverse.anilist_id = lister.anilist_id\n\t) relation on true\n\twhere relation.follows\n)\nselect\n\tstory.id as \"source!\",\n\tlister.anilist_id as \"from!\",\n\trelated.relation as \"relation!\",\n\trelated.anilist_id as \"to!\",\n\tlister.start_date as \"fromStartDate\",\n\ttarget.start_date as \"toStartDate\",\n\t-- Whether the entry listing the other as OTHER has sequels of its own: if\n\t-- so, it is part of a story, not a crossover.\n\trelated.relation = 'OTHER' and (\n\t\tselect true\n\t\tfrom series_related own\n\t\twhere own.series_id = lister.id and own.relation in ('SEQUEL', 'PREQUEL')\n\t\tlimit 1\n\t) is not null as \"fromChained!\",\n\t-- Two TV or web series of two TMDB shows listed as alternatives, such as\n\t-- Ranma ½ (2024) and Ranma ½ (1989): each is a story of its own.\n\tcoalesce(\n\t\trelated.relation = 'ALTERNATIVE'\n\t\t\tand target.key <> lister.key\n\t\t\tand (\n\t\t\t\tselect format\n\t\t\t\tfrom anime_search\n\t\t\t\twhere anime_search.anilist_id = lister.anilist_id\n\t\t\t) in ('TV', 'TV_SHORT', 'ONA')\n\t\t\tand (\n\t\t\t\tselect format\n\t\t\t\tfrom anime_search\n\t\t\t\twhere anime_search.anilist_id = related.anilist_id\n\t\t\t) in ('TV', 'TV_SHORT', 'ONA'),\n\t\tfalse\n\t) as \"remake!\"\nfrom story\njoin lateral (\n\tselect listed.series_id, listed.anilist_id, listed.relation\n\tfrom series_related listed\n\tjoin series own on own.id = listed.series_id\n\twhere own.anilist_id = story.id\n\tunion all\n\tselect listing.series_id, listing.anilist_id, listing.relation\n\tfrom series_related listing\n\twhere listing.anilist_id = story.id\n) related on true\njoin series lister on lister.id = related.series_id\nleft join series target on target.anilist_id = related.anilist_id"};

/**
 * Query generated from SQL:
 * ```
 * -- Every stored relation `FranchiseWalk` may look at, starting from one AniList
 * -- entry, in one round trip. `source` is the entry whose relations a row is one
 * -- of, so a relation between two reached entries comes once from each.
 * --
 * -- `story` reaches an entry across every relation the walk can follow: not a
 * -- crossover (OTHER, or listed back as OTHER by an entry with no sequels of its
 * -- own), not a spin-off either way round, not a remake (see `remake`). It has
 * -- no limit on how many entries it reaches, so it reaches every entry the walk
 * -- can; the walk applies its own limit.
 * --
 * -- Both halves look up an entry's relations the same way, and that lookup is
 * -- written out twice: `story` keeps only entry IDs, so each entry is looked up
 * -- once; carrying the rows through it instead looks an entry up again for every
 * -- relation that reaches it, which made Gundam take 50 ms instead of 4.
 * with recursive story (id) as (
 * 	select cast(:start! as integer)
 * 	union
 * 	select relation.next
 * 	from story
 * 	join lateral (
 * 		select
 * 			case when lister.anilist_id = story.id then related.anilist_id else lister.anilist_id end as next,
 * 			related.relation not in ('OTHER', 'SPIN_OFF')
 * 				and reverse.relation is distinct from 'SPIN_OFF'
 * 				and not (
 * 					coalesce(reverse.relation = 'OTHER', false)
 * 					and (
 * 						select true
 * 						from series_related own
 * 						where own.series_id = target.id and own.relation in ('SEQUEL', 'PREQUEL')
 * 						limit 1
 * 					) is null
 * 				)
 * 				and not coalesce(
 * 					related.relation = 'ALTERNATIVE'
 * 						and target.key <> lister.key
 * 						and (
 * 							select format
 * 							from anime_search
 * 							where anime_search.anilist_id = lister.anilist_id
 * 						) in ('TV', 'TV_SHORT', 'ONA')
 * 						and (
 * 							select format
 * 							from anime_search
 * 							where anime_search.anilist_id = related.anilist_id
 * 						) in ('TV', 'TV_SHORT', 'ONA'),
 * 					false
 * 				) as follows
 * 		from (
 * 			select listed.series_id, listed.anilist_id, listed.relation
 * 			from series_related listed
 * 			join series own on own.id = listed.series_id
 * 			where own.anilist_id = story.id
 * 			union all
 * 			select listing.series_id, listing.anilist_id, listing.relation
 * 			from series_related listing
 * 			where listing.anilist_id = story.id
 * 		) related
 * 		join series lister on lister.id = related.series_id
 * 		left join series target on target.anilist_id = related.anilist_id
 * 		left join series_related reverse
 * 			on reverse.series_id = target.id and reverse.anilist_id = lister.anilist_id
 * 	) relation on true
 * 	where relation.follows
 * )
 * select
 * 	story.id as "source!",
 * 	lister.anilist_id as "from!",
 * 	related.relation as "relation!",
 * 	related.anilist_id as "to!",
 * 	lister.start_date as "fromStartDate",
 * 	target.start_date as "toStartDate",
 * 	-- Whether the entry listing the other as OTHER has sequels of its own: if
 * 	-- so, it is part of a story, not a crossover.
 * 	related.relation = 'OTHER' and (
 * 		select true
 * 		from series_related own
 * 		where own.series_id = lister.id and own.relation in ('SEQUEL', 'PREQUEL')
 * 		limit 1
 * 	) is not null as "fromChained!",
 * 	-- Two TV or web series of two TMDB shows listed as alternatives, such as
 * 	-- Ranma ½ (2024) and Ranma ½ (1989): each is a story of its own.
 * 	coalesce(
 * 		related.relation = 'ALTERNATIVE'
 * 			and target.key <> lister.key
 * 			and (
 * 				select format
 * 				from anime_search
 * 				where anime_search.anilist_id = lister.anilist_id
 * 			) in ('TV', 'TV_SHORT', 'ONA')
 * 			and (
 * 				select format
 * 				from anime_search
 * 				where anime_search.anilist_id = related.anilist_id
 * 			) in ('TV', 'TV_SHORT', 'ONA'),
 * 		false
 * 	) as "remake!"
 * from story
 * join lateral (
 * 	select listed.series_id, listed.anilist_id, listed.relation
 * 	from series_related listed
 * 	join series own on own.id = listed.series_id
 * 	where own.anilist_id = story.id
 * 	union all
 * 	select listing.series_id, listing.anilist_id, listing.relation
 * 	from series_related listing
 * 	where listing.anilist_id = story.id
 * ) related on true
 * join series lister on lister.id = related.series_id
 * left join series target on target.anilist_id = related.anilist_id
 * ```
 */
export const franchiseRelations = new PreparedQuery<IFranchiseRelationsParams,IFranchiseRelationsResult>(franchiseRelationsIR);


