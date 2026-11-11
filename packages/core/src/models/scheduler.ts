import { z } from "zod";

export const FailingJobsSchema = z
	.object({
		given_up: z.number().int().meta({
			description:
				"Jobs that failed every attempt and will not run again. `prune-dead-jobs` deletes them daily.",
			example: 1,
		}),
		retrying: z.number().int().meta({
			description: "Jobs whose last attempt failed and that will be tried again.",
			example: 22,
		}),
		task: z.string().meta({
			description: "The scheduler task the jobs run.",
			example: "look-up-episodes",
		}),
	})
	.meta({
		id: "FailingJobs",
	});

export type FailingJobs = z.infer<typeof FailingJobsSchema>;
