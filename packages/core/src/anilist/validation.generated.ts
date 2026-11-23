import { z } from "zod";
import { scalarSchemas } from "./wire";

/** Activity sort enums */
export const zActivitySort = z.enum(["ID", "ID_DESC", "PINNED"]);
/** Activity sort enums */
export type ActivitySort = z.output<typeof zActivitySort>;

/** Activity type enum. */
export const zActivityType = z.enum(["ANIME_LIST", "MANGA_LIST", "MEDIA_LIST", "MESSAGE", "TEXT"]);
/** Activity type enum. */
export type ActivityType = z.output<typeof zActivityType>;

/** Airing schedule sort enums */
export const zAiringSort = z.enum(["EPISODE", "EPISODE_DESC", "ID", "ID_DESC", "MEDIA_ID", "MEDIA_ID_DESC", "TIME", "TIME_DESC"]);
/** Airing schedule sort enums */
export type AiringSort = z.output<typeof zAiringSort>;

/** The role the character plays in the media */
export const zCharacterRole = z.enum(["BACKGROUND", "MAIN", "SUPPORTING"]);
/** The role the character plays in the media */
export type CharacterRole = z.output<typeof zCharacterRole>;

/** Character sort enums */
export const zCharacterSort = z.enum(["FAVOURITES", "FAVOURITES_DESC", "ID", "ID_DESC", "RELEVANCE", "ROLE", "ROLE_DESC", "SEARCH_MATCH"]);
/** Character sort enums */
export type CharacterSort = z.output<typeof zCharacterSort>;

export const zExternalLinkMediaType = z.enum(["ANIME", "MANGA", "STAFF"]);
export type ExternalLinkMediaType = z.output<typeof zExternalLinkMediaType>;

export const zExternalLinkType = z.enum(["INFO", "SOCIAL", "STREAMING"]);
export type ExternalLinkType = z.output<typeof zExternalLinkType>;

/** Types that can be liked */
export const zLikeableType = z.enum(["ACTIVITY", "ACTIVITY_REPLY", "THREAD", "THREAD_COMMENT"]);
/** Types that can be liked */
export type LikeableType = z.output<typeof zLikeableType>;

/** The format the media was released in */
export const zMediaFormat = z.enum(["MANGA", "MOVIE", "MUSIC", "NOVEL", "ONA", "ONE_SHOT", "OVA", "SPECIAL", "TV", "TV_SHORT"]);
/** The format the media was released in */
export type MediaFormat = z.output<typeof zMediaFormat>;

/** Media list sort enums */
export const zMediaListSort = z.enum(["ADDED_TIME", "ADDED_TIME_DESC", "FINISHED_ON", "FINISHED_ON_DESC", "MEDIA_ID", "MEDIA_ID_DESC", "MEDIA_POPULARITY", "MEDIA_POPULARITY_DESC", "MEDIA_TITLE_ENGLISH", "MEDIA_TITLE_ENGLISH_DESC", "MEDIA_TITLE_NATIVE", "MEDIA_TITLE_NATIVE_DESC", "MEDIA_TITLE_ROMAJI", "MEDIA_TITLE_ROMAJI_DESC", "PRIORITY", "PRIORITY_DESC", "PROGRESS", "PROGRESS_DESC", "PROGRESS_VOLUMES", "PROGRESS_VOLUMES_DESC", "REPEAT", "REPEAT_DESC", "SCORE", "SCORE_DESC", "STARTED_ON", "STARTED_ON_DESC", "STATUS", "STATUS_DESC", "UPDATED_TIME", "UPDATED_TIME_DESC"]);
/** Media list sort enums */
export type MediaListSort = z.output<typeof zMediaListSort>;

/** Media list watching/reading status enum. */
export const zMediaListStatus = z.enum(["COMPLETED", "CURRENT", "DROPPED", "PAUSED", "PLANNING", "REPEATING"]);
/** Media list watching/reading status enum. */
export type MediaListStatus = z.output<typeof zMediaListStatus>;

/** The type of ranking */
export const zMediaRankType = z.enum(["POPULAR", "RATED"]);
/** The type of ranking */
export type MediaRankType = z.output<typeof zMediaRankType>;

/** Type of relation media has to its parent. */
export const zMediaRelation = z.enum(["ADAPTATION", "ALTERNATIVE", "CHARACTER", "COMPILATION", "CONTAINS", "OTHER", "PARENT", "PREQUEL", "SAME_UNIVERSE", "SEQUEL", "SIDE_STORY", "SOURCE", "SPIN_OFF", "SUMMARY"]);
/** Type of relation media has to its parent. */
export type MediaRelation = z.output<typeof zMediaRelation>;

export const zMediaSeason = z.enum(["FALL", "SPRING", "SUMMER", "WINTER"]);
export type MediaSeason = z.output<typeof zMediaSeason>;

/** Media sort enums */
export const zMediaSort = z.enum(["CHAPTERS", "CHAPTERS_DESC", "DURATION", "DURATION_DESC", "END_DATE", "END_DATE_DESC", "EPISODES", "EPISODES_DESC", "FAVOURITES", "FAVOURITES_DESC", "FORMAT", "FORMAT_DESC", "ID", "ID_DESC", "POPULARITY", "POPULARITY_DESC", "SCORE", "SCORE_DESC", "SEARCH_MATCH", "START_DATE", "START_DATE_DESC", "STATUS", "STATUS_DESC", "TITLE_ENGLISH", "TITLE_ENGLISH_DESC", "TITLE_NATIVE", "TITLE_NATIVE_DESC", "TITLE_ROMAJI", "TITLE_ROMAJI_DESC", "TRENDING", "TRENDING_DESC", "TYPE", "TYPE_DESC", "UPDATED_AT", "UPDATED_AT_DESC", "VOLUMES", "VOLUMES_DESC"]);
/** Media sort enums */
export type MediaSort = z.output<typeof zMediaSort>;

/** Source type the media was adapted from */
export const zMediaSource = z.enum(["ANIME", "COMIC", "DOUJINSHI", "GAME", "LIGHT_NOVEL", "LIVE_ACTION", "MANGA", "MULTIMEDIA_PROJECT", "NOVEL", "ORIGINAL", "OTHER", "PICTURE_BOOK", "VIDEO_GAME", "VISUAL_NOVEL", "WEB_NOVEL"]);
/** Source type the media was adapted from */
export type MediaSource = z.output<typeof zMediaSource>;

/** The current releasing status of the media */
export const zMediaStatus = z.enum(["CANCELLED", "FINISHED", "HIATUS", "NOT_YET_RELEASED", "RELEASING"]);
/** The current releasing status of the media */
export type MediaStatus = z.output<typeof zMediaStatus>;

/** Media trend sort enums */
export const zMediaTrendSort = z.enum(["DATE", "DATE_DESC", "EPISODE", "EPISODE_DESC", "ID", "ID_DESC", "MEDIA_ID", "MEDIA_ID_DESC", "POPULARITY", "POPULARITY_DESC", "SCORE", "SCORE_DESC", "TRENDING", "TRENDING_DESC"]);
/** Media trend sort enums */
export type MediaTrendSort = z.output<typeof zMediaTrendSort>;

/** Media type enum, anime or manga. */
export const zMediaType = z.enum(["ANIME", "MANGA"]);
/** Media type enum, anime or manga. */
export type MediaType = z.output<typeof zMediaType>;

export const zModActionType = z.enum(["ANON", "BAN", "DELETE", "EDIT", "EXPIRE", "NOTE", "REPORT", "RESET"]);
export type ModActionType = z.output<typeof zModActionType>;

/** Mod role enums */
export const zModRole = z.enum(["ADMIN", "ANIME_DATA", "CHARACTER_DATA", "COMMUNITY", "DEVELOPER", "DISCORD_COMMUNITY", "LEAD_ANIME_DATA", "LEAD_COMMUNITY", "LEAD_DEVELOPER", "LEAD_MANGA_DATA", "LEAD_SOCIAL_MEDIA", "MANGA_DATA", "RETIRED", "SOCIAL_MEDIA", "STAFF_DATA"]);
/** Mod role enums */
export type ModRole = z.output<typeof zModRole>;

/** Notification type enum */
export const zNotificationType = z.enum(["ACTIVITY_LIKE", "ACTIVITY_MENTION", "ACTIVITY_MESSAGE", "ACTIVITY_REPLY", "ACTIVITY_REPLY_LIKE", "ACTIVITY_REPLY_SUBSCRIBED", "AIRING", "CHARACTER_SUBMISSION_UPDATE", "FOLLOWING", "MEDIA_DATA_CHANGE", "MEDIA_DELETION", "MEDIA_MERGE", "MEDIA_SUBMISSION_UPDATE", "RELATED_MEDIA_ADDITION", "STAFF_SUBMISSION_UPDATE", "THREAD_COMMENT_LIKE", "THREAD_COMMENT_MENTION", "THREAD_COMMENT_REPLY", "THREAD_LIKE", "THREAD_SUBSCRIBED"]);
/** Notification type enum */
export type NotificationType = z.output<typeof zNotificationType>;

/** Recommendation rating enums */
export const zRecommendationRating = z.enum(["NO_RATING", "RATE_DOWN", "RATE_UP"]);
/** Recommendation rating enums */
export type RecommendationRating = z.output<typeof zRecommendationRating>;

/** Recommendation sort enums */
export const zRecommendationSort = z.enum(["ID", "ID_DESC", "RATING", "RATING_DESC"]);
/** Recommendation sort enums */
export type RecommendationSort = z.output<typeof zRecommendationSort>;

/** Review rating enums */
export const zReviewRating = z.enum(["DOWN_VOTE", "NO_VOTE", "UP_VOTE"]);
/** Review rating enums */
export type ReviewRating = z.output<typeof zReviewRating>;

/** Review sort enums */
export const zReviewSort = z.enum(["CREATED_AT", "CREATED_AT_DESC", "ID", "ID_DESC", "RATING", "RATING_DESC", "SCORE", "SCORE_DESC", "UPDATED_AT", "UPDATED_AT_DESC"]);
/** Review sort enums */
export type ReviewSort = z.output<typeof zReviewSort>;

/** Revision history actions */
export const zRevisionHistoryAction = z.enum(["CREATE", "EDIT"]);
/** Revision history actions */
export type RevisionHistoryAction = z.output<typeof zRevisionHistoryAction>;

/** Media list scoring type */
export const zScoreFormat = z.enum(["POINT_3", "POINT_5", "POINT_10", "POINT_10_DECIMAL", "POINT_100"]);
/** Media list scoring type */
export type ScoreFormat = z.output<typeof zScoreFormat>;

/** Site trend sort enums */
export const zSiteTrendSort = z.enum(["CHANGE", "CHANGE_DESC", "COUNT", "COUNT_DESC", "DATE", "DATE_DESC"]);
/** Site trend sort enums */
export type SiteTrendSort = z.output<typeof zSiteTrendSort>;

/** The primary language of the voice actor */
export const zStaffLanguage = z.enum(["ENGLISH", "FRENCH", "GERMAN", "HEBREW", "HUNGARIAN", "ITALIAN", "JAPANESE", "KOREAN", "PORTUGUESE", "SPANISH"]);
/** The primary language of the voice actor */
export type StaffLanguage = z.output<typeof zStaffLanguage>;

/** Staff sort enums */
export const zStaffSort = z.enum(["FAVOURITES", "FAVOURITES_DESC", "ID", "ID_DESC", "LANGUAGE", "LANGUAGE_DESC", "RELEVANCE", "ROLE", "ROLE_DESC", "SEARCH_MATCH"]);
/** Staff sort enums */
export type StaffSort = z.output<typeof zStaffSort>;

/** Studio sort enums */
export const zStudioSort = z.enum(["FAVOURITES", "FAVOURITES_DESC", "ID", "ID_DESC", "NAME", "NAME_DESC", "SEARCH_MATCH"]);
/** Studio sort enums */
export type StudioSort = z.output<typeof zStudioSort>;

/** Submission sort enums */
export const zSubmissionSort = z.enum(["ID", "ID_DESC"]);
/** Submission sort enums */
export type SubmissionSort = z.output<typeof zSubmissionSort>;

/** Submission status */
export const zSubmissionStatus = z.enum(["ACCEPTED", "PARTIALLY_ACCEPTED", "PENDING", "REJECTED"]);
/** Submission status */
export type SubmissionStatus = z.output<typeof zSubmissionStatus>;

/** Thread comments sort enums */
export const zThreadCommentSort = z.enum(["ID", "ID_DESC"]);
/** Thread comments sort enums */
export type ThreadCommentSort = z.output<typeof zThreadCommentSort>;

/** Thread sort enums */
export const zThreadSort = z.enum(["CREATED_AT", "CREATED_AT_DESC", "ID", "ID_DESC", "IS_STICKY", "REPLIED_AT", "REPLIED_AT_DESC", "REPLY_COUNT", "REPLY_COUNT_DESC", "SEARCH_MATCH", "TITLE", "TITLE_DESC", "UPDATED_AT", "UPDATED_AT_DESC", "VIEW_COUNT", "VIEW_COUNT_DESC"]);
/** Thread sort enums */
export type ThreadSort = z.output<typeof zThreadSort>;

/** User's account privacy setting */
export const zUserPrivacy = z.enum(["PRIVATE", "PUBLIC", "SEMI_PUBLIC"]);
/** User's account privacy setting */
export type UserPrivacy = z.output<typeof zUserPrivacy>;

/** User sort enums */
export const zUserSort = z.enum(["CHAPTERS_READ", "CHAPTERS_READ_DESC", "ID", "ID_DESC", "SEARCH_MATCH", "USERNAME", "USERNAME_DESC", "WATCHED_TIME", "WATCHED_TIME_DESC"]);
/** User sort enums */
export type UserSort = z.output<typeof zUserSort>;

/** The language the user wants to see staff and character names in */
export const zUserStaffNameLanguage = z.enum(["NATIVE", "ROMAJI", "ROMAJI_WESTERN"]);
/** The language the user wants to see staff and character names in */
export type UserStaffNameLanguage = z.output<typeof zUserStaffNameLanguage>;

/** User statistics sort enum */
export const zUserStatisticsSort = z.enum(["COUNT", "COUNT_DESC", "ID", "ID_DESC", "MEAN_SCORE", "MEAN_SCORE_DESC", "PROGRESS", "PROGRESS_DESC"]);
/** User statistics sort enum */
export type UserStatisticsSort = z.output<typeof zUserStatisticsSort>;

/** The language the user wants to see media titles in */
export const zUserTitleLanguage = z.enum(["ENGLISH", "ENGLISH_STYLISED", "NATIVE", "NATIVE_STYLISED", "ROMAJI", "ROMAJI_STYLISED"]);
/** The language the user wants to see media titles in */
export type UserTitleLanguage = z.output<typeof zUserTitleLanguage>;

export const zAiringScheduleInput = z.strictObject({
	airingAt: z.int32().nullish(),
	episode: z.int32().nullish(),
	timeUntilAiring: z.int32().nullish(),
});
export type AiringScheduleInput = z.output<typeof zAiringScheduleInput>;

export const zAniChartHighlightInput = z.strictObject({
	highlight: z.string().nullish(),
	mediaId: z.int32().nullish(),
});
export type AniChartHighlightInput = z.output<typeof zAniChartHighlightInput>;

/** The names of the character */
export const zCharacterNameInput = z.strictObject({
	/** Other names the character might be referred by */
	alternative: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Other names the character might be referred to as but are spoilers */
	alternativeSpoiler: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** The character's given name */
	first: z.string().nullish(),
	/** The character's surname */
	last: z.string().nullish(),
	/** The character's middle name */
	middle: z.string().nullish(),
	/** The character's full name in their native language */
	native: z.string().nullish(),
});
/** The names of the character */
export type CharacterNameInput = z.output<typeof zCharacterNameInput>;

/** Date object that allows for incomplete date values (fuzzy) */
export const zFuzzyDateInput = z.strictObject({
	/** Numeric Day (24) */
	day: z.int32().nullish(),
	/** Numeric Month (3) */
	month: z.int32().nullish(),
	/** Numeric Year (2017) */
	year: z.int32().nullish(),
});
/** Date object that allows for incomplete date values (fuzzy) */
export type FuzzyDateInput = z.output<typeof zFuzzyDateInput>;

export const zListActivityOptionInput = z.strictObject({
	disabled: z.boolean().nullish(),
	type: zMediaListStatus.nullish(),
});
export type ListActivityOptionInput = z.output<typeof zListActivityOptionInput>;

/** An external link to another site related to the media */
export const zMediaExternalLinkInput = z.strictObject({
	/** The id of the external link */
	id: z.int32(),
	/** The site location of the external link */
	site: z.string(),
	/** The url of the external link */
	url: z.string(),
});
/** An external link to another site related to the media */
export type MediaExternalLinkInput = z.output<typeof zMediaExternalLinkInput>;

