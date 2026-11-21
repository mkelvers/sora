export const testDatabaseNamePattern = /^sora_test_[0-9a-f]{32}$/u;

// Only the preload enables these suites, after verifying and migrating the database.
let enabled = false;

export const databaseTestsEnabled = () => enabled;

export const enableDatabaseTests = () => {
	enabled = true;
};