/** A user's list options for anime or manga lists */
export const zMediaListOptionsInput = z.strictObject({
	/** The names of the user's advanced scoring sections */
	advancedScoring: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** If advanced scoring is enabled */
	advancedScoringEnabled: z.boolean().nullish(),
	/** The names of the user's custom lists */
	customLists: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** The order each list should be displayed in */
	sectionOrder: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** If the completed sections of the list should be separated by format */
	splitCompletedSectionByFormat: z.boolean().nullish(),
	/** list theme */
	theme: z.string().nullish(),
});
/** A user's list options for anime or manga lists */
export type MediaListOptionsInput = z.output<typeof zMediaListOptionsInput>;

/** The official titles of the media in various languages */
export const zMediaTitleInput = z.strictObject({
	/** The official english title */
	english: z.string().nullish(),
	/** Official title in it's native language */
	native: z.string().nullish(),
	/** The romanization of the native language title */
	romaji: z.string().nullish(),
});
/** The official titles of the media in various languages */
export type MediaTitleInput = z.output<typeof zMediaTitleInput>;

/** Notification option input */
export const zNotificationOptionInput = z.strictObject({
	/** Whether this type of notification is enabled */
	enabled: z.boolean().nullish(),
	/** The type of notification */
	type: zNotificationType.nullish(),
});
/** Notification option input */
export type NotificationOptionInput = z.output<typeof zNotificationOptionInput>;

/** The names of the staff member */
export const zStaffNameInput = z.strictObject({
	/** Other names the character might be referred by */
	alternative: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** The person's given name */
	first: z.string().nullish(),
	/** The person's surname */
	last: z.string().nullish(),
	/** The person's middle name */
	middle: z.string().nullish(),
	/** The person's full name in their native language */
	native: z.string().nullish(),
});
/** The names of the staff member */
export type StaffNameInput = z.output<typeof zStaffNameInput>;

export const zActivityReplyTextArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type ActivityReplyTextArgs = z.output<typeof zActivityReplyTextArgs>;

export const zCharacterDescriptionArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type CharacterDescriptionArgs = z.output<typeof zCharacterDescriptionArgs>;

export const zCharacterMediaArgs = z.object({
	onList: z.boolean().nullish(),
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
	type: zMediaType.nullish(),
});
export type CharacterMediaArgs = z.output<typeof zCharacterMediaArgs>;

export const zCharacterEdgeVoiceActorRolesArgs = z.object({
	language: zStaffLanguage.nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type CharacterEdgeVoiceActorRolesArgs = z.output<typeof zCharacterEdgeVoiceActorRolesArgs>;

export const zCharacterEdgeVoiceActorsArgs = z.object({
	language: zStaffLanguage.nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type CharacterEdgeVoiceActorsArgs = z.output<typeof zCharacterEdgeVoiceActorsArgs>;

export const zFavouritesAnimeArgs = z.object({
	/** The page number */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
});
export type FavouritesAnimeArgs = z.output<typeof zFavouritesAnimeArgs>;

export const zFavouritesCharactersArgs = z.object({
	/** The page number */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
});
export type FavouritesCharactersArgs = z.output<typeof zFavouritesCharactersArgs>;

export const zFavouritesMangaArgs = z.object({
	/** The page number */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
});
export type FavouritesMangaArgs = z.output<typeof zFavouritesMangaArgs>;

export const zFavouritesStaffArgs = z.object({
	/** The page number */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
});
export type FavouritesStaffArgs = z.output<typeof zFavouritesStaffArgs>;

export const zFavouritesStudiosArgs = z.object({
	/** The page number */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
});
export type FavouritesStudiosArgs = z.output<typeof zFavouritesStudiosArgs>;

export const zInternalPageActivitiesArgs = z.object({
	/** Filter by the time the activity was created */
	createdAt: z.int32().nullish(),
	/** Filter by the time the activity was created */
	createdAt_greater: z.int32().nullish(),
	/** Filter by the time the activity was created */
	createdAt_lesser: z.int32().nullish(),
	/** Filter activity to only activity with replies */
	hasReplies: z.boolean().nullish(),
	/** Filter activity to only activity with replies or is of type text */
	hasRepliesOrTypeText: z.boolean().nullish(),
	/** Filter by the activity id */
	id: z.int32().nullish(),
	/** Filter by the activity id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the activity id */
	id_not: z.int32().nullish(),
	/** Filter by the activity id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter activity to users who are being followed by the authenticated user */
	isFollowing: z.boolean().nullish(),
	/** Filter by the associated media id of the activity */
	mediaId: z.int32().nullish(),
	/** Filter by the associated media id of the activity (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the associated media id of the activity */
	mediaId_not: z.int32().nullish(),
	/** Filter by the associated media id of the activity (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the user who sent a message */
	messengerId: z.int32().nullish(),
	/** Filter by the id of the user who sent a message (max 10,000 items) */
	messengerId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the user who sent a message */
	messengerId_not: z.int32().nullish(),
	/** Filter by the id of the user who sent a message (max 10,000 items) */
	messengerId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zActivitySort> | null | undefined>()), z.custom<z.input<typeof zActivitySort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivitySort.nullish())).nullish(),
	/** Filter by the type of activity */
	type: zActivityType.nullish(),
	/** Filter by the type of activity (max 10,000 items) */
	type_in: z.union([z.array(z.custom<z.input<typeof zActivityType> | null | undefined>()), z.custom<z.input<typeof zActivityType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivityType.nullish())).nullish(),
	/** Filter by the type of activity */
	type_not: zActivityType.nullish(),
	/** Filter by the type of activity (max 10,000 items) */
	type_not_in: z.union([z.array(z.custom<z.input<typeof zActivityType> | null | undefined>()), z.custom<z.input<typeof zActivityType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivityType.nullish())).nullish(),
	/** Filter by the owner user id */
	userId: z.int32().nullish(),
	/** Filter by the owner user id (max 10,000 items) */
	userId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the owner user id */
	userId_not: z.int32().nullish(),
	/** Filter by the owner user id (max 10,000 items) */
	userId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
});
export type InternalPageActivitiesArgs = z.output<typeof zInternalPageActivitiesArgs>;

export const zInternalPageActivityRepliesArgs = z.object({
	/** Filter by the parent id */
	activityId: z.int32().nullish(),
	/** Filter by the reply id */
	id: z.int32().nullish(),
});
export type InternalPageActivityRepliesArgs = z.output<typeof zInternalPageActivityRepliesArgs>;

export const zInternalPageAiringSchedulesArgs = z.object({
	/** Filter by the time of airing */
	airingAt: z.int32().nullish(),
	/** Filter by the time of airing */
	airingAt_greater: z.int32().nullish(),
	/** Filter by the time of airing */
	airingAt_lesser: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode_greater: z.int32().nullish(),
	/** Filter by the airing episode number (max 10,000 items) */
	episode_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the airing episode number */
	episode_lesser: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode_not: z.int32().nullish(),
	/** Filter by the airing episode number (max 10,000 items) */
	episode_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the airing schedule item */
	id: z.int32().nullish(),
	/** Filter by the id of the airing schedule item (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the airing schedule item */
	id_not: z.int32().nullish(),
	/** Filter by the id of the airing schedule item (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of associated media */
	mediaId: z.int32().nullish(),
	/** Filter by the id of associated media (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of associated media */
	mediaId_not: z.int32().nullish(),
	/** Filter by the id of associated media (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter to episodes that haven't yet aired */
	notYetAired: z.boolean().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zAiringSort> | null | undefined>()), z.custom<z.input<typeof zAiringSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zAiringSort.nullish())).nullish(),
});
export type InternalPageAiringSchedulesArgs = z.output<typeof zInternalPageAiringSchedulesArgs>;

export const zInternalPageCharacterSubmissionsArgs = z.object({
	assigneeId: z.int32().nullish(),
	characterId: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zSubmissionSort> | null | undefined>()), z.custom<z.input<typeof zSubmissionSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSubmissionSort.nullish())).nullish(),
	/** Filter by the status of the submission */
	status: zSubmissionStatus.nullish(),
	/** Filter by the submitter of the submission */
	userId: z.int32().nullish(),
});
export type InternalPageCharacterSubmissionsArgs = z.output<typeof zInternalPageCharacterSubmissionsArgs>;

export const zInternalPageCharactersArgs = z.object({
	/** Filter by character id */
	id: z.int32().nullish(),
	/** Filter by character id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by character id */
	id_not: z.int32().nullish(),
	/** Filter by character id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by character by if its their birthday today */
	isBirthday: z.boolean().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zCharacterSort> | null | undefined>()), z.custom<z.input<typeof zCharacterSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zCharacterSort.nullish())).nullish(),
});
export type InternalPageCharactersArgs = z.output<typeof zInternalPageCharactersArgs>;

export const zInternalPageFollowersArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id of the follower/followed */
	userId: z.int32(),
});
export type InternalPageFollowersArgs = z.output<typeof zInternalPageFollowersArgs>;

export const zInternalPageFollowingArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id of the follower/followed */
	userId: z.int32(),
});
export type InternalPageFollowingArgs = z.output<typeof zInternalPageFollowingArgs>;

export const zInternalPageLikesArgs = z.object({
	/** The id of the likeable type */
	likeableId: z.int32().nullish(),
	/** The type of model the id applies to */
	type: zLikeableType.nullish(),
});
export type InternalPageLikesArgs = z.output<typeof zInternalPageLikesArgs>;

export const zInternalPageMediaArgs = z.object({
	/** Filter by the media's average score */
	averageScore: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_greater: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_not: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters_greater: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters_lesser: z.int32().nullish(),
	/** Filter by the media's country of origin */
	countryOfOrigin: scalarSchemas.CountryCode.nullish(),
	/** Filter by the media's country of origin (max 10,000 items) */
	countryOfOrigin_in: z.union([z.array(z.custom<z.input<typeof scalarSchemas.CountryCode> | null | undefined>()), z.custom<z.input<typeof scalarSchemas.CountryCode>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(scalarSchemas.CountryCode.nullish())).nullish(),
	/** Filter by the media's country of origin (max 10,000 items) */
	countryOfOrigin_not_in: z.union([z.array(z.custom<z.input<typeof scalarSchemas.CountryCode> | null | undefined>()), z.custom<z.input<typeof scalarSchemas.CountryCode>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(scalarSchemas.CountryCode.nullish())).nullish(),
	/** Filter by the media's episode length */
	duration: z.int32().nullish(),
	/** Filter by the media's episode length */
	duration_greater: z.int32().nullish(),
	/** Filter by the media's episode length */
	duration_lesser: z.int32().nullish(),
	/** Filter by the end date of the media */
	endDate: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_like: z.string().nullish(),
	/** Filter by amount of episodes the media has */
	episodes: z.int32().nullish(),
	/** Filter by amount of episodes the media has */
	episodes_greater: z.int32().nullish(),
	/** Filter by amount of episodes the media has */
	episodes_lesser: z.int32().nullish(),
	/** Filter by the media's format */
	format: zMediaFormat.nullish(),
	/** Filter by the media's format (max 10,000 items) */
	format_in: z.union([z.array(z.custom<z.input<typeof zMediaFormat> | null | undefined>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat.nullish())).nullish(),
	/** Filter by the media's format */
	format_not: zMediaFormat.nullish(),
	/** Filter by the media's format (max 10,000 items) */
	format_not_in: z.union([z.array(z.custom<z.input<typeof zMediaFormat> | null | undefined>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat.nullish())).nullish(),
	/** Filter by the media's genres */
	genre: z.string().nullish(),
	/** Filter by the media's genres (max 10,000 items) */
	genre_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's genres (max 10,000 items) */
	genre_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media id */
	id: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id */
	idMal: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id (max 10,000 items) */
	idMal_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media's MyAnimeList id */
	idMal_not: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id (max 10,000 items) */
	idMal_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id */
	id_not: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by if the media's intended for 18+ adult audiences */
	isAdult: z.boolean().nullish(),
	/** If the media is officially licensed or a self-published doujin release */
	isLicensed: z.boolean().nullish(),
	/** Filter media by sites name with a online streaming or reading license */
	licensedBy: z.string().nullish(),
	/** Filter media by sites id with a online streaming or reading license */
	licensedById: z.int32().nullish(),
	/** Filter media by sites id with a online streaming or reading license (max 10,000 items) */
	licensedById_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter media by sites name with a online streaming or reading license (max 10,000 items) */
	licensedBy_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Only apply the tags filter argument to tags above this rank. Default: 18 */
	minimumTagRank: z.int32().nullish(),
	/** Filter by the media on the authenticated user's lists */
	onList: z.boolean().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_greater: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_lesser: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_not: z.int32().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** Filter by the season the media was released in */
	season: zMediaSeason.nullish(),
	/** The year of the season (Winter 2017 would also include December 2016 releases). Requires season argument */
	seasonYear: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
	/** Filter by the source type of the media */
	source: zMediaSource.nullish(),
	/** Filter by the source type of the media (max 10,000 items) */
	source_in: z.union([z.array(z.custom<z.input<typeof zMediaSource> | null | undefined>()), z.custom<z.input<typeof zMediaSource>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSource.nullish())).nullish(),
	/** Filter by the start date of the media */
	startDate: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_like: z.string().nullish(),
	/** Filter by the media's current release status */
	status: zMediaStatus.nullish(),
	/** Filter by the media's current release status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaStatus> | null | undefined>()), z.custom<z.input<typeof zMediaStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaStatus.nullish())).nullish(),
	/** Filter by the media's current release status */
	status_not: zMediaStatus.nullish(),
	/** Filter by the media's current release status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaStatus> | null | undefined>()), z.custom<z.input<typeof zMediaStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaStatus.nullish())).nullish(),
	/** Filter by the media's tags */
	tag: z.string().nullish(),
	/** Filter by the media's tags with in a tag category */
	tagCategory: z.string().nullish(),
	/** Filter by the media's tags with in a tag category (max 10,000 items) */
	tagCategory_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags with in a tag category (max 10,000 items) */
	tagCategory_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags (max 10,000 items) */
	tag_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags (max 10,000 items) */
	tag_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's type */
	type: zMediaType.nullish(),
	/** Filter by the media's volume count */
	volumes: z.int32().nullish(),
	/** Filter by the media's volume count */
	volumes_greater: z.int32().nullish(),
	/** Filter by the media's volume count */
	volumes_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_greater: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_not: z.int32().nullish(),
});
export type InternalPageMediaArgs = z.output<typeof zInternalPageMediaArgs>;

export const zInternalPageMediaListArgs = z.object({
	/** Limit to only entries also on the auth user's list. Requires user id or name arguments. */
	compareWithAuthList: z.boolean().nullish(),
	/** Filter by the date the user completed the media */
	completedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_like: z.string().nullish(),
	/** Filter by a list entry's id */
	id: z.int32().nullish(),
	/** Filter list entries to users who are being followed by the authenticated user */
	isFollowing: z.boolean().nullish(),
	/** Filter by the media id of the list entry */
	mediaId: z.int32().nullish(),
	/** Filter by the media id of the list entry (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id of the list entry (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by note words and #tags */
	notes: z.string().nullish(),
	/** Filter by note words and #tags */
	notes_like: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaListSort> | null | undefined>()), z.custom<z.input<typeof zMediaListSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListSort.nullish())).nullish(),
	/** Filter by the date the user started the media */
	startedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_like: z.string().nullish(),
	/** Filter by the watching/reading status */
	status: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the watching/reading status */
	status_not: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the list entries media type */
	type: zMediaType.nullish(),
	/** Filter by a user's id */
	userId: z.int32().nullish(),
	/** Filter by a user's id (max 10,000 items) */
	userId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by a user's name */
	userName: z.string().nullish(),
});
export type InternalPageMediaListArgs = z.output<typeof zInternalPageMediaListArgs>;

export const zInternalPageMediaSubmissionsArgs = z.object({
	assigneeId: z.int32().nullish(),
	mediaId: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zSubmissionSort> | null | undefined>()), z.custom<z.input<typeof zSubmissionSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSubmissionSort.nullish())).nullish(),
	status: zSubmissionStatus.nullish(),
	submissionId: z.int32().nullish(),
	/** Filter by the media's type */
	type: zMediaType.nullish(),
	userId: z.int32().nullish(),
});
export type InternalPageMediaSubmissionsArgs = z.output<typeof zInternalPageMediaSubmissionsArgs>;

export const zInternalPageMediaTrendsArgs = z.object({
	/** Filter by score */
	averageScore: z.int32().nullish(),
	/** Filter by score */
	averageScore_greater: z.int32().nullish(),
	/** Filter by score */
	averageScore_lesser: z.int32().nullish(),
	/** Filter by score */
	averageScore_not: z.int32().nullish(),
	/** Filter by date */
	date: z.int32().nullish(),
	/** Filter by date */
	date_greater: z.int32().nullish(),
	/** Filter by date */
	date_lesser: z.int32().nullish(),
	/** Filter by episode number */
	episode: z.int32().nullish(),
	/** Filter by episode number */
	episode_greater: z.int32().nullish(),
	/** Filter by episode number */
	episode_lesser: z.int32().nullish(),
	/** Filter by episode number */
	episode_not: z.int32().nullish(),
	/** Filter by the media id */
	mediaId: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id */
	mediaId_not: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by popularity */
	popularity: z.int32().nullish(),
	/** Filter by popularity */
	popularity_greater: z.int32().nullish(),
	/** Filter by popularity */
	popularity_lesser: z.int32().nullish(),
	/** Filter by popularity */
	popularity_not: z.int32().nullish(),
	/** Filter to stats recorded while the media was releasing */
	releasing: z.boolean().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaTrendSort> | null | undefined>()), z.custom<z.input<typeof zMediaTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaTrendSort.nullish())).nullish(),
	/** Filter by trending amount */
	trending: z.int32().nullish(),
	/** Filter by trending amount */
	trending_greater: z.int32().nullish(),
	/** Filter by trending amount */
	trending_lesser: z.int32().nullish(),
	/** Filter by trending amount */
	trending_not: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_greater: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_lesser: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_not: z.int32().nullish(),
});
export type InternalPageMediaTrendsArgs = z.output<typeof zInternalPageMediaTrendsArgs>;

export const zInternalPageModActionsArgs = z.object({
	modId: z.int32().nullish(),
	/** (max 10,000 items) */
	modId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	modId_not: z.int32().nullish(),
	/** (max 10,000 items) */
	modId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	userId: z.int32().nullish(),
});
export type InternalPageModActionsArgs = z.output<typeof zInternalPageModActionsArgs>;

export const zInternalPageMutualFollowersArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id to fetch mutual followers for */
	userId: z.int32(),
});
export type InternalPageMutualFollowersArgs = z.output<typeof zInternalPageMutualFollowersArgs>;

export const zInternalPageNotificationsArgs = z.object({
	/** Reset the unread notification count to 0 on load */
	resetNotificationCount: z.boolean().nullish(),
	/** Filter by the type of notifications */
	type: zNotificationType.nullish(),
	/** Filter by the type of notifications (max 10,000 items) */
	type_in: z.union([z.array(z.custom<z.input<typeof zNotificationType> | null | undefined>()), z.custom<z.input<typeof zNotificationType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zNotificationType.nullish())).nullish(),
});
export type InternalPageNotificationsArgs = z.output<typeof zInternalPageNotificationsArgs>;

export const zInternalPageRecentlyRepliedActivitiesArgs = z.object({
	/** Filter by the owner user id */
	userId: z.int32().nullish(),
});
export type InternalPageRecentlyRepliedActivitiesArgs = z.output<typeof zInternalPageRecentlyRepliedActivitiesArgs>;

export const zInternalPageRecommendationsArgs = z.object({
	/** Filter by recommendation id */
	id: z.int32().nullish(),
	/** Filter by media id */
	mediaId: z.int32().nullish(),
	/** Filter by media recommendation id */
	mediaRecommendationId: z.int32().nullish(),
	/** Filter by the media on the authenticated user's lists */
	onList: z.boolean().nullish(),
	/** Filter by total rating of the recommendation */
	rating: z.int32().nullish(),
	/** Filter by total rating of the recommendation */
	rating_greater: z.int32().nullish(),
	/** Filter by total rating of the recommendation */
	rating_lesser: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zRecommendationSort> | null | undefined>()), z.custom<z.input<typeof zRecommendationSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zRecommendationSort.nullish())).nullish(),
	/** Filter by user who created the recommendation */
	userId: z.int32().nullish(),
});
export type InternalPageRecommendationsArgs = z.output<typeof zInternalPageRecommendationsArgs>;

export const zInternalPageReportsArgs = z.object({
	reportedId: z.int32().nullish(),
	reporterId: z.int32().nullish(),
});
export type InternalPageReportsArgs = z.output<typeof zInternalPageReportsArgs>;

export const zInternalPageReviewsArgs = z.object({
	/** Filter by Review id */
	id: z.int32().nullish(),
	/** Filter by media id */
	mediaId: z.int32().nullish(),
	/** Filter by media type */
	mediaType: zMediaType.nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zReviewSort> | null | undefined>()), z.custom<z.input<typeof zReviewSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zReviewSort.nullish())).nullish(),
	/** Filter by user id */
	userId: z.int32().nullish(),
});
export type InternalPageReviewsArgs = z.output<typeof zInternalPageReviewsArgs>;

export const zInternalPageRevisionHistoryArgs = z.object({
	/** Filter by the character id */
	characterId: z.int32().nullish(),
	/** Filter by the media id */
	mediaId: z.int32().nullish(),
	/** Filter by the staff id */
	staffId: z.int32().nullish(),
	/** Filter by the studio id */
	studioId: z.int32().nullish(),
	/** Filter by the user id */
	userId: z.int32().nullish(),
});
export type InternalPageRevisionHistoryArgs = z.output<typeof zInternalPageRevisionHistoryArgs>;

export const zInternalPageStaffArgs = z.object({
	/** Filter by the staff id */
	id: z.int32().nullish(),
	/** Filter by the staff id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the staff id */
	id_not: z.int32().nullish(),
	/** Filter by the staff id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by staff by if its their birthday today */
	isBirthday: z.boolean().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type InternalPageStaffArgs = z.output<typeof zInternalPageStaffArgs>;

export const zInternalPageStaffSubmissionsArgs = z.object({
	assigneeId: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zSubmissionSort> | null | undefined>()), z.custom<z.input<typeof zSubmissionSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSubmissionSort.nullish())).nullish(),
	staffId: z.int32().nullish(),
	/** Filter by the status of the submission */
	status: zSubmissionStatus.nullish(),
	/** Filter by the submitter of the submission */
	userId: z.int32().nullish(),
});
export type InternalPageStaffSubmissionsArgs = z.output<typeof zInternalPageStaffSubmissionsArgs>;

export const zInternalPageStudiosArgs = z.object({
	/** Filter by the studio id */
	id: z.int32().nullish(),
	/** Filter by the studio id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the studio id */
	id_not: z.int32().nullish(),
	/** Filter by the studio id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zStudioSort> | null | undefined>()), z.custom<z.input<typeof zStudioSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStudioSort.nullish())).nullish(),
});
export type InternalPageStudiosArgs = z.output<typeof zInternalPageStudiosArgs>;

export const zInternalPageThreadCommentsArgs = z.object({
	/** Filter by the comment id */
	id: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zThreadCommentSort> | null | undefined>()), z.custom<z.input<typeof zThreadCommentSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zThreadCommentSort.nullish())).nullish(),
	/** Filter by the thread id */
	threadId: z.int32().nullish(),
	/** Filter by the user id of the comment's creator */
	userId: z.int32().nullish(),
});
export type InternalPageThreadCommentsArgs = z.output<typeof zInternalPageThreadCommentsArgs>;

export const zInternalPageThreadsArgs = z.object({
	/** Filter by thread category id */
	categoryId: z.int32().nullish(),
	/** Filter by the thread id */
	id: z.int32().nullish(),
	/** Filter by the thread id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by thread media id category */
	mediaCategoryId: z.int32().nullish(),
	/** Filter by the user id of the last user to comment on the thread */
	replyUserId: z.int32().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zThreadSort> | null | undefined>()), z.custom<z.input<typeof zThreadSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zThreadSort.nullish())).nullish(),
	/** Filter by if the currently authenticated user's subscribed threads */
	subscribed: z.boolean().nullish(),
	/** Filter by the user id of the thread's creator */
	userId: z.int32().nullish(),
});
export type InternalPageThreadsArgs = z.output<typeof zInternalPageThreadsArgs>;

export const zInternalPageUserBlockSearchArgs = z.object({
	/** Filter by search query */
	search: z.string().nullish(),
});
export type InternalPageUserBlockSearchArgs = z.output<typeof zInternalPageUserBlockSearchArgs>;

export const zInternalPageUsersArgs = z.object({
	/** Filter by the user id */
	id: z.int32().nullish(),
	/** Filter to moderators only if true */
	isModerator: z.boolean().nullish(),
	/** Filter by the name of the user */
	name: z.string().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
});
export type InternalPageUsersArgs = z.output<typeof zInternalPageUsersArgs>;

export const zMediaAiringScheduleArgs = z.object({
	/** Filter to episodes that have not yet aired */
	notYetAired: z.boolean().nullish(),
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
});
export type MediaAiringScheduleArgs = z.output<typeof zMediaAiringScheduleArgs>;

export const zMediaCharactersArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	role: zCharacterRole.nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zCharacterSort> | null | undefined>()), z.custom<z.input<typeof zCharacterSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zCharacterSort.nullish())).nullish(),
});
export type MediaCharactersArgs = z.output<typeof zMediaCharactersArgs>;

export const zMediaDescriptionArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type MediaDescriptionArgs = z.output<typeof zMediaDescriptionArgs>;

export const zMediaRecommendationsArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zRecommendationSort> | null | undefined>()), z.custom<z.input<typeof zRecommendationSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zRecommendationSort.nullish())).nullish(),
});
export type MediaRecommendationsArgs = z.output<typeof zMediaRecommendationsArgs>;

export const zMediaReviewsArgs = z.object({
	limit: z.int32().nullish(),
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zReviewSort> | null | undefined>()), z.custom<z.input<typeof zReviewSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zReviewSort.nullish())).nullish(),
});
export type MediaReviewsArgs = z.output<typeof zMediaReviewsArgs>;

export const zMediaSourceArgs = z.object({
	/** Provide 2 or 3 to use new version 2 or 3 of sources enum */
	version: z.int32().nullish(),
});
export type MediaSourceArgs = z.output<typeof zMediaSourceArgs>;

export const zMediaStaffArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type MediaStaffArgs = z.output<typeof zMediaStaffArgs>;

export const zMediaStatusArgs = z.object({
	/** Provide 2 to use new version 2 of sources enum */
	version: z.int32().nullish(),
});
export type MediaStatusArgs = z.output<typeof zMediaStatusArgs>;

export const zMediaStudiosArgs = z.object({
	isMain: z.boolean().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zStudioSort> | null | undefined>()), z.custom<z.input<typeof zStudioSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStudioSort.nullish())).nullish(),
});
export type MediaStudiosArgs = z.output<typeof zMediaStudiosArgs>;

export const zMediaTrendsArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	/** Filter to stats recorded while the media was releasing */
	releasing: z.boolean().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zMediaTrendSort> | null | undefined>()), z.custom<z.input<typeof zMediaTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaTrendSort.nullish())).nullish(),
});
export type MediaTrendsArgs = z.output<typeof zMediaTrendsArgs>;

export const zMediaEdgeRelationTypeArgs = z.object({
	/** Provide 3 to use new version 3 of relation enum */
	version: z.int32().nullish(),
});
export type MediaEdgeRelationTypeArgs = z.output<typeof zMediaEdgeRelationTypeArgs>;

export const zMediaEdgeVoiceActorRolesArgs = z.object({
	language: zStaffLanguage.nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type MediaEdgeVoiceActorRolesArgs = z.output<typeof zMediaEdgeVoiceActorRolesArgs>;

export const zMediaEdgeVoiceActorsArgs = z.object({
	language: zStaffLanguage.nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type MediaEdgeVoiceActorsArgs = z.output<typeof zMediaEdgeVoiceActorsArgs>;

export const zMediaListCustomListsArgs = z.object({
	/** Change return structure to an array of objects */
	asArray: z.boolean().nullish(),
});
export type MediaListCustomListsArgs = z.output<typeof zMediaListCustomListsArgs>;

export const zMediaListScoreArgs = z.object({
	/** Force the score to be returned in the provided format type. */
	format: zScoreFormat.nullish(),
});
export type MediaListScoreArgs = z.output<typeof zMediaListScoreArgs>;

export const zMediaListCollectionCustomListsArgs = z.object({
	asArray: z.boolean().nullish(),
});
export type MediaListCollectionCustomListsArgs = z.output<typeof zMediaListCollectionCustomListsArgs>;

export const zMediaListCollectionStatusListsArgs = z.object({
	asArray: z.boolean().nullish(),
});
export type MediaListCollectionStatusListsArgs = z.output<typeof zMediaListCollectionStatusListsArgs>;

export const zMediaTitleEnglishArgs = z.object({
	stylised: z.boolean().nullish(),
});
export type MediaTitleEnglishArgs = z.output<typeof zMediaTitleEnglishArgs>;

export const zMediaTitleNativeArgs = z.object({
	stylised: z.boolean().nullish(),
});
export type MediaTitleNativeArgs = z.output<typeof zMediaTitleNativeArgs>;

export const zMediaTitleRomajiArgs = z.object({
	stylised: z.boolean().nullish(),
});
export type MediaTitleRomajiArgs = z.output<typeof zMediaTitleRomajiArgs>;

export const zMessageActivityMessageArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type MessageActivityMessageArgs = z.output<typeof zMessageActivityMessageArgs>;

export const zMutationDeleteActivityArgs = z.object({
	/** The id of the activity to delete */
	id: z.int32().nullish(),
});
export type MutationDeleteActivityArgs = z.output<typeof zMutationDeleteActivityArgs>;

export const zMutationDeleteActivityReplyArgs = z.object({
	/** The id of the reply to delete */
	id: z.int32().nullish(),
});
export type MutationDeleteActivityReplyArgs = z.output<typeof zMutationDeleteActivityReplyArgs>;

export const zMutationDeleteCustomListArgs = z.object({
	/** The name of the custom list to delete */
	customList: z.string().nullish(),
	/** The media list type of the custom list */
	type: zMediaType.nullish(),
});
export type MutationDeleteCustomListArgs = z.output<typeof zMutationDeleteCustomListArgs>;

export const zMutationDeleteFollowerArgs = z.object({
	/** The id of the user to remove the follower status of */
	userId: z.int32().nullish(),
});
export type MutationDeleteFollowerArgs = z.output<typeof zMutationDeleteFollowerArgs>;

export const zMutationDeleteMediaListEntryArgs = z.object({
	/** The id of the media list entry to delete */
	id: z.int32().nullish(),
});
export type MutationDeleteMediaListEntryArgs = z.output<typeof zMutationDeleteMediaListEntryArgs>;

export const zMutationDeleteReviewArgs = z.object({
	/** The id of the review to delete */
	id: z.int32().nullish(),
});
export type MutationDeleteReviewArgs = z.output<typeof zMutationDeleteReviewArgs>;

export const zMutationDeleteThreadArgs = z.object({
	/** The id of the thread to delete */
	id: z.int32().nullish(),
});
export type MutationDeleteThreadArgs = z.output<typeof zMutationDeleteThreadArgs>;

export const zMutationDeleteThreadCommentArgs = z.object({
	/** The id of the thread comment to delete */
	id: z.int32().nullish(),
});
export type MutationDeleteThreadCommentArgs = z.output<typeof zMutationDeleteThreadCommentArgs>;

export const zMutationRateReviewArgs = z.object({
	/** The rating to apply to the review */
	rating: zReviewRating.nullish(),
	/** The id of the review to rate */
	reviewId: z.int32().nullish(),
});
export type MutationRateReviewArgs = z.output<typeof zMutationRateReviewArgs>;

export const zMutationSaveActivityReplyArgs = z.object({
	/** The id of the parent activity being replied to */
	activityId: z.int32().nullish(),
	/** If the reply should be sent from the Moderator account (Mod Only) */
	asMod: z.boolean().nullish(),
	/** The activity reply id, required for updating */
	id: z.int32().nullish(),
	/** The reply text (Min: 2, Max: 8000) */
	text: z.string().nullish(),
});
export type MutationSaveActivityReplyArgs = z.output<typeof zMutationSaveActivityReplyArgs>;

export const zMutationSaveListActivityArgs = z.object({
	/** The activity's id, required for updating */
	id: z.int32().nullish(),
	/** If the activity should be locked. (Mod Only) */
	locked: z.boolean().nullish(),
});
export type MutationSaveListActivityArgs = z.output<typeof zMutationSaveListActivityArgs>;

export const zMutationSaveMediaListEntryArgs = z.object({
	/** Array of advanced scores (Min: 0, Max: 100) */
	advancedScores: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.number().nullish())).nullish(),
	/** When the entry was completed by the user */
	get completedAt() {
		return zFuzzyDateInput.nullish();
	},
	/** Array of custom list names which should be enabled for this entry */
	customLists: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** If the entry shown be hidden from non-custom lists */
	hiddenFromStatusLists: z.boolean().nullish(),
	/** The list entry id, required for updating */
	id: z.int32().nullish(),
	/** The id of the media the entry is of */
	mediaId: z.int32().nullish(),
	/** Text notes (Min: 0, Max: 6000) */
	notes: z.string().nullish(),
	/** Priority of planning (Min: 0, Max: 255) */
	priority: z.int32().nullish(),
	/** If the entry should only be visible to authenticated user */
	private: z.boolean().nullish(),
	/** The amount of episodes/chapters consumed by the user (Min: 0) */
	progress: z.int32().nullish(),
	/** The amount of volumes read by the user (Min: 0) */
	progressVolumes: z.int32().nullish(),
	/** The amount of times the user has rewatched/read the media (Min: 0, Max: 1000) */
	repeat: z.int32().nullish(),
	/** The score of the media in the user's chosen scoring method (Min: 0, Max: 100) */
	score: z.number().nullish(),
	/** The score of the media in 100 point (Min: 0, Max: 100) */
	scoreRaw: z.int32().nullish(),
	/** When the entry was started by the user */
	get startedAt() {
		return zFuzzyDateInput.nullish();
	},
	/** The watching/reading status */
	status: zMediaListStatus.nullish(),
});
export type MutationSaveMediaListEntryArgs = z.output<typeof zMutationSaveMediaListEntryArgs>;

export const zMutationSaveMessageActivityArgs = z.object({
	/** If the message should be sent from the Moderator account (Mod Only) */
	asMod: z.boolean().nullish(),
	/** The activity id, required for updating */
	id: z.int32().nullish(),
	/** If the activity should be locked. (Mod Only) */
	locked: z.boolean().nullish(),
	/** The activity message text (Min: 2, Max: 10000) */
	message: z.string().nullish(),
	/** If the activity should be private */
	private: z.boolean().nullish(),
	/** The id of the user the message is being sent to */
	recipientId: z.int32().nullish(),
});
export type MutationSaveMessageActivityArgs = z.output<typeof zMutationSaveMessageActivityArgs>;

export const zMutationSaveRecommendationArgs = z.object({
	/** The id of the base media */
	mediaId: z.int32().nullish(),
	/** The id of the media to recommend */
	mediaRecommendationId: z.int32().nullish(),
	/** The rating to give the recommendation */
	rating: zRecommendationRating.nullish(),
});
export type MutationSaveRecommendationArgs = z.output<typeof zMutationSaveRecommendationArgs>;

export const zMutationSaveReviewArgs = z.object({
	/** The main review text (Min: 2600) */
	body: z.string().nullish(),
	/** The review id, required for updating */
	id: z.int32().nullish(),
	/** The id of the media the review is of */
	mediaId: z.int32().nullish(),
	/** If the review should only be visible to its creator */
	private: z.boolean().nullish(),
	/** The score of the review (Min: 0, Max: 100) */
	score: z.int32().nullish(),
	/** A short summary/preview of the review (Min: 20, Max: 120) */
	summary: z.string().nullish(),
});
export type MutationSaveReviewArgs = z.output<typeof zMutationSaveReviewArgs>;

export const zMutationSaveTextActivityArgs = z.object({
	/** The activity's id, required for updating */
	id: z.int32().nullish(),
	/** If the activity should be locked. (Mod Only) */
	locked: z.boolean().nullish(),
	/** The activity text (Min: 5, Max: 10000) */
	text: z.string().nullish(),
});
export type MutationSaveTextActivityArgs = z.output<typeof zMutationSaveTextActivityArgs>;

export const zMutationSaveThreadArgs = z.object({
	/** The main text body of the thread (Min: 10, Max: 30000) */
	body: z.string().nullish(),
	/** Forum categories the thread should be within */
	categories: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The thread id, required for updating */
	id: z.int32().nullish(),
	/** If the thread should be locked. (Mod Only) */
	locked: z.boolean().nullish(),
	/** Media related to the contents of the thread */
	mediaCategories: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** If the thread should be stickied. (Mod Only) */
	sticky: z.boolean().nullish(),
	/** The title of the thread (Min: 6, Max: 120) */
	title: z.string().nullish(),
});
export type MutationSaveThreadArgs = z.output<typeof zMutationSaveThreadArgs>;

export const zMutationSaveThreadCommentArgs = z.object({
	/** The comment markdown text (Min: 1, Max: 12000) */
	comment: z.string().nullish(),
	/** The comment id, required for updating */
	id: z.int32().nullish(),
	/** If the comment tree should be locked. (Mod Only) */
	locked: z.boolean().nullish(),
	/** The id of thread comment to reply to */
	parentCommentId: z.int32().nullish(),
	/** The id of thread the comment belongs to */
	threadId: z.int32().nullish(),
});
export type MutationSaveThreadCommentArgs = z.output<typeof zMutationSaveThreadCommentArgs>;

export const zMutationToggleActivityPinArgs = z.object({
	/** Toggle activity id to be pinned */
	id: z.int32().nullish(),
	/** If the activity should be pinned or unpinned */
	pinned: z.boolean().nullish(),
});
export type MutationToggleActivityPinArgs = z.output<typeof zMutationToggleActivityPinArgs>;

export const zMutationToggleActivitySubscriptionArgs = z.object({
	/** The id of the activity to un/subscribe */
	activityId: z.int32().nullish(),
	/** Whether to subscribe or unsubscribe from the activity */
	subscribe: z.boolean().nullish(),
});
export type MutationToggleActivitySubscriptionArgs = z.output<typeof zMutationToggleActivitySubscriptionArgs>;

export const zMutationToggleFavouriteArgs = z.object({
	/** The id of the anime to un/favourite */
	animeId: z.int32().nullish(),
	/** The id of the character to un/favourite */
	characterId: z.int32().nullish(),
	/** The id of the manga to un/favourite */
	mangaId: z.int32().nullish(),
	/** The id of the staff to un/favourite */
	staffId: z.int32().nullish(),
	/** The id of the studio to un/favourite */
	studioId: z.int32().nullish(),
});
export type MutationToggleFavouriteArgs = z.output<typeof zMutationToggleFavouriteArgs>;

export const zMutationToggleFollowArgs = z.object({
	/** The id of the user to un/follow */
	userId: z.int32().nullish(),
});
export type MutationToggleFollowArgs = z.output<typeof zMutationToggleFollowArgs>;

export const zMutationToggleLikeArgs = z.object({
	/** The id of the likeable type */
	id: z.int32().nullish(),
	/** The type of model to be un/liked */
	type: zLikeableType.nullish(),
});
export type MutationToggleLikeArgs = z.output<typeof zMutationToggleLikeArgs>;

export const zMutationToggleLikeV2Args = z.object({
	/** The id of the likeable type */
	id: z.int32().nullish(),
	/** The type of model to be un/liked */
	type: zLikeableType.nullish(),
});
export type MutationToggleLikeV2Args = z.output<typeof zMutationToggleLikeV2Args>;

export const zMutationToggleThreadSubscriptionArgs = z.object({
	/** Whether to subscribe or unsubscribe from the forum thread */
	subscribe: z.boolean().nullish(),
	/** The id of the forum thread to un/subscribe */
	threadId: z.int32().nullish(),
});
export type MutationToggleThreadSubscriptionArgs = z.output<typeof zMutationToggleThreadSubscriptionArgs>;

export const zMutationUpdateAniChartHighlightsArgs = z.object({
	get highlights() {
		return z.union([z.array(z.custom<z.input<typeof zAniChartHighlightInput> | null | undefined>()), z.custom<z.input<typeof zAniChartHighlightInput>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zAniChartHighlightInput.nullish())).nullish();
	},
});
export type MutationUpdateAniChartHighlightsArgs = z.output<typeof zMutationUpdateAniChartHighlightsArgs>;

export const zMutationUpdateAniChartSettingsArgs = z.object({
	outgoingLinkProvider: z.string().nullish(),
	sort: z.string().nullish(),
	theme: z.string().nullish(),
	titleLanguage: z.string().nullish(),
});
export type MutationUpdateAniChartSettingsArgs = z.output<typeof zMutationUpdateAniChartSettingsArgs>;

export const zMutationUpdateFavouriteOrderArgs = z.object({
	/** The id of the anime to un/favourite */
	animeIds: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** List of integers which the anime should be ordered by (Asc) */
	animeOrder: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The id of the character to un/favourite */
	characterIds: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** List of integers which the character should be ordered by (Asc) */
	characterOrder: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The id of the manga to un/favourite */
	mangaIds: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** List of integers which the manga should be ordered by (Asc) */
	mangaOrder: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The id of the staff to un/favourite */
	staffIds: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** List of integers which the staff should be ordered by (Asc) */
	staffOrder: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The id of the studio to un/favourite */
	studioIds: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** List of integers which the studio should be ordered by (Asc) */
	studioOrder: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
});
export type MutationUpdateFavouriteOrderArgs = z.output<typeof zMutationUpdateFavouriteOrderArgs>;

export const zMutationUpdateMediaListEntriesArgs = z.object({
	/** Array of advanced scores (Min: 0, Max: 100) */
	advancedScores: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.number().nullish())).nullish(),
	/** When the entry was completed by the user */
	get completedAt() {
		return zFuzzyDateInput.nullish();
	},
	/** If the entry shown be hidden from non-custom lists */
	hiddenFromStatusLists: z.boolean().nullish(),
	/** The list entries ids to update */
	ids: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Text notes (Min: 0, Max: 6000) */
	notes: z.string().nullish(),
	/** Priority of planning (Min: 0, Max: 255) */
	priority: z.int32().nullish(),
	/** If the entry should only be visible to authenticated user */
	private: z.boolean().nullish(),
	/** The amount of episodes/chapters consumed by the user (Min: 0) */
	progress: z.int32().nullish(),
	/** The amount of volumes read by the user (Min: 0) */
	progressVolumes: z.int32().nullish(),
	/** The amount of times the user has rewatched/read the media (Min: 0, Max: 1000) */
	repeat: z.int32().nullish(),
	/** The score of the media in the user's chosen scoring method (Min: 0, Max: 100) */
	score: z.number().nullish(),
	/** The score of the media in 100 point (Min: 0, Max: 100) */
	scoreRaw: z.int32().nullish(),
	/** When the entry was started by the user */
	get startedAt() {
		return zFuzzyDateInput.nullish();
	},
	/** The watching/reading status */
	status: zMediaListStatus.nullish(),
});
export type MutationUpdateMediaListEntriesArgs = z.output<typeof zMutationUpdateMediaListEntriesArgs>;

export const zMutationUpdateUserArgs = z.object({
	/** User's about/bio text */
	about: z.string().nullish(),
	/** Minutes between activity for them to be merged together. 0 is Never, Above 2 weeks (20160 mins) is Always. (Min: 0) */
	activityMergeTime: z.int32().nullish(),
	/** If the user should get notifications when a show they are watching aires */
	airingNotifications: z.boolean().nullish(),
	/** The user's anime list options */
	get animeListOptions() {
		return zMediaListOptionsInput.nullish();
	},
	get disabledListActivity() {
		return z.union([z.array(z.custom<z.input<typeof zListActivityOptionInput> | null | undefined>()), z.custom<z.input<typeof zListActivityOptionInput>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zListActivityOptionInput.nullish())).nullish();
	},
	/** If the user should see others' activities for media marked as adult */
	displayAdultActivities: z.boolean().nullish(),
	/** If the user should see media marked as adult-only */
	displayAdultContent: z.boolean().nullish(),
	/** User's donator badge, only displayed for donators (Max: 24) */
	donatorBadge: z.string().nullish(),
	/** If the user should see media marked as adult-only in quick search results */
	includeAdultContentInQuickSearch: z.boolean().nullish(),
	/** If the user should see media marked as adult-only in search results */
	includeAdultContentInSearch: z.boolean().nullish(),
	/** The user's anime list options */
	get mangaListOptions() {
		return zMediaListOptionsInput.nullish();
	},
	/** Notification options */
	get notificationOptions() {
		return z.union([z.array(z.custom<z.input<typeof zNotificationOptionInput> | null | undefined>()), z.custom<z.input<typeof zNotificationOptionInput>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zNotificationOptionInput.nullish())).nullish();
	},
	/** Profile highlight color */
	profileColor: z.string().nullish(),
	/** Only allow messages from other users the user follows */
	restrictMessagesToFollowing: z.boolean().nullish(),
	/** The user's default list order */
	rowOrder: z.string().nullish(),
	/** The user's list scoring system */
	scoreFormat: zScoreFormat.nullish(),
	/** The language the user wants to see staff and character names in */
	staffNameLanguage: zUserStaffNameLanguage.nullish(),
	/** Timezone offset format: -?HH:MM */
	timezone: z.string().nullish(),
	/** User's title language */
	titleLanguage: zUserTitleLanguage.nullish(),
});
export type MutationUpdateUserArgs = z.output<typeof zMutationUpdateUserArgs>;

export const zPageActivitiesArgs = z.object({
	/** Filter by the time the activity was created */
	createdAt: z.int32().nullish(),
	/** Filter by the time the activity was created */
	createdAt_greater: z.int32().nullish(),
	/** Filter by the time the activity was created */
	createdAt_lesser: z.int32().nullish(),
	/** Filter activity to only activity with replies */
	hasReplies: z.boolean().nullish(),
	/** Filter activity to only activity with replies or is of type text */
	hasRepliesOrTypeText: z.boolean().nullish(),
	/** Filter by the activity id */
	id: z.int32().nullish(),
	/** Filter by the activity id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the activity id */
	id_not: z.int32().nullish(),
	/** Filter by the activity id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter activity to users who are being followed by the authenticated user */
	isFollowing: z.boolean().nullish(),
	/** Filter by the associated media id of the activity */
	mediaId: z.int32().nullish(),
	/** Filter by the associated media id of the activity (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the associated media id of the activity */
	mediaId_not: z.int32().nullish(),
	/** Filter by the associated media id of the activity (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the user who sent a message */
	messengerId: z.int32().nullish(),
	/** Filter by the id of the user who sent a message (max 10,000 items) */
	messengerId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the user who sent a message */
	messengerId_not: z.int32().nullish(),
	/** Filter by the id of the user who sent a message (max 10,000 items) */
	messengerId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zActivitySort> | null | undefined>()), z.custom<z.input<typeof zActivitySort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivitySort.nullish())).nullish(),
	/** Filter by the type of activity */
	type: zActivityType.nullish(),
	/** Filter by the type of activity (max 10,000 items) */
	type_in: z.union([z.array(z.custom<z.input<typeof zActivityType> | null | undefined>()), z.custom<z.input<typeof zActivityType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivityType.nullish())).nullish(),
	/** Filter by the type of activity */
	type_not: zActivityType.nullish(),
	/** Filter by the type of activity (max 10,000 items) */
	type_not_in: z.union([z.array(z.custom<z.input<typeof zActivityType> | null | undefined>()), z.custom<z.input<typeof zActivityType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivityType.nullish())).nullish(),
	/** Filter by the owner user id */
	userId: z.int32().nullish(),
	/** Filter by the owner user id (max 10,000 items) */
	userId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the owner user id */
	userId_not: z.int32().nullish(),
	/** Filter by the owner user id (max 10,000 items) */
	userId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
});
export type PageActivitiesArgs = z.output<typeof zPageActivitiesArgs>;

export const zPageActivityRepliesArgs = z.object({
	/** Filter by the parent id */
	activityId: z.int32().nullish(),
	/** Filter by the reply id */
	id: z.int32().nullish(),
});
export type PageActivityRepliesArgs = z.output<typeof zPageActivityRepliesArgs>;

export const zPageAiringSchedulesArgs = z.object({
	/** Filter by the time of airing */
	airingAt: z.int32().nullish(),
	/** Filter by the time of airing */
	airingAt_greater: z.int32().nullish(),
	/** Filter by the time of airing */
	airingAt_lesser: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode_greater: z.int32().nullish(),
	/** Filter by the airing episode number (max 10,000 items) */
	episode_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the airing episode number */
	episode_lesser: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode_not: z.int32().nullish(),
	/** Filter by the airing episode number (max 10,000 items) */
	episode_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the airing schedule item */
	id: z.int32().nullish(),
	/** Filter by the id of the airing schedule item (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the airing schedule item */
	id_not: z.int32().nullish(),
	/** Filter by the id of the airing schedule item (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of associated media */
	mediaId: z.int32().nullish(),
	/** Filter by the id of associated media (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of associated media */
	mediaId_not: z.int32().nullish(),
	/** Filter by the id of associated media (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter to episodes that haven't yet aired */
	notYetAired: z.boolean().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zAiringSort> | null | undefined>()), z.custom<z.input<typeof zAiringSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zAiringSort.nullish())).nullish(),
});
export type PageAiringSchedulesArgs = z.output<typeof zPageAiringSchedulesArgs>;

export const zPageCharactersArgs = z.object({
	/** Filter by character id */
	id: z.int32().nullish(),
	/** Filter by character id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by character id */
	id_not: z.int32().nullish(),
	/** Filter by character id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by character by if its their birthday today */
	isBirthday: z.boolean().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zCharacterSort> | null | undefined>()), z.custom<z.input<typeof zCharacterSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zCharacterSort.nullish())).nullish(),
});
export type PageCharactersArgs = z.output<typeof zPageCharactersArgs>;

export const zPageFollowersArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id of the follower/followed */
	userId: z.int32(),
});
export type PageFollowersArgs = z.output<typeof zPageFollowersArgs>;

export const zPageFollowingArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id of the follower/followed */
	userId: z.int32(),
});
export type PageFollowingArgs = z.output<typeof zPageFollowingArgs>;

export const zPageLikesArgs = z.object({
	/** The id of the likeable type */
	likeableId: z.int32().nullish(),
	/** The type of model the id applies to */
	type: zLikeableType.nullish(),
});
export type PageLikesArgs = z.output<typeof zPageLikesArgs>;

export const zPageMediaArgs = z.object({
	/** Filter by the media's average score */
	averageScore: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_greater: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_not: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters_greater: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters_lesser: z.int32().nullish(),
	/** Filter by the media's country of origin */
	countryOfOrigin: scalarSchemas.CountryCode.nullish(),
	/** Filter by the media's country of origin (max 10,000 items) */
	countryOfOrigin_in: z.union([z.array(z.custom<z.input<typeof scalarSchemas.CountryCode> | null | undefined>()), z.custom<z.input<typeof scalarSchemas.CountryCode>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(scalarSchemas.CountryCode.nullish())).nullish(),
	/** Filter by the media's country of origin (max 10,000 items) */
	countryOfOrigin_not_in: z.union([z.array(z.custom<z.input<typeof scalarSchemas.CountryCode> | null | undefined>()), z.custom<z.input<typeof scalarSchemas.CountryCode>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(scalarSchemas.CountryCode.nullish())).nullish(),
	/** Filter by the media's episode length */
	duration: z.int32().nullish(),
	/** Filter by the media's episode length */
	duration_greater: z.int32().nullish(),
	/** Filter by the media's episode length */
	duration_lesser: z.int32().nullish(),
	/** Filter by the end date of the media */
	endDate: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_like: z.string().nullish(),
	/** Filter by amount of episodes the media has */
	episodes: z.int32().nullish(),
	/** Filter by amount of episodes the media has */
	episodes_greater: z.int32().nullish(),
	/** Filter by amount of episodes the media has */
	episodes_lesser: z.int32().nullish(),
	/** Filter by the media's format */
	format: zMediaFormat.nullish(),
	/** Filter by the media's format (max 10,000 items) */
	format_in: z.union([z.array(z.custom<z.input<typeof zMediaFormat> | null | undefined>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat.nullish())).nullish(),
	/** Filter by the media's format */
	format_not: zMediaFormat.nullish(),
	/** Filter by the media's format (max 10,000 items) */
	format_not_in: z.union([z.array(z.custom<z.input<typeof zMediaFormat> | null | undefined>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat.nullish())).nullish(),
	/** Filter by the media's genres */
	genre: z.string().nullish(),
	/** Filter by the media's genres (max 10,000 items) */
	genre_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's genres (max 10,000 items) */
	genre_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media id */
	id: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id */
	idMal: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id (max 10,000 items) */
	idMal_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media's MyAnimeList id */
	idMal_not: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id (max 10,000 items) */
	idMal_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id */
	id_not: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by if the media's intended for 18+ adult audiences */
	isAdult: z.boolean().nullish(),
	/** If the media is officially licensed or a self-published doujin release */
	isLicensed: z.boolean().nullish(),
	/** Filter media by sites name with a online streaming or reading license */
	licensedBy: z.string().nullish(),
	/** Filter media by sites id with a online streaming or reading license */
	licensedById: z.int32().nullish(),
	/** Filter media by sites id with a online streaming or reading license (max 10,000 items) */
	licensedById_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter media by sites name with a online streaming or reading license (max 10,000 items) */
	licensedBy_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Only apply the tags filter argument to tags above this rank. Default: 18 */
	minimumTagRank: z.int32().nullish(),
	/** Filter by the media on the authenticated user's lists */
	onList: z.boolean().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_greater: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_lesser: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_not: z.int32().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** Filter by the season the media was released in */
	season: zMediaSeason.nullish(),
	/** The year of the season (Winter 2017 would also include December 2016 releases). Requires season argument */
	seasonYear: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
	/** Filter by the source type of the media */
	source: zMediaSource.nullish(),
	/** Filter by the source type of the media (max 10,000 items) */
	source_in: z.union([z.array(z.custom<z.input<typeof zMediaSource> | null | undefined>()), z.custom<z.input<typeof zMediaSource>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSource.nullish())).nullish(),
	/** Filter by the start date of the media */
	startDate: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_like: z.string().nullish(),
	/** Filter by the media's current release status */
	status: zMediaStatus.nullish(),
	/** Filter by the media's current release status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaStatus> | null | undefined>()), z.custom<z.input<typeof zMediaStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaStatus.nullish())).nullish(),
	/** Filter by the media's current release status */
	status_not: zMediaStatus.nullish(),
	/** Filter by the media's current release status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaStatus> | null | undefined>()), z.custom<z.input<typeof zMediaStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaStatus.nullish())).nullish(),
	/** Filter by the media's tags */
	tag: z.string().nullish(),
	/** Filter by the media's tags with in a tag category */
	tagCategory: z.string().nullish(),
	/** Filter by the media's tags with in a tag category (max 10,000 items) */
	tagCategory_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags with in a tag category (max 10,000 items) */
	tagCategory_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags (max 10,000 items) */
	tag_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags (max 10,000 items) */
	tag_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's type */
	type: zMediaType.nullish(),
	/** Filter by the media's volume count */
	volumes: z.int32().nullish(),
	/** Filter by the media's volume count */
	volumes_greater: z.int32().nullish(),
	/** Filter by the media's volume count */
	volumes_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_greater: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_not: z.int32().nullish(),
});
export type PageMediaArgs = z.output<typeof zPageMediaArgs>;

export const zPageMediaListArgs = z.object({
	/** Limit to only entries also on the auth user's list. Requires user id or name arguments. */
	compareWithAuthList: z.boolean().nullish(),
	/** Filter by the date the user completed the media */
	completedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_like: z.string().nullish(),
	/** Filter by a list entry's id */
	id: z.int32().nullish(),
	/** Filter list entries to users who are being followed by the authenticated user */
	isFollowing: z.boolean().nullish(),
	/** Filter by the media id of the list entry */
	mediaId: z.int32().nullish(),
	/** Filter by the media id of the list entry (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id of the list entry (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by note words and #tags */
	notes: z.string().nullish(),
	/** Filter by note words and #tags */
	notes_like: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaListSort> | null | undefined>()), z.custom<z.input<typeof zMediaListSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListSort.nullish())).nullish(),
	/** Filter by the date the user started the media */
	startedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_like: z.string().nullish(),
	/** Filter by the watching/reading status */
	status: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the watching/reading status */
	status_not: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the list entries media type */
	type: zMediaType.nullish(),
	/** Filter by a user's id */
	userId: z.int32().nullish(),
	/** Filter by a user's id (max 10,000 items) */
	userId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by a user's name */
	userName: z.string().nullish(),
});
export type PageMediaListArgs = z.output<typeof zPageMediaListArgs>;

export const zPageMediaTrendsArgs = z.object({
	/** Filter by score */
	averageScore: z.int32().nullish(),
	/** Filter by score */
	averageScore_greater: z.int32().nullish(),
	/** Filter by score */
	averageScore_lesser: z.int32().nullish(),
	/** Filter by score */
	averageScore_not: z.int32().nullish(),
	/** Filter by date */
	date: z.int32().nullish(),
	/** Filter by date */
	date_greater: z.int32().nullish(),
	/** Filter by date */
	date_lesser: z.int32().nullish(),
	/** Filter by episode number */
	episode: z.int32().nullish(),
	/** Filter by episode number */
	episode_greater: z.int32().nullish(),
	/** Filter by episode number */
	episode_lesser: z.int32().nullish(),
	/** Filter by episode number */
	episode_not: z.int32().nullish(),
	/** Filter by the media id */
	mediaId: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id */
	mediaId_not: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by popularity */
	popularity: z.int32().nullish(),
	/** Filter by popularity */
	popularity_greater: z.int32().nullish(),
	/** Filter by popularity */
	popularity_lesser: z.int32().nullish(),
	/** Filter by popularity */
	popularity_not: z.int32().nullish(),
	/** Filter to stats recorded while the media was releasing */
	releasing: z.boolean().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaTrendSort> | null | undefined>()), z.custom<z.input<typeof zMediaTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaTrendSort.nullish())).nullish(),
	/** Filter by trending amount */
	trending: z.int32().nullish(),
	/** Filter by trending amount */
	trending_greater: z.int32().nullish(),
	/** Filter by trending amount */
	trending_lesser: z.int32().nullish(),
	/** Filter by trending amount */
	trending_not: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_greater: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_lesser: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_not: z.int32().nullish(),
});
export type PageMediaTrendsArgs = z.output<typeof zPageMediaTrendsArgs>;

export const zPageMutualFollowersArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id to fetch mutual followers for */
	userId: z.int32(),
});
export type PageMutualFollowersArgs = z.output<typeof zPageMutualFollowersArgs>;

export const zPageNotificationsArgs = z.object({
	/** Reset the unread notification count to 0 on load */
	resetNotificationCount: z.boolean().nullish(),
	/** Filter by the type of notifications */
	type: zNotificationType.nullish(),
	/** Filter by the type of notifications (max 10,000 items) */
	type_in: z.union([z.array(z.custom<z.input<typeof zNotificationType> | null | undefined>()), z.custom<z.input<typeof zNotificationType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zNotificationType.nullish())).nullish(),
});
export type PageNotificationsArgs = z.output<typeof zPageNotificationsArgs>;

export const zPageRecommendationsArgs = z.object({
	/** Filter by recommendation id */
	id: z.int32().nullish(),
	/** Filter by media id */
	mediaId: z.int32().nullish(),
	/** Filter by media recommendation id */
	mediaRecommendationId: z.int32().nullish(),
	/** Filter by the media on the authenticated user's lists */
	onList: z.boolean().nullish(),
	/** Filter by total rating of the recommendation */
	rating: z.int32().nullish(),
	/** Filter by total rating of the recommendation */
	rating_greater: z.int32().nullish(),
	/** Filter by total rating of the recommendation */
	rating_lesser: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zRecommendationSort> | null | undefined>()), z.custom<z.input<typeof zRecommendationSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zRecommendationSort.nullish())).nullish(),
	/** Filter by user who created the recommendation */
	userId: z.int32().nullish(),
});
export type PageRecommendationsArgs = z.output<typeof zPageRecommendationsArgs>;

export const zPageReviewsArgs = z.object({
	/** Filter by Review id */
	id: z.int32().nullish(),
	/** Filter by media id */
	mediaId: z.int32().nullish(),
	/** Filter by media type */
	mediaType: zMediaType.nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zReviewSort> | null | undefined>()), z.custom<z.input<typeof zReviewSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zReviewSort.nullish())).nullish(),
	/** Filter by user id */
	userId: z.int32().nullish(),
});
export type PageReviewsArgs = z.output<typeof zPageReviewsArgs>;

export const zPageStaffArgs = z.object({
	/** Filter by the staff id */
	id: z.int32().nullish(),
	/** Filter by the staff id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the staff id */
	id_not: z.int32().nullish(),
	/** Filter by the staff id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by staff by if its their birthday today */
	isBirthday: z.boolean().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type PageStaffArgs = z.output<typeof zPageStaffArgs>;

export const zPageStudiosArgs = z.object({
	/** Filter by the studio id */
	id: z.int32().nullish(),
	/** Filter by the studio id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the studio id */
	id_not: z.int32().nullish(),
	/** Filter by the studio id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zStudioSort> | null | undefined>()), z.custom<z.input<typeof zStudioSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStudioSort.nullish())).nullish(),
});
export type PageStudiosArgs = z.output<typeof zPageStudiosArgs>;

export const zPageThreadCommentsArgs = z.object({
	/** Filter by the comment id */
	id: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zThreadCommentSort> | null | undefined>()), z.custom<z.input<typeof zThreadCommentSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zThreadCommentSort.nullish())).nullish(),
	/** Filter by the thread id */
	threadId: z.int32().nullish(),
	/** Filter by the user id of the comment's creator */
	userId: z.int32().nullish(),
});
export type PageThreadCommentsArgs = z.output<typeof zPageThreadCommentsArgs>;

export const zPageThreadsArgs = z.object({
	/** Filter by thread category id */
	categoryId: z.int32().nullish(),
	/** Filter by the thread id */
	id: z.int32().nullish(),
	/** Filter by the thread id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by thread media id category */
	mediaCategoryId: z.int32().nullish(),
	/** Filter by the user id of the last user to comment on the thread */
	replyUserId: z.int32().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zThreadSort> | null | undefined>()), z.custom<z.input<typeof zThreadSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zThreadSort.nullish())).nullish(),
	/** Filter by if the currently authenticated user's subscribed threads */
	subscribed: z.boolean().nullish(),
	/** Filter by the user id of the thread's creator */
	userId: z.int32().nullish(),
});
export type PageThreadsArgs = z.output<typeof zPageThreadsArgs>;

export const zPageUsersArgs = z.object({
	/** Filter by the user id */
	id: z.int32().nullish(),
	/** Filter to moderators only if true */
	isModerator: z.boolean().nullish(),
	/** Filter by the name of the user */
	name: z.string().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
});
export type PageUsersArgs = z.output<typeof zPageUsersArgs>;

export const zQueryActivityArgs = z.object({
	/** Filter by the time the activity was created */
	createdAt: z.int32().nullish(),
	/** Filter by the time the activity was created */
	createdAt_greater: z.int32().nullish(),
	/** Filter by the time the activity was created */
	createdAt_lesser: z.int32().nullish(),
	/** Filter activity to only activity with replies */
	hasReplies: z.boolean().nullish(),
	/** Filter activity to only activity with replies or is of type text */
	hasRepliesOrTypeText: z.boolean().nullish(),
	/** Filter by the activity id */
	id: z.int32().nullish(),
	/** Filter by the activity id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the activity id */
	id_not: z.int32().nullish(),
	/** Filter by the activity id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter activity to users who are being followed by the authenticated user */
	isFollowing: z.boolean().nullish(),
	/** Filter by the associated media id of the activity */
	mediaId: z.int32().nullish(),
	/** Filter by the associated media id of the activity (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the associated media id of the activity */
	mediaId_not: z.int32().nullish(),
	/** Filter by the associated media id of the activity (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the user who sent a message */
	messengerId: z.int32().nullish(),
	/** Filter by the id of the user who sent a message (max 10,000 items) */
	messengerId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the user who sent a message */
	messengerId_not: z.int32().nullish(),
	/** Filter by the id of the user who sent a message (max 10,000 items) */
	messengerId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zActivitySort> | null | undefined>()), z.custom<z.input<typeof zActivitySort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivitySort.nullish())).nullish(),
	/** Filter by the type of activity */
	type: zActivityType.nullish(),
	/** Filter by the type of activity (max 10,000 items) */
	type_in: z.union([z.array(z.custom<z.input<typeof zActivityType> | null | undefined>()), z.custom<z.input<typeof zActivityType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivityType.nullish())).nullish(),
	/** Filter by the type of activity */
	type_not: zActivityType.nullish(),
	/** Filter by the type of activity (max 10,000 items) */
	type_not_in: z.union([z.array(z.custom<z.input<typeof zActivityType> | null | undefined>()), z.custom<z.input<typeof zActivityType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zActivityType.nullish())).nullish(),
	/** Filter by the owner user id */
	userId: z.int32().nullish(),
	/** Filter by the owner user id (max 10,000 items) */
	userId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the owner user id */
	userId_not: z.int32().nullish(),
	/** Filter by the owner user id (max 10,000 items) */
	userId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
});
export type QueryActivityArgs = z.output<typeof zQueryActivityArgs>;

export const zQueryActivityReplyArgs = z.object({
	/** Filter by the parent id */
	activityId: z.int32().nullish(),
	/** Filter by the reply id */
	id: z.int32().nullish(),
});
export type QueryActivityReplyArgs = z.output<typeof zQueryActivityReplyArgs>;

export const zQueryAiringScheduleArgs = z.object({
	/** Filter by the time of airing */
	airingAt: z.int32().nullish(),
	/** Filter by the time of airing */
	airingAt_greater: z.int32().nullish(),
	/** Filter by the time of airing */
	airingAt_lesser: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode_greater: z.int32().nullish(),
	/** Filter by the airing episode number (max 10,000 items) */
	episode_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the airing episode number */
	episode_lesser: z.int32().nullish(),
	/** Filter by the airing episode number */
	episode_not: z.int32().nullish(),
	/** Filter by the airing episode number (max 10,000 items) */
	episode_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the airing schedule item */
	id: z.int32().nullish(),
	/** Filter by the id of the airing schedule item (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of the airing schedule item */
	id_not: z.int32().nullish(),
	/** Filter by the id of the airing schedule item (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of associated media */
	mediaId: z.int32().nullish(),
	/** Filter by the id of associated media (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the id of associated media */
	mediaId_not: z.int32().nullish(),
	/** Filter by the id of associated media (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter to episodes that haven't yet aired */
	notYetAired: z.boolean().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zAiringSort> | null | undefined>()), z.custom<z.input<typeof zAiringSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zAiringSort.nullish())).nullish(),
});
export type QueryAiringScheduleArgs = z.output<typeof zQueryAiringScheduleArgs>;

export const zQueryCharacterArgs = z.object({
	/** Filter by character id */
	id: z.int32().nullish(),
	/** Filter by character id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by character id */
	id_not: z.int32().nullish(),
	/** Filter by character id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by character by if its their birthday today */
	isBirthday: z.boolean().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zCharacterSort> | null | undefined>()), z.custom<z.input<typeof zCharacterSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zCharacterSort.nullish())).nullish(),
});
export type QueryCharacterArgs = z.output<typeof zQueryCharacterArgs>;

export const zQueryExternalLinkSourceCollectionArgs = z.object({
	/** Filter by the link id */
	id: z.int32().nullish(),
	mediaType: zExternalLinkMediaType.nullish(),
	type: zExternalLinkType.nullish(),
});
export type QueryExternalLinkSourceCollectionArgs = z.output<typeof zQueryExternalLinkSourceCollectionArgs>;

export const zQueryFollowerArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id of the follower/followed */
	userId: z.int32(),
});
export type QueryFollowerArgs = z.output<typeof zQueryFollowerArgs>;

export const zQueryFollowingArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id of the follower/followed */
	userId: z.int32(),
});
export type QueryFollowingArgs = z.output<typeof zQueryFollowingArgs>;

export const zQueryLikeArgs = z.object({
	/** The id of the likeable type */
	likeableId: z.int32().nullish(),
	/** The type of model the id applies to */
	type: zLikeableType.nullish(),
});
export type QueryLikeArgs = z.output<typeof zQueryLikeArgs>;

export const zQueryMarkdownArgs = z.object({
	/** The markdown to be parsed to html */
	markdown: z.string(),
});
export type QueryMarkdownArgs = z.output<typeof zQueryMarkdownArgs>;

export const zQueryMediaArgs = z.object({
	/** Filter by the media's average score */
	averageScore: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_greater: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	averageScore_not: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters_greater: z.int32().nullish(),
	/** Filter by the media's chapter count */
	chapters_lesser: z.int32().nullish(),
	/** Filter by the media's country of origin */
	countryOfOrigin: scalarSchemas.CountryCode.nullish(),
	/** Filter by the media's country of origin (max 10,000 items) */
	countryOfOrigin_in: z.union([z.array(z.custom<z.input<typeof scalarSchemas.CountryCode> | null | undefined>()), z.custom<z.input<typeof scalarSchemas.CountryCode>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(scalarSchemas.CountryCode.nullish())).nullish(),
	/** Filter by the media's country of origin (max 10,000 items) */
	countryOfOrigin_not_in: z.union([z.array(z.custom<z.input<typeof scalarSchemas.CountryCode> | null | undefined>()), z.custom<z.input<typeof scalarSchemas.CountryCode>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(scalarSchemas.CountryCode.nullish())).nullish(),
	/** Filter by the media's episode length */
	duration: z.int32().nullish(),
	/** Filter by the media's episode length */
	duration_greater: z.int32().nullish(),
	/** Filter by the media's episode length */
	duration_lesser: z.int32().nullish(),
	/** Filter by the end date of the media */
	endDate: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the end date of the media */
	endDate_like: z.string().nullish(),
	/** Filter by amount of episodes the media has */
	episodes: z.int32().nullish(),
	/** Filter by amount of episodes the media has */
	episodes_greater: z.int32().nullish(),
	/** Filter by amount of episodes the media has */
	episodes_lesser: z.int32().nullish(),
	/** Filter by the media's format */
	format: zMediaFormat.nullish(),
	/** Filter by the media's format (max 10,000 items) */
	format_in: z.union([z.array(z.custom<z.input<typeof zMediaFormat> | null | undefined>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat.nullish())).nullish(),
	/** Filter by the media's format */
	format_not: zMediaFormat.nullish(),
	/** Filter by the media's format (max 10,000 items) */
	format_not_in: z.union([z.array(z.custom<z.input<typeof zMediaFormat> | null | undefined>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat.nullish())).nullish(),
	/** Filter by the media's genres */
	genre: z.string().nullish(),
	/** Filter by the media's genres (max 10,000 items) */
	genre_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's genres (max 10,000 items) */
	genre_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media id */
	id: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id */
	idMal: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id (max 10,000 items) */
	idMal_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media's MyAnimeList id */
	idMal_not: z.int32().nullish(),
	/** Filter by the media's MyAnimeList id (max 10,000 items) */
	idMal_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id */
	id_not: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by if the media's intended for 18+ adult audiences */
	isAdult: z.boolean().nullish(),
	/** If the media is officially licensed or a self-published doujin release */
	isLicensed: z.boolean().nullish(),
	/** Filter media by sites name with a online streaming or reading license */
	licensedBy: z.string().nullish(),
	/** Filter media by sites id with a online streaming or reading license */
	licensedById: z.int32().nullish(),
	/** Filter media by sites id with a online streaming or reading license (max 10,000 items) */
	licensedById_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter media by sites name with a online streaming or reading license (max 10,000 items) */
	licensedBy_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Only apply the tags filter argument to tags above this rank. Default: 18 */
	minimumTagRank: z.int32().nullish(),
	/** Filter by the media on the authenticated user's lists */
	onList: z.boolean().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_greater: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_lesser: z.int32().nullish(),
	/** Filter by the number of users with this media on their list */
	popularity_not: z.int32().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** Filter by the season the media was released in */
	season: zMediaSeason.nullish(),
	/** The year of the season (Winter 2017 would also include December 2016 releases). Requires season argument */
	seasonYear: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
	/** Filter by the source type of the media */
	source: zMediaSource.nullish(),
	/** Filter by the source type of the media (max 10,000 items) */
	source_in: z.union([z.array(z.custom<z.input<typeof zMediaSource> | null | undefined>()), z.custom<z.input<typeof zMediaSource>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSource.nullish())).nullish(),
	/** Filter by the start date of the media */
	startDate: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the start date of the media */
	startDate_like: z.string().nullish(),
	/** Filter by the media's current release status */
	status: zMediaStatus.nullish(),
	/** Filter by the media's current release status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaStatus> | null | undefined>()), z.custom<z.input<typeof zMediaStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaStatus.nullish())).nullish(),
	/** Filter by the media's current release status */
	status_not: zMediaStatus.nullish(),
	/** Filter by the media's current release status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaStatus> | null | undefined>()), z.custom<z.input<typeof zMediaStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaStatus.nullish())).nullish(),
	/** Filter by the media's tags */
	tag: z.string().nullish(),
	/** Filter by the media's tags with in a tag category */
	tagCategory: z.string().nullish(),
	/** Filter by the media's tags with in a tag category (max 10,000 items) */
	tagCategory_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags with in a tag category (max 10,000 items) */
	tagCategory_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags (max 10,000 items) */
	tag_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's tags (max 10,000 items) */
	tag_not_in: z.union([z.array(z.custom<string | null | undefined>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string().nullish())).nullish(),
	/** Filter by the media's type */
	type: zMediaType.nullish(),
	/** Filter by the media's volume count */
	volumes: z.int32().nullish(),
	/** Filter by the media's volume count */
	volumes_greater: z.int32().nullish(),
	/** Filter by the media's volume count */
	volumes_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_greater: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_lesser: z.int32().nullish(),
	/** Filter by the media's average score */
	weightedScore_not: z.int32().nullish(),
});
export type QueryMediaArgs = z.output<typeof zQueryMediaArgs>;

export const zQueryMediaListArgs = z.object({
	/** Limit to only entries also on the auth user's list. Requires user id or name arguments. */
	compareWithAuthList: z.boolean().nullish(),
	/** Filter by the date the user completed the media */
	completedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_like: z.string().nullish(),
	/** Filter by a list entry's id */
	id: z.int32().nullish(),
	/** Filter list entries to users who are being followed by the authenticated user */
	isFollowing: z.boolean().nullish(),
	/** Filter by the media id of the list entry */
	mediaId: z.int32().nullish(),
	/** Filter by the media id of the list entry (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id of the list entry (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by note words and #tags */
	notes: z.string().nullish(),
	/** Filter by note words and #tags */
	notes_like: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaListSort> | null | undefined>()), z.custom<z.input<typeof zMediaListSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListSort.nullish())).nullish(),
	/** Filter by the date the user started the media */
	startedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_like: z.string().nullish(),
	/** Filter by the watching/reading status */
	status: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the watching/reading status */
	status_not: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the list entries media type */
	type: zMediaType.nullish(),
	/** Filter by a user's id */
	userId: z.int32().nullish(),
	/** Filter by a user's id (max 10,000 items) */
	userId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by a user's name */
	userName: z.string().nullish(),
});
export type QueryMediaListArgs = z.output<typeof zQueryMediaListArgs>;

export const zQueryMediaListCollectionArgs = z.object({
	/** Which chunk of list entries to load */
	chunk: z.int32().nullish(),
	/** Filter by the date the user completed the media */
	completedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user completed the media */
	completedAt_like: z.string().nullish(),
	/** Always return completed list entries in one group, overriding the user's split completed option. */
	forceSingleCompletedList: z.boolean().nullish(),
	/** Filter by note words and #tags */
	notes: z.string().nullish(),
	/** Filter by note words and #tags */
	notes_like: z.string().nullish(),
	/** The amount of entries per chunk, max 500 */
	perChunk: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaListSort> | null | undefined>()), z.custom<z.input<typeof zMediaListSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListSort.nullish())).nullish(),
	/** Filter by the date the user started the media */
	startedAt: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_greater: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_lesser: scalarSchemas.FuzzyDateInt.nullish(),
	/** Filter by the date the user started the media */
	startedAt_like: z.string().nullish(),
	/** Filter by the watching/reading status */
	status: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the watching/reading status */
	status_not: zMediaListStatus.nullish(),
	/** Filter by the watching/reading status (max 10,000 items) */
	status_not_in: z.union([z.array(z.custom<z.input<typeof zMediaListStatus> | null | undefined>()), z.custom<z.input<typeof zMediaListStatus>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaListStatus.nullish())).nullish(),
	/** Filter by the list entries media type */
	type: zMediaType.nullish(),
	/** Filter by a user's id */
	userId: z.int32().nullish(),
	/** Filter by a user's name */
	userName: z.string().nullish(),
});
export type QueryMediaListCollectionArgs = z.output<typeof zQueryMediaListCollectionArgs>;

export const zQueryMediaTagCollectionArgs = z.object({
	/** Mod Only */
	status: z.int32().nullish(),
});
export type QueryMediaTagCollectionArgs = z.output<typeof zQueryMediaTagCollectionArgs>;

export const zQueryMediaTrendArgs = z.object({
	/** Filter by score */
	averageScore: z.int32().nullish(),
	/** Filter by score */
	averageScore_greater: z.int32().nullish(),
	/** Filter by score */
	averageScore_lesser: z.int32().nullish(),
	/** Filter by score */
	averageScore_not: z.int32().nullish(),
	/** Filter by date */
	date: z.int32().nullish(),
	/** Filter by date */
	date_greater: z.int32().nullish(),
	/** Filter by date */
	date_lesser: z.int32().nullish(),
	/** Filter by episode number */
	episode: z.int32().nullish(),
	/** Filter by episode number */
	episode_greater: z.int32().nullish(),
	/** Filter by episode number */
	episode_lesser: z.int32().nullish(),
	/** Filter by episode number */
	episode_not: z.int32().nullish(),
	/** Filter by the media id */
	mediaId: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	mediaId_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the media id */
	mediaId_not: z.int32().nullish(),
	/** Filter by the media id (max 10,000 items) */
	mediaId_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by popularity */
	popularity: z.int32().nullish(),
	/** Filter by popularity */
	popularity_greater: z.int32().nullish(),
	/** Filter by popularity */
	popularity_lesser: z.int32().nullish(),
	/** Filter by popularity */
	popularity_not: z.int32().nullish(),
	/** Filter to stats recorded while the media was releasing */
	releasing: z.boolean().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaTrendSort> | null | undefined>()), z.custom<z.input<typeof zMediaTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaTrendSort.nullish())).nullish(),
	/** Filter by trending amount */
	trending: z.int32().nullish(),
	/** Filter by trending amount */
	trending_greater: z.int32().nullish(),
	/** Filter by trending amount */
	trending_lesser: z.int32().nullish(),
	/** Filter by trending amount */
	trending_not: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_greater: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_lesser: z.int32().nullish(),
	/** Filter by weighted scores */
	weightedScore_not: z.int32().nullish(),
});
export type QueryMediaTrendArgs = z.output<typeof zQueryMediaTrendArgs>;

export const zQueryMutualFollowerArgs = z.object({
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
	/** User id to fetch mutual followers for */
	userId: z.int32(),
});
export type QueryMutualFollowerArgs = z.output<typeof zQueryMutualFollowerArgs>;

export const zQueryNotificationArgs = z.object({
	/** Reset the unread notification count to 0 on load */
	resetNotificationCount: z.boolean().nullish(),
	/** Filter by the type of notifications */
	type: zNotificationType.nullish(),
	/** Filter by the type of notifications (max 10,000 items) */
	type_in: z.union([z.array(z.custom<z.input<typeof zNotificationType> | null | undefined>()), z.custom<z.input<typeof zNotificationType>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zNotificationType.nullish())).nullish(),
});
export type QueryNotificationArgs = z.output<typeof zQueryNotificationArgs>;

export const zQueryPageArgs = z.object({
	/** The page number */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 50 */
	perPage: z.int32().nullish(),
});
export type QueryPageArgs = z.output<typeof zQueryPageArgs>;

export const zQueryRecommendationArgs = z.object({
	/** Filter by recommendation id */
	id: z.int32().nullish(),
	/** Filter by media id */
	mediaId: z.int32().nullish(),
	/** Filter by media recommendation id */
	mediaRecommendationId: z.int32().nullish(),
	/** Filter by the media on the authenticated user's lists */
	onList: z.boolean().nullish(),
	/** Filter by total rating of the recommendation */
	rating: z.int32().nullish(),
	/** Filter by total rating of the recommendation */
	rating_greater: z.int32().nullish(),
	/** Filter by total rating of the recommendation */
	rating_lesser: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zRecommendationSort> | null | undefined>()), z.custom<z.input<typeof zRecommendationSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zRecommendationSort.nullish())).nullish(),
	/** Filter by user who created the recommendation */
	userId: z.int32().nullish(),
});
export type QueryRecommendationArgs = z.output<typeof zQueryRecommendationArgs>;

export const zQueryReviewArgs = z.object({
	/** Filter by Review id */
	id: z.int32().nullish(),
	/** Filter by media id */
	mediaId: z.int32().nullish(),
	/** Filter by media type */
	mediaType: zMediaType.nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zReviewSort> | null | undefined>()), z.custom<z.input<typeof zReviewSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zReviewSort.nullish())).nullish(),
	/** Filter by user id */
	userId: z.int32().nullish(),
});
export type QueryReviewArgs = z.output<typeof zQueryReviewArgs>;

export const zQueryStaffArgs = z.object({
	/** Filter by the staff id */
	id: z.int32().nullish(),
	/** Filter by the staff id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the staff id */
	id_not: z.int32().nullish(),
	/** Filter by the staff id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by staff by if its their birthday today */
	isBirthday: z.boolean().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zStaffSort> | null | undefined>()), z.custom<z.input<typeof zStaffSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStaffSort.nullish())).nullish(),
});
export type QueryStaffArgs = z.output<typeof zQueryStaffArgs>;

export const zQueryStudioArgs = z.object({
	/** Filter by the studio id */
	id: z.int32().nullish(),
	/** Filter by the studio id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by the studio id */
	id_not: z.int32().nullish(),
	/** Filter by the studio id (max 10,000 items) */
	id_not_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zStudioSort> | null | undefined>()), z.custom<z.input<typeof zStudioSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zStudioSort.nullish())).nullish(),
});
export type QueryStudioArgs = z.output<typeof zQueryStudioArgs>;

export const zQueryThreadArgs = z.object({
	/** Filter by thread category id */
	categoryId: z.int32().nullish(),
	/** Filter by the thread id */
	id: z.int32().nullish(),
	/** Filter by the thread id (max 10,000 items) */
	id_in: z.union([z.array(z.custom<number | null | undefined>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32().nullish())).nullish(),
	/** Filter by thread media id category */
	mediaCategoryId: z.int32().nullish(),
	/** Filter by the user id of the last user to comment on the thread */
	replyUserId: z.int32().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zThreadSort> | null | undefined>()), z.custom<z.input<typeof zThreadSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zThreadSort.nullish())).nullish(),
	/** Filter by if the currently authenticated user's subscribed threads */
	subscribed: z.boolean().nullish(),
	/** Filter by the user id of the thread's creator */
	userId: z.int32().nullish(),
});
export type QueryThreadArgs = z.output<typeof zQueryThreadArgs>;

export const zQueryThreadCommentArgs = z.object({
	/** Filter by the comment id */
	id: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zThreadCommentSort> | null | undefined>()), z.custom<z.input<typeof zThreadCommentSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zThreadCommentSort.nullish())).nullish(),
	/** Filter by the thread id */
	threadId: z.int32().nullish(),
	/** Filter by the user id of the comment's creator */
	userId: z.int32().nullish(),
});
export type QueryThreadCommentArgs = z.output<typeof zQueryThreadCommentArgs>;

export const zQueryUserArgs = z.object({
	/** Filter by the user id */
	id: z.int32().nullish(),
	/** Filter to moderators only if true */
	isModerator: z.boolean().nullish(),
	/** Filter by the name of the user */
	name: z.string().nullish(),
	/** Filter by search query */
	search: z.string().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zUserSort> | null | undefined>()), z.custom<z.input<typeof zUserSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserSort.nullish())).nullish(),
});
export type QueryUserArgs = z.output<typeof zQueryUserArgs>;

export const zReviewBodyArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type ReviewBodyArgs = z.output<typeof zReviewBodyArgs>;

export const zSiteStatisticsAnimeArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsAnimeArgs = z.output<typeof zSiteStatisticsAnimeArgs>;

export const zSiteStatisticsCharactersArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsCharactersArgs = z.output<typeof zSiteStatisticsCharactersArgs>;

export const zSiteStatisticsMangaArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsMangaArgs = z.output<typeof zSiteStatisticsMangaArgs>;

export const zSiteStatisticsReviewsArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsReviewsArgs = z.output<typeof zSiteStatisticsReviewsArgs>;

export const zSiteStatisticsStaffArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsStaffArgs = z.output<typeof zSiteStatisticsStaffArgs>;

export const zSiteStatisticsStudiosArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsStudiosArgs = z.output<typeof zSiteStatisticsStudiosArgs>;

export const zSiteStatisticsUsersArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zSiteTrendSort> | null | undefined>()), z.custom<z.input<typeof zSiteTrendSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zSiteTrendSort.nullish())).nullish(),
});
export type SiteStatisticsUsersArgs = z.output<typeof zSiteStatisticsUsersArgs>;

export const zStaffCharacterMediaArgs = z.object({
	onList: z.boolean().nullish(),
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
});
export type StaffCharacterMediaArgs = z.output<typeof zStaffCharacterMediaArgs>;

export const zStaffCharactersArgs = z.object({
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zCharacterSort> | null | undefined>()), z.custom<z.input<typeof zCharacterSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zCharacterSort.nullish())).nullish(),
});
export type StaffCharactersArgs = z.output<typeof zStaffCharactersArgs>;

export const zStaffDescriptionArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type StaffDescriptionArgs = z.output<typeof zStaffDescriptionArgs>;

export const zStaffStaffMediaArgs = z.object({
	onList: z.boolean().nullish(),
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
	type: zMediaType.nullish(),
});
export type StaffStaffMediaArgs = z.output<typeof zStaffStaffMediaArgs>;

export const zStudioMediaArgs = z.object({
	/** If the studio was the primary animation studio of the media */
	isMain: z.boolean().nullish(),
	onList: z.boolean().nullish(),
	/** The page */
	page: z.int32().nullish(),
	/** The amount of entries per page, max 25 */
	perPage: z.int32().nullish(),
	/** The order the results will be returned in */
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort> | null | undefined>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort.nullish())).nullish(),
});
export type StudioMediaArgs = z.output<typeof zStudioMediaArgs>;

export const zTextActivityTextArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type TextActivityTextArgs = z.output<typeof zTextActivityTextArgs>;

export const zThreadBodyArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type ThreadBodyArgs = z.output<typeof zThreadBodyArgs>;

export const zThreadCommentCommentArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type ThreadCommentCommentArgs = z.output<typeof zThreadCommentCommentArgs>;

export const zUserAboutArgs = z.object({
	/** Return the string in pre-parsed html instead of markdown */
	asHtml: z.boolean().nullish(),
});
export type UserAboutArgs = z.output<typeof zUserAboutArgs>;

export const zUserFavouritesArgs = z.object({
	/** Deprecated. Use page arguments on each favourite field instead. */
	page: z.int32().nullish(),
});
export type UserFavouritesArgs = z.output<typeof zUserFavouritesArgs>;

export const zUserStatisticsCountriesArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsCountriesArgs = z.output<typeof zUserStatisticsCountriesArgs>;

export const zUserStatisticsFormatsArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsFormatsArgs = z.output<typeof zUserStatisticsFormatsArgs>;

export const zUserStatisticsGenresArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsGenresArgs = z.output<typeof zUserStatisticsGenresArgs>;

export const zUserStatisticsLengthsArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsLengthsArgs = z.output<typeof zUserStatisticsLengthsArgs>;

export const zUserStatisticsReleaseYearsArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsReleaseYearsArgs = z.output<typeof zUserStatisticsReleaseYearsArgs>;

export const zUserStatisticsScoresArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsScoresArgs = z.output<typeof zUserStatisticsScoresArgs>;

export const zUserStatisticsStaffArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsStaffArgs = z.output<typeof zUserStatisticsStaffArgs>;

export const zUserStatisticsStartYearsArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsStartYearsArgs = z.output<typeof zUserStatisticsStartYearsArgs>;

export const zUserStatisticsStatusesArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsStatusesArgs = z.output<typeof zUserStatisticsStatusesArgs>;

export const zUserStatisticsStudiosArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsStudiosArgs = z.output<typeof zUserStatisticsStudiosArgs>;

export const zUserStatisticsTagsArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsTagsArgs = z.output<typeof zUserStatisticsTagsArgs>;

export const zUserStatisticsVoiceActorsArgs = z.object({
	limit: z.int32().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zUserStatisticsSort> | null | undefined>()), z.custom<z.input<typeof zUserStatisticsSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zUserStatisticsSort.nullish())).nullish(),
});
export type UserStatisticsVoiceActorsArgs = z.output<typeof zUserStatisticsVoiceActorsArgs>;

export const zAnimeDetailsQueryVariables = z.object({
	ids0: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids1: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids2: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids3: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	with1: z.boolean(),
	with2: z.boolean(),
	with3: z.boolean(),
});
export type AnimeDetailsQueryVariables = z.input<typeof zAnimeDetailsQueryVariables>;

export const zAnimeCardsQueryVariables = z.object({
	ids: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	perPage: z.int32(),
});
export type AnimeCardsQueryVariables = z.input<typeof zAnimeCardsQueryVariables>;

export const zBrowseAnimeQueryVariables = z.object({
	page: z.int32(),
	perPage: z.int32(),
	search: z.string().nullish(),
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort>>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort)),
	season: zMediaSeason.nullish(),
	seasonYear: z.int32().nullish(),
	format: z.union([z.array(z.custom<z.input<typeof zMediaFormat>>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat)).nullish(),
	excludedFormats: z.union([z.array(z.custom<z.input<typeof zMediaFormat>>()), z.custom<z.input<typeof zMediaFormat>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaFormat)),
	status: zMediaStatus.nullish(),
	genres: z.union([z.array(z.custom<string>()), z.custom<string>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.string())).nullish(),
});
export type BrowseAnimeQueryVariables = z.input<typeof zBrowseAnimeQueryVariables>;

export const zGenresQueryVariables = z.object({

});
export type GenresQueryVariables = z.input<typeof zGenresQueryVariables>;

export const zTagsQueryVariables = z.object({

});
export type TagsQueryVariables = z.input<typeof zTagsQueryVariables>;

export const zFranchiseEntriesQueryVariables = z.object({
	ids0: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids1: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids2: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids3: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	ids4: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	with1: z.boolean(),
	with2: z.boolean(),
	with3: z.boolean(),
	with4: z.boolean(),
});
export type FranchiseEntriesQueryVariables = z.input<typeof zFranchiseEntriesQueryVariables>;

export const zNewEntriesQueryVariables = z.object({
	page: z.int32(),
	perPage: z.int32(),
});
export type NewEntriesQueryVariables = z.input<typeof zNewEntriesQueryVariables>;

export const zUserAnimeListQueryVariables = z.object({
	userName: z.string(),
});
export type UserAnimeListQueryVariables = z.input<typeof zUserAnimeListQueryVariables>;

export const zViewerNameQueryVariables = z.object({

});
export type ViewerNameQueryVariables = z.input<typeof zViewerNameQueryVariables>;

export const zEpisodeAiringsQueryVariables = z.object({
	ids: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	page: z.int32(),
});
export type EpisodeAiringsQueryVariables = z.input<typeof zEpisodeAiringsQueryVariables>;

export const zLatestAiringQueryVariables = z.object({
	id: z.int32(),
});
export type LatestAiringQueryVariables = z.input<typeof zLatestAiringQueryVariables>;

export const zSearchIndexPageQueryVariables = z.object({
	page: z.int32(),
	sort: z.union([z.array(z.custom<z.input<typeof zMediaSort>>()), z.custom<z.input<typeof zMediaSort>>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(zMediaSort)),
	popularityBelow: z.int32().nullish(),
});
export type SearchIndexPageQueryVariables = z.input<typeof zSearchIndexPageQueryVariables>;

export const zMediaTrendsQueryVariables = z.object({
	ids: z.union([z.array(z.custom<number>()), z.custom<number>((value) => value != null && !Array.isArray(value)).transform((value): unknown[] => [value])]).pipe(z.array(z.int32())),
	after: z.int32(),
	page: z.int32(),
});
export type MediaTrendsQueryVariables = z.input<typeof zMediaTrendsQueryVariables>;

export const zAnimeCardFragment = z.object({
	id: z.int32(),
	idMal: z.int32().nullable(),
	title: z.object({
		romaji: z.string().nullable(),
		english: z.string().nullable(),
		native: z.string().nullable(),
	}).nullable(),
	coverImage: z.object({
		extraLarge: z.string().nullable(),
		large: z.string().nullable(),
		color: z.string().nullable(),
	}).nullable(),
	bannerImage: z.string().nullable(),
	format: zMediaFormat.nullable(),
	status: zMediaStatus.nullable(),
	season: zMediaSeason.nullable(),
	seasonYear: z.int32().nullable(),
	episodes: z.int32().nullable(),
	duration: z.int32().nullable(),
	averageScore: z.int32().nullable(),
	popularity: z.int32().nullable(),
	genres: z.array(z.string().nullable()).nullable(),
	isAdult: z.boolean().nullable(),
	nextAiringEpisode: z.object({
		airingAt: z.int32(),
		episode: z.int32(),
	}).nullable(),
});
export type AnimeCardFragment = z.output<typeof zAnimeCardFragment>;

export const zAnimeDetailsFragment = z.object({
	id: z.int32(),
	idMal: z.int32().nullable(),
	title: z.object({
		romaji: z.string().nullable(),
		english: z.string().nullable(),
		native: z.string().nullable(),
	}).nullable(),
	coverImage: z.object({
		extraLarge: z.string().nullable(),
		large: z.string().nullable(),
		color: z.string().nullable(),
	}).nullable(),
	bannerImage: z.string().nullable(),
	format: zMediaFormat.nullable(),
	status: zMediaStatus.nullable(),
	season: zMediaSeason.nullable(),
	seasonYear: z.int32().nullable(),
	episodes: z.int32().nullable(),
	duration: z.int32().nullable(),
	averageScore: z.int32().nullable(),
	popularity: z.int32().nullable(),
	genres: z.array(z.string().nullable()).nullable(),
	isAdult: z.boolean().nullable(),
	nextAiringEpisode: z.object({
		airingAt: z.int32(),
		episode: z.int32(),
	}).nullable(),
	synonyms: z.array(z.string().nullable()).nullable(),
	description: z.string().nullable(),
	source: zMediaSource.nullable(),
	countryOfOrigin: scalarSchemas.CountryCode.nullable(),
	startDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	endDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	tags: z.array(z.object({
		name: z.string(),
		rank: z.int32().nullable(),
		isMediaSpoiler: z.boolean().nullable(),
	}).nullable()).nullable(),
	studios: z.object({
		edges: z.array(z.object({
			isMain: z.boolean(),
			node: z.object({
				name: z.string(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
	staff: z.object({
		edges: z.array(z.object({
			role: z.string().nullable(),
			node: z.object({
				name: z.object({
					full: z.string().nullable(),
				}).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
	relations: z.object({
		edges: z.array(z.object({
			relationType: zMediaRelation.nullable(),
			node: z.object({
				type: zMediaType.nullable(),
				id: z.int32(),
				idMal: z.int32().nullable(),
				title: z.object({
					romaji: z.string().nullable(),
					english: z.string().nullable(),
					native: z.string().nullable(),
				}).nullable(),
				coverImage: z.object({
					extraLarge: z.string().nullable(),
					large: z.string().nullable(),
					color: z.string().nullable(),
				}).nullable(),
				bannerImage: z.string().nullable(),
				format: zMediaFormat.nullable(),
				status: zMediaStatus.nullable(),
				season: zMediaSeason.nullable(),
				seasonYear: z.int32().nullable(),
				episodes: z.int32().nullable(),
				duration: z.int32().nullable(),
				averageScore: z.int32().nullable(),
				popularity: z.int32().nullable(),
				genres: z.array(z.string().nullable()).nullable(),
				isAdult: z.boolean().nullable(),
				nextAiringEpisode: z.object({
					airingAt: z.int32(),
					episode: z.int32(),
				}).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
	recommendations: z.object({
		nodes: z.array(z.object({
			mediaRecommendation: z.object({
				type: zMediaType.nullable(),
				id: z.int32(),
				idMal: z.int32().nullable(),
				title: z.object({
					romaji: z.string().nullable(),
					english: z.string().nullable(),
					native: z.string().nullable(),
				}).nullable(),
				coverImage: z.object({
					extraLarge: z.string().nullable(),
					large: z.string().nullable(),
					color: z.string().nullable(),
				}).nullable(),
				bannerImage: z.string().nullable(),
				format: zMediaFormat.nullable(),
				status: zMediaStatus.nullable(),
				season: zMediaSeason.nullable(),
				seasonYear: z.int32().nullable(),
				episodes: z.int32().nullable(),
				duration: z.int32().nullable(),
				averageScore: z.int32().nullable(),
				popularity: z.int32().nullable(),
				genres: z.array(z.string().nullable()).nullable(),
				isAdult: z.boolean().nullable(),
				nextAiringEpisode: z.object({
					airingAt: z.int32(),
					episode: z.int32(),
				}).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type AnimeDetailsFragment = z.output<typeof zAnimeDetailsFragment>;

export const zFranchiseEntryFragment = z.object({
	id: z.int32(),
	idMal: z.int32().nullable(),
	title: z.object({
		romaji: z.string().nullable(),
		english: z.string().nullable(),
		native: z.string().nullable(),
	}).nullable(),
	coverImage: z.object({
		extraLarge: z.string().nullable(),
		large: z.string().nullable(),
		color: z.string().nullable(),
	}).nullable(),
	bannerImage: z.string().nullable(),
	format: zMediaFormat.nullable(),
	status: zMediaStatus.nullable(),
	season: zMediaSeason.nullable(),
	seasonYear: z.int32().nullable(),
	episodes: z.int32().nullable(),
	duration: z.int32().nullable(),
	averageScore: z.int32().nullable(),
	popularity: z.int32().nullable(),
	genres: z.array(z.string().nullable()).nullable(),
	isAdult: z.boolean().nullable(),
	nextAiringEpisode: z.object({
		airingAt: z.int32(),
		episode: z.int32(),
	}).nullable(),
	synonyms: z.array(z.string().nullable()).nullable(),
	startDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	endDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	relations: z.object({
		edges: z.array(z.object({
			relationType: zMediaRelation.nullable(),
			node: z.object({
				id: z.int32(),
				type: zMediaType.nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type FranchiseEntryFragment = z.output<typeof zFranchiseEntryFragment>;

const zFranchiseEntryWithNeighboursFragment$1$ = z.object({
	relationType: zMediaRelation.nullable(),
	node: z.object({
		id: z.int32(),
		type: zMediaType.nullable(),
	}).nullable(),
});
const zFranchiseEntryWithNeighboursFragment$1: z.ZodType<z.output<typeof zFranchiseEntryWithNeighboursFragment$1$>, z.input<typeof zFranchiseEntryWithNeighboursFragment$1$>> = zFranchiseEntryWithNeighboursFragment$1$;
export const zFranchiseEntryWithNeighboursFragment = z.object({
	id: z.int32(),
	idMal: z.int32().nullable(),
	title: z.object({
		romaji: z.string().nullable(),
		english: z.string().nullable(),
		native: z.string().nullable(),
	}).nullable(),
	coverImage: z.object({
		extraLarge: z.string().nullable(),
		large: z.string().nullable(),
		color: z.string().nullable(),
	}).nullable(),
	bannerImage: z.string().nullable(),
	format: zMediaFormat.nullable(),
	status: zMediaStatus.nullable(),
	season: zMediaSeason.nullable(),
	seasonYear: z.int32().nullable(),
	episodes: z.int32().nullable(),
	duration: z.int32().nullable(),
	averageScore: z.int32().nullable(),
	popularity: z.int32().nullable(),
	genres: z.array(z.string().nullable()).nullable(),
	isAdult: z.boolean().nullable(),
	nextAiringEpisode: z.object({
		airingAt: z.int32(),
		episode: z.int32(),
	}).nullable(),
	synonyms: z.array(z.string().nullable()).nullable(),
	startDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	endDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	relations: z.object({
		edges: z.array(z.object({
			relationType: zMediaRelation.nullable(),
			node: z.object({
				id: z.int32(),
				type: zMediaType.nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
	neighbours: z.object({
		edges: z.array(z.object({
			node: z.object({
				type: zMediaType.nullable(),
				id: z.int32(),
				idMal: z.int32().nullable(),
				title: z.object({
					romaji: z.string().nullable(),
					english: z.string().nullable(),
					native: z.string().nullable(),
				}).nullable(),
				coverImage: z.object({
					extraLarge: z.string().nullable(),
					large: z.string().nullable(),
					color: z.string().nullable(),
				}).nullable(),
				bannerImage: z.string().nullable(),
				format: zMediaFormat.nullable(),
				status: zMediaStatus.nullable(),
				season: zMediaSeason.nullable(),
				seasonYear: z.int32().nullable(),
				episodes: z.int32().nullable(),
				duration: z.int32().nullable(),
				averageScore: z.int32().nullable(),
				popularity: z.int32().nullable(),
				genres: z.array(z.string().nullable()).nullable(),
				isAdult: z.boolean().nullable(),
				nextAiringEpisode: z.object({
					airingAt: z.int32(),
					episode: z.int32(),
				}).nullable(),
				synonyms: z.array(z.string().nullable()).nullable(),
				startDate: z.object({
					year: z.int32().nullable(),
					month: z.int32().nullable(),
					day: z.int32().nullable(),
				}).nullable(),
				endDate: z.object({
					year: z.int32().nullable(),
					month: z.int32().nullable(),
					day: z.int32().nullable(),
				}).nullable(),
				relations: z.object({
					edges: z.array(zFranchiseEntryWithNeighboursFragment$1.nullable()).nullable(),
				}).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type FranchiseEntryWithNeighboursFragment = z.output<typeof zFranchiseEntryWithNeighboursFragment>;

const zAnimeDetailsQuery$1$ = z.object({
	name: z.string(),
});
const zAnimeDetailsQuery$1: z.ZodType<z.output<typeof zAnimeDetailsQuery$1$>, z.input<typeof zAnimeDetailsQuery$1$>> = zAnimeDetailsQuery$1$;
const zAnimeDetailsQuery$2$ = z.object({
	name: z.object({
		full: z.string().nullable(),
	}).nullable(),
});
const zAnimeDetailsQuery$2: z.ZodType<z.output<typeof zAnimeDetailsQuery$2$>, z.input<typeof zAnimeDetailsQuery$2$>> = zAnimeDetailsQuery$2$;
const zAnimeDetailsQuery$3$ = z.object({
	type: zMediaType.nullable(),
	id: z.int32(),
	idMal: z.int32().nullable(),
	title: z.object({
		romaji: z.string().nullable(),
		english: z.string().nullable(),
		native: z.string().nullable(),
	}).nullable(),
	coverImage: z.object({
		extraLarge: z.string().nullable(),
		large: z.string().nullable(),
		color: z.string().nullable(),
	}).nullable(),
	bannerImage: z.string().nullable(),
	format: zMediaFormat.nullable(),
	status: zMediaStatus.nullable(),
	season: zMediaSeason.nullable(),
	seasonYear: z.int32().nullable(),
	episodes: z.int32().nullable(),
	duration: z.int32().nullable(),
	averageScore: z.int32().nullable(),
	popularity: z.int32().nullable(),
	genres: z.array(z.string().nullable()).nullable(),
	isAdult: z.boolean().nullable(),
	nextAiringEpisode: z.object({
		airingAt: z.int32(),
		episode: z.int32(),
	}).nullable(),
});
const zAnimeDetailsQuery$3: z.ZodType<z.output<typeof zAnimeDetailsQuery$3$>, z.input<typeof zAnimeDetailsQuery$3$>> = zAnimeDetailsQuery$3$;
export const zAnimeDetailsQuery = z.object({
	page0: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			description: z.string().nullable(),
			source: zMediaSource.nullable(),
			countryOfOrigin: scalarSchemas.CountryCode.nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			tags: z.array(z.object({
				name: z.string(),
				rank: z.int32().nullable(),
				isMediaSpoiler: z.boolean().nullable(),
			}).nullable()).nullable(),
			studios: z.object({
				edges: z.array(z.object({
					isMain: z.boolean(),
					node: zAnimeDetailsQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			staff: z.object({
				edges: z.array(z.object({
					role: z.string().nullable(),
					node: zAnimeDetailsQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			recommendations: z.object({
				nodes: z.array(z.object({
					mediaRecommendation: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
	page1: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			description: z.string().nullable(),
			source: zMediaSource.nullable(),
			countryOfOrigin: scalarSchemas.CountryCode.nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			tags: z.array(z.object({
				name: z.string(),
				rank: z.int32().nullable(),
				isMediaSpoiler: z.boolean().nullable(),
			}).nullable()).nullable(),
			studios: z.object({
				edges: z.array(z.object({
					isMain: z.boolean(),
					node: zAnimeDetailsQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			staff: z.object({
				edges: z.array(z.object({
					role: z.string().nullable(),
					node: zAnimeDetailsQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			recommendations: z.object({
				nodes: z.array(z.object({
					mediaRecommendation: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
	page2: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			description: z.string().nullable(),
			source: zMediaSource.nullable(),
			countryOfOrigin: scalarSchemas.CountryCode.nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			tags: z.array(z.object({
				name: z.string(),
				rank: z.int32().nullable(),
				isMediaSpoiler: z.boolean().nullable(),
			}).nullable()).nullable(),
			studios: z.object({
				edges: z.array(z.object({
					isMain: z.boolean(),
					node: zAnimeDetailsQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			staff: z.object({
				edges: z.array(z.object({
					role: z.string().nullable(),
					node: zAnimeDetailsQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			recommendations: z.object({
				nodes: z.array(z.object({
					mediaRecommendation: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
	page3: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			description: z.string().nullable(),
			source: zMediaSource.nullable(),
			countryOfOrigin: scalarSchemas.CountryCode.nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			tags: z.array(z.object({
				name: z.string(),
				rank: z.int32().nullable(),
				isMediaSpoiler: z.boolean().nullable(),
			}).nullable()).nullable(),
			studios: z.object({
				edges: z.array(z.object({
					isMain: z.boolean(),
					node: zAnimeDetailsQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			staff: z.object({
				edges: z.array(z.object({
					role: z.string().nullable(),
					node: zAnimeDetailsQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			recommendations: z.object({
				nodes: z.array(z.object({
					mediaRecommendation: zAnimeDetailsQuery$3.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
});
export type AnimeDetailsQuery = z.output<typeof zAnimeDetailsQuery>;

export const zAnimeCardsQuery = z.object({
	Page: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type AnimeCardsQuery = z.output<typeof zAnimeCardsQuery>;

export const zBrowseAnimeQuery = z.object({
	Page: z.object({
		pageInfo: z.object({
			currentPage: z.int32().nullable(),
			hasNextPage: z.boolean().nullable(),
		}).nullable(),
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type BrowseAnimeQuery = z.output<typeof zBrowseAnimeQuery>;

export const zGenresQuery = z.object({
	GenreCollection: z.array(z.string().nullable()).nullable(),
});
export type GenresQuery = z.output<typeof zGenresQuery>;

export const zTagsQuery = z.object({
	MediaTagCollection: z.array(z.object({
		name: z.string(),
		description: z.string().nullable(),
		category: z.string().nullable(),
		isAdult: z.boolean().nullable(),
	}).nullable()).nullable(),
});
export type TagsQuery = z.output<typeof zTagsQuery>;

const zFranchiseEntriesQuery$1$ = z.object({
	id: z.int32(),
	type: zMediaType.nullable(),
});
const zFranchiseEntriesQuery$1: z.ZodType<z.output<typeof zFranchiseEntriesQuery$1$>, z.input<typeof zFranchiseEntriesQuery$1$>> = zFranchiseEntriesQuery$1$;
const zFranchiseEntriesQuery$2$ = z.object({
	type: zMediaType.nullable(),
	id: z.int32(),
	idMal: z.int32().nullable(),
	title: z.object({
		romaji: z.string().nullable(),
		english: z.string().nullable(),
		native: z.string().nullable(),
	}).nullable(),
	coverImage: z.object({
		extraLarge: z.string().nullable(),
		large: z.string().nullable(),
		color: z.string().nullable(),
	}).nullable(),
	bannerImage: z.string().nullable(),
	format: zMediaFormat.nullable(),
	status: zMediaStatus.nullable(),
	season: zMediaSeason.nullable(),
	seasonYear: z.int32().nullable(),
	episodes: z.int32().nullable(),
	duration: z.int32().nullable(),
	averageScore: z.int32().nullable(),
	popularity: z.int32().nullable(),
	genres: z.array(z.string().nullable()).nullable(),
	isAdult: z.boolean().nullable(),
	nextAiringEpisode: z.object({
		airingAt: z.int32(),
		episode: z.int32(),
	}).nullable(),
	synonyms: z.array(z.string().nullable()).nullable(),
	startDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	endDate: z.object({
		year: z.int32().nullable(),
		month: z.int32().nullable(),
		day: z.int32().nullable(),
	}).nullable(),
	relations: z.object({
		edges: z.array(z.object({
			relationType: zMediaRelation.nullable(),
			node: z.object({
				id: z.int32(),
				type: zMediaType.nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
const zFranchiseEntriesQuery$2: z.ZodType<z.output<typeof zFranchiseEntriesQuery$2$>, z.input<typeof zFranchiseEntriesQuery$2$>> = zFranchiseEntriesQuery$2$;
export const zFranchiseEntriesQuery = z.object({
	page0: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zFranchiseEntriesQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			neighbours: z.object({
				edges: z.array(z.object({
					node: zFranchiseEntriesQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
	page1: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zFranchiseEntriesQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			neighbours: z.object({
				edges: z.array(z.object({
					node: zFranchiseEntriesQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
	page2: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zFranchiseEntriesQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			neighbours: z.object({
				edges: z.array(z.object({
					node: zFranchiseEntriesQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
	page3: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zFranchiseEntriesQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			neighbours: z.object({
				edges: z.array(z.object({
					node: zFranchiseEntriesQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
	page4: z.object({
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zFranchiseEntriesQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			neighbours: z.object({
				edges: z.array(z.object({
					node: zFranchiseEntriesQuery$2.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable().optional(),
});
export type FranchiseEntriesQuery = z.output<typeof zFranchiseEntriesQuery>;

const zNewEntriesQuery$1$ = z.object({
	id: z.int32(),
	type: zMediaType.nullable(),
});
const zNewEntriesQuery$1: z.ZodType<z.output<typeof zNewEntriesQuery$1$>, z.input<typeof zNewEntriesQuery$1$>> = zNewEntriesQuery$1$;
export const zNewEntriesQuery = z.object({
	Page: z.object({
		pageInfo: z.object({
			hasNextPage: z.boolean().nullable(),
		}).nullable(),
		media: z.array(z.object({
			id: z.int32(),
			idMal: z.int32().nullable(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			coverImage: z.object({
				extraLarge: z.string().nullable(),
				large: z.string().nullable(),
				color: z.string().nullable(),
			}).nullable(),
			bannerImage: z.string().nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			popularity: z.int32().nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			isAdult: z.boolean().nullable(),
			nextAiringEpisode: z.object({
				airingAt: z.int32(),
				episode: z.int32(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			endDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zNewEntriesQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type NewEntriesQuery = z.output<typeof zNewEntriesQuery>;

export const zUserAnimeListQuery = z.object({
	MediaListCollection: z.object({
		lists: z.array(z.object({
			entries: z.array(z.object({
				status: zMediaListStatus.nullable(),
				progress: z.int32().nullable(),
				createdAt: z.int32().nullable(),
				updatedAt: z.int32().nullable(),
				startedAt: z.object({
					year: z.int32().nullable(),
					month: z.int32().nullable(),
					day: z.int32().nullable(),
				}).nullable(),
				completedAt: z.object({
					year: z.int32().nullable(),
					month: z.int32().nullable(),
					day: z.int32().nullable(),
				}).nullable(),
				media: z.object({
					id: z.int32(),
				}).nullable(),
			}).nullable()).nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type UserAnimeListQuery = z.output<typeof zUserAnimeListQuery>;

export const zViewerNameQuery = z.object({
	Viewer: z.object({
		name: z.string(),
	}).nullable(),
});
export type ViewerNameQuery = z.output<typeof zViewerNameQuery>;

export const zEpisodeAiringsQuery = z.object({
	Page: z.object({
		pageInfo: z.object({
			hasNextPage: z.boolean().nullable(),
		}).nullable(),
		airingSchedules: z.array(z.object({
			mediaId: z.int32(),
			episode: z.int32(),
			airingAt: z.int32(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type EpisodeAiringsQuery = z.output<typeof zEpisodeAiringsQuery>;

export const zLatestAiringQuery = z.object({
	Page: z.object({
		airingSchedules: z.array(z.object({
			episode: z.int32(),
			airingAt: z.int32(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type LatestAiringQuery = z.output<typeof zLatestAiringQuery>;

const zSearchIndexPageQuery$1$ = z.object({
	countryOfOrigin: scalarSchemas.CountryCode.nullable(),
	source: zMediaSource.nullable(),
});
const zSearchIndexPageQuery$1: z.ZodType<z.output<typeof zSearchIndexPageQuery$1$>, z.input<typeof zSearchIndexPageQuery$1$>> = zSearchIndexPageQuery$1$;
export const zSearchIndexPageQuery = z.object({
	Page: z.object({
		pageInfo: z.object({
			hasNextPage: z.boolean().nullable(),
		}).nullable(),
		media: z.array(z.object({
			id: z.int32(),
			title: z.object({
				romaji: z.string().nullable(),
				english: z.string().nullable(),
				native: z.string().nullable(),
			}).nullable(),
			synonyms: z.array(z.string().nullable()).nullable(),
			format: zMediaFormat.nullable(),
			status: zMediaStatus.nullable(),
			season: zMediaSeason.nullable(),
			seasonYear: z.int32().nullable(),
			startDate: z.object({
				year: z.int32().nullable(),
				month: z.int32().nullable(),
				day: z.int32().nullable(),
			}).nullable(),
			genres: z.array(z.string().nullable()).nullable(),
			tags: z.array(z.object({
				name: z.string(),
				rank: z.int32().nullable(),
				isMediaSpoiler: z.boolean().nullable(),
				isAdult: z.boolean().nullable(),
			}).nullable()).nullable(),
			studios: z.object({
				nodes: z.array(z.object({
					name: z.string(),
				}).nullable()).nullable(),
			}).nullable(),
			source: zMediaSource.nullable(),
			countryOfOrigin: scalarSchemas.CountryCode.nullable(),
			relations: z.object({
				edges: z.array(z.object({
					relationType: zMediaRelation.nullable(),
					node: zSearchIndexPageQuery$1.nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			episodes: z.int32().nullable(),
			duration: z.int32().nullable(),
			popularity: z.int32().nullable(),
			trending: z.int32().nullable(),
			averageScore: z.int32().nullable(),
			stats: z.object({
				scoreDistribution: z.array(z.object({
					amount: z.int32().nullable(),
				}).nullable()).nullable(),
			}).nullable(),
			isAdult: z.boolean().nullable(),
			updatedAt: z.int32().nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type SearchIndexPageQuery = z.output<typeof zSearchIndexPageQuery>;

export const zMediaTrendsQuery = z.object({
	Page: z.object({
		pageInfo: z.object({
			hasNextPage: z.boolean().nullable(),
		}).nullable(),
		mediaTrends: z.array(z.object({
			mediaId: z.int32(),
			date: z.int32(),
			trending: z.int32(),
			popularity: z.int32().nullable(),
		}).nullable()).nullable(),
	}).nullable(),
});
export type MediaTrendsQuery = z.output<typeof zMediaTrendsQuery>;
